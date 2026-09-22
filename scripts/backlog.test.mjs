#!/usr/bin/env node
// backlog.test.mjs: the relationship between docs/BACKLOG.md (what is left) and docs/BACKLOG_ARCHIVE.md (what closed).
//
// Each file reads fine alone, so only the relationship can be checked: an item with a row in both files, a finished
// item still in the live queue, an archived entry with no closure date, a detail section with no row, the same ID
// twice in one file. The security findings block the runtime writes into the backlog (SEC- rows between the
// skilliton:security-findings markers) is skipped, not shadowed: a present pair must be paired and in order.
//
//   node scripts/backlog.test.mjs              check this repository (exit 1 on a failure)
//   node scripts/backlog.test.mjs --self-test  prove each check can fail
//   --root <folder>  a repository other than this one (used by the tests)

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tableRows } from "./inventory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
const ROOT = rootArg > -1 ? resolve(argv[rootArg + 1]) : resolve(here, "..");
const OPEN = "docs/BACKLOG.md";
const ARCHIVE = "docs/BACKLOG_ARCHIVE.md";
const FINDINGS_START = "<!-- skilliton:security-findings:start -->";
const FINDINGS_END = "<!-- skilliton:security-findings:end -->";
const CLOSED_WORDS = ["done", "closed", "archived", "merged", "released"];
const ID = /^([BO]\d+)\b/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DETAIL = /^### ([BO]\d+)\b/;

