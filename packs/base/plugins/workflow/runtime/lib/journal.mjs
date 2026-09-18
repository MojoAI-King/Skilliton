// journal.mjs: the local lifecycle journal and the mechanical Git state it records. docs/CONTRACTS.md sections 9 and 11.
//
// The journal is <git rev-parse --absolute-git-dir>/skilliton/journal.jsonl: one JSON object per line, append-only,
// never tracked. Each Git worktree has its own git dir, so each worktree has its own journal.
//
// Events: { "at": ISO, "event": one of JOURNAL_EVENTS, "session": id | null, "branch", "head", "dirty": n,
// "fingerprint": sha256 }. A few optional extra keys (task, source, trigger, reason, git) may follow; readers ignore
// keys they do not know.
//
// Fingerprint: sha256 of the HEAD commit id, a newline, and the exact output of `git status --porcelain=v1 -uall`.
// It changes when the set of changed paths or their status codes change, or when HEAD moves. It does not change when
// a file that is already modified is edited again, because porcelain output does not carry content.
//
// A corrupt line (not JSON, not an event, or cut short by a crash) is counted and reported, never a crash.
// Nothing here imports from outside the plugin folder.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const JOURNAL_EVENTS = ["session-start", "session-end", "pre-compact", "stop", "checkpoint", "stop-reminded"];
const BASE_KEYS = ["at", "event", "session", "branch", "head", "dirty", "fingerprint"];
const MAX_READ_BYTES = 8 * 1024 * 1024;
const MAX_EXTRA_LENGTH = 200;

// kind: "missing" (git is not installed), "not-a-repository", "timeout", or "failed".
export class GitError extends Error {
  constructor(message, kind = "failed") { super(message); this.kind = kind; }
}


// Options that stop a repository's own configuration from making git start a program. A repository is data, and a
// copied working folder carries its .git/config with it: core.fsmonitor names a program git runs during an ordinary
// status (measured), so every git call Skilliton makes turns it off (backlog B33).
export const NO_REPOSITORY_PROGRAMS = ["-c", "core.fsmonitor=false"];

// Variables that would point git at a different repository than the one named with -C.
export const REPOSITORY_OVERRIDES = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE", "GIT_COMMON_DIR", "GIT_PREFIX"];

// Variables that hand git a configuration of someone else's choosing, or a command to run: a configuration file,
// settings passed in as values, a proxy or ssh command, a diff program, another set of git programs. A prepared
// project's own settings file can put variables into a session's environment, so for a git call that must not take a
// repository's word for anything, these come from the repository as surely as .git/config does. The options Skilliton
// passes with -c beat them in any case (measured on git 2.51.1).
//
// Removing GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM does not leave git with no configuration: it leaves git with the
// machine's own, ~/.gitconfig and /etc/gitconfig. That is deliberate and it is the second time this line has been
// argued, so the reasoning is written here. The reachability check answers "can this machine reach the company
// repository, set up as it is", which needs the proxy and the certificate that live in exactly those files; pointing
// GIT_CONFIG_GLOBAL at /dev/null instead would report a company machine as blocked when its git works, and /dev/null
// is not a path git can be given on Windows. What the machine's own configuration says, Skilliton follows, because
// the clone this check is a promise about would follow it too. What a repository says, through its own .git/config or
// through the environment, Skilliton refuses. A caller that wants a git call with no user configuration at all sets
// HOME (and XDG_CONFIG_HOME) to a folder of its own, which is how this repository's tests isolate themselves.
export const CONFIG_FROM_THE_ENVIRONMENT = [
  "GIT_CONFIG", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
  "GIT_PROXY_COMMAND", "GIT_SSH_COMMAND", "GIT_SSH", "GIT_ALLOW_PROTOCOL", "GIT_EXTERNAL_DIFF", "GIT_TEXTCONV", "GIT_EXEC_PATH",
  // Programs git runs for a person: the one it asks for a password with (tried before any terminal prompt, so
  // GIT_TERMINAL_PROMPT=0 does not cover it), the editor, the pager, and the folder it copies hooks from into a new
  // repository. None of them has any business being chosen from outside on a call nobody is sitting in front of.
  "GIT_ASKPASS", "SSH_ASKPASS", "SSH_ASKPASS_REQUIRE", "GIT_EDITOR", "GIT_SEQUENCE_EDITOR", "GIT_PAGER", "GIT_TEMPLATE_DIR",
  // Variables that decide whether the certificate on the other end is checked, and against what. A check whose whole
  // purpose is to say "this machine can reach the company repository" must not be the thing that stops looking at
  // who answered: with these, a server on this machine can answer as github.com and the check reports it as ok.
  // A company's own certificate authority still applies through the machine's git configuration (http.sslCAInfo) or
  // the system trust store, which is where docs/IT-ALLOWLIST.md section 4 already says it belongs.
  "GIT_SSL_NO_VERIFY", "GIT_SSL_CAINFO", "GIT_SSL_CAPATH", "GIT_SSL_CERT", "GIT_SSL_KEY", "GIT_SSL_VERSION", "GIT_SSL_CIPHER_LIST",
  // Switching off the machine's own system configuration is the same act as redirecting it: /etc/gitconfig is where
  // a company keeps the proxy and the certificate authority this tool promises to follow, so a project that can
  // turn it off can make a working machine report itself as blocked.
  "GIT_CONFIG_NOSYSTEM", "GIT_ATTR_NOSYSTEM",
  // What git prints on its error stream, which is what a check reads to say WHY something is blocked. A trace puts
  // its own lines there, and the certificate error a person needs to see is no longer the one they are shown.
  "GIT_CURL_VERBOSE", "GIT_REDIRECT_STDERR", "GIT_REDIRECT_STDOUT",
];

