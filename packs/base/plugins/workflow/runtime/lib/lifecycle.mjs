// lifecycle.mjs: where a project stands, for `skilliton status` and the lifecycle hooks; the Stop reminder rule;
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
import { CONFIG_REL, ConfigError, DEFAULTS, LAYOUT_VERSION, ROLES, resolveProject } from "./config.mjs";
import { HOME, PLUGIN_ROOT, Refused, cmpVersion, isFile, isPlainObject, readJsonMaybe, readPluginVersion, selfCommand, tilde } from "./core.mjs";
import { GitError, changedPaths, gitTopLevel, readGitState, readJournal, runGit } from "./journal.mjs";
import { TaskChangedError, TaskRecordError, fencedLines, gitLine, listTasks, pickCurrent } from "./tasks.mjs";
import { deletedTracked, restoreAdvice } from "./records-restore.mjs";
import { LEGACY_NAME, LEGACY_PROJECT_DIR } from "./legacy-names.mjs";
import { HANDOFF_PLACEHOLDER } from "./project-files.mjs";
import { OperationFailed } from "./prepare.mjs";

const RESULT_SCHEMA = "skilliton.result/1";
const RESULTS = { 0: "complete", 1: "attention", 2: "invalid", 3: "operation-failed" };

// A Git or file system operation failed (exit 3), as opposed to invalid input (Refused, exit 2).
export { OperationFailed } from "./prepare.mjs"; // one class for both engines (B37), so a catch of one is a catch of both

const flat = (text) => String(text ?? "").replace(/\s*\n\s*/g, " ").trim();
export const clip = (text, max = 200) => {
  if (text === null || text === undefined) return "not recorded";
  const value = flat(text);
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

// ---------- opening a project (commands) ----------

// { root, project } for a command run in dirOption (or the current folder). Refused when the folder is missing, not
// inside a Git work tree, or the configuration is invalid; OperationFailed when the configuration cannot be read.
export function openProject(dirOption, { allowLegacy = false } = {}) {
  const dir = resolve(dirOption ?? process.cwd());
  let isDirectory = false;
  try { isDirectory = statSync(dir).isDirectory(); } catch { isDirectory = false; }
  if (!isDirectory) throw new Refused(`${dirOption !== undefined ? "--dir " : ""}${tilde(dir)} is not an existing folder`);
  const root = gitTopLevel(dir);
  if (!root) throw new Refused(`${tilde(dir)} is not inside a Git repository; tasks, checkpoints and status read the branch, the commit and the working tree from Git`);
  try {
    return { root, project: resolveProject(root, { allowLegacy }) };
  } catch (e) {
    if (e instanceof ConfigError) {
      if (e.kind === "failed") throw new OperationFailed(e.message);
      throw new Refused(e.legacy ? `${e.message} Preview the move: ${selfCommand()} migrate` : e.message);
    }
    throw e;
  }
}

// Runs a command body and maps the engines' failure types onto the exit contract: invalid data and refused writes
// become Refused (exit 2, printed by skilliton.mjs); Git and file system failures print one "operation failed" line
// and return 3. Anything else is a bug and propagates.
export async function guardCommand(command, body) {
  try {
    return await body();
  } catch (e) {
    if (e instanceof ConfigError) {
      if (e.kind !== "failed") throw new Refused(e.message);
      console.error(`skilliton ${command}: operation failed: ${flat(e.message)}`);
      return 3;
    }
    if (e instanceof TaskRecordError || e instanceof TaskChangedError) throw new Refused(e.message);
    if (e instanceof GitError || e instanceof OperationFailed || (typeof e?.code === "string" && /^E[A-Z]+$/.test(e.code))) {
      console.error(`skilliton ${command}: operation failed: ${flat(e.message)}`);
      return 3;
    }
    throw e;
  }
}

// ---------- optional modules from other lanes ----------

async function loadOptional(file, exportName) {
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
export const WRITTEN_ZONES = { Z: 0, UTC: 0, GMT: 0, EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420 };

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
  } else if (Object.prototype.hasOwnProperty.call(WRITTEN_ZONES, zone.toUpperCase())) {
    ms = Date.UTC(Y, M - 1, D, H, MI, S, MS) - WRITTEN_ZONES[zone.toUpperCase()] * 60000;
  } else {
    return { ok: false, reason: `the time zone "${zone}" is not one Skilliton reads (use UTC, an offset such as +02:00, or one of ${Object.keys(WRITTEN_ZONES).filter((z) => z !== "Z").join(", ")})` };
  }
  return { ok: true, at: new Date(ms), end: new Date(ms + resolutionMs - 1), resolutionMs };
}

