#!/usr/bin/env node
// lifecycle-compliance.test.mjs: the "compliance" check in packs/base/plugins/workflow/runtime/lib/lifecycle.mjs
// (complianceCheck, next to securityCheck, added to CHECK_ORDER) and its engine in runtime/lib/project-files.mjs
// (complianceCheck, loadSeamModule, proposeComplianceScope) (N5). A separate file from scripts/lifecycle.test.mjs
// because that file is already pinned at its own line ceiling (scripts/lint.test.mjs) and has no room to grow.
//
// compliance.mjs's complianceSummary(root) is owned by another lane and does not ship in this build; these tests
// stub it in a byte-for-byte copy of the plugin, the same way scripts/lifecycle.test.mjs's own cross-lane test
// stubs security.mjs's securitySummary and migrations.mjs's migrationState.
//
//   node --test scripts/lifecycle-compliance.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");
const HAS_COMPLIANCE = existsSync(join(PLUGIN, "runtime", "lib", "compliance.mjs"));
const RECORD_FILES = ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md"];

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-lifecycle-compliance-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  try {
    await body({ dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (cwd, env, message) => { git(cwd, ["add", "-A"], env); git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message], env); };

function preparedRepo(dir, env) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
  const version = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
  mkdirSync(join(dir, ".skilliton"), { recursive: true });
  writeFileSync(join(dir, ".skilliton", "config.json"), `${JSON.stringify({ prepare: { version: 3, requires: { workflow: version } } }, null, 2)}\n`);
  for (const rel of RECORD_FILES) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `# ${rel}\n\nKind: Living.\n`);
  }
  writeFileSync(join(dir, "docs", "HANDOFF.md"), `# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: ${new Date().toISOString()}\n\n- **State:** fixture.\n- **Next:** nothing.\n- **Blocked:** nothing.\n- **Watch out:** nothing.\n`);
  commit(dir, env, "prepare");
  return dir;
}

function copyPlugin(dir, source) {
  const copy = join(dir, "plugin-copy");
  cpSync(PLUGIN, copy, { recursive: true });
  writeFileSync(join(copy, "runtime", "lib", "compliance.mjs"), source);
  return { root: copy, entry: join(copy, "runtime", "skilliton.mjs") };
}

const statusJson = (dir, env, { entry = CLI } = {}) => {
  const r = spawnSync(process.execPath, [entry, "status", "--json"], { cwd: dir, env, encoding: "utf8" });
  const trimmed = (r.stdout ?? "").trim();
  assert.ok(trimmed.startsWith("{") && trimmed.endsWith("}"), `stdout is not one JSON object:\n${r.stdout}${r.stderr}`);
  return { code: r.status, json: JSON.parse(trimmed), all: `${r.stdout}${r.stderr}` };
};
const check = (json, name) => json.details.checks.find((c) => c.name === name);

test("compliance is not-run, with a plain reason, when compliance.mjs is not in this build", () => withTemp("absent", async ({ dir, env }) => {
  if (HAS_COMPLIANCE) return; // this build ships it: the absent-module path is not the one under test here
  const p = preparedRepo(join(dir, "p"), env);
  const r = statusJson(p, env);
  assert.equal(r.code, 0, r.all);
  const c = check(r.json, "compliance");
  assert.equal(c.status, "not-run");
  assert.match(c.summary, /not available in this build \(runtime\/lib\/compliance\.mjs is not present\)/);
}));

test("compliance's three reported states and the empty one, from compliance.mjs's complianceSummary (another lane, stubbed): a waiting proposal, a confirmed scope with its sheet's freshness, and neither (N5)", () => withTemp("cross-lane", async ({ dir, env }) => {
  const copy = copyPlugin(dir, [
    "export async function complianceSummary() {",
    "  const mode = process.env.FAKE_COMPLIANCE;",
    "  if (mode === 'proposal') return { available: true, proposal: { frameworks: 3 }, scope: null };",
    "  if (mode === 'scope-current') return { available: true, proposal: null, scope: { frameworks: 4, sheet: 'current' } };",
    "  if (mode === 'scope-stale') return { available: true, proposal: null, scope: { frameworks: 4, sheet: 'stale' } };",
    "  if (mode === 'unavailable') return { available: false, reason: 'no compliance evidence in this project' };",
    "  return { available: true, proposal: null, scope: null };",
    "}",
    "",
  ].join("\n"));
  const p = preparedRepo(join(dir, "p"), env);
  const run = (FAKE_COMPLIANCE) => statusJson(p, { ...env, FAKE_COMPLIANCE }, { entry: copy.entry });

  const proposal = run("proposal");
  assert.equal(proposal.code, 1, proposal.all);
  assert.equal(check(proposal.json, "compliance").status, "attention");
  assert.match(check(proposal.json, "compliance").summary, /^compliance: proposal waiting for a named confirmation \(3 frameworks\): skilliton compliance scope --apply --decided-by <you>$/);

  const current = run("scope-current");
  assert.equal(current.code, 0, current.all);
  assert.equal(check(current.json, "compliance").status, "ok");
  assert.match(check(current.json, "compliance").summary, /^compliance: 4 framework\(s\) in scope, sheet current: skilliton compliance sheet --apply$/);

  const stale = run("scope-stale");
  assert.equal(stale.code, 1, stale.all);
  assert.equal(check(stale.json, "compliance").status, "attention");
  assert.match(check(stale.json, "compliance").summary, /^compliance: 4 framework\(s\) in scope, sheet stale: skilliton compliance sheet --apply$/);

  const none = run("none");
  assert.equal(none.code, 0, none.all);
  assert.equal(check(none.json, "compliance").status, "not-run");
  assert.equal(check(none.json, "compliance").summary, "compliance: no proposal and no confirmed scope");

  const unavailable = run("unavailable");
  assert.equal(unavailable.code, 0, unavailable.all);
  assert.equal(check(unavailable.json, "compliance").status, "not-run");
  assert.match(check(unavailable.json, "compliance").summary, /compliance not available: no compliance evidence in this project/);
}));
