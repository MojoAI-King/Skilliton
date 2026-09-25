#!/usr/bin/env node
// compliance-words.test.mjs: the vocabulary law of the compliance feature (lane N4; decision
// 2026-09-25-compliance-lives-in-public-skilliton-as-39ef). Skilliton assesses and prepares; nothing it writes or
// prints may claim a result it cannot give. This check fails when any of these holds a banned word:
//
//   the sheet            the control record written for the synthetic project of the sheet test
//                        (scripts/fixtures/compliance/synthetic-project.mjs, through writeSheet --apply)
//   what it prints       every output of commands/compliance.mjs: help, scope as text and JSON, scope --apply, sheet as
//                        text and JSON, sheet --apply, and its refusals, on fixture projects; scope is also run against
//                        the plugin's own frameworks folder, so a converted knowledge base's printed text is covered
//   its source           commands/compliance.mjs and lib/compliance-*.mjs, comments included
//   frameworks data      every file under packs/base/plugins/workflow/frameworks/. A JSON file there may quote a
//                        regulation's own text, so for those only "compliant" and "certified" are checked, and only
//                        outside a citation or requirement field (keys are checked too); any other file gets all four
//
// The banned words, case-insensitive and whole words only: compliant, certified, certify, passes.
//
//   node scripts/compliance-words.test.mjs              exit 0 when nothing holds a banned word, 1 when something does,
//                                                       2 when the check could not run
//   node scripts/compliance-words.test.mjs --self-test  points the check at scripts/fixtures/compliance/words/, which
//                                                       plants each word, shows the failures, and exits 0 only when
//                                                       every planted word is found and every exempt one is not

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSheet } from "../packs/base/plugins/workflow/runtime/lib/compliance-sheet.mjs";
import { makeSyntheticProject } from "./fixtures/compliance/synthetic-project.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(REPO, "packs/base/plugins/workflow/runtime");
const FRAMEWORKS = join(REPO, "packs/base/plugins/workflow/frameworks");
const FIXTURES = join(REPO, "scripts/fixtures/compliance");
const CLI = join(RUNTIME, "skilliton.mjs");

export const WORDS = ["compliant", "certified", "certify", "passes"];
export const JSON_WORDS = ["compliant", "certified"];
const EXEMPT_FIELDS = new Set(["citation", "requirement"]);
const pattern = (words) => new RegExp(`\\b(${words.join("|")})\\b`, "gi");

// Every banned word in a text, as "label:line: word".
export function textHits(label, text, words = WORDS) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(pattern(words))) hits.push(`${label}:${i + 1}: ${m[0]}`);
  });
  return hits;
}

// Every banned word in a JSON value outside a citation or requirement field, as "label at path: word".
export function jsonHits(label, value, path = "") {
  if (typeof value === "string") return [...value.matchAll(pattern(JSON_WORDS))].map((m) => `${label} at ${path || "(root)"}: ${m[0]}`);
  if (Array.isArray(value)) return value.flatMap((v, i) => jsonHits(label, v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) => [
      ...[...key.matchAll(pattern(JSON_WORDS))].map((m) => `${label} key ${path}.${key}: ${m[0]}`),
      ...(EXEMPT_FIELDS.has(key) ? [] : jsonHits(label, v, `${path}.${key}`)),
    ]);
  }
  return [];
}

function filesUnder(dir) {
  let names;
  try { names = readdirSync(dir).sort(); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
  return names.flatMap((n) => (statSync(join(dir, n)).isDirectory() ? filesUnder(join(dir, n)) : [join(dir, n)]));
}

// A frameworks folder: JSON by the JSON rule, anything else by the text rule.
export function frameworksHits(dir) {
  return filesUnder(dir).flatMap((file) => {
    const label = relative(REPO, file);
    const text = readFileSync(file, "utf8");
    if (!file.endsWith(".json")) return textHits(label, text);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`${label} does not parse as JSON, so it could not be checked`); }
    return jsonHits(label, data);
  });
}

// ---------- the shipped run ----------

// One phrase per signal the scanner knows, so scope prints every framework the knowledge base can name.
const PLANTED = "We have a merchant account. The shop uses a hosted checkout page. The form uses hosted fields. It stores cardholder data.\n"
  + "Stores use P2PE devices. The app exchanges FHIR resources. Each clinic signs a BAA. It keeps consumer health data.\n"
  + "It serves an opioid treatment program. The platform is multi-tenant. We sell a white-label edition. Buyers send a security questionnaire.\n"
  + "The firm does debt collection. Members give a routing number. The agency is supervised by NYDFS. It tracks IOLTA balances.\n"
  + "The site honors do not sell requests. The service follows GDPR. The team is preparing for CMMC. The company runs an ISMS.\n"
  + "Our customer is regulated by the NCUA.\n";

