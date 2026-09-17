// preflight.mjs: does this machine let Skilliton work? (docs/IT-ALLOWLIST.md, backlog B27)
//
// On a managed laptop the interesting failures are not bugs: a program the hooks need is not installed, endpoint
// security will not let a shell start it, a folder cannot be written, or the company's plugin repository cannot be
// reached. Those failures are quiet. A hook that cannot run prints a notice into a session nobody reads closely, and
// `join` fails half way through.
//
// This runs the checks first, and changes nothing:
//   programs   every program in the allow list is looked for and started once, each from the same kind of parent that
//              starts it in a session: the ones hooks use are started by ../preflight/probe.sh, run by its path inside
//              the plugin (the way Claude Code runs a hook), and the ones the runtime starts are started here by node
//   folders    every folder Skilliton writes is tested by creating one small file in it and removing it again, because
//              a permission bit says nothing about what a security product will allow; a folder that does not exist yet
//              is tested through the nearest folder above it that does
//   repository the company's plugin repository is asked for its branch list with git ls-remote, with prompts turned
//              off, which is the one command in Skilliton that contacts a network and only when a marketplace is given
//
// Every check ends as ok, blocked, missing, or not checked, with what IT would have to allow. Nothing here decides
// whether a security product is "supported": it reports what this machine did, on this run.

