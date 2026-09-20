// tasks.mjs: task records, one Markdown file per task under the project's tasks folder (default docs/tasks).
// docs/CONTRACTS.md sections 9 and 11 are the contract; change them together, with tests.
//
// File format written by createTask (the "## " sections are separated by blank lines):
//
//   # Task: <title>
//
//   Kind: Living. Task record.
//
//   - **ID:** <id>
//   - **State:** <one of TASK_STATES>
//   - **Branch:** <branch>
//   - **Owner:** <label, not an authenticated identity>
//   - **Updated:** <ISO date and time>
//
//   ## Request / ## Acceptance criteria / ## Decisions / ## Checkpoints / ## Handoff
//
// A checkpoint is a "### <ISO date and time>" heading inside "## Checkpoints" followed by four bullets: State,
// Evidence, Next and Git ("<branch> @ <short head>, <n> uncommitted").
//
// Reading tolerates human edits outside the header bullets (added prose, extra sections, CRLF line endings, fenced
// code) and is strict about the fields it needs: a missing, repeated or invalid ID, State, Branch, Owner or Updated
// makes the record unreadable, with the reason, never guessed. Edits change only the lines they own and keep every
// other byte. Nothing here imports from outside the plugin folder.

import { randomBytes } from "node:crypto";
import { chmodSync, constants as fsConstants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { checkRecordPath } from "./config.mjs";
import { Refused } from "./core.mjs";
import { isId, newId } from "./ids.mjs";

export const TASK_STATES = ["planned", "in-progress", "blocked", "review", "done-local", "merged", "released", "verified", "abandoned"];
export const CLOSED_STATES = ["done-local", "merged", "released", "verified", "abandoned"];
export const NOT_WRITTEN = "not yet written";
export const MAX_TASK_BYTES = 1024 * 1024;

const HEADER_FIELDS = ["ID", "State", "Branch", "Owner", "Updated"];
const HEADER_RE = /^[-*] \*\*(ID|State|Branch|Owner|Updated):\*\*(?:[ \t]+(.*?))?[ \t]*$/;
const ITEM_RE = /^[-*] \*\*(State|Evidence|Next|Git|Blocked|Watch out):\*\*(?:[ \t]+(.*?))?[ \t]*$/;
const CRITERION_RE = /^[-*] \[([ xX])\](?:[ \t]+(.*?))?[ \t]*$/;
const MAX_TITLE = 200, MAX_TEXT = 2000, MAX_LABEL = 100;

export class TaskRecordError extends Error {
  constructor(file, reason) { super(`unreadable task record: ${file}: ${reason}`); this.file = file; this.reason = reason; }
}

// The file changed between the moment a command read it and the moment it would have replaced it.
export class TaskChangedError extends Error {
  constructor(file) { super(`${file} changed while this command was running, so nothing was written; run the command again`); this.file = file; }
}

const isOpen = (task) => !CLOSED_STATES.includes(task.state);
const blank = (line) => line.replace(/\r$/, "").trim() === "";
const stripCr = (line) => line.replace(/\r$/, "");
const toLatin1 = (text) => Buffer.from(text, "utf8").toString("latin1");

// Task IDs follow the one ID rule in ids.mjs; a title with no letter or digit gives the slug "task".

// ---------- input checks (thrown as Refused, before anything is written) ----------

function oneLine(value, what, max) {
  if (typeof value !== "string" || !value.trim()) throw new Refused(`${what} must not be empty`);
  if (/[\r\n]/.test(value)) throw new Refused(`${what} must be one line (it contains a line break)`);
  if (value.length > max) throw new Refused(`${what} is ${value.length} characters; the limit is ${max}`);
  return value.trim();
}

export const checkTitle = (title) => oneLine(title, "the task title", MAX_TITLE);
export const checkText = (text, what) => oneLine(text, what, MAX_TEXT);
export const checkOwner = (owner) => oneLine(owner, "--owner", MAX_LABEL);

// Syntax only. A name git would refuse (spaces, "..", "@{", control characters, a leading "-") is refused here too.
export function checkBranch(name) {
  const value = oneLine(name, "the branch name", 200);
  const ok = /^[^\s~^:?*[\\\x00-\x1f\x7f]+$/.test(value) && !value.startsWith("-") && !value.startsWith("/") && !value.endsWith("/")
    && !value.endsWith(".") && !value.endsWith(".lock") && !value.includes("..") && !value.includes("@{") && !value.includes("//");
  if (!ok) throw new Refused(`"${value}" is not a usable branch name`);
  return value;
}

export function checkTaskId(id) {
  if (typeof id !== "string" || !isId(id)) throw new Refused(`"${id}" is not a task id (YYYY-MM-DD-<slug>-<four hex digits>, for example 2026-09-16-add-sign-in-form-3f9a)`);
  return id;
}

// ---------- rendering ----------

export function renderTask({ id, title, state = "in-progress", branch, owner, updated, request = null, criteria = [] }) {
  return [
    `# Task: ${title}`, "",
    "Kind: Living. Task record.", "",
    `- **ID:** ${id}`,
    `- **State:** ${state}`,
    `- **Branch:** ${branch}`,
    `- **Owner:** ${owner}`,
    `- **Updated:** ${updated}`, "",
    "## Request", "", request ?? NOT_WRITTEN, "",
    "## Acceptance criteria", "", ...(criteria.length ? criteria.map((c) => `- [ ] ${c}`) : [NOT_WRITTEN]), "",
    "## Decisions", "", NOT_WRITTEN, "",
    "## Checkpoints", "",
    "## Handoff", "",
    `- **State:** ${NOT_WRITTEN}`,
    `- **Next:** ${NOT_WRITTEN}`,
    `- **Blocked:** ${NOT_WRITTEN}`,
    `- **Watch out:** ${NOT_WRITTEN}`,
    "",
  ].join("\n");
}

export const gitLine = ({ branch, shortHead, dirty }) => `${branch ?? "(detached HEAD)"} @ ${shortHead ?? "(no commits)"}, ${dirty ?? "unknown"} uncommitted`;

export function renderCheckpointLines({ at, state, evidence, next, git }) {
  return [`### ${at}`, "", `- **State:** ${state}`, `- **Evidence:** ${evidence ?? "none given"}`, `- **Next:** ${next}`, `- **Git:** ${git}`];
}

// ---------- parsing ----------

// Which lines belong to fenced code (the fence lines included). Headings and fields inside fences are text. The
// handoff writer reads the same markdown and used to carry its own copy of this; this one is the general of the
// two, because it tolerates a carriage return the caller has not stripped.
export function fencedLines(lines) {
  const fenced = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = stripCr(lines[i]);
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      fenced[i] = true;
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.slice(m[0].length).trim()) fence = null;
    } else if (m) {
      fenced[i] = true;
      fence = m[1];
    }
  }
  return fenced;
}

