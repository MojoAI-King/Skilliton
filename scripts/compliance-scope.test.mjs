#!/usr/bin/env node
// compliance-scope.test.mjs: `skilliton compliance scope`, the port of MojoComply's scope scanner (lane N2).
//
// Planted phrases, one signal at a time, must propose exactly the frameworks the knowledge base names for that signal;
// look-alikes (a negated phrase, a phrase in a file the scanner does not read, a file over the cap, a symbolic link)
// must propose nothing and name what was not read; --apply without a named person is refused with nothing written.
//
// The knowledge base is the hand-made fixture scripts/fixtures/compliance/frameworks/scope-kb.json, of the same shape as
// the converted one. When the plugin's own frameworks/scope-kb.json is present (the frameworks-data lane ships it),
// the per-signal case runs against it too, and the converted file must satisfy the same validation.
//
//   node scripts/compliance-scope.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  KB_FILE, SCOPE_REL, SIGNAL_DETECTORS, kbProblems, loadFrameworksFolder, loadKb, planScope, proposeScope, readScope, scopeProblem, writeScope,
} from "../packs/base/plugins/workflow/runtime/lib/compliance-scope.mjs";
import { DEFAULTS, configProblems } from "../packs/base/plugins/workflow/runtime/lib/config.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, "packs/base/plugins/workflow/runtime/skilliton.mjs");
const FIXTURE_DIR = join(REPO, "scripts/fixtures/compliance/frameworks");
const SHIPPED_DIR = join(REPO, "packs/base/plugins/workflow/frameworks");
const FIXTURE_KB = loadKb(FIXTURE_DIR);
const SHIPPED_KB = existsSync(join(SHIPPED_DIR, KB_FILE)) ? loadKb(SHIPPED_DIR) : null;

const temps = [];
after(() => { for (const t of temps) rmSync(t, { recursive: true, force: true }); });
function project(files = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "compliance-scope-")));
  temps.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, SKILLITON_FRAMEWORKS_DIR: FIXTURE_DIR, SKILLITON_BACKUPS: join(tmpdir(), "compliance-scope-backups"), ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// One phrase per detector, each matching that detector alone.
const PHRASES = {
  "payment-card-acceptance": "We have a merchant account with our bank.",
  "payment-page-fully-outsourced": "The shop uses a hosted checkout page.",
  "payment-page-on-merchant-site": "The form uses hosted fields from the processor.",
  "card-data-handled-directly": "The service stores cardholder data.",
  "card-present-terminal": "Stores take payments with P2PE devices.",
  "ephi-handling": "The app exchanges FHIR resources.",
  "business-associate-agreement-present": "Each clinic signs a BAA with us.",
  "consumer-health-data": "It keeps consumer health data for members.",
  "substance-use-disorder-program": "It serves an opioid treatment program.",
  "multi-tenant-architecture": "The platform is multi-tenant.",
  "service-delivered-to-third-party-customers": "We sell a white-label edition.",
  "customer-security-assurance-demand": "Buyers send a security questionnaire before signing.",
  "nonbank-financial-activity": "The firm does debt collection.",
  "customer-financial-account-data": "Members give a routing number for refunds.",
  "ny-regulated-financial-entity": "The agency is supervised by NYDFS.",
  "legal-practice-matter-data": "It tracks IOLTA balances.",
  "consumer-personal-information-at-scale": "The site honors do not sell requests.",
  "eu-uk-personal-data": "The service follows GDPR.",
  "controlled-unclassified-information": "The team is preparing for CMMC.",
  "iso-27001-demand": "The company runs an ISMS.",
  "federally-regulated-depository-institution": "Our customer is regulated by the NCUA.",
};

// What the knowledge base says one signal points at: every framework and candidate with a trigger naming it.
const expectedFor = (kb, signal) => [
  ...kb.frameworks.filter((f) => f.triggers.some((t) => t.signal === signal)).map((f) => f.framework),
  ...kb.candidates.filter((c) => c.triggers.some((t) => t.signal === signal)).map((c) => c.id),
].sort();

test("every detector has a planted phrase, and the fixture knowledge base declares all 21", () => {
  assert.equal(SIGNAL_DETECTORS.length, 21);
  assert.deepEqual(Object.keys(PHRASES).sort(), SIGNAL_DETECTORS.map((d) => d.id).sort());
  assert.deepEqual(kbProblems(FIXTURE_KB), []);
});

