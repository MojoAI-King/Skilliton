// hook: the lifecycle hooks the workflow plugin's hooks.json runs. docs/CONTRACTS.md section 11.
//
// Client behavior this relies on, read from the Claude Code hooks reference and observed in live headless sessions
// from this repository (scripts/rehearsals/live-clients.mjs L1, L2, L4, L5; PreCompact with trigger auto and the
// SessionStart with source compact in L6, on Claude Code 2.1.276, 2026-09-18): the hook JSON arrives on stdin; SessionStart adds plain stdout to the conversation; a Stop hook
// that prints {"decision":"block","reason":"..."} keeps Claude working and shows it the reason, and the client sends
// stop_hook_active when it is already continuing because of a Stop hook; stderr from a hook that exits 0 goes only to
// the debug log; exit 2 from Stop or PreCompact blocks, so this command never exits 2.

import { CONFIG_REL, ConfigError, resolveProject } from "../lib/config.mjs";
import { GitError, appendEvent, gitDir, gitTopLevel, mergesSince, readGitState, readJournal } from "../lib/journal.mjs";
import { clip, gatherProjectState } from "../lib/lifecycle.mjs";
import { countPromptItems, dispatchHoldReason, dispatchSuggestion, evaluateDispatchHold, evaluateStop, parseHookInput, sessionStartBlock, stopReason } from "../lib/session-hooks.mjs";
import { currentTask } from "../lib/tasks.mjs";
import { selfCommand } from "../lib/core.mjs";
import { autoPrepare, optOutFile } from "../lib/auto-prepare.mjs";
import { evaluateMaintain, maintainReason } from "../lib/maintain.mjs";
import { LANE_FILE } from "../lib/dispatch.mjs";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const help = `hook: run a Skilliton lifecycle hook. The workflow plugin's hooks.json calls these. Each reads the client's hook JSON
on stdin (cwd, session_id, stop_hook_active, source, trigger, reason, prompt or user_prompt; every field optional).

  hook session-start   print a bounded "Project state" block (at most handoff.maxBytes bytes) and record a
                       session-start event in the journal
  hook stop            when a checkpoint is due (checkpoints.stopReminder, checkpoints.minMinutes), block stopping
                       once for this working tree state with the exact command to run; also once per commit when
                       maintenance is due on an integration branch, and once per dispatch note when this session's
                       prompt named dispatch and no lane plan was written; otherwise allow silently
  hook pre-compact     record a pre-compact event
  hook session-end     record a session-end event
  hook user-prompt-submit
                       when a prompt reads as dispatch.minItemsForLanes or more separate items, add one note
                       directing /workflow:dispatch before any code; otherwise print nothing

The project is the Git top level of the JSON cwd (else the current folder). An empty .skilliton-off at its root, or a
skilliton-off inside its Git folder, keeps every one of these hooks out: session-start prints one line saying so, the
others print nothing, and none records an event. Outside a Git repository each hook
prints one line saying Skilliton project state is unavailable, except user-prompt-submit, which runs on every prompt
and so says nothing at all. A hook never blocks because of its own failure: it
prints a one-line notice on stderr (session-start also prints it on stdout, the only stream the client adds to the
conversation) and exits 0.

Exit code: always 0.`;

const EVENTS = ["session-start", "stop", "pre-compact", "session-end", "user-prompt-submit"];

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

// The repository's opt-out (lib/auto-prepare.mjs optOutFile), or null. With one, every hook here leaves the repository
// alone: session start says so in one line, and the others print nothing and record nothing. The Git folder cannot be
// read only when git itself fails, and then the hook carries on as without the file, said on stderr.
function optedOut(root) {
  try { return optOutFile(root, gitDir(root)); } catch (e) {
    console.error(`[workflow] Skilliton could not look for skilliton-off in the Git folder (${clip(e?.message ?? e, 200)}); the hooks run as without it`);
    return null;
  }
}

const leftAlone = (optOut) => `[workflow] Skilliton's workflow hooks leave this repository alone because ${optOut.where} (delete it to have them run again); the guardrails and the read guard, where installed, still run.\n`;

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

