#!/usr/bin/env node
// frameworks.test.mjs: the contract for scripts/frameworks-convert.mjs and the JSON it produces under
// packs/base/plugins/workflow/frameworks/ (N1, docs/tasks/2026-09-25-lane-frameworks-data-98cd.md).
//
// Two kinds of check here, split on purpose:
//   - STRUCTURAL checks read only the committed JSON in this repo. They always run, on any machine, because the
//     data they check is checked in.
//   - SOURCE checks (determinism, "committed equals a fresh conversion") need MojoComply's YAML, which lives in a
//     sibling project outside this repo's git history (see frameworks-convert.mjs's own header). Where
//     FRAMEWORKS_SOURCE_DIR (or its machine-specific default) does not resolve, these are reported NOT RUN, never
//     rounded up to a pass -- the same contract scripts/token-cost.mjs uses for its own --reference check.
//
//   node scripts/frameworks.test.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUTPUT_DIR, YamlError, convertAll, parseYaml, sourceDir } from "./frameworks-convert.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, notRun = 0;
const ok = (cond, label) => { console.log(`${cond ? "ok  " : "FAIL"} ${label}`); if (!cond) failures++; };
const skip = (label) => { console.log(`NOT RUN ${label}`); notRun++; };

// ---------------------------------------------------------------------------------------------------------------
// The minimal-reader contract itself, on small inline fixtures -- no MojoComply source needed.
// ---------------------------------------------------------------------------------------------------------------

{
  const good = 'meta:\n  framework: x\n  tier: regulation\ncontrols:\n  - id: a\n    weight: 3\n    note: "a two\n      line value"\n    small:\n      - one\n      - two\n    flow: [a, b, c]\n    empty_flow: []\n';
  const parsed = parseYaml(good, "fixture.yaml");
  ok(parsed.meta.framework === "x" && parsed.meta.tier === "regulation", "reads a block mapping");
  ok(parsed.controls[0].id === "a" && parsed.controls[0].weight === 3, "reads a block sequence of mappings, and coerces a bare integer scalar");
  ok(parsed.controls[0].note === "a two line value", "folds a multi-line double-quoted scalar into one space-joined string");
  ok(Array.isArray(parsed.controls[0].small) && parsed.controls[0].small.join(",") === "one,two", "reads a block sequence of plain scalars");
  ok(Array.isArray(parsed.controls[0].flow) && parsed.controls[0].flow.join(",") === "a,b,c", "reads a flow sequence");
  ok(Array.isArray(parsed.controls[0].empty_flow) && parsed.controls[0].empty_flow.length === 0, "reads an empty flow sequence");
}

{
  const folded = "meta:\n  note: >\n    first line\n    still first paragraph\n\n    second paragraph\n  status: approved\n";
  const parsed = parseYaml(folded, "fixture.yaml");
  ok(parsed.meta.note === "first line still first paragraph\nsecond paragraph\n", "folds a \">\" scalar: line breaks fold to spaces, a blank line becomes one newline, chomp clips to one trailing newline");
}

{
  const literal = "meta:\n  body: |\n    line one\n    line two\n";
  const parsed = parseYaml(literal, "fixture.yaml");
  ok(parsed.meta.body === "line one\nline two\n", 'a "|" literal scalar keeps its line breaks instead of folding them');
}

{
  const stripped = "meta:\n  note: >-\n    a stripped line\n";
  const parsed = parseYaml(stripped, "fixture.yaml");
  ok(parsed.meta.note === "a stripped line", '">-" strips the trailing newline a bare ">" would clip in');
}

