#!/usr/bin/env node
// lint.test.mjs: the repository's lint step (report card area 06 batch 01; decision 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d).
//
// Plain Node, no eslint, no package.json, no node_modules, so this runs the same way on a laptop and in CI. The
// decision entry says why: docs/IT-ALLOWLIST.md line 81 promises an IT department that Skilliton's plugins declare no
// package dependencies, and a lint that needs an install would make that sentence false and would run differently in
// the two places.
//
// Five rules, each with its own allowlist of [pattern, reason] pairs below:
//
//   size            a plugin runtime file, or a check or tool under scripts/ (B59, 2026-09-22), may not pass
//                   RUNTIME_MAX_LINES; the files already past it are pinned at
//                   their exact count and may not grow by one line (the ratchet). A pin is deleted, not raised, when
//                   the file drops under the ceiling.
//   unused-import   a name in an import { ... } list that appears nowhere else in the file. Only an import that
//                   starts a line is read, so a fixture that builds source code inside a string is not linted as code.
//   console         console.log in a plugin runtime, where stdout goes through say(). console.error is untouched:
//                   a refusal writes there on purpose.
//   command-shape   a runtime/commands/*.mjs that does not export both help and run, and a command in the router's
//                   GROUPS table with no commands/<name>.mjs module beside it (docs/CONTRACTS.md section 9)
//   no-dependencies a tracked package.json outside scripts/fixtures/, which is what would make that page false
//
// Bash hooks (packs/*/plugins/*/hooks/*.sh) have no size ceiling here: the guardrails hook is one long case table on
// purpose, and splitting it would put its rules in more than one file. Its shape is held by scripts/guardrails.test.sh.
//
// Dashes are not checked here: scripts/scrub-check.sh owns em and en dashes across the tree and over history, and two
// implementations of one rule drift.
//
//   node scripts/lint.test.mjs               exit 0 when every rule holds, 1 when one does not, 2 when it cannot run
//   node scripts/lint.test.mjs --self-test   proves each rule fails on known-bad input and passes known-good input

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// A file shipped inside a plugin's runtime. The ceiling and the console rule apply to these.
const RUNTIME_RE = /^packs\/[^/]+\/plugins\/[^/]+\/runtime\/.*\.mjs$/;
// The repository's own checks and tools, under the same ceiling and ratchet (B59). Fixtures are sample input, not code.
const SCRIPTS_RE = /^scripts\/(?!fixtures\/).*\.(?:mjs|sh)$/;
const COMMAND_RE = /^packs\/[^/]+\/plugins\/[^/]+\/runtime\/commands\/([a-z][a-z-]*)\.mjs$/;
const ROUTER_RE = /^packs\/[^/]+\/plugins\/[^/]+\/runtime\/skilliton\.mjs$/;

export const RUNTIME_MAX_LINES = 600;

// The ratchet. Each file was already past the ceiling when the rule shipped on 2026-09-20 and is pinned at the exact
// count it had that day: it may shrink, and the row is deleted once it is under the ceiling, but it may not grow.
// Do not raise a number here. Raising one is how a ceiling stops being one.
export const PINNED_LINES = [
  ["packs/base/plugins/workflow/runtime/lib/migrations.mjs", 698],
  // scripts/, pinned 2026-09-22 when the ceiling was extended to them (B59). The real fix for the longest is a split by
  // subject, following the split-a-file skill.
  ["scripts/lifecycle.test.mjs", 2098],
  ["scripts/delivery.test.mjs", 1081],
  ["scripts/release.test.mjs", 1039],
  ["scripts/guardrails.test.sh", 1027],
  ["scripts/allowlist.test.mjs", 1003],
  ["scripts/security-evidence.test.mjs", 785],
  ["scripts/skilliton.test.mjs", 708],
  ["scripts/inventory.mjs", 688],
  ["scripts/prepare.test.mjs", 667],
  ["scripts/deadcode.mjs", 634],
  ["scripts/preflight.test.mjs", 622],
  ["scripts/join.test.mjs", 617],
  ["packs/base/plugins/workflow/runtime/lib/preflight.mjs", 672],
  ["packs/base/plugins/workflow/runtime/lib/release.mjs", 614],
  ["packs/base/plugins/workflow/runtime/lib/prepare.mjs", 610],
  ["packs/base/plugins/workflow/runtime/lib/join.mjs", 603],
];

// console.log that is not a print: a definition of the helper itself, or an injected default the caller replaces.
export const ALLOWED_CONSOLE = [
  ["packs/base/plugins/workflow/runtime/lib/core.mjs", /^const say = \(line = ""\) => console\.log\(line\);$/, "the definition of say() itself"],
  ["packs/base/plugins/workflow/runtime/lib/delivery.mjs", /print = \(line\) => console\.log\(line\)/, "a default print parameter; every caller in the runtime passes say()"],
];

