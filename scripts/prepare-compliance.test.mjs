#!/usr/bin/env node
// prepare-compliance.test.mjs: the compliance scope proposal item and config.compliance.builtByCompany that
// packs/base/plugins/workflow/runtime/lib/prepare.mjs's planPrepareItems adds (N5), and the helpers in
// runtime/lib/project-files.mjs that hold their logic (loadSeamModule, proposeComplianceScope,
// complianceProposalItem, applyComplianceDefault, complianceConfigNote). A separate file from prepare.test.mjs
// because that file is already pinned at its own line ceiling (scripts/lint.test.mjs) and has no room to grow.
//
// The proposal comes from runtime/lib/compliance.mjs's proposeScope(root, project), a module owned by another lane
// that does not ship in this build; most of these tests run against a byte-for-byte copy of the plugin with a fake
// compliance.mjs added, the same way scripts/lifecycle.test.mjs's cross-lane test stubs security.mjs.
//
//   node --test scripts/prepare-compliance.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-prepare-compliance-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d);
  git(ctx.dir, "init", "-q", "-b", "main");
  return ctx;
}

function sg(ctx, args, { cli = CLI, env = {} } = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const prepare = (ctx, ...args) => sg(ctx, ["prepare", "--dir", ctx.dir, ...args]);
const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");
const write = (ctx, rel, text) => writeFileSync(join(ctx.dir, rel), text);

// A byte-for-byte copy of the plugin with a fake runtime/lib/compliance.mjs added (owned by another lane, not
// shipped here), run by its own entry point. Mirrors scripts/lifecycle.test.mjs's copyPlugin/cross-lane test.
function copyPluginWithCompliance(ctx, source) {
  const copy = join(ctx.base, "plugin-copy");
  cpSync(PLUGIN, copy, { recursive: true });
  writeFileSync(join(copy, "runtime", "lib", "compliance.mjs"), source);
  return join(copy, "runtime", "skilliton.mjs");
}

test("compliance.builtByCompany is drafted false and never overwritten by hand; no scope proposal is drafted when compliance.mjs is not in this build (N5)", (t) => {
  const ctx = fixture(t);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all);
  assert.equal(JSON.parse(read(ctx, ".skilliton/config.json")).compliance.builtByCompany, false);
  assert.equal(existsSync(join(ctx.dir, ".skilliton/compliance/scope.proposal.json")), false);
  assert.match(r.all, /not available in this build \(runtime\/lib\/compliance\.mjs is not present\)/);

  const cfg = JSON.parse(read(ctx, ".skilliton/config.json"));
  cfg.compliance.builtByCompany = true;
  write(ctx, ".skilliton/config.json", `${JSON.stringify(cfg, null, 2)}\n`);
  const again = prepare(ctx, "--apply");
  assert.equal(again.code, 0, again.all);
  assert.equal(JSON.parse(read(ctx, ".skilliton/config.json")).compliance.builtByCompany, true, "a person's true is kept, never reset to false");
});

test("a scope proposal is drafted from compliance.mjs's proposeScope (another lane, stubbed) and adopted untouched once it exists; a confirmed scope suppresses it (N5)", (t) => {
  const ctx = fixture(t);
  const entry = copyPluginWithCompliance(ctx, [
    "export async function proposeScope(root, project) {",
    "  const frameworks = ['SOC 2', 'HIPAA'];",
    "  return { frameworks, bytes: Buffer.from(JSON.stringify({ frameworks }, null, 2) + '\\n') };",
    "}",
    "",
  ].join("\n"));
  const prepareAt = (...args) => sg(ctx, ["prepare", "--dir", ctx.dir, ...args], { cli: entry });

  const preview = prepareAt();
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /create\s+\.skilliton\/compliance\/scope\.proposal\.json\s+compliance scope proposal, 2 framework\(s\)/);
  assert.equal(existsSync(join(ctx.dir, ".skilliton/compliance/scope.proposal.json")), false, "preview writes nothing");

  const applied = prepareAt("--apply");
  assert.equal(applied.code, 0, applied.all);
  assert.deepEqual(JSON.parse(read(ctx, ".skilliton/compliance/scope.proposal.json")).frameworks, ["SOC 2", "HIPAA"]);

  const again = prepareAt("--apply");
  assert.equal(again.code, 0, again.all);
  assert.match(again.out, /already prepared/, "the proposal file already exists, so nothing is redrafted");

  rmSync(join(ctx.dir, ".skilliton/compliance/scope.proposal.json"));
  mkdirSync(join(ctx.dir, ".skilliton/compliance"), { recursive: true });
  writeFileSync(join(ctx.dir, ".skilliton/compliance/scope.json"), "{}\n");
  const withScope = prepareAt("--apply");
  assert.equal(withScope.code, 0, withScope.all);
  assert.equal(existsSync(join(ctx.dir, ".skilliton/compliance/scope.proposal.json")), false, "a confirmed scope means no new proposal is drafted");
});