import { spawnSync } from "node:child_process";
import { accessSync, closeSync, constants as fsConstants, openSync, statSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { BACKUPS, PLUGIN_ROOT, isDir, statOrNull, tilde, which } from "./core.mjs";
import { runGit, trustDir } from "./trust.mjs";
import { joinDir } from "./join.mjs";
import { claudeConfigDir, codexHome } from "./verify.mjs";

export const PROBE = join(PLUGIN_ROOT, "runtime", "preflight", "probe.sh");
const LS_REMOTE_TIMEOUT_MS = 45000;

// Every program docs/IT-ALLOWLIST.md section 1 names, what starts it, and what stops working without it.
//   by      "hook" a hook script starts it, so the probe script starts it here; "runtime" node starts it; "client" a
//           coding tool the developer runs
//   need    "required" Skilliton does not work without it; "feature" one part stops working; "reader" one of the JSON
//           readers, of which one is enough; "maintainer" only a company maintainer's own commands reach it
//   blocks  "setup" setting a machine up cannot finish without it; "sessions" setup finishes and something in a later
//           session does not work; null neither. bash is a "sessions" item: join writes files with node and drives the
//           coding tools, and it is the hooks and the launcher that need a shell afterwards.
export const PROGRAMS = [
  { name: "node", by: "runtime", need: "required", what: "every command, and every session hook", blocks: "setup" },
  { name: "bash", by: "runtime", need: "required", what: "every hook script and the terminal launcher", blocks: "sessions" },
  { name: "sh", by: "runtime", need: "required", what: "the shell Claude Code hands each hook command to, and the launcher join writes", blocks: "sessions" },
  { name: "env", by: "runtime", need: "required", what: "the first line of every hook script", blocks: "sessions" },
  { name: "git", by: "runtime", need: "required", what: "project state at session start, the secret check before a commit, and release verification", blocks: "setup" },
  { name: "ssh-keygen", by: "runtime", need: "required", what: "checking the signature on a company release, so verify can say VERIFIED", blocks: "setup" },
  { name: "jq", by: "hook", need: "reader", what: "reading what a hook is given", blocks: "sessions" },
  { name: "python3", by: "hook", need: "reader", what: "the same, when jq is missing", blocks: "sessions" },
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

// Runs the probe script by its path, the way a hook is run. Returns Map(name -> { state, exit, path, detail }), or
// { failed } when the script itself could not run, which is itself the finding.
export function probeHookPrograms(names, { probe = PROBE, timeoutMs = 60000 } = {}) {
  if (!names.length) return { results: new Map() };
  const r = spawnSync(probe, names, { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error || r.status !== 0) {
    const bash = spawnSync("bash", [probe, ...names], { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    const why = r.error ? `${r.error.code ?? r.error.message}` : `exit ${r.status}: ${(r.stderr ?? "").trim().slice(0, 200)}`;
    if (bash.error || bash.status !== 0) {
      return { failed: `${tilde(probe)} could not be run by its path (${why}), and bash could not run it either (${bash.error ? bash.error.code ?? bash.error.message : `exit ${bash.status}`}). Every Skilliton hook is a script in this folder, so nothing would run in a session.` };
    }
    return { failed: `${tilde(probe)} could not be run by its path (${why}), although bash could run it. Claude Code runs each hook by path, so the hooks would not run.`, results: parseProbe(bash.stdout) };
  }
  return { results: parseProbe(r.stdout) };
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
// "found but not allowed to run" would otherwise look the same, and they are different problems for IT.
export function unrunnableOnPath(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, name);
    let st;
    try { st = statSync(candidate); } catch { continue; }
    if (!st.isFile()) continue;
    try { accessSync(candidate, fsConstants.X_OK); } catch { return candidate; }
  }
  return null;
}

// A coding tool is never started here. Codex writes scratch files into its home folder on any invocation, even
// --version (docs/CLIENTS.md), and `join` promises that a preview and a repeat with nothing to do run no client at
// all. So the check is the file: is it on PATH, and may this user run it? A policy that lets the file be found but
// stops it starting is therefore not caught here; `skilliton doctor` asks Claude Code for its version, and a session
// shows it at once.
export function probeClient(name) {
  const path = which(name);
  if (path) return { state: "ok", exit: null, path, detail: "found; it is not started here, because starting a coding tool writes into its own folder" };
  const blocked = unrunnableOnPath(name);
  if (blocked) return { state: "blocked", exit: null, path: blocked, detail: "it is there, but this user may not run it" };
  return { state: "missing", exit: null, path: null, detail: "not found on PATH" };
}

// The programs node starts itself, checked the same way: found on PATH, then started once.
export function probeRuntimeProgram(name, { timeoutMs = 20000 } = {}) {
  const path = which(name);
  if (!path) return { state: "missing", exit: null, path: null, detail: "not found on PATH" };
  const r = spawnSync(path, ["--version"], { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
  const message = `${r.stderr ?? ""}`.trim().split("\n")[0]?.slice(0, 160) ?? "";
  if (r.error) {
    // The file was found and this user may run it, so a failure to start it is a block, whatever the code says: ENOENT
    // here means the file names an interpreter that is not there, or something refused the start between the two.
    const code = r.error.code ?? r.error.message;
    return { state: "blocked", exit: null, path, detail: `it was found, but starting it failed (${code})` };
  }
  if (r.status === 126) return { state: "blocked", exit: "126", path, detail: message || "permission denied" };
  if (/not permitted|permission denied|blocked/i.test(message)) return { state: "blocked", exit: String(r.status), path, detail: `it ran but said: ${message}` };
  return { state: "ok", exit: String(r.status), path, detail: (r.stdout ?? "").trim().split("\n")[0]?.slice(0, 80) ?? "" };
}

export function checkPrograms({ clients = [], platform = process.platform, probe = PROBE } = {}) {
  const wanted = PROGRAMS.filter((p) => (!p.platform || p.platform === platform) && (p.need !== "client" || clients.includes(p.name)));
  const hookPrograms = wanted.filter((p) => p.by === "hook").map((p) => p.name);
  const probed = probeHookPrograms(hookPrograms, { probe });
  const items = [];
  if (probed.failed) items.push(state("the hook scripts", "programs", "blocked", probed.failed, "Ask IT to allow bash and node to run scripts under the plugin cache folder (docs/IT-ALLOWLIST.md section 1, \"Plugin scripts move with each release\").", "sessions"));
  else items.push(state("the hook scripts", "programs", "ok", `${tilde(probe)} ran by its path, the way Claude Code runs a hook`));

  for (const p of wanted) {
    let result = p.by === "hook" ? (probed.results?.get(p.name) ?? { state: "not checked", detail: "the probe script did not report it" })
      : p.by === "client" ? probeClient(p.name)
        : probeRuntimeProgram(p.name);
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

// Writes one small file in `dir` and removes it again. Returns { state, detail }.
export function probeFolder(dir) {
  let existing = dir, missing = [];
  while (!isDir(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return { state: "blocked", detail: `no folder above ${tilde(dir)} exists` };
    missing.unshift(existing);
    existing = parent;
  }
  const name = join(existing, `.skilliton-preflight-${randomBytes(6).toString("hex")}`);
  let fd = null;
  try {
    fd = openSync(name, "wx", 0o600);
    writeSync(fd, "skilliton preflight\n");
    closeSync(fd);
    fd = null;
    unlinkSync(name);
  } catch (e) {
    if (fd !== null) { try { closeSync(fd); } catch { /* the handle is going away with this process */ } }
    try { unlinkSync(name); } catch { /* it was never created, or cannot be removed either */ }
    const code = e.code ?? e.message;
    return { state: "blocked", detail: `${tilde(existing)} could not be written (${code})`, code };
  }
  return {
    state: "ok",
    detail: missing.length ? `${tilde(existing)} takes a new file, and ${tilde(missing[0])} will be created` : `${tilde(existing)} takes a new file`,
  };
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

// Asks the company's plugin repository for its branches. `marketplace` is <owner>/<repo> or a folder.
export function checkRepository(marketplace) {
  if (!marketplace) return [state("the company repository", "repository", "not checked", "no marketplace was given, so nothing was contacted", "Pass --marketplace <owner>/<repo> to check that this machine can reach it.")];
  if (!GITHUB_REPO.test(marketplace)) {
    if (isDir(marketplace)) {
      const catalog = statOrNull(join(marketplace, ".claude-plugin", "marketplace.json"));
      return [catalog?.isFile()
        ? state(tilde(marketplace), "repository", "ok", "the folder holds a marketplace catalog; nothing is contacted for a folder source")
        : state(tilde(marketplace), "repository", "blocked", "the folder has no .claude-plugin/marketplace.json", "Point --marketplace at the company skills repository folder, or at <owner>/<repo>.", "setup")];
    }
    return [state(String(marketplace).slice(0, 80), "repository", "blocked", "not <owner>/<repo> and not a folder on this machine", "Give the marketplace as <owner>/<repo>, or as the path of a clone.", "setup")];
  }
  const url = `https://github.com/${marketplace}.git`;
  const r = runGit(null, ["ls-remote", "--heads", "--", url], { timeoutMs: LS_REMOTE_TIMEOUT_MS });
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
            : /timed out|connection refused|connection reset|failed to connect|could ?n[o']?t connect|network is unreachable|proxy|forbidden/i.test(message) ? "Ask IT whether this machine may reach github.com, and with which proxy (docs/IT-ALLOWLIST.md section 4)."
              : "Read the message above with whoever manages these laptops; docs/IT-ALLOWLIST.md section 4 lists what git needs.";
  return [state(`github.com/${marketplace}`, "repository", "blocked", `git ls-remote could not read it: ${message}`, action, "setup")];
}

// ---------- the report ----------

// Runs every check and returns { items, counts, blocking, exitCode }. `blocking` lists the items that stop join.
export function runPreflight({ clients = ["claude", "codex"], marketplace, binDir, network = true, probe = PROBE, scope = "all" } = {}) {
  const items = [
    ...checkPrograms({ clients, probe }),
    ...checkFolders({ binDir, clients }),
    ...(network ? checkRepository(marketplace) : [state("the company repository", "repository", "not checked", "--no-network was given, so nothing was contacted")]),
  ];
  // One JSON reader is enough, and one coding tool is enough unless the caller asked for a particular one.
  const readerOk = items.some((i) => i.need === "reader" && i.state === "ok");
  for (const r of items.filter((i) => i.need === "reader" && i.state !== "ok" && readerOk)) { r.state = "ok (another reader is there)"; r.action = null; }
  const clientOk = items.some((i) => i.need === "client" && i.state === "ok");
  if (clients.length > 1 && clientOk) {
    for (const c of items.filter((i) => i.need === "client" && i.state !== "ok")) {
      c.state = "not checked";
      c.detail = `${c.detail}; the other coding tool is installed, so this one is only needed if your team uses it`;
      c.action = null;
    }
  }
  const blocking = items.filter((i) => isBlocking(i, { readerOk, clientOk: clientOk || clients.length > 1, scope }));
  const counts = { ok: 0, blocked: 0, missing: 0, "not checked": 0 };
  for (const i of items) {
    const key = i.state.startsWith("ok") ? "ok" : i.state;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { items, counts, blocking, exitCode: blocking.length ? 1 : 0 };
}

// What stops setup: a required program or folder that is missing or blocked, the hook scripts themselves, the chosen
// client, and a repository that cannot be read. A "feature" item is reported, never blocking: the feature stops
// working, not the setup.
// `scope` "all" counts anything that would stop setup or a session; "setup" counts only what stops setup itself,
// which is what join refuses on: a hook program that is missing does not stop a machine being set up.
export function isBlocking(item, { readerOk = false, clientOk = false, scope = "all" } = {}) {
  if (item.state.startsWith("ok") || item.state === "not checked" || !item.blocks) return false;
  if (scope === "setup" && item.blocks !== "setup") return false;
  if (item.need === "reader") return !readerOk;
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
      const mark = i.state.startsWith("ok") ? "OK" : i.state === "not checked" ? "SKIPPED" : i.state.toUpperCase();
      lines.push(`  ${mark.padEnd(8)} ${i.name}: ${i.detail}`);
      if (wide && i.what) lines.push(`           what it is for: ${i.what}`);
      if (i.action) lines.push(`           ${i.action}`);
    }
  }
  return lines;
}
