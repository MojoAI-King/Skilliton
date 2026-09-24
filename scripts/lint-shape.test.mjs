#!/usr/bin/env node
// lint-shape.test.mjs: line length and function length in a plugin runtime, ratcheted the way scripts/lint.test.mjs
// ratchets file length (backlog B68; decision 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d says why an
// in-repo, dependency-free lint at all, and the same reasoning applies here unchanged).
//
// scripts/lint.test.mjs says at its own top that it is pinned at its own size; these two rules would have pushed
// it further into a ceiling it already sits under a ratchet for, and a file that pins others should not need a
// second, unrelated ratchet table of its own. They live here instead, in the same failures/self-test shape.
//
// Two rules:
//
//   line-length      a line over LINE_MAX characters in a plugin runtime file. Scoped the same way the size rule
//                    in scripts/lint.test.mjs scopes RUNTIME_RE: packs/*/plugins/*/runtime/*.mjs. Today packs/base
//                    is the only pack with a runtime, which is what B68's own wording ("packs/base/plugins/")
//                    means in practice; matching RUNTIME_RE exactly means a second pack's runtime is not missed
//                    later without this file being told about it by hand.
//   function-length  a function, or a const/let/var assigned to an arrow function with a block body, over
//                    FUNCTION_MAX lines, in the same files.
//
// Both are ratcheted the way scripts/lint.test.mjs ratchets file size: every file (line-length) or function
// (function-length) already over its ceiling when this rule shipped on 2026-09-23 is pinned at today's count and
// may not grow. A pin is deleted, not lowered, once its file or function is back under the ceiling; slack between
// a pin and the real count today is itself a failure, so the table cannot drift loose and hide the next
// regression. A file or function not in a table starts at zero, same as scripts/lint.test.mjs.
//
// Function boundaries are found with a brace counter run over a copy of the file with strings, comments and
// regex literals blanked out first (so a brace inside a string, or a {n,m} regex quantifier, which this codebase
// uses often, is never mistaken for a code brace). It recognizes:
//   function name(...) { ... }                 (export/async optional)
//   const/let/var name = (...) => { ... }      (export/async optional, block body only)
// An expression-bodied arrow (no opening brace right after =>) has no block to measure and is skipped, and an
// inline callback long enough to matter is itself a sign that callback should be a named helper, so this rule
// does not chase it. This covers every function actually found long in this codebase; a default-parameter arrow
// written before the real one (`(cb = () => {}) => { ... }`) would confuse the brace search, but no function here
// is written that way today.
//
//   node scripts/lint-shape.test.mjs               exit 0 when both rules hold, 1 when one does not, 2 when it cannot run
//   node scripts/lint-shape.test.mjs --self-test    proves each rule can fail on known-bad input and pass on known-good input

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
// Identical to RUNTIME_RE in scripts/lint.test.mjs on purpose: one definition of "a plugin runtime file" would be
// nice, but the two files are independently pinned/ratcheted and reading one should not require the other.
const RUNTIME_RE = /^packs\/[^/]+\/plugins\/[^/]+\/runtime\/.*\.mjs$/;

export const LINE_MAX = 160;
export const FUNCTION_MAX = 80;