// Line structure, outside fenced code: where the header ends, each "## " section, the header field lines, the title
// line and the "### " headings. Works on UTF-8 or latin1 text alike, because every marker it looks for is ASCII.
function analyze(lines) {
  const fenced = fencedLines(lines);
  const sections = [];
  let topEnd = lines.length, titleLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const line = stripCr(lines[i]);
    const h2 = /^## +(.*?)[ \t]*$/.exec(line);
    if (h2) {
      if (!sections.length) topEnd = i;
      else sections[sections.length - 1].end = i;
      sections.push({ name: h2[1], start: i, end: lines.length });
      continue;
    }
    if (!sections.length && titleLine < 0 && /^# /.test(line)) titleLine = i;
  }
  const fields = {};
  const repeated = [];
  for (let i = 0; i < topEnd; i++) {
    if (fenced[i]) continue;
    const m = HEADER_RE.exec(stripCr(lines[i]));
    if (!m) continue;
    if (fields[m[1]] !== undefined) repeated.push(m[1]);
    else fields[m[1]] = i;
  }
  const h3 = (from, to) => {
    const found = [];
    for (let i = from; i < to; i++) {
      if (fenced[i]) continue;
      const m = /^### +(.*?)[ \t]*$/.exec(stripCr(lines[i]));
      if (m) found.push({ text: m[1], line: i });
    }
    return found;
  };
  return { sections, topEnd, titleLine, fields, repeated, h3 };
}

