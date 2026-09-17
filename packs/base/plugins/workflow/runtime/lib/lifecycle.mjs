// lifecycle.mjs: where a project stands, for `skillgate status` and the lifecycle hooks; the Stop reminder rule;
// handoff freshness; session history. docs/CONTRACTS.md sections 9, 10 and 11.
//
// Every piece of project state is a check { name, status, summary, data }. status is one of:
//   ok         evaluated, nothing to do
//   attention  evaluated, and it needs action (status exits 1)
//   note       evaluated, worth reading, not an action
//   not-run    could not be evaluated in this build or setup (named, never counted as ok)
//   failed     the evaluation itself broke (status exits 3)
//
// Functions owned by other lanes (migrations.mjs migrationState, security.mjs securitySummary) are imported
// dynamically, and reported as "not available in this build" when the module or export is missing.
// Nothing here imports from outside the plugin folder.

import { existsSync, lstatSync, closeSync, openSync, readSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError, DEFAULTS, LAYOUT_VERSION, ROLES, resolveProject } from "./config.mjs";
import { PLUGIN_ROOT, Refused, cmpVersion, readPluginVersion, selfCommand, tilde } from "./core.mjs";
import { GitError, changedPaths, gitTopLevel, readGitState, readJournal, runGit } from "./journal.mjs";
import { TaskChangedError, TaskRecordError, gitLine, listTasks, pickCurrent } from "./tasks.mjs";

export const RESULT_SCHEMA = "skillgate.result/1";
export const RESULTS = { 0: "complete", 1: "attention", 2: "invalid", 3: "operation-failed" };

// A Git or file system operation failed (exit 3), as opposed to invalid input (Refused, exit 2).
export class OperationFailed extends Error {}