// locate() for a hook that runs on every prompt: nothing reaches stdout, because stdout here is added to the
// conversation, and a folder that is not a project would say so on every prompt for the whole session.
function locateQuietly(input) {
  try {
    const dir = input.cwd ?? process.cwd();
    if (!statSync(dir).isDirectory()) return null;
    return gitTopLevel(dir);
  } catch (e) {
    console.error(`[workflow] Skilliton dispatch suggestion was not evaluated: ${clip(e?.message ?? e, 300)}`);
    return null;
  }
}

// Advice, never a block: this hook prints at most one note and never exits 2, so a wrong count costs a sentence.
async function userPromptSubmit(input) {
  const counts = countPromptItems(input.prompt);
  if (counts.items < 1) return 0; // the common prompt, answered before any Git or configuration work
  const root = locateQuietly(input);
  if (!root || optedOut(root)) return 0;
  let project;
  try { project = resolveProject(root, { allowLegacy: true }); } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(`[workflow] Skilliton dispatch suggestion was not evaluated: ${clip(e.message, 300)}`);
    return 0;
  }
  const note = dispatchSuggestion(counts, project.dispatch.minItemsForLanes);
  if (!note) return 0;
  try {
    appendEvent(root, { event: "dispatch-suggested", session: input.session, items: counts.items, listItems: counts.listItems, sentenceItems: counts.sentenceItems, promptTruncated: input.promptTruncated });
  } catch (e) {
    // The note is still worth giving; only the record of it was lost, and that is said where hook notes are read.
    console.error(`[workflow] Skilliton dispatch suggestion was not recorded in the journal: ${clip(e.message, 300)}`);
  }
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: note } })}\n`);
  return 0;
}

async function sessionStart(input) {
  const root = locate(input);
  if (!root) return 0;
  const optOut = optedOut(root);
  if (optOut) { process.stdout.write(leftAlone(optOut)); return 0; }
  const now = new Date();
  const notes = [];
  if (input.problem) notes.push(`Hook input (not usable): ${input.problem}, so the current folder was used`);
  // On a joined machine a repository with no configuration is prepared here, before the state is read, so the block
  // describes the prepared project and the uncommitted count includes what was just written (lib/auto-prepare.mjs).
  let auto = null;
  try { auto = await autoPrepare(root); } catch (e) {
    notes.push(`Auto-prepare (failed): ${clip(e.message, 300)}; to prepare by hand: ${selfCommand()} prepare --apply`);
    console.error(`[workflow] Skilliton auto-prepare: ${clip(e.message, 300)}`);
  }
  if (auto?.note) notes.push(auto.note);
  const state = readGitState(root, { shortHead: true });
  const report = await gatherProjectState(root, { state, currentSession: input.session, now });
  try {
    appendEvent(root, { event: "session-start", session: input.session, source: input.source ?? undefined, at: now.toISOString() }, { state });
  } catch (e) {
    notes.push(`Journal (failed): this session start was not recorded (${e.message}), so the next session cannot tell whether this one was interrupted`);
    console.error(`[workflow] Skilliton session-start hook: ${clip(e.message, 300)}`);
  }
  process.stdout.write(sessionStartBlock(report, { maxBytes: report.handoffMaxBytes, notes, skipOffer: auto?.skipOffer === true }).text);
  return 0;
}

async function stop(input) {
  const root = locate(input);
  if (!root) return 0;
  if (input.stopHookActive || optedOut(root)) return 0;
  let project;
  // A project not yet migrated from the earlier names still gets the checkpoint reminder; its records are unchanged.
  try { project = resolveProject(root, { allowLegacy: true }); } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    console.error(`[workflow] Skilliton checkpoint reminder was not evaluated: ${clip(e.message, 300)}`);
    return 0;
  }
  if (!project.checkpoints.stopReminder) return 0;
  // A repository with no configuration at all has no task record and no records to checkpoint into, so a reminder
  // there could only be declined, once per stop (measured in a client repository, 2026-09-22). The session-start
  // block already says the repository is not prepared; the stop says nothing. A configuration without a layout
  // version (a project that set its own checkpoint rules) still gets the reminder it asked for.
  if (project.layoutVersion === null && !existsSync(join(root, CONFIG_REL))) { console.error("[workflow] Skilliton checkpoint reminder not given: this repository is not prepared"); return 0; }
  const state = readGitState(root);
  const journal = readJournal(root);
  const now = new Date();
  const decision = evaluateStop({ stopHookActive: input.stopHookActive, checkpoints: project.checkpoints, state, events: journal.events, session: input.session, now });
  // Maintenance is due on an integration branch when a merge landed, or a day and a commit passed, since the last
  // maintain event (lib/maintain.mjs); it is asked once per commit, and it holds the session on its own when the
  // checkpoint reminder has nothing to say.
  const integration = state.branch !== null && project.integrationBranches.includes(state.branch);
  const maint = evaluateMaintain({ root, events: journal.events, now, integration });
  const maintDue = maint.due && !journal.events.some((e) => e.event === "maintain-reminded" && e.head === state.head);
  // Dispatch: this session's prompt was read as a list of tasks and dispatch was named (the prompt hook), and no lane
  // plan has been written since. Asked once per such prompt, on any branch.
  const laneFileMtimeMs = mtimeOf(join(root, LANE_FILE));
  const hold = evaluateDispatchHold({ events: journal.events, session: input.session, laneFileMtimeMs });
  const leads = [];
  if (hold.due) leads.push(dispatchHoldReason(hold, { laneFile: LANE_FILE, laneFileExists: laneFileMtimeMs !== null }));
  if (maintDue) leads.push(maintainReason(maint));
  const recordLeads = () => {
    if (hold.due) appendEvent(root, { event: "dispatch-reminded", session: input.session, at: now.toISOString(), suggestedAt: hold.suggestion.at }, { state });
    if (maintDue) appendEvent(root, { event: "maintain-reminded", session: input.session, at: now.toISOString() }, { state });
  };
  if (!decision.block && !leads.length) return 0;
  if (!decision.block) {
    recordLeads();
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: leads.join(" ") })}\n`);
    return 0;
  }
  let current;
  try { current = currentTask(project, state.branch); } catch (e) {
    current = { task: null, ambiguous: [], unreadable: [{ file: project.directories.tasks, reason: clip(e.message, 200) }] };
  }
  // Read over the same window the reminder measures, so the two sentences cannot disagree about what "since" means.
  const merges = mergesSince(root, decision.baselineHead);
  // Only the files this tree changed, and only on a stop that is already being blocked, so a session that is keeping
  // its checkpoints up to date never pays for a read. Anything that stops the audit is said in the reminder rather
  // than swallowed: a missing sentence and a clean tree would otherwise look the same.
  //
  // Imported here and not at the top of the file, deliberately. Every hook in this file shares one module, so a
  // top-level import would load the audit's rules, the collectors and the security register on a SessionEnd whose
  // whole budget in Claude Code is about a second and a half, and on every stop that allows silently.
  let audit;
  try {
    const { auditScope } = await import("../lib/audit-run.mjs");
    const { result } = auditScope(root, { range: null });
    audit = { result };
  } catch (e) {
    audit = { problem: clip(e?.message ?? String(e), 200) };
  }
  // Dispatch and maintenance first: the checkpoint reminder ends with a command, and nothing may follow a command.
  const reason = [...leads, stopReason({ decision, state, current, merges, audit })].join(" ");
  // Recorded before the block is printed: a reminder that cannot be recorded would repeat on every stop, so a failure
  // here ends in the failure notice, and the session is allowed to stop.
  appendEvent(root, { event: "stop-reminded", session: input.session, at: now.toISOString() }, { state });
  recordLeads();
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  return 0;
}

// A file's modification time in milliseconds, or null when it does not exist or cannot be read.
function mtimeOf(path) {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

function recorder(event) {
  return async (input) => {
    const root = locate(input);
    if (!root || optedOut(root)) return 0;
    // SessionEnd hooks share a small time budget in Claude Code (1.5 seconds by default, not raised by a plugin
    // hook's own timeout), so a slow `git status` is abandoned and the event is recorded without a fingerprint.
    const state = readGitState(root, event === "session-end" ? { statusTimeoutMs: 1000, tolerateStatusTimeout: true } : {});
    const extra = event === "pre-compact" ? { trigger: input.trigger ?? undefined } : { reason: input.reason ?? undefined };
    appendEvent(root, { event, session: input.session, ...extra }, { state });
    return 0;
  };
}

const HANDLERS = { "session-start": sessionStart, stop, "pre-compact": recorder("pre-compact"), "session-end": recorder("session-end"), "user-prompt-submit": userPromptSubmit };

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
