// preflight.mjs: does this machine let Skilliton work? (docs/IT-ALLOWLIST.md, backlog B27)
//
// On a managed laptop the interesting failures are not bugs: a program the hooks need is missing, endpoint security
// will not start it, a folder cannot be written, or the plugin repository cannot be reached. Those failures are quiet:
// a hook that cannot run prints a notice into a session nobody reads closely, and `join` fails half way through.
//
// This runs the checks first. It sets nothing up, and the only things it writes it takes away again:
//   programs   every program in the allow list is looked for and started once, each from the same kind of parent that
//              starts it in a session: the ones hooks use are started by ../preflight/probe.sh, run by its path inside
//              the plugin (the way Claude Code runs a hook, and through Git Bash on Windows), and the ones the runtime
//              starts are started here by node. Each start is in its own process group with a timeout that really ends
//              it, so a program that will not stop is taken away with its children instead of hanging the check
//   folders    every folder Skilliton writes is tested in the folder itself: a folder that does not exist is created
//              (mode 0700) and a small file is written in it, and then the file and the folder are removed again. A
//              permission bit says nothing about what a security product will allow, and a rule that allows the home
//              folder but not ~/.claude is exactly the shape this has to catch
//   repository the company's plugin repository is asked for its branch list with git ls-remote, with prompts turned
//              off and with no repository's configuration read (GIT_DIR points at an empty folder), which is the one
//              command in Skilliton that contacts a network, and only when a marketplace is given
//
// Every check ends as ok, blocked, missing, or not checked, with what IT would have to allow. An interrupted run
// takes its files, its folders and any program it started with it, and then dies of the signal it was sent. Nothing
// here decides whether a security product is "supported": it reports what this machine did, on this run.