const flat = (text) => String(text ?? "").replace(/\s*\n\s*/g, " ").trim();
export const clip = (text, max = 200) => {
  if (text === null || text === undefined) return "not recorded";
  const value = flat(text);
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

// ---------- opening a project (commands) ----------

// { root, project } for a command run in dirOption (or the current folder). Refused when the folder is missing, not
// inside a Git work tree, or the configuration is invalid; OperationFailed when the configuration cannot be read.
export function openProject(dirOption) {
  const dir = resolve(dirOption ?? process.cwd());
  let isDirectory = false;
  try { isDirectory = statSync(dir).isDirectory(); } catch { isDirectory = false; }
  if (!isDirectory) throw new Refused(`${dirOption !== undefined ? "--dir " : ""}${tilde(dir)} is not an existing folder`);
  const root = gitTopLevel(dir);
  if (!root) throw new Refused(`${tilde(dir)} is not inside a Git repository; tasks, checkpoints and status read the branch, the commit and the working tree from Git`);
  try {
    return { root, project: resolveProject(root) };
  } catch (e) {
    if (e instanceof ConfigError) {
      if (e.kind === "failed") throw new OperationFailed(e.message);
      throw new Refused(e.message);
    }
    throw e;
  }
}

// Runs a command body and maps the engines' failure types onto the exit contract: invalid data and refused writes
// become Refused (exit 2, printed by skillgate.mjs); Git and file system failures print one "operation failed" line
// and return 3. Anything else is a bug and propagates.
export async function guardCommand(command, body) {
  try {
    return await body();
  } catch (e) {
    if (e instanceof ConfigError) {
      if (e.kind !== "failed") throw new Refused(e.message);
      console.error(`skillgate ${command}: operation failed: ${flat(e.message)}`);
      return 3;
    }
    if (e instanceof TaskRecordError || e instanceof TaskChangedError) throw new Refused(e.message);
    if (e instanceof GitError || e instanceof OperationFailed || (typeof e?.code === "string" && /^E[A-Z]+$/.test(e.code))) {
      console.error(`skillgate ${command}: operation failed: ${flat(e.message)}`);
      return 3;
    }
    throw e;
  }
}

// ---------- optional modules from other lanes ----------

export async function loadOptional(file, exportName) {
  const url = new URL(`./${file}`, import.meta.url);
  if (!existsSync(fileURLToPath(url))) return { available: false, failed: false, reason: `not available in this build (runtime/lib/${file} is not present)` };
  let mod;
  try { mod = await import(url.href); } catch (e) {
    return { available: false, failed: true, reason: `runtime/lib/${file} is present but could not be loaded (${clip(e.message)})` };
  }
  if (typeof mod[exportName] !== "function") return { available: false, failed: false, reason: `not available in this build (runtime/lib/${file} has no ${exportName} export)` };
  return { available: true, fn: mod[exportName] };
}

// ---------- the handoff record's Written line ----------

// US zone abbreviations that commonly appear in handoffs, plus UTC. Anything else is refused rather than guessed.
const ZONES = { Z: 0, UTC: 0, GMT: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };

// Parses a Written value such as "2026-09-16 14:41 EDT", "2026-09-16T18:41:00Z" or "2026-09-16 14:41" (the local time
// of this machine). { ok: true, at, end, resolutionMs } where end is the last instant the value can mean (a value
// without seconds covers its whole minute), or { ok: false, reason }.
export function parseWritten(raw) {
  const text = flat(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?[ \t]*(Z|[A-Za-z]{2,5}|[+-]\d{2}:?\d{2})?$/.exec(text);
  if (!m) return { ok: false, reason: `"${clip(text, 80)}" is not a date and time (for example 2026-09-16 14:41 EDT, or 2026-09-16T18:41:00Z)` };
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  const Y = Number(y), M = Number(mo), D = Number(d);
  const H = h === undefined ? 0 : Number(h), MI = mi === undefined ? 0 : Number(mi), S = s === undefined ? 0 : Number(s);
  const MS = frac === undefined ? 0 : Math.floor(Number(`0.${frac}`) * 1000);
  const outOfRange = { ok: false, reason: `"${text}" is not a real date and time` };
  if (M < 1 || M > 12 || D < 1 || D > 31 || H > 23 || MI > 59 || S > 59) return outOfRange;
  const probe = new Date(Date.UTC(Y, M - 1, D));
  if (probe.getUTCMonth() !== M - 1 || probe.getUTCDate() !== D) return outOfRange;
  const resolutionMs = h === undefined ? 86400000 : s === undefined ? 60000 : frac === undefined ? 1000 : 1;
  let ms;
  if (zone === undefined) {
    ms = new Date(Y, M - 1, D, H, MI, S, MS).getTime();
  } else if (/^[+-]/.test(zone)) {
    const digits = zone.replace(":", "");
    const offset = (digits[0] === "-" ? -1 : 1) * (Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5)));
    ms = Date.UTC(Y, M - 1, D, H, MI, S, MS) - offset * 60000;
  } else if (Object.prototype.hasOwnProperty.call(ZONES, zone.toUpperCase())) {
    ms = Date.UTC(Y, M - 1, D, H, MI, S, MS) - ZONES[zone.toUpperCase()] * 60000;
  } else {
    return { ok: false, reason: `the time zone "${zone}" is not one Skilliton reads (use UTC, an offset such as +02:00, or one of ${Object.keys(ZONES).filter((z) => z !== "Z").join(", ")})` };
  }
  return { ok: true, at: new Date(ms), end: new Date(ms + resolutionMs - 1), resolutionMs };
}

// { exists, section, written (raw text or null) }. Reads at most the first MB: "## RESUME HERE" is near the top.
export function readHandoffRecord(root, rel) {
  const path = join(root, rel);
  let st;
  try { st = lstatSync(path); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return { exists: false, section: false, written: null };
    throw e;
  }
  if (!st.isFile()) return { exists: false, section: false, written: null };
  const fd = openSync(path, "r");
  let text;
  try {
    const buffer = Buffer.alloc(Math.min(st.size, 1024 * 1024));
    const n = readSync(fd, buffer, 0, buffer.length, 0);
    text = buffer.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("## RESUME HERE"));
  if (start < 0) return { exists: true, section: false, written: null };
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) {
    const m = /^\s*(?:[-*]\s+)?(?:\*\*)?Written:(?:\*\*)?\s*(.*?)\s*$/.exec(lines[i]);
    if (m) return { exists: true, section: true, written: m[1] };
  }
  return { exists: true, section: true, written: null };
}

// ---------- session history ----------