// Lines over LINE_MAX, counted per file, already there when this rule shipped on 2026-09-23 (B68). Pinned at
// today's count; may shrink, never grow; delete the row once a file is back to zero.
export const LONG_LINE_PINS = [
  ["packs/base/plugins/workflow/runtime/commands/audit.mjs", 5],
  ["packs/base/plugins/workflow/runtime/commands/checkpoint.mjs", 12],
  ["packs/base/plugins/workflow/runtime/commands/company.mjs", 10],
  ["packs/base/plugins/workflow/runtime/commands/delivery.mjs", 2],
  ["packs/base/plugins/workflow/runtime/commands/dispatch.mjs", 9],
  ["packs/base/plugins/workflow/runtime/commands/doctor.mjs", 42],
  ["packs/base/plugins/workflow/runtime/commands/gate.mjs", 6],
  ["packs/base/plugins/workflow/runtime/commands/harness.mjs", 2],
  ["packs/base/plugins/workflow/runtime/commands/hook.mjs", 9],
  ["packs/base/plugins/workflow/runtime/commands/import.mjs", 7],
  ["packs/base/plugins/workflow/runtime/commands/index.mjs", 5],
  ["packs/base/plugins/workflow/runtime/commands/join.mjs", 16],
  ["packs/base/plugins/workflow/runtime/commands/maintain.mjs", 2],
  ["packs/base/plugins/workflow/runtime/commands/migrate.mjs", 8],
  ["packs/base/plugins/workflow/runtime/commands/new-plugin.mjs", 3],
  ["packs/base/plugins/workflow/runtime/commands/new-skill.mjs", 2],
  ["packs/base/plugins/workflow/runtime/commands/pin.mjs", 3],
  ["packs/base/plugins/workflow/runtime/commands/preflight.mjs", 4],
  ["packs/base/plugins/workflow/runtime/commands/prepare.mjs", 10],
  ["packs/base/plugins/workflow/runtime/commands/project-settings.mjs", 9],
  ["packs/base/plugins/workflow/runtime/commands/propose.mjs", 5],
  ["packs/base/plugins/workflow/runtime/commands/record.mjs", 3],
  ["packs/base/plugins/workflow/runtime/commands/release.mjs", 6],
  ["packs/base/plugins/workflow/runtime/commands/remove.mjs", 10],
  ["packs/base/plugins/workflow/runtime/commands/security.mjs", 14],
  ["packs/base/plugins/workflow/runtime/commands/status.mjs", 1],
  ["packs/base/plugins/workflow/runtime/commands/task.mjs", 9],
  ["packs/base/plugins/workflow/runtime/commands/usage.mjs", 3],
  ["packs/base/plugins/workflow/runtime/lib/audit-install.mjs", 2],
  ["packs/base/plugins/workflow/runtime/lib/audit-run.mjs", 10],
  ["packs/base/plugins/workflow/runtime/lib/auto-prepare.mjs", 8],
  ["packs/base/plugins/workflow/runtime/lib/collectors.mjs", 32],
  ["packs/base/plugins/workflow/runtime/lib/config.mjs", 20],
  ["packs/base/plugins/workflow/runtime/lib/core.mjs", 4],
  ["packs/base/plugins/workflow/runtime/lib/delivery-install.mjs", 7],
  ["packs/base/plugins/workflow/runtime/lib/delivery-persist.mjs", 3],
  ["packs/base/plugins/workflow/runtime/lib/delivery-policy.mjs", 9],
  ["packs/base/plugins/workflow/runtime/lib/delivery.mjs", 30],
  ["packs/base/plugins/workflow/runtime/lib/dispatch.mjs", 34],
  ["packs/base/plugins/workflow/runtime/lib/doctor.mjs", 10],
  ["packs/base/plugins/workflow/runtime/lib/fork.mjs", 9],
  ["packs/base/plugins/workflow/runtime/lib/gate.mjs", 7],
  ["packs/base/plugins/workflow/runtime/lib/handoff.mjs", 8],
  ["packs/base/plugins/workflow/runtime/lib/harness.mjs", 10],
  ["packs/base/plugins/workflow/runtime/lib/join.mjs", 40],
  ["packs/base/plugins/workflow/runtime/lib/journal.mjs", 2],
  ["packs/base/plugins/workflow/runtime/lib/legacy-template.mjs", 1],
  ["packs/base/plugins/workflow/runtime/lib/lifecycle.mjs", 36],
  ["packs/base/plugins/workflow/runtime/lib/maintain.mjs", 12],
  ["packs/base/plugins/workflow/runtime/lib/migrations.mjs", 67],
  ["packs/base/plugins/workflow/runtime/lib/pin.mjs", 11],
  ["packs/base/plugins/workflow/runtime/lib/preflight.mjs", 39],
  ["packs/base/plugins/workflow/runtime/lib/prepare.mjs", 40],
  ["packs/base/plugins/workflow/runtime/lib/project-files.mjs", 19],
  ["packs/base/plugins/workflow/runtime/lib/prototype-v1.mjs", 2],
  ["packs/base/plugins/workflow/runtime/lib/records-restore.mjs", 2],
  ["packs/base/plugins/workflow/runtime/lib/records.mjs", 14],
  ["packs/base/plugins/workflow/runtime/lib/release.mjs", 36],
  ["packs/base/plugins/workflow/runtime/lib/secret-rules.mjs", 1],
  ["packs/base/plugins/workflow/runtime/lib/security-io.mjs", 19],
  ["packs/base/plugins/workflow/runtime/lib/security.mjs", 21],
  ["packs/base/plugins/workflow/runtime/lib/session-hooks.mjs", 29],
  ["packs/base/plugins/workflow/runtime/lib/skills-repo.mjs", 2],
  ["packs/base/plugins/workflow/runtime/lib/tasks.mjs", 7],
  ["packs/base/plugins/workflow/runtime/lib/treehash.mjs", 2],
  ["packs/base/plugins/workflow/runtime/lib/trust.mjs", 16],
  ["packs/base/plugins/workflow/runtime/lib/verify.mjs", 23],
  ["packs/base/plugins/workflow/runtime/skilliton.mjs", 4],
];

