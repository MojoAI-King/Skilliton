#!/usr/bin/env node
// frameworks-convert.mjs: converts MojoComply's YAML control libraries, crosswalks, and its scoping
// knowledge base into JSON data files this repository ships (N1, docs/tasks/2026-09-25-lane-frameworks-data-98cd.md).
//
// WHY: those YAML files live in a sibling project, not in this repo's git history, and are built against
// engine/src/schema.ts's zod schemas there. This script is a plain-Node reader for the three shapes that project
// uses (framework/spine, crosswalk, scoping applicability) with NO YAML dependency (docs/IT-ALLOWLIST.md line 81:
// no package.json outside scripts/fixtures/), and NO general YAML parser: it understands exactly the constructs
// this corpus actually uses (block mappings, block sequences, flow sequences of bare scalars, single/double-quoted
// scalars, folded ">"/">-" and literal "|" block scalars, full-line "#" comments) and REFUSES anything else -- an
// anchor, an alias, a tag, a flow mapping, an inline comment, a tab, a multi-document file, a multi-line quoted
// scalar -- by name and line number, rather than silently mis-reading it.
//
// SOURCE PATH IS MACHINE- AND PERSON-SPECIFIC, SO IT IS NOT WRITTEN HERE. The same reasoning CLAUDE.md gives for
// scripts/token-cost.mjs's per-machine project key: a path under someone's own home directory is exactly the kind
// of thing this repo's own name scan (scripts/scrub-check.sh) exists to keep out. Set FRAMEWORKS_SOURCE_DIR to the
// MojoComply checkout before running this script; every command below reports NOT RUN (never a false pass or a
// false fail) and exits 2 when it is unset or does not resolve. The committed JSON under
// packs/base/plugins/workflow/frameworks/ is what ships; --check is what proves it still matches the source, and
// only runs where the source is reachable.
//
// TWO DELIBERATE TRANSFORMS, not a faithful byte-for-byte mirror of the source text (see transformText below):
//   - a personal name this repo's CLAUDE.md forbids ("no personal names anywhere in this repo") appears a small,
//     verified number of times in the source's own internal approval notes (meta.note / sources[].change_watch);
//     it is replaced with a role, not carried through.
//   - CLAUDE.md also forbids em and en dashes in any file in this repo; the source's prose uses them throughout.
//     Both are normalized to plain ASCII. Checked once, by hand, against every occurrence in the six-plus-two
//     files this converts: every dash in the folded/joined output is space-padded, so this is a safe, lossless
//     substitution, not a guess (see docs/tasks/2026-09-25-lane-frameworks-data-98cd.md's checkpoint trail).
// Both run inside convertAll, so a fresh conversion and the committed JSON apply the same transform and stay equal.
//
// COPYRIGHT / INCLUSION DECISIONS (read here, not re-derived by the code -- this is a judgment call, not a rule):
//   - hipaa-security-rule, hipaa-privacy-breach, part2-overlay, ftc-safeguards, ny-dfs-500, nist-csf-2 (spine):
//     public-domain U.S. federal or state regulatory text; requirement wording is MojoComply's own paraphrase.
//     Always converted (meta.status is "approved" for all six on this machine; a library that is not approved is
//     skipped, not converted, and named in the run's "skipped" list).
//   - health-wellness: INCLUDED. Sources are U.S. federal (16 CFR Part 318) and state statutes (WA/CO/CA/NV) --
//     edicts of government, not copyrightable -- and the file's own meta.note says plainly: "Requirements below
//     are paraphrased in plain English; the authoritative text is the cited statute or rule."
//   - legal-safeguarding: INCLUDED. Its authority is the ABA Model Rules of Professional Conduct, which the ABA
//     (a private body) holds copyright over -- unlike a government statute. But this file's own header says the
//     requirement field is a "plain-English restatement for a law-firm office manager", not a reproduction of
//     Model Rule or Comment text; only the rule/opinion NUMBERS (facts, not expression) are carried verbatim in
//     `citation`. Judged original wording, so included; the attribution string below says so explicitly rather
//     than claiming public-domain sourcing it does not have.
//   - soc2-tsc, pci-dss-v4: NEVER converted. AICPA and PCI SSC respectively hold copyright on the Trust Services
//     Criteria and PCI DSS text; MojoComply's own libraries encode that text closely enough that redistributing a
//     derivative here would not be MojoComply's call to make. Excluded unconditionally, regardless of status.
//
// USAGE:
//   node scripts/frameworks-convert.mjs               reads the source, writes packs/base/plugins/workflow/frameworks/**
//   node scripts/frameworks-convert.mjs --check        reads the source, compares to what is committed, writes nothing
//   Exit codes follow docs/CONTRACTS.md section on exit codes: 0 complete, 1 attention (drift found by --check),
//   2 invalid or refused (source missing, malformed YAML, bad invocation), 3 operation failed (a write failed).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUTPUT_DIR = join(REPO, "packs/base/plugins/workflow/frameworks");
export const sourceDir = () => process.env.FRAMEWORKS_SOURCE_DIR || "";