import { spawn } from "node:child_process";
import { accessSync, closeSync, constants as fsConstants, mkdirSync, mkdtempSync, openSync, rmdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { BACKUPS, PLUGIN_ROOT, isDir, refuse, statOrNull, tilde, which, windowsCmdLine } from "./core.mjs";
import { noProxyInUse, proxyInUse, realHome } from "./journal.mjs";
import { runGit, trustDir } from "./trust.mjs";
import { joinDir } from "./join.mjs";
import { claudeConfigDir, codexHome } from "./verify.mjs";
import { REDACTION_SHAPES } from "./secret-rules.mjs";

const PROBE = join(PLUGIN_ROOT, "runtime", "preflight", "probe.sh");
const LS_REMOTE_TIMEOUT_MS = 45000;
const MAX_OUTPUT = 4 * 1024 * 1024;
const AFTER_KILL_MS = 1500; // how long to wait after killing a program's process group before answering anyway
// Claude Code installs a plugin under <config>/plugins/cache/<marketplace>/<plugin>/<version>/. A check run from a
// clone of the skills repository exercises that clone's folder, not the cache, and says so.
const INSTALLED_COPY = /[\\/]plugins[\\/]cache[\\/]/;

// Every program docs/IT-ALLOWLIST.md section 1 names, what starts it, and what stops working without it.
//   by      "hook" a hook script starts it, so the probe script starts it here; "runtime" node starts it; "client" a
//           coding tool the developer runs
//   need    "required" Skilliton does not work without it; "feature" one part stops working; "reader" one of the JSON
//           readers, of which one is enough; "maintainer" only a company maintainer's own commands reach it
//   blocks  "setup" setting a machine up cannot finish without it; "sessions" setup finishes and something in a later
//           session does not work; null neither. bash is a "sessions" item: join writes files with node and drives the
//           coding tools, and it is the hooks and the launcher that need a shell afterwards.
export const PROGRAMS = [
  { name: "node", by: "runtime", need: "required", what: "every command, every session hook, and reading the JSON a hook is given when jq is not there", blocks: "setup" },
  { name: "bash", by: "runtime", need: "required", what: "every hook script and the terminal launcher", blocks: "sessions" },
  { name: "sh", by: "runtime", need: "required", what: "the shell Claude Code hands each hook command to, and the launcher join writes", blocks: "sessions" },
  { name: "env", by: "runtime", need: "required", what: "the first line of every hook script", blocks: "sessions" },
  { name: "git", by: "runtime", need: "required", what: "project state at session start, the secret check before a commit, and release verification", blocks: "setup" },
  { name: "ssh-keygen", by: "runtime", need: "required", what: "checking the signature on a company release, so verify can say VERIFIED", blocks: "setup" },
  { name: "jq", by: "hook", need: "feature", what: "the optional status line and the drift check, which have no other way to read JSON; the guardrails and handoff hooks fall back to node", blocks: "sessions" },
  { name: "python3", by: "hook", need: "optional", what: "reading a hook's input where neither jq nor node is there, which cannot happen while node is required", blocks: null },
  { name: "npm", by: "runtime", need: "optional", what: "skilliton gate's fallback (npm run verify) in a project with a verify script in package.json and no delivery policy; a project without either names its command with --cmd", blocks: null },
  { name: "grep", by: "hook", need: "required", what: "the guardrails check for secrets in a commit", blocks: "sessions" },
  { name: "find", by: "hook", need: "required", what: "the same check, when it looks at files", blocks: "sessions" },
  { name: "dirname", by: "hook", need: "required", what: "the terminal launcher and the status line", blocks: "sessions" },
  { name: "readlink", by: "hook", need: "required", what: "the terminal launcher, when it follows a link", blocks: "sessions" },
  { name: "awk", by: "hook", need: "feature", what: "the session-start checklist and the guardrails command reader", blocks: "sessions" },
  { name: "sed", by: "hook", need: "feature", what: "the session-start checklist and the drift check", blocks: "sessions" },
  { name: "tr", by: "hook", need: "feature", what: "the session-start checklist and the status line", blocks: "sessions" },
  { name: "wc", by: "hook", need: "feature", what: "the session-start checklist", blocks: "sessions" },
  { name: "cat", by: "hook", need: "feature", what: "the status line and the guardrails hook reading their input", blocks: "sessions" },
  { name: "date", by: "hook", need: "feature", what: "the time on each status line record", blocks: "sessions" },
  { name: "mkdir", by: "hook", need: "feature", what: "the status line's log folder", blocks: "sessions" },
  { name: "head", by: "hook", need: "feature", what: "the drift check", blocks: "sessions" },
  { name: "tail", by: "hook", need: "feature", what: "the drift check", blocks: "sessions" },
  { name: "cut", by: "hook", need: "feature", what: "the drift check", blocks: "sessions" },
  { name: "ls", by: "hook", need: "feature", what: "the drift check, finding the newest transcript", blocks: "sessions" },
  { name: "xargs", by: "hook", need: "feature", what: "the scrub check that import and propose run", blocks: "sessions" },
  { name: "tar", by: "runtime", need: "feature", what: "the delivery gate on a shared repository", blocks: "sessions" },
  { name: "ps", by: "runtime", need: "feature", what: "a failing skilliton gate verdict naming the other node processes running", blocks: null },
  { name: "cp", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "mktemp", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "rm", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "cmd.exe", by: "runtime", need: "required", what: "on Windows, starting npm's claude launcher, a .cmd file Node cannot start by itself", platform: "win32", blocks: "setup" },
  { name: "xcode-select", by: "hook", need: "feature", what: "on a Mac, telling a real python3 from the developer-tools stub", platform: "darwin", blocks: "sessions" },
  { name: "claude", by: "client", need: "client", what: "Claude Code itself: the marketplace, the plugins and every session", blocks: "setup" },
  { name: "codex", by: "client", need: "client", what: "Codex itself, for teams that use it", blocks: "setup" },
];

const ACTION = {
  blocked: (item) => `Ask IT to allow ${item.path ?? item.name} to be started by the shell and by node (docs/IT-ALLOWLIST.md section 1).`,
  missing: (item) => `Install ${item.name}, or add it to PATH (docs/IT-ALLOWLIST.md section 1).`,
};

// `blocks` says what an item that is not ok stops: "setup" means join cannot finish, "sessions" means setup finishes
// but something in a session would not work, and null means neither.
const state = (name, area, s, detail, action, blocks = null) => ({ area, name, state: s, detail, action: action ?? null, blocks });

// ---------- programs ----------

// Starts one program in its own process group and waits for it. The timeout really ends it: a program that ignores
// being asked to stop, or a child of it still holding the output open, is killed with its whole group. A synchronous
// start cannot do that (its timeout asks the program to stop and then goes on waiting for it), which is why this is
// the one part of the check that is asynchronous.
function startOnce(file, args, timeoutMs) {
  return new Promise((resolve) => {
    const group = process.platform !== "win32", via = windowsCmdLine(file, args); if (via) [file, args] = via; // a .cmd, as in core.mjs
    let child = null, timer = null, grace = null, settled = false, timedOut = false, escaped = false, tooMuchOutput = false;
    let stdout = "", stderr = "";
    const stop = () => {
      if (!child?.pid) return;
      try { if (group) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch { /* it has gone */ }
    };
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (grace) clearTimeout(grace);
      LIVE.delete(stop);
      resolve({ stdout, stderr, timedOut, escaped, tooMuchOutput, ...result });
    };
    try {
      // A program asked for its version must leave nothing behind: a Node program (npm, for one) writes a compile cache
      // under the temporary folder unless told not to, and the preflight check promises to write nothing.
      child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], detached: group, windowsHide: true, windowsVerbatimArguments: Boolean(via), env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1" } });
    } catch (e) { done({ error: e, code: e.code ?? null, status: null }); return; }
    LIVE.add(stop);
    installCleanup();
    const keep = (which) => (chunk) => {
      const text = chunk.toString("utf8");
      if (which === "out") { if (stdout.length < MAX_OUTPUT) stdout += text; else tooMuchOutput = true; }
      else if (stderr.length < MAX_OUTPUT) stderr += text; else tooMuchOutput = true;
    };
    child.stdout.on("data", keep("out"));
    child.stderr.on("data", keep("err"));
    // The timeout kills the group, and then answers on its own a moment later whatever happens: waiting for "close"
    // would wait for the output pipes as well, and a program can leave a child of its own OUTSIDE the group (setsid),
    // where nothing Skilliton does can reach it. Such a child holds the pipe open for ever, so the check says what it
    // saw and moves on rather than waiting.
    timer = setTimeout(() => {
      timedOut = true;
      stop();
      grace = setTimeout(() => {
        escaped = true;
        child.stdout?.destroy();
        child.stderr?.destroy();
        done({ error: null, code: null, status: null });
      }, AFTER_KILL_MS);
    }, timeoutMs);
    child.once("error", (e) => done({ error: e, code: e.code ?? null, status: null }));
    child.once("close", (status) => done({ error: null, code: null, status }));
  });
}