// Functions over FUNCTION_MAX lines, already there when this rule shipped on 2026-09-23 (B68), pinned at their
// exact line count the way scripts/lint.test.mjs pins a whole file's line count. Deleted, not lowered, once a
// function is split under FUNCTION_MAX. N67 (docs/tasks/2026-09-23-lane-code-clarity-3584.md) lowers this table
// as it splits run (migrate.mjs), join (join.mjs), runVerify (verify.mjs), planPrepare (prepare.mjs), and
// planDispatch and briefText (dispatch.mjs); the rest are out of that item's list and stay pinned.
export const LONG_FUNCTION_PINS = [
  ["packs/base/plugins/workflow/runtime/commands/checkpoint.mjs", "run", 157],
  ["packs/base/plugins/workflow/runtime/commands/prepare.mjs", "run", 96],
  ["packs/base/plugins/workflow/runtime/commands/remove.mjs", "run", 82],
  ["packs/base/plugins/workflow/runtime/lib/collectors.mjs", "collectSecrets", 135],
  ["packs/base/plugins/workflow/runtime/lib/delivery.mjs", "evaluateUpdate", 107],
  ["packs/base/plugins/workflow/runtime/lib/migrations.mjs", "plan0003", 137],
  ["packs/base/plugins/workflow/runtime/lib/preflight.mjs", "checkRepository", 82],
  ["packs/base/plugins/workflow/runtime/lib/release.mjs", "planRelease", 83],
];

const lineOverPin = (path) => LONG_LINE_PINS.find(([p]) => p === path);
const funcOverPin = (path, name) => LONG_FUNCTION_PINS.find(([p, n]) => p === path && n === name);

// A previous char (skipping whitespace, not crossing a line) that means the next "/" opens a regex rather than
// dividing: nothing before it, an operator/punctuation, or a keyword that takes an expression next.
const REGEX_AFTER_KEYWORDS = new Set(["return", "typeof", "case", "delete", "in", "instanceof", "new", "void", "yield", "do", "else", "throw", "of", "await"]);
function regexAllowedAt(text, i) {
  let j = i - 1;
  while (j >= 0 && text[j] !== "\n" && /\s/.test(text[j])) j--;
  if (j < 0 || text[j] === "\n") return true;
  const c = text[j];
  if (!/[A-Za-z0-9_$)\]]/.test(c)) return true; // punctuation before "/": ( , = { ; : ! & | ? + - * % < > ~ ^ ...
  if (c === ")" || c === "]") return false; // a call result or an index: "/" after it divides
  let k = j;
  while (k >= 0 && /[A-Za-z0-9_$]/.test(text[k])) k--;
  return REGEX_AFTER_KEYWORDS.has(text.slice(k + 1, j + 1));
}