for (const [name, kb, dir] of [["fixture", FIXTURE_KB, FIXTURE_DIR], ["shipped", SHIPPED_KB, SHIPPED_DIR]]) {
  test(`each planted signal proposes what the ${name} knowledge base names for it`, { skip: kb ? false : "frameworks/scope-kb.json is not in this tree yet" }, () => {
    const libraries = new Set(loadFrameworksFolder(dir).libraries.keys());
    for (const [signal, phrase] of Object.entries(PHRASES)) {
      const root = project({ "README.md": `# Example\n\n${phrase}\n` });
      const p = proposeScope(root, { kb, libraries });
      assert.deepEqual(p.signals.map((s) => s.id), [signal], `${signal}: the phrase raises that signal alone`);
      assert.deepEqual(p.signals[0].evidence.map((e) => [e.file, e.line]), [["README.md", 3]], `${signal}: file and line`);
      assert.deepEqual(p.frameworks.map((f) => f.id).sort(), expectedFor(kb, signal), `${signal}: proposed frameworks`);
      for (const f of p.frameworks) assert.ok(f.signals.every((s) => s.id === signal && s.file === "README.md" && s.line === 3), `${signal}: ${f.id} cites it`);
    }
  });
}

test("a negated phrase, and phrases in files the scanner does not read, propose nothing", () => {
  const root = project({
    "README.md": "This service handles no cardholder data.\nIt never stores PHI.\nWithout any GDPR scope.\n",
    "docs/notes.md": "The service stores cardholder data and PHI.\n",
    "src/app.js": "// FHIR resources for the merchant account\n",
    "apps/web/deep/package.json": "{\"description\": \"hosted fields\"}\n",
  });
  const p = proposeScope(root, { kb: FIXTURE_KB, libraries: new Set() });
  assert.deepEqual(p.signals, []);
  assert.deepEqual(p.frameworks, []);
  assert.deepEqual(p.subject.scanned, ["README.md"]);
  assert.equal(p.notPointedAt.length, FIXTURE_KB.frameworks.length, "every framework reads as not pointed at, never as not applying");
});

test("a contrastive clause ends the negation window, as in the original", () => {
  const root = project({ "README.md": "We never store the PAN, but our server posts the card number.\n" });
  const p = proposeScope(root, { kb: FIXTURE_KB, libraries: new Set() });
  assert.deepEqual(p.signals.map((s) => s.id), ["card-data-handled-directly"]);
  assert.deepEqual(p.signals[0].evidence.map((e) => e.match), ["card number"]);
});

test("a file over 512 KB is skipped and named; a symbolic link is named and never followed; workspace manifests are read", () => {
  const outside = project({ "README.md": "The app exchanges FHIR resources.\n" });
  const root = project({
    "README.md": `The app exchanges FHIR resources.\n${"x".repeat(512 * 1024)}\n`,
    "apps/shop/package.json": "{\"dependencies\": {\"braintree\": \"1.0.0\"}}\n",
  });
  symlinkSync(join(outside, "README.md"), join(root, "SECURITY.md"));
  const p = proposeScope(root, { kb: FIXTURE_KB, libraries: new Set() });
  assert.deepEqual(p.subject.scanned, ["apps/shop/package.json"]);
  assert.deepEqual(p.subject.skipped, [
    { file: "README.md", reason: "larger than 512 KB, so it was not read" },
    { file: "SECURITY.md", reason: "a symbolic link, which is never followed" },
  ]);
  assert.deepEqual(p.signals.map((s) => s.id), ["payment-card-acceptance"], "the linked file's FHIR phrase was not read");
  const text = cli(["compliance", "scope", "--dir", root]);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Not read: README\.md \(larger than 512 KB, so it was not read\)/);
});