const unquote = (value) => (value.length > 1 && value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1).trim() : value);

// Bullets (State, Evidence, Next, Git, Blocked, Watch out) between two line indexes, with indented continuation lines
// joined by a space. Returns a map from label to text.
export function itemsBetween(lines, from, to) {
  const items = {};
  let last = null;
  for (let i = from; i < to; i++) {
    const line = stripCr(lines[i]);
    const m = ITEM_RE.exec(line);
    if (m) { last = m[1]; if (items[last] === undefined) items[last] = (m[2] ?? "").trim(); else last = null; continue; }
    if (last && /^(?: {2,}|\t)\S/.test(line) && !/^\s*[-*] /.test(line)) { items[last] = `${items[last]} ${line.trim()}`.trim(); continue; }
    last = null;
  }
  return items;
}

// Parses task record text. label names the file in messages. Throws TaskRecordError for a missing field.
export function parseTask(text, label) {
  const fail = (reason) => { throw new TaskRecordError(label, reason); };
  const lines = text.split("\n");
  const a = analyze(lines);
  if (a.titleLine < 0) fail('no "# Task: <title>" heading before the first "## " section');
  const titleMatch = /^# Task:[ \t]*(.*?)[ \t]*$/.exec(stripCr(lines[a.titleLine]));
  if (!titleMatch || !titleMatch[1]) fail(`the first heading is not "# Task: <title>"`);
  if (a.repeated.length) fail(`the ${a.repeated[0]} field appears more than once in the header`);
  const values = {};
  for (const name of HEADER_FIELDS) {
    if (a.fields[name] === undefined) fail(`the ${name} field ("- **${name}:** ...") is missing from the header`);
    const m = HEADER_RE.exec(stripCr(lines[a.fields[name]]));
    const value = unquote((m[2] ?? "").trim());
    if (!value) fail(`the ${name} field is empty`);
    values[name] = value;
  }
  if (!isId(values.ID)) fail(`the ID "${values.ID}" is not a task id (YYYY-MM-DD-<slug>-<four hex digits>)`);
  if (!TASK_STATES.includes(values.State)) fail(`the State "${values.State}" is not one of: ${TASK_STATES.join(", ")}`);
  if (/\s/.test(values.Branch)) fail(`the Branch "${values.Branch}" contains a space, which no branch name can`);
  if (Number.isNaN(Date.parse(values.Updated))) fail(`the Updated value "${values.Updated}" is not a date and time`);

  const named = (name) => a.sections.filter((s) => s.name === name);
  for (const name of ["Checkpoints", "Handoff"]) if (named(name).length > 1) fail(`the "## ${name}" section appears more than once`);

  const checkpointsSection = named("Checkpoints")[0] ?? null;
  const headings = checkpointsSection ? a.h3(checkpointsSection.start + 1, checkpointsSection.end) : [];
  let lastCheckpoint = null;
  if (headings.length) {
    const lastHeading = headings[headings.length - 1];
    const items = itemsBetween(lines, lastHeading.line + 1, checkpointsSection.end);
    lastCheckpoint = { at: lastHeading.text, state: items.State ?? null, evidence: items.Evidence ?? null, next: items.Next ?? null, git: items.Git ?? null };
  }

  const handoffSection = named("Handoff")[0] ?? null;
  let handoff = null;
  if (handoffSection) {
    const items = itemsBetween(lines, handoffSection.start + 1, handoffSection.end);
    const pick = (label) => (items[label] === undefined || items[label] === "" ? null : items[label]);
    const candidate = { state: pick("State"), next: pick("Next"), blocked: pick("Blocked"), watchOut: pick("Watch out") };
    if (Object.values(candidate).some((v) => v !== null && v !== NOT_WRITTEN)) handoff = candidate;
  }

  const criteriaSection = named("Acceptance criteria")[0] ?? null;
  const criteria = [];
  if (criteriaSection) {
    for (let i = criteriaSection.start + 1; i < criteriaSection.end; i++) {
      const m = CRITERION_RE.exec(stripCr(lines[i]));
      if (m) criteria.push({ done: m[1] !== " ", text: (m[2] ?? "").trim() });
    }
  }

  return {
    id: values.ID, title: titleMatch[1], state: values.State, branch: values.Branch, owner: values.Owner, updated: values.Updated,
    checkpoints: headings.length, handoff,
    criteria, lastCheckpoint, sections: a.sections.map((s) => s.name),
  };
}