// An interrupted session is a session-start with no later session-end for the same session id.
// With currentSession (a hook knows its own id): previous is the latest session-start of another session.
// Without it (status cannot know which session it runs in): latest is the newest session-start, reported as ended or
// not ended; previous is the newest session-start of another session before it. Only previous can be called
// interrupted, because a later session started after it.
export function sessionHistory(events, { currentSession } = {}) {
  const starts = [];
  events.forEach((e, i) => { if (e.event === "session-start") starts.push({ e, i }); });
  const idOf = (s) => s.e.session ?? null;
  const ended = (s) => events.some((e, i) => i > s.i && e.event === "session-end" && (e.session ?? null) === idOf(s));
  const describe = (s) => (s ? { session: idOf(s), startedAt: s.e.at, source: typeof s.e.source === "string" ? s.e.source : null, ended: ended(s) } : null);
  const newestWhere = (test) => { for (let k = starts.length - 1; k >= 0; k--) if (test(starts[k])) return starts[k]; return null; };
  if (currentSession !== undefined) {
    const previous = describe(newestWhere((s) => idOf(s) !== currentSession));
    return { mode: "hook", latest: null, previous, interrupted: Boolean(previous && !previous.ended) };
  }
  const latestStart = starts.length ? starts[starts.length - 1] : null;
  const previousStart = latestStart ? newestWhere((s) => s.i < latestStart.i && idOf(s) !== idOf(latestStart)) : null;
  const previous = describe(previousStart);
  return { mode: "status", latest: describe(latestStart), previous, interrupted: Boolean(previous && !previous.ended) };
}

// ---------- the Stop reminder rule ----------

const findLast = (list, test) => { for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i]; return null; };

// The rule, exactly: block only when checkpoints.stopReminder is on; stop_hook_active is not true; the working tree
// fingerprint differs from the last checkpoint event's (or, with no checkpoint, from this session's start); at least
// checkpoints.minMinutes passed since that checkpoint (or since this session started when there is none); and no
// stop-reminded event exists for this fingerprint. Returns { block, why, ... }.
export function evaluateStop({ stopHookActive, checkpoints, state, events, session, now }) {
  if (stopHookActive === true) return { block: false, why: "stop_hook_active is true" };
  if (!checkpoints.stopReminder) return { block: false, why: "checkpoints.stopReminder is off" };
  if (!state.fingerprint) return { block: false, why: "the working tree fingerprint could not be read" };
  const lastCheckpoint = findLast(events, (e) => e.event === "checkpoint");
  // This session's first start (a resume or compaction records another start with the same ID, which must not reset
  // the baseline). Measure from whichever is later, this session's start or the last checkpoint, so changes made
  // before this session began (a commit in a terminal, another session's work) never trigger a reminder here.
  const sessionStart = events.find((e) => e.event === "session-start" && (e.session ?? null) === session) ?? null;
  const baseline = lastCheckpoint && sessionStart ? (Date.parse(sessionStart.at) > Date.parse(lastCheckpoint.at) ? sessionStart : lastCheckpoint) : (lastCheckpoint ?? sessionStart);
  const fromCheckpoint = baseline !== null && baseline === lastCheckpoint;
  if (!baseline) return { block: false, why: "no checkpoint and no recorded start for this session, so there is nothing to measure from" };
  if (!baseline.fingerprint) return { block: false, why: "the baseline event has no fingerprint" };
  if (baseline.fingerprint === state.fingerprint) return { block: false, why: fromCheckpoint ? "nothing changed since the last checkpoint" : "nothing changed since this session started" };
  const elapsedMs = now.getTime() - Date.parse(baseline.at);
  if (elapsedMs < checkpoints.minMinutes * 60000) return { block: false, why: `less than ${checkpoints.minMinutes} minutes since the ${fromCheckpoint ? "last checkpoint" : "session started"}` };
  if (events.some((e) => e.event === "stop-reminded" && e.fingerprint === state.fingerprint)) return { block: false, why: "a reminder was already given for this working tree state" };
  return { block: true, why: "reminder due", baseline: fromCheckpoint ? "checkpoint" : "session-start", baselineAt: baseline.at, elapsedMinutes: Math.floor(elapsedMs / 60000) };
}

// The Stop hook's reason: what changed, and the exact command to run next.
export function stopReason({ decision, state, current, command = selfCommand() }) {
  const since = decision.baseline === "checkpoint"
    ? `the last checkpoint (${decision.elapsedMinutes} minutes ago)`
    : `this session started (${decision.elapsedMinutes} minutes ago), and no checkpoint has been recorded`;
  const values = `--state "<what is done and what is not>" --evidence "<checks or tests you ran, with their results>" --next "<the next concrete step>" --apply`;
  const parts = [`Skilliton checkpoint reminder: the working tree has changed since ${since}.`];
  if (current.unreadable?.length) parts.push(`${current.unreadable.length} task record(s) could not be read: ${current.unreadable.map((u) => u.file).join(", ")}.`);
  parts.push("This reminder is given once for this working tree state; if this work should not be recorded, tell the user why and stop.");
  // The command comes last, so no punctuation follows it.
  if (current.task) {
    parts.push(`Otherwise record where task ${current.task.id} stands (each value one line) by running: ${command} checkpoint --task ${current.task.id} ${values}`);
  } else if (current.ambiguous.length) {
    parts.push(`Branch ${state.branch} has more than one open task (${current.ambiguous.join(", ")}); otherwise pick the one this work belongs to and run: ${command} checkpoint --task <id> ${values}`);
  } else {
    const where = state.branch ? `branch ${state.branch}` : "a detached HEAD";
    const branchOption = state.branch ? "" : " --branch <branch name>";
    const taskOption = state.branch ? "" : " --task <id printed by task start>";
    parts.push(`No open task record matches ${where}; otherwise start one, then record a checkpoint, by running: ${command} task start "<short title of this work>" --criteria "<what done means>"${branchOption} --apply and then: ${command} checkpoint${taskOption} ${values}`);
  }
  return parts.join(" ");
}