// Imported names that are allowed to look unused because they are referenced somewhere this rule cannot read.
export const ALLOWED_UNUSED = [];

// Paths where a package.json is expected. Everything else would make docs/IT-ALLOWLIST.md line 81 false.
export const ALLOWED_PACKAGE_JSON = [
  ["scripts/fixtures/", "test fixtures build sample projects that have their own dependencies; nothing here installs them"],
];

const lineCount = (text) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
const pinOf = (path) => PINNED_LINES.find(([p]) => p === path);

function ruleSize(files, violations) {
  for (const { path, text } of files) {
    if (!RUNTIME_RE.test(path) && !SCRIPTS_RE.test(path)) continue;
    const n = lineCount(text);
    const pin = pinOf(path);
    if (pin) {
      if (n > pin[1]) violations.push({ rule: "size", path, line: n, text: `${n} lines, pinned at ${pin[1]}; this file is already over the ${RUNTIME_MAX_LINES} line ceiling and may not grow. Move code out, or split it; do not raise the pin in scripts/lint.test.mjs` });
      continue;
    }
    if (n > RUNTIME_MAX_LINES) violations.push({ rule: "size", path, line: n, text: `${n} lines, over the ${RUNTIME_MAX_LINES} line ceiling for ${SCRIPTS_RE.test(path) ? "a check or tool under scripts/. Split it by subject, following the split-a-file skill" : "a plugin runtime file. Split it, following runtime/commands/gate.mjs: a thin command and an engine in runtime/lib/"}` });
  }
}

// A pin whose file is gone, or has dropped under the ceiling, protects nothing and hides the next file that needs it.
export function findStalePins(paths, sizes) {
  const stale = [];
  for (const [path, pin] of PINNED_LINES) {
    if (!paths.includes(path)) { stale.push({ rule: "size", path, line: 0, text: `pinned at ${pin} in scripts/lint.test.mjs, but no such file is tracked. Delete the row` }); continue; }
    const n = sizes.get(path);
    if (n <= RUNTIME_MAX_LINES) stale.push({ rule: "size", path, line: n, text: `${n} lines, now under the ${RUNTIME_MAX_LINES} line ceiling, but still pinned at ${pin}. Delete the row so the ceiling applies` });
    // A pin above the file is slack the file can grow back into, which is a ratchet that does not ratchet.
    else if (n < pin) stale.push({ rule: "size", path, line: n, text: `${n} lines, pinned at ${pin}; the pin has ${pin - n} line(s) of slack the file could grow back into. Lower the pin to ${n}` });
  }
  return stale;
}

function ruleUnusedImport(files, violations) {
  for (const { path, text } of files) {
    if (!path.endsWith(".mjs")) continue;
    // Anchored to the start of a line: a real import always begins one, and an import written inside a string or a
    // template literal (a test fixture building source code) does not, so a fixture is not read as code.
    const re = /^import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']\s*;?/gm;
    let m;
    while ((m = re.exec(text))) {
      const rest = text.slice(0, m.index) + text.slice(m.index + m[0].length);
      const line = lineCount(text.slice(0, m.index)) + 1;
      for (const raw of m[1].split(",")) {
        const piece = raw.trim();
        if (!piece) continue;
        const name = piece.split(/\s+as\s+/).pop().trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
        if (new RegExp(`\\b${name}\\b`).test(rest)) continue;
        if (ALLOWED_UNUSED.some(([p, n]) => p === path && n === name)) continue;
        violations.push({ rule: "unused-import", path, line, text: `imports ${name}, which appears nowhere else in the file. Remove it from the import list` });
      }
    }
  }
}

