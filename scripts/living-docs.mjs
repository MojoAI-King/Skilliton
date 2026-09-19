#!/usr/bin/env node
// living-docs.mjs: the living records stay short and generated.
//
// Three things a fresh session pays to read are bounded here, so they cannot grow back into a screen of prose:
//   1. docs/HANDOFF.md: the RESUME HERE block is at most RESUME_MAX_LINES lines and RESUME_MAX_BYTES bytes and carries
//      a Written line; "## Earlier" holds at most EARLIER_MAX entries (the rest belong in docs/HANDOFF_ARCHIVE.md).
//   2. docs/STATUS.md: the milestone table between the living-docs:milestones markers is generated from PLAN.md
//      section 7 (edit PLAN.md, then run --apply); a stale table fails the check.
//   3. docs/STATUS.md: the current-state paragraph is at most STATE_MAX_BYTES bytes, and the superseded paragraphs
//      live in docs/STATUS_ARCHIVE.md, which must exist with its Kind line.
//
//   node scripts/living-docs.mjs             same as --check
//   node scripts/living-docs.mjs --check     exit 1 when a bound is exceeded or the table is stale
//   node scripts/living-docs.mjs --apply     rewrite the generated table in docs/STATUS.md
//   node scripts/living-docs.mjs --self-test prove each check can fail
//   --root <folder>  a repository other than this one (used by the tests)

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { section, tableRows } from "./inventory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
const ROOT = rootArg > -1 ? resolve(argv[rootArg + 1]) : resolve(here, "..");

export const RESUME_MAX_LINES = 24;
export const RESUME_MAX_BYTES = 4500;
export const EARLIER_MAX = 5;
export const STATE_MAX_BYTES = 1000;
const HANDOFF = "docs/HANDOFF.md";
const STATUS = "docs/STATUS.md";
const STATUS_ARCHIVE = "docs/STATUS_ARCHIVE.md";
const PLAN = "PLAN.md";
const PLAN_SECTION = "## 7. Delivery gates and order";
const START = "<!-- living-docs:milestones:start -->";
const END = "<!-- living-docs:milestones:end -->";
const INPUTS = [HANDOFF, STATUS, STATUS_ARCHIVE, PLAN];

const bytes = (s) => Buffer.byteLength(s, "utf8");
const read = (root, rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);

// ---------- 1. the handoff ----------

