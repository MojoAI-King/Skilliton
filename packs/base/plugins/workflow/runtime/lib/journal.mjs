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

// Variables that hand git settings, or a command to run, from outside any repository's own files: a configuration
// file of someone's choosing, settings passed straight in, a proxy or ssh command, a diff program. A project's own
// settings can reach a session's environment, so a git call that must not take a repository's word for anything does
// not take these either. The options Skilliton passes with -c beat them in any case (measured on git 2.51.1).
export const CONFIG_FROM_THE_ENVIRONMENT = [
  "GIT_CONFIG", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
  "GIT_PROXY_COMMAND", "GIT_SSH_COMMAND", "GIT_SSH", "GIT_ALLOW_PROTOCOL", "GIT_EXTERNAL_DIFF", "GIT_TEXTCONV", "GIT_EXEC_PATH",
];

// The environment for a git call that reads a repository but takes no settings from it or from around it. `keepConfig`
// is for the calls a person drives (release signing), where their own configuration is the point.
export function gitEnvironment({ keepConfig = false, optionalLocks = false } = {}) {
  const env = { ...process.env };
  if (!optionalLocks) env.GIT_OPTIONAL_LOCKS = "0";
  for (const name of REPOSITORY_OVERRIDES) delete env[name];
  if (keepConfig) return env;
  for (const name of CONFIG_FROM_THE_ENVIRONMENT) delete env[name];
  for (const name of Object.keys(env)) if (/^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name)) delete env[name];
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