// { exists, section, written (raw text or null) }. Reads at most the first MB: "## RESUME HERE" is near the top.
function readHandoffRecord(root, rel) {
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
  // Fenced code is never a heading, as in handoff.mjs parseHandoff and the session-start hook: a fenced example of
  // the heading above the real note must not have its Written line judged in the note's place.
  const fenced = fencedLines(lines);
  const start = lines.findIndex((line, i) => !fenced[i] && line.startsWith("## RESUME HERE"));
  if (start < 0) return { exists: true, section: false, written: null };
  for (let i = start + 1; i < lines.length && (fenced[i] || !lines[i].startsWith("## ")); i++) {
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
function sessionHistory(events, { currentSession } = {}) {
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

// ---------- checks ----------

function layoutCheck(project) {
  const version = project.layoutVersion;
  const data = { version, runtimeLayout: LAYOUT_VERSION };
  if (version === null) {
    // A project whose configuration is tracked but gone was prepared and then had Skilliton's files removed by hand
    // (B61). That is named, with the command that restores them and the one that records the removal on purpose,
    // instead of the offer to prepare a project that never was.
    const kept = [CONFIG_REL, "CLAUDE.md", "AGENTS.md", ...Object.values(project.artifacts ?? {}), ...Object.values(project.directories ?? {})];
    const removed = deletedTracked(project.root, kept);
    if (removed && removed.includes(CONFIG_REL)) {
      data.removed = removed;
      const shown = removed.slice(0, 12);
      return { status: "attention", summary: `not prepared now, but ${CONFIG_REL} is tracked in Git and missing from the working tree, so Skilliton's files were removed here by hand (${removed.length} tracked file(s) missing); restore them with: git checkout -- ${shown.join(" ")}${removed.length > shown.length ? " ..." : ""}; to take Skilliton out on purpose instead: ${selfCommand()} remove --apply`, data };
    }
    return { status: "attention", summary: `not prepared by Skilliton (no prepare.version in ${project.configRel}); to see what prepare would change: ${selfCommand()} prepare`, data };
  }
  if (project.legacyNames) return { status: "attention", summary: `layout ${version}${version === 2 ? ` under the earlier ${LEGACY_NAME} names (${LEGACY_PROJECT_DIR}/)` : ""}, and this runtime uses layout ${LAYOUT_VERSION} under the Skilliton names; until it is migrated, only migrate, status and doctor work in this project. To preview the migration: ${selfCommand()} migrate`, data };
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
  if (!missing.length) return { status: "ok", summary: `all ${ROLES.length} present`, data };
  return { status: "attention", summary: `${missing.length} of ${ROLES.length} missing: ${missing.map((m) => `${m.path} (${m.role})`).join(", ")}; ${restoreAdvice(project.root, missing.map((m) => m.path), data)}`, data };
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

// How far ahead of this machine's clock a handoff's Written time may be, for clocks that differ between machines.
export const WRITTEN_AHEAD_MS = 5 * 60 * 1000;

// A handoff's Written line is printed to the minute, but the files a checkpoint writes carry millisecond modification
// times, and one run writes the handoff, the task record and the indexes in that order. When the run straddles a
// minute boundary the later files land after the end of the minute the handoff names, and the note the command has
// just written reads as older than the files the same command wrote. So a change modified within this window of the
// end of the Written minute counts as part of that write rather than as work done after it. It is deliberately short:
// the next real edit is minutes away, not seconds, and a longer window would hide work.
const HANDOFF_WRITE_WINDOW_MS = 5 * 1000;

// Freshness of the shared handoff record. It is stale when its Written time is older than the latest commit, unless
// no commit came after the last commit that changed the handoff record (committing a handoff is not a newer change),
// or when an uncommitted change (other than the handoff and its archive) was modified after that time. On a branch
// that is not an integration branch the shared handoff is not written (CONTRACTS section 3), so staleness is a note.
// A Written time later than now cannot be judged: every commit and change made before it would look older than the
// handoff, so it is reported instead of being called current.
// Has the project been worked in since preparation created its handoff? Measured from the commit that ADDED the
// handoff file, counting only commits that changed something else: a later commit that merely tidies the handoff
// resets nothing, and preparation's own uncommitted files are not "work" either, because a project is prepared and
// then looked at before anything is committed.
// Has the project moved on since the placeholder handoff was written? Returns { moved: [reasons], unknown: <why not>,
// }: "no reasons and no unknown" is the only answer that means the project really is still where preparation left it.
//
// The mark to measure from is the commit that ADDED the handoff, and later commits that changed anything else are
// counted. Three ways that measurement cannot be made as written, each of which once read as "nothing has happened
// here":
//   - the handoff has never been committed, so there is no commit to measure from. Its own time on disk is then the
//     mark, and the sentence says so, because that is a weaker thing to know and the reader should know which it is.
//     Preparation's commit is NOT used for this: a handoff written today would be measured from a commit made before
//     it existed, and every commit in between would be counted as work the handoff is behind
//   - the history in this clone is shallow (a CI checkout with --depth), so the commit that added the handoff may
//     simply not be here, and a count from a truncated history means nothing
//   - the file's time cannot be read either, so there is no mark at all
function handoffMovedOn(root, rel, archiveRel, git, data) {
  if (!git.head) return { moved: [], unknown: null };
  const shallow = runGit(root, ["rev-parse", "--is-shallow-repository"]);
  data.shallowHistory = shallow.status === 0 ? shallow.stdout.trim() === "true" : null;
  const exclude = ["--", ".", `:(exclude)${rel}`, `:(exclude)${archiveRel}`];

  // The OLDEST commit that added this file, following it through renames. This is only ever asked when the handoff
  // still holds the line preparation wrote, so the question is "how much has happened that no session has written a
  // handoff about", and the answer starts the first time this project had a handoff at all. Two ways of losing that
  // date, both tried and both wrong: taking the newest add lets a second preparation reset the count to none, and
  // leaving out --follow does the same for a move of the records folder, because a rename adds the new path in one
  // commit and that commit is then the only add there is. Either way a project with weeks of work behind an
  // unwritten handoff reads as one prepared a minute ago.
  const addedBy = (path, follow) => {
    const r = runGit(root, ["log", ...(follow ? ["--follow"] : []), "--diff-filter=A", "--format=%H", "--", path]);
    return r.status === 0 ? r.stdout.trim().split("\n").filter(Boolean).at(-1) ?? null : null;
  };
  let from = addedBy(rel, true);
  // Following renames can walk out of this project's life with Skilliton and into whatever document git decided
  // the handoff was renamed from: preparation that replaces an existing NOTES.md is paired with it, and a project
  // prepared a minute ago would then be told it has years of work behind an unwritten handoff. The question is
  // about what has happened since this project had a handoff, so the mark never goes back further than the commit
  // that made this a Skilliton project.
  const prepared = addedBy(CONFIG_REL, false);
  let boundedByPreparation = false;
  if (from && prepared && from !== prepared && runGit(root, ["merge-base", "--is-ancestor", from, prepared]).status === 0) {
    from = prepared;
    boundedByPreparation = true;
  }
  let since;
  if (from) {
    data.handoffCommit = from;
    data.measuredFrom = boundedByPreparation ? "this project was prepared" : "it was committed";
    since = runGit(root, ["rev-list", "--count", `${from}..HEAD`, ...exclude]);
  } else {
    if (data.shallowHistory) return { moved: [], unknown: "the history in this clone is shallow, so the commit that added it may not be here" };
    if (data.shallowHistory === null) return { moved: [], unknown: "git could not say whether this clone's history is complete" };
    let writtenAt = null;
    try { writtenAt = Math.floor(statSync(join(root, rel)).mtimeMs / 1000); } catch { writtenAt = null; }
    if (writtenAt === null) return { moved: [], unknown: "it has never been committed and the time it was last written could not be read, so there is no point to measure from" };
    data.measuredFrom = "the time this file was last written on this machine (it has never been committed)";
    data.handoffWrittenOnDisk = new Date(writtenAt * 1000).toISOString();
    // One second later: a commit made in the same second as the write cannot be put on either side of it, and
    // counting it would be claiming to know an order that nothing here can know.
    since = runGit(root, ["rev-list", "--count", `--since=${writtenAt + 1}`, "HEAD", ...exclude]);
  }
  const count = since.status === 0 ? Number(since.stdout.trim()) : null;
  data.commitsSinceHandoffCommit = Number.isFinite(count) ? count : null;
  if (!Number.isFinite(count)) return { moved: [], unknown: `git could not count the commits since ${data.measuredFrom} (${clip(since.stderr, 80) || `exit ${since.status}`})` };
  if (count) return { moved: [`${count} commit(s) that changed something else since ${data.measuredFrom}`], unknown: null };
  if (data.shallowHistory) return { moved: [], unknown: "the history in this clone is shallow, so a count of none may only mean the rest is not here" };
  return { moved: [], unknown: null };
}

function handoffCheck(project, git) {
  const root = project.root, rel = project.artifacts.handoff;
  const integration = git.branch !== null && project.integrationBranches.includes(git.branch);
  const data = {
    file: rel, integrationBranch: integration, exists: false, section: false, written: null, writtenAt: null, problem: null,
    stale: null, latestCommitAt: null, handoffCommit: null, commitsSinceHandoffCommit: null, measuredFrom: null, shallowHistory: null, handoffWrittenOnDisk: null,
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
  // A project that was prepared and has had no session yet still carries the placeholder preparation wrote. That is a
  // state, not a problem, but only while the project has not moved on: once there are commits after the one that last
  // touched the handoff, or uncommitted work, the placeholder is a handoff nobody wrote and it needs attention, or it
  // would hide every later change for ever.
  if (record.written.trim().toLowerCase() === HANDOFF_PLACEHOLDER) {
    data.problem = "not written yet";
    const { moved, unknown } = handoffMovedOn(root, rel, project.artifacts.handoffArchive, git, data);
    if (moved.length) return verdict(`${rel} still carries the line preparation wrote ("${record.written.trim()}"), and the project has moved on since (${moved.join("; ")}); write a handoff with /workflow:handoff`);
    if (unknown) return verdict(`${rel} still carries the line preparation wrote ("${record.written.trim()}"), and whether the project has moved on since cannot be judged here: ${unknown}; write a handoff with /workflow:handoff`);
    return { status: "note", summary: `${rel} is the one preparation created: no session has written a handoff yet (write one with /workflow:handoff)`, data };
  }
  const parsed = parseWritten(record.written);
  if (!parsed.ok) { data.problem = parsed.reason; return verdict(`${rel}: the Written value could not be read: ${parsed.reason}`); }
  data.writtenAt = parsed.at.toISOString();
  const now = Date.now();
  if (parsed.at.getTime() > now + WRITTEN_AHEAD_MS) {
    data.problem = "written in the future";
    return verdict(`${rel} says it was written ${record.written}, which is later than this machine's clock (${new Date(now).toISOString()}), so its freshness cannot be judged; set the Written line to the time the note was written`);
  }

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
      if (st.mtimeMs > parsed.end.getTime() + HANDOFF_WRITE_WINDOW_MS) {
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

const CHECK_ORDER = ["layout", "migrations", "versions", "enrollment", "records", "tasks", "handoff", "sessions", "security"];

// Evaluates every check. project: the resolved project, or undefined to resolve it here (a configuration problem is
// then recorded in report.configProblem and the checks that need it are not run). currentSession: the hook's session
// id (string or null), or undefined for status. Returns { root, generatedAt, git, configProblem, checks, data, current }.
// Enrollment. A project's team settings enable plugins by id; this user's Claude Code either has them installed or does
// not. A session that starts without them gets none of the enforced behavior, and nothing else in this report would say
// so: every other check reads the project's own files, which look the same either way. Claude Code's install record is
// the only thing here that can tell, so this names the file it read and says Codex is not read, rather than answering
// for a client it did not look at.
function enrollmentCheck(root) {
  const settingsPath = join(root, ".claude", "settings.json");
  const installsPath = join(HOME, ".claude", "plugins", "installed_plugins.json");
  const settings = readJsonMaybe(settingsPath, []);
  const enabled = isPlainObject(settings?.enabledPlugins) ? Object.entries(settings.enabledPlugins).filter(([, on]) => on === true).map(([id]) => id) : [];
  const data = { enabled, installed: [], missing: [], source: tilde(installsPath) };
  const fix = `Enrollment comes first: run ${selfCommand()} join --company <name> --signers <file> --apply, or ask whoever set this machine up. Codex records its installs elsewhere and is not read here.`;
  if (!enabled.length) return { status: "not-run", summary: `not evaluated: ${tilde(settingsPath)} enables no plugins, so there is nothing to compare (${selfCommand()} project-settings writes them)`, data };
  if (!isFile(installsPath)) {
    data.missing = enabled;
    return { status: "attention", summary: `this project enables ${enabled.length} plugin(s) (${enabled.join(", ")}) and Claude Code has no install record on this machine (no ${tilde(installsPath)}), so none of them is installed for this user and none of their hooks can run. ${fix}`, data };
  }
  const record = readJsonMaybe(installsPath, []);
  if (!isPlainObject(record?.plugins)) return { status: "not-run", summary: `not evaluated: ${tilde(installsPath)} is there but could not be read as Claude Code's install record, so whether the ${enabled.length} plugin(s) this project enables are installed is unknown`, data };
  data.installed = Object.keys(record.plugins);
  data.missing = enabled.filter((id) => !data.installed.includes(id));
  if (!data.missing.length) return { status: "ok", summary: `all ${enabled.length} plugin(s) this project enables are installed for this user (${tilde(installsPath)}); whether a hook then ran is a separate question this does not answer`, data };
  return { status: "attention", summary: `${data.missing.length} of the ${enabled.length} plugin(s) this project enables are not installed for this user (${data.missing.join(", ")}), so their hooks cannot run. ${fix}`, data };
}

export async function gatherProjectState(root, { state = null, project = undefined, currentSession = undefined, now = new Date() } = {}) {
  const report = { root, generatedAt: now.toISOString(), git: null, configProblem: null, handoffMaxBytes: DEFAULTS.handoffMaxBytes, checks: [], data: {}, current: null };
  const git = state ?? readGitState(root, { shortHead: true });
  report.git = { branch: git.branch, head: git.head, shortHead: git.shortHead, dirty: git.dirty, fingerprint: git.fingerprint };
  if (project === undefined) {
    try { project = resolveProject(root, { allowLegacy: true }); } catch (e) {
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
    enrollment: () => enrollmentCheck(root),
    records: () => recordsCheck(project),
    tasks: () => tasksCheck(project, git, report),
    handoff: () => handoffCheck(project, git),
    sessions: () => sessionsCheck(root, git, currentSession),
    // A project under the earlier names keeps its evidence in the earlier project folder, which this runtime does not read.
    security: () => (project?.legacyNames ? { status: "not-run", summary: `not evaluated: the evidence is under the earlier ${LEGACY_NAME} names until the project is migrated (${selfCommand()} migrate)`, data: { available: false } } : securityCheck(root)),
  };
  const needsProject = new Set(["layout", "migrations", "versions", "records", "tasks", "handoff"]);
  for (const name of CHECK_ORDER) {
    if (!project && needsProject.has(name)) {
      add(name, { status: "not-run", summary: "not evaluated, because .skilliton/config.json cannot be used (see the configuration problem)", data: {} });
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
  const lines = ["skilliton status (writes nothing)", `project: ${tilde(report.root)}`, `git: ${gitLine(report.git)}`];
  for (const c of report.checks) lines.push(`${LABELS[c.status].padEnd(10)} ${c.name}: ${c.summary}`);
  lines.push(`Summary: ${reportSummary(report)}`);
  return lines;
}

export const resultObject = (command, exitCode, summary, details) => ({ schema: RESULT_SCHEMA, command, result: RESULTS[exitCode], summary, details });
