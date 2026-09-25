#!/usr/bin/env node
// maintain-security-collectors.test.mjs: `skilliton maintain` refreshing the collector-backed security records that
// are missing or stale (packs/base/plugins/workflow/runtime/lib/maintain.mjs runMaintain, the step added after the
// indexes and before the security findings block; field report N44, backlog B71).
//
// Covers: collect secrets runs when SG-SECRETS-IN-SOURCE's record is missing or stale; collect delivery-policy runs
// when SG-CHECK-CRITERIA's is, and only when .skilliton/delivery.json exists; a current record is left alone (two
// maintain runs write one record, not two); preview says what it would run without running it; a control decided
// not to apply is left alone; the tests collector is never run by maintain; a collector that cannot run (an invalid
// secrets allowlist) is reported as not run, never as success, and never stops the rest of maintenance.
//
//   node --test scripts/maintain-security-collectors.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");
const CATALOG = join(PLUGIN, "catalogs", "skillgate-baseline-2.json");
const INSTALLED = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const SECURITY = ".skilliton/security";
const RECORD_FILES = ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md"];

// ---------------------------------------------------------------- harness (mirrors scripts/lifecycle.test.mjs)

function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-maintain-collect-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  try {
    return body({ dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (cwd, env, message) => { git(cwd, ["add", "-A"], env); git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message], env); };

function writeConfig(dir, config) {
  mkdirSync(join(dir, ".skilliton"), { recursive: true });
  writeFileSync(join(dir, ".skilliton", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

// A prepared, git-committed project with every record file and, unlike lifecycle.test.mjs's fixture, a security
// catalog (so runMaintain's collectors step has something to evaluate).
function preparedRepo(dir, env) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
  writeConfig(dir, { prepare: { version: 3, requires: { workflow: INSTALLED } } });
  // Real `prepare` adds this so private evidence is never committed; without it, a later commit in a test would
  // track the collectors' own manifest files, whose 64-character hex lines match the secrets scanner's own
  // long-encoded-run rule and would escalate every later assessment to needs-human for a reason with nothing to do
  // with this item.
  writeFileSync(join(dir, ".gitignore"), ".skilliton/private-evidence/\n");
  for (const rel of RECORD_FILES) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `# ${rel}\n\nKind: Living.\n`);
  }
  writeFileSync(join(dir, "docs", "HANDOFF.md"), `# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: ${new Date().toISOString()}\n\n- **State:** fixture.\n- **Next:** nothing.\n- **Blocked:** nothing.\n- **Watch out:** nothing.\n`);
  mkdirSync(join(dir, SECURITY), { recursive: true });
  writeFileSync(join(dir, SECURITY, "catalog.json"), readFileSync(CATALOG));
  commit(dir, env, "prepare");
  return dir;
}

function cli(cwd, args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

// A byte-for-byte copy of the plugin with a fake runtime/lib/compliance.mjs added (that module belongs to another
// lane and does not ship here yet), run directly by its own entry point rather than through scripts/skilliton.mjs,
// which always names the real plugin. Mirrors scripts/lifecycle.test.mjs's copyPlugin/cross-lane test.
function copyPluginWithCompliance(dir, source) {
  const copy = join(dir, "plugin-copy");
  cpSync(PLUGIN, copy, { recursive: true });
  writeFileSync(join(copy, "runtime", "lib", "compliance.mjs"), source);
  return join(copy, "runtime", "skilliton.mjs");
}
function cliAt(entry, cwd, args, env) {
  const r = spawnSync(process.execPath, [entry, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

const records = (dir) => {
  const folder = join(dir, SECURITY, "records");
  return existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(folder, f), "utf8"))) : [];
};
const writePolicy = (dir) => writeFileSync(join(dir, ".skilliton", "delivery.json"), JSON.stringify({ schema: "skilliton.delivery/1", protectedBranches: ["main"], checks: [{ name: "noop", command: ["true"], timeoutSeconds: 30 }] }, null, 2) + "\n");

// ---------------------------------------------------------------- tests

test("maintain --apply collects secrets and the delivery policy for missing records, settles once the backlog's own findings rewrite has nothing left to change, gates delivery-policy on the policy file existing, and never runs the tests collector", () => withTemp("happy", ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);

  // Preview: says what it would run, runs and writes nothing.
  const preview = cli(p, ["maintain"], env);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /would write\s+security collect secrets\s+SG-SECRETS-IN-SOURCE is missing/);
  assert.match(preview.out, /not run\s+security collect delivery-policy\s+SG-CHECK-CRITERIA is missing, but \.skilliton\/delivery\.json does not exist/);
  assert.doesNotMatch(preview.out, /security collect tests/, "the tests collector is never named by maintain");
  assert.deepEqual(records(p), []);

  // Apply: secrets is collected (no delivery.json yet, so delivery-policy is gated off, not run). The findings step,
  // right after, rewrites docs/BACKLOG.md, which is one of the tracked files the secrets collector fingerprinted a
  // moment earlier, so the new record is stale before the run ends; the same run collects once more and writes the
  // findings again, which then change nothing (B81), so one run settles.
  const run1 = cli(p, ["maintain", "--apply"], env);
  assert.equal(run1.code, 0, run1.all);
  assert.match(run1.out, /wrote\s+security collect secrets\s+recorded observed for SG-SECRETS-IN-SOURCE\n/);
  assert.match(run1.out, /wrote\s+security collect secrets\s+recorded observed for SG-SECRETS-IN-SOURCE again, because the findings rewrite/);
  assert.match(run1.out, /current\s+security findings/);
  assert.match(run1.out, /not run\s+security collect delivery-policy\s+SG-CHECK-CRITERIA is missing, but \.skilliton\/delivery\.json does not exist/);
  let recs = records(p);
  assert.equal(recs.length, 2, JSON.stringify(recs));
  for (const r of recs) {
    assert.equal(r.controlId, "SG-SECRETS-IN-SOURCE");
    assert.equal(r.reviewer, "skilliton maintain");
    assert.equal(r.assessment, "observed");
  }

  // From here the record is current and is left alone: two more applies in a row write nothing further for it.
  for (const run of [cli(p, ["maintain", "--apply"], env), cli(p, ["maintain", "--apply"], env)]) {
    assert.equal(run.code, 0, run.all);
    assert.match(run.out, /current\s+security collect secrets\s+SG-SECRETS-IN-SOURCE is current/);
  }
  assert.equal(records(p).length, 2, "a current record is left alone, not re-collected, once settled");

  // Now the delivery policy exists: collect delivery-policy runs. The open count is unchanged (the control is still
  // undecided), so the backlog's one findings line (B78) does not change and the secrets record stays current.
  writePolicy(p);
  commit(p, env, "add delivery policy");
  const withPolicy = cli(p, ["maintain", "--apply"], env);
  assert.equal(withPolicy.code, 0, withPolicy.all);
  assert.match(withPolicy.out, /wrote\s+security collect delivery-policy\s+recorded observed for SG-CHECK-CRITERIA\n/);
  assert.doesNotMatch(withPolicy.out, /wrote\s+security collect secrets/);
  assert.equal(records(p).length, 3, JSON.stringify(records(p)));

  const settled = cli(p, ["maintain", "--apply"], env);
  assert.equal(settled.code, 0, settled.all);
  assert.match(settled.out, /current\s+security collect secrets\s+SG-SECRETS-IN-SOURCE is current/);
  assert.match(settled.out, /current\s+security collect delivery-policy\s+SG-CHECK-CRITERIA is current/);
  const recsFinal = records(p);
  assert.equal(recsFinal.length, 3, "settled: no further record for either control");
  for (const r of recsFinal) assert.equal(r.reviewer, "skilliton maintain");
  assert.ok(recsFinal.some((r) => r.controlId === "SG-CHECK-CRITERIA" && r.assessment === "observed"));
  assert.ok(!recsFinal.some((r) => r.controlId === "SG-SECURITY-TESTS"), "the tests collector never wrote a record");
}));

