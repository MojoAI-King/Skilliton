#!/usr/bin/env node
// autopilot-demo.mjs: a two-minute walkthrough of the integrated Skilliton runtime on a disposable project.
//
//   node scripts/autopilot-demo.mjs [--keep]
//
// Everything happens in a temporary folder with throwaway keys; nothing in this repository or your configuration is
// touched, and no model or network is used. Each stage prints PASS or stops with FAIL and what it saw:
//   1. prepare: preview writes nothing; apply creates the project records, config, instructions and security
//      register; a repeat apply changes nothing
//   2. task and checkpoint: a request becomes a task record; progress is recorded; status reads it back
//   3. security evidence: a real passing test run is recorded as an observation; a code change makes it stale; the
//      finding lands in the backlog once, however often findings run
//   4. delivery gate: a shared repository accepts a passing change and rejects a change that passes alone but breaks
//      the tests once combined with work already on main
// The demo ends with the gate's rejection message and a stale observation; that is the point, not a failure.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEEP = process.argv.includes("--keep");
const scripts = dirname(fileURLToPath(import.meta.url));
const CLI = join(scripts, "skilliton.mjs");
const BIN = join(scripts, "..", "packs", "base", "plugins", "workflow", "bin", "skilliton");
const ws = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-demo-")));
const home = join(ws, "home");
mkdirSync(home);
const env = { PATH: process.env.PATH, LANG: process.env.LANG ?? "C.UTF-8", HOME: home, GIT_CONFIG_NOSYSTEM: "1", SKILLITON_BACKUPS: join(ws, "backups") };

function run(file, args, { cwd = ws, input, expect = 0 } = {}) {
  const r = spawnSync(file, args, { cwd, env, input, encoding: "utf8", timeout: 120000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (expect !== null && r.status !== expect) {
    console.log(`FAIL: ${[file.split("/").pop(), ...args].join(" ")} exited ${r.status}, expected ${expect}\n${out.slice(-1500)}`);
    console.log(`Kept for inspection: ${ws}`);
    process.exit(1);
  }
  return { code: r.status, out };
}
const sg = (args, opts = {}) => run(process.execPath, [CLI, ...args], opts);
const git = (cwd, args, opts = {}) => run("git", args, { cwd, ...opts });
const pass = (text) => console.log(`PASS: ${text}`);
function repo(dir, name) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  for (const [k, v] of [["user.name", name], ["user.email", `${name}@example.invalid`], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]]) git(dir, ["config", k, v]);
}
const commitAll = (dir, message, extra = []) => { git(dir, ["add", "-A"]); git(dir, ["commit", "-q", ...extra, "-m", message]); };
const snapshot = (dir) => readdirSync(dir, { recursive: true }).filter((p) => !p.startsWith(".git")).sort().map((p) => { try { return `${p}:${readFileSync(join(dir, p)).toString("base64")}`; } catch { return `${p}/`; } }).join("\n");

// ---------- 1. prepare ----------
const app = join(ws, "app");
repo(app, "builder");
writeFileSync(join(app, "package.json"), JSON.stringify({ name: "shop", type: "module", scripts: { test: "node --test" } }, null, 2) + "\n");
writeFileSync(join(app, "price.js"), "export const unitPrice = 3;\nexport const price = (qty) => qty * unitPrice;\n");
writeFileSync(join(app, "price.test.js"), "import test from 'node:test';\nimport assert from 'node:assert';\nimport { price } from './price.js';\ntest('price', () => assert.equal(price(2), 6));\n");
writeFileSync(join(app, "CLAUDE.md"), "# Shop\n\nNotes the team wrote before Skilliton.\n");
commitAll(app, "shop");
const before = snapshot(app);
sg(["prepare", "--dir", app]);
assert.equal(snapshot(app), before);
pass("prepare preview wrote nothing");
sg(["prepare", "--dir", app, "--apply"]);
sg(["prepare", "--dir", app, "--check"]);
const prepared = snapshot(app);
sg(["prepare", "--dir", app, "--apply"]);
assert.equal(snapshot(app), prepared);
assert.ok(readFileSync(join(app, "CLAUDE.md"), "utf8").startsWith("# Shop\n\nNotes the team wrote before Skilliton.\n"));
commitAll(app, "Prepare with Skilliton");
pass("prepare created the records, config, instructions and security register, kept the team's notes, and a repeat changed nothing");

// ---------- 2. task and checkpoint ----------
git(app, ["switch", "-q", "-c", "task/discount"]);
sg(["task", "start", "Add a discount for returning customers", "--criteria", "a returning customer pays one less per order", "--dir", app, "--apply"]);
writeFileSync(join(app, "discount.js"), "import { price } from './price.js';\nexport const discounted = (qty) => price(qty) - 1;\n");
writeFileSync(join(app, "discount.test.js"), "import test from 'node:test';\nimport assert from 'node:assert';\nimport { discounted } from './discount.js';\ntest('discount', () => assert.equal(discounted(2), 5));\n");
sg(["checkpoint", "--dir", app, "--state", "discount written with a test", "--evidence", "node --test: 2 passed", "--next", "push for review", "--apply"]);
const shown = sg(["task", "show", "--dir", app]);
assert.match(shown.out, /discount written with a test/);
commitAll(app, "Discount for returning customers");
pass("the request became a task record, the checkpoint was recorded, and task show reads it back");