// Reads one task record. The contract shape is { id, title, state, branch, owner, updated, checkpoints, handoff };
// file, criteria, lastCheckpoint and sections are extra. label names the file in messages (default: the path).
export function readTask(file, { label = file } = {}) {
  let st;
  try { st = lstatSync(file); } catch (e) {
    throw new TaskRecordError(label, e.code === "ENOENT" ? "the file does not exist" : `the file could not be inspected (${e.code ?? e.message})`);
  }
  if (st.isSymbolicLink()) throw new TaskRecordError(label, "the file is a symbolic link, which Skilliton does not follow");
  if (!st.isFile()) throw new TaskRecordError(label, "it is not a regular file");
  if (st.size > MAX_TASK_BYTES) throw new TaskRecordError(label, `the file is ${st.size} bytes; a task record over ${MAX_TASK_BYTES} bytes is not read`);
  let text;
  try { text = readFileSync(file, "utf8"); } catch (e) { throw new TaskRecordError(label, `the file could not be read (${e.code ?? e.message})`); }
  const task = parseTask(text, label);
  const name = basename(file).replace(/\.md$/, "");
  if (task.id !== name) throw new TaskRecordError(label, `its ID ${task.id} does not match the file name ${basename(file)}`);
  return { ...task, file };
}

// ---------- listing ----------

export const tasksDirOf = (project) => join(project.root, project.directories.tasks);
export const taskRel = (project, id) => `${project.directories.tasks}/${id}.md`;

// Every task record in the tasks folder: { dir, exists, tasks, unreadable: [{ file, reason, message }] }. Only open
// tasks unless all is true. README.md is the folder's explanation, not a task; any other .md file whose name is not
// a task id is reported as unreadable.
export function listTasks(project, { all = false } = {}) {
  const rel = project.directories.tasks;
  checkRecordPath(project.root, rel, "the tasks folder");
  const dir = tasksDirOf(project);
  if (!existsSync(dir)) return { dir: rel, exists: false, tasks: [], unreadable: [] };
  if (!statSync(dir).isDirectory()) throw new Refused(`the tasks folder ${rel} is not a folder`);
  const tasks = [], unreadable = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))) {
    if (!entry.name.endsWith(".md") || entry.name.toLowerCase() === "readme.md" || entry.isDirectory()) continue;
    const label = `${rel}/${entry.name}`;
    const id = entry.name.slice(0, -3);
    try {
      if (!isId(id)) throw new TaskRecordError(label, "the file name is not a task id (YYYY-MM-DD-<slug>-<four hex digits>.md)");
      tasks.push(readTask(join(dir, entry.name), { label }));
    } catch (e) {
      if (!(e instanceof TaskRecordError)) throw e;
      unreadable.push({ file: label, reason: e.reason, message: e.message });
    }
  }
  return { dir: rel, exists: true, tasks: all ? tasks : tasks.filter(isOpen), unreadable };
}

// The rule for the current task, applied to tasks already read: Branch equals the checked-out branch and State is
// open. More than one is ambiguous, and none of them is picked.
export function pickCurrent(tasks, branch) {
  if (!branch) return { task: null, ambiguous: [] };
  const matches = tasks.filter((t) => t.branch === branch && isOpen(t));
  if (matches.length === 1) return { task: matches[0], ambiguous: [] };
  return { task: null, ambiguous: matches.map((t) => t.id).sort() };
}

// Contract shape { task, ambiguous }; unreadable lists the records that could not be judged.
export function currentTask(project, branch) {
  const listed = listTasks(project);
  return { ...pickCurrent(listed.tasks, branch), unreadable: listed.unreadable };
}

