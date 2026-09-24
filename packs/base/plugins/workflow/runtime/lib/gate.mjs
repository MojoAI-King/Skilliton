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

import { spawn, spawnSync } from "node:child_process";
import {
  closeSync, constants as fsConstants, createWriteStream, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync,
} from "node:fs";
import { cpus, loadavg } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { refuse, resolveProgram, selfCommand } from "./core.mjs";
import { DRAFT_FILE, POLICY_FILE, parsePolicyText } from "./delivery-policy.mjs";
import { ConfigError, DEFAULTS, resolveProject } from "./config.mjs";
import { changedPaths, GitError, readGitState, runGit } from "./journal.mjs";

export const DEFAULT_TAIL = 25;
export const MAX_TAIL = 200;
export const DEFAULT_TIMEOUT_SECONDS = 1800;
export const MAX_TIMEOUT_SECONDS = 86400;
export const DEFAULT_LABEL = "gate";
export const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const LOG_DIR = ["skilliton", "gate"];
const LINE_LIMIT = 400;
const MAX_NAMED_PATHS = 200;

const logPath = (gitDir, label) => join(gitDir, ...LOG_DIR, `${label}.log`);

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
function runOne(run, { cwd, log, tailLines = DEFAULT_TAIL, env = process.env, onChild = null }) {
  return new Promise((done) => {
    const began = Date.now();
    const tail = [], named = new Set();
    const keep = (line) => {
      if (named.size < MAX_NAMED_PATHS) for (const p of pathWords(line)) named.add(p);
      tail.push(line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT)} ...` : line);
      if (tail.length > tailLines) tail.shift();
    };
    // A group of its own (not on Windows, which has no process groups), so a test runner's workers cannot outlive
    // the check, hold its pipes open, or skew the next run.
    const group = process.platform !== "win32";
    let child;
    try {
      child = run.argv
        ? spawn(resolveProgram(run.argv[0]), run.argv.slice(1), { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: group })
        : spawn(run.shell, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: true, detached: group }); // skilliton-audit: allow shell-true the command the person typed at --cmd, on their own machine; the shared delivery gate takes an argument list and never this branch
    } catch (e) {
      done({ name: run.name, ok: false, code: null, signal: null, timedOut: false, startError: e.message, seconds: 0, tail, named: [] });
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
      done({ name: run.name, ok: !timedOut && !startError && code === 0, code, signal, timedOut, startError, seconds, tail, named: [...named] });
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
function provenance(root) {
  try {
    const state = readGitState(root, { shortHead: true });
    const dirty = (state.porcelain ?? "").split("\n").filter((l) => l.length > 3).map((l) => l.slice(3).trim());
    return { shortHead: state.shortHead, branch: state.branch, dirty };
  } catch (e) {
    if (e instanceof GitError) return null;
    throw e;
  }
}

// The working tree's untracked files and its tracked files changed against HEAD, at a moment in time, split the way
// `git status --porcelain=v1 -uall -z` already tells them apart (code "??" is untracked; anything else is a tracked
// file the index or the worktree differs on from HEAD). Returns null when git could not describe the tree.
function treeSnapshot(root) {
  try {
    const paths = changedPaths(root);
    return {
      untracked: paths.filter((p) => p.code === "??").map((p) => p.path),
      trackedChanged: paths.filter((p) => p.code !== "??").map((p) => p.path),
    };
  } catch (e) {
    if (e instanceof GitError) return null;
    throw e;
  }
}

// The one-minute load average and the CPU count, when the platform can say. os.loadavg() always reports [0, 0, 0]
// on Windows (Node's own documented behaviour, not a measurement), so that platform says it was not measured rather
// than printing a manufactured zero.
function machineLoad() {
  if (process.platform === "win32") return { measured: false, reason: "Windows" };
  return { measured: true, loadavg1: loadavg()[0], cpuCount: cpus().length };
}

// Words in a line of output that could be a file path: a run of path characters holding a slash or ending in a
// file extension, with a file:// prefix, a leading ./ and a trailing :line:column taken off. Most are not paths at all;
// only those Git tracks survive outsideChange, so a word that merely looks like one costs nothing.
function pathWords(line) {
  const out = [];
  for (const raw of line.match(/[\w@+.\-/\\:]+/g) ?? []) {
    const word = raw.replace(/^file:\/\//, "/").replace(/^\/+/, "/").replace(/(?::\d+)+:?$/, "").replace(/[.:]+$/, "").replace(/^\.\//, "");
    if (word.length < 3 || word.length > 300 || word.includes("://")) continue;
    if (word.includes("/") || /\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(word)) out.push(word);
  }
  return out;
}

// The change a failure is judged against: what differs from the merge base with the first integration branch that
// resolves (committed and not), plus the untracked and changed files at the start; else only those. { paths, against }.
function changeSet(root, startTree) {
  const paths = new Set([...(startTree?.untracked ?? []), ...(startTree?.trackedChanged ?? [])]);
  let branches = DEFAULTS.integrationBranches;
  try { branches = resolveProject(root, { allowLegacy: true }).integrationBranches; } catch (e) { if (!(e instanceof ConfigError)) throw e; }
  for (const name of branches.flatMap((b) => [b, `origin/${b}`])) {
    const base = runGit(root, ["merge-base", "HEAD", `${name}^{commit}`]);
    if (base.status !== 0 || !base.stdout.trim()) continue;
    const diff = runGit(root, ["diff", "--name-only", "-z", base.stdout.trim()]);
    if (diff.status !== 0) continue;
    for (const p of diff.stdout.split("\0").filter(Boolean)) paths.add(p);
    return { paths, against: `the merge base with ${name}, and the working tree` };
  }
  return { paths, against: `the working tree (no merge base with ${branches.join(" or ")} was found)` };
}

// The files a failing check's output names that Git tracks in this tree and that are not in the change: the ones a
// failure may have come from without the change touching them. { measured: true, files, against } or { measured:
// false, reason }.
function outsideChange(root, named, startTree) {
  try {
    // Both sides resolved, so a temporary folder reached through a link (macOS /var and /private/var) still matches.
    const real = realpathSync(root);
    const inTree = (p) => (isAbsolute(p) ? relative(real, existsSync(p) ? realpathSync(p) : p) : p);
    const rel = [...new Set(named.map(inTree).filter((p) => p && !p.startsWith("..") && !isAbsolute(p)))];
    const change = changeSet(root, startTree);
    const tracked = rel.length ? runGit(root, ["ls-files", "-z", "--", ...rel.map((p) => `:(literal)${p}`)]) : { status: 0, stdout: "" };
    if (tracked.status !== 0) return { measured: false, reason: `git ls-files failed: ${tracked.stderr.trim().split("\n")[0]}` };
    const known = new Set(tracked.stdout.split("\0").filter(Boolean));
    return { measured: true, files: rel.filter((p) => known.has(p) && !change.paths.has(p)), against: change.against };
  } catch (e) {
    if (e instanceof GitError) return { measured: false, reason: e.message };
    throw e;
  }
}

// The other node processes running when the gate started, from ps -axo pid,ppid,etime,command: this process and the
// ones above it are left out. { measured: true, count, first: [three "pid etime command" lines, each command cut at
// 80 characters, newest first] } or { measured: false, reason }. The parent id is read only to leave out the gate's
// own ancestors. Newest first, because a suite started a moment ago is likelier to compete than an editor's helper.
// ps's elapsed time, [[dd-]hh:]mm:ss, in seconds.
const seconds = (etime) => {
  const [days, clock] = etime.includes("-") ? etime.split("-") : ["0", etime];
  return Number(days) * 86400 + clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);
};

function nodeProcesses() {
  if (process.platform === "win32") return { measured: false, reason: "not measured on Windows" };
  const r = spawnSync(resolveProgram("ps"), ["-axo", "pid,ppid,etime,command"], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error || r.status !== 0) return { measured: false, reason: `ps could not run (${r.error?.code ?? `exit ${r.status}`})` };
  const rows = r.stdout.split("\n").slice(1).map((l) => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l)).filter(Boolean)
    .map(([, pid, ppid, etime, command]) => ({ pid: Number(pid), ppid: Number(ppid), etime, command }));
  const mine = new Set([process.pid]);
  for (let pid = process.ppid; pid > 1 && !mine.has(pid);) { mine.add(pid); pid = rows.find((row) => row.pid === pid)?.ppid ?? 0; }
  const node = rows.filter((row) => !mine.has(row.pid) && /(^|\/)node(\.exe)?$/.test(row.command.split(/\s+/)[0]));
  node.sort((a, b) => seconds(a.etime) - seconds(b.etime));
  return { measured: true, count: node.length, first: node.slice(0, 3).map((row) => `${row.pid} ${row.etime} ${row.command.slice(0, 80)}`) };
}

// An error the gate command reports as its log not being written (exit 3): a string code, like a system error.
function unsafeLog(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
const NOTHING = "nothing was written. Remove it and run again";
const linked = (path) => unsafeLog("ESYMLINK", `${path} is a symbolic link, and the gate never writes its log through a link; ${NOTHING}`);
const hardLinked = (path, n) => unsafeLog("EHARDLINK", `${path} has ${n} hard links, so writing it would change another file; ${NOTHING}`);
const notRegular = (path) => unsafeLog("ENOTREG", `${path} is not a regular file; ${NOTHING}`);

// Opens the log for writing without ever following a link out of the Git folder. Each folder between the Git folder
// and the file is checked with lstat and made one at a time (a recursive mkdir would follow a linked parent and
// create folders wherever it points); the file itself is opened with O_NOFOLLOW, and a file with a second hard link
// is refused, because truncating it would change the other name's bytes. The file is truncated only after those
// checks pass on the opened descriptor, so a refused target keeps every byte it had. The Git folder itself is not
// checked: it is where git says it is, and on some machines the temporary folder above it is a link.
function openLog(gitDir, label) {
  let dir = gitDir;
  for (const part of LOG_DIR) {
    dir = join(dir, part);
    let st = null;
    try { st = lstatSync(dir); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (st && st.isSymbolicLink()) throw linked(dir);
    if (st && !st.isDirectory()) throw unsafeLog("ENOTDIR", `${dir} is not a folder; ${NOTHING}`);
    if (!st) mkdirSync(dir, { mode: 0o700 });
  }
  const path = logPath(gitDir, label);
  let before = null;
  try { before = lstatSync(path); } catch (e) { if (e.code !== "ENOENT") throw e; }
  if (before && before.isSymbolicLink()) throw linked(path);
  if (before && before.isFile() && before.nlink > 1) throw hardLinked(path, before.nlink);
  if (before && !before.isFile() && !before.isDirectory()) throw notRegular(path);
  // O_NOFOLLOW is 0 where the platform has none (Windows); the lstat above is then the only guard.
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags, 0o600); // a directory here throws EISDIR, a link made since the lstat throws ELOOP
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw notRegular(path);
    if (st.nlink > 1) throw hardLinked(path, st.nlink);
    ftruncateSync(fd, 0);
  } catch (e) {
    closeSync(fd);
    throw e;
  }
  return { fd, path };
}

// Runs the plan in order, stopping at the first failure. Resolves { results, log: path }. `signals` lets the
// caller forward an interrupt to the running child.
export async function runGate(plan, { root, gitDir, label, tailLines, env = process.env, signals = true }) {
  // Opened before anything starts, so a log that cannot be written is a refusal (exit 3) and no check is left running.
  const { fd, path } = openLog(gitDir, label);
  const log = createWriteStream(null, { fd });
  let current = null;
  const forward = (sig) => { if (current) { try { process.kill(current.group ? -current.child.pid : current.child.pid, sig); } catch { /* gone */ } } };
  // A write error during a run (the disk filled, the file was removed from under us) stops the check and is reported
  // as the gate not running, never as the check's own verdict.
  let logError = null;
  log.on("error", (e) => { if (!logError) { logError = e; forward("SIGKILL"); } });
  const handlers = [];
  if (signals) for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) { const h = () => forward(sig); handlers.push([sig, h]); process.on(sig, h); }
  // Taken before the first check runs, so it describes the tree the run started from, not what a check's own
  // build output left behind.
  const startTree = treeSnapshot(root);
  const competing = nodeProcesses();
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
  const machine = machineLoad();
  const names = (list) => list.join(", ") || "none";
  if (startTree) log.write(`at start: untracked ${names(startTree.untracked)}; tracked changed against HEAD ${names(startTree.trackedChanged)}\n`);
  log.write(`other node processes at start: ${competing.measured ? [competing.count, ...competing.first].join("; ") : competing.reason}\n`);
  const failed = results.find((r) => !r.ok);
  const outside = failed ? outsideChange(root, failed.named, startTree) : null;
  if (outside) {
    log.write(outside.measured
      ? `failing files outside the change (${outside.against}): ${names(outside.files)}\n`
      : `failing files outside the change: not measured (${outside.reason})\n`);
  }
  log.write(machine.measured
    ? `load average (1m): ${machine.loadavg1.toFixed(2)} across ${machine.cpuCount} CPU(s)\n`
    : `load average (1m): not measured on ${machine.reason}\n`);
  await new Promise((r) => log.end(r)); // the end of the log is where a suite prints its summary; never lose it
  return { results, log: path, where, startTree, machine, competing, outside };
}

export function describe(result) {
  if (result.startError) return `could not start: ${result.startError}`;
  if (result.timedOut) return `timed out and was stopped`;
  if (result.signal) return `killed by ${result.signal}`;
  return `exit ${result.code}`;
}
