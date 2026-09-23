#!/usr/bin/env node
// delivery-protect.test.mjs: the delivery gate protects the program that runs its checks (N83,
// packs/base/plugins/workflow/runtime/lib/delivery-protect.mjs).
//
//   node scripts/delivery-protect.test.mjs
//
// Each test builds its own folder under the system temp directory, the way scripts/delivery.test.mjs does: HOME and the
// global git config pointed into it, ssh keys generated at runtime, a bare "shared" repository whose pre-receive hook
// is written by `skilliton delivery install --apply`, and a clone that pushes with a real `git push`. The application
// is tiny, and its check is `node scripts/checks.mjs`, which runs `node --test`. Nothing outside the temporary folders
// is written; they are removed at the end (SKILLITON_KEEP_TEMP=1 keeps them). Needs git, ssh-keygen and tar on PATH.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const POLICY_FILE = ".skilliton/delivery.json";

// ---------------------------------------------------------------- the tiny application

const greetTest = (expected) => [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "import { greet } from \"../lib/greet.mjs\";",
  "",
  `test("greet", () => { assert.equal(greet("world"), ${JSON.stringify(expected)}); });`,
  "",
].join("\n");
const CHECKS = [
  "import { spawnSync } from \"node:child_process\";",
  "const r = spawnSync(process.execPath, [\"--test\"], { stdio: \"inherit\" });",
  "process.exit(r.status ?? 1);",
  "",
].join("\n");
// The adversary's rewrite: record that it ran, then pass whatever the tests say.
const alwaysPasses = (marker) => `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\nprocess.exit(0);\n`;
const APP = {
  "lib/greet.mjs": "export const greet = (name) => \"Hello, \" + name;\n",
  "test/greet.test.mjs": greetTest("Hello, world"),
  "scripts/checks.mjs": CHECKS,
};
const GREET_BROKEN = "export const greet = (name) => \"Bye, \" + name;\n";
const POLICY = {
  schema: "skilliton.delivery/1",
  protectedBranches: ["main"],
  checks: [{ name: "checks", command: ["node", "scripts/checks.mjs"], timeoutSeconds: 120 }],
  policyPaths: [".skilliton/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"],
};

// ---------------------------------------------------------------- sandbox and process helpers

function sandbox(label) {
  const root = mkdtempSync(join(tmpdir(), `skilliton-protect-test-${label}-`));
  const home = join(root, "home");
  mkdirSync(join(home, ".config"), { recursive: true });
  writeFileSync(join(home, ".gitconfig"), "");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(GIT_|SKILLITON_|SSH_AUTH_SOCK$|SSH_AGENT_PID$)/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    SKILLITON_BACKUPS: join(root, "backups"),
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  });
  return { root, env, path: (...parts) => join(root, ...parts) };
}

async function withSandbox(label, fn) {
  const sb = sandbox(label);
  try { await fn(sb); } finally {
    if (process.env.SKILLITON_KEEP_TEMP === "1") console.log(`# kept ${sb.root}`);
    else rmSync(sb.root, { recursive: true, force: true });
  }
}

