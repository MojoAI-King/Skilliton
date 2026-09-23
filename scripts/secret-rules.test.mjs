#!/usr/bin/env node
// secret-rules.test.mjs: the secret shapes agree across every scanner that looks for them.
//
// runtime/lib/secret-rules.mjs holds the shapes; lib/core.mjs, lib/security-io.mjs, lib/audit.mjs and lib/preflight.mjs
// import it. The guardrails hook is a shell script and carries its own copy of the credential list, so this test reads
// that list out of guard-bash.sh and fails when a shape is in one and not the other. Then every credential shape is
// given a planted value and each of the five scanners must catch it. A difference that is there on purpose is in
// DIFFERENCES below with its reason, and is asserted, so it cannot drift into an accident.
//
// Planted values are built by concatenation at run time, so this file carries no text any scanner would flag.
//
//   node scripts/secret-rules.test.mjs     exit 0 when every check passes, 1 when one fails

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = join(REPO, "packs/base/plugins/workflow/runtime/lib");
const HOOK = join(REPO, "packs/base/plugins/guardrails/hooks/guard-bash.sh");
const load = (name) => import(pathToFileURL(join(RUNTIME, name)).href);
const { CREDENTIAL_SHAPES } = await load("secret-rules.mjs");
const { SECRET_RULES } = await load("core.mjs");
const { secretShaped } = await load("security-io.mjs");
const { AUDIT_RULES } = await load("audit.mjs");
const { redact } = await load("preflight.mjs");

// A bash array of single-quoted strings, by name, as guard-bash.sh writes it.
function readBashArray(text, name) {
  const start = text.indexOf(`\n${name}=(\n`);
  if (start < 0) return null;
  const out = [];
  for (const line of text.slice(start + name.length + 4).split("\n")) {
    if (line.trim() === ")") return out;
    const m = /^\s*'([^']*)'\s*$/.exec(line);
    if (!m) return null;
    out.push(m[1]);
  }
  return null;
}

// What is in one list and not the other, in plain words; empty when they agree, order included.
function compareLists(hook, module) {
  const problems = [];
  for (const x of module) if (!hook.includes(x)) problems.push(`in secret-rules.mjs, missing from guard-bash.sh: ${x}`);
  for (const x of hook) if (!module.includes(x)) problems.push(`in guard-bash.sh, missing from secret-rules.mjs: ${x}`);
  if (!problems.length && hook.join("\n") !== module.join("\n")) problems.push("the same shapes in a different order (a message names the first match, so the order is part of the list)");
  return problems;
}

const hookText = readFileSync(HOOK, "utf8");
const hookShapes = readBashArray(hookText, "SECRET_RES");
const hookLabels = readBashArray(hookText, "SECRET_LABELS");

// One planted value per credential shape. A shape added without one fails the test below.
const PLANTED = {
  "aws-access-key-id": "ASIA" + "Q7".repeat(8),
  "anthropic-api-key": "sk-ant-" + "a1".repeat(12),
  "openai-project-key": "sk-proj-" + "b2".repeat(12),
  "github-token": "gho_" + "c3".repeat(16),
  "github-fine-grained-token": "github_pat_" + "d4".repeat(16),
  "gitlab-token": "glpat-" + "e5".repeat(12),
  "slack-token": "xoxb-" + "f6".repeat(8),
  "stripe-live-secret-key": "sk_live_" + "g7".repeat(10),
  "npm-token": "npm_" + "h8".repeat(18),
  "digitalocean-token": "dop_v1_" + "a9".repeat(32),
  "shopify-token": "shpat_" + "b0".repeat(16),
  "supabase-token": "sbp_" + "c1".repeat(20),
  "google-api-key": "AIza" + "Sy".repeat(18),
  "private-key-block": "-----BEGIN " + "RSA PRIVATE KEY-----",
};

const grepMatches = (ere, text) => spawnSync("grep", ["-E", "-q", "-e", ere], { input: `${text}\n` }).status === 0;
const SCANNERS = {
  "the guardrails hook (grep -E over its own list)": (s) => grepMatches(`(${hookShapes.join("|")})`, `+${s}`),
  "import and propose (core.mjs)": (s) => SECRET_RULES.some(({ re }) => re.test(s)),
  "the evidence engine (security-io.mjs)": (s) => secretShaped(s),
  "the audit (audit.mjs)": (s) => AUDIT_RULES.some((r) => r.inProse && r.find(s)),
  "the redaction in preflight (preflight.mjs)": (s) => !redact(`the value ${s} here`).includes(s),
};

test("the hook's credential list is secret-rules.mjs's, shape for shape and label for label", () => {
  assert.ok(hookShapes, "SECRET_RES could not be read out of guard-bash.sh as a list of single-quoted strings");
  assert.ok(hookLabels, "SECRET_LABELS could not be read out of guard-bash.sh as a list of single-quoted strings");
  assert.deepEqual(compareLists(hookShapes, CREDENTIAL_SHAPES.map((s) => s.ere)), []);
  assert.deepEqual(compareLists(hookLabels, CREDENTIAL_SHAPES.map((s) => s.label)), []);
});

test("mutation check: a shape missing from either list, or one list reordered, is reported", () => {
  const module = CREDENTIAL_SHAPES.map((s) => s.ere);
  assert.match(compareLists(module.slice(1), module).join("\n"), /missing from guard-bash\.sh/);
  assert.match(compareLists([...module, "tok_[0-9]{40}"], module).join("\n"), /missing from secret-rules\.mjs: tok_/);
  assert.match(compareLists([...module].reverse(), module).join("\n"), /different order/);
  assert.equal(readBashArray("x\nSECRET_RES=(\n  unquoted\n)\n", "SECRET_RES"), null, "a line the reader cannot parse must fail, not be skipped");
});

