#!/usr/bin/env node
// lifecycle-compliance.test.mjs: the "compliance" check in packs/base/plugins/workflow/runtime/lib/lifecycle.mjs
// (complianceCheck, next to securityCheck, added to CHECK_ORDER) and its logic in runtime/lib/project-files.mjs
// (complianceCheck, complianceProposalItem), over the real runtime/lib/compliance-scope.mjs and
// runtime/lib/compliance-sheet.mjs (lane N2/N3). A separate file from scripts/lifecycle.test.mjs because that file
// is already pinned at its own line ceiling (scripts/lint.test.mjs) and has no room to grow.
//
// Two halves: unit tests call complianceCheck directly against hand-built or fixture project roots for each of its
// states (fast, precise about ids and confidence); one CLI test proves the real end-to-end wiring (a planted
// signal, skilliton status, and the session-start hook block) the way a person would see it.
//
//   node --test scripts/lifecycle-compliance.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { complianceCheck } from "../packs/base/plugins/workflow/runtime/lib/project-files.mjs";
import { writeSheet } from "../packs/base/plugins/workflow/runtime/lib/compliance-sheet.mjs";
import { createRecord } from "../packs/base/plugins/workflow/runtime/lib/security.mjs";
import { makeSyntheticProject } from "./fixtures/compliance/synthetic-project.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const CLI = join(here, "skilliton.mjs");
const HOOK_BIN = join(REPO, "packs/base/plugins/workflow/bin/skilliton");
// complianceCheck's summary calls selfCommand(), which otherwise names this test script; called in-process (not
// through the CLI), it needs this the same way the CLI's own wrapper sets it.
process.env.SKILLITON_SELF = "skilliton";

// ---------------------------------------------------------------- unit-level: complianceCheck's states directly

function tmp(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lifecycle-compliance-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(root, rel, data) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
}
const recordable = (id, confidence = "moderate") => ({ id, label: id, kind: "framework", library: "shipped", timing: "now",
  confidence, score: 3, signals: [], triggers: [{ signal: "x", weight: "strong" }], variant: null, variantOpen: null,
  determination: "x", recordable: true });
const proposalWith = (frameworks) => ({ schemaVersion: 1, generatedAt: null, subject: { scanned: [], skipped: [] },
  knowledgeBase: { version: "1.0.0", status: "approved" }, signals: [], frameworks, notPointedAt: [], intakeQuestions: [], disclaimer: "x" });
const scopeWith = (ids) => ({ schemaVersion: 1, decidedBy: "Fixture", decidedAt: "2026-01-01T00:00:00.000Z",
  frameworks: ids.map((id) => ({ id, confidence: "moderate", signals: [] })), intake: {} });

test("complianceCheck: not-run with neither a proposal nor a confirmed scope", async (t) => {
  const root = tmp(t);
  const r = await complianceCheck(root);
  assert.equal(r.status, "not-run");
  assert.equal(r.summary, "compliance: no proposal and no confirmed scope");
});

test("complianceCheck: quiet (ok) when the proposal has no recordable framework", async (t) => {
  const root = tmp(t);
  write(root, ".skilliton/compliance/proposal.json", proposalWith([]));
  const r = await complianceCheck(root);
  assert.equal(r.status, "ok");
  assert.equal(r.summary, "compliance: nothing was proposed from the project's files");
});

test("complianceCheck: attention, waiting for a named confirmation, when a recordable framework has no confirmed scope yet", async (t) => {
  const root = tmp(t);
  write(root, ".skilliton/compliance/proposal.json", proposalWith([recordable("hipaa-security-rule")]));
  const r = await complianceCheck(root);
  assert.equal(r.status, "attention");
  assert.match(r.summary, /^compliance: proposal waiting for a named confirmation \(1 frameworks\): skilliton compliance scope --apply --decided-by <you>$/);
});

test("complianceCheck: still waiting when a scope exists but does not yet cover every recordable id (checked by id, not by generatedAt)", async (t) => {
  const root = tmp(t);
  write(root, ".skilliton/compliance/proposal.json", proposalWith([recordable("hipaa-security-rule"), recordable("ftc-safeguards")]));
  write(root, ".skilliton/compliance/scope.json", scopeWith(["ftc-safeguards"]));
  const r = await complianceCheck(root);
  assert.equal(r.status, "attention");
  assert.match(r.summary, /waiting for a named confirmation \(1 frameworks\)/, "only the framework not yet in scope is counted");
});