// Blanks out strings, comments and regex literals (keeping length and every newline) so a brace counter reading
// the result only ever sees real code braces. Exported so the self-test can check it directly.
export function maskNonCode(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") { out.push(" "); i++; }
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      out.push(" ", " "); i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) { out.push(text[i] === "\n" ? "\n" : " "); i++; }
      if (i < n) { out.push(" ", " "); i += 2; }
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out.push(" "); i++;
      while (i < n && text[i] !== quote && text[i] !== "\n") {
        if (text[i] === "\\") { out.push(" "); i++; if (i < n && text[i] !== "\n") { out.push(" "); i++; } continue; }
        out.push(" "); i++;
      }
      if (i < n && text[i] === quote) { out.push(" "); i++; }
      continue;
    }
    if (c === "`") {
      // A template literal: everything is blanked except a "${...}" expression, which is real code (and may
      // itself hold braces), so its brace depth is tracked back to the closing "}".
      out.push(" "); i++;
      let depth = 0;
      while (i < n) {
        if (text[i] === "\\") { out.push(" "); i++; if (i < n) { out.push(text[i] === "\n" ? "\n" : " "); i++; } continue; }
        if (depth === 0 && text[i] === "`") { out.push(" "); i++; break; }
        // "${" contributes exactly one real "{" to the surrounding brace count (a template literal's own
        // backticks contribute nothing); pushing two here, one for "$" and one for "{", would leave the
        // surrounding count one brace short of balanced for the rest of the file.
        if (depth === 0 && text[i] === "$" && text[i + 1] === "{") { out.push(" ", "{"); i += 2; depth = 1; continue; }
        if (depth > 0) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") depth--;
          out.push(text[i]);
          i++;
          continue;
        }
        out.push(text[i] === "\n" ? "\n" : " ");
        i++;
      }
      continue;
    }
    if (c === "/" && regexAllowedAt(text, i)) {
      let j = i + 1, inClass = false, closed = false;
      while (j < n && text[j] !== "\n") {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === "[") { inClass = true; j++; continue; }
        if (text[j] === "]") { inClass = false; j++; continue; }
        if (text[j] === "/" && !inClass) { j++; closed = true; break; }
        j++;
      }
      if (closed) {
        while (j < n && /[a-z]/i.test(text[j])) j++;
        for (let k = i; k < j; k++) out.push(text[k] === "\n" ? "\n" : " ");
        i = j;
        continue;
      }
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

const DECL_RE = /(?:^|[^.\w$])(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
const ARROW_RE = /(?:^|[^.\w$])(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;

// Finds { name, startLine, endLine, lines } for a named function declaration and for a const/let/var arrow
// function with a block body, over a masked copy of the text so a brace inside a string or a regex is never
// counted. Exported so the self-test can check it directly.
export function findFunctions(text) {
  const lines = text.split("\n");
  const maskedLines = maskNonCode(text).split("\n");
  const results = [];

  function braceCloseLine(fromLine, fromCol) {
    let depth = 0, started = false;
    for (let j = fromLine; j < lines.length; j++) {
      const seg = maskedLines[j];
      for (let k = j === fromLine ? fromCol : 0; k < seg.length; k++) {
        if (seg[k] === "{") { depth++; started = true; }
        else if (seg[k] === "}") { depth--; if (started && depth === 0) return j; }
      }
    }
    return -1;
  }

  function firstCharAfter(fromLine, fromCol) {
    for (let j = fromLine; j < lines.length; j++) {
      const seg = maskedLines[j];
      for (let k = j === fromLine ? fromCol : 0; k < seg.length; k++) {
        if (/\s/.test(seg[k])) continue;
        return { line: j, col: k, char: seg[k] };
      }
    }
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = maskedLines[i];

    const dm = DECL_RE.exec(line);
    if (dm) {
      const parenStart = line.indexOf("(", dm.index);
      let depth = 0, closeLine = -1, closeCol = -1;
      outer: for (let j = i; j < lines.length; j++) {
        const seg = maskedLines[j];
        for (let k = j === i ? parenStart : 0; k < seg.length; k++) {
          if (seg[k] === "(") depth++;
          else if (seg[k] === ")") { depth--; if (depth === 0) { closeLine = j; closeCol = k; break outer; } }
        }
      }
      if (closeLine !== -1) {
        const brace = firstCharAfter(closeLine, closeCol + 1);
        if (brace && brace.char === "{") {
          const endLine = braceCloseLine(brace.line, brace.col);
          if (endLine !== -1) results.push({ name: dm[1], startLine: i + 1, endLine: endLine + 1, lines: endLine - i + 1 });
        }
      }
      continue;
    }

    const am = ARROW_RE.exec(line);
    if (am) {
      // Scans the right-hand side of "name =" for its own "=>" at the top level (outside any (), [] or {} the
      // right-hand side opens), stopping at a top-level ";" first: without this a plain value or an object
      // literal (const env = { ... };) would otherwise pick up an unrelated arrow from a later statement within
      // the 5-line search window and be mismeasured as that statement's function.
      let arrowLine = -1, arrowCol = -1, depth = 0;
      outer: for (let j = i, seen = 0; j < lines.length && seen < 20; j++, seen++) {
        const seg = maskedLines[j];
        for (let k = j === i ? am.index + am[0].length : 0; k < seg.length; k++) {
          const ch = seg[k];
          if (ch === "(" || ch === "[" || ch === "{") depth++;
          else if (ch === ")" || ch === "]" || ch === "}") depth--;
          else if (depth === 0 && ch === ";") break outer;
          else if (depth === 0 && ch === "=" && seg[k + 1] === ">") { arrowLine = j; arrowCol = k + 2; break outer; }
        }
      }
      if (arrowLine !== -1) {
        const brace = firstCharAfter(arrowLine, arrowCol);
        if (brace && brace.char === "{") {
          const endLine = braceCloseLine(brace.line, brace.col);
          if (endLine !== -1) results.push({ name: am[1], startLine: i + 1, endLine: endLine + 1, lines: endLine - i + 1 });
        }
      }
    }
  }
  return results;
}

function ruleLineLength(files, violations) {
  for (const { path, text } of files) {
    if (!RUNTIME_RE.test(path)) continue;
    const lines = text.split("\n");
    let over = 0, first = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > LINE_MAX) { over++; if (first === -1) first = i + 1; }
    }
    if (over === 0) continue;
    const pin = lineOverPin(path);
    const allowed = pin ? pin[1] : 0;
    if (over > allowed) {
      violations.push({ rule: "line-length", path, line: first, text: `${over} line(s) over ${LINE_MAX} characters${pin ? `, pinned at ${allowed} today` : ""}. Wrap the long line(s); do not raise a pin in scripts/lint-shape.test.mjs` });
    }
  }
}