// Runs the probe script by its path, the way a hook is run. Returns Map(name -> { state, exit, path, detail }), or
// { failed } when the script itself could not run, which is itself the finding.
async function probeHookPrograms(names, { probe = PROBE, timeoutMs = 60000, platform = process.platform } = {}) {
  if (!names.length) return { results: new Map() };
  if (platform === "win32") {
    // Windows cannot start a .sh by its path, and Claude Code hands each hook command to Git Bash, so that is how
    // this runs there too.
    const bash = findWindowsBash();
    if (!bash) return { failed: "Git for Windows was not found, so nothing could run the hook scripts. Claude Code runs each hook command through Git Bash, and without it Windows would use PowerShell, which cannot run these scripts. Install Git for Windows, or set CLAUDE_CODE_GIT_BASH_PATH to its bash.exe." };
    const win = await startOnce(bash.path, [probe, ...names], timeoutMs);
    if (win.error || win.status !== 0) {
      return { failed: `${tilde(probe)} could not be run by Git Bash at ${bash.path} (found through ${bash.how}): ${win.error ? win.code ?? win.error.message : `exit ${win.status}: ${(win.stderr ?? "").trim().slice(0, 200)}`}`, results: parseProbe(win.stdout) };
    }
    return { results: parseProbe(win.stdout), note: `started by Git Bash at ${bash.path}, found through ${bash.how}` };
  }
  const r = await startOnce(probe, names, timeoutMs);
  if (!r.error && r.status === 0) return { results: parseProbe(r.stdout) };
  // A run that timed out started fine; retrying it under bash would only wait again, and the answer would still be
  // about one slow program rather than about the folder.
  if (r.timedOut) {
    const left = r.escaped ? " One of them also put a child outside its own process group, which this check cannot stop, and that child may still be running." : "";
    return { failed: `${tilde(probe)} did not finish within ${timeoutMs / 1000}s, so the programs the hooks use were not checked. One of them did not return; run it by hand, or run this check again.${left}`, results: parseProbe(r.stdout) };
  }
  const bash = await startOnce("bash", [probe, ...names], timeoutMs);
  const why = r.error ? `${r.code ?? r.error.message}` : `exit ${r.status}: ${(r.stderr ?? "").trim().slice(0, 200)}`;
  if (bash.error || bash.status !== 0) {
    return { failed: `${tilde(probe)} could not be run by its path (${why}), and bash could not run it either (${bash.error ? bash.code ?? bash.error.message : `exit ${bash.status}`}). Every Skilliton hook is a script in this folder, so nothing would run in a session.` };
  }
  return { failed: `${tilde(probe)} could not be run by its path (${why}), although bash could run it. Claude Code runs each hook by path, so the hooks would not run.`, results: parseProbe(bash.stdout) };
}

function parseProbe(text) {
  const results = new Map();
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    const [name, s, exit, path, ...rest] = line.split("|");
    results.set(name, { state: s === "found" ? "ok" : s, exit: exit || null, path: path || null, detail: rest.join("|").trim() });
  }
  return results;
}

// A file with this name on PATH that this user may not run, or null. `which` skips such a file, so "not found" and
// "found but not allowed to run" would otherwise look the same, and they are different problems for IT. On Windows
// the execute bit does not exist, so this always answers null there and the distinction is not made.
function unrunnableOnPath(name) {
  if (process.platform === "win32") return null;
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, name);
    let st;
    try { st = statSync(candidate); } catch { continue; }
    if (!st.isFile()) continue;
    try { accessSync(candidate, fsConstants.X_OK); } catch { return candidate; }
  }
  return null;
}

// Windows runs a hook's command through Git Bash, which comes with Git for Windows (documented 2026-09-17 at
// https://code.claude.com/docs/en/hooks; without it Claude Code uses PowerShell, which cannot run these scripts).
// This finds that bash: the variable Claude Code documents, else PATH, else the folder Git for Windows installs it in
// beside git.exe.
function findWindowsBash() {
  const named = process.env.CLAUDE_CODE_GIT_BASH_PATH;
  if (named && statOrNull(named)?.isFile()) return { path: named, how: "CLAUDE_CODE_GIT_BASH_PATH" };
  const onPath = which("bash");
  if (onPath) return { path: onPath, how: "PATH" };
  const git = which("git");
  if (git) {
    for (const candidate of [resolve(dirname(git), "..", "bin", "bash.exe"), resolve(dirname(git), "..", "..", "bin", "bash.exe")]) {
      if (statOrNull(candidate)?.isFile()) return { path: candidate, how: "the folder Git for Windows keeps it in" };
    }
  }
  return null;
}

// A coding tool is never started here. Codex writes scratch files into its home folder on any invocation, even
// --version (docs/CLIENTS.md), and `join` promises that a preview and a repeat with nothing to do run no client at
// all. So the check is the file: is it on PATH, and may this user run it? A policy that lets the file be found but
// stops it starting is therefore not caught here; `skilliton doctor` asks Claude Code for its version, and a session
// shows it at once.
function probeClient(name, given) {
  const found = "found; it is not started here, because starting a coding tool writes into its own folder";
  if (given) {
    // A path the caller already resolved (join's --claude or --codex), so a tool that is not on PATH under its own
    // name is not reported as missing.
    const st = statOrNull(given);
    if (!st?.isFile()) return { state: "missing", exit: null, path: given, detail: "the path given for it is not a file" };
    try { accessSync(given, fsConstants.X_OK); } catch { return { state: "blocked", exit: null, path: given, detail: "it is there, but this user may not run it" }; }
    return { state: "ok", exit: null, path: given, detail: found };
  }
  const path = which(name);
  if (path) return { state: "ok", exit: null, path, detail: found };
  const blocked = unrunnableOnPath(name);
  if (blocked) return { state: "blocked", exit: null, path: blocked, detail: "it is there, but this user may not run it" };
  return { state: "missing", exit: null, path: null, detail: "not found on PATH" };
}