// The proxy a connection would go through, as the environment names it. It is kept, because a company machine sets
// exactly these and the check exists to answer "does this machine reach it, set up as it is". Keeping it means the
// answer can be true of a proxy rather than of github.com, so the check says which proxy it went through instead of
// leaving that out of the line.
export const PROXY_VARIABLES = ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"];
export function proxyInUse(env = process.env) {
  for (const name of PROXY_VARIABLES) if (env[name]) return { name, value: env[name], where: proxyAddress(env[name]) };
  return null;
}

// A proxy address with any credentials in it left out: a proxy is often written user:password@host, with or without
// a scheme (curl and git accept both), and this value is printed in a line the tool tells the person to hand to
// whoever manages their machines. Only the scheme, the host and the port are ever shown.
export function proxyAddress(value) {
  const text = String(value).trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1];
  try {
    const url = new URL(scheme ? text : `http://${text}`);
    if (!url.host) return "an address that could not be read";
    return scheme ? `${scheme}://${url.host}` : url.host;
  } catch { return "an address that could not be read"; }
}

// This user's own home folder as the system knows it, rather than as the environment says. HOME chooses
// ~/.gitconfig, and ~/.gitconfig can name a program for git to run (core.sshCommand, core.askPass, gpg.program), so
// on a call that reaches a network, HOME is as powerful as GIT_CONFIG_GLOBAL and has to be settled the same way.
// os.userInfo() reads the system's own record for this user and ignores HOME. It throws where the system has no
// record (a container started with a user id that is in no passwd file), and then the caller is told rather than
// left believing something was pinned.
export function realHome() {
  try {
    const home = userInfo().homedir;
    return home ? { home, problem: null } : { home: null, problem: "the system has no home folder recorded for this user" };
  } catch (e) {
    return { home: null, problem: `the system has no record for this user (${e.code ?? e.message})` };
  }
}

// The environment for a git call that reads a repository but takes no settings from it or from around it.
//   keepConfig   for the calls a person drives (release signing), where their own configuration is the point
//   pinHome      for a call that reaches a network: HOME and the Windows profile folder are set from the system's own
//                record of this user, and XDG_CONFIG_HOME is dropped, so the configuration that applies is this
//                machine's own and not one a prepared project's settings file put in the environment. It is not the
//                default, because every other call is a local read where the same pinning would only make what a
//                test measures depend on the machine it runs on
export function gitEnvironment({ keepConfig = false, optionalLocks = false, pinHome = false, home = null } = {}) {
  const env = { ...process.env };
  if (!optionalLocks) env.GIT_OPTIONAL_LOCKS = "0";
  for (const name of REPOSITORY_OVERRIDES) delete env[name];
  if (keepConfig) return env;
  for (const name of CONFIG_FROM_THE_ENVIRONMENT) delete env[name];
  for (const name of Object.keys(env)) if (/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name) || /^GIT_TRACE/.test(name)) delete env[name];
  if (pinHome) {
    // `home` is for a caller that knows which home it means (a test, so that what it measures does not depend on the
    // machine it runs on). It is an argument and never a variable, because a variable is exactly what pinning is
    // there to refuse.
    const pinned = home ?? realHome().home;
    if (pinned) { env.HOME = pinned; env.USERPROFILE = pinned; delete env.XDG_CONFIG_HOME; }
  }
  return env;
}