function ruleConsole(files, violations) {
  for (const { path, text } of files) {
    if (!RUNTIME_RE.test(path)) continue;
    text.split("\n").forEach((line, i) => {
      if (!/console\.log\s*\(/.test(line)) return;
      if (ALLOWED_CONSOLE.some(([p, re]) => p === path && re.test(line.trim()))) return;
      violations.push({ rule: "console", path, line: i + 1, text: `console.log in a plugin runtime: ${line.trim().slice(0, 100)}. Print through say() so one place decides what stdout looks like` });
    });
  }
}

function ruleCommandShape(files, violations) {
  const byPath = new Map(files.map((f) => [f.path, f.text]));
  for (const { path, text } of files) {
    const m = COMMAND_RE.exec(path);
    if (!m) continue;
    if (!/export\s+const\s+help\b/.test(text)) violations.push({ rule: "command-shape", path, line: 0, text: "a command module must export a help string (docs/CONTRACTS.md section 9); the router prints it for --help" });
    if (!/export\s+(async\s+)?function\s+run\b|export\s+const\s+run\b/.test(text)) violations.push({ rule: "command-shape", path, line: 0, text: "a command module must export an async run(argv) returning an exit code (docs/CONTRACTS.md section 9)" });
  }
  for (const { path, text } of files) {
    if (!ROUTER_RE.test(path)) continue;
    const dir = path.replace(/skilliton\.mjs$/, "commands/");
    const re = /\{\s*name:\s*"([a-z][a-z-]*)"[^}]*\}/g;
    let m;
    while ((m = re.exec(text))) {
      const [entry, name] = m;
      if (byPath.has(`${dir}${name}.mjs`)) continue;
      // A run: property is not a way out: since the core.mjs split the router dispatches modules only, and an entry
      // carrying one would be listed, then refused as not built.
      violations.push({ rule: "command-shape", path, line: lineCount(text.slice(0, m.index)) + 1, text: `the router lists "${name}" but there is no ${dir}${name}.mjs, so typing the command fails at run time` });
    }
  }
}

function ruleNoDependencies(files, violations) {
  for (const { path } of files) {
    if (!/(^|\/)package(-lock)?\.json$/.test(path)) continue;
    if (ALLOWED_PACKAGE_JSON.some(([p]) => path.startsWith(p))) continue;
    violations.push({ rule: "no-dependencies", path, line: 0, text: "a tracked package.json outside scripts/fixtures/. docs/IT-ALLOWLIST.md line 81 tells an IT department that Skilliton's plugins declare no package dependencies; adding one means rewording that page first" });
  }
}

export function findViolations(files) {
  const violations = [];
  ruleSize(files, violations);
  ruleUnusedImport(files, violations);
  ruleConsole(files, violations);
  ruleCommandShape(files, violations);
  ruleNoDependencies(files, violations);
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
    let st;
    try { st = statSync(join(REPO, path)); } catch { continue; } // deleted in the working tree, not yet staged
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    const bytes = readFileSync(join(REPO, path));
    if (bytes.includes(0)) continue;
    files.push({ path, text: bytes.toString("utf8") });
  }
  return files;
}

const ROUTER_OK = `const GROUPS = [{ commands: [{ name: "gate", summary: "x" }] }];`;
const COMMAND_OK = 'export const help = "x";\nexport async function run(argv) { return 0; }\n';