test("complianceCheck: a scope covering every recordable id falls through to the scope line, sheet missing (never written)", async (t) => {
  const root = tmp(t);
  write(root, ".skilliton/compliance/proposal.json", proposalWith([recordable("hipaa-security-rule")]));
  write(root, ".skilliton/compliance/scope.json", scopeWith(["hipaa-security-rule"]));
  const r = await complianceCheck(root);
  assert.equal(r.status, "attention");
  assert.equal(r.summary, "compliance: 1 framework(s) in scope, sheet missing: skilliton compliance sheet --apply");
});

test("complianceCheck: an unusable scope file is attention with the reason, not a crash (ComplianceRefusal)", async (t) => {
  const root = tmp(t);
  write(root, ".skilliton/compliance/scope.json", "not json");
  const r = await complianceCheck(root);
  assert.equal(r.status, "attention");
  assert.match(r.summary, /^compliance: \.skilliton\/compliance\/scope\.json does not parse as JSON$/);
});

test("complianceCheck: sheet current once written, and stale once a security record it covers changes (synthetic project)", async (t) => {
  const { root, dir, cleanup } = makeSyntheticProject();
  t.after(cleanup);
  process.env.SKILLITON_FRAMEWORKS_DIR = dir;
  t.after(() => { delete process.env.SKILLITON_FRAMEWORKS_DIR; });

  writeSheet(root, { apply: true, dir });
  const current = await complianceCheck(root);
  assert.equal(current.status, "ok", current.summary);
  assert.match(current.summary, /^compliance: 2 framework\(s\) in scope, sheet current: skilliton compliance sheet --apply$/);

  // fx-sign-in's record (synthetic-project.mjs) is evidence for the fixture library; a fresh observation for the
  // same control the fixture already covers changes what the sheet would render without a new "compliance sheet
  // --apply", so it reads stale.
  write(root, "src/sign-in.txt", "fixture source for sign-in, edited after the record\n");
  createRecord(root, { controlId: "SG-AUTHENTICATION", assessment: "observed", note: "Fixture: re-reviewed sign-in",
    reviewer: "Fixture Reviewer", sources: ["src/sign-in.txt"], artifacts: ["evidence/sign-in.txt"] }, { apply: true });
  const stale = await complianceCheck(root);
  assert.equal(stale.status, "attention");
  assert.match(stale.summary, /^compliance: 2 framework\(s\) in scope, sheet stale: skilliton compliance sheet --apply$/);
});

// ---------------------------------------------------------------- CLI-level: the real signal, status, session-start

const BASE_ENV = (() => {
  const env = { ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
  delete env.SKILLITON_DEBUG;
  return env;
})();
function git(dir, ...args) { return execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "lifecycle-compliance-cli-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d, { recursive: true });
  git(ctx.dir, "init", "-q", "-b", "main");
  return ctx;
}
function cli(ctx, args) { const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" }); return { code: r.status, all: `${r.stdout}${r.stderr}` }; }
function hook(ctx) {
  const r = spawnSync(HOOK_BIN, ["hook", "session-start"], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, input: JSON.stringify({ cwd: ctx.dir, hook_event_name: "session-start" }), encoding: "utf8" });
  return `${r.stdout}${r.stderr}`;
}

test("a real signal makes status and the session-start block report compliance waiting for confirmation", (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.dir, "README.md"), "# fixture\n\nThe app exchanges FHIR resources.\n");
  assert.equal(cli(ctx, ["prepare", "--apply"]).code, 0);
  git(ctx.dir, "add", "-A");
  git(ctx.dir, "commit", "-q", "-m", "init");

  const status = cli(ctx, ["status"]);
  assert.match(status.all, /ATTENTION\s+compliance: compliance: proposal waiting for a named confirmation \(\d+ frameworks\): skilliton compliance scope --apply --decided-by <you>/);

  const started = hook(ctx);
  assert.match(started, /^- Compliance \(needs attention\): compliance: proposal waiting for a named confirmation/m);
});
