// handoff.mjs: the shared handoff record (docs/HANDOFF.md by default), written mechanically by
// `skilliton checkpoint --handoff` on an integration branch. docs/CONTRACTS.md section 3 is the contract.
//
// The layout is the one the handoff skill describes and the session-start hook reads (lifecycle.mjs
// readHandoffRecord is unchanged): a head, "## RESUME HERE" with a "Written:" line and labelled bullets, "## Earlier"
// with at most KEEP_EARLIER "### <Written of that note>" entries, newest first, and older entries at the top of the
// handoff archive. Anything else a person put in the file (a preamble, another section) stays where it is.
//
//   parseHandoff(text)                    head, RESUME HERE, middle, Earlier entries and tail, line by line
//   renderHandoff(parsed)                 the text back in the fixed layout, with the file's own line ending
//   checkResumeAge(parsed, ...)           refuses a note whose Written time is ahead of the clock (or unreadable)
//   rotateHandoff(parsed, ...)            the previous note becomes the first Earlier entry; overflow is returned
//   prependArchive(text, entries)         the overflow goes to the top of the archive, below its header
//   planSharedHandoff / applySharedHandoff  one project's plan, and the transactional write of it
//
// The pure functions work on strings and never touch the file system. Text is handled as latin1 inside the plan so
// every byte of a file survives untouched; new text arrives as UTF-8 and is converted once. Nothing here imports
// from outside the plugin folder.

import { checkRecordPath } from "./config.mjs";
import { Refused } from "./core.mjs";
import { WRITTEN_AHEAD_MS, WRITTEN_ZONES, parseWritten } from "./lifecycle.mjs";
import { applyChanges, readPath } from "./prepare.mjs";
import { HANDOFF_PLACEHOLDER, recordTemplate } from "./project-files.mjs";
import { NOT_WRITTEN, fencedLines, itemsBetween } from "./tasks.mjs";

export const KEEP_EARLIER = 5;
const RESUME_HEADING = "## RESUME HERE";
const EARLIER_HEADING = "## Earlier";
const ARCHIVE_EMPTY_LINE = "No earlier handoffs have been archived.";
const HANDOFF_LABELS = ["State", "Next", "Blocked", "Watch out"];
// Values that mean "nobody wrote this yet"; they are never carried over from one note to the next.
const PLACEHOLDERS = [NOT_WRITTEN, HANDOFF_PLACEHOLDER];
const DEFAULT_BULLETS = { Blocked: "nothing", "Watch out": "nothing known" };

const BOM = String.fromCharCode(0xfeff);
const WRITTEN_RE = /^\s*(?:[-*]\s+)?(?:\*\*)?Written:(?:\*\*)?\s*(.*?)\s*$/;
const toLatin1 = (text) => Buffer.from(text, "utf8").toString("latin1");
const blank = (line) => line.trim() === "";

function trimBlank(lines, { leading = true } = {}) {
  let from = 0, to = lines.length;
  while (leading && from < to && blank(lines[from])) from++;
  while (to > from && blank(lines[to - 1])) to--;
  return lines.slice(from, to);
}

function splitLines(text) {
  const eol = text.indexOf("\r\n") >= 0 && text.indexOf("\r\n") <= text.indexOf("\n") ? "\r\n" : "\n";
  const bom = text.startsWith(BOM) ? BOM : "";
  const lines = text.slice(bom.length).split("\n").map((l) => l.replace(/\r$/, ""));
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return { eol, bom, lines };
}

const isPlaceholder = (value) => value !== null && value !== undefined && PLACEHOLDERS.includes(value.trim().replace(/\.$/, "").toLowerCase());

