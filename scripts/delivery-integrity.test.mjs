#!/usr/bin/env node
// delivery-integrity.test.mjs: the delivery gate cannot be switched off or rewritten by what a push carries.
//
//   node --test scripts/delivery-integrity.test.mjs
//
// scripts/delivery.test.mjs holds the gate's main behavior and is pinned at its size (scripts/lint.test.mjs), so these
// cases live here: a replace ref that would make the gate read a forged policy (N22), a check that rewrites the gate's
// own hook or approvers file (N23), and a commit whose signature git would hand to a verifier other than ssh-keygen
// (N24). Each test builds its own folder under the system temp directory with HOME and the global git config pointed
// into it, ssh keys generated at runtime, a bare repository whose pre-receive hook is written by `delivery install`, and
// clones that push with a real `git push`. The folders are removed at the end (SKILLITON_KEEP_TEMP=1 keeps them).
// Needs git, ssh-keygen and tar on PATH.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const POLICY_FILE = ".skilliton/delivery.json";

const greetTest = (expected) => [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "import { greet } from \"../lib/greet.mjs\";",
  "",
  `test("greet", () => { assert.equal(greet("world"), ${JSON.stringify(expected)}); });`,
  "",
].join("\n");
const APP = {
  "lib/greet.mjs": "export const greet = (name) => \"Hello, \" + name;\n",
  "test/greet.test.mjs": greetTest("Hello, world"),
};
const GREET_BROKEN = "export const greet = (name) => \"Bye, \" + name;\n";
const POLICY = {
  schema: "skilliton.delivery/1",
  protectedBranches: ["main"],
  checks: [{ name: "tests", command: ["node", "--test"], timeoutSeconds: 120 }],
  policyPaths: [".skilliton/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"],
};

// ---------------------------------------------------------------- sandbox and process helpers

async function withSandbox(label, fn) {
  const root = mkdtempSync(join(tmpdir(), `skilliton-delivery-integrity-${label}-`));
  const home = join(root, "home");
  mkdirSync(join(home, ".config"), { recursive: true });
  writeFileSync(join(home, ".gitconfig"), "");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(GIT_|SKILLITON_|SSH_AUTH_SOCK$|SSH_AGENT_PID$|GNUPGHOME$)/.test(key)) delete env[key];
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    GNUPGHOME: join(home, ".gnupg"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    SKILLITON_BACKUPS: join(root, "backups"),
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  });
  const sb = { root, home, env, path: (...parts) => join(root, ...parts) };
  try {
    await fn(sb);
  } finally {
    if (process.env.SKILLITON_KEEP_TEMP === "1") console.log(`# kept ${root}`);
    else rmSync(root, { recursive: true, force: true });
  }
}