// A pin whose file is gone, has no long lines left, or has fewer than it is pinned for, protects nothing and
// hides the next file that needs it (mirrors findStalePins in scripts/lint.test.mjs).
export function findStaleLineLengthPins(files) {
  const byPath = new Map(files.map((f) => [f.path, f.text]));
  const stale = [];
  for (const [path, pin] of LONG_LINE_PINS) {
    const text = byPath.get(path);
    if (text === undefined) { stale.push({ rule: "line-length", path, line: 0, text: `pinned at ${pin} in scripts/lint-shape.test.mjs, but ${path} is not tracked. Delete the row` }); continue; }
    const over = text.split("\n").filter((l) => l.length > LINE_MAX).length;
    if (over === 0) stale.push({ rule: "line-length", path, line: 0, text: `0 lines over ${LINE_MAX} characters now, but still pinned at ${pin}. Delete the row` });
    else if (over < pin) stale.push({ rule: "line-length", path, line: 0, text: `${over} line(s) over ${LINE_MAX} characters now, pinned at ${pin}; lower the pin to ${over}` });
  }
  return stale;
}

function ruleFunctionLength(files, violations) {
  for (const { path, text } of files) {
    if (!RUNTIME_RE.test(path)) continue;
    for (const fn of findFunctions(text)) {
      if (fn.lines <= FUNCTION_MAX) continue;
      const pin = funcOverPin(path, fn.name);
      const allowed = pin ? pin[2] : 0;
      if (fn.lines > allowed) {
        violations.push({ rule: "function-length", path, line: fn.startLine, text: `${fn.name} is ${fn.lines} lines${pin ? `, pinned at ${allowed} today` : ""}, over the ${FUNCTION_MAX} line ceiling. Split it into named helpers that read top to bottom; do not raise a pin in scripts/lint-shape.test.mjs` });
      }
    }
  }
}

export function findStaleFunctionLengthPins(files) {
  const byPath = new Map(files.map((f) => [f.path, f.text]));
  const stale = [];
  for (const [path, name, pin] of LONG_FUNCTION_PINS) {
    const text = byPath.get(path);
    if (text === undefined) { stale.push({ rule: "function-length", path, line: 0, text: `${name} pinned at ${pin} in scripts/lint-shape.test.mjs, but ${path} is not tracked. Delete the row` }); continue; }
    const fn = findFunctions(text).find((f) => f.name === name);
    if (!fn) { stale.push({ rule: "function-length", path, line: 0, text: `${name} pinned at ${pin} in scripts/lint-shape.test.mjs, but no function of that name is found in ${path} now. Delete the row, or rename it to match` }); continue; }
    if (fn.lines <= FUNCTION_MAX) stale.push({ rule: "function-length", path, line: fn.startLine, text: `${name} is ${fn.lines} lines now, under the ${FUNCTION_MAX} line ceiling, but still pinned at ${pin}. Delete the row` });
    else if (fn.lines < pin) stale.push({ rule: "function-length", path, line: fn.startLine, text: `${name} is ${fn.lines} lines, pinned at ${pin}; lower the pin to ${fn.lines}` });
  }
  return stale;
}