// ---------- hook input ----------

// The client's hook JSON. Every field is optional; a value of the wrong type is treated as missing.
export function parseHookInput(raw) {
  let value = null, problem = null;
  if (typeof raw === "string" && raw.trim()) {
    try { value = JSON.parse(raw); } catch { problem = "the hook input on stdin was not JSON"; }
  }
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if (value !== null && !isObject) problem = "the hook input on stdin was not a JSON object";
  const obj = isObject ? value : {};
  const text = (v) => (typeof v === "string" && v.length > 0 && v.length <= 4096 ? v : null);
  return {
    cwd: text(obj.cwd), session: text(obj.session_id), stopHookActive: obj.stop_hook_active === true,
    source: text(obj.source), trigger: text(obj.trigger), reason: text(obj.reason), problem,
  };
}

// ---------- checks ----------

function layoutCheck(project) {
  const version = project.layoutVersion;
  const data = { version, runtimeLayout: LAYOUT_VERSION };
  if (version === null) return { status: "attention", summary: `not prepared by Skilliton (no prepare.version in .skillgate/config.json); to see what prepare would change: ${selfCommand()} prepare`, data };
  if (version < LAYOUT_VERSION) return { status: "attention", summary: `layout ${version}, and this runtime uses layout ${LAYOUT_VERSION}; to preview the migration: ${selfCommand()} migrate`, data };
  return { status: "ok", summary: `layout ${version} (current for this runtime)`, data };
}

async function migrationsCheck(project) {
  const mod = await loadOptional("migrations.mjs", "migrationState");
  if (!mod.available) return { status: mod.failed ? "failed" : "not-run", summary: mod.reason, data: { available: false, reason: mod.reason } };
  const state = await mod.fn(project);
  const pending = Array.isArray(state?.pending) ? state.pending : null;
  if (!pending) return { status: "failed", summary: "migrationState returned no pending list", data: { available: true } };
  const data = { available: true, layoutVersion: state.layoutVersion ?? null, target: state.target ?? null, pending, applied: Array.isArray(state.applied) ? state.applied : [] };
  if (pending.length) {
    return { status: "attention", summary: `${pending.length} pending: ${pending.map((p) => `${p?.id ?? "(no id)"}${p?.summary ? ` (${clip(p.summary, 100)})` : ""}`).join("; ")}; to preview: ${selfCommand()} migrate`, data };
  }
  return { status: "ok", summary: `none pending (layout ${data.layoutVersion ?? "unknown"}, target ${data.target ?? "unknown"})`, data };
}

function versionsCheck(project) {
  const installed = readPluginVersion(PLUGIN_ROOT);
  const entries = Object.entries(project.requires);
  const data = { installed, requires: project.requires, unmet: [], unverified: [] };
  const parts = [`workflow runtime ${installed ?? "(version unreadable)"} installed`];
  if (!entries.length) {
    parts.push("the project names no minimum version (prepare.requires is empty)");
    return { status: installed ? "ok" : "note", summary: parts.join("; "), data };
  }
  for (const [plugin, minimum] of entries) {
    if (plugin !== "workflow") {
      data.unverified.push(plugin);
      parts.push(`${plugin} ${minimum} or later is required, which this runtime cannot check (it reads only its own version)`);
    } else if (!installed || !/^\d+\.\d+\.\d+$/.test(installed)) {
      data.unverified.push(plugin);
      parts.push(`workflow ${minimum} or later is required, and the installed version could not be read`);
    } else if (cmpVersion(installed, minimum) < 0) {
      data.unmet.push({ plugin, minimum, installed });
      parts.push(`the project requires workflow ${minimum} or later: NOT MET (update the workflow plugin)`);
    } else {
      parts.push(`the project requires workflow ${minimum} or later: met`);
    }
  }
  const status = data.unmet.length ? "attention" : data.unverified.includes("workflow") ? "not-run" : data.unverified.length ? "note" : "ok";
  return { status, summary: parts.join("; "), data };
}