// The text of a file with the findings block removed. Returns { text, failures } and never throws.
function withoutFindings(rel, text) {
  const starts = [...text.matchAll(new RegExp(FINDINGS_START.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&"), "g"))].map((m) => m.index);
  const ends = [...text.matchAll(new RegExp(FINDINGS_END.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&"), "g"))].map((m) => m.index);
  if (!starts.length && !ends.length) return { text, failures: [] };
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    return { text, failures: [`${rel}: the security findings markers must appear once each, start before end (found ${starts.length} start, ${ends.length} end)`] };
  }
  return { text: text.slice(0, starts[0]) + text.slice(ends[0] + FINDINGS_END.length), failures: [] };
}

// Rows of a file keyed by leading ID: { rows: Map(id -> cells), failures }. SEC- rows are never backlog rows.
function readRows(root, rel) {
  const failures = [];
  const path = join(root, rel);
  if (!existsSync(path)) return { rows: new Map(), details: [], failures: [`${rel} is missing`] };
  const stripped = withoutFindings(rel, readFileSync(path, "utf8"));
  failures.push(...stripped.failures);
  const rows = new Map();
  for (const cells of tableRows(stripped.text)) {
    const first = cells[0] ?? "";
    if (first.startsWith("SEC-")) continue;
    const m = first.match(ID);
    if (!m) { failures.push(`${rel}: a row has no B or O id in its first cell: ${JSON.stringify(first.slice(0, 40))}`); continue; }
    if (rows.has(m[1])) failures.push(`${rel}: ${m[1]} has two rows`);
    rows.set(m[1], cells);
  }
  const details = [...stripped.text.matchAll(new RegExp(DETAIL.source, "gm"))].map((m) => m[1]);
  return { rows, details, failures };
}

// Pure: every failure the two files produce together. Returns { failures }.
export function check(root) {
  const open = readRows(root, OPEN);
  const archive = readRows(root, ARCHIVE);
  const failures = [...open.failures, ...archive.failures];
  for (const id of open.rows.keys()) if (archive.rows.has(id)) failures.push(`${id} is an item in both files (${OPEN} and ${ARCHIVE})`);
  for (const [id, cells] of open.rows) {
    const state = (cells[2] ?? "").trim().toLowerCase();
    const word = state.split(/[^a-z]/)[0];
    if (CLOSED_WORDS.includes(word)) failures.push(`${OPEN}: ${id} is a row for an archived item (its State begins with "${word}"); move it to ${ARCHIVE} with its closure date`);
  }
  for (const [id, cells] of archive.rows) {
    if (!DATE.test((cells[2] ?? "").trim())) failures.push(`${ARCHIVE}: ${id} is an archived entry with no closure date (Closed must be YYYY-MM-DD, got ${JSON.stringify(cells[2] ?? "")})`);
  }
  for (const [rel, file] of [[OPEN, open], [ARCHIVE, archive]]) {
    for (const id of file.details) if (!file.rows.has(id)) failures.push(`${rel}: ${id} has a detail section with no row`);
  }
  return { failures, open: open.rows.size, archived: archive.rows.size };
}

if (argv.includes("--self-test")) {
  const clean = check(ROOT);
  if (clean.failures.length) { console.log(`SELF-TEST NOT RUN: this repository fails its own checks first:\n  ${clean.failures.join("\n  ")}`); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), "backlog-selftest-"));
  const edit = (d, rel, fn) => { const p = join(d, rel); writeFileSync(p, fn(readFileSync(p, "utf8"))); };
  const firstOpenRow = (text) => text.split("\n").find((l) => /^\| [BO]\d+/.test(l));
  const firstArchivedRow = (text) => text.split("\n").find((l) => /^\| [BO]\d+/.test(l));
  // [label, mutate, expected failure, or null when the mutation must still pass]
  const cases = [
    ["an item in both files", (d) => edit(d, ARCHIVE, (t) => t + `\n${firstOpenRow(readFileSync(join(d, OPEN), "utf8")).split("|").slice(0, 2).join("|")}| moved | 2026-09-18 | the self-test |\n`), /is an item in both files/],
    ["a row for an archived item", (d) => edit(d, OPEN, (t) => { const row = firstOpenRow(t); const cells = row.split("|"); cells[3] = " done, shipped in the self-test "; return t.replace(row, cells.join("|")); }), /is a row for an archived item/],
    ["an archived entry with no closure date", (d) => edit(d, ARCHIVE, (t) => { const row = firstArchivedRow(t); const cells = row.split("|"); cells[3] = " last week "; return t.replace(row, cells.join("|")); }), /is an archived entry with no closure date/],
    ["a detail section with no row", (d) => edit(d, OPEN, (t) => t + "\n### B9999 A section about an item with no row\n\nText.\n"), /B9999 has a detail section with no row/],
    ["the same ID twice in one file", (d) => edit(d, OPEN, (t) => { const row = firstOpenRow(t); return t.replace(row, `${row}\n${row}`); }), /has two rows/],
    ["a findings block with an end but no start", (d) => edit(d, OPEN, (t) => t + `\n${FINDINGS_END}\n`), /security findings markers must appear once each/],
    // The live backlog may already carry a real findings block (skilliton maintain writes one), so the case strips it first.
    ["a findings block in the backlog still passes", (d) => edit(d, OPEN, (t) => t.replace(new RegExp(`\\n?${FINDINGS_START}[\\s\\S]*?${FINDINGS_END}\\n?`), "\n") + `\n${FINDINGS_START}\n\n## Security findings\n\n| ID | Control | Finding |\n|---|---|---|\n| SEC-1 | SG-01 | a finding row that is not a backlog item |\n| done | not an id | this row would fail outside the block |\n\n${FINDINGS_END}\n`), null],
  ];
  let pass = 0;
  for (const [label, mutate, expect] of cases) {
    const d = join(tmp, label.replace(/\W+/g, "-"));
    cpSync(join(ROOT, OPEN), join(d, OPEN));
    cpSync(join(ROOT, ARCHIVE), join(d, ARCHIVE));
    mutate(d);
    const failures = check(d).failures;
    const ok = expect ? failures.some((f) => expect.test(f)) : failures.length === 0;
    console.log(`${ok ? "ok  " : "FAIL"} self-test: ${label} is ${expect ? (ok ? "caught" : "NOT caught") : (ok ? "accepted" : `rejected: ${failures.join("; ")}`)}`);
    if (ok) pass++;
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(pass === cases.length ? "self-test passed: every backlog check can fail and the findings block is skipped" : `SELF-TEST FAIL: ${cases.length - pass} case(s) did not behave`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}` || relative(process.argv[1] ?? "", fileURLToPath(import.meta.url)) === "") {
  const { failures, open, archived } = check(ROOT);
  if (failures.length) {
    console.log(`backlog: ${failures.length} problem(s) between ${OPEN} and ${ARCHIVE}:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`backlog: ${open} open item(s) and ${archived} archived item(s) agree (no item in both, no finished item in the live queue, every archived entry dated, every detail section has a row)`);
}