// ---------- 3. security evidence ----------
mkdirSync(join(app, ".skilliton", "private-evidence"), { recursive: true });
const tests = run(process.execPath, ["--test"], { cwd: app });
writeFileSync(join(app, ".skilliton", "private-evidence", "tests.txt"), tests.out);
sg(["security", "record", "--dir", app, "--control", "SG-SECURITY-TESTS", "--assessment", "observed", "--source", "price.js", "--source", "discount.js", "--artifact", ".skilliton/private-evidence/tests.txt", "--note", "Unit tests for price and discount passed.", "--reviewer", "demo", "--apply"]);
const current = sg(["security", "status", "--dir", app], { expect: 1 });
assert.match(current.out, /SG-SECURITY-TESTS[^\n]*current/);
writeFileSync(join(app, "price.js"), "export const unitPrice = 4;\nexport const price = (qty) => qty * unitPrice;\n");
const stale = sg(["security", "status", "--dir", app], { expect: 1 });
assert.match(stale.out, /SG-SECURITY-TESTS[^\n]*stale/);
git(app, ["checkout", "--", "price.js"]);
git(app, ["switch", "-q", "main"]);
git(app, ["merge", "-q", "--no-edit", "task/discount"]);
writeFileSync(join(app, "price.js"), "export const unitPrice = 4;\nexport const price = (qty) => qty * unitPrice;\n");
sg(["security", "findings", "--dir", app, "--apply"]);
sg(["security", "findings", "--dir", app, "--apply"]);
const findings = readFileSync(join(app, "docs", "SECURITY_FINDINGS.md"), "utf8");
assert.equal((findings.match(/SEC-SG-SECURITY-TESTS/g) ?? []).length, 1);
assert.match(readFileSync(join(app, "docs", "BACKLOG.md"), "utf8"), /Security findings: \d+ open, listed in/);
git(app, ["checkout", "--", "price.js"]);
pass("a passing test run became an observation; changing the code it covers made it stale; the finding appears once in its own file, and the backlog links to it");

// ---------- 4. delivery gate ----------
const keys = join(ws, "keys");
mkdirSync(keys);
run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(keys, "approver")]);
const pub = readFileSync(join(keys, "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
writeFileSync(join(keys, "allowed_signers"), `approver@example.invalid namespaces="git" ${pub}\n`);
const shared = join(ws, "shared.git");
git(ws, ["init", "-q", "--bare", "-b", "main", shared]);
sg(["delivery", "install", "--bare", shared, "--approvers", join(keys, "allowed_signers"), "--runtime", BIN, "--apply"]);

const seed = join(ws, "seed");
repo(seed, "approver");
git(seed, ["config", "gpg.format", "ssh"]);
git(seed, ["config", "user.signingkey", join(keys, "approver")]);
for (const f of ["package.json", "price.js", "price.test.js"]) writeFileSync(join(seed, f), readFileSync(join(app, f)));
mkdirSync(join(seed, ".skilliton"));
writeFileSync(join(seed, ".skilliton", "delivery.json"), JSON.stringify({ schema: "skilliton.delivery/1", protectedBranches: ["main"], checks: [{ name: "tests", command: ["node", "--test"], timeoutSeconds: 120 }], policyPaths: [".skilliton/delivery.json", ".github/workflows/"] }, null, 2) + "\n");
commitAll(seed, "Shop with a delivery policy", ["-S"]);
git(seed, ["push", "-q", shared, "main"]);

const alex = join(ws, "alex"), sam = join(ws, "sam");
for (const [dir, name] of [[alex, "alex"], [sam, "sam"]]) {
  git(ws, ["clone", "-q", shared, dir]);
  for (const [k, v] of [["user.name", name], ["user.email", `${name}@example.invalid`], ["commit.gpgsign", "false"]]) git(dir, ["config", k, v]);
}
writeFileSync(join(alex, "price.js"), "export const unitPrice = 4;\nexport const price = (qty) => qty * unitPrice;\n");
writeFileSync(join(alex, "price.test.js"), "import test from 'node:test';\nimport assert from 'node:assert';\nimport { price } from './price.js';\ntest('price', () => assert.equal(price(2), 8));\n");
commitAll(alex, "Raise the unit price");
const accepted = git(alex, ["push", shared, "main"]);
assert.match(accepted.out, /accepted/);
pass("the shared repository ran the tests on alex's change and accepted it");

writeFileSync(join(sam, "discount.js"), "import { price } from './price.js';\nexport const discounted = (qty) => price(qty) - 1;\n");
writeFileSync(join(sam, "discount.test.js"), "import test from 'node:test';\nimport assert from 'node:assert';\nimport { discounted } from './discount.js';\ntest('discount', () => assert.equal(discounted(2), 5));\n");
commitAll(sam, "Discount");
run(process.execPath, ["--test"], { cwd: sam });
git(sam, ["pull", "-q", "--no-rebase", "--no-edit", shared, "main"]);
const rejected = git(sam, ["push", shared, "main"], { expect: 1 });
assert.match(rejected.out, /rejected refs\/heads\/main: check "tests" failed/);
pass("sam's change passed on its own, but the combined result failed the tests, and the shared repository rejected the push");
console.log("");
console.log(rejected.out.split("\n").filter((l) => /skilliton delivery|not ok|failing|rejected/.test(l)).slice(0, 8).join("\n"));
console.log("");
console.log("The demo ends with a stale security observation and a rejected push on purpose. Neither local guardrails nor evidence records decide what merges; the shared repository's checks do.");
if (KEEP) console.log(`Kept for inspection: ${ws}`);
else rmSync(ws, { recursive: true, force: true });