function selfTest() {
  const cases = [
    { name: "a runtime file over the ceiling fails", files: [{ path: "packs/base/plugins/workflow/runtime/lib/new.mjs", text: `x\n`.repeat(RUNTIME_MAX_LINES + 1) }], expect: 1 },
    { name: "a runtime file at the ceiling passes", files: [{ path: "packs/base/plugins/workflow/runtime/lib/new.mjs", text: `x\n`.repeat(RUNTIME_MAX_LINES) }], expect: 0 },
    { name: "a pinned file one line longer than its pin fails", files: [{ path: PINNED_LINES[0][0], text: `x\n`.repeat(PINNED_LINES[0][1] + 1) }], expect: 1 },
    { name: "a pinned file at its pin passes", files: [{ path: PINNED_LINES[0][0], text: `x\n`.repeat(PINNED_LINES[0][1]) }], expect: 0 },
    { name: "a long file outside the runtime and scripts/ passes", files: [{ path: "docs/big.mjs", text: `x\n`.repeat(RUNTIME_MAX_LINES + 50) }], expect: 0 },
    { name: "a script over the ceiling fails (B59)", files: [{ path: "scripts/big.mjs", text: `x\n`.repeat(RUNTIME_MAX_LINES + 1) }], expect: 1 },
    { name: "a fixture under scripts/ is not held to the ceiling", files: [{ path: "scripts/fixtures/big.mjs", text: `x\n`.repeat(RUNTIME_MAX_LINES + 50) }], expect: 0 },
    { name: "an unused named import fails", files: [{ path: "scripts/a.mjs", text: 'import { join, basename } from "node:path";\njoin("a");\n' }], expect: 1 },
    { name: "every imported name used passes", files: [{ path: "scripts/a.mjs", text: 'import { join } from "node:path";\njoin("a");\n' }], expect: 0 },
    { name: "a renamed import counts its local name", files: [{ path: "scripts/a.mjs", text: 'import { join as j } from "node:path";\nj("a");\n' }], expect: 0 },
    { name: "console.log in a runtime file fails", files: [{ path: "packs/base/plugins/workflow/runtime/lib/x.mjs", text: 'console.log("hi");\n' }], expect: 1 },
    { name: "console.error in a runtime file passes", files: [{ path: "packs/base/plugins/workflow/runtime/lib/x.mjs", text: 'console.error("hi");\n' }], expect: 0 },
    { name: "console.log in a script passes", files: [{ path: "scripts/a.mjs", text: 'console.log("hi");\n' }], expect: 0 },
    { name: "a command module with no help export fails", files: [{ path: "packs/base/plugins/workflow/runtime/commands/x.mjs", text: "export async function run(argv) { return 0; }\n" }], expect: 1 },
    { name: "a command module with no run export fails", files: [{ path: "packs/base/plugins/workflow/runtime/commands/x.mjs", text: 'export const help = "x";\n' }], expect: 1 },
    { name: "a command module with both passes", files: [{ path: "packs/base/plugins/workflow/runtime/commands/x.mjs", text: COMMAND_OK }], expect: 0 },
    { name: "a router command with no module fails", files: [{ path: "packs/base/plugins/workflow/runtime/skilliton.mjs", text: ROUTER_OK }], expect: 1 },
    { name: "a router command with its module passes", files: [{ path: "packs/base/plugins/workflow/runtime/skilliton.mjs", text: ROUTER_OK }, { path: "packs/base/plugins/workflow/runtime/commands/gate.mjs", text: COMMAND_OK }], expect: 0 },
    { name: "a router command with a run: property and no module still fails", files: [{ path: "packs/base/plugins/workflow/runtime/skilliton.mjs", text: 'const GROUPS = [{ commands: [{ name: "doctor", summary: "x", run: cmdDoctor }] }];' }], expect: 1 },
    { name: "a package.json in the repository fails", files: [{ path: "package.json", text: '{"devDependencies":{"eslint":"9"}}\n' }], expect: 1 },
    { name: "a package.json in a plugin fails", files: [{ path: "packs/base/plugins/workflow/package.json", text: "{}\n" }], expect: 1 },
    { name: "a package.json in a fixture passes", files: [{ path: "scripts/fixtures/demo-app/package.json", text: "{}\n" }], expect: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findViolations(c.files).length;
    const ok = (got > 0 ? 1 : 0) === c.expect;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (violations ${got})`);
    if (!ok) failed++;
  }
  const pinCases = [
    { name: "a pin whose file is gone fails", paths: [], sizes: new Map(), expect: PINNED_LINES.length },
    { name: "a pin whose file dropped under the ceiling fails, and only that one", paths: PINNED_LINES.map(([p]) => p), sizes: new Map([...PINNED_LINES, [PINNED_LINES[0][0], RUNTIME_MAX_LINES]]), expect: 1 },
    { name: "a pin whose file is still over the ceiling passes", paths: PINNED_LINES.map(([p]) => p), sizes: new Map(PINNED_LINES), expect: 0 },
    { name: "a pin with slack above the file fails, and only that one", paths: PINNED_LINES.map(([p]) => p), sizes: new Map([...PINNED_LINES, [PINNED_LINES[0][0], PINNED_LINES[0][1] - 1]]), expect: 1 },
  ];
  for (const c of pinCases) {
    const got = findStalePins(c.paths, c.sizes).length;
    const ok = got === c.expect;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (stale pins ${got}, expected ${c.expect})`);
    if (!ok) failed++;
  }
  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : `\nself-test passed: each rule fails on known-bad input and passes known-good input (${cases.length + pinCases.length} cases)`);
  return failed ? 1 : 0;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  let files;
  try { files = listFiles(); } catch (e) { console.log(`lint NOT RUN: ${e.message}`); return 2; }
  const sizes = new Map(files.filter((f) => RUNTIME_RE.test(f.path)).map((f) => [f.path, lineCount(f.text)]));
  const violations = [...findViolations(files), ...findStalePins(files.map((f) => f.path), sizes)];
  for (const v of violations) console.log(`FAIL ${v.path}${v.line ? `:${v.line}` : ""}: [${v.rule}] ${v.text}`);
  const runtime = sizes.size;
  console.log(violations.length
    ? `\nlint FAILED: ${violations.length} problem(s). Each line names the rule; the rules and their allowlists are in scripts/lint.test.mjs, and decision 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d says why they are the ones here.`
    : `lint passed: ${files.length} file(s) read, ${runtime} plugin runtime file(s) measured against the ${RUNTIME_MAX_LINES} line ceiling with ${PINNED_LINES.length} pinned above it`);
  return violations.length ? 1 : 0;
}

process.exitCode = main();
