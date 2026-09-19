// gate.mjs: the engine of `skilliton gate` (docs/CONTRACTS.md section 6). Runs a project's checks and returns a
// verdict instead of a transcript: the full output goes to a log inside the repository's Git folder, and what
// reaches the caller is the bare exit status, the tree it ran on, and on failure a bounded tail.
//
// Why: a test run's output entering an assistant's context is paid for as cache-write tokens on every later turn,
// and it is the largest avoidable line in the measured transcripts after whole-file reads. The checks themselves
// are unchanged; only what reaches the conversation changes.
//
// What it runs, in this order of preference: the command given with --cmd (through the shell, as a person would
// type it); else the checks in the project's delivery policy (.skilliton/delivery.json, argument lists, the same
// checks the shared branch's gate runs, so the local run cannot drift from it); else `npm run verify` when
// package.json has a verify script. With none of those it refuses and says what to add.
//
// The verdict is the exit status, never a reading of the output. A check killed by a signal, or stopped by the
// timeout, is a failure that says so. The child runs with this process's environment, because it is the
// developer's own checks on the developer's own machine; the delivery gate is the one that isolates.

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refuse, selfCommand } from "./core.mjs";
import { DRAFT_FILE, POLICY_FILE, parsePolicyText } from "./delivery.mjs";
import { GitError, readGitState } from "./journal.mjs";

export const DEFAULT_TAIL = 25;
export const MAX_TAIL = 200;
export const DEFAULT_TIMEOUT_SECONDS = 1800;
export const MAX_TIMEOUT_SECONDS = 86400;
export const DEFAULT_LABEL = "gate";
export const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const LOG_DIR = ["skilliton", "gate"];
const LINE_LIMIT = 400;

export const logPath = (gitDir, label) => join(gitDir, ...LOG_DIR, `${label}.log`);

// The runs the gate will make: [{ name, argv: string[] | null, shell: string | null, timeoutSeconds }].
// argv runs a program with arguments (a policy check); shell runs text through the shell (--cmd, npm run verify).
export function planGate(root, { cmd = null, policy = false, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS } = {}) {
  if (cmd !== null && policy) refuse("--cmd and --policy cannot be combined: one names the command, the other runs the delivery policy's checks");
  if (cmd !== null) {
    if (!cmd.trim()) refuse("--cmd needs a command");
    return { kind: "cmd", source: "the --cmd option", runs: [{ name: cmd.trim(), argv: null, shell: cmd.trim(), timeoutSeconds }] };
  }
  const policyPath = join(root, POLICY_FILE);
  const draftNote = existsSync(join(root, DRAFT_FILE)) ? `, but the draft ${DRAFT_FILE} does (prepare wrote it; a draft is never run). Review it, then: ${selfCommand()} delivery confirm --apply. Or name a command with --cmd` : "";
  if (policy || existsSync(policyPath)) {
    if (!existsSync(policyPath)) refuse(`--policy was given, but ${POLICY_FILE} does not exist in ${root}${draftNote}`);
    let text;
    try { text = readFileSync(policyPath, "utf8"); } catch (e) { refuse(`${POLICY_FILE} could not be read (${e.code ?? e.message})`); }
    const parsed = parsePolicyText(text);
    if (parsed.problems) refuse(`${POLICY_FILE} is not a valid delivery policy, so its checks cannot be run: ${parsed.problems.join("; ")}. Fix the policy, or name a command with --cmd`);
    if (!parsed.policy.checks.length) refuse(`${POLICY_FILE} lists no checks, so there is nothing to run. Add a check to the policy, or name a command with --cmd`);
    return {
      kind: "policy",
      source: `the ${parsed.policy.checks.length} check(s) in ${POLICY_FILE}`,
      runs: parsed.policy.checks.map((c) => ({ name: c.name, argv: c.command, shell: null, timeoutSeconds: Math.min(c.timeoutSeconds, timeoutSeconds) })),
    };
  }
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    let pkg = null;
    try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); } catch { pkg = null; }
    if (pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts.verify === "string") {
      return { kind: "npm", source: 'the "verify" script in package.json', runs: [{ name: "npm run verify", argv: null, shell: "npm run verify", timeoutSeconds }] };
    }
  }
  if (draftNote) refuse(`nothing to run: ${POLICY_FILE} does not exist${draftNote}`);
  refuse(`nothing to run: no --cmd was given, ${POLICY_FILE} does not exist, and package.json has no "verify" script. Name the command: ${selfCommand()} gate --cmd "<the project's test command>"`);
  return null;
}

