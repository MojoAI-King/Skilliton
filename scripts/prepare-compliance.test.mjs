#!/usr/bin/env node
// prepare-compliance.test.mjs: the compliance scope proposal item and config.compliance.builtByCompany that
// packs/base/plugins/workflow/runtime/lib/prepare.mjs's planPrepareItems adds (N5), and the helpers in
// runtime/lib/project-files.mjs that hold their logic (complianceProposalItem, applyComplianceDefault,
// complianceConfigNote), over runtime/lib/compliance-scope.mjs's proposeScope/writeProposal/readScope/readProposal
// (lane N2, docs/decisions/2026-09-25-compliance-lives-in-public-skilliton-as-39ef.md). A separate file from
// prepare.test.mjs because that file is already pinned at its own line ceiling (scripts/lint.test.mjs) and has no
// room to grow.
//
// Real signals, real frameworks: a project's README naming FHIR resources (the same phrase
// scripts/compliance-scope.test.mjs uses for the ephi-handling signal) is enough to make HIPAA Security Rule
// recordable, because a library for it ships in packs/base/plugins/workflow/frameworks/.
//
//   node --test scripts/prepare-compliance.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");

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

function sg(ctx, args, { env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const prepare = (ctx, ...args) => sg(ctx, ["prepare", "--dir", ctx.dir, ...args]);
const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");
const write = (ctx, rel, text) => writeFileSync(join(ctx.dir, rel), text);
const proposalPath = (ctx) => join(ctx.dir, ".skilliton/compliance/proposal.json");

test("compliance.builtByCompany is drafted false and never overwritten by hand; a project with no compliance signal drafts a proposal with no recordable framework (N5)", (t) => {
  const ctx = fixture(t);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all);
  assert.equal(JSON.parse(read(ctx, ".skilliton/config.json")).compliance.builtByCompany, false);
  assert.match(r.all, /create\s+\.skilliton\/compliance\/proposal\.json\s+compliance scope proposal, 0 recordable framework\(s\)/);
  const proposal = JSON.parse(read(ctx, ".skilliton/compliance/proposal.json"));
  assert.deepEqual(proposal.frameworks, []);

  const cfg = JSON.parse(read(ctx, ".skilliton/config.json"));
  cfg.compliance.builtByCompany = true;
  write(ctx, ".skilliton/config.json", `${JSON.stringify(cfg, null, 2)}\n`);
  const again = prepare(ctx, "--apply");
  assert.equal(again.code, 0, again.all);
  assert.equal(JSON.parse(read(ctx, ".skilliton/config.json")).compliance.builtByCompany, true, "a person's true is kept, never reset to false");
});

test("a real signal drafts a scope proposal with a recordable framework, adopted untouched once it exists; a confirmed scope suppresses a new one (N5)", (t) => {
  const ctx = fixture(t);
  write(ctx, "README.md", "# fixture\n\nThe app exchanges FHIR resources.\n");

  const preview = prepare(ctx);
  assert.equal(preview.code, 0, preview.all);
  const previewMatch = /create\s+\.skilliton\/compliance\/proposal\.json\s+compliance scope proposal, (\d+) recordable framework\(s\)/.exec(preview.out);
  assert.ok(previewMatch, preview.all);
  assert.ok(Number(previewMatch[1]) >= 1, "the FHIR signal makes at least one framework recordable");
  assert.equal(existsSync(proposalPath(ctx)), false, "preview writes nothing");

  const applied = prepare(ctx, "--apply");
  assert.equal(applied.code, 0, applied.all);
  const proposal = JSON.parse(read(ctx, ".skilliton/compliance/proposal.json"));
  const recordable = proposal.frameworks.filter((f) => f.recordable);
  assert.ok(recordable.length >= 1, JSON.stringify(proposal.frameworks));
  assert.ok(recordable.some((f) => f.id === "hipaa-security-rule"), "a library for HIPAA Security Rule ships with Skilliton");

  const again = prepare(ctx, "--apply");
  assert.equal(again.code, 0, again.all);
  assert.match(again.out, /already prepared/, "the proposal file already exists, so nothing is redrafted");
  assert.deepEqual(JSON.parse(read(ctx, ".skilliton/compliance/proposal.json")), proposal, "not touched byte for byte");

  rmSync(proposalPath(ctx));
  mkdirSync(join(ctx.dir, ".skilliton/compliance"), { recursive: true });
  const scope = { schemaVersion: 1, decidedBy: "Fixture", decidedAt: "2026-01-01T00:00:00.000Z", frameworks: [], intake: {} };
  writeFileSync(join(ctx.dir, ".skilliton/compliance/scope.json"), `${JSON.stringify(scope, null, 2)}\n`);
  const withScope = prepare(ctx, "--apply");
  assert.equal(withScope.code, 0, withScope.all);
  assert.equal(existsSync(proposalPath(ctx)), false, "a confirmed scope means no new proposal is drafted");
});

test("an unusable scope.json is a plan note, not a failed prepare (ComplianceRefusal)", (t) => {
  const ctx = fixture(t);
  mkdirSync(join(ctx.dir, ".skilliton/compliance"), { recursive: true });
  writeFileSync(join(ctx.dir, ".skilliton/compliance/scope.json"), "not json");
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all, "one unusable file does not fail the whole prepare");
  assert.match(r.all, /Note: \.skilliton\/compliance\/scope\.json does not parse as JSON\./);
  assert.equal(existsSync(proposalPath(ctx)), false, "nothing was drafted while the scope file could not be read");
});