test("every credential shape has a planted value, and every scanner catches it", () => {
  assert.deepEqual(Object.keys(PLANTED).sort(), CREDENTIAL_SHAPES.map((s) => s.rule).sort(), "one planted value per shape");
  for (const shape of CREDENTIAL_SHAPES) {
    const value = PLANTED[shape.rule];
    assert.ok(new RegExp(shape.ere).test(value), `${shape.rule}: the planted value does not match its own shape`);
    assert.ok(grepMatches(shape.ere, value), `${shape.rule}: grep -E does not read the shape the way JavaScript does`);
    for (const [name, catches] of Object.entries(SCANNERS)) assert.ok(catches(value), `${shape.rule}: ${name} does not catch it`);
  }
});

// The differences that are there on purpose. Each is asserted: the scanners named catch the value, the others do not.
const DIFFERENCES = [
  { what: "a signed token (JSON web token)", value: "eyJ" + "hbGciOi" + "." + "eyJzdWIi" + "." + "c2lnbmF0dXJl", notIn: ["the guardrails hook (grep -E over its own list)"],
    reason: "it is also the usual test fixture and the expired sample in a guide, and the hook blocks a commit with no way to allow one line; the audit and the evidence engine report it for a person" },
  { what: "a distinctive prefix with nothing after it", value: "sk-ant-", notIn: ["the guardrails hook (grep -E over its own list)", "the evidence engine (security-io.mjs)", "the audit (audit.mjs)", "the redaction in preflight (preflight.mjs)"],
    reason: "import and propose refuse a copy that carries even a key cut short; the others would flag every guide that names the prefix" },
  { what: "the evidence engine's generic shapes (a credential assignment)", value: "password" + "=hunter2", notIn: ["the guardrails hook (grep -E over its own list)", "import and propose (core.mjs)", "the audit (audit.mjs)", "the redaction in preflight (preflight.mjs)"],
    reason: "they match ordinary source constantly; the engine refuses such text in a record field, which a blocked commit or a refused copy would not tolerate" },
  { what: "the evidence engine's older, looser prefix rule (a prefix, case ignored, then twelve)", value: "asia" + "q7q7q7q7q7q7", notIn: ["the guardrails hook (grep -E over its own list)", "import and propose (core.mjs)", "the redaction in preflight (preflight.mjs)"],
    reason: "kept so the engine and the audit, which reads the engine's rules, never narrow; too loose for a commit block" },
  { what: "preflight's looser key id (twelve after the prefix)", value: "ABIA" + "Z9".repeat(6), notIn: ["the guardrails hook (grep -E over its own list)", "import and propose (core.mjs)", "the evidence engine (security-io.mjs)", "the audit (audit.mjs)"],
    reason: "taking out too much from a printed value costs a word, while the scanners that block or refuse work keep to a value long enough to be a key" },
  { what: "a home folder path", value: "/Users/" + "someone/notes", notIn: ["the guardrails hook (grep -E over its own list)", "the evidence engine (security-io.mjs)", "the audit (audit.mjs)", "the redaction in preflight (preflight.mjs)"],
    reason: "not a secret: import and propose refuse it because it names a person and a machine in a file meant for the company repository" },
];

test("each deliberate difference holds exactly as named, with its reason", () => {
  for (const d of DIFFERENCES) {
    assert.ok(d.reason.length > 20, `${d.what}: a difference needs its reason`);
    for (const [name, catches] of Object.entries(SCANNERS)) {
      const expected = !d.notIn.includes(name);
      assert.equal(catches(d.value), expected, `${d.what}: ${name} ${expected ? "should catch it" : "should not catch it (named as a difference)"}`);
    }
  }
});

test("nothing narrowed: every value a scanner caught before this module still reaches it", () => {
  // The forms each scanner had before the shapes moved here, one value each.
  const before = [
    ["import and propose (core.mjs)", ["AKIA" + "Q".repeat(16), "sk-ant-", "ghp_", "github_pat_", "xoxp-", "sk_live_", "-----BEGIN " + "PRIVATE KEY-----"]],
    ["the evidence engine (security-io.mjs)", ["ghs_" + "x".repeat(12), "sk-" + "y".repeat(12), "AKIA" + "a".repeat(12), "eyJ" + "a.b.c", "Bearer x", "z".repeat(48)]],
    ["the audit (audit.mjs)", ["ghs_" + "x".repeat(12), "-----begin " + "private key-----", "eyJ" + "a.b.c"]],
    ["the redaction in preflight (preflight.mjs)", ["npm_" + "k".repeat(12), "rk_test_" + "Xq9Zr2Lp7Wm4", "ACCA" + "Z".repeat(12), "AIza" + "m".repeat(20), "eyJ" + "a".repeat(6) + ".bbbbbb.cccccc"]],
    ["the guardrails hook (grep -E over its own list)", ["AKIA" + "Q".repeat(16), "sk-ant-" + "a".repeat(20), "ghp_" + "b".repeat(30), "github_pat_" + "c".repeat(30), "xoxa-" + "d".repeat(10), "sk_live_" + "e".repeat(16), "-----BEGIN " + "EC PRIVATE KEY-----"]],
  ];
  for (const [name, values] of before) for (const v of values) assert.ok(SCANNERS[name](v), `${name} no longer catches a form it caught before: ${v.slice(0, 12)}...`);
});
