#!/usr/bin/env node
// report-card.mjs: the master progress bars in docs/REPORT_CARD.md, computed from the batch files under docs/areas/.
//
// A bar is a count: ticked acceptance items over all acceptance items in an area's batches. It is never a time,
// cost or savings figure (PLAN.md sections 6 and 8). A ticked item must say what proves it, in the form
// "(evidence: ...)" at the end of the line, or the check fails: a box cannot be ticked on belief.
//
//   node scripts/report-card.mjs            print the bars
//   node scripts/report-card.mjs --apply    write the generated block into docs/REPORT_CARD.md and each AREA.md
//   node scripts/report-card.mjs --check    exit 1 when the written blocks differ from the computed ones
//   node scripts/report-card.mjs --self-test  prove each check can fail
//   --root <folder>  a repository other than this one (used by the tests)

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
const ROOT = rootArg > -1 ? resolve(argv[rootArg + 1]) : resolve(here, "..");
const AREAS = "docs/areas";
const CARD = "docs/REPORT_CARD.md";
const START = "<!-- report-card:start -->";
const END = "<!-- report-card:end -->";
const CELLS = 20;
const TYPES = ["build", "research", "measure", "owner", "blocked"];

export const bar = (done, total) => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const filled = Math.round((pct / 100) * CELLS);
  return `\`[${"#".repeat(filled)}${".".repeat(CELLS - filled)}]\` ${pct} (${done} of ${total})`;
};

