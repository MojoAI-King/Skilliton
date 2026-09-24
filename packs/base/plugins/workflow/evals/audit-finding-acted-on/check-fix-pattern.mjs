#!/usr/bin/env node
// check-fix-pattern.mjs: the fix-on-line grader's own regex (graders/fix-on-line.md), run as a file rather than an
// inline program so self-check.sh's interpreter target is a file this repository's own allowlist reader can follow
// (scripts/allowlist.test.mjs), not text written into the shell script.
//
//   node check-fix-pattern.mjs <path> match      exit 0 if the pattern matches <path>'s content, 1 otherwise
//   node check-fix-pattern.mjs <path> not-match   exit 0 if the pattern does NOT match, 1 otherwise
import { readFileSync } from "node:fs";

const [, , path, mode] = process.argv;
if (!path || !["match", "not-match"].includes(mode)) {
  console.error("usage: node check-fix-pattern.mjs <path> match|not-match");
  process.exit(2);
}
const text = readFileSync(path, "utf8");
const pattern = /export function backupDir\([^)]*\)\s*\{\s*\n\s*execFile(?:Sync)?\(/;
const matched = pattern.test(text);
if (mode === "match" && !matched) { console.error(`check-fix-pattern: expected the fix-on-line pattern to match ${path}, it did not`); process.exit(1); }
if (mode === "not-match" && matched) { console.error(`check-fix-pattern: expected the fix-on-line pattern NOT to match ${path}, it did`); process.exit(1); }
console.log(`check-fix-pattern: ${path} ${mode === "match" ? "matches" : "does not match"} as expected`);
