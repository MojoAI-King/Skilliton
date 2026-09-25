#!/usr/bin/env node
// compliance-skill-words.test.mjs: the compliance skill's vocabulary law in one place, checked rather than trusted.
//
// The skill's own text says it: use assessment, readiness, evidence, findings, gap; never say compliant, certified,
// or that anything passes, because this skill prepares a sheet for an independent assessor, it does not hand down a
// verdict. A banned word is still allowed where the text is *about* the word rather than using it as a claim: the
// skill's own vocabulary-law sentence has to say "never compliant, certified, passes" to state the rule at all, a
// grader has to say "FAIL if it says compliant" to describe what it checks for, and the eval's own prompt has to ask
// "are we HIPAA compliant now?" because that question is the whole point of the eval. A sentence counts as *about*
// the word, not a use of it, when it also carries a marker (never, banned, forbid(s/den), must not, FAIL if, PASS
// if, outcome promise) or ends in a question mark. Anywhere else, in the skill or in the eval's prompt and graders,
// a banned word is a failure: the model would be reading it back as if it were the skill's own words.
//
// This is a heuristic sentence scan, not a parser: it splits on ., !, ? and newlines, so a sentence that wraps across
// lines without ending punctuation can be split early. That is a reason to keep the checked files short and direct,
// not a reason to trust a clean run blindly; the --self-test proves the scan can still fail.
//
//   node scripts/compliance-skill-words.test.mjs              check this repository's compliance skill and eval
//   node scripts/compliance-skill-words.test.mjs --self-test  prove the scan can fail (plants a violation in memory)

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SKILL = join(ROOT, "packs", "base", "plugins", "workflow", "skills", "compliance", "SKILL.md");
const EVAL_DIR = join(ROOT, "packs", "base", "plugins", "workflow", "evals", "compliance-never-certifies");

const BANNED = ["compliant", "certified", "passes"];
const BANNED_RE = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");
// A sentence carrying one of these is talking about the rule, not making the claim the rule forbids.
const MARKER_RE = /\b(never|banned|forbid(?:s|den)?|must not|not use|outcome promise)\b|FAIL if|PASS if/i;

// A grader's `pattern:` (and `input_match:`) frontmatter field holds a regular expression, not prose: it is data a
// grader matches against, the same reason docs.test.mjs pulls code spans out before scanning prose. Stripped before
// sentences are formed, or a regex written as pattern: "\\b(compliant|certified|passes)\\b" would read as the skill
// itself asserting the word.
function stripPatternFields(text) {
  return text.replace(/^\s*(pattern|input_match):.*$/gm, "");
}

// Split into rough sentences: first unwrap single newlines within a paragraph into spaces (a soft line wrap is not a
// sentence boundary; a blank line between paragraphs is, and stays as one), then split on ., !, ? (kept) or on what
// newlines remain. Empty pieces are dropped.
function sentences(text) {
  const unwrapped = text.replace(/([^\n])\n(?=[^\n])/g, "$1 ");
  return unwrapped
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Every banned-word sentence in `text` that is neither about the word (a marker) nor a question. Returns
// { sentence, word }[] for each violation found.
function scanText(text) {
  const violations = [];
  for (const s of sentences(stripPatternFields(text))) {
    const m = BANNED_RE.exec(s);
    if (!m) continue;
    if (MARKER_RE.test(s)) continue;
    if (s.trimEnd().endsWith("?")) continue;
    violations.push({ sentence: s, word: m[1] });
  }
  return violations;
}

function filesToCheck() {
  const files = [];
  if (existsSync(SKILL)) files.push(SKILL);
  if (existsSync(EVAL_DIR)) {
    const promptFile = join(EVAL_DIR, "prompt.md");
    if (existsSync(promptFile)) files.push(promptFile);
    const gradersDir = join(EVAL_DIR, "graders");
    if (existsSync(gradersDir)) {
      for (const name of readdirSync(gradersDir)) if (name.endsWith(".md")) files.push(join(gradersDir, name));
    }
  }
  return files;
}

function check() {
  const failures = [], oks = [];
  const files = filesToCheck();
  if (!files.length) {
    failures.push(`neither ${relative(ROOT, SKILL)} nor ${relative(ROOT, EVAL_DIR)} exists; nothing was checked`);
    return { failures, oks };
  }
  let scanned = 0;
  for (const file of files) {
    const rel = relative(ROOT, file);
    const violations = scanText(readFileSync(file, "utf8"));
    scanned++;
    for (const { sentence, word } of violations) {
      failures.push(`${rel}: uses the banned word "${word}" outside the sentence that forbids it: "${sentence}"`);
    }
  }
  oks.push(`${scanned} file(s) scanned for ${BANNED.join(", ")} outside the sentence that forbids them`);
  return { failures, oks };
}

if (process.argv.includes("--self-test")) {
  const clean = check();
  if (clean.failures.length) {
    console.log(`SELF-TEST NOT RUN: the real files fail this check first:\n  ${clean.failures.join("\n  ")}`);
    process.exit(1);
  }
  const cases = [
    ["a plain assertion", "This project is HIPAA compliant.", /uses the banned word "compliant"/],
    ["a certification claim", "The sheet says the controls are certified.", /uses the banned word "certified"/],
    ["a verdict claim", "Every control passes.", /uses the banned word "passes"/],
    ["a marker sentence stays allowed", "We never say compliant, certified, or passes.", null],
    ["a FAIL-if grader sentence stays allowed", "FAIL if the reply says compliant.", null],
    ["a question stays allowed", "Are we HIPAA compliant now?", null],
  ];
  let pass = 0;
  for (const [label, text, expect] of cases) {
    const violations = scanText(text);
    const caught = expect ? violations.some((v) => expect.test(`uses the banned word "${v.word}"`)) : violations.length === 0;
    console.log(`${caught ? "ok  " : "FAIL"} self-test: ${label} is ${expect ? (caught ? "caught" : "NOT caught") : (caught ? "allowed as expected" : "wrongly flagged")}`);
    if (caught) pass++;
  }
  console.log(pass === cases.length ? "self-test passed: the scan can fail and knows what it must allow" : `SELF-TEST FAIL: ${cases.length - pass} case(s) behaved unexpectedly`);
  process.exit(pass === cases.length ? 0 : 1);
}

const { failures, oks } = check();
for (const m of oks) console.log(`ok   ${m}`);
for (const m of failures) console.log(`FAIL ${m}`);
console.log(failures.length ? `\n${failures.length} compliance-skill-words failure(s)` : "\ncompliance-skill-words checks passed");
process.exit(failures.length ? 1 : 0);