// { eol, bom, head, resume: { heading, written, writtenIndex, lines } | null, middle, earlier: { heading, preamble,
// entries: [{ heading, lines }] } | null, tail }. resume.lines are the block's lines after its heading, Written line
// included; entry lines are the lines after their "### " heading, trailing blank lines dropped (a blank line a person
// left after the heading is kept, so an existing file renders back byte for byte).
export function parseHandoff(text) {
  const { eol, bom, lines } = splitLines(text);
  const fenced = fencedLines(lines);
  const h2At = (i) => !fenced[i] && /^## /.test(lines[i]);
  const start = lines.findIndex((l, i) => !fenced[i] && l.startsWith(RESUME_HEADING));
  if (start < 0) return { eol, bom, head: lines, resume: null, middle: [], earlier: null, tail: [] };
  let end = start + 1;
  while (end < lines.length && !h2At(end)) end++;
  const block = lines.slice(start + 1, end);
  const writtenIndex = block.findIndex((l) => WRITTEN_RE.test(l));
  const written = writtenIndex >= 0 ? WRITTEN_RE.exec(block[writtenIndex])[1] : null;
  const resume = { heading: lines[start], written, writtenIndex, lines: block };
  let earlierAt = -1;
  for (let i = end; i < lines.length; i++) if (h2At(i) && lines[i].startsWith(EARLIER_HEADING)) { earlierAt = i; break; }
  if (earlierAt < 0) return { eol, bom, head: trimBlank(lines.slice(0, start)), resume, middle: [], earlier: null, tail: trimBlank(lines.slice(end)) };
  let earlierEnd = earlierAt + 1;
  while (earlierEnd < lines.length && !h2At(earlierEnd)) earlierEnd++;
  const preamble = [], entries = [];
  let current = null;
  for (let i = earlierAt + 1; i < earlierEnd; i++) {
    const h = !fenced[i] && /^### +(.*?)[ \t]*$/.exec(lines[i]);
    if (h) { current = { heading: h[1], lines: [] }; entries.push(current); continue; }
    (current ? current.lines : preamble).push(lines[i]);
  }
  const earlier = { heading: lines[earlierAt], preamble: trimBlank(preamble), entries: entries.map((e) => ({ heading: e.heading, lines: trimBlank(e.lines, { leading: false }) })) };
  return { eol, bom, head: trimBlank(lines.slice(0, start)), resume, middle: trimBlank(lines.slice(end, earlierAt)), earlier, tail: trimBlank(lines.slice(earlierEnd)) };
}

const joinBlocks = (blocks, eol, bom = "") => `${bom}${blocks.filter((b) => b.length).map((b) => b.join(eol)).join(`${eol}${eol}`)}${eol}`;
const entryBlock = (entry) => [`### ${entry.heading}`, ...entry.lines];

// The RESUME HERE section as the session-start hook prints it (heading and block), for the size note.
const resumeText = (parsed) => (parsed.resume ? joinBlocks([[parsed.resume.heading], trimBlank(parsed.resume.lines)], parsed.eol) : "");

export function renderHandoff(parsed) {
  const blocks = [parsed.head];
  if (parsed.resume) blocks.push([parsed.resume.heading], trimBlank(parsed.resume.lines));
  blocks.push(parsed.middle);
  if (parsed.earlier) {
    blocks.push([parsed.earlier.heading], parsed.earlier.preamble);
    for (const entry of parsed.earlier.entries) blocks.push(entryBlock(entry));
  }
  blocks.push(parsed.tail);
  return joinBlocks(blocks, parsed.eol, parsed.bom);
}

// The labelled bullets of the current RESUME HERE block: { State, Next, Blocked, "Watch out", Git } where present.
export function handoffBullets(parsed) {
  if (!parsed.resume) return {};
  return itemsBetween(parsed.resume.lines, 0, parsed.resume.lines.length);
}