// The programs node starts itself, checked the same way: found on PATH, then started once.
async function probeRuntimeProgram(name, { timeoutMs = 20000 } = {}) {
  const path = which(name);
  if (!path) return { state: "missing", exit: null, path: null, detail: "not found on PATH" };
  const r = await startOnce(path, ["--version"], timeoutMs);
  const message = `${r.stderr ?? ""}`.trim().split("\n")[0]?.slice(0, 160) ?? "";
  if (r.timedOut) {
    const left = r.escaped ? "; it put a child outside its own process group, which this check cannot stop, and that child may still be running" : "";
    return { state: "not checked", exit: null, path, detail: `it did not answer --version within ${timeoutMs / 1000}s and was stopped${left}, so whether it runs here is unknown; try it by hand` };
  }
  if (r.error) return { state: "blocked", exit: null, path, detail: `it was found, but starting it failed (${r.code ?? r.error.message})` };
  if (r.status === 126) return { state: "blocked", exit: "126", path, detail: message || "permission denied" };
  if (r.tooMuchOutput) return { state: "ok", exit: String(r.status), path, detail: "it ran (it printed more than this check keeps)" };
  // A file that was found and may be run, and then would not start, is a block whatever the code says: ENOENT here
  // means the file names an interpreter that is not there, or something refused the start between the two. Both cases
  // are answered above, before the size of the output is looked at.
  if (/not permitted|permission denied|blocked/i.test(message)) return { state: "blocked", exit: String(r.status), path, detail: `it ran but said: ${message}` };
  return { state: "ok", exit: String(r.status), path, detail: (r.stdout ?? "").trim().split("\n")[0]?.slice(0, 80) ?? "" };
}

// `clients` is a list of names, or of { name, path } when the caller already resolved a coding tool's path.
async function checkPrograms({ clients = [], platform = process.platform, probe = PROBE } = {}) {
  const asked = clients.map((c) => (typeof c === "string" ? { name: c } : c));
  const wanted = PROGRAMS.filter((p) => (!p.platform || p.platform === platform) && (p.need !== "client" || asked.some((c) => c.name === p.name)));
  const hookPrograms = wanted.filter((p) => p.by === "hook").map((p) => p.name);
  const probed = await probeHookPrograms(hookPrograms, { probe, platform });
  const items = [];
  // Where this copy of the runtime lives decides what the run proves: only a run from the installed plugin exercises
  // the plugin cache folder that a script policy has to allow.
  const shell = probed.note ? `${probed.note}; ` : "";
  const where = INSTALLED_COPY.test(probe)
    ? "this is the installed plugin, so the plugin cache folder was exercised"
    : "this is a copy of the skills repository, not the installed plugin, so the plugin cache folder was not exercised; run this check again after setup";
  if (probed.failed) items.push(state("the hook scripts", "programs", "blocked", `${probed.failed} (${where})`, "Ask IT to allow bash and node to run scripts under the plugin cache folder (docs/IT-ALLOWLIST.md section 1, \"Plugin scripts move with each release\").", "sessions"));
  else items.push(state("the hook scripts", "programs", "ok", `${tilde(probe)} ran the way Claude Code runs a hook; ${shell}${where}`));

  for (const p of wanted) {
    let result = p.by === "hook" ? (probed.results?.get(p.name) ?? { state: "not checked", detail: "the probe script did not report it" })
      : p.by === "client" ? probeClient(p.name, asked.find((c) => c.name === p.name)?.path)
        : await probeRuntimeProgram(p.name);
    if (result.state === "missing") {
      // A file that is there but may not be run is a policy problem, not a missing program, and the two need
      // different answers from IT.
      const blocked = unrunnableOnPath(p.name);
      if (blocked) result = { state: "blocked", exit: null, path: blocked, detail: "it is there, but this user may not run it" };
    }
    const where = result.path ? ` (${result.path})` : "";
    const detail = result.state === "ok"
      ? `${result.path ?? "found"}${result.detail ? `, ${result.detail}` : ""}`
      : `${result.detail || result.state}${where}`;
    items.push({
      ...state(p.name, "programs", result.state, detail, result.state === "ok" ? null : (ACTION[result.state] ?? ((i) => `Check ${i.name} by hand.`))({ ...p, path: result.path }), p.blocks),
      need: p.need, what: p.what, by: p.by,
    });
  }
  return items;
}

// ---------- folders ----------

// Folders Skilliton writes on this machine, with what is written there.
function folders({ binDir, clients = [] } = {}) {
  const list = [
    { path: trustDir(), what: "the signers file that says whom this laptop trusts to sign releases", need: "required" },
    { path: joinDir(), what: "the receipt of what join added, so join --undo can take it back out", need: "required" },
    { path: resolve(binDir ?? join(homedir(), ".local", "bin")), what: "the skilliton command for terminals", need: "feature" },
    { path: BACKUPS, what: "a copy of any file changed outside a repository, taken before the change", need: "required" },
    { path: tmpdir(), what: "temporary folders the delivery gate and propose use, removed when they finish", need: "required" },
  ];
  if (clients.includes("claude")) list.unshift({ path: claudeConfigDir(), what: "Claude Code's own settings and plugins", need: "required" });
  if (clients.includes("codex")) list.unshift({ path: codexHome(), what: "Codex's own settings and plugins", need: "required" });
  return list;
}