function recordsCheck(project) {
  const present = [], missing = [];
  for (const role of ROLES) {
    const rel = project.artifacts[role];
    let file = false;
    try { file = lstatSync(join(project.root, rel)).isFile(); } catch (e) { if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e; }
    (file ? present : missing).push({ role, path: rel });
  }
  const data = { present, missing };
  if (missing.length) return { status: "attention", summary: `${missing.length} of ${ROLES.length} missing: ${missing.map((m) => `${m.path} (${m.role})`).join(", ")}`, data };
  return { status: "ok", summary: `all ${ROLES.length} present`, data };
}

function tasksCheck(project, git, report) {
  const listed = listTasks(project);
  const current = pickCurrent(listed.tasks, git.branch);
  report.current = { ...current, unreadable: listed.unreadable };
  const data = {
    folder: listed.dir, exists: listed.exists,
    open: listed.tasks.map((t) => ({ id: t.id, title: t.title, state: t.state, branch: t.branch, updated: t.updated })),
    current: current.task ? current.task.id : null, ambiguous: current.ambiguous,
    unreadable: listed.unreadable.map((u) => ({ file: u.file, reason: u.reason })),
  };
  const parts = [listed.exists ? `${listed.tasks.length} open in ${listed.dir}` : `no task records yet (${listed.dir} does not exist)`];
  if (current.task) parts.push(`current task on ${git.branch}: ${current.task.id} "${clip(current.task.title, 80)}" (${current.task.state})`);
  else if (current.ambiguous.length) parts.push(`the current task on ${git.branch} is ambiguous: ${current.ambiguous.join(", ")} (a checkpoint needs --task <id>)`);
  else parts.push(git.branch ? `no open task on ${git.branch}` : "HEAD is detached, so there is no current task");
  if (listed.unreadable.length) parts.push(`${listed.unreadable.length} unreadable: ${listed.unreadable.map((u) => u.message).join("; ")}`);
  const status = listed.unreadable.length || current.ambiguous.length ? "attention" : "ok";
  return { status, summary: parts.join("; "), data };
}