// The RESUME HERE block and the Earlier entries of a handoff. Returns { resume: lines|null, earlier: count|null }.
export function handoffShape(text) {
  const lines = text.split("\n");
  const r = lines.findIndex((l) => l.trim() === "## RESUME HERE");
  if (r < 0) return { resume: null, earlier: null };
  let e = lines.findIndex((l, k) => k > r && /^## /.test(l));
  const stop = e < 0 ? lines.length : e;
  const resume = lines.slice(r, stop);
  while (resume.length && !resume[resume.length - 1].trim()) resume.pop();
  const earlierAt = lines.findIndex((l) => l.trim() === "## Earlier");
  let earlier = null;
  if (earlierAt >= 0) {
    const next = lines.findIndex((l, k) => k > earlierAt && /^## /.test(l));
    earlier = lines.slice(earlierAt, next < 0 ? lines.length : next).filter((l) => /^### /.test(l)).length;
  }
  return { resume, earlier };
}

function checkHandoff(root, failures) {
  const text = read(root, HANDOFF);
  if (text === null) { failures.push(`${HANDOFF} is missing`); return; }
  const { resume, earlier } = handoffShape(text);
  if (!resume) { failures.push(`${HANDOFF} has no "## RESUME HERE" heading`); return; }
  const n = resume.length, b = bytes(resume.join("\n"));
  if (n > RESUME_MAX_LINES) failures.push(`${HANDOFF}: the RESUME HERE block is ${n} lines; the limit is ${RESUME_MAX_LINES} (move detail to the task record or the decision entry)`);
  if (b > RESUME_MAX_BYTES) failures.push(`${HANDOFF}: the RESUME HERE block is ${b} bytes; the limit is ${RESUME_MAX_BYTES} (move detail to the task record or the decision entry)`);
  if (!resume.some((l) => /^Written: \S/.test(l))) failures.push(`${HANDOFF}: the RESUME HERE block has no "Written:" line`);
  if (earlier !== null && earlier > EARLIER_MAX) failures.push(`${HANDOFF}: "## Earlier" holds ${earlier} entries; the limit is ${EARLIER_MAX} (move the oldest to docs/HANDOFF_ARCHIVE.md)`);
}

// ---------- 2. the milestone table ----------

const tokens = (cell) => [...new Set([...cell.matchAll(/\b([BO]\d+)\b/g)].map((m) => m[1]))].sort((x, y) => x[0] === y[0] ? Number(x.slice(1)) - Number(y.slice(1)) : x < y ? -1 : 1);
const stateOf = (cell) => {
  const bold = cell.match(/^\*\*([^*]+)\*\*/);
  const phrase = bold ? bold[1] : cell.split(/[.(]/)[0];
  return phrase.trim().replace(/[.:]$/, "").trim();
};

// The rows of PLAN.md section 7 as { id, milestone, state, open }. Returns null when the section or its table is absent.
export function milestones(planText) {
  const s = section(planText, PLAN_SECTION);
  if (s === null) return null;
  const rows = tableRows(s).filter((r) => /^M\d+$/.test(r[0] ?? ""));
  if (!rows.length) return null;
  return rows.map((r) => ({ id: r[0], milestone: r[1] ?? "", state: stateOf(r[3] ?? ""), open: tokens(r[3] ?? "") }));
}

export function renderMilestones(rows) {
  const out = [START, "", `Written by \`node scripts/living-docs.mjs --apply\` from PLAN.md section 7 (the milestone table with its acceptance and evidence). PLAN.md is the file to edit; this table is the short view of it. State is the leading phrase of PLAN.md's State cell; Open items are the backlog and open-item IDs that cell names.`, "", "| ID | Milestone | State | Open items |", "|---|---|---|---|"];
  for (const r of rows) out.push(`| ${r.id} | ${r.milestone} | ${r.state} | ${r.open.length ? r.open.join(", ") : "none"} |`);
  out.push("", END);
  return out.join("\n");
}

// ---------- 3. the status file ----------

function checkStatus(root, failures, writes) {
  const text = read(root, STATUS);
  if (text === null) { failures.push(`${STATUS} is missing`); return; }
  const para = text.split("\n").find((l) => l.startsWith("Current state ("));
  if (!para) failures.push(`${STATUS} has no paragraph starting "Current state ("`);
  else if (bytes(para) > STATE_MAX_BYTES) failures.push(`${STATUS}: the current-state paragraph is ${bytes(para)} bytes; the limit is ${STATE_MAX_BYTES} (move the superseded text to ${STATUS_ARCHIVE} and point at the table below)`);
  const plan = read(root, PLAN);
  const rows = plan === null ? null : milestones(plan);
  if (!rows) failures.push(`${PLAN} has no "${PLAN_SECTION}" table with M<n> rows`);
  const s = text.indexOf(START), e = text.indexOf(END);
  if (s < 0 || e < 0 || e < s) failures.push(`${STATUS} has no ${START} ... ${END} block (add the two marker lines after the current-state paragraph, then run --apply)`);
  else if (rows) {
    const next = text.slice(0, s) + renderMilestones(rows) + text.slice(e + END.length);
    if (next !== text) { failures.push(`${STATUS}: the milestone table is stale against ${PLAN} section 7 (run --apply)`); writes.push([join(root, STATUS), next]); }
  }
  const archive = read(root, STATUS_ARCHIVE);
  if (archive === null) failures.push(`${STATUS_ARCHIVE} is missing (the superseded current-state paragraphs go there, newest first)`);
  else if (!archive.split("\n").slice(0, 8).some((l) => /^Kind: /.test(l))) failures.push(`${STATUS_ARCHIVE} has no "Kind:" line in its first 8 lines`);
}

// Pure: { failures, writes: [[path, text]] }. A stale table is a failure that --apply can fix; the rest are edits.
export function check(root) {
  const failures = [], writes = [];
  checkHandoff(root, failures);
  checkStatus(root, failures, writes);
  return { failures, writes };
}

if (argv.includes("--self-test")) {
  const clean = check(ROOT);
  if (clean.failures.length) { console.log(`SELF-TEST NOT RUN: this repository fails its own checks first:\n  ${clean.failures.join("\n  ")}`); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), "living-docs-selftest-"));
  const edit = (d, rel, fn) => { const p = join(d, rel); writeFileSync(p, fn(readFileSync(p, "utf8"))); };
  const padLines = "\n".concat(Array.from({ length: RESUME_MAX_LINES }, (_, k) => `- **Extra ${k}:** a line added by the self-test`).join("\n"));
  const cases = [
    ["a RESUME HERE block over the line limit", (d) => edit(d, HANDOFF, (t) => t.replace(/\n## Earlier/, `${padLines}\n\n## Earlier`)), /RESUME HERE block is \d+ lines; the limit is/],
    ["a RESUME HERE block over the byte limit", (d) => edit(d, HANDOFF, (t) => t.replace(/\n## Earlier/, `\n- **Extra:** ${"x".repeat(RESUME_MAX_BYTES)}\n\n## Earlier`)), /RESUME HERE block is \d+ bytes; the limit is/],
    ["a sixth Earlier entry", (d) => edit(d, HANDOFF, (t) => t.replace(/\n## Earlier\n/, "\n## Earlier\n" + "\n### 2020-01-01 00:00 UTC\n- **State:** an entry added by the self-test\n".repeat(EARLIER_MAX + 1))), /"## Earlier" holds \d+ entries; the limit is/],
    ["a RESUME HERE block with no Written line", (d) => edit(d, HANDOFF, (t) => t.replace(/^Written: .*$/m, "Composed: never")), /has no "Written:" line/],
    ["a stale milestone table", (d) => edit(d, PLAN, (t) => t.replace(/^\| M1 \| ([^|]*)\| ([^|]*)\| \*\*Verified locally\.\*\*/m, "| M1 | $1| $2| **Verified on the moon.**")), /milestone table is stale/],
    ["missing table markers in the status file", (d) => edit(d, STATUS, (t) => t.replace(START, "").replace(END, "")), /has no <!-- living-docs:milestones:start -->/],
    ["a current-state paragraph over the byte limit", (d) => edit(d, STATUS, (t) => t.replace(/^Current state \(/m, `Current state (${"y".repeat(STATE_MAX_BYTES)}`)), /current-state paragraph is \d+ bytes; the limit is/],
    ["a missing status archive", (d) => rmSync(join(d, STATUS_ARCHIVE)), /STATUS_ARCHIVE\.md is missing/],
  ];
  let pass = 0;
  for (const [label, mutate, expect] of cases) {
    const d = join(tmp, label.replace(/\W+/g, "-"));
    for (const rel of INPUTS) cpSync(join(ROOT, rel), join(d, rel));
    mutate(d);
    const caught = check(d).failures.some((f) => expect.test(f));
    console.log(`${caught ? "ok  " : "FAIL"} self-test: ${label} is ${caught ? "caught" : "NOT caught"}`);
    if (caught) pass++;
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(pass === cases.length ? "self-test passed: every living-docs check can fail" : `SELF-TEST FAIL: ${cases.length - pass} check(s) could not fail`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}` || relative(process.argv[1] ?? "", fileURLToPath(import.meta.url)) === "") {
  const { failures, writes } = check(ROOT);
  const stale = failures.filter((f) => /is stale/.test(f));
  const problems = failures.filter((f) => !/is stale/.test(f));
  if (argv.includes("--apply")) {
    for (const [p, text] of writes) writeFileSync(p, text);
    console.log(`living docs: ${writes.length} file(s) written (${writes.map(([p]) => relative(ROOT, p)).join(", ") || "the table was current"})`);
    if (problems.length) { console.log(`living docs: ${problems.length} problem(s) --apply cannot fix:\n  ${problems.join("\n  ")}`); process.exit(1); }
    process.exit(0);
  }
  if (failures.length) { console.log(`living docs: ${failures.length} problem(s):\n  ${failures.join("\n  ")}`); process.exit(1); }
  const { resume, earlier } = handoffShape(readFileSync(join(ROOT, HANDOFF), "utf8"));
  console.log(`living docs: current (RESUME HERE ${resume.length} of ${RESUME_MAX_LINES} lines and ${bytes(resume.join("\n"))} of ${RESUME_MAX_BYTES} bytes, ${earlier ?? 0} of ${EARLIER_MAX} earlier entries, the milestone table matches PLAN.md section 7, the current-state paragraph is within ${STATE_MAX_BYTES} bytes)`);
}