// Runs one entry of the plan. Resolves { name, ok, code, signal, timedOut, startError, seconds, tail }.
// Output goes to `log` (a writable stream) as it arrives; the tail keeps the last `tailLines` lines, each cut at
// LINE_LIMIT characters, for the failure report.
export function runOne(run, { cwd, log, tailLines = DEFAULT_TAIL, env = process.env, onChild = null }) {
  return new Promise((done) => {
    const began = Date.now();
    const tail = [];
    const keep = (line) => {
      tail.push(line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT)} ...` : line);
      if (tail.length > tailLines) tail.shift();
    };
    // A group of its own (not on Windows, which has no process groups), so a test runner's workers cannot outlive
    // the check, hold its pipes open, or skew the next run.
    const group = process.platform !== "win32";
    let child;
    try {
      child = run.argv
        ? spawn(run.argv[0], run.argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: group })
        : spawn(run.shell, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: true, detached: group });
    } catch (e) {
      done({ name: run.name, ok: false, code: null, signal: null, timedOut: false, startError: e.message, seconds: 0, tail });
      return;
    }
    if (onChild) onChild(child, group);
    const partial = { out: "", err: "" };
    const feed = (key) => (chunk) => {
      log.write(chunk);
      const lines = (partial[key] + chunk.toString("utf8")).replace(/\r(?=\n)/g, "").split("\n");
      partial[key] = lines.pop();
      lines.forEach(keep);
      // A stream with no newline (a progress writer) must not grow the carry without bound; the log has every byte.
      if (partial[key].length > LINE_LIMIT) { keep(partial[key]); partial[key] = ""; }
    };
    child.stdout.on("data", feed("out"));
    child.stderr.on("data", feed("err"));
    let timedOut = false, settled = false, exit = null, grace = null, startError = null;
    const killAll = () => {
      try { if (child.pid) process.kill(group ? -child.pid : child.pid, "SIGKILL"); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => { timedOut = true; killAll(); }, run.timeoutSeconds * 1000);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      child.stdout?.destroy();
      child.stderr?.destroy();
      for (const key of ["out", "err"]) if (partial[key]) { keep(partial[key]); partial[key] = ""; }
      const seconds = Math.round((Date.now() - began) / 100) / 10;
      const code = exit?.code ?? null, signal = exit?.signal ?? null;
      done({ name: run.name, ok: !timedOut && !startError && code === 0, code, signal, timedOut, startError, seconds, tail });
    };
    child.on("error", (e) => {
      const program = run.argv ? run.argv[0] : run.shell;
      startError = e.code === "ENOENT" ? `${program} was not found${program.includes("/") ? "" : " on PATH"}` : e.message;
      finish();
    });
    child.on("exit", (code, signal) => {
      exit = { code, signal };
      killAll(); // whatever the check left running goes with it
      grace = setTimeout(finish, 5000); // a child that keeps the pipes open after exiting is not waited for forever
    });
    child.on("close", (code, signal) => {
      if (!exit) exit = { code, signal };
      finish();
    });
  });
}

// The tree the gate ran on: { shortHead, branch, dirty: [paths] } or null when git could not say (no git, no
// commits yet, or not a repository). A green run on a tree with uncommitted files is about that tree, not a commit.
export function provenance(root) {
  try {
    const state = readGitState(root, { shortHead: true });
    const dirty = (state.porcelain ?? "").split("\n").filter((l) => l.length > 3).map((l) => l.slice(3).trim());
    return { shortHead: state.shortHead, branch: state.branch, dirty };
  } catch (e) {
    if (e instanceof GitError) return null;
    throw e;
  }
}

// Runs the plan in order, stopping at the first failure. Resolves { results, log: path }. `signals` lets the
// caller forward an interrupt to the running child.
export async function runGate(plan, { root, gitDir, label, tailLines, env = process.env, signals = true }) {
  const dir = join(gitDir, ...LOG_DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = logPath(gitDir, label);
  // Opened before anything starts, so a log that cannot be written is a refusal (exit 3) and no check is left running.
  const fd = openSync(path, "w", 0o600);
  const log = createWriteStream(null, { fd });
  let current = null;
  const forward = (sig) => { if (current) { try { process.kill(current.group ? -current.child.pid : current.child.pid, sig); } catch { /* gone */ } } };
  // A write error during a run (the disk filled, the file was removed from under us) stops the check and is reported
  // as the gate not running, never as the check's own verdict.
  let logError = null;
  log.on("error", (e) => { if (!logError) { logError = e; forward("SIGKILL"); } });
  const handlers = [];
  if (signals) for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) { const h = () => forward(sig); handlers.push([sig, h]); process.on(sig, h); }
  const results = [];
  try {
    log.write(`skilliton gate ${label}: ${plan.source}\n`);
    for (const run of plan.runs) {
      log.write(`\n=== ${run.name} ===\n`);
      const result = await runOne(run, { cwd: root, log, tailLines, env, onChild: (child, group) => { current = { child, group }; } });
      current = null;
      results.push(result);
      log.write(`\n=== ${run.name}: ${describe(result)} ===\n`);
      if (!result.ok) break;
    }
  } finally {
    for (const [sig, h] of handlers) process.off(sig, h);
  }
  if (logError) throw logError;
  const where = provenance(root);
  if (where) log.write(`tree: ${where.shortHead ?? "no commits"}${where.branch ? ` on ${where.branch}` : ""}, uncommitted: ${where.dirty.join(", ") || "none"}\n`);
  await new Promise((r) => log.end(r)); // the end of the log is where a suite prints its summary; never lose it
  return { results, log: path, where };
}

export function describe(result) {
  if (result.startError) return `could not start: ${result.startError}`;
  if (result.timedOut) return `timed out and was stopped`;
  if (result.signal) return `killed by ${result.signal}`;
  return `exit ${result.code}`;
}
