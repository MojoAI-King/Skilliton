// preflight.mjs: does this machine let Skilliton work? (docs/IT-ALLOWLIST.md, backlog B27)
//
// On a managed laptop the interesting failures are not bugs: a program the hooks need is not installed, endpoint
// security will not let a shell start it, a folder cannot be written, or the company's plugin repository cannot be
// reached. Those failures are quiet. A hook that cannot run prints a notice into a session nobody reads closely, and
// `join` fails half way through.
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

import { spawn, spawnSync } from "node:child_process";
import { accessSync, closeSync, constants as fsConstants, mkdirSync, mkdtempSync, openSync, rmdirSync, statSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { BACKUPS, PLUGIN_ROOT, isDir, refuse, statOrNull, tilde, which } from "./core.mjs";
import { runGit, trustDir } from "./trust.mjs";
import { joinDir } from "./join.mjs";
import { claudeConfigDir, codexHome } from "./verify.mjs";

export const PROBE = join(PLUGIN_ROOT, "runtime", "preflight", "probe.sh");
const LS_REMOTE_TIMEOUT_MS = 45000;
const MAX_OUTPUT = 4 * 1024 * 1024;
// How long to wait after killing a program's process group before answering anyway.
const AFTER_KILL_MS = 1500;
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
  { name: "cp", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "mktemp", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
  { name: "rm", by: "hook", need: "maintainer", what: "the scrub check's own self-test", blocks: null },
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
    const group = process.platform !== "win32";
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
      child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], detached: group, windowsHide: true });
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
export async function probeHookPrograms(names, { probe = PROBE, timeoutMs = 60000, platform = process.platform } = {}) {
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
export function unrunnableOnPath(name) {
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
export function findWindowsBash() {
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
export function probeClient(name, given) {
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
export async function probeRuntimeProgram(name, { timeoutMs = 20000 } = {}) {
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
export async function checkPrograms({ clients = [], platform = process.platform, probe = PROBE } = {}) {
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
export function folders({ binDir, clients = [] } = {}) {
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
export function probeFolder(dir) {
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
      mkdirSync(folder, { mode: 0o700 });
      created.push(folder);
      PROBE_FOLDERS.push(folder);
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

export function checkFolders(options = {}) {
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

// A value to print: never a credential someone pasted into a URL. The rules are about the shape of a secret, not
// about a list of the ones seen so far: anything before an @, any setting whose name reads like a credential, and any
// long run of the characters a token is made of.
export function redact(value) {
  return String(value)
    .replace(/\/\/[^/@\s]*@/g, "//<credentials removed>@")
    .replace(/([?&#][^=&\s]*(?:token|key|secret|pass|pat|auth|credential)[^=&\s]*=)[^&\s]+/gi, "$1<removed>")
    .replace(/\b[A-Za-z][A-Za-z0-9]{1,12}[_-][A-Za-z0-9_-]{16,}/g, "<removed>")
    .replace(/\b(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{20,}\b/g, "<removed>")
    .slice(0, 120);
}

// Asks the company's plugin repository for its branches. `marketplace` is <owner>/<repo> or a folder.
export function checkRepository(marketplace) {
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
  try {
    // The folder check above creates a missing temporary folder and takes it away again, so make it once more here
    // rather than failing over a folder this machine has just shown it can create.
    mkdirSync(tmpdir(), { recursive: true });
    empty = mkdtempSync(join(tmpdir(), "skilliton-preflight-git-"));
  } catch (e) {
    return [state(`github.com/${marketplace}`, "repository", "not checked", `the temporary folder ${tilde(tmpdir())} could not be used (${e.code ?? e.message}), and this check needs an empty folder there so that no repository's configuration is read`, `Set TMPDIR to a folder this user can write, then run the check again; the folders above say whether ${tilde(tmpdir())} can be written at all.`)];
  }
  let r;
  try {
    r = runGit(null, ["-c", "protocol.ext.allow=never", "ls-remote", "--heads", "--", url], {
      timeoutMs: LS_REMOTE_TIMEOUT_MS, cwd: empty, extraEnv: { GIT_DIR: empty },
    });
  } finally {
    try { rmdirSync(empty); } catch { /* something else wrote in it */ }
  }
  if (r.ok) {
    const refs = r.stdout.split("\n").filter(Boolean).length;
    return [state(`github.com/${marketplace}`, "repository", "ok", `answered with ${refs} branch(es)`)];
  }
  const message = (r.stderr || r.failure || "").trim().split("\n").filter((l) => !/^remote:/.test(l))[0]?.slice(0, 200) ?? r.failure;
  const action = r.notFound
    ? "Install git (docs/IT-ALLOWLIST.md section 1)."
    : /could not resolve host|couldn't resolve|name or service not known|temporary failure in name resolution/i.test(message) ? "Ask IT to allow this machine to reach github.com over HTTPS, or to name the proxy to use (docs/IT-ALLOWLIST.md section 4)."
      : /certificate|SSL|TLS|self.signed/i.test(message) ? "Ask IT for the company certificate authority for git (http.sslCAInfo or the system trust store; docs/IT-ALLOWLIST.md section 4)."
        : /could not read Username|terminal prompts disabled|authentication failed|403/i.test(message) ? "github.com answered, and it wants credentials: this is a private repository, so this machine needs its GitHub credentials (that path is not tested yet, docs/BACKLOG.md B31)."
          : /not found|repository does not exist/i.test(message) ? "github.com answered, so the network is fine, and it says there is no such repository: check the name, or, if it is private, that this machine has GitHub credentials for it."
            : /transport '[a-z]+' not allowed|protocol .*(not supported|not allowed)/i.test(message) ? "The folder this command ran in holds a Git configuration that rewrites github.com to something else. That is not a question for IT: run the check somewhere else, and read that folder's .git/config."
              : /timed out|connection refused|connection reset|failed to connect|could ?n[o']?t connect|network is unreachable|proxy|forbidden/i.test(message) ? "Ask IT whether this machine may reach github.com, and with which proxy (docs/IT-ALLOWLIST.md section 4)."
                : "Read the message above with whoever manages these laptops; docs/IT-ALLOWLIST.md section 4 lists what git needs.";
  return [state(`github.com/${marketplace}`, "repository", "blocked", `git ls-remote could not read it: ${message}`, action, "setup")];
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
export function isBlocking(item, { clientOk = false, scope = "all" } = {}) {
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