// Freshness of the shared handoff record. It is stale when its Written time is older than the latest commit, unless
// no commit came after the last commit that changed the handoff record (committing a handoff is not a newer change),
// or when an uncommitted change (other than the handoff and its archive) was modified after that time. On a branch
// that is not an integration branch the shared handoff is not written (CONTRACTS section 3), so staleness is a note.
function handoffCheck(project, git) {
  const root = project.root, rel = project.artifacts.handoff;
  const integration = git.branch !== null && project.integrationBranches.includes(git.branch);
  const data = {
    file: rel, integrationBranch: integration, exists: false, section: false, written: null, writtenAt: null, problem: null,
    stale: null, latestCommitAt: null, handoffCommit: null, commitsSinceHandoffCommit: null,
    uncommitted: git.dirty, newerChanges: 0, newerExamples: [], unknownTimeChanges: 0,
  };
  const offBranch = `on ${git.branch ? `branch ${git.branch}` : "a detached HEAD"} the shared handoff is written only on integration branches (${project.integrationBranches.join(", ")}), so this does not need attention here`;
  const verdict = (summary) => (integration ? { status: "attention", summary, data } : { status: "note", summary: `${summary}; ${offBranch}`, data });

  const record = readHandoffRecord(root, rel);
  data.exists = record.exists;
  data.section = record.section;
  data.written = record.written;
  if (!record.exists) return { status: "note", summary: `${rel} is missing (see records)`, data };
  if (!record.section) { data.problem = "no RESUME HERE section"; return verdict(`${rel} has no "## RESUME HERE" section, so its freshness cannot be judged`); }
  if (record.written === null) { data.problem = "no Written line"; return verdict(`${rel} has no "Written:" line under "## RESUME HERE", so its freshness cannot be judged`); }
  const parsed = parseWritten(record.written);
  if (!parsed.ok) { data.problem = parsed.reason; return verdict(`${rel}: the Written value could not be read: ${parsed.reason}`); }
  data.writtenAt = parsed.at.toISOString();

  const reasons = [];
  if (git.head) {
    const latest = runGit(root, ["log", "-1", "--format=%ct", "HEAD"]);
    const seconds = Number(latest.stdout.trim());
    if (latest.status !== 0 || !Number.isFinite(seconds) || seconds <= 0) throw new GitError(`git log could not read the latest commit time (${clip(latest.stderr, 120) || `exit ${latest.status}`})`);
    data.latestCommitAt = new Date(seconds * 1000).toISOString();
    const touched = runGit(root, ["log", "-1", "--format=%H", "HEAD", "--", rel]);
    data.handoffCommit = touched.status === 0 && touched.stdout.trim() ? touched.stdout.trim() : null;
    if (data.handoffCommit) {
      const count = runGit(root, ["rev-list", "--count", `${data.handoffCommit}..HEAD`]);
      data.commitsSinceHandoffCommit = count.status === 0 ? Number(count.stdout.trim()) : null;
    }
    const newerCommit = parsed.end.getTime() < seconds * 1000;
    const coveredByHandoffCommit = data.handoffCommit !== null && data.commitsSinceHandoffCommit === 0;
    if (newerCommit && !coveredByHandoffCommit) {
      reasons.push(`the latest commit (${data.latestCommitAt}${data.commitsSinceHandoffCommit ? `, ${data.commitsSinceHandoffCommit} commit(s) after the handoff was last committed` : data.handoffCommit ? "" : ", and no commit in the available history changed the handoff"})`);
    }
  }
  if (git.dirty) {
    const skip = new Set([rel, project.artifacts.handoffArchive]);
    for (const { path } of changedPaths(root)) {
      if (skip.has(path)) continue;
      let st;
      try { st = lstatSync(join(root, path)); } catch { data.unknownTimeChanges++; continue; }
      if (st.mtimeMs > parsed.end.getTime()) {
        data.newerChanges++;
        if (data.newerExamples.length < 3) data.newerExamples.push(path);
      }
    }
    if (data.newerChanges) reasons.push(`${data.newerChanges} uncommitted change(s) modified after it (for example ${data.newerExamples.join(", ")})`);
  }
  const unknown = data.unknownTimeChanges ? `; ${data.unknownTimeChanges} deleted path(s) have no modification time to compare` : "";
  data.stale = reasons.length > 0;
  if (data.stale) return verdict(`${rel} was written ${record.written}, which is older than ${reasons.join(" and ")}${unknown}`);
  return { status: "ok", summary: `${rel} was written ${record.written}; no later commit or uncommitted change (${git.dirty ?? "unknown"} uncommitted path(s))${unknown}`, data };
}

function sessionsCheck(root, git, currentSession) {
  const journal = readJournal(root);
  const history = sessionHistory(journal.events, { currentSession });
  const data = {
    journal: { path: journal.path, exists: journal.exists, events: journal.events.length, corrupt: journal.corrupt, truncated: journal.truncated },
    mode: history.mode, latest: history.latest, previous: history.previous, interrupted: history.interrupted, uncommitted: git.dirty,
  };
  const who = (s) => `session ${s.session ?? "(no id)"} (started ${s.startedAt})`;
  const parts = [];
  if (history.mode === "hook") {
    if (!history.previous) parts.push("none recorded in this worktree's journal");
    else if (history.interrupted) parts.push(`interrupted: ${who(history.previous)} has no session-end`);
    else parts.push(`${who(history.previous)} ended normally`);
  } else if (!history.latest) {
    parts.push("no session recorded in this worktree's journal (the lifecycle hooks have not run here)");
  } else {
    parts.push(`latest ${who(history.latest)} ${history.latest.ended ? "ended" : "has not ended (still running, or interrupted; status cannot tell which)"}`);
    if (history.previous) parts.push(history.interrupted ? `the ${who(history.previous)} before it was interrupted: no session-end, and a later session started` : "the session before it ended normally");
  }
  if (history.interrupted) parts.push(`${git.dirty ?? "unknown"} uncommitted change(s) in the working tree now`);
  if (journal.corrupt) parts.push(`${journal.corrupt} corrupt journal line(s) ignored`);
  if (journal.truncated) parts.push("only the newest 8 MB of the journal were read");
  const status = history.interrupted && git.dirty > 0 ? "attention" : journal.corrupt || journal.truncated || !journal.exists ? "note" : "ok";
  return { status, summary: parts.join("; "), data };
}