// "YYYY-MM-DD HH:MM <zone>" in this machine's zone when the zone is one parseWritten reads and the offset agrees with
// the table; otherwise the UTC form "YYYY-MM-DDTHH:MMZ". Both round-trip through parseWritten to the same minute.
export function formatWritten(date) {
  const pad = (n) => String(n).padStart(2, "0");
  let zone = null;
  try { zone = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? null; } catch { zone = null; }
  if (zone && zone !== "Z" && Object.prototype.hasOwnProperty.call(WRITTEN_ZONES, zone.toUpperCase()) && WRITTEN_ZONES[zone.toUpperCase()] === -date.getTimezoneOffset()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${zone}`;
  }
  return `${date.toISOString().slice(0, 16)}Z`;
}

// The State bullet of a note: the state, then the evidence folded in as a sentence when there is any.
export function stateBullet({ state, evidence }) {
  const sentence = (text) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
  if (evidence === undefined || evidence === null || !String(evidence).trim()) return state.trim();
  return `${sentence(state)} Evidence: ${sentence(String(evidence))}`;
}

// Blocked and Watch out for a new note: the given value, else the previous note's value when a person wrote one,
// else the default. { bullets: { Blocked, "Watch out" }, carried: [label], defaulted: [label] }.
export function resolveBullets(given = {}, previous = {}) {
  const bullets = {}, carried = [], defaulted = [];
  for (const label of Object.keys(DEFAULT_BULLETS)) {
    const value = given[label];
    if (value !== undefined && value !== null && String(value).trim()) { bullets[label] = String(value).trim(); continue; }
    const before = previous[label];
    if (before !== undefined && before !== null && String(before).trim() && !isPlaceholder(String(before))) { bullets[label] = String(before).trim(); carried.push(label); continue; }
    bullets[label] = DEFAULT_BULLETS[label];
    defaulted.push(label);
  }
  return { bullets, carried, defaulted };
}

const renderBullets = (values) => Object.entries(values).filter(([, v]) => v !== undefined && v !== null).map(([label, value]) => `- **${label}:** ${value}`);

// Refuses (nothing written) when the record has no RESUME HERE section, no Written line, an unreadable Written value
// or one later than `at` by more than aheadMs. Returns { placeholder, writtenAt }.
export function checkResumeAge(parsed, { rel, at, aheadMs = WRITTEN_AHEAD_MS }) {
  const again = "then run the command again";
  if (!parsed.resume) throw new Refused(`${rel} has no "${RESUME_HEADING}" section, so the previous note cannot be found and kept. Nothing was written. Add that heading above the current note (docs/CONTRACTS.md section 3), ${again}`);
  if (parsed.resume.written === null) throw new Refused(`${rel} has no "Written:" line under "${RESUME_HEADING}", so the age of the previous note cannot be checked. Nothing was written. Add "Written: <date and time>" as the first line of that block, ${again}`);
  const raw = parsed.resume.written.trim();
  if (raw.toLowerCase() === HANDOFF_PLACEHOLDER) return { placeholder: true, writtenAt: null };
  const parsedTime = parseWritten(raw);
  if (!parsedTime.ok) throw new Refused(`${rel}: the Written value could not be read: ${parsedTime.reason}. Nothing was written. Fix that line, ${again}`);
  if (parsedTime.at.getTime() > at.getTime() + aheadMs) {
    throw new Refused(`${rel} says it was written ${raw}, which is later than this machine's clock (${at.toISOString()}) by more than ${Math.round(aheadMs / 60000)} minutes, so a new note would not read as the newer one. Nothing was written. Set that Written line to the time the note was really written, ${again}`);
  }
  return { placeholder: false, writtenAt: parsedTime.at };
}

// A new RESUME HERE block; the previous one becomes the first Earlier entry, headed by its Written value, unless it is
// the placeholder block preparation wrote. Entries beyond `keep` are returned as archived, oldest last.
// { parsed, rotated: heading | null, dropped: boolean, archived: [entry] }.
export function rotateHandoff(parsed, { written, bullets, keep = KEEP_EARLIER }) {
  const previous = parsed.resume;
  const entries = parsed.earlier ? parsed.earlier.entries.slice() : [];
  let rotated = null, dropped = false;
  if (previous) {
    if (previous.written !== null && previous.written.trim().toLowerCase() === HANDOFF_PLACEHOLDER) dropped = true;
    else {
      const heading = previous.written === null ? "undated" : previous.written.trim();
      entries.unshift({ heading, lines: trimBlank(previous.lines.filter((_, i) => i !== previous.writtenIndex)) });
      rotated = heading;
    }
  }
  const kept = entries.slice(0, keep), archived = entries.slice(keep);
  const resume = { heading: RESUME_HEADING, written, writtenIndex: 0, lines: [`Written: ${written}`, "", ...bullets] };
  const earlier = parsed.earlier ? { ...parsed.earlier, entries: kept } : kept.length ? { heading: EARLIER_HEADING, preamble: [], entries: kept } : null;
  return { parsed: { ...parsed, resume, earlier }, rotated, dropped, archived };
}