const field = (text, name) => {
  const m = text.match(new RegExp(`^- \\*\\*${name}:\\*\\* (.*)$`, "m"));
  return m ? m[1].trim() : null;
};
// The H1, without a leading batch or area id ("# 01 Install" and "# 01-autopilot-loop The loop" both give the plain title).
const title = (text) => { const m = text.match(/^# (.+)$/m); return m ? m[1].replace(/^\d\d(-[a-z0-9-]+)?\s+/, "").trim() : null; };

// Reads every area and batch. Returns { areas, failures }. Never throws on content problems; they are failures.
export function read(root) {
  const failures = [];
  const dir = join(root, AREAS);
  if (!existsSync(dir)) return { areas: [], failures: [`${AREAS}/ does not exist`] };
  const areas = [];
  for (const name of readdirSync(dir).filter((n) => /^\d\d-[a-z0-9-]+$/.test(n)).sort()) {
    const adir = join(dir, name);
    const areaPath = join(adir, "AREA.md");
    const rel = `${AREAS}/${name}`;
    if (!existsSync(areaPath)) { failures.push(`${rel}/AREA.md is missing`); continue; }
    const atext = readFileSync(areaPath, "utf8");
    const area = { name, rel, title: title(atext), grade: (field(atext, "Grade") ?? "").split(/\s/)[0] || null, batches: [], done: 0, total: 0 };
    if (!area.title) failures.push(`${rel}/AREA.md has no title line`);
    if (!area.grade) failures.push(`${rel}/AREA.md has no "- **Grade:**" line`);
    if (!/^- \*\*Build progress:\*\* /m.test(atext)) failures.push(`${rel}/AREA.md has no "- **Build progress:**" line for the generator to write`);
    const files = readdirSync(adir).filter((n) => /^batch-\d\d-[a-z0-9-]+\.md$/.test(n)).sort();
    if (!files.length) failures.push(`${rel}/ has no batch files`);
    for (const f of files) {
      const brel = `${rel}/${f}`;
      const text = readFileSync(join(adir, f), "utf8");
      const b = { file: f, rel: brel, id: f.slice(6, 8), title: title(text), type: field(text, "Type"), done: 0, total: 0 };
      if (!b.title) failures.push(`${brel} has no title line`);
      if (!b.type || !TYPES.includes(b.type.split(/[ ,(]/)[0])) failures.push(`${brel}: "- **Type:**" must start with one of ${TYPES.join(", ")} (got ${JSON.stringify(b.type)})`);
      const m = text.match(/^## Acceptance\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
      if (!m) { failures.push(`${brel} has no "## Acceptance" section`); area.batches.push(b); continue; }
      for (const line of m[1].split("\n")) {
        if (!line.trim()) continue;
        const item = line.match(/^- \[([ x])\] (.+)$/);
        if (!item) { failures.push(`${brel}: a line under Acceptance is not a "- [ ]" or "- [x]" item: ${JSON.stringify(line.slice(0, 60))}`); continue; }
        b.total++;
        if (item[1] === "x") {
          b.done++;
          if (!/\(evidence: [^()]+\)\s*$/.test(item[2])) failures.push(`${brel}: a ticked item does not end with "(evidence: ...)": ${JSON.stringify(item[2].slice(0, 60))}`);
        }
      }
      if (!b.total) failures.push(`${brel} has no acceptance items`);
      area.done += b.done; area.total += b.total;
      area.batches.push(b);
    }
    areas.push(area);
  }
  if (!areas.length) failures.push(`${AREAS}/ holds no area folders (NN-name)`);
  return { areas, failures };
}

// The card's block: one row per area. The per-batch tables live in each AREA.md (renderArea), so the card stays short.
export function render(areas) {
  const done = areas.reduce((a, x) => a + x.done, 0), total = areas.reduce((a, x) => a + x.total, 0);
  const out = [START, "", `Generated by \`node scripts/report-card.mjs --apply\` from the batch files under \`docs/areas/\`. A bar counts ticked acceptance items over all acceptance items; it is not a time, cost or savings figure. Every ticked item names its evidence. Each area's own file lists its batches with a bar each.`, "", `**All areas:** ${bar(done, total)}`, "", "| Area | Grade given | Batches | Build progress (count) |", "|---|---|---|---|"];
  for (const a of areas) out.push(`| [${a.name}](areas/${a.name}/AREA.md) ${a.title ?? ""} | ${a.grade ?? "?"} | ${a.batches.length} | ${bar(a.done, a.total)} |`);
  out.push("", END);
  return out.join("\n");
}

export function renderArea(a) {
  const out = [START, "", "| Batch | Type | Progress |", "|---|---|---|"];
  for (const b of a.batches) out.push(`| [${b.id} ${b.title ?? b.file}](${b.file}) | ${b.type ?? "?"} | ${bar(b.done, b.total)} |`);
  out.push("", END);
  return out.join("\n");
}

const areaLine = (a) => `- **Build progress:** ${bar(a.done, a.total)} across ${a.batches.length} batch(es), by \`node scripts/report-card.mjs --apply\``;

// Compares the written blocks with the computed ones. Returns { failures, writes: [[path, newText]] }.
export function check(root) {
  const { areas, failures } = read(root);
  const writes = [];
  if (failures.length) return { failures, writes, areas };
  const cardPath = join(root, CARD);
  if (!existsSync(cardPath)) failures.push(`${CARD} is missing`);
  else {
    const text = readFileSync(cardPath, "utf8");
    const s = text.indexOf(START), e = text.indexOf(END);
    if (s < 0 || e < 0 || e < s) failures.push(`${CARD} has no ${START} ... ${END} block`);
    else {
      const block = render(areas);
      const next = text.slice(0, s) + block + text.slice(e + END.length);
      if (next !== text) { failures.push(`${CARD}: the generated block is stale (run --apply)`); writes.push([cardPath, next]); }
    }
  }
  for (const a of areas) {
    const p = join(root, a.rel, "AREA.md");
    const text = readFileSync(p, "utf8");
    let next = text.replace(/^- \*\*Build progress:\*\* .*$/m, areaLine(a));
    const s = next.indexOf(START), e = next.indexOf(END);
    if (s < 0 || e < 0 || e < s) failures.push(`${a.rel}/AREA.md has no ${START} ... ${END} block for its batch table`);
    else next = next.slice(0, s) + renderArea(a) + next.slice(e + END.length);
    if (next !== text) { failures.push(`${a.rel}/AREA.md: the Build progress line or the batch table is stale (run --apply)`); writes.push([p, next]); }
  }
  return { failures, writes, areas };
}

if (argv.includes("--self-test")) {
  const clean = check(ROOT);
  if (clean.failures.length) { console.log(`SELF-TEST NOT RUN: this repository fails its own checks first:\n  ${clean.failures.join("\n  ")}`); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), "report-card-selftest-"));
  const first = clean.areas[0];
  const firstBatch = first.batches[0];
  const cases = [
    ["a ticked item with no evidence", (d) => { const p = join(d, firstBatch.rel); writeFileSync(p, readFileSync(p, "utf8").replace(/^- \[ \] (.+)$/m, "- [x] $1")); }, /a ticked item does not end with "\(evidence: \.\.\.\)"/],
    ["a stale block in the card", (d) => { const p = join(d, firstBatch.rel); writeFileSync(p, readFileSync(p, "utf8").replace(/^## Acceptance\n/m, "## Acceptance\n- [ ] an item added after the last apply\n")); }, /REPORT_CARD\.md: the generated block is stale/],
    ["a batch with no acceptance items", (d) => { const p = join(d, firstBatch.rel); writeFileSync(p, readFileSync(p, "utf8").replace(/^## Acceptance\n[\s\S]*?(?=^## |(?![\s\S]))/m, "## Acceptance\n\n")); }, /has no acceptance items/],
    ["an unknown batch type", (d) => { const p = join(d, firstBatch.rel); writeFileSync(p, readFileSync(p, "utf8").replace(/^- \*\*Type:\*\* .*$/m, "- **Type:** wish")); }, /must start with one of/],
    ["an area without a Build progress line", (d) => { const p = join(d, first.rel, "AREA.md"); writeFileSync(p, readFileSync(p, "utf8").replace(/^- \*\*Build progress:\*\* .*$/m, "")); }, /has no "- \*\*Build progress:\*\*" line/],
    ["an area without a batch table block", (d) => { const p = join(d, first.rel, "AREA.md"); writeFileSync(p, readFileSync(p, "utf8").replace(START, "")); }, /AREA\.md has no <!-- report-card:start -->/],
    ["a stale batch table in an area", (d) => { const p = join(d, firstBatch.rel); writeFileSync(p, readFileSync(p, "utf8").replace(/^- \[ \] (.+)$/m, "- [x] $1 (evidence: the self-test)")); }, /AREA\.md: the Build progress line or the batch table is stale/],
    ["a missing AREA.md", (d) => rmSync(join(d, first.rel, "AREA.md")), /AREA\.md is missing/],
    ["a stray line under Acceptance", (d) => { const p = join(d, firstBatch.rel); writeFileSync(p, readFileSync(p, "utf8").replace(/^## Acceptance\n/m, "## Acceptance\nnot an item\n")); }, /is not a "- \[ \]" or "- \[x\]" item/],
  ];
  let pass = 0;
  for (const [label, mutate, expect] of cases) {
    const d = join(tmp, label.replace(/\W+/g, "-"));
    cpSync(join(ROOT, "docs", "areas"), join(d, "docs", "areas"), { recursive: true });
    cpSync(join(ROOT, CARD), join(d, CARD));
    mutate(d);
    const caught = check(d).failures.some((f) => expect.test(f));
    console.log(`${caught ? "ok  " : "FAIL"} self-test: ${label} is ${caught ? "caught" : "NOT caught"}`);
    if (caught) pass++;
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(pass === cases.length ? "self-test passed: every report-card check can fail" : `SELF-TEST FAIL: ${cases.length - pass} check(s) could not fail`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}` || relative(process.argv[1] ?? "", fileURLToPath(import.meta.url)) === "") {
  const { failures, writes, areas } = check(ROOT);
  const stale = failures.filter((f) => /is stale/.test(f));
  const problems = failures.filter((f) => !/is stale/.test(f));
  if (problems.length) {
    console.log(`report card: ${problems.length} problem(s) in the batch files:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (argv.includes("--apply")) {
    for (const [p, text] of writes) writeFileSync(p, text);
    console.log(`report card: ${writes.length} file(s) written (${writes.map(([p]) => relative(ROOT, p)).join(", ") || "nothing was stale"})`);
    process.exit(0);
  }
  if (argv.includes("--check")) {
    console.log(stale.length ? `report card: STALE\n  ${stale.join("\n  ")}` : "report card: current (the written bars match the batch files)");
    process.exit(stale.length ? 1 : 0);
  }
  for (const a of areas) {
    console.log(`${a.name} ${a.title ?? ""} (grade ${a.grade ?? "?"}): ${bar(a.done, a.total)}`);
    for (const b of a.batches) console.log(`  ${b.id} ${b.title ?? b.file} [${b.type ?? "?"}]: ${bar(b.done, b.total)}`);
  }
  if (stale.length) console.log(`(${stale.length} written block(s) are stale; run --apply)`);
}
