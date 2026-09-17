// hook: the lifecycle hooks the workflow plugin's hooks.json runs. docs/CONTRACTS.md section 11.
//
// Client behavior this relies on, read from the Claude Code hooks reference (not yet observed in a live session from
// this repository): the hook JSON arrives on stdin; SessionStart adds plain stdout to the conversation; a Stop hook
// that prints {"decision":"block","reason":"..."} keeps Claude working and shows it the reason, and the client sends
// stop_hook_active when it is already continuing because of a Stop hook; stderr from a hook that exits 0 goes only to
// the debug log; exit 2 from Stop or PreCompact blocks, so this command never exits 2.

import { ConfigError, resolveProject } from "../lib/config.mjs";
import { GitError, appendEvent, gitTopLevel, readGitState, readJournal } from "../lib/journal.mjs";
import { clip, evaluateStop, gatherProjectState, parseHookInput, sessionStartBlock, stopReason } from "../lib/lifecycle.mjs";
import { currentTask } from "../lib/tasks.mjs";
import { statSync } from "node:fs";

export const help = `hook: run a Skilliton lifecycle hook. The workflow plugin's hooks.json calls these. Each reads the client's hook JSON
on stdin (cwd, session_id, stop_hook_active, source, trigger, reason; every field optional).

  hook session-start   print a bounded "Project state" block (at most handoff.maxBytes bytes) and record a
                       session-start event in the journal
  hook stop            when a checkpoint is due (checkpoints.stopReminder, checkpoints.minMinutes), block stopping
                       once for this working tree state with the exact command to run; otherwise allow silently
  hook pre-compact     record a pre-compact event
  hook session-end     record a session-end event

The project is the Git top level of the JSON cwd (else the current folder). Outside a Git repository each hook
prints one line saying Skilliton project state is unavailable. A hook never blocks because of its own failure: it
prints a one-line notice on stderr (session-start also prints it on stdout, the only stream the client adds to the
conversation) and exits 0.

Exit code: always 0.`;

const EVENTS = ["session-start", "stop", "pre-compact", "session-end"];

// Reads stdin to its end, for at most timeoutMs: a client that never closes stdin must not hold the hook until the
// client's own timeout. Input beyond maxBytes is dropped, which leaves text that is not JSON and is reported as such.
function readStdin({ timeoutMs = 3000, maxBytes = 1024 * 1024 } = {}) {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolveInput) => {
    const chunks = [];
    let size = 0, settled = false;
    const onData = (chunk) => { size += chunk.length; if (size <= maxBytes) chunks.push(chunk); };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", finish);
      process.stdin.removeListener("error", finish);
      process.stdin.pause();
      process.stdin.destroy();
      resolveInput(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.on("data", onData);
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
  });
}

const unavailable = (why) => { process.stdout.write(`[workflow] Skilliton project state is unavailable: ${why}.\n`); };

// The Git top level for the hook, or null after printing the one "unavailable" line.
function locate(input) {
  const dir = input.cwd ?? process.cwd();
  let exists = false;
  try { exists = statSync(dir).isDirectory(); } catch { exists = false; }
  if (!exists) { unavailable(`the folder ${dir} does not exist`); return null; }
  let root;
  try { root = gitTopLevel(dir); } catch (e) {
    if (e instanceof GitError && e.kind === "missing") { unavailable("git was not found on PATH"); return null; }
    throw e;
  }
  if (!root) { unavailable(`${dir} is not inside a Git repository`); return null; }
  return root;
}

async function sessionStart(input) {
  const root = locate(input);
  if (!root) return 0;
  const now = new Date();
  const state = readGitState(root, { shortHead: true });
  const report = await gatherProjectState(root, { state, currentSession: input.session, now });
  const notes = [];
  if (input.problem) notes.push(`Hook input (not usable): ${input.problem}, so the current folder was used`);
  try {
    appendEvent(root, { event: "session-start", session: input.session, source: input.source ?? undefined, at: now.toISOString() }, { state });
  } catch (e) {
    notes.push(`Journal (failed): this session start was not recorded (${e.message}), so the next session cannot tell whether this one was interrupted`);
    console.error(`[workflow] Skilliton session-start hook: ${clip(e.message, 300)}`);
  }
  process.stdout.write(sessionStartBlock(report, { maxBytes: report.handoffMaxBytes, notes }).text);
  return 0;
}

async function stop(input) {
  const root = locate(input);
  if (!root) return 0;
  if (input.stopHookActive) return 0;
  let project;
  // A project not yet migrated from the earlier names still gets the checkpoint reminder; its records are unchanged.
  try { project = resolveProject(root, { allowLegacy: true }); } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(`[workflow] Skilliton checkpoint reminder was not evaluated: ${clip(e.message, 300)}`);
    return 0;
  }
  if (!project.checkpoints.stopReminder) return 0;
  const state = readGitState(root);
  const journal = readJournal(root);
  const now = new Date();
  const decision = evaluateStop({ stopHookActive: input.stopHookActive, checkpoints: project.checkpoints, state, events: journal.events, session: input.session, now });
  if (!decision.block) return 0;
  let current;
  try { current = currentTask(project, state.branch); } catch (e) {
    current = { task: null, ambiguous: [], unreadable: [{ file: project.directories.tasks, reason: clip(e.message, 200) }] };
  }
  const reason = stopReason({ decision, state, current });
  // Recorded before the block is printed: a reminder that cannot be recorded would repeat on every stop, so a failure
  // here ends in the failure notice, and the session is allowed to stop.
  appendEvent(root, { event: "stop-reminded", session: input.session, at: now.toISOString() }, { state });
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  return 0;
}

function recorder(event) {
  return async (input) => {
    const root = locate(input);
    if (!root) return 0;
    // SessionEnd hooks share a small time budget in Claude Code (1.5 seconds by default, not raised by a plugin
    // hook's own timeout), so a slow `git status` is abandoned and the event is recorded without a fingerprint.
    const state = readGitState(root, event === "session-end" ? { statusTimeoutMs: 1000, tolerateStatusTimeout: true } : {});
    const extra = event === "pre-compact" ? { trigger: input.trigger ?? undefined } : { reason: input.reason ?? undefined };
    appendEvent(root, { event, session: input.session, ...extra }, { state });
    return 0;
  };
}

const HANDLERS = { "session-start": sessionStart, stop, "pre-compact": recorder("pre-compact"), "session-end": recorder("session-end") };

export async function run(argv) {
  const event = argv[0];
  try {
    if (argv.length !== 1 || !EVENTS.includes(event)) {
      console.error(`[workflow] skilliton hook expects exactly one of ${EVENTS.join(", ")} (got ${argv.length ? JSON.stringify(argv.join(" ")) : "nothing"}); nothing was done and nothing was blocked.`);
      return 0;
    }
    const input = parseHookInput(await readStdin());
    return await HANDLERS[event](input);
  } catch (e) {
    const line = `[workflow] Skilliton ${EVENTS.includes(event) ? event : "lifecycle"} hook failed (${clip(e?.message ?? e, 300)}); nothing was blocked and the session continues.`;
    console.error(line);
    if (event === "session-start") process.stdout.write(`${line}\n`);
    return 0;
  }
}