// Entries go above the first "### " entry of the archive when it has one, else below its header (the title line and
// the Kind line), replacing the "nothing archived yet" sentence preparation wrote.
export function prependArchive(text, entries) {
  if (!entries.length) return text;
  const { eol, bom, lines } = splitLines(text);
  const fenced = fencedLines(lines);
  const rendered = entries.map(entryBlock);
  const first = lines.findIndex((l, i) => !fenced[i] && /^### /.test(l));
  if (first >= 0) {
    const before = trimBlank(lines.slice(0, first));
    return joinBlocks([before, ...rendered, ...[lines.slice(first)]], eol, bom);
  }
  const kept = lines.filter((l) => l.trim() !== ARCHIVE_EMPTY_LINE);
  let headerEnd = kept.findIndex((l, i) => !fenced[i] && /^Kind:/.test(l));
  if (headerEnd < 0) headerEnd = kept.findIndex((l) => /^# /.test(l));
  const head = trimBlank(kept.slice(0, headerEnd + 1)), rest = trimBlank(kept.slice(headerEnd + 1));
  return joinBlocks([head, ...rendered, rest], eol, bom);
}

// Plans the shared handoff for one project: { rel, archiveRel, written, bullets, carried, defaulted, created,
// archiveCreated, rotated, dropped, archivedCount, resumeBytes, maxBytes, changes: [{ path, before, after }] }.
// Refuses before anything is planned when the current note cannot be judged (checkResumeAge). Nothing is written.
export function planSharedHandoff(project, { at, state, next, given = {}, git = null }) {
  const root = project.root, rel = project.artifacts.handoff, archiveRel = project.artifacts.handoffArchive;
  checkRecordPath(root, rel, "the handoff record");
  checkRecordPath(root, archiveRel, "the handoff archive");
  const bytes = readPath(root, rel, `the handoff record ${rel}`);
  const created = bytes === null;
  const text = created ? toLatin1(recordTemplate("handoff", project)) : bytes.toString("latin1");
  const parsed = parseHandoff(text);
  const age = checkResumeAge(parsed, { rel, at });
  const previous = handoffBullets(parsed);
  const { bullets: resolved, carried, defaulted } = resolveBullets(given, previous);
  const values = { State: state, Next: next, ...resolved };
  const written = formatWritten(at);
  const lines = renderBullets({ ...values, ...(git ? { Git: git } : {}) }).map(toLatin1);
  const keep = Number.isInteger(project.handoff?.keepEarlier) ? project.handoff.keepEarlier : KEEP_EARLIER;
  const { parsed: nextParsed, rotated, dropped, archived } = rotateHandoff(parsed, { written: toLatin1(written), bullets: lines, keep });
  const after = renderHandoff(nextParsed);
  const changes = [];
  if (after !== text || created) changes.push({ path: rel, before: bytes, after: Buffer.from(after, "latin1") });
  let archiveCreated = false;
  if (archived.length) {
    const archiveBytes = readPath(root, archiveRel, `the handoff archive ${archiveRel}`);
    archiveCreated = archiveBytes === null;
    const archiveText = archiveCreated ? toLatin1(recordTemplate("handoffArchive", project)) : archiveBytes.toString("latin1");
    const archiveAfter = prependArchive(archiveText, archived);
    changes.push({ path: archiveRel, before: archiveBytes, after: Buffer.from(archiveAfter, "latin1") });
  }
  const resumeBytes = resumeText(nextParsed).length;
  return {
    rel, archiveRel, written, bullets: values, carried, defaulted, created, archiveCreated, placeholder: age.placeholder,
    rotated: rotated === null ? null : Buffer.from(rotated, "latin1").toString("utf8"), dropped, archivedCount: archived.length,
    resumeBytes, maxBytes: project.handoff.maxBytes, changes,
  };
}

// Writes a plan from planSharedHandoff in one transaction (backups under the Git dir, rollback on failure). Throws
// TransactionFailed when a file changed since the plan was made. Returns applyChanges' result, or null for no change.
export function applySharedHandoff(project, plan, { gitDir }) {
  if (!plan.changes.length) return null;
  return applyChanges({ root: project.root, gitDir, command: "checkpoint", changes: plan.changes });
}