// What this run has made and not taken away yet: probe files, folders it created, and programs still running. An
// interrupted run takes all of it with it, and then dies of the signal it was sent, so its exit status still says so.
const PROBE_FILES = new Set();
const PROBE_FOLDERS = [];
const LIVE = new Set();
let cleanupInstalled = false;

function cleanUp() {
  for (const stop of LIVE) { try { stop(); } catch { /* it has gone */ } }
  LIVE.clear();
  for (const file of PROBE_FILES) { try { unlinkSync(file); } catch { /* already gone, or it cannot be removed */ } }
  PROBE_FILES.clear();
  for (const folder of [...PROBE_FOLDERS].reverse()) { try { rmdirSync(folder); } catch { /* not empty, or already gone */ } }
  PROBE_FOLDERS.length = 0;
}

function installCleanup() {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  process.on("exit", cleanUp);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => {
      cleanUp();
      process.removeListener(signal, handler);
      process.kill(process.pid, signal); // die of the signal that was sent, so the exit status names it
    };
    process.on(signal, handler);
  }
}

// Tests one folder the way the tool uses it: a folder that does not exist is created (the same way a command would
// create it) and removed again, and one small file is written inside the folder itself and removed. The file is
// written in the folder under test, never in a folder above it, so a rule that allows the home folder but not
// ~/.claude is reported rather than passed. Returns { state, detail }.
function probeFolder(dir) {
  const target = resolve(dir);
  const missing = [];
  let walk = target;
  while (!isDir(walk)) {
    const parent = dirname(walk);
    if (parent === walk) return { state: "blocked", detail: `no folder above ${tilde(dir)} exists` };
    missing.unshift(walk);
    walk = parent;
  }
  installCleanup();
  const created = [];
  for (const folder of missing) {
    try {
      created.push(...makeFolderChain(folder));
    } catch (e) {
      const code = e.code ?? e.message;
      const kept = removeCreated(created);
      const why = code === "EEXIST"
        ? `something that is not a folder is at ${tilde(folder)}; move it, and this is not a policy problem`
        : `${tilde(dirname(folder))} would not take the new folder ${tilde(folder)} (${code})`;
      return { state: "blocked", detail: kept.length ? `${why}; ${tilde(kept[0])} was created and is still there` : why, code };
    }
  }
  const name = join(target, `.skilliton-preflight-${randomBytes(6).toString("hex")}`);
  let fd = null;
  try {
    PROBE_FILES.add(name);
    fd = openSync(name, "wx", 0o600);
    writeSync(fd, "skilliton preflight\n");
  } catch (e) {
    if (fd !== null) { try { closeSync(fd); } catch { /* the handle is going away with this process */ } }
    PROBE_FILES.delete(name);
    removeCreated(created);
    return { state: "blocked", detail: `${tilde(target)} could not be written (${e.code ?? e.message})` };
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* the handle is going away with this process */ } }
  }
  let removeFailed = null;
  try { unlinkSync(name); } catch (e) { removeFailed = e.code ?? e.message; }
  PROBE_FILES.delete(name);
  const kept = removeCreated(created);
  if (removeFailed) return { state: "blocked", detail: `${tilde(target)} took a new file, but it could not be removed again (${removeFailed}); remove ${tilde(name)} by hand` };
  // Every sentence names the folder that was tested, not a folder above it, because that is the folder IT is asked
  // about; and a folder that could not be taken away again is named as still there.
  const made = created.length ? `${tilde(target)} did not exist: it was created, written in, and ${kept.includes(target) ? "could not be removed again" : "removed again"}` : `${tilde(target)} took a new file`;
  const leftBehind = kept.filter((f) => f !== target);
  return { state: "ok", detail: leftBehind.length ? `${made}; ${leftBehind.map(tilde).join(", ")} ${leftBehind.length === 1 ? "is" : "are"} still there, because something else wrote in ${leftBehind.length === 1 ? "it" : "them"}` : made };
}

// Creates a folder and every folder above it that is missing, and returns the ones it made, deepest last, so they can
// be taken away again. Throws what mkdir throws.
function makeFolderChain(target) {
  const missing = [];
  let walk = target;
  while (!isDir(walk)) {
    const parent = dirname(walk);
    if (parent === walk) break;
    missing.unshift(walk);
    walk = parent;
  }
  const created = [];
  for (const folder of missing) {
    mkdirSync(folder, { mode: 0o700 });
    created.push(folder);
    PROBE_FOLDERS.push(folder);
  }
  return created;
}

// Removes the folders this check created, deepest first. Returns the ones it could not remove, which stay on the
// cleanup list in case the run is interrupted later.
function removeCreated(created) {
  const kept = [];
  for (const folder of [...created].reverse()) {
    try {
      rmdirSync(folder);
      const at = PROBE_FOLDERS.indexOf(folder);
      if (at >= 0) PROBE_FOLDERS.splice(at, 1);
    } catch { kept.push(folder); }
  }
  return kept;
}

function checkFolders(options = {}) {
  return folders(options).map((f) => {
    const r = probeFolder(f.path);
    return {
      ...state(tilde(f.path), "folders", r.state, r.detail, r.state === "ok" ? null : `Ask IT to allow this user to write ${tilde(f.path)} (docs/IT-ALLOWLIST.md section 2). Skilliton writes ${f.what}.`, f.need === "required" ? "setup" : "sessions"),
      need: f.need, what: f.what,
    };
  });
}