test("maintain leaves a control alone once applicability says it does not apply", () => withTemp("not-applicable", ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const decided = cli(p, ["security", "applicability", "--control", "SG-SECRETS-IN-SOURCE", "--applies", "false", "--rationale", "no source in this fixture", "--decided-by", "test", "--dir", p, "--apply"], env);
  assert.equal(decided.code, 0, decided.all);
  commit(p, env, "decide applicability");

  const applied = cli(p, ["maintain", "--apply"], env);
  assert.equal(applied.code, 0, applied.all);
  assert.doesNotMatch(applied.out, /security collect secrets/, "a control decided not to apply is left alone, not even reported as current");
  assert.equal(records(p).length, 0);
}));

test("a collector that cannot run is reported as not run, never as success, and does not stop the rest of maintenance", () => withTemp("cannot-run", ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  mkdirSync(join(p, SECURITY), { recursive: true });
  writeFileSync(join(p, SECURITY, "secrets-allow.json"), "not json");
  commit(p, env, "invalid secrets allowlist");

  const applied = cli(p, ["maintain", "--apply"], env);
  assert.equal(applied.code, 0, applied.all, "one collector failing does not fail the mechanical half");
  assert.match(applied.out, /not run\s+security collect secrets\s+INVALID_SECRETS_ALLOWLIST/);
  assert.doesNotMatch(applied.out, /wrote\s+security collect secrets/);
  assert.equal(records(p).filter((r) => r.controlId === "SG-SECRETS-IN-SOURCE").length, 0, "the collector wrote nothing");
  assert.match(applied.out, /wrote\s+journal\s+maintain event recorded/, "maintenance still records that it ran");
}));