async function securityCheck(root) {
  const mod = await loadOptional("security.mjs", "securitySummary");
  if (!mod.available) return { status: mod.failed ? "failed" : "not-run", summary: mod.reason, data: { available: false, reason: mod.reason } };
  const s = await mod.fn(root);
  if (s === null || typeof s !== "object") return { status: "failed", summary: "securitySummary returned no summary", data: { available: false } };
  if (s.available !== true) return { status: "not-run", summary: `security evidence not available: ${clip(s.reason ?? "no reason given")}`, data: { available: false, reason: s.reason ?? null } };
  const counts = ["total", "applicable", "current", "missing", "stale", "expired", "invalid", "gaps", "needsHuman", "undecided"];
  const wrong = counts.filter((k) => !Number.isInteger(s[k]) || s[k] < 0);
  if (wrong.length) return { status: "failed", summary: `securitySummary returned values that are not counts: ${wrong.join(", ")}`, data: { available: true } };
  const data = { available: true, catalogVersion: s.catalogVersion ?? null, ...Object.fromEntries(counts.map((k) => [k, s[k]])) };
  const needs = ["missing", "stale", "expired", "invalid", "gaps", "needsHuman", "undecided"].filter((k) => s[k] > 0);
  const summary = `${s.total} control(s) in catalog ${s.catalogVersion ?? "(unnamed)"}, ${s.applicable} applicable: ${s.current} current, ${s.missing} missing, ${s.stale} stale, ${s.expired} expired, ${s.invalid} invalid, ${s.gaps} gap(s), ${s.needsHuman} need a human, ${s.undecided} undecided`;
  return { status: needs.length ? "attention" : "ok", summary, data };
}

// ---------- gathering ----------

export const CHECK_ORDER = ["layout", "migrations", "versions", "records", "tasks", "handoff", "sessions", "security"];

// Evaluates every check. project: the resolved project, or undefined to resolve it here (a configuration problem is
// then recorded in report.configProblem and the checks that need it are not run). currentSession: the hook's session
// id (string or null), or undefined for status. Returns { root, generatedAt, git, configProblem, checks, data, current }.
export async function gatherProjectState(root, { state = null, project = undefined, currentSession = undefined, now = new Date() } = {}) {
  const report = { root, generatedAt: now.toISOString(), git: null, configProblem: null, handoffMaxBytes: DEFAULTS.handoffMaxBytes, checks: [], data: {}, current: null };
  const git = state ?? readGitState(root, { shortHead: true });
  report.git = { branch: git.branch, head: git.head, shortHead: git.shortHead, dirty: git.dirty, fingerprint: git.fingerprint };
  if (project === undefined) {
    try { project = resolveProject(root); } catch (e) {
      if (!(e instanceof ConfigError)) throw e;
      project = null;
      report.configProblem = e.message;
    }
  }
  if (project) report.handoffMaxBytes = project.handoff.maxBytes;
  const add = (name, check) => { report.checks.push({ name, status: check.status, summary: check.summary }); report.data[name] = check.data ?? {}; };
  const run = async (name, body) => {
    try { add(name, await body()); } catch (e) {
      add(name, { status: "failed", summary: `could not be evaluated: ${clip(e?.message ?? e, 300)}`, data: { error: clip(e?.message ?? e, 300) } });
    }
  };
  const bodies = {
    layout: () => layoutCheck(project),
    migrations: () => migrationsCheck(project),
    versions: () => versionsCheck(project),
    records: () => recordsCheck(project),
    tasks: () => tasksCheck(project, git, report),
    handoff: () => handoffCheck(project, git),
    sessions: () => sessionsCheck(root, git, currentSession),
    security: () => securityCheck(root),
  };
  const needsProject = new Set(["layout", "migrations", "versions", "records", "tasks", "handoff"]);
  for (const name of CHECK_ORDER) {
    if (!project && needsProject.has(name)) {
      add(name, { status: "not-run", summary: "not evaluated, because .skillgate/config.json cannot be used (see the configuration problem)", data: {} });
      continue;
    }
    await run(name, bodies[name]);
  }
  return report;
}

export function reportExitCode(report) {
  if (report.checks.some((c) => c.status === "failed")) return 3;
  if (report.checks.some((c) => c.status === "attention")) return 1;
  return 0;
}

export function reportSummary(report) {
  const named = (status) => report.checks.filter((c) => c.status === status).map((c) => c.name);
  const failed = named("failed"), attention = named("attention"), notRun = named("not-run");
  const parts = [];
  if (failed.length) parts.push(`${failed.length} check(s) could not be evaluated: ${failed.join(", ")}; the other lines completed.`);
  if (attention.length) parts.push(`${attention.length} item(s) need attention: ${attention.join(", ")}.`);
  if (!failed.length && !attention.length) parts.push("Nothing needs attention among the checks that ran.");
  if (notRun.length) parts.push(`Not run: ${notRun.join(", ")}.`);
  return parts.join(" ");
}

