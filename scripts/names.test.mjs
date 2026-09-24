#!/usr/bin/env node
// names.test.mjs: no current file uses the product's earlier name (PLAN.md M9; docs/BRANDING.md).
//
// Every tracked file, and every untracked file Git does not ignore, is searched for "skillgate" in any letter case.
// A match fails unless its file is on the allowlist below or its line matches an allowed phrase; each entry says why
// the earlier name belongs there. Historical records keep the names they were written with, and the code that
// detects state left under the earlier names spells them.
//
//   node scripts/names.test.mjs               exit 0 when every match is allowed, 1 when one is not, 2 when it cannot run
//   node scripts/names.test.mjs --self-test   proves the check fails on a disallowed match and passes an allowed one

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORD = /skillgate/i;

// Paths (a trailing slash means everything under that folder) where the earlier name is expected.
export const ALLOWED_PATHS = [
  ["evidence/", "recorded runs keep the names they ran with"],
  ["packs/base/plugins/workflow/runtime/lib/legacy-template.mjs", "the template the last release before the rename shipped, frozen so migration 0003 recognises the blocks that release wrote"],
  ["docs/archive/", "archived plans"],
  ["docs/tasks/", "task records are dated history"],
  [".skilliton/usage/ledger.jsonl", "the usage ledger names task records by id, and ids written before the rename keep the earlier name"],
  ["docs/decisions/", "decision entries are dated history"],
  ["docs/lessons/", "lesson entries are dated history"],
  ["DECISIONS.md", "dated decision sections and open items written before the rename"],
  ["docs/LESSONS.md", "dated lesson sections written before the rename"],
  ["docs/HANDOFF_ARCHIVE.md", "archived handoff notes"],
  ["docs/BACKLOG_ARCHIVE.md", "closed backlog items"],
  ["DAY-1-KICKOFF.md", "the original kickoff document"],
  ["docs/BRANDING.md", "explains the former name and what kept it"],
  ["docs/PHASE-3.md", "describes the rename"],
  [".skilliton/migrations/", "migration receipts written before the rename keep their schema"],
  [".skilliton/security/catalog.json", "this project's copy of a versioned catalog, changed only by a catalog migration"],
  ["scripts/fixtures/prototype-v1/", "byte-for-byte copies of the prototype"],
  ["packs/base/plugins/workflow/runtime/lib/legacy-names.mjs", "the one module that names the earlier technical identifiers"],
  ["packs/base/plugins/workflow/runtime/lib/prototype-v1.mjs", "the prototype's exact bytes, recognised by migration 0002"],
  ["scripts/migrate.test.mjs", "builds projects under the earlier names to migrate them"],
  ["scripts/rename.test.mjs", "builds projects, machines and repositories under the earlier names"],
  ["scripts/prepare.test.mjs", "builds a prototype project, which uses the earlier folder"],
  ["scripts/security-evidence.test.mjs", "runs the prototype's security runtime, which uses the earlier folder"],
  ["scripts/rehearsals/projects.mjs", "rehearses the prototype migration"],
  ["scripts/names.test.mjs", "this check"],
];

// Line phrases that may name the earlier product anywhere, each for a stated reason.
export const ALLOWED_LINES = [
  [/skillgate-(starter-1|baseline-2)/i, "security catalog versions that stored observations name (DECISIONS.md O23)"],
  [/skillgate:project/, "the prototype's block markers, recognised by migration 0002"],
  [/\.skillgate\/bin\/security-evidence\.mjs/, "the prototype's copied runtime path, removed by migration 0002"],
];

// Whole sections of a document that explain the earlier names: from the heading to the next heading of the same or a
// higher level, so subsections belong to it.
export const ALLOWED_SECTIONS = [
  ["docs/HANDOFF.md", "## Earlier", "handoff notes written before the rename"],
  ["docs/CONTRACTS.md", "## 16. The earlier names", "the reference table of state left under the earlier names"],
  ["docs/DELIVERY.md", "### A policy or gate from before the rename", "how a shared repository moves from a gate installed under the earlier names"],
];