// A task by id, or null when no file has that id. An unreadable record throws TaskRecordError.
export function findTask(project, id) {
  checkTaskId(id);
  checkRecordPath(project.root, taskRel(project, id), "the task record");
  const file = join(tasksDirOf(project), `${id}.md`);
  let exists = true;
  try { lstatSync(file); } catch (e) { if (e.code === "ENOENT") exists = false; else throw e; }
  return exists ? readTask(file, { label: taskRel(project, id) }) : null;
}

// ---------- writing ----------

// Replaces a task file: recheck that it still holds what was read, back it up, write a sibling temporary file with
// the same mode, recheck again, then rename over the original. Symbolic and hard links are refused (config.mjs).
function replaceTaskFile(project, rel, before, after, { backupDir = null, command = "task" } = {}) {
  const target = checkRecordPath(project.root, rel, "the task record");
  if (readFileSync(target, "latin1") !== before) throw new TaskChangedError(rel);
  let backup = null;
  if (backupDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backup = join(backupDir, `${stamp}-${command}-${randomBytes(2).toString("hex")}`, rel);
    mkdirSync(dirname(backup), { recursive: true });
    copyFileSync(target, backup, fsConstants.COPYFILE_EXCL);
  }
  const mode = statSync(target).mode & 0o777;
  const temp = join(dirname(target), `.${basename(target)}.skilliton-${randomBytes(3).toString("hex")}.tmp`);
  writeFileSync(temp, Buffer.from(after, "latin1"), { flag: "wx", mode });
  try {
    chmodSync(temp, mode);
    if (readFileSync(target, "latin1") !== before) throw new TaskChangedError(rel);
    renameSync(temp, target);
  } catch (e) {
    try { unlinkSync(temp); } catch { /* the temporary file is already gone */ }
    throw e;
  }
  return { backup };
}

function replaceValue(line, value) {
  const cr = line.endsWith("\r") ? "\r" : "";
  const prefix = /^([-*] \*\*[A-Za-z ]+:\*\*)/.exec(stripCr(line))[1];
  return `${prefix} ${toLatin1(value)}${cr}`;
}

// Reads a task for editing: { rel, file, before (latin1), task }. The record is validated from the same bytes the
// edit will change, so a file replaced between two reads cannot slip through. Throws Refused when there is no task.
function openForEdit(project, id) {
  checkTaskId(id);
  const rel = taskRel(project, id);
  checkRecordPath(project.root, rel, "the task record");
  const file = join(tasksDirOf(project), `${id}.md`);
  if (!existsSync(file) && !isLink(file)) throw new Refused(`there is no task ${id} (looked for ${rel})`);
  readTask(file, { label: rel }); // the file checks: a regular file, not too large, ID matching the name
  const before = readFileSync(file, "latin1");
  const task = { ...parseTask(Buffer.from(before, "latin1").toString("utf8"), rel), file };
  if (task.id !== id) throw new TaskRecordError(rel, `its ID ${task.id} does not match the file name ${id}.md`);
  return { rel, file, before, task };
}

function isLink(file) {
  try { return lstatSync(file).isSymbolicLink(); } catch { return false; }
}