// ---------- the company repository ----------

const GITHUB_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// A value to print back in a refusal: never a credential someone pasted into it, and never so cautious that the
// person cannot read the mistake they made. Both halves matter, and both have been got wrong here before. A rule
// that hides anything long hides the repository URL they typed, and then the message says nothing; a rule that
// knows only the shapes seen so far prints the next one.
//
// The shapes: anything before an @ in a URL, any setting whose name reads like a credential, a token prefix, a
// base64 run, and a long unbroken run of letters and digits. The last one is what makes it work on a value nobody
// has seen before: a secret has no word breaks, while a name, a branch, a host and a path all break at their
// separators, so the rule reads runs rather than whole strings. That is why there is no "this looks like a path, so
// leave it alone" escape: a secret inside a path is still a secret.
// The token, key and signed-token forms are lib/secret-rules.mjs REDACTION_SHAPES; liveKeys is a key from one of the
// services that writes the environment into the key itself (rk_live_, sk_test_).
const { specificTokens: SPECIFIC_TOKENS, liveKeys: LIVE_KEYS, awsKeyIds: AWS_KEY_IDS, googleKeys: GOOGLE_KEYS, signedToken: A_SIGNED_TOKEN, credentials: CREDENTIALS } = REDACTION_SHAPES;
// Prefixes that are also ordinary words in a folder name (sk-inventory-rewrite, pat-experiments-2026). skilliton-audit: allow known-token-prefix folder names, the control this rule lets through
// The prefix alone says nothing, so what follows has to look like a secret rather than like words.
const WEAK_PREFIXES = /\b(sk|rk|pk|pat|key|token|secret|apikey)[_-][A-Za-z0-9_-]{8,}/gi;
// A base64 secret is one run even across the / that a path breaks at, so it is read before anything else. The + or
// the = padding is what tells it apart from a host and a path, which have neither.
const BASE64_SECRET = /(?<![A-Za-z0-9+/=])(?:[A-Za-z0-9+/]{16,}={1,2}|[A-Za-z0-9/]*\+[A-Za-z0-9+/]{23,}={0,2})(?![A-Za-z0-9+/=])/g;
// Twenty-four or more of the characters a token is made of, with nothing in between: the base64url alphabet, which
// is what most modern tokens use, so a hyphen or an underscore does not end the run the way a dot or a slash does.
// Whether such a run is a secret or a name is then decided by its shape, below.
const A_LONG_RUN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g;