const LABELS = { ok: "OK", attention: "ATTENTION", note: "NOTE", "not-run": "NOT RUN", failed: "FAILED" };

export function statusLines(report) {
  const lines = ["skillgate status (writes nothing)", `project: ${tilde(report.root)}`, `git: ${gitLine(report.git)}`];
  for (const c of report.checks) lines.push(`${LABELS[c.status].padEnd(10)} ${c.name}: ${c.summary}`);
  lines.push(`Summary: ${reportSummary(report)}`);
  return lines;
}

export const resultObject = (command, exitCode, summary, details) => ({ schema: RESULT_SCHEMA, command, result: RESULTS[exitCode], summary, details });

// ---------- the session-start block ----------

// Whole lines, at most maxBytes bytes in total including the truncation notice.
export function boundLines(lines, maxBytes, notice) {
  const text = lines.map((line) => `${line}\n`).join("");
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false };
  const tail = `${notice}\n`;
  let budget = maxBytes - Buffer.byteLength(tail);
  let out = "";
  for (const line of lines) {
    const size = Buffer.byteLength(`${line}\n`);
    if (size > budget) break;
    out += `${line}\n`;
    budget -= size;
  }
  return { text: `${out}${tail}`, truncated: true };
}

const BLOCK_LABELS = { layout: "Layout", migrations: "Pending migrations", versions: "Versions", records: "Records", handoff: "Shared handoff", sessions: "Previous session", security: "Security" };
const WORDS = { attention: "needs attention", "not-run": "not run", failed: "failed" };

function taskLines(report, check) {
  const word = WORDS[check.status];
  const current = report.current;
  if (!current) return [`- Current task${word ? ` (${word})` : ""}: ${check.summary}`];
  const lines = [];
  const branch = report.git.branch;
  if (current.task) {
    const t = current.task, c = t.lastCheckpoint;
    const last = c ? `last checkpoint ${clip(c.at, 40)}: State: ${clip(c.state, 160)}; Evidence: ${clip(c.evidence, 160)}; Next: ${clip(c.next, 160)}` : "no checkpoint recorded yet";
    lines.push(`- Current task: ${t.id} "${clip(t.title, 100)}" (${t.state}, ${t.checkpoints} checkpoint(s)); ${last}`);
    const h = t.handoff;
    lines.push(`- Task handoff: ${h ? `State: ${clip(h.state, 160)}; Next: ${clip(h.next, 160)}; Blocked: ${clip(h.blocked, 120)}; Watch out: ${clip(h.watchOut, 120)}` : "not yet written"}`);
  } else if (current.ambiguous.length) {
    lines.push(`- Current task (needs attention): ambiguous, ${current.ambiguous.length} open tasks on branch ${branch}: ${current.ambiguous.join(", ")}; a checkpoint needs --task <id>`);
  } else {
    lines.push(`- Current task: none (${branch ? `no open task on branch ${branch}` : "HEAD is detached"}); to start one: ${selfCommand()} task start "<title>" --apply`);
  }
  if (current.unreadable.length) lines.push(`- Task records (needs attention): ${current.unreadable.length} unreadable: ${current.unreadable.map((u) => clip(u.message, 160)).join("; ")}`);
  return lines;
}

// What a resuming session needs first comes first, because truncation keeps the top of the block.
const BLOCK_ORDER = ["tasks", "sessions", "handoff", "layout", "migrations", "versions", "records", "security"];

export function sessionStartBlock(report, { maxBytes, notes = [] }) {
  const lines = ["[workflow] Project state (skillgate hook session-start):", `- Branch: ${gitLine(report.git)}`];
  if (report.configProblem) lines.push(`- Configuration (needs attention): ${clip(report.configProblem, 300)}`);
  for (const note of notes) lines.push(`- ${clip(note, 300)}`);
  for (const name of BLOCK_ORDER) {
    const check = report.checks.find((c) => c.name === name);
    if (!check) continue;
    if (name === "tasks") { lines.push(...taskLines(report, check)); continue; }
    const word = WORDS[check.status];
    lines.push(`- ${BLOCK_LABELS[name]}${word ? ` (${word})` : ""}: ${clip(check.summary, 600)}`);
  }
  return boundLines(lines, maxBytes, `[workflow] Project state truncated at ${maxBytes} bytes; for all of it run: ${selfCommand()} status`);
}