function run(sb, command, args, { cwd = sb.root, input, env = {} } = {}) {
  const r = spawnSync(command, args, { cwd, input, env: { ...sb.env, ...env }, encoding: "utf8", timeout: 300000 });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const git = (sb, cwd, ...args) => run(sb, "git", args, { cwd });
function gitOk(sb, cwd, ...args) {
  const r = git(sb, cwd, ...args);
  assert.equal(r.code, 0, `git ${args.join(" ")} failed:\n${r.all}`);
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
  assert.equal(git(sb, sb.root, "clone", "-q", bare, dir).code, 0);
  gitOk(sb, dir, "config", "user.name", `Contributor ${name}`);
  gitOk(sb, dir, "config", "user.email", `${name}@example.test`);
  gitOk(sb, dir, "config", "gpg.format", "ssh");
  if (git(sb, dir, "rev-parse", "--verify", "-q", "HEAD").code !== 0) gitOk(sb, dir, "symbolic-ref", "HEAD", "refs/heads/main");
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

const push = (sb, dir, ...args) => git(sb, dir, "push", ...args);
const tip = (sb, bare, ref) => {
  const r = git(sb, sb.root, "--git-dir", bare, "rev-parse", "--verify", "-q", ref);
  return r.code === 0 ? r.stdout.trim() : null;
};

// A bare repository with the gate installed and main created by an approver-signed commit with the app and its policy.
function sharedRepo(sb) {
  const approver = makeKey(sb, "approver");
  const approvers = sb.path("approvers");
  writeFileSync(approvers, `${approver.name}@example.test ${approver.publicLine}\n`);
  const bare = sb.path("shared.git");
  gitOk(sb, sb.root, "init", "-q", "--bare", "-b", "main", bare);
  const installed = run(sb, process.execPath, [CLI, "delivery", "install", "--bare", bare, "--approvers", approvers, "--apply"]);
  assert.equal(installed.code, 0, installed.all);
  const admin = clone(sb, bare, "admin");
  writeFiles(admin, { ...APP, [POLICY_FILE]: POLICY });
  const seed = commit(sb, admin, "Seed the application and its delivery policy", { sign: approver });
  const pushed = push(sb, admin, "origin", "main");
  assert.equal(pushed.code, 0, `the seeding push failed:\n${pushed.all}`);
  return { bare, approver, approvers, seed };
}

// A commit whose tree is the current one with the policy protecting only a branch nobody pushes to. As a replacement
// for main's tip, it would make a gate that honors replacements read main as unprotected.
function forgedPolicyCommit(sb, dir) {
  gitOk(sb, dir, "checkout", "-q", "-b", "forged");
  writeFiles(dir, { [POLICY_FILE]: { ...POLICY, protectedBranches: ["nothing-here"] } });
  const forged = commit(sb, dir, "A policy that protects nothing");
  gitOk(sb, dir, "checkout", "-q", "main");
  gitOk(sb, dir, "branch", "-q", "-D", "forged");
  return forged;
}

test("prerequisites: git, ssh-keygen and tar are available", () => {
  for (const [tool, args] of [["git", ["--version"]], ["ssh-keygen", ["-?"]], ["tar", ["--version"]]]) {
    const r = spawnSync(tool, args, { encoding: "utf8" });
    assert.ok(!r.error, `${tool} is required by these tests and by the gate, and could not run: ${r.error?.message}`);
  }
});

// ---------------------------------------------------------------- N22: replace refs

test("N22: a push to refs/replace/ is rejected with its reason, so the forged-policy attack stops at its first push", async () => {
  await withSandbox("replace-push", async (sb) => {
    const s = sharedRepo(sb);
    const a = clone(sb, s.bare, "attacker");
    const forged = forgedPolicyCommit(sb, a);

    const first = push(sb, a, "origin", `${forged}:refs/replace/${s.seed}`);
    assert.notEqual(first.code, 0, `the replace ref must be refused:\n${first.all}`);
    assert.match(first.all, new RegExp(`skilliton delivery: rejected refs/replace/${s.seed}: `));
    assert.match(first.all, /replacement/);
    assert.doesNotMatch(first.all, /without checks/);
    assert.equal(tip(sb, s.bare, `refs/replace/${s.seed}`), null, "no replace ref may land in the shared repository");

    // The second half of the attack: an unsigned push that removes the policy. Without the replacement it is judged by
    // the real policy, and rejected.
    gitOk(sb, a, "rm", "-q", POLICY_FILE);
    commit(sb, a, "Remove the delivery policy");
    const second = push(sb, a, "origin", "main");
    assert.notEqual(second.code, 0, second.all);
    assert.match(second.all, /skilliton delivery: rejected refs\/heads\/main: /);
    assert.doesNotMatch(second.all, /accepted refs\/heads\/main/);
    assert.equal(tip(sb, s.bare, "refs/heads/main"), s.seed);
  });
});

test("N22: with a replace ref already in the shared repository, the gate reads the real tip and still runs the checks", async () => {
  await withSandbox("replace-present", async (sb) => {
    const s = sharedRepo(sb);
    const a = clone(sb, s.bare, "attacker");
    const forged = forgedPolicyCommit(sb, a);
    // The forged commit reaches the shared repository on a branch the policy does not protect, and the replace ref is
    // written there directly, the way an administrator's mistake or another route would leave it.
    const parked = push(sb, a, "origin", `${forged}:refs/heads/parked`);
    assert.equal(parked.code, 0, parked.all);
    gitOk(sb, sb.root, "--git-dir", s.bare, "update-ref", `refs/replace/${s.seed}`, forged);
    assert.match(gitOk(sb, sb.root, "--git-dir", s.bare, "show", `${s.seed}:${POLICY_FILE}`), /nothing-here/, "the fixture: plain git now reads the forged policy at main's tip");

    writeFiles(a, { "lib/greet.mjs": GREET_BROKEN });
    commit(sb, a, "Break the greeting, unsigned");
    const pushed = push(sb, a, "origin", "main");
    assert.notEqual(pushed.code, 0, pushed.all);
    assert.doesNotMatch(pushed.all, /accepted refs\/heads\/main without checks/);
    assert.match(pushed.all, /skilliton delivery: rejected refs\/heads\/main: check "tests" failed/);
    assert.equal(tip(sb, s.bare, "refs/heads/main"), s.seed);

    // Deleting the replace ref is an update to refs/replace/ as well: it is refused by name, and an administrator
    // removes it on the server. The gate does not need it gone, because it never reads through it.
    const removal = push(sb, a, "origin", `:refs/replace/${s.seed}`);
    assert.notEqual(removal.code, 0, removal.all);
    assert.match(removal.all, new RegExp(`skilliton delivery: rejected refs/replace/${s.seed}: `));
    assert.equal(tip(sb, s.bare, `refs/replace/${s.seed}`), forged);
  });
});

// ---------------------------------------------------------------- N23: a check that rewrites the gate

// A test file that, run by the gate's `node --test` check, appends a line to a file of the gate's own.
const tamperTest = (file, line) => [
  "import test from \"node:test\";",
  "import { appendFileSync } from \"node:fs\";",
  `test("looks like an ordinary test", () => { appendFileSync(${JSON.stringify(file)}, ${JSON.stringify(line)}); });`,
  "",
].join("\n");

test("N23: a check that appends to the pre-receive hook, or adds a key to the approvers file, gets the push rejected naming what changed", async () => {
  await withSandbox("rewrite", async (sb) => {
    const s = sharedRepo(sb);
    const hook = join(s.bare, "hooks", "pre-receive");
    const hookBefore = readFileSync(hook, "utf8");

    const a = clone(sb, s.bare, "a");
    writeFiles(a, { "test/extra.test.mjs": tamperTest(hook, "\n# written by a check the push carried\n") });
    commit(sb, a, "An ordinary-looking test, unsigned");
    const pushed = push(sb, a, "origin", "main");
    assert.notEqual(pushed.code, 0, pushed.all);
    assert.match(pushed.all, /skilliton delivery: rejected refs\/heads\/main: the checks changed the gate itself: the pre-receive hook [^;]*pre-receive\. /);
    assert.match(pushed.all, /the change is still in place/);
    assert.doesNotMatch(pushed.all, /accepted refs\/heads\/main/);
    assert.equal(tip(sb, s.bare, "refs/heads/main"), s.seed);
    assert.notEqual(readFileSync(hook, "utf8"), hookBefore, "the fixture: the check really did write to the hook");

    const outsider = makeKey(sb, "outsider");
    const b = clone(sb, s.bare, "b");
    writeFiles(b, { "test/extra.test.mjs": tamperTest(s.approvers, `outsider@example.test ${outsider.publicLine}\n`) });
    commit(sb, b, "Another ordinary-looking test, unsigned");
    const second = push(sb, b, "origin", "main");
    assert.notEqual(second.code, 0, second.all);
    assert.match(second.all, /rejected refs\/heads\/main: the checks changed the gate itself: the approvers file [^;]*approvers\. /);
    assert.doesNotMatch(second.all, /the pre-receive hook/, "only what changed during this push is named");
    assert.equal(tip(sb, s.bare, "refs/heads/main"), s.seed);
  });
});

// ---------------------------------------------------------------- N24: which verifier judges a signature

// A stand-in gpg that calls every signature good, the way a server keyring an attacker has reached would. git runs
// gpg.program (default "gpg", found on PATH) for a header that looks like an OpenPGP signature.
function acceptingGpg(sb) {
  const bin = sb.path("fake-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "gpg"), [
    "#!/bin/sh",
    "cat >/dev/null",
    "echo '[GNUPG:] NEWSIG'",
    "echo '[GNUPG:] GOODSIG 0123456789ABCDEF Stand-in <stand-in@example.test>'",
    "echo '[GNUPG:] VALIDSIG 0123456789ABCDEF0123456789ABCDEF01234567 2026-09-22 1789500000 0 4 0 1 10 00 0123456789ABCDEF0123456789ABCDEF01234567'",
    "echo '[GNUPG:] TRUST_ULTIMATE 0 pgp'",
    "exit 0",
    "",
  ].join("\n"));
  chmodSync(join(bin, "gpg"), 0o755);
  return [bin, sb.env.PATH].join(delimiter);
}

const header = (name, block) => `${name} ${block.split("\n").join("\n ")}`;

test("N24: a commit whose first signature header is SSH but whose other one is OpenPGP is not accepted as signed", async () => {
  await withSandbox("signature", async (sb) => {
    const s = sharedRepo(sb);
    const a = clone(sb, s.bare, "a");
    writeFiles(a, { CODEOWNERS: "* @someone\n" });
    commit(sb, a, "Change a policy path");
    const raw = gitOk(sb, a, "cat-file", "commit", "HEAD");
    const cut = raw.indexOf("\n\n");
    const ssh = header("gpgsig-sha256", "-----BEGIN SSH SIGNATURE-----\nU1NIU0lHAAAAAQ==\n-----END SSH SIGNATURE-----");
    const pgp = header("gpgsig", "-----BEGIN PGP SIGNATURE-----\n\nbm90IGEgcmVhbCBzaWduYXR1cmU=\n-----END PGP SIGNATURE-----");
    const forged = run(sb, "git", ["hash-object", "-t", "commit", "-w", "--stdin"], { cwd: a, input: `${raw.slice(0, cut)}\n${ssh}\n${pgp}${raw.slice(cut)}\n` });
    assert.equal(forged.code, 0, forged.all);
    const id = forged.stdout.trim();
    const PATH = acceptingGpg(sb);

    // The fixture: plain git, with the stand-in gpg on PATH, calls this commit good.
    assert.equal(run(sb, "git", ["verify-commit", id], { cwd: a, env: { PATH } }).code, 0, "the fixture needs git itself to accept the forged signature");

    const pushed = run(sb, "git", ["push", "origin", `${id}:refs/heads/main`], { cwd: a, env: { PATH } });
    assert.notEqual(pushed.code, 0, pushed.all);
    assert.match(pushed.all, /skilliton delivery: rejected refs\/heads\/main: commit [0-9a-f]{12} changes the policy path CODEOWNERS without an approver signature: the commit carries a non-SSH signature/);
    assert.equal(tip(sb, s.bare, "refs/heads/main"), s.seed);
  });
});