export function findViolations(files) {
  const violations = [];
  ruleLineLength(files, violations);
  ruleFunctionLength(files, violations);
  return violations;
}

function listFiles() {
  const git = (args) => {
    const r = spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim() || r.error?.message}`);
    return r.stdout.split("\0").filter(Boolean);
  };
  const paths = [...new Set([...git(["ls-files", "-z"]), ...git(["ls-files", "-z", "--others", "--exclude-standard"])])].sort();
  const files = [];
  for (const path of paths) {
    if (!RUNTIME_RE.test(path)) continue;
    let st;
    try { st = statSync(join(REPO, path)); } catch { continue; } // deleted in the working tree, not yet staged
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    const bytes = readFileSync(join(REPO, path));
    if (bytes.includes(0)) continue;
    files.push({ path, text: bytes.toString("utf8") });
  }
  return files;
}

function selfTest() {
  const NEW_FILE = "packs/base/plugins/workflow/runtime/lib/new-shape-test.mjs";
  const linePin = LONG_LINE_PINS[0];
  const funcPin = LONG_FUNCTION_PINS[0];
  const longLine = "x".repeat(LINE_MAX + 1);
  const okLine = "x".repeat(LINE_MAX);
  const makeFn = (name, totalLines, arrow = false) => {
    const bodyLines = Math.max(totalLines - 2, 0);
    const body = Array.from({ length: bodyLines }, (_, i) => `  const v${i} = ${i};`).join("\n");
    return arrow ? `const ${name} = () => {\n${body}\n};\n` : `function ${name}() {\n${body}\n}\n`;
  };

  const cases = [
    { name: "a runtime file with a line over LINE_MAX fails", files: [{ path: NEW_FILE, text: `${longLine}\n` }], expect: 1 },
    { name: "a runtime file with every line at LINE_MAX passes", files: [{ path: NEW_FILE, text: `${okLine}\n` }], expect: 0 },
    { name: "a long line outside the runtime passes", files: [{ path: "scripts/a.mjs", text: `${longLine}\n` }], expect: 0 },
    { name: "a pinned file with one more long line than its pin fails", files: [{ path: linePin[0], text: `${longLine}\n`.repeat(linePin[1] + 1) }], expect: 1 },
    { name: "a pinned file at exactly its pin's count of long lines passes", files: [{ path: linePin[0], text: `${longLine}\n`.repeat(linePin[1]) }], expect: 0 },
    { name: "a function declaration over FUNCTION_MAX fails", files: [{ path: NEW_FILE, text: makeFn("f", FUNCTION_MAX + 1) }], expect: 1 },
    { name: "a function declaration at FUNCTION_MAX passes", files: [{ path: NEW_FILE, text: makeFn("f", FUNCTION_MAX) }], expect: 0 },
    { name: "an arrow function assigned to a const, over FUNCTION_MAX, fails", files: [{ path: NEW_FILE, text: makeFn("f", FUNCTION_MAX + 1, true) }], expect: 1 },
    { name: "an arrow function assigned to a const, at FUNCTION_MAX, passes", files: [{ path: NEW_FILE, text: makeFn("f", FUNCTION_MAX, true) }], expect: 0 },
    { name: "a pinned function one line longer than its pin fails", files: [{ path: funcPin[0], text: makeFn(funcPin[1], funcPin[2] + 1) }], expect: 1 },
    { name: "a pinned function at exactly its pin passes", files: [{ path: funcPin[0], text: makeFn(funcPin[1], funcPin[2]) }], expect: 0 },
    { name: "a brace inside a string is not counted as code", files: [{ path: NEW_FILE, text: `function f() {\n  const s = "${"{".repeat(FUNCTION_MAX)}";\n}\n` }], expect: 0 },
    { name: "a brace inside a {n,m} regex quantifier is not counted as code", files: [{ path: NEW_FILE, text: `function f() {\n  const re = /a{2,4}/;\n}\n` }], expect: 0 },
    { name: "a ${...} in a template literal does not throw off the brace count after it", files: [{ path: NEW_FILE, text: "function f() {\n  const s = `text ${1} more`;\n}\n" }], expect: 0 },
    { name: "an expression-bodied arrow with no block is not measured", files: [{ path: NEW_FILE, text: `const f = () => (\n${Array.from({ length: FUNCTION_MAX + 5 }, () => "  1 +").join("\n")}\n  0\n);\n` }], expect: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findViolations(c.files).length;
    const ok = (got > 0 ? 1 : 0) === c.expect;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (violations ${got})`);
    if (!ok) failed++;
  }

  // A plain object assigned to a const, followed within the search window by a real arrow function, must not be
  // credited with that later statement's body: this is what actually happened to "env" next to "git" in
  // lib/delivery.mjs before the arrow search learned to stop at a top-level ";".
  {
    const name = "an object literal assigned to a const does not pick up a later statement's arrow function";
    const text = `const env = { a: 1 };\n${makeFn("g", FUNCTION_MAX + 1, true)}`;
    const found = findFunctions(text).map((f) => f.name);
    const ok = !found.includes("env") && found.includes("g");
    console.log(`${ok ? "ok  " : "FAIL"} ${name} (found: ${found.join(", ") || "none"})`);
    if (!ok) failed++;
  }

  const staleLineCases = [
    { name: "a line-length pin whose file is gone is stale", files: [], expect: LONG_LINE_PINS.length },
    { name: "a line-length pin whose file has fewer long lines now is stale, and only that one", files: LONG_LINE_PINS.map(([p]) => ({ path: p, text: p === linePin[0] ? `${longLine}\n`.repeat(linePin[1] - 1) : `${longLine}\n`.repeat(LONG_LINE_PINS.find(([q]) => q === p)[1]) })), expect: 1 },
    { name: "a line-length pin still matching its file's count is not stale", files: LONG_LINE_PINS.map(([p, c]) => ({ path: p, text: `${longLine}\n`.repeat(c) })), expect: 0 },
  ];
  for (const c of staleLineCases) {
    const got = findStaleLineLengthPins(c.files).length;
    const ok = got === c.expect;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (stale ${got}, expected ${c.expect})`);
    if (!ok) failed++;
  }

  // More than one pinned function shares a path (dispatch.mjs has two), so a file per pin would collide on path;
  // this groups pins by path first and concatenates that path's functions into one text, the way one real file
  // holds more than one long function.
  const filesForFunctionPins = (shrink) => {
    const byPath = new Map();
    for (const [p, nm, c] of LONG_FUNCTION_PINS) {
      const lines = shrink && p === shrink[0] && nm === shrink[1] ? c - 1 : c;
      byPath.set(p, (byPath.get(p) ?? "") + makeFn(nm, lines));
    }
    return [...byPath.entries()].map(([path, text]) => ({ path, text }));
  };
  const staleFuncCases = [
    { name: "a function-length pin whose file is gone is stale", files: [], expect: LONG_FUNCTION_PINS.length },
    { name: "a function-length pin whose function shrank is stale, and only that one", files: filesForFunctionPins(funcPin), expect: 1 },
    { name: "a function-length pin still matching its function's length is not stale", files: filesForFunctionPins(null), expect: 0 },
  ];
  for (const c of staleFuncCases) {
    const got = findStaleFunctionLengthPins(c.files).length;
    const ok = got === c.expect;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (stale ${got}, expected ${c.expect})`);
    if (!ok) failed++;
  }

  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : `\nself-test passed: each rule fails on known-bad input and passes known-good input (${cases.length + 1 + staleLineCases.length + staleFuncCases.length} cases)`);
  return failed ? 1 : 0;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  let files;
  try { files = listFiles(); } catch (e) { console.log(`lint-shape NOT RUN: ${e.message}`); return 2; }
  const violations = [...findViolations(files), ...findStaleLineLengthPins(files), ...findStaleFunctionLengthPins(files)];
  for (const v of violations) console.log(`FAIL ${v.path}${v.line ? `:${v.line}` : ""}: [${v.rule}] ${v.text}`);
  console.log(violations.length
    ? `\nlint-shape FAILED: ${violations.length} problem(s). Each line names the rule; the rules and their ratchets are in scripts/lint-shape.test.mjs.`
    : `lint-shape passed: ${files.length} plugin runtime file(s) checked against a ${LINE_MAX} character line ceiling (${LONG_LINE_PINS.length} pinned above it) and an ${FUNCTION_MAX} line function ceiling (${LONG_FUNCTION_PINS.length} pinned above it)`);
  return violations.length ? 1 : 0;
}

process.exitCode = main();