// Runs git in a folder. Returns { status, stdout, stderr }. Throws GitError only when git could not run at all or
// timed out; a non-zero exit is returned for the caller to judge. --no-optional-locks keeps `git status` from
// refreshing the index while a person's own git command may hold its lock.
export function runGit(dir, args, { timeoutMs = 15000 } = {}) {
  const env = gitEnvironment();
  const r = spawnSync("git", ["-C", dir, "--no-optional-locks", ...NO_REPOSITORY_PROGRAMS, ...args], {
    encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], env,
  });
  if (r.error) {
    if (r.error.code === "ENOENT") throw new GitError("git was not found on PATH", "missing");
    if (r.error.code === "ETIMEDOUT") throw new GitError(`git ${args[0]} timed out after ${timeoutMs} ms`, "timeout");
    throw new GitError(`git ${args[0]} could not run (${r.error.code ?? r.error.message})`);
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const firstLine = (text) => String(text).trim().split("\n")[0];

// The top-level folder of the work tree that contains dir, or null when dir is not inside one (including a
// folder that does not exist). Throws GitError when git itself cannot run.
export function gitTopLevel(dir) {
  const r = runGit(dir, ["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) return null;
  const top = r.stdout.replace(/\r?\n$/, "");
  return top && isAbsolute(top) ? resolve(top) : null;
}

// The absolute git dir of the work tree at root: <repo>/.git, or <repo>/.git/worktrees/<name> for a linked worktree.
export function gitDir(root) {
  const r = runGit(root, ["rev-parse", "--absolute-git-dir"]);
  const dir = r.stdout.replace(/\r?\n$/, "");
  if (r.status !== 0 || !dir || !isAbsolute(dir)) throw new GitError(`git rev-parse --absolute-git-dir failed in ${root}: ${firstLine(r.stderr) || `exit ${r.status}`}`, r.status === 128 ? "not-a-repository" : "failed");
  return dir;
}

// The checked-out branch, or null when HEAD is detached.
export function readBranch(root) {
  const r = runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (r.status === 0) return r.stdout.replace(/\r?\n$/, "") || null;
  if (r.status === 1) return null;
  throw new GitError(`git symbolic-ref failed in ${root}: ${firstLine(r.stderr) || `exit ${r.status}`}`);
}

export const journalPath = (root) => join(gitDir(root), "skilliton", "journal.jsonl");
export const backupRoot = (root) => join(gitDir(root), "skilliton-backups");

export const fingerprintOf = (head, porcelain) => createHash("sha256").update(`${head ?? ""}\n${porcelain}`, "utf8").digest("hex");

// The mechanical Git state of the work tree at root:
//   { branch: name | null (detached), head: full commit id | null (no commits yet), shortHead, porcelain,
//     dirty: number of changed paths, fingerprint, statusProblem: null | text }
// With tolerateStatusTimeout, a `git status` that times out gives dirty and fingerprint null and says so in
// statusProblem, so a hook with a small time budget can still record the event.
export function readGitState(root, { statusTimeoutMs = 60000, tolerateStatusTimeout = false, shortHead = false } = {}) {
  const branch = readBranch(root);

  const headRun = runGit(root, ["rev-parse", "-q", "--verify", "HEAD^{commit}"]);
  const head = headRun.status === 0 ? headRun.stdout.trim() || null : null;
  let short = null;
  if (head && shortHead) {
    const s = runGit(root, ["rev-parse", "--short", head]);
    short = s.status === 0 ? s.stdout.trim() : head.slice(0, 7);
  }

  let porcelain = null, statusProblem = null;
  try {
    const st = runGit(root, ["status", "--porcelain=v1", "-uall"], { timeoutMs: statusTimeoutMs });
    if (st.status !== 0) throw new GitError(`git status failed in ${root}: ${firstLine(st.stderr) || `exit ${st.status}`}`);
    porcelain = st.stdout;
  } catch (e) {
    if (!(e instanceof GitError && e.kind === "timeout" && tolerateStatusTimeout)) throw e;
    statusProblem = e.message;
  }
  const dirty = porcelain === null ? null : porcelain.split("\n").filter((line) => line.length > 0).length;
  return {
    branch, head, shortHead: head ? (short ?? head.slice(0, 7)) : null, porcelain, dirty,
    fingerprint: porcelain === null ? null : fingerprintOf(head, porcelain), statusProblem,
  };
}

// Changed paths from `git status --porcelain=v1 -uall -z`: [{ code, path }], where path is the current path (the
// destination of a rename or copy).
export function changedPaths(root) {
  const r = runGit(root, ["status", "--porcelain=v1", "-uall", "-z"]);
  if (r.status !== 0) throw new GitError(`git status failed in ${root}: ${firstLine(r.stderr) || `exit ${r.status}`}`);
  const fields = r.stdout.split("\0");
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    out.push({ code, path: field.slice(3) });
    if (/[RC]/.test(code)) i++; // a rename or copy: the source path follows as its own field
  }
  return out;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function validEvent(e) {
  return isObject(e) && typeof e.at === "string" && !Number.isNaN(Date.parse(e.at)) && JOURNAL_EVENTS.includes(e.event)
    && (e.session === undefined || e.session === null || typeof e.session === "string")
    && (e.fingerprint === undefined || e.fingerprint === null || typeof e.fingerprint === "string");
}

// Appends one event. Fields the caller leaves out are filled from the Git state (read now, or passed as
// options.state). Returns { path, record }. Throws when the journal cannot be written.
export function appendEvent(root, event, { state = null } = {}) {
  if (!isObject(event) || !JOURNAL_EVENTS.includes(event.event)) throw new Error(`appendEvent: unknown journal event ${JSON.stringify(event?.event)}`);
  const s = state ?? readGitState(root);
  const record = {
    at: typeof event.at === "string" ? event.at : new Date().toISOString(),
    event: event.event,
    session: typeof event.session === "string" ? event.session : null,
    branch: event.branch !== undefined ? event.branch : s.branch,
    head: event.head !== undefined ? event.head : s.head,
    dirty: event.dirty !== undefined ? event.dirty : s.dirty,
    fingerprint: event.fingerprint !== undefined ? event.fingerprint : s.fingerprint,
  };
  for (const [key, value] of Object.entries(event)) {
    if (BASE_KEYS.includes(key) || value === undefined) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") record[key] = value;
    else if (typeof value === "string") record[key] = value.length > MAX_EXTRA_LENGTH ? value.slice(0, MAX_EXTRA_LENGTH) : value;
  }
  if (s.statusProblem && record.git === undefined) record.git = s.statusProblem;
  const path = journalPath(root);
  try {
    mkdirSync(dirname(path), { recursive: true });
    // A line cut short by a crash would swallow this event; start on a fresh line instead.
    let prefix = "";
    let fd = null;
    try {
      fd = openSync(path, "r");
      const size = fstatSync(fd).size;
      if (size > 0) {
        const last = Buffer.alloc(1);
        readSync(fd, last, 0, 1, size - 1);
        if (last[0] !== 0x0a) prefix = "\n";
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    } finally {
      if (fd !== null) closeSync(fd);
    }
    appendFileSync(path, `${prefix}${JSON.stringify(record)}\n`);
  } catch (e) {
    throw new Error(`the journal ${path} could not be written (${e.code ?? e.message})`);
  }
  return { path, record };
}

// Reads the journal: { path, exists, events (file order), corrupt: number of lines that are not events,
// truncated: true when only the last MAX_READ_BYTES were read }. Throws when the file exists but cannot be read.
export function readJournal(root) {
  const path = journalPath(root);
  let fd = null, text;
  let truncated = false;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const length = Math.min(size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const n = readSync(fd, buffer, read, length - read, size - length + read);
      if (n === 0) break;
      read += n;
    }
    truncated = size > MAX_READ_BYTES;
    text = buffer.subarray(0, read).toString("utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { path, exists: false, events: [], corrupt: 0, truncated: false };
    throw new Error(`the journal ${path} could not be read (${e.code ?? e.message})`);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  const lines = text.split("\n");
  if (truncated) lines.shift(); // the first line of a tail read starts mid-line; it is not corruption
  const events = [];
  let corrupt = 0;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch { corrupt++; continue; }
    if (validEvent(parsed)) events.push(parsed); else corrupt++;
  }
  return { path, exists: true, events, corrupt, truncated };
}

// The last n events in file order (oldest first). The array also carries `corrupt` (corrupt lines in the part of the
// journal that was read), `path`, `exists` and `truncated`, so a caller can report corruption without a second read.
export function lastEvents(root, n = 50) {
  const journal = readJournal(root);
  const count = Number.isInteger(n) && n > 0 ? n : 0;
  const events = count ? journal.events.slice(-count) : [];
  events.corrupt = journal.corrupt;
  events.path = journal.path;
  events.exists = journal.exists;
  events.truncated = journal.truncated;
  return events;
}