function run(sb, command, args, { cwd = sb.root } = {}) {
  const r = spawnSync(command, args, { cwd, env: sb.env, encoding: "utf8", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, all: `${r.stdout}${r.stderr}` };
}
function gitOk(sb, cwd, ...args) {
  const r = spawnSync("git", args, { cwd, env: sb.env, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed:\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
}

function makeKey(sb, name) {
  const file = sb.path("keys", name);
  mkdirSync(dirname(file), { recursive: true });
  const r = run(sb, "ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", `${name}@example.test`, "-f", file]);
  assert.equal(r.code, 0, `ssh-keygen failed:\n${r.all}`);
  return { name, privateKey: file, publicLine: readFileSync(`${file}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ") };
}

function clone(sb, bare, name) {
  const dir = sb.path(name);
  gitOk(sb, sb.root, "clone", "-q", bare, dir);
  gitOk(sb, dir, "config", "user.name", `Contributor ${name}`);
  gitOk(sb, dir, "config", "user.email", `${name}@example.test`);
  gitOk(sb, dir, "config", "gpg.format", "ssh");
  if (spawnSync("git", ["rev-parse", "--verify", "-q", "HEAD"], { cwd: dir, env: sb.env }).status !== 0) gitOk(sb, dir, "symbolic-ref", "HEAD", "refs/heads/main");
  return dir;
}

function commit(sb, dir, message, { sign } = {}) {
  gitOk(sb, dir, "add", "-A");
  if (sign) {
    gitOk(sb, dir, "config", "user.signingkey", sign.privateKey);
    gitOk(sb, dir, "commit", "-q", "-S", "-m", message);
  } else {
    gitOk(sb, dir, "commit", "-q", "--no-gpg-sign", "-m", message);
  }
  return gitOk(sb, dir, "rev-parse", "HEAD");
}

const push = (sb, dir) => run(sb, "git", ["push", "origin", "HEAD:main"], { cwd: dir });
const tip = (sb, bare) => gitOk(sb, sb.root, "--git-dir", bare, "rev-parse", "refs/heads/main");

// A shared bare repository with the gate installed, and main created by an approver-signed commit holding the
// application, its checks script and the policy.
function sharedRepo(sb, policy = POLICY, extra = {}) {
  const approver = makeKey(sb, "approver");
  const approvers = sb.path("approvers");
  writeFileSync(approvers, `approver@example.test ${approver.publicLine}\n`);
  const bare = sb.path("shared.git");
  gitOk(sb, sb.root, "init", "-q", "--bare", "-b", "main", bare);
  const installed = run(sb, process.execPath, [CLI, "delivery", "install", "--bare", bare, "--approvers", approvers, "--apply"]);
  assert.equal(installed.code, 0, installed.all);
  const admin = clone(sb, bare, "admin");
  writeFiles(admin, { ...APP, ...extra, [POLICY_FILE]: policy });
  const seed = commit(sb, admin, "Seed the application, its checks and its delivery policy", { sign: approver });
  const seeded = push(sb, admin);
  assert.equal(seeded.code, 0, `the seeding push failed:\n${seeded.all}`);
  return { bare, approver, seed, work: clone(sb, bare, "work") };
}

// ---------------------------------------------------------------- the adversary's push, and the approved one

test("a push that rewrites the checks script to exit 0 beside a failing test is rejected naming the file, before the check runs; the same change signed by an approver is accepted", async () => {
  await withSandbox("rewrite", async (sb) => {
    const s = sharedRepo(sb);
    const marker = sb.path("rewritten-check-ran");

    // Control: with the real checks script, the failing test alone is rejected by the check.
    writeFiles(s.work, { "lib/greet.mjs": GREET_BROKEN });
    commit(sb, s.work, "Break greet");
    const control = push(sb, s.work);
    assert.notEqual(control.code, 0, control.all);
    assert.match(control.all, /rejected refs\/heads\/main: check "checks" failed \(exit 1\)/);
    gitOk(sb, s.work, "reset", "-q", "--hard", "origin/main");

    // The adversary: the same failing test, and a checks script that always passes, unsigned.
    writeFiles(s.work, { "lib/greet.mjs": GREET_BROKEN, "scripts/checks.mjs": alwaysPasses(marker) });
    const forged = commit(sb, s.work, "Break greet and make the check pass");
    const rejected = push(sb, s.work);
    assert.notEqual(rejected.code, 0, rejected.all);
    assert.match(rejected.all, new RegExp(`rejected refs/heads/main: commit ${forged.slice(0, 12)} changes the protected path scripts/checks\\.mjs, which the delivery gate protects because a check runs it`));
    assert.match(rejected.all, /needs a commit signed by an approver/);
    assert.match(rejected.all, /the commit is not signed/);
    assert.doesNotMatch(rejected.all, /checking refs\/heads\/main at/, "nothing was extracted or run");
    assert.equal(existsSync(marker), false, "the rewritten check never executed");
    assert.equal(tip(sb, s.bare), s.seed);

    // The same change, signed by the approver: accepted, and the approved script is what runs.
    gitOk(sb, s.work, "config", "user.signingkey", s.approver.privateKey);
    gitOk(sb, s.work, "commit", "-q", "--amend", "--no-edit", "-S");
    const signed = gitOk(sb, s.work, "rev-parse", "HEAD");
    const accepted = push(sb, s.work);
    assert.equal(accepted.code, 0, accepted.all);
    assert.match(accepted.all, /accepted refs\/heads\/main: 1 check\(s\) passed \(checks\)/);
    assert.equal(existsSync(marker), true, "the approved check ran");
    assert.equal(tip(sb, s.bare), signed);
  });
});

test("a normal push is accepted; a merge that brings back an earlier checks script without an approver is rejected", async () => {
  await withSandbox("normal", async (sb) => {
    const s = sharedRepo(sb);
    writeFiles(s.work, { "lib/greet.mjs": "export const greet = (name) => \"Hi, \" + name;\n", "test/greet.test.mjs": greetTest("Hi, world") });
    const normal = commit(sb, s.work, "Greet with Hi");
    const accepted = push(sb, s.work);
    assert.equal(accepted.code, 0, accepted.all);
    assert.match(accepted.all, /accepted refs\/heads\/main: 1 check\(s\) passed \(checks\)/);
    assert.equal(tip(sb, s.bare), normal);

    // The approver changes the checks script (a comment line), signed.
    writeFiles(s.work, { "scripts/checks.mjs": `// the approved version\n${CHECKS}` });
    const approved = commit(sb, s.work, "Approved checks change", { sign: s.approver });
    assert.equal(push(sb, s.work).code, 0);
    assert.equal(tip(sb, s.bare), approved);

    // A side branch from before that change, merged with its own tree kept: no single commit changes the script
    // against its first parent, but the result brings the earlier version back.
    gitOk(sb, s.work, "checkout", "-q", "-b", "side", normal);
    writeFiles(s.work, { "notes.txt": "notes\n" });
    commit(sb, s.work, "Notes");
    gitOk(sb, s.work, "merge", "-q", "--no-gpg-sign", "-s", "ours", "-m", "Merge main, keeping ours", "main");
    const merged = push(sb, s.work);
    assert.notEqual(merged.code, 0, merged.all);
    assert.match(merged.all, /rejected refs\/heads\/main: the pushed result changes the protected path scripts\/checks\.mjs .*no approver-signed commit in this push gave it/);
    assert.equal(tip(sb, s.bare), approved);
  });
});

// ---------------------------------------------------------------- an explicit list, and a check whose script is absent

test("a policy with an explicit protectedPaths is honoured: a listed folder and an exact file are held, an unlisted checks script is not", async () => {
  await withSandbox("explicit", async (sb) => {
    const policy = { ...POLICY, protectedPaths: ["tools/", "config/exact.json"] };
    const s = sharedRepo(sb, policy, { "tools/helper.mjs": "export const x = 1;\n", "config/exact.json": "{}\n" });

    writeFiles(s.work, { "tools/helper.mjs": "export const x = 2;\n" });
    const folder = commit(sb, s.work, "Change a tool, unsigned");
    const inFolder = push(sb, s.work);
    assert.notEqual(inFolder.code, 0, inFolder.all);
    assert.match(inFolder.all, new RegExp(`commit ${folder.slice(0, 12)} changes the protected path tools/helper\\.mjs, which the delivery gate protects because the policy's protectedPaths lists it`));
    gitOk(sb, s.work, "reset", "-q", "--hard", "origin/main");

    writeFiles(s.work, { "config/exact.json": "{\"changed\": true}\n" });
    commit(sb, s.work, "Change the exact file, unsigned");
    const exact = push(sb, s.work);
    assert.notEqual(exact.code, 0, exact.all);
    assert.match(exact.all, /changes the protected path config\/exact\.json/);
    gitOk(sb, s.work, "reset", "-q", "--hard", "origin/main");

    // A file entry is matched exactly: a neighbour with a longer name is free.
    writeFiles(s.work, { "config/exact.json.bak": "{}\n" });
    commit(sb, s.work, "A neighbour file");
    const neighbour = push(sb, s.work);
    assert.equal(neighbour.code, 0, neighbour.all);

    // The explicit list replaces the default, so the checks script it does not name is not held by this rule.
    writeFiles(s.work, { "scripts/checks.mjs": `// edited\n${CHECKS}` });
    commit(sb, s.work, "Edit the checks script, unsigned");
    const unlisted = push(sb, s.work);
    assert.equal(unlisted.code, 0, unlisted.all);
    assert.match(unlisted.all, /accepted refs\/heads\/main: 1 check\(s\) passed \(checks\)/);
  });
});

test("the default does not crash when a check command names a script that is not in the tree", async () => {
  await withSandbox("absent", async (sb) => {
    const policy = { ...POLICY, checks: [...POLICY.checks, { name: "extra", command: ["node", "-e", "0", "scripts/not-in-the-tree.mjs", "--flag=also/not/here.json"], timeoutSeconds: 60 }] };
    const s = sharedRepo(sb, policy);
    writeFiles(s.work, { "notes.txt": "notes\n" });
    const normal = commit(sb, s.work, "Notes");
    const accepted = push(sb, s.work);
    assert.equal(accepted.code, 0, accepted.all);
    assert.match(accepted.all, /accepted refs\/heads\/main: 2 check\(s\) passed \(checks, extra\)/);
    assert.doesNotMatch(accepted.all, /could not finish|failed \(/);
    assert.equal(tip(sb, s.bare), normal);
  });
});