// Does this run read as words and numbers, the way a person names a folder (a-clone-of-the-skills-repository-2026,
// ACMESkillsMarketplace2026), rather than as a secret? Separators split it into parts, and each part into chunks of
// letters and digits. A name has few chunks, at least one real word among them, and no chunk longer than a word or
// a year; a secret has many short chunks, or one long unbroken one, and no word in it at all. This is the whole
// difference between printing back what the person typed and printing back their credential.
function readsAsWords(run, { allowLongWords = true } = {}) {
  const parts = String(run).split(/[-_]/);
  if (parts.some((part) => !part)) return false; // a doubled or trailing separator is not how names are written
  let hasAWord = false;
  for (const part of parts) {
    // A long word is still a word: internationalization is twenty letters. Letters only, lower case only, at least
    // one letter outside the hexadecimal alphabet (which keeps deadbeefdeadbeef out of it), and no run of five
    // consonants, which is what a word does not have and what a token of random letters nearly always does. Not
    // allowed at all after a prefix that reads like a credential: there, what follows is judged on its own.
    if (allowLongWords && /^[a-z]{4,40}$/.test(part) && /[g-z]/.test(part) && !/[bcdfghjklmnpqrstvwxz]{5}/.test(part)) { hasAWord = true; continue; }
    const chunks = part.match(/[A-Z]{2,}(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? [];
    if (chunks.join("") !== part || chunks.length > 8) return false;
    // A number on its own (a date, a ticket) can be long; a number run together with letters is a year or a version
    // at most. acme-skills-backup-20260917 is a name; abcdef123456 is not.
    const digitsAllowed = /^\d+$/.test(part) ? 8 : 4;
    // A long stretch of upper-case letters AND digits together is not how a person writes a name
    // (INFRASTRUCTURE-MIGRATION-2026 breaks into words; ABCD1234EFGH5678IJKL9012 does not).
    if (part.length > 12 && !/[a-z]/.test(part) && /\d/.test(part)) return false;
    for (const chunk of chunks) {
      if (/^\d+$/.test(chunk)) { if (chunk.length > digitsAllowed) return false; continue; }
      if (chunk.length > 15) return false;
      if (chunk.length >= 4) hasAWord = true;
    }
  }
  return hasAWord;
}

export function redact(value) {
  return String(value)
    .replace(/\/\/[^/@\s]*@/g, "//<credentials removed>@")
    .replace(/([?&#][^=&\s]*(?:token|key|secret|pass|pat|auth|credential)[^=&\s]*=)[^&\s]+/gi, "$1<removed>")
    .replace(A_SIGNED_TOKEN, "<removed>")
    .replace(CREDENTIALS, "<removed>")
    .replace(SPECIFIC_TOKENS, "<removed>")
    .replace(LIVE_KEYS, (match) => (readsAsWords(match.replace(/^[A-Za-z]{2,4}_(live|test)_/, "")) ? match : "<removed>"))
    .replace(AWS_KEY_IDS, "<removed>")
    .replace(GOOGLE_KEYS, "<removed>")
    .replace(WEAK_PREFIXES, (match) => (readsAsWords(match.slice(match.search(/[_-]/) + 1), { allowLongWords: false }) ? match : "<removed>"))
    // Padding is a strong signal, but "a line that ends with sixteencharacters=" is not a secret: the run is read
    // for its shape like any other before it is taken out.
    .replace(BASE64_SECRET, (run) => (readsAsWords(run.replace(/=+$/, "")) ? run : "<removed>"))
    .replace(A_LONG_RUN, (run) => (readsAsWords(run) ? run : "<removed>"))
    .slice(0, 120);
}

// Asks the company's plugin repository for its branches. `marketplace` is <owner>/<repo> or a folder.
function checkRepository(marketplace) {
  if (!marketplace) return [state("the company repository", "repository", "not checked", "no marketplace was given, so nothing was contacted", "Pass --marketplace <owner>/<repo> to check that this machine can reach it.")];
  if (!GITHUB_REPO.test(marketplace)) {
    let folder = false;
    try { folder = isDir(marketplace); } catch (e) { refuse(`--marketplace ${redact(marketplace)} could not be read as a path (${e.code ?? e.message}). Give it as <owner>/<repo>, or as the path of a clone. Nothing was checked.`); }
    if (!folder) refuse(`--marketplace ${redact(marketplace)} is not <owner>/<repo> and is not a folder on this machine. Nothing was checked.`);
    const catalog = statOrNull(join(marketplace, ".claude-plugin", "marketplace.json"));
    return [catalog?.isFile()
      ? state(tilde(marketplace), "repository", "ok", "the folder holds a marketplace catalog; nothing is contacted for a folder source")
      : state(tilde(marketplace), "repository", "blocked", "the folder has no .claude-plugin/marketplace.json", "Point --marketplace at the company skills repository folder, or at <owner>/<repo>.", "setup")];
  }
  const url = `https://github.com/${marketplace}.git`;
  // Run it from a folder that is not a repository, and with the ext transport refused, so that a repository the
  // developer happens to be standing in cannot rewrite this address or hand git a command to run (its .git/config
  // travels with a copied folder, and url.<base>.insteadOf plus protocol.ext.allow is a known way in).
  // GIT_DIR points at an empty folder this check makes, so git never looks for a repository around the current one:
  // a copied working folder carries its own .git/config, and that file can rewrite an address
  // (url.<base>.insteadOf) and name a command to run for it (the ext transport, core.sshCommand, core.gitProxy).
  // The ext transport is refused as well, so a rewrite through it fails loudly instead of quietly.
  let empty;
  let madeTemp = [];
  try {
    // The folder check above creates a missing temporary folder and takes it away again, so make it once more here
    // rather than failing over a folder this machine has just shown it can create, and remember every folder made so
    // that all of them go again.
    installCleanup();
    madeTemp = makeFolderChain(tmpdir());
    empty = mkdtempSync(join(tmpdir(), "skilliton-preflight-git-"));
  } catch (e) {
    return [state(`github.com/${marketplace}`, "repository", "not checked", `the temporary folder ${tilde(tmpdir())} could not be used (${e.code ?? e.message}), and this check needs an empty folder there so that no repository's configuration is read`, `Set TMPDIR to a folder this user can write, then run the check again; the folders above say whether ${tilde(tmpdir())} can be written at all.`)];
  }
  let r;
  try {
    // pinHome: HOME chooses ~/.gitconfig, and ~/.gitconfig can rewrite this address and name a program to run for
    // it (core.sshCommand, core.askPass). This machine's own configuration is meant to apply, because the clone this
    // check is a promise about would use it too; a HOME put into the session's environment by a project's settings
    // file is not this machine's own, so the home comes from the system's record of this user instead.
    r = runGit(null, ["-c", "protocol.ext.allow=never", "ls-remote", "--heads", "--", url], {
      timeoutMs: LS_REMOTE_TIMEOUT_MS, cwd: empty, pinHome: true, extraEnv: { GIT_DIR: empty },
    });
  } finally {
    try { rmdirSync(empty); } catch { /* something else wrote in it */ }
    removeCreated(madeTemp);
  }
  // What this check did that the person cannot see from the line otherwise. All three are said out loud, because an
  // "ok" that went somewhere else, or a "blocked" for a configuration this check declined to read, is worse than no
  // answer at all.
  const pinned = realHome();
  const proxy = proxyInUse();
  const notes = [];
  if (pinned.problem) notes.push(`this machine's own git configuration could not be pinned (${pinned.problem}), so the HOME in this session chose it`);
  else if (pinned.home && process.env.HOME && process.env.HOME !== pinned.home) {
    notes.push(`this check read the git configuration in ${tilde(pinned.home)}, the home folder the system records for this user, and not the HOME set in this session (${tilde(process.env.HOME)}); a configuration you rely on that lives there was not used`);
  }
  // Named as set, not as used: whether git sends this address through that proxy is git's own decision (an http
  // proxy is not used for an https address, and NO_PROXY can exempt the host). A proxy set in this machine's own
  // git configuration is followed too and is not shown here, because this reads the environment and nothing else.
  if (proxy) notes.push(`${proxy.name} is set in this session (${proxy.where}), so an answer here may have come through that proxy rather than from github.com; a proxy set in this machine's own git configuration is not shown`);
  const noProxy = noProxyInUse();
  if (noProxy) notes.push(`${noProxy.name} is set in this session (${redact(noProxy.value)}), so some addresses go straight out, including past a proxy set in this machine's own configuration`);
  const unpinned = notes.length ? `; ${notes.join("; ")}` : "";
  if (r.ok) {
    const refs = r.stdout.split("\n").filter(Boolean).length;
    return [state(`github.com/${marketplace}`, "repository", "ok", `answered with ${refs} branch(es)${unpinned}`)];
  }
  // git's own reason, which is the last line that names a failure. Taking the first line instead gave whatever
  // happened to be printed first, and the line a person needs (a certificate, a proxy, a name that does not
  // resolve) is the one git ends with.
  const stderrLines = (r.stderr || r.failure || "").trim().split("\n").filter((l) => l.trim() && !/^remote:/.test(l));
  const named = stderrLines.filter((l) => /^(fatal|error|warning):/i.test(l.trim()));
  const message = (named.at(-1) ?? stderrLines[0])?.slice(0, 200) ?? r.failure;
  const action = r.notFound
    ? "Install git (docs/IT-ALLOWLIST.md section 1)."
    : /could not resolve host|couldn't resolve|name or service not known|temporary failure in name resolution/i.test(message) ? "Ask IT to allow this machine to reach github.com over HTTPS, or to name the proxy to use (docs/IT-ALLOWLIST.md section 4)."
      : /certificate|SSL|TLS|self.signed/i.test(message) ? "Ask IT for the company certificate authority for git (http.sslCAInfo or the system trust store; docs/IT-ALLOWLIST.md section 4)."
        : /could not read Username|terminal prompts disabled|authentication failed|403/i.test(message) ? "github.com answered, and it wants credentials: this is a private repository, so this machine needs its GitHub credentials (that path is not tested yet, docs/BACKLOG.md B31)."
          : /not found|repository does not exist/i.test(message) ? "github.com answered, so the network is fine, and it says there is no such repository: check the name, or, if it is private, that this machine has GitHub credentials for it."
            : /transport '[a-z]+' not allowed|protocol .*(not supported|not allowed)/i.test(message) ? "The folder this command ran in holds a Git configuration that rewrites github.com to something else. That is not a question for IT: run the check somewhere else, and read that folder's .git/config."
              : /timed out|connection refused|connection reset|failed to connect|could ?n[o']?t connect|network is unreachable|proxy|forbidden/i.test(message) ? "Ask IT whether this machine may reach github.com, and with which proxy (docs/IT-ALLOWLIST.md section 4)."
                : "Read the message above with whoever manages these laptops; docs/IT-ALLOWLIST.md section 4 lists what git needs.";
  return [state(`github.com/${marketplace}`, "repository", "blocked", `git ls-remote could not read it: ${message}${unpinned}`, action, "setup")];
}

// ---------- the report ----------

// Runs every check and returns { items, counts, blocking, exitCode }. `blocking` lists the items that stop join.
export async function runPreflight({ clients = ["claude", "codex"], marketplace, binDir, network = true, probe = PROBE, scope = "all" } = {}) {
  const items = [
    ...(await checkPrograms({ clients, probe })),
    ...checkFolders({ binDir, clients }),
    ...(network ? checkRepository(marketplace) : [state("the company repository", "repository", "not checked", "--no-network was given, so nothing was contacted")]),
  ];
  // One coding tool is enough, but only when one of them is really there: a machine with neither installed is exactly
  // the machine this check exists for, so it must not pass. Every item keeps one of the four states a reader is
  // promised (ok, blocked, missing, not checked); nothing is rewritten into a fifth.
  const clientOk = items.some((i) => i.need === "client" && i.state === "ok");
  if (clientOk) {
    for (const c of items.filter((i) => i.need === "client" && i.state !== "ok")) {
      c.state = "not checked";
      c.detail = `${c.detail}; the other coding tool is installed, so this one is only needed if your team uses it`;
      c.action = null;
    }
  }
  const blocking = items.filter((i) => isBlocking(i, { clientOk, scope }));
  const counts = { ok: 0, blocked: 0, missing: 0, "not checked": 0 };
  for (const i of items) {
    const key = i.state;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { items, counts, blocking, exitCode: blocking.length ? 1 : 0 };
}

// What stops setup: a required program or folder that is missing or blocked, the hook scripts themselves, the chosen
// client, and a repository that cannot be read. A "feature" item is reported, never blocking: the feature stops
// working, not the setup.
// `scope` "all" counts anything that would stop setup or a session; "setup" counts only what stops setup itself,
// which is what join refuses on: a hook program that is missing does not stop a machine being set up.
function isBlocking(item, { clientOk = false, scope = "all" } = {}) {
  if (item.state === "ok" || item.state === "not checked" || !item.blocks) return false;
  if (scope === "setup" && item.blocks !== "setup") return false;
  if (item.need === "client") return !clientOk;
  return true;
}

// The report as lines for a person. `wide` prints what each item is for.
export function reportLines(report, { wide = false } = {}) {
  const lines = [];
  const label = { programs: "programs", folders: "folders Skilliton writes", repository: "the company plugin repository" };
  for (const area of ["programs", "folders", "repository"]) {
    const items = report.items.filter((i) => i.area === area);
    if (!items.length) continue;
    lines.push(`${label[area]}:`);
    for (const i of items) {
      const mark = i.state === "ok" ? "OK" : i.state === "not checked" ? "SKIPPED" : i.state.toUpperCase();
      lines.push(`  ${mark.padEnd(8)} ${i.name}: ${i.detail}`);
      if (wide && i.what) lines.push(`           what it is for: ${i.what}`);
      if (i.action) lines.push(`           ${i.action}`);
    }
  }
  return lines;
}