function run(label, args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  if (r.error || r.status === null) throw new Error(`${label} did not run: ${r.error?.message ?? r.signal}`);
  if (!r.stdout && !r.stderr) throw new Error(`${label} printed nothing, so there was nothing to check`);
  return [...textHits(`${label} (stdout)`, r.stdout), ...textHits(`${label} (stderr)`, r.stderr)];
}

function shippedHits() {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), "compliance-words-")));
  const synthetic = makeSyntheticProject();
  try {
    const scopeProject = join(temp, "scope-project");
    mkdirSync(scopeProject);
    writeFileSync(join(scopeProject, "README.md"), PLANTED);
    const fixture = { SKILLITON_FRAMEWORKS_DIR: join(FIXTURES, "frameworks"), SKILLITON_BACKUPS: join(temp, "backups") };
    const sheetEnv = { SKILLITON_FRAMEWORKS_DIR: synthetic.dir, SKILLITON_BACKUPS: join(temp, "backups") };
    const s = ["--dir", scopeProject], p = ["--dir", synthetic.root];
    const written = writeSheet(synthetic.root, { apply: true, dir: synthetic.dir });
    const hits = [
      ...textHits(`the synthetic project's ${written.path}`, readFileSync(join(synthetic.root, written.path), "utf8")),
      ...run("compliance --help", ["compliance", "--help"], fixture),
      ...run("compliance (no subcommand)", ["compliance"], fixture),
      ...run("compliance scope", ["compliance", "scope", ...s], fixture),
      ...run("compliance scope --json", ["compliance", "scope", "--json", ...s], fixture),
      ...run("compliance scope --apply (no person)", ["compliance", "scope", "--apply", ...s], fixture),
      ...run("compliance scope --apply", ["compliance", "scope", "--apply", "--decided-by", "Words Check", ...s], fixture),
      ...run("compliance scope (the plugin's frameworks folder)", ["compliance", "scope", ...s], { SKILLITON_FRAMEWORKS_DIR: "" }),
      ...run("compliance sheet", ["compliance", "sheet", ...p], sheetEnv),
      ...run("compliance sheet --json", ["compliance", "sheet", "--json", ...p], sheetEnv),
      ...run("compliance sheet --apply", ["compliance", "sheet", "--apply", ...p], sheetEnv),
      ...run("compliance sheet (no scope, no catalog)", ["compliance", "sheet", ...s], fixture),
    ];
    for (const file of [join(RUNTIME, "commands/compliance.mjs"), ...filesUnder(join(RUNTIME, "lib")).filter((f) => /\/compliance-[^/]*\.mjs$/.test(f))]) {
      hits.push(...textHits(relative(REPO, file), readFileSync(file, "utf8")));
    }
    return [...hits, ...frameworksHits(FRAMEWORKS)];
  } finally {
    synthetic.cleanup();
    rmSync(temp, { recursive: true, force: true });
  }
}

// ---------- the self-test ----------

function selfTest() {
  const dir = join(FIXTURES, "words");
  const hits = [...textHits("words/sheet.md", readFileSync(join(dir, "sheet.md"), "utf8")),
    ...textHits("words/printed.txt", readFileSync(join(dir, "printed.txt"), "utf8")), ...frameworksHits(join(dir, "frameworks"))];
  for (const h of hits) console.log(`FAIL ${h}`);
  const expected = [
    "words/sheet.md:4: compliant",
    "words/printed.txt:1: Certify",
    "words/printed.txt:1: Passes",
    "scripts/fixtures/compliance/words/frameworks/planted-library.json at .meta.note: certified",
  ];
  const missing = expected.filter((e) => !hits.includes(e));
  const extra = hits.filter((h) => !expected.includes(h));
  if (missing.length || extra.length) {
    for (const m of missing) console.error(`self-test: the check missed a planted word: ${m}`);
    for (const x of extra) console.error(`self-test: the check flagged text it must leave alone: ${x}`);
    return 1;
  }
  console.log(`self-test: the check failed on all ${expected.length} planted words, as it must, and left the quoted citation and requirement`);
  console.log("text, the JSON-only word, and compliance, compliances and certification alone.");
  return 0;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const hits = shippedHits();
  for (const h of hits) console.log(`FAIL ${h}`);
  if (hits.length) {
    console.log(`compliance-words: FAILED: ${hits.length} banned word(s). Reword each one; the product assesses and prepares, it never attests.`);
    return 1;
  }
  console.log("compliance-words: ok: no banned word in the sheet, the printed text, the compliance source or the frameworks folder.");
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`compliance-words: could not run: ${e?.message ?? e}`);
  process.exitCode = 2;
}