// Creates a task record. Without apply nothing is written and the returned id is only an example (the last four hex
// digits are drawn again when it is written). Returns { id, rel, content, written }.
export function createTask(project, { title, request = null, criteria = [], branch, owner = "unassigned", state = "in-progress", at = new Date().toISOString() }, { apply = false } = {}) {
  const cleanTitle = checkTitle(title);
  const cleanRequest = request === null || request === undefined ? null : checkText(request, "--request");
  const cleanCriteria = criteria.map((c, i) => checkText(c, `--criteria number ${i + 1}`));
  const cleanBranch = checkBranch(branch);
  const cleanOwner = checkOwner(owner);
  if (!TASK_STATES.includes(state)) throw new Refused(`"${state}" is not a task state (${TASK_STATES.join(", ")})`);
  checkRecordPath(project.root, project.directories.tasks, "the tasks folder");
  const dir = tasksDirOf(project);
  if (existsSync(dir) && !statSync(dir).isDirectory()) throw new Refused(`the tasks folder ${project.directories.tasks} is not a folder`);
  const attempt = () => {
    const id = newId(cleanTitle, { fallback: "task" });
    const rel = taskRel(project, id);
    checkRecordPath(project.root, rel, "the task record");
    return { id, rel, content: renderTask({ id, title: cleanTitle, state, branch: cleanBranch, owner: cleanOwner, updated: at, request: cleanRequest, criteria: cleanCriteria }) };
  };
  if (!apply) return { ...attempt(), written: false };
  mkdirSync(dir, { recursive: true });
  for (let tries = 0; tries < 8; tries++) {
    const plan = attempt();
    try {
      writeFileSync(join(project.root, plan.rel), plan.content, { flag: "wx" });
      return { ...plan, written: true };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  throw new Error(`eight task ids in a row already existed in ${project.directories.tasks}; nothing was written`);
}

export const HANDOFF_LABELS = ["State", "Next", "Blocked", "Watch out"];

// Rewrites the "## Handoff" section's labelled bullets in place: a label in values replaces the bullet (and drops the
// bullet's indented continuation lines); a label with no bullet is added in the fixed order; a section that does not
// exist is appended at the end. Labels absent from values are left as they are. Mutates and returns lines.
export function rewriteHandoffSection(lines, values, cr = "") {
  const a = analyze(lines);
  const section = a.sections.find((s) => s.name === "Handoff");
  const wanted = HANDOFF_LABELS.filter((label) => values[label] !== undefined && values[label] !== null);
  if (!section) {
    while (lines.length && blank(lines[lines.length - 1])) lines.pop();
    lines.push(cr, `## Handoff${cr}`, cr, ...wanted.map((label) => `- **${label}:** ${toLatin1(values[label])}${cr}`), "");
    return lines;
  }
  const found = {};
  for (let i = section.start + 1; i < section.end; i++) {
    const m = ITEM_RE.exec(stripCr(lines[i]));
    if (m && HANDOFF_LABELS.includes(m[1]) && found[m[1]] === undefined) found[m[1]] = i;
  }
  const isContinuation = (line) => /^(?: {2,}|\t)\S/.test(stripCr(line)) && !/^\s*[-*] /.test(stripCr(line));
  const present = Object.entries(found).sort((x, y) => y[1] - x[1]);
  for (const [label, at] of present) {
    let end = at + 1;
    while (end < lines.length && isContinuation(lines[end])) end++;
    if (values[label] === undefined || values[label] === null) continue;
    lines.splice(at, end - at, replaceValue(lines[at], values[label]));
  }
  const missing = wanted.filter((label) => found[label] === undefined);
  if (missing.length) {
    const b = analyze(lines);
    const s = b.sections.find((x) => x.name === "Handoff");
    let last = -1;
    for (let i = s.start + 1; i < s.end; i++) if (ITEM_RE.test(stripCr(lines[i])) || (last >= 0 && isContinuation(lines[i]))) last = i;
    const insert = missing.map((label) => `- **${label}:** ${toLatin1(values[label])}${cr}`);
    if (last >= 0) lines.splice(last + 1, 0, ...insert);
    else {
      let at = s.start + 1;
      while (at < s.end && blank(lines[at])) at++;
      lines.splice(s.start + 1, 0, cr, ...insert, ...(at < s.end ? [cr] : []));
    }
  }
  return lines;
}

// Plans (and with apply writes) one checkpoint at the end of the "## Checkpoints" section, and sets Updated. With
// handoff (a map of Handoff labels to text) the "## Handoff" bullets are rewritten in the same write. With aheadMs,
// a record whose Updated is later than the checkpoint time by more than that is refused (a clock typed ahead would
// make the new checkpoint read as the older one).
// checkpoint: { at, state, evidence, next, git: { branch, shortHead, dirty } }.
// Returns { rel, file, task, before, after, lines, handoffLines, backup, written }.
export function appendCheckpoint(project, id, checkpoint, { apply = false, backupDir = null, handoff = null, aheadMs = null } = {}) {
  const state = checkText(checkpoint.state, "--state");
  const next = checkText(checkpoint.next, "--next");
  const evidence = checkpoint.evidence === undefined || checkpoint.evidence === null ? "none given" : checkText(checkpoint.evidence, "--evidence");
  const at = checkpoint.at ?? new Date().toISOString();
  const { rel, file, before, task } = openForEdit(project, id);
  if (aheadMs !== null) {
    const updatedMs = Date.parse(task.updated), atMs = Date.parse(at);
    if (Number.isFinite(updatedMs) && Number.isFinite(atMs) && updatedMs > atMs + aheadMs) {
      throw new Refused(`${rel} says it was updated ${task.updated}, which is later than this machine's clock (${at}) by more than ${Math.round(aheadMs / 60000)} minutes, so the new checkpoint would read as the older one. Nothing was written. Fix the Updated line, then run the command again`);
    }
  }
  const lines = before.split("\n");
  const a = analyze(lines);
  const section = a.sections.find((s) => s.name === "Checkpoints");
  if (!section) throw new TaskRecordError(rel, 'there is no "## Checkpoints" section to add a checkpoint to; add that heading back and run the command again');
  const cr = lines[0].endsWith("\r") ? "\r" : "";
  let last = section.start;
  for (let i = section.start + 1; i < section.end; i++) if (!blank(lines[i])) last = i;
  const added = renderCheckpointLines({ at, state, evidence, next, git: gitLine(checkpoint.git ?? {}) });
  const block = ["", ...added].map((line) => `${toLatin1(line)}${cr}`);
  if (last + 1 < lines.length && !blank(lines[last + 1])) block.push(cr);
  const updated = lines.slice();
  updated[a.fields.Updated] = replaceValue(updated[a.fields.Updated], at);
  updated.splice(last + 1, 0, ...block);
  let handoffLines = [];
  if (handoff) {
    const values = {};
    for (const label of HANDOFF_LABELS) if (handoff[label] !== undefined && handoff[label] !== null) values[label] = checkText(handoff[label], `the Handoff ${label} line`);
    rewriteHandoffSection(updated, values, cr);
    handoffLines = Object.entries(values).map(([label, value]) => `- **${label}:** ${value}`);
  }
  const plan = { rel, file, task, before, after: updated.join("\n"), lines: added, handoffLines, changed: true, backup: null, written: false };
  return apply ? writeTaskPlan(project, plan, { backupDir, command: "checkpoint" }) : plan;
}

// Writes a plan from appendCheckpoint or closeTask. The file must still hold plan.before, byte for byte, both before
// the backup and immediately before the replacement; otherwise TaskChangedError, and nothing is written.
export function writeTaskPlan(project, plan, { backupDir = null, command = "task" } = {}) {
  if (!plan.changed) return plan;
  const { backup } = replaceTaskFile(project, plan.rel, plan.before, plan.after, { backupDir, command });
  return { ...plan, backup, written: true };
}

// Plans (and with apply writes) a closing State and a new Updated time. Only the two header lines change.
// Returns { rel, file, task, before, after, changed, backup, written }.
export function closeTask(project, id, newState, { apply = false, backupDir = null, at = new Date().toISOString() } = {}) {
  if (!CLOSED_STATES.includes(newState)) {
    throw new Refused(`--state ${JSON.stringify(newState)} does not close a task; use one of: ${CLOSED_STATES.join(", ")}${TASK_STATES.includes(newState) ? ` (${newState} is an open state: edit the State line by hand to set it)` : ""}`);
  }
  const { rel, file, before, task } = openForEdit(project, id);
  if (task.state === newState) return { rel, file, task, before, after: before, changed: false, backup: null, written: false };
  const lines = before.split("\n");
  const a = analyze(lines);
  lines[a.fields.State] = replaceValue(lines[a.fields.State], newState);
  lines[a.fields.Updated] = replaceValue(lines[a.fields.Updated], at);
  const plan = { rel, file, task, before, after: lines.join("\n"), changed: true, backup: null, written: false };
  return apply ? writeTaskPlan(project, plan, { backupDir, command: "task-close" }) : plan;
}