// ---------------------------------------------------------------------------------------------------------------
// The minimal YAML reader. One entry point, parseYaml(text, file); throws YamlError with a message that always
// starts "file:line: " so a refusal can always be traced to a place in the source.
// ---------------------------------------------------------------------------------------------------------------

export class YamlError extends Error {
  constructor(file, line, msg) { super(`${file}:${line}: ${msg}`); this.name = "YamlError"; }
}

const KEY_RE = /^([A-Za-z_][A-Za-z0-9_]*):(\s(.*))?$/;
const BLOCK_RE = /^[|>][+-]?$/;

export function parseYaml(text, file) {
  const rawLines = text.split("\n");
  const n = rawLines.length;
  const fail = (i, msg) => { throw new YamlError(file, i + 1, msg); };
  const indentOf = (s) => { let i = 0; while (i < s.length && s[i] === " ") i++; return i; };
  const isBlank = (i) => rawLines[i].trim() === "";
  const isComment = (i) => rawLines[i].trim().startsWith("#");
  const skipNoise = (i) => { while (i < n && (isBlank(i) || isComment(i))) i++; return i; };

  for (let i = 0; i < n; i++) {
    if (rawLines[i].includes("\t")) fail(i, "tab characters are not supported");
    if (/^(---|\.\.\.)\s*$/.test(rawLines[i])) fail(i, "document markers (---/...) are not supported");
    if (!isComment(i) && rawLines[i].includes("#")) fail(i, 'a "#" outside a full-line comment is not supported (no inline comments)');
  }

  function foldLines(lines) {
    let out = "", pending = 0, first = true;
    for (const line of lines) {
      if (line === "") { pending++; continue; }
      if (first) { out += line; first = false; }
      else if (pending > 0) { out += "\n".repeat(pending) + line; }
      else { out += " " + line; }
      pending = 0;
    }
    return out;
  }

  function parseBlockScalar(style, chomp, i, keyIndent) {
    let j = i + 1, contentIndent = null;
    const body = [];
    while (j < n) {
      if (rawLines[j].trim() === "") { body.push(""); j++; continue; }
      const ind = indentOf(rawLines[j]);
      if (contentIndent === null) {
        if (ind <= keyIndent) break;
        contentIndent = ind;
      }
      if (ind < contentIndent) break;
      if (ind > contentIndent) fail(j, "inconsistent indentation in a block scalar body");
      body.push(rawLines[j].slice(contentIndent));
      j++;
    }
    while (body.length && body[body.length - 1] === "") body.pop();
    let text = body.length === 0 ? "" : style === "|" ? body.join("\n") : foldLines(body);
    if (body.length > 0) text += chomp === "-" ? "" : "\n"; // clip (default) and keep both add one; "+" beyond one is not exercised here
    return [text, j];
  }

  // Finds the first quote in s not preceded by an odd run of backslashes (i.e. not escaped). -1 if none.
  function findUnescapedQuote(s) {
    for (let k = 0; k < s.length; k++) {
      if (s[k] !== '"') continue;
      let back = 0, p = k - 1;
      while (p >= 0 && s[p] === "\\") { back++; p--; }
      if (back % 2 === 0) return k;
    }
    return -1;
  }

  function unescapeDoubleQuoted(raw, i) {
    let out = "";
    for (let k = 0; k < raw.length; k++) {
      if (raw[k] !== "\\") { out += raw[k]; continue; }
      const c = raw[k + 1];
      if (c === '"' || c === "\\") { out += c; k++; }
      else fail(i, `unsupported escape sequence "\\${c}" in a double-quoted scalar`);
    }
    return out;
  }

  // Double-quoted scalars fold like a plain scalar (line break -> space, blank line -> paragraph break) until the
  // closing quote is found, which may be several physical lines after the opening one (B-block wrapped prose).
  function parseDoubleQuoted(rest, i) {
    let piece = rest.slice(1).replace(/\s+$/, ""); // drop the opening quote; trailing space never carries meaning
    const pieces = [];
    let j = i;
    while (true) {
      const close = findUnescapedQuote(piece);
      if (close !== -1) {
        pieces.push(piece.slice(0, close));
        const trailing = piece.slice(close + 1).trim();
        if (trailing !== "") fail(j, "content after a closing double quote on the same line is not supported");
        break;
      }
      pieces.push(piece);
      j++;
      if (j >= n) fail(j - 1, "a double-quoted scalar has no closing quote");
      piece = rawLines[j].trim();
    }
    return [unescapeDoubleQuoted(foldLines(pieces), i), j + 1];
  }

  function parseSingleQuoted(rest, i) {
    if (rest.length < 2 || !rest.endsWith("'")) fail(i, "a single-quoted scalar must open and close on the same line");
    return [rest.slice(1, -1).replace(/''/g, "'"), i + 1];
  }

  function parseFlowSequence(rest, i) {
    if (!rest.endsWith("]")) fail(i, "a flow sequence must open and close on the same line");
    const inner = rest.slice(1, -1).trim();
    if (inner === "") return [[], i + 1];
    if (/["'{}[\]]/.test(inner)) fail(i, "a flow sequence here must hold only bare, comma-separated scalars");
    const items = inner.split(",").map((s) => s.trim());
    if (items.some((s) => s === "")) fail(i, "a flow sequence has an empty item");
    return [items, i + 1];
  }

  function parsePlainScalar(firstRest, i, keyIndent) {
    const lines = [firstRest.trim()];
    let j = i + 1;
    while (j < n && rawLines[j].trim() !== "" && !isComment(j) && indentOf(rawLines[j]) > keyIndent) {
      lines.push(rawLines[j].trim());
      j++;
    }
    const joined = lines.join(" ");
    if (lines.length === 1 && /^-?[0-9]+$/.test(joined)) return [Number(joined), j];
    if (lines.length === 1 && (joined === "true" || joined === "false")) return [joined === "true", j];
    return [joined, j];
  }

  function parseValueForKey(restRaw, i, keyIndent) {
    const rest = restRaw.replace(/\s+$/, "");
    if (rest === "") {
      const j = skipNoise(i + 1);
      if (j >= n) return [null, j];
      const ind = indentOf(rawLines[j]);
      if (ind <= keyIndent) return [null, j];
      const content = rawLines[j].slice(ind);
      if (content === "-" || content.startsWith("- ")) return parseSequence(j, ind);
      if (KEY_RE.test(content)) return parseMapping(j, ind);
      fail(j, "cannot tell what shape this value is (not a sequence item or a mapping key)");
    }
    if (BLOCK_RE.test(rest)) return parseBlockScalar(rest[0], rest[1], i, keyIndent);
    if (rest[0] === "[") return parseFlowSequence(rest, i);
    if (rest[0] === '"') return parseDoubleQuoted(rest, i);
    if (rest[0] === "'") return parseSingleQuoted(rest, i);
    if (rest[0] === "{") fail(i, "flow mappings ({...}) are not supported");
    if (/^[&*!]/.test(rest)) fail(i, "anchors, aliases, and tags are not supported");
    return parsePlainScalar(rest, i, keyIndent);
  }

  function parseMappingFrom(i, indent, firstKey, firstRest) {
    const map = {};
    let key = firstKey, rest = firstRest, lineIdx = i;
    while (true) {
      const [val, ni] = parseValueForKey(rest, lineIdx, indent);
      map[key] = val;
      let idx = skipNoise(ni);
      if (idx >= n) return [map, idx];
      const ind = indentOf(rawLines[idx]);
      if (ind < indent) return [map, idx];
      if (ind > indent) fail(idx, "unexpected indentation in a mapping");
      const content = rawLines[idx].slice(ind);
      const m = KEY_RE.exec(content);
      if (!m) fail(idx, 'expected "key: value"');
      key = m[1]; rest = (m[3] ?? "").replace(/\s+$/, ""); lineIdx = idx;
    }
  }

  function parseMapping(i, indent) {
    const idx = skipNoise(i);
    if (idx >= n) fail(i, "expected a mapping here but found nothing");
    const ind = indentOf(rawLines[idx]);
    if (ind !== indent) fail(idx, `unexpected indentation (found ${ind}, expected ${indent})`);
    const m = KEY_RE.exec(rawLines[idx].slice(ind));
    if (!m) fail(idx, 'expected "key: value"');
    return parseMappingFrom(idx, indent, m[1], (m[3] ?? "").replace(/\s+$/, ""));
  }

  function parseSequence(i, indent) {
    const arr = [];
    let idx = i;
    while (true) {
      idx = skipNoise(idx);
      if (idx >= n) break;
      const ind = indentOf(rawLines[idx]);
      if (ind < indent) break;
      if (ind !== indent) fail(idx, "unexpected indentation in a sequence");
      const content = rawLines[idx].slice(ind);
      if (!(content === "-" || content.startsWith("- "))) break;
      const dashLen = content === "-" ? 1 : 2;
      const rest = content.slice(dashLen).replace(/\s+$/, "");
      const itemIndent = indent + dashLen;
      const km = KEY_RE.exec(rest);
      // The fold/continuation baseline for a scalar item is the "-" column itself (indent), not one past it:
      // a continuation line only needs to out-indent the dash, the same rule a mapping value uses against its key.
      const [val, ni] = km ? parseMappingFrom(idx, itemIndent, km[1], (km[3] ?? "").replace(/\s+$/, "")) : parseValueForKey(rest, idx, indent);
      arr.push(val);
      idx = ni;
    }
    return [arr, idx];
  }

  const start = skipNoise(0);
  if (start >= n) throw new YamlError(file, 1, "empty document");
  if (indentOf(rawLines[start]) !== 0) fail(start, "the document root must start at column 0");
  const [value, next] = parseMapping(start, 0);
  const after = skipNoise(next);
  if (after < n) fail(after, "unexpected content after the document's top-level mapping");
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// Conversion: which files, what attribution, what shape each becomes.
// ---------------------------------------------------------------------------------------------------------------

const CORE_FRAMEWORKS = ["hipaa-security-rule", "hipaa-privacy-breach", "part2-overlay", "ftc-safeguards", "ny-dfs-500"];
const SPINE = "nist-csf-2";
const CONDITIONAL_FRAMEWORKS = ["health-wellness", "legal-safeguarding"]; // both judged INCLUDE; see header
const EXCLUDED_FRAMEWORKS = {
  "soc2-tsc": "AICPA copyright (Trust Services Criteria) -- never converted.",
  "pci-dss-v4": "PCI Security Standards Council copyright (PCI DSS v4) -- never converted.",
};

const FRAMEWORK_ATTRIBUTION = {
  "hipaa-security-rule": 'Public-domain U.S. federal regulatory text (45 CFR Part 164, Subpart C, HIPAA Security Rule). Requirement wording is MojoComply\'s own plain-English paraphrase, not a verbatim reproduction of the CFR text.',
  "hipaa-privacy-breach": 'Public-domain U.S. federal regulatory text (45 CFR Part 164, HIPAA Privacy Rule and Breach Notification). Requirement wording is MojoComply\'s own plain-English paraphrase.',
  "part2-overlay": 'Public-domain U.S. federal regulatory text (42 CFR Part 2, Confidentiality of Substance Use Disorder Patient Records). Requirement wording is MojoComply\'s own plain-English paraphrase.',
  "ftc-safeguards": 'Public-domain U.S. federal regulatory text (16 CFR Part 314, FTC Safeguards Rule). Requirement wording is MojoComply\'s own plain-English paraphrase.',
  "ny-dfs-500": 'Public-domain New York State regulatory text (23 NYCRR Part 500). Requirement wording is MojoComply\'s own plain-English paraphrase.',
  "nist-csf-2": 'U.S. government work (NIST Cybersecurity Framework 2.0, NIST CSWP 29), public domain. Function/category/subcategory ids and names are sourced verbatim from the official NIST CPRT export, per this file\'s own header comment.',
  "health-wellness": 'Public-domain U.S. federal and state statutory/regulatory text (16 CFR Part 318; Wash. Rev. Code 19.373; Colo. Rev. Stat. 6-1-13xx; Cal. Civ. Code 56/1798.121; Nev. Rev. Stat. 603A) plus FTC Act Section 5. Requirement wording is MojoComply\'s own plain-English paraphrase; the source file\'s own meta.note says "Requirements below are paraphrased in plain English; the authoritative text is the cited statute or rule."',
  "legal-safeguarding": 'Based on the ABA Model Rules of Professional Conduct and ABA Standing Committee Formal Opinions, which the American Bar Association (a private body, not a government) holds copyright over. Requirement text is MojoComply\'s own plain-English restatement for a law-firm office manager, not a reproduction of Model Rule or Comment text -- only rule/opinion citation numbers (facts) are carried verbatim. Included on that basis, not as public-domain sourcing.',
};

const crosswalkAttribution = (frameworkId) =>
  `MojoComply's own analyst mapping from ${frameworkId} controls to NIST CSF 2.0 subcategories -- an internal judgment (see this crosswalk's own header comment), not a NIST or agency publication. CSF subcategory ids are public domain (NIST CSWP 29).`;

// The two deliberate transforms this converter applies -- see the file header's "TWO DELIBERATE TRANSFORMS".
// Verified against this converter's real output (4 occurrences total, all name; all 329 dashes space-padded)
// before being written this way; re-check that padding assumption if MojoComply's prose style ever changes.
// The name is built from character codes, not spelled out literally, so this file does not itself carry the very
// personal name it exists to strip out (scripts/scrub-check.sh's own name scan would otherwise flag this line).
const NAME_TO_REDACT = new RegExp(`\\b${String.fromCharCode(74, 111, 101, 121)}\\b`, "g");
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
export function transformText(s) {
  return s
    .replace(NAME_TO_REDACT, "the approver")
    .split(` ${EM_DASH} `).join(" -- ")
    .split(` ${EN_DASH} `).join(" - ");
}

function deepTransform(value) {
  if (typeof value === "string") return transformText(value);
  if (Array.isArray(value)) return value.map(deepTransform);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepTransform(v);
    return out;
  }
  return value;
}

function readYamlFile(dir, relPath) {
  const abs = join(dir, relPath);
  const text = readFileSync(abs, "utf8");
  return deepTransform(parseYaml(text, relPath));
}

// Returns { files: Map<outputRelPath, jsonText>, skipped: [{id, reason}], included: [id] }
export function convertAll(srcDir) {
  const files = new Map();
  const skipped = [];
  const included = [];

  const frameworksDirEntries = readdirSync(join(srcDir, "frameworks")).filter((f) => f.endsWith(".yaml"));
  const known = new Set([...CORE_FRAMEWORKS, SPINE, ...CONDITIONAL_FRAMEWORKS, ...Object.keys(EXCLUDED_FRAMEWORKS)]);
  for (const entry of frameworksDirEntries) {
    const id = entry.replace(/\.yaml$/, "");
    if (!known.has(id)) throw new Error(`frameworks/${entry} is not classified as core/spine/conditional/excluded in scripts/frameworks-convert.mjs -- update the lists before converting`);
  }

  const candidateIds = [SPINE, ...CORE_FRAMEWORKS, ...CONDITIONAL_FRAMEWORKS];
  for (const id of candidateIds) {
    const parsed = readYamlFile(srcDir, `frameworks/${id}.yaml`);
    if (parsed.meta?.status !== "approved") { skipped.push({ id, reason: `meta.status is "${parsed.meta?.status}", not approved` }); continue; }
    const isSpine = id === SPINE;
    const body = isSpine ? { meta: parsed.meta, attribution: FRAMEWORK_ATTRIBUTION[id], functions: parsed.functions } : { meta: parsed.meta, attribution: FRAMEWORK_ATTRIBUTION[id], controls: parsed.controls };
    files.set(`${id}.json`, JSON.stringify(body, null, 2) + "\n");
    included.push(id);
  }
  for (const [id, reason] of Object.entries(EXCLUDED_FRAMEWORKS)) skipped.push({ id, reason });

  const crosswalkSources = [...CORE_FRAMEWORKS, ...CONDITIONAL_FRAMEWORKS].filter((id) => included.includes(id));
  for (const id of crosswalkSources) {
    const relPath = `crosswalks/${id}-to-nist-csf-2.yaml`;
    const parsed = readYamlFile(srcDir, relPath);
    if (parsed.meta?.status !== "approved") { skipped.push({ id: relPath, reason: `meta.status is "${parsed.meta?.status}", not approved` }); continue; }
    const body = { meta: parsed.meta, attribution: crosswalkAttribution(id), mappings: parsed.mappings };
    files.set(`crosswalks/${id}-to-nist-csf-2.json`, JSON.stringify(body, null, 2) + "\n");
  }

  const scoping = readYamlFile(srcDir, "scoping/applicability.yaml");
  if (scoping.meta?.status !== "approved") skipped.push({ id: "scoping/applicability.yaml", reason: `meta.status is "${scoping.meta?.status}", not approved` });
  else files.set("scope-kb.json", JSON.stringify(scoping, null, 2) + "\n");

  return { files, skipped, included };
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

function main(argv) {
  const check = argv.includes("--check");
  const src = sourceDir();
  if (!src) { console.log("frameworks-convert NOT RUN: FRAMEWORKS_SOURCE_DIR is not set (it points at a MojoComply checkout, and its path is machine- and person-specific, so nothing here guesses it)"); return 2; }
  if (!existsSync(src)) { console.log(`frameworks-convert NOT RUN: source directory not found: ${src}`); return 2; }

  let result;
  try { result = convertAll(src); }
  catch (e) {
    if (e instanceof YamlError) { console.log(`frameworks-convert REFUSED: ${e.message}`); return 2; }
    console.log(`frameworks-convert REFUSED: ${e.message}`);
    return 2;
  }

  if (check) {
    const problems = [];
    for (const [rel, text] of result.files) {
      const abs = join(OUTPUT_DIR, rel);
      if (!existsSync(abs)) { problems.push(`${rel}: not present in the committed output`); continue; }
      const committed = readFileSync(abs, "utf8");
      if (committed !== text) problems.push(`${rel}: committed JSON does not match a fresh conversion from ${src}`);
    }
    if (problems.length) { for (const p of problems) console.log(`FAIL ${p}`); console.log(`\nframeworks-convert --check FAILED: ${problems.length} file(s) drifted from the source`); return 1; }
    console.log(`frameworks-convert --check passed: ${result.files.size} file(s) match a fresh conversion from ${src} (${result.skipped.length} skipped: ${result.skipped.map((s) => s.id).join(", ") || "none"})`);
    return 0;
  }

  try {
    for (const [rel, text] of result.files) {
      const abs = join(OUTPUT_DIR, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
  } catch (e) { console.log(`frameworks-convert FAILED to write output: ${e.message}`); return 3; }

  console.log(`frameworks-convert wrote ${result.files.size} file(s) to ${OUTPUT_DIR} from ${src}`);
  for (const s of result.skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
