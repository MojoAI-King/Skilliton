// records.mjs: decision and lesson entries, and the managed indexes (docs/CONTRACTS.md section 11).
//
//   createEntry(project, kind, ...)  plans a decision or lesson entry, named by the ID rule in ids.mjs; writes it
//                                    only with { apply: true }.
//   regenerateIndexes(project, ...)  plans the three managed index sections (decisions, lessons, open tasks); writes
//                                    them only with { apply: true }, and only on an integration branch.
//
// An index section is rebuilt from the entry files alone, sorted by ID, so every clone holding the same entries
// writes the same bytes and rerunning it after a merge resolves a conflict inside the section. Text outside the
// markers is never changed. Task files are written by the task commands; this module only reads their header lines.
//
// Nothing here parses arguments or exits the process. Nothing here imports from outside the plugin folder.

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refuse } from "./core.mjs";
import { detectEol, lineSpans } from "./harness.mjs";
import { isId, localDate, newId } from "./ids.mjs";
import { OperationFailed, applyChanges, currentBranch, inspectFolder, inspectPath, readPath } from "./prepare.mjs";
import {
  CLOSED_TASK_STATES, INDEX_KINDS, INDEX_RECORD_ROLE, ROLE_LABELS, TASK_STATES, entryTemplate, indexEndMarker,
  indexStartMarker, renderIndexSection,
} from "./project-files.mjs";

export const ENTRY_KINDS = { decision: "decisions", lesson: "lessons" };
const MAX_ENTRY_BYTES = 256 * 1024;
const BOM = String.fromCharCode(0xfeff);

// ---------- entries ----------

export function checkTitle(title) {
  if (typeof title !== "string" || !title.trim()) refuse('the entry needs a title, for example: record decision "Keep orders in PostgreSQL"');
  const clean = title.trim();
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(clean)) refuse("the title must be one line of plain text, without line breaks or control characters");
  if (clean.length > 200) refuse(`the title is ${clean.length} characters long; keep it to 200 or fewer and put the detail in the entry`);
  return clean;
}

// Plans one decision or lesson entry: { kind, id, path, title, status, date, branch, integration, text, written }.
// The status is "accepted" on an integration branch and "proposed" anywhere else, including a detached HEAD. With
// { apply: true, gitDir } the file is created through the transactional writer, which refuses if it appeared meanwhile.
export function createEntry(project, kind, title, { branch, date = new Date(), apply = false, gitDir = null } = {}) {
  if (!Object.hasOwn(ENTRY_KINDS, kind)) refuse(`record makes "decision" or "lesson" entries, not "${kind}"`);
  const clean = checkTitle(title);
  const dir = project.directories[ENTRY_KINDS[kind]];
  inspectFolder(project.root, dir, `the ${ENTRY_KINDS[kind]} folder`);
  const onBranch = branch === undefined ? currentBranch(project.root) : branch;
  const integration = onBranch !== null && project.integrationBranches.includes(onBranch);
  const status = integration ? "accepted" : "proposed";
  const day = localDate(date);
  let id = null, path = null;
  for (let attempt = 0; attempt < 20 && id === null; attempt++) {
    const candidate = newId(clean, { date });
    if (!inspectPath(project.root, `${dir}/${candidate}.md`).exists) { id = candidate; path = `${dir}/${candidate}.md`; }
  }
  if (id === null) throw new OperationFailed(`no unused ID was found for this title in ${dir}/ after 20 tries; nothing was written`);
  const text = entryTemplate(kind, { title: clean, id, status, date: day });
  const entry = { kind, id, path, title: clean, status, date: day, branch: onBranch, integration, text, written: false };
  if (apply) {
    if (!gitDir) throw new Error("internal: createEntry needs gitDir to write");
    applyChanges({ root: project.root, gitDir, command: "record", changes: [{ path, before: null, after: Buffer.from(text, "utf8") }] });
    entry.written = true;
  }
  return entry;
}

// ---------- reading entries ----------

function parseEntryText(text, kind) {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/);
  const heading = kind === "tasks" ? /^# Task:\s*(.*?)\s*$/.exec(lines[0] ?? "") : /^#\s+(.*?)\s*$/.exec(lines[0] ?? "");
  const fields = {};
  for (const line of lines.slice(1)) {
    if (/^##(\s|$)/.test(line)) break;
    const m = /^- \*\*([A-Za-z][A-Za-z ]*):\*\*\s*(.*?)\s*$/.exec(line);
    if (m && !Object.hasOwn(fields, m[1])) fields[m[1]] = m[2];
  }
  return { title: heading?.[1] || null, fields };
}