test("--apply without a named person is refused with exit 2, and nothing is written", () => {
  const root = project({ "README.md": "The app exchanges FHIR resources.\n" });
  for (const args of [["--apply"], ["--apply", "--decided-by", "  "], ["--apply", "--decided-by="]]) {
    const r = cli(["compliance", "scope", "--dir", root, ...args]);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stderr}`);
    assert.match(r.stderr, /decided-by/);
    assert.equal(existsSync(join(root, ".skilliton")), false, `${args.join(" ")}: nothing written`);
  }
});

test("--apply with a person records the scope file in the readScope shape, additively, with a backup", () => {
  const root = project({ "README.md": "The app exchanges FHIR resources.\nIt serves an opioid treatment program.\n" });
  const libraries = new Set(["hipaa-security-rule", "hipaa-privacy-breach"]);
  const first = proposeScope(root, { kb: FIXTURE_KB, libraries });
  assert.deepEqual(first.frameworks.filter((f) => f.recordable).map((f) => f.id), ["hipaa-privacy-breach", "hipaa-security-rule"]);
  const plan = planScope(root, first, "Test Reviewer");
  writeScope(root, plan);
  const scope = readScope(root);
  assert.equal(scopeProblem(scope), null);
  assert.deepEqual(Object.keys(scope), ["schemaVersion", "decidedBy", "decidedAt", "frameworks", "intake"]);
  assert.equal(scope.decidedBy, "Test Reviewer");
  assert.ok(Date.parse(scope.decidedAt) <= Date.now());
  assert.deepEqual(scope.frameworks.map((f) => f.id), ["hipaa-privacy-breach", "hipaa-security-rule"]);
  assert.deepEqual(scope.frameworks[1].signals, [{ id: "ephi-handling", file: "README.md", line: 1 }]);
  writeFileSync(join(root, "README.md"), "Nothing regulated here.\n");
  const again = cli(["compliance", "scope", "--dir", root, "--apply", "--decided-by", "Second Reviewer"]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Kept from the earlier scope \(recording is additive\): hipaa-privacy-breach, hipaa-security-rule/);
  assert.match(again.stdout, /Backup of the previous file: /);
  assert.deepEqual(readScope(root).frameworks.map((f) => f.id), ["hipaa-privacy-breach", "hipaa-security-rule"]);
  assert.equal(readScope(root).decidedBy, "Second Reviewer");
});

test("a scope file dated in the future, or missing a field, is refused on read", () => {
  const root = project({});
  mkdirSync(join(root, ".skilliton/compliance"), { recursive: true });
  const future = { schemaVersion: 1, decidedBy: "A", decidedAt: new Date(Date.now() + 86400000).toISOString(), frameworks: [], intake: {} };
  writeFileSync(join(root, SCOPE_REL), JSON.stringify(future));
  assert.throws(() => readScope(root), /decidedAt is not a past ISO time/);
  writeFileSync(join(root, SCOPE_REL), JSON.stringify({ schemaVersion: 1, frameworks: [] }));
  assert.throws(() => readScope(root), /not a usable scope file/);
});

test("a knowledge base that drops a detector's signal, or names an undeclared one, is refused", () => {
  const kb = structuredClone(FIXTURE_KB);
  kb.signals = kb.signals.filter((s) => s.id !== "ephi-handling");
  assert.ok(kbProblems(kb).some((p) => p.includes("the detector ephi-handling is not declared")));
  assert.ok(kbProblems(kb).some((p) => p.includes("framework health-wellness: trigger 2")));
});

test("scope --json on a fixture prints the same JSON twice, and names no clock", () => {
  const root = project({ "README.md": "The app exchanges FHIR resources.\n", "apps/pay/package.json": "{\"dependencies\": {\"stripe\": \"1\"}}\n" });
  const one = cli(["compliance", "scope", "--json", "--dir", root]);
  const two = cli(["compliance", "scope", "--json", "--dir", root]);
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.stdout, two.stdout);
  const p = JSON.parse(one.stdout);
  assert.equal(p.schemaVersion, 1);
  assert.deepEqual(p.frameworks.map((f) => f.id), ["hipaa-privacy-breach", "hipaa-security-rule", "pci-dss-v4", "health-wellness", "part2-overlay"]);
  assert.equal(p.frameworks.find((f) => f.id === "pci-dss-v4").variantOpen.startsWith("Fixture note"), true);
  assert.ok(p.frameworks.every((f) => f.library === "not_shipped" && f.recordable === false), "the fixture folder ships no library");
  assert.equal(existsSync(join(root, ".skilliton")), false, "scope without --apply writes nothing");
  assert.ok(p.intakeQuestions.length === 3 && p.disclaimer.includes("legal determination"));
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "The app exchanges FHIR resources.\n");
});

test("the compliance config section: defaults, and bad values named without echoing them", () => {
  assert.deepEqual(DEFAULTS.compliance, { builtByCompany: false, sheetFile: "docs/COMPLIANCE-CONTROLS.md" });
  assert.deepEqual(configProblems({ compliance: { builtByCompany: true, sheetFile: "records/controls.md" } }), []);
  assert.deepEqual(configProblems({ compliance: { builtByCompany: "yes" } }), ["compliance.builtByCompany must be true or false"]);
  for (const bad of ["/etc/x.md", "../x.md", "docs/x.txt", 7]) {
    assert.deepEqual(configProblems({ compliance: { sheetFile: bad } }), ["compliance.sheetFile must be a repository-relative .md path"]);
  }
  assert.deepEqual(configProblems({ compliance: { other: 1 } }), ['compliance has the unknown key "other" (known: builtByCompany, sheetFile)']);
  assert.deepEqual(configProblems({ compliance: [] }), ['section "compliance" must be an object']);
});