test("the compliance sheet step: not run before a scope is confirmed, not run (never success) when compliance.mjs is not in this build, and writes or reports current once both are true (writeSheet stubbed, N5)", () => withTemp("compliance-sheet", ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);

  const noScope = cli(p, ["maintain", "--apply"], env);
  assert.equal(noScope.code, 0, noScope.all);
  assert.match(noScope.out, /not run\s+compliance sheet\s+no confirmed compliance scope at \.skilliton\/compliance\/scope\.json/);

  mkdirSync(join(p, ".skilliton", "compliance"), { recursive: true });
  writeFileSync(join(p, ".skilliton", "compliance", "scope.json"), JSON.stringify({ frameworks: ["SOC 2"] }));
  commit(p, env, "confirm compliance scope");
  const noModule = cli(p, ["maintain", "--apply"], env);
  assert.equal(noModule.code, 0, noModule.all);
  assert.match(noModule.out, /not run\s+compliance sheet\s+.*compliance\.mjs/, "a module not in this build is reported as not run, never as success");

  const entry = copyPluginWithCompliance(dir, [
    "export async function writeSheet(root, { apply }) {",
    "  if (process.env.FAKE_SHEET === 'current') return { changed: false, rows: 0 };",
    "  return { changed: true, rows: 3 };",
    "}",
    "",
  ].join("\n"));
  const preview = cliAt(entry, p, ["maintain"], { ...env, FAKE_SHEET: "changed" });
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /would write\s+compliance sheet\s+3 row\(s\) changed/);

  const applied = cliAt(entry, p, ["maintain", "--apply"], { ...env, FAKE_SHEET: "changed" });
  assert.equal(applied.code, 0, applied.all);
  assert.match(applied.out, /wrote\s+compliance sheet\s+3 row\(s\) changed/);

  const current = cliAt(entry, p, ["maintain", "--apply"], { ...env, FAKE_SHEET: "current" });
  assert.equal(current.code, 0, current.all);
  assert.match(current.out, /current\s+compliance sheet\s+current/);
}));