const shown = (value) => (value.length > 60 ? `${value.slice(0, 57)}...` : value);

// { dir, entries, total, problems }. entries are sorted by ID; for tasks they are the open tasks only, and total counts
// every task file read. A file that cannot be indexed as it is gets a problem naming it, never silence. overlay maps
// a record's path (relative to the root) to the text it is about to hold, so a plan can index a write not yet made.
export function readEntries(project, kind, { overlay = null } = {}) {
  const dir = project.directories[kind];
  const folder = inspectFolder(project.root, dir, `the ${kind} folder`);
  const entries = [], problems = [], notes = [], numbered = [];
  let total = 0;
  if (!folder.exists) return { dir, entries, total, problems, notes };
  let names;
  try { names = readdirSync(folder.abs, { withFileTypes: true }); } catch (e) { throw new OperationFailed(`${dir}/ could not be listed (${e.code ?? "error"}); nothing was written`); }
  names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const dirent of names) {
    const name = dirent.name;
    if (name === "README.md" || !name.endsWith(".md")) continue;
    const rel = `${dir}/${name}`;
    const id = name.slice(0, -3);
    // A project that kept numbered entries (NNN-slug.md) before this runtime keeps them: they are its own record's
    // to list, said once as a note, never one problem per file (an owner's repository had hundreds, 2026-09-21).
    if (!isId(id)) { if (/^\d+-/.test(id)) numbered.push(name); else problems.push(`${rel} was not indexed: its name is not an entry ID (YYYY-MM-DD-<slug>-<four hex digits>.md)`); continue; }
    let st;
    try { st = lstatSync(join(folder.abs, name)); } catch (e) { problems.push(`${rel} was not indexed: it could not be inspected (${e.code ?? "error"})`); continue; }
    if (!st.isFile()) { problems.push(`${rel} was not indexed: it is not a regular file`); continue; }
    if (st.size > MAX_ENTRY_BYTES) { problems.push(`${rel} was not indexed: it is larger than 256 KB`); continue; }
    let text;
    if (overlay && overlay[rel] !== undefined) text = overlay[rel];
    else { try { text = readFileSync(join(folder.abs, name), "utf8"); } catch (e) { problems.push(`${rel} was not indexed: it could not be read (${e.code ?? "error"})`); continue; } }
    total++;
    const { title, fields } = parseEntryText(text, kind);
    if (!title) problems.push(`${rel} does not start with a "${kind === "tasks" ? "# Task: <title>" : "# <title>"}" line`);
    if (fields.ID === undefined) problems.push(`${rel} has no **ID:** line`);
    else if (fields.ID !== id) problems.push(`${rel} says its ID is ${shown(fields.ID)}; the file name is used`);
    if (kind === "tasks") {
      const state = fields.State ?? null;
      if (state === null) problems.push(`${rel} has no **State:** line, so it is listed as open`);
      else if (!TASK_STATES.includes(state)) problems.push(`${rel} has the state "${shown(state)}", which is not one of ${TASK_STATES.join(", ")}, so it is listed as open`);
      if (state !== null && CLOSED_TASK_STATES.includes(state)) continue;
      entries.push({ id, path: rel, title, state, branch: fields.Branch ?? null, owner: fields.Owner ?? null, updated: fields.Updated ?? null });
    } else {
      if (fields.Status === undefined) problems.push(`${rel} has no **Status:** line`);
      entries.push({ id, path: rel, title, status: fields.Status ?? null, date: fields.Date ?? null });
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (numbered.length) notes.push(`${dir}/: ${numbered.length} file(s) use the earlier numbering (${numbered.slice(0, 3).join(", ")}${numbered.length > 3 ? ", ..." : ""}) and are not entries this index manages; they stay listed the project's own way in its record`);
  return { dir, entries, total, problems, notes };
}

// ---------- index sections ----------

// The managed section of one kind in text, or null. Marker lines that are not exactly one section are refused.
export function findIndexSection(text, kind, label) {
  const start = indexStartMarker(kind), end = indexEndMarker(kind), prefix = `<!-- skilliton:index:${kind}:`;
  const spans = lineSpans(text);
  const starts = [], ends = [];
  spans.forEach((s, i) => {
    const t = s.body.trim();
    if (!t.startsWith(prefix)) return;
    if (t === start) starts.push(i);
    else if (t === end) ends.push(i);
    else refuse(`${label} line ${i + 1} starts like a ${kind} index marker but is not exactly "${start}" or "${end}". Fix that line by hand, then run index again. Nothing was written`);
  });
  const nums = (list) => list.map((i) => i + 1).join(", ");
  if (starts.length > 1 || ends.length > 1) refuse(`${label} has more than one ${kind} index ${starts.length > 1 ? `start marker (lines ${nums(starts)})` : `end marker (lines ${nums(ends)})`}. Keep one section, delete the other markers by hand, then run index again. Nothing was written`);
  if (starts.length !== ends.length) refuse(`${label} has a ${kind} index ${starts.length ? "start" : "end"} marker (line ${nums(starts.length ? starts : ends)}) without its partner. Add the missing "${starts.length ? end : start}" line or delete the lone marker, then run index again. Nothing was written`);
  if (!starts.length) return null;
  if (ends[0] < starts[0]) refuse(`${label} has its ${kind} index end marker (line ${ends[0] + 1}) before its start marker (line ${starts[0] + 1}). Fix the order by hand, then run index again. Nothing was written`);
  const s = spans[starts[0]], e = spans[ends[0]];
  return { startOffset: s.start + s.bom, endOffset: e.end, endHasNewline: text.slice(e.start, e.end).endsWith("\n"), startLineNo: starts[0] + 1, endLineNo: ends[0] + 1 };
}

// Plans the three sections: { branch, integration, sections: [{ kind, record, dir, count, total, hadSection,
// before, after, changed }], problems, result }. With { apply: true, gitDir } the changed records are written through
// the transactional writer, which is refused on a branch that is not an integration branch.
export function regenerateIndexes(project, { apply = false, gitDir = null, branch, overlay = null } = {}) {
  const onBranch = branch === undefined ? currentBranch(project.root) : branch;
  const integration = onBranch !== null && project.integrationBranches.includes(onBranch);
  const sections = [], problems = [], notes = [];
  for (const kind of INDEX_KINDS) {
    const role = INDEX_RECORD_ROLE[kind];
    const record = project.artifacts[role];
    const { dir, entries, total, problems: found, notes: foundNotes } = readEntries(project, kind, { overlay });
    problems.push(...found);
    notes.push(...foundNotes);
    const bytes = readPath(project.root, record, `the ${ROLE_LABELS[role]} ${project.artifacts[role]}`);
    if (bytes === null) refuse(`the ${ROLE_LABELS[role]} ${record} does not exist, so the ${kind} index has nowhere to go. Run skilliton prepare --apply first. Nothing was written`);
    const text = bytes.toString("latin1");
    const eol = detectEol(text);
    const rendered = Buffer.from(renderIndexSection(kind, { dir, recordPath: record, entries }), "utf8").toString("latin1").replace(/\n/g, eol);
    const section = findIndexSection(text, kind, record);
    // A record without markers and with nothing to list is left alone: an adopted record keeps its own history above,
    // and an appended "no entries yet" section would contradict it. The section arrives with the first entry.
    const deferred = !section && entries.length === 0;
    const next = deferred ? text : section
      ? text.slice(0, section.startOffset) + (section.endHasNewline ? rendered : rendered.slice(0, -eol.length)) + text.slice(section.endOffset)
      : text + (text === "" ? "" : (text.endsWith("\n") ? "" : eol) + eol) + rendered;
    sections.push({ kind, record, dir, count: entries.length, total: kind === "tasks" ? total : entries.length, hadSection: Boolean(section), deferred, before: bytes, after: Buffer.from(next, "latin1"), changed: next !== text });
  }
  let result = null;
  const changes = sections.filter((s) => s.changed).map((s) => ({ path: s.record, before: s.before, after: s.after }));
  if (apply && changes.length) {
    if (!integration) refuse(`indexes are written on an integration branch (${project.integrationBranches.join(", ")}), and ${onBranch === null ? "HEAD is detached" : `this branch is ${onBranch}`}. Nothing was written. The integrating session runs index after merging; entries on this branch are picked up then`);
    if (!gitDir) throw new Error("internal: regenerateIndexes needs gitDir to write");
    result = applyChanges({ root: project.root, gitDir, command: "index", changes });
  }
  return { branch: onBranch, integration, sections, problems, notes, result };
}