// Refusals, each checked for BOTH firing and naming the right line.
const refusalCases = [
  { name: "a tab character", text: "meta:\n\tframework: x\n", line: 2 },
  { name: "an inline comment", text: "meta:\n  framework: x # not supported\n", line: 2 },
  { name: "a flow mapping", text: "meta:\n  framework: { a: 1 }\n", line: 2 },
  { name: "an anchor", text: "meta:\n  framework: &a x\n", line: 2 },
  { name: "a document marker", text: "---\nmeta:\n  framework: x\n", line: 1 },
  { name: "an unterminated double-quoted scalar", text: 'meta:\n  framework: "never closes\n', line: 3 },
  { name: "inconsistent block-scalar indentation", text: "meta:\n  note: >\n    line one\n      line two\n", line: 4 },
];
for (const c of refusalCases) {
  let threw = null;
  try { parseYaml(c.text, "fixture.yaml"); } catch (e) { threw = e; }
  ok(threw instanceof YamlError, `refuses ${c.name}`);
  ok(threw && threw.message.startsWith(`fixture.yaml:${c.line}:`), `refusal for ${c.name} names line ${c.line} (got: ${threw?.message ?? "no error"})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Structural validation of the committed JSON: always runs, needs nothing outside this repo.
// ---------------------------------------------------------------------------------------------------------------

const FRAMEWORKS_DIR = join(REPO, "packs/base/plugins/workflow/frameworks");
const allTopFiles = existsSync(FRAMEWORKS_DIR) ? readdirSync(FRAMEWORKS_DIR).filter((f) => f.endsWith(".json")) : [];
const libraryFiles = allTopFiles.filter((f) => f !== "scope-kb.json");
ok(libraryFiles.length === 8, `8 library/spine files are committed (found ${libraryFiles.length}: ${libraryFiles.join(", ")})`);

const crosswalkDir = join(FRAMEWORKS_DIR, "crosswalks");
const crosswalkFiles = existsSync(crosswalkDir) ? readdirSync(crosswalkDir).filter((f) => f.endsWith(".json")) : [];
ok(crosswalkFiles.length === 7, `7 crosswalk files are committed (found ${crosswalkFiles.length}: ${crosswalkFiles.join(", ")})`);

const readJson = (rel) => JSON.parse(readFileSync(join(FRAMEWORKS_DIR, rel), "utf8"));

let spine = null;
const spineIds = new Set();
if (libraryFiles.includes("nist-csf-2.json")) {
  spine = readJson("nist-csf-2.json");
  for (const fn of spine.functions ?? []) for (const cat of fn.categories ?? []) for (const sub of cat.subcategories ?? []) spineIds.add(sub.id);
}
ok(spineIds.size > 0, `the spine (nist-csf-2.json) has subcategory ids to check crosswalks against (${spineIds.size} found)`);

const libraryIdsByFramework = new Map();
for (const file of libraryFiles) {
  if (file === "nist-csf-2.json") continue;
  const data = readJson(file);
  const frameworkId = file.replace(/\.json$/, "");
  ok(typeof data.attribution === "string" && data.attribution.length > 0, `${file} carries a non-empty attribution string`);
  ok(data.meta && typeof data.meta.framework === "string", `${file} keeps meta.framework`);
  const ids = new Set();
  let dupes = 0, missingCitation = 0;
  for (const c of data.controls ?? []) {
    if (ids.has(c.id)) dupes++;
    ids.add(c.id);
    if (!c.citation || typeof c.citation !== "string" || c.citation.trim() === "") missingCitation++;
  }
  ok(dupes === 0, `${file}: every control id is unique (${dupes} duplicate(s))`);
  ok(missingCitation === 0, `${file}: every control has a citation (${missingCitation} missing)`);
  libraryIdsByFramework.set(frameworkId, ids);
}

for (const file of crosswalkFiles) {
  const data = readJson(join("crosswalks", file));
  const frameworkId = file.replace(/-to-nist-csf-2\.json$/, "");
  const controlIds = libraryIdsByFramework.get(frameworkId);
  ok(controlIds instanceof Set, `${file}: its library (${frameworkId}.json) is among the committed files`);
  ok(typeof data.attribution === "string" && data.attribution.length > 0, `${file} carries a non-empty attribution string`);
  let badControl = 0, badCsf = 0;
  for (const m of data.mappings ?? []) {
    if (controlIds && !controlIds.has(m.control_id)) badControl++;
    for (const csf of m.csf ?? []) if (!spineIds.has(csf)) badCsf++;
  }
  ok(badControl === 0, `${file}: every control_id exists in ${frameworkId}.json (${badControl} that do not)`);
  ok(badCsf === 0, `${file}: every csf id exists in the spine (${badCsf} that do not)`);
}

if (existsSync(join(FRAMEWORKS_DIR, "scope-kb.json"))) {
  const kb = readJson("scope-kb.json");
  const declaredFrameworks = new Set((kb.frameworks ?? []).map((f) => f.framework));
  // scope-kb intentionally still names soc2-tsc and pci-dss-v4 (never converted): it is a scoping map over every
  // framework MojoComply recognizes, not just the ones this repo redistributes as data.
  ok(declaredFrameworks.has("hipaa-security-rule") && declaredFrameworks.has("soc2-tsc"), "scope-kb.json keeps every framework entry from the source, converted or not");
} else skip("scope-kb.json structural check (file not committed)");

for (const [id, reason] of [["soc2-tsc", null], ["pci-dss-v4", null]]) {
  ok(!libraryFiles.includes(`${id}.json`), `${id}.json is never committed (copyright exclusion)`);
}

// ---------------------------------------------------------------------------------------------------------------
// Source-dependent checks: determinism, and committed JSON == a fresh conversion. NOT RUN off this machine.
// ---------------------------------------------------------------------------------------------------------------

const src = sourceDir();
if (!src || !existsSync(src)) {
  const why = src ? `source not found at ${src}` : "FRAMEWORKS_SOURCE_DIR is not set";
  skip(`determinism (run twice, byte-identical) -- ${why}`);
  skip(`committed JSON equals a fresh conversion from source -- ${why}`);
} else {
  let run1, run2;
  try { run1 = convertAll(src); run2 = convertAll(src); }
  catch (e) { ok(false, `convertAll runs against the real source without throwing (${e.message})`); run1 = run2 = null; }
  if (run1 && run2) {
    let mismatched = 0;
    for (const [rel, text] of run1.files) { if (run2.files.get(rel) !== text) mismatched++; }
    ok(mismatched === 0 && run1.files.size === run2.files.size, `the converter is deterministic: two runs from ${src} produce byte-identical output (${mismatched} mismatch(es), ${run1.files.size} vs ${run2.files.size} file(s))`);

    let driftCount = 0;
    for (const [rel, text] of run1.files) {
      const abs = join(OUTPUT_DIR, rel);
      if (!existsSync(abs) || readFileSync(abs, "utf8") !== text) driftCount++;
    }
    ok(driftCount === 0, `the committed JSON under ${OUTPUT_DIR} equals a fresh conversion from ${src} (${driftCount} file(s) drifted)`);
  }
}

console.log(failures
  ? `\nframeworks test FAILED: ${failures} check(s) (${notRun} NOT RUN)`
  : `\nframeworks test passed${notRun ? ` (${notRun} NOT RUN -- source-dependent, see above)` : ""}`);
process.exit(failures ? 1 : 0);