// Lines in one named file that may spell the earlier names, for a stated reason. Code that can import
// runtime/lib/legacy-names.mjs uses its constants instead and has no entry here.
export const ALLOWED_FILE_LINES = [
  ["packs/base/plugins/guardrails/hooks/guard-bash.sh", /\.skillgate\/config\.json|\.skillgate\*config\.json|\/\.skillgate[|)]|SKILLGATE_GUARDRAILS|earlier Skillgate/, "a shell hook: keeps an unmigrated project's guardrail settings, asks before a command writes them, and names an earlier variable"],
  ["packs/base/plugins/guardrails/hooks/managed-block-guard.mjs", /\.skillgate\/config\.json|"\.skillgate"/, "a write hook: refuses turning a rule off in an unmigrated project's guardrail settings, which guard-bash.sh still reads"],
  ["scripts/guardrails-bypass.test.sh", /\.skillgate\/config\.json/, "tests that a write to an unmigrated project's guardrail settings asks"],
  ["scripts/scrub-check.sh", /\.config\/skillgate\/denylist/, "a shell script: names a denylist left at the earlier default location"],
  ["scripts/setup.mjs", /backups\/skillgate|"backups", "skillgate"/, "a standalone script: names status line backups left at the earlier default location"],
  ["scripts/delivery.test.mjs", /\.skillgate\/delivery\.json|skillgate\.delivery\/1/, "tests a shared branch whose policy is still at the earlier path"],
  ["docs/CONTRACTS.md", /earlier `?\.skillgate\/|earlier `SKILLGATE_|earlier `skillgate\.|`skillgate` and `<plugin>@skillgate`|`skillgate\.delivery\/1`/, "the contract for how earlier names are recognised"],
  ["docs/CLIENTS.md", /under the earlier Skillgate names/, "says which measurements ran under the earlier names"],
  [".gitignore", /^# Skillgate setup lock and private evidence$|^\/\.skillgate\/(prepare\.lock|private-evidence\/)$/, "migration 0003 keeps the earlier ignore lines for clones and branches not yet migrated"],
  ["README.md", /formerly called Skillgate/, "says what the product used to be called"],
  ["PLAN.md", /formerly Skillgate/, "says what the product used to be called"],
];

// Folders that hold exact copies of product files, kept at their original paths below the folder. A copy is checked
// under the rules of the file it copies, never waved through as a folder: the earlier name passes in a copy only where
// the product file itself may carry it, so a file added there that copies nothing gets no pass.
export const MIRRORED_FOLDERS = [
  ["site/design/product-sources/", "the website's copies of product files at the release it quotes, which its own checks hash"],
];
const rulePathOf = (path) => { const m = MIRRORED_FOLDERS.find(([f]) => path.startsWith(f)); return m ? path.slice(m[0].length) : path; };

export function findViolations(files) {
  const violations = [];
  for (const { path, text } of files) {
    const rules = rulePathOf(path);
    if (ALLOWED_PATHS.some(([p]) => (p.endsWith("/") ? rules.startsWith(p) : rules === p))) continue;
    const sections = ALLOWED_SECTIONS.filter(([p]) => p === rules).map(([, heading]) => heading);
    let sectionLevel = 0; // the heading level of the allowed section the line is in, or 0
    text.split("\n").forEach((line, i) => {
      const heading = /^(#{1,6}) /.exec(line);
      if (heading && (sectionLevel === 0 || heading[1].length <= sectionLevel)) sectionLevel = sections.includes(line.trim()) ? heading[1].length : 0;
      const inSection = sectionLevel > 0;
      if (inSection || !WORD.test(line)) return;
      if (ALLOWED_LINES.some(([re]) => re.test(line))) return;
      if (ALLOWED_FILE_LINES.some(([p, re]) => p === rules && re.test(line))) return;
      violations.push({ path, line: i + 1, text: line.trim().slice(0, 160) });
    });
    if (WORD.test(path) && !ALLOWED_LINES.some(([re]) => re.test(path))) violations.push({ path, line: 0, text: "(the file name itself)" });
  }
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

function selfTest() {
  const cases = [
    { name: "a current guide naming the earlier command fails", files: [{ path: "docs/ONBOARDING.md", text: "Run skillgate join.\n" }], expect: 1 },
    { name: "an environment variable under the earlier name fails", files: [{ path: "packs/base/plugins/workflow/runtime/lib/core.mjs", text: "process.env.SKILLGATE_DEBUG\n" }], expect: 1 },
    { name: "a file named with the earlier name fails", files: [{ path: "scripts/skillgate.mjs", text: "" }], expect: 1 },
    { name: "a history file passes", files: [{ path: "docs/archive/autopilot-foundation/PLAN.md", text: "skillgate prepare\n" }], expect: 0 },
    { name: "a catalog version passes", files: [{ path: "docs/security-catalog-sources.md", text: "catalog skillgate-baseline-2\n" }], expect: 0 },
    { name: "the former-name sentence passes where it is allowed", files: [{ path: "README.md", text: "Skilliton is the product formerly called Skillgate.\n" }], expect: 0 },
    { name: "the same sentence in another guide fails", files: [{ path: "docs/ONBOARDING.md", text: "Skilliton is the product formerly called Skillgate.\n" }], expect: 1 },
    { name: "an earlier policy path in a template fails", files: [{ path: "packs/base/plugins/workflow/templates/harness.md", text: "passes the checks in `.skillgate/delivery.json`\n" }], expect: 1 },
    { name: "an earlier command in the current handoff note fails", files: [{ path: "docs/HANDOFF.md", text: "## RESUME HERE\n\nrun skillgate status\n\n## Earlier\n\nskillgate status\n" }], expect: 1 },
    { name: "an allowed section passes, subsections included", files: [{ path: "docs/HANDOFF.md", text: "## Earlier\n\n### 2026-09-16\nskillgate status\n" }], expect: 0 },
    { name: "the same line outside that section fails", files: [{ path: "docs/CONTRACTS.md", text: "## 15. Codex adapter\n\n| .skillgate/ | refused |\n" }], expect: 1 },
    { name: "a mirrored copy passes where the file it copies may use the name", files: [{ path: "site/design/product-sources/docs/CONTRACTS.md", text: "## 16. The earlier names\n\n| .skillgate/ | migrated |\n" }], expect: 0 },
    { name: "a mirrored copy fails where the file it copies may not", files: [{ path: "site/design/product-sources/docs/CONTRACTS.md", text: "## 15. Codex adapter\n\n| .skillgate/ | refused |\n" }], expect: 1 },
    { name: "a file in the mirror folder that copies nothing allowed fails", files: [{ path: "site/design/product-sources/notes.md", text: "skillgate status\n" }], expect: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findViolations(c.files).length;
    const ok = (got > 0 ? 1 : 0) === c.expect;
    console.log(`${ok ? "ok  " : "FAIL"} ${c.name} (violations ${got})`);
    if (!ok) failed++;
  }
  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : "\nself-test passed: the check fails on disallowed uses and passes allowed ones");
  return failed ? 1 : 0;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  let files;
  try { files = listFiles(); } catch (e) { console.log(`names check NOT RUN: ${e.message}`); return 2; }
  const violations = findViolations(files);
  for (const v of violations) console.log(`FAIL ${v.path}${v.line ? `:${v.line}` : ""}: ${v.text}`);
  console.log(violations.length
    ? `\nnames check FAILED: ${violations.length} use(s) of the earlier name outside the allowlist in scripts/names.test.mjs. Use Skilliton, or add an allowlist entry that says why the earlier name belongs there.`
    : `names check passed: ${files.length} file(s) searched; every use of the earlier name is on the allowlist`);
  return violations.length ? 1 : 0;
}

process.exitCode = main();
