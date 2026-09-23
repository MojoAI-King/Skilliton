#!/usr/bin/env node
// delivery.test.mjs: tests `skilliton delivery` (install, gate, check) the way git drives it.
//
//   node scripts/delivery.test.mjs
//
// Each test builds its own folder under the system temp directory, with HOME, the global git config and the backup
// root pointed into it, ssh keys generated at runtime, a bare "shared" repository whose pre-receive hook is written by
// `node scripts/skilliton.mjs delivery install ... --apply`, and contributor clones that push with a real `git push`.
// The application under test is tiny, and its check is `node --test`. Git identity and signing are configured only
// inside the temporary repositories. Nothing outside the temporary folders is written; they are removed at the end
// (set SKILLITON_KEEP_TEMP=1 to keep them for inspection). Needs git, ssh-keygen and tar on PATH.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  accessSync, chmodSync, constants as fsConstants, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  renameSync, rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const POLICY_FILE = ".skilliton/delivery.json";

// ---------------------------------------------------------------- the tiny application

const greetTest = (expected) => [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "import { greet } from \"../lib/greet.mjs\";",
  "",
  "test(\"greet\", () => {",
  `  assert.equal(greet("world"), ${JSON.stringify(expected)});`,
  "});",
  "",
].join("\n");

const APP = {
  "lib/greet.mjs": "export const greet = (name) => \"Hello, \" + name;\n",
  "test/greet.test.mjs": greetTest("Hello, world"),
};
const GREET_HI = "export const greet = (name) => \"Hi, \" + name;\n";
const GREET_BROKEN = "export const greet = (name) => \"Bye, \" + name;\n";
const WELCOME = "import { greet } from \"./greet.mjs\";\n\nexport const welcome = (name) => greet(name) + \"!\";\n";
const WELCOME_TEST = [
  "import test from \"node:test\";",
  "import assert from \"node:assert/strict\";",
  "import { welcome } from \"../lib/welcome.mjs\";",
  "",
  "test(\"welcome\", () => {",
  "  assert.equal(welcome(\"world\"), \"Hello, world!\");",
  "});",
  "",
].join("\n");
const POLICY = {
  schema: "skilliton.delivery/1",
  protectedBranches: ["main"],
  checks: [{ name: "tests", command: ["node", "--test"], timeoutSeconds: 120 }],
  policyPaths: [".skilliton/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"],
};

// ---------------------------------------------------------------- sandbox and process helpers

function sandbox(label) {
  const root = mkdtempSync(join(tmpdir(), `skilliton-delivery-test-${label}-`));
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
    // The check `node --test` must find the same node that runs these tests.
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  });
  return { root, home, env, path: (...parts) => join(root, ...parts) };
}

async function withSandbox(label, fn) {
  const sb = sandbox(label);
  try {
    await fn(sb);
  } finally {
    if (process.env.SKILLITON_KEEP_TEMP === "1") console.log(`# kept ${sb.root}`);
    else rmSync(sb.root, { recursive: true, force: true });
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
const cli = (sb, args, options) => run(sb, process.execPath, [CLI, ...args], options);

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

function writeApprovers(file, keys) {
  writeFileSync(file, keys.map((k) => `${k.name}@example.test ${k.publicLine}`).join("\n") + "\n");
  return file;
}

function initBare(sb, name) {
  const bare = sb.path(name);
  gitOk(sb, sb.root, "init", "-q", "--bare", "-b", "main", bare);
  return bare;
}

function clone(sb, bare, name) {
  const dir = sb.path(name);
  const r = git(sb, sb.root, "clone", "-q", bare, dir);
  assert.equal(r.code, 0, r.all);
  gitOk(sb, dir, "config", "user.name", `Contributor ${name}`);
  gitOk(sb, dir, "config", "user.email", `${name}@example.test`);
  gitOk(sb, dir, "config", "gpg.format", "ssh");
  // A clone of an empty repository may start on another branch name; the shared branch here is main.
  if (git(sb, dir, "rev-parse", "--verify", "-q", "HEAD").code !== 0) gitOk(sb, dir, "symbolic-ref", "HEAD", "refs/heads/main");
  return dir;
}

// Commit everything. With sign, the repository's signing key is set to that key and the commit is signed.
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

function amendSigned(sb, dir, key) {
  gitOk(sb, dir, "config", "user.signingkey", key.privateKey);
  gitOk(sb, dir, "commit", "-q", "--amend", "--no-edit", "-S");
  return gitOk(sb, dir, "rev-parse", "HEAD");
}

const push = (sb, dir, ...args) => git(sb, dir, "push", ...args);

function tip(sb, bare, branch) {
  const r = git(sb, sb.root, "--git-dir", bare, "rev-parse", "--verify", "-q", `refs/heads/${branch}`);
  return r.code === 0 ? r.stdout.trim() : null;
}

function install(sb, bare, approvers, extra = []) {
  return cli(sb, ["delivery", "install", "--bare", bare, "--approvers", approvers, ...extra]);
}

// A shared bare repository with the gate installed and main created by an approver-signed commit holding the app and
// the policy. That first push goes through the gate's branch-creation rule.
function sharedRepo(sb, { runtime } = {}) {
  const approver = makeKey(sb, "approver");
  const outsider = makeKey(sb, "outsider");
  const approvers = writeApprovers(sb.path("approvers"), [approver]);
  const bare = initBare(sb, "shared.git");
  const installed = install(sb, bare, approvers, runtime ? ["--runtime", runtime, "--apply"] : ["--apply"]);
  assert.equal(installed.code, 0, installed.all);
  const admin = clone(sb, bare, "admin");
  writeFiles(admin, { ...APP, [POLICY_FILE]: POLICY });
  const seed = commit(sb, admin, "Seed the application and its delivery policy", { sign: approver });
  const pushed = push(sb, admin, "origin", "main");
  assert.equal(pushed.code, 0, `the seeding push failed:\n${pushed.all}`);
  assert.match(pushed.all, /skilliton delivery: accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);
  assert.equal(tip(sb, bare, "main"), seed);
  return { bare, approver, outsider, approvers, seed };
}

// ---------------------------------------------------------------- prerequisites

test("prerequisites: git, ssh-keygen and tar are available", () => {
  const sb = sandbox("tools");
  try {
    for (const [tool, args] of [["git", ["--version"]], ["ssh-keygen", ["-?"]], ["tar", ["--version"]]]) {
      const r = spawnSync(tool, args, { env: sb.env, encoding: "utf8" });
      assert.ok(!r.error, `${tool} is required by these tests and by the gate, and could not run: ${r.error?.message}`);
    }
  } finally {
    rmSync(sb.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- acceptance: the combined result

test("a passing change is accepted; a combination that fails is rejected naming the check; non-fast-forward is rejected; an unprotected branch skips checks", async () => {
  await withSandbox("combined", async (sb) => {
    const s = sharedRepo(sb);
    const a = clone(sb, s.bare, "a");
    const b = clone(sb, s.bare, "b");

    // Contributor A changes the greeting and its own test.
    writeFiles(a, { "lib/greet.mjs": GREET_HI, "test/greet.test.mjs": greetTest("Hi, world") });
    const aHead = commit(sb, a, "Greet with Hi");
    const aPush = push(sb, a, "origin", "main");
    assert.equal(aPush.code, 0, aPush.all);
    assert.match(aPush.all, /skilliton delivery: checking refs\/heads\/main at [0-9a-f]{12} with the policy at the current tip [0-9a-f]{12}: 1 check\(s\)/);
    assert.match(aPush.all, /skilliton delivery: check "tests" passed in/);
    assert.match(aPush.all, /skilliton delivery: accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);
    assert.equal(tip(sb, s.bare, "main"), aHead);

    // Contributor B, still on the old base, adds a welcome built on the old greeting. On its own it passes.
    writeFiles(b, { "lib/welcome.mjs": WELCOME, "test/welcome.test.mjs": WELCOME_TEST });
    const bHead = commit(sb, b, "Add a welcome message");
    const alone = cli(sb, ["delivery", "check", "--repo", b]);
    assert.equal(alone.code, 0, alone.all);
    assert.match(alone.all, /skilliton delivery check: would be accepted: 1 check\(s\) passed \(tests\)/);

    // Forcing B over A is a non-fast-forward update, which the gate rejects before running anything.
    const forced = push(sb, b, "--force", "origin", "main");
    assert.notEqual(forced.code, 0, forced.all);
    assert.match(forced.all, /skilliton delivery: rejected refs\/heads\/main: non-fast-forward update/);
    assert.doesNotMatch(forced.all, /check "tests"/);
    assert.equal(tip(sb, s.bare, "main"), aHead);

    // After B merges A's work, the combination fails. `delivery check` predicts it and the push is rejected.
    gitOk(sb, b, "fetch", "-q", "origin");
    gitOk(sb, b, "merge", "-q", "--no-edit", "--no-gpg-sign", "origin/main");
    const predicted = cli(sb, ["delivery", "check", "--repo", b]);
    assert.equal(predicted.code, 1, predicted.all);
    assert.match(predicted.all, /skilliton delivery check: would be rejected: check "tests" failed \(exit 1\)/);
    const combined = push(sb, b, "origin", "main");
    assert.notEqual(combined.code, 0, combined.all);
    assert.match(combined.all, /skilliton delivery: rejected refs\/heads\/main: check "tests" failed \(exit 1\)/);
    // The last output lines show the failing assertion (spec reporter) or the failure summary (TAP reporter).
    assert.match(combined.all, /remote: +\| .*(Hi, world!|fail 1)/, "the rejection carries the last lines of the check's output");
    assert.match(combined.all, /pre-receive hook declined/);
    assert.equal(tip(sb, s.bare, "main"), aHead);

    // A branch the policy does not protect accepts the same failing combination without running checks.
    const feature = push(sb, b, "origin", "HEAD:refs/heads/feature/welcome");
    assert.equal(feature.code, 0, feature.all);
    assert.match(feature.all, /skilliton delivery: accepted refs\/heads\/feature\/welcome without checks: not a protected branch/);
    assert.doesNotMatch(feature.all, /check "tests"/);
    assert.equal(tip(sb, s.bare, "feature/welcome"), gitOk(sb, b, "rev-parse", "HEAD"));
    const unprotectedCheck = cli(sb, ["delivery", "check", "--repo", b, "--ref", "feature/other"]);
    assert.equal(unprotectedCheck.code, 0, unprotectedCheck.all);
    assert.match(unprotectedCheck.all, /feature\/other is not a protected branch/);
    assert.notEqual(bHead, aHead);
  });
});

// ---------------------------------------------------------------- acceptance: policy changes

test("policy changes: unsigned is rejected; the current policy still runs its check; a non-approver signature is rejected; an approver signature is accepted", async () => {
  await withSandbox("policy", async (sb) => {
    const s = sharedRepo(sb);
    const c = clone(sb, s.bare, "c");
    const noChecks = { ...POLICY, checks: [] };
    const reset = () => gitOk(sb, c, "reset", "-q", "--hard", "origin/main");

    // Unsigned: remove the check and break the code in the same push.
    writeFiles(c, { [POLICY_FILE]: noChecks, "lib/greet.mjs": GREET_BROKEN });
    const unsignedHead = commit(sb, c, "Drop the check and break greet");
    const unsigned = push(sb, c, "origin", "main");
    assert.notEqual(unsigned.code, 0, unsigned.all);
    assert.match(unsigned.all, new RegExp(`rejected refs/heads/main: commit ${unsignedHead.slice(0, 12)} changes the policy path \\.skilliton/delivery\\.json without an approver signature: the commit is not signed`));
    assert.equal(tip(sb, s.bare, "main"), s.seed);

    // A folder entry in policyPaths covers the files below it.
    reset();
    writeFiles(c, { ".github/workflows/ci.yml": "name: ci\n" });
    commit(sb, c, "Add a workflow, unsigned");
    const workflow = push(sb, c, "origin", "main");
    assert.notEqual(workflow.code, 0, workflow.all);
    assert.match(workflow.all, /changes the policy path \.github\/workflows\/ci\.yml without an approver signature/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);

    // Signed by an approver but with failing code: the policy at the current tip still runs its check.
    reset();
    writeFiles(c, { [POLICY_FILE]: noChecks, "lib/greet.mjs": GREET_BROKEN });
    commit(sb, c, "Drop the check and break greet, signed", { sign: s.approver });
    const signedFailing = push(sb, c, "origin", "main");
    assert.notEqual(signedFailing.code, 0, signedFailing.all);
    assert.match(signedFailing.all, /rejected refs\/heads\/main: check "tests" failed \(exit 1\)/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);

    // Signed by a key that is not in the approvers file: rejected.
    reset();
    writeFiles(c, { [POLICY_FILE]: noChecks });
    commit(sb, c, "Drop the check, signed by an outsider", { sign: s.outsider });
    const outsider = push(sb, c, "origin", "main");
    assert.notEqual(outsider.code, 0, outsider.all);
    assert.match(outsider.all, /without an approver signature: its signature is not from a key in the approvers file \(No principal matched/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);

    // Signed by an approver with passing code. `delivery check` cannot verify the signature without an approvers
    // file and says so; with the file it can. The push is accepted.
    reset();
    writeFiles(c, { [POLICY_FILE]: noChecks });
    const approved = commit(sb, c, "Drop the check, approved", { sign: s.approver });
    const unverifiable = cli(sb, ["delivery", "check", "--repo", c]);
    assert.equal(unverifiable.code, 1, unverifiable.all);
    assert.match(unverifiable.all, /approver signatures were NOT CHECKED here/);
    const verifiable = cli(sb, ["delivery", "check", "--repo", c, "--approvers", s.approvers]);
    assert.equal(verifiable.code, 0, verifiable.all);
    assert.match(verifiable.all, /would be accepted: 1 check\(s\) passed \(tests\)/);
    const accepted = push(sb, c, "origin", "main");
    assert.equal(accepted.code, 0, accepted.all);
    assert.match(accepted.all, /accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);
    assert.equal(tip(sb, s.bare, "main"), approved);

    // From now on the new policy on the tip governs: it lists no checks.
    writeFiles(c, { "lib/greet.mjs": GREET_BROKEN });
    const later = commit(sb, c, "Break greet under the new policy");
    const afterward = push(sb, c, "origin", "main");
    assert.equal(afterward.code, 0, afterward.all);
    assert.match(afterward.all, /accepted refs\/heads\/main: the policy lists no checks/);
    assert.equal(tip(sb, s.bare, "main"), later);

    // Even an approver cannot push a policy that would reject every later push.
    writeFiles(c, { [POLICY_FILE]: "{ not json\n" });
    commit(sb, c, "Corrupt the policy, signed", { sign: s.approver });
    const corrupt = push(sb, c, "origin", "main");
    assert.notEqual(corrupt.code, 0, corrupt.all);
    assert.match(corrupt.all, /the delivery policy in the pushed commit [0-9a-f]{12} is invalid \(not valid JSON/);
    assert.equal(tip(sb, s.bare, "main"), later);
  });
});

// ---------------------------------------------------------------- creating a branch; missing and invalid policies

test("removing what Skilliton keeps needs an approver-signed commit: an unsigned removal is rejected naming the path and the route; an ordinary file is free; a moved record is protected where it is; a signed removal is accepted", async () => {
  await withSandbox("persist", async (sb) => {
    const s = sharedRepo(sb);
    const d = clone(sb, s.bare, "d");
    const reset = () => gitOk(sb, d, "reset", "-q", "--hard", "origin/main");
    const accepted = (label) => { const r = push(sb, d, "origin", "main"); assert.equal(r.code, 0, `${label}:\n${r.all}`); return r; };

    // A prepared project arrives by an ordinary commit: adding is free.
    writeFiles(d, { ".skilliton/config.json": JSON.stringify({ prepare: { version: 3 } }), "docs/HANDOFF.md": "# Handoff\n", "docs/tasks/one.md": "# one\n", "CLAUDE.md": "# Rules\n", "notes/scratch.md": "x\n" });
    commit(sb, d, "Prepare the project");
    accepted("preparing");

    // An unsigned removal of a record is rejected, naming the commit, the path and the route.
    rmSync(join(d, "docs", "HANDOFF.md"));
    const unsignedHead = commit(sb, d, "Delete the handoff");
    const unsigned = push(sb, d, "origin", "main");
    assert.notEqual(unsigned.code, 0, unsigned.all);
    assert.match(unsigned.all, new RegExp(`rejected refs/heads/main: commit ${unsignedHead.slice(0, 12)} removes docs/HANDOFF\\.md, which Skilliton keeps in this project, without an approver signature: the commit is not signed\\. The one route that takes Skilliton out of a project is skilliton remove --apply, run by a person, in a commit an approver signs`));
    assert.notEqual(tip(sb, s.bare, "main"), unsignedHead);

    // The same for an entry, the configuration and an instruction file; and a push of several commits names the one that removes.
    for (const [path, label] of [["docs/tasks/one.md", "an entry"], [".skilliton/config.json", "the configuration"], ["CLAUDE.md", "the instruction file"]]) {
      reset();
      writeFiles(d, { "lib/extra.mjs": `export const extra = ${JSON.stringify(label)};\n` });
      commit(sb, d, `Add something for ${label}`);
      rmSync(join(d, ...path.split("/")));
      const head = commit(sb, d, `Delete ${label}`);
      const r = push(sb, d, "origin", "main");
      assert.notEqual(r.code, 0, `${label} should have been rejected:\n${r.all}`);
      assert.match(r.all, new RegExp(`commit ${head.slice(0, 12)} removes ${path.replace(/[./]/g, "\\$&")}, which Skilliton keeps in this project, without an approver signature`));
    }

    // An ordinary file is free to go, and so is an outsider's signature on it (the rule is about Skilliton's files only).
    reset();
    rmSync(join(d, "notes", "scratch.md"));
    commit(sb, d, "Delete a note");
    accepted("deleting an ordinary file");

    // A record the project moved is protected where it is, and the default place is then an ordinary file.
    writeFiles(d, { ".skilliton/config.json": JSON.stringify({ prepare: { version: 3, artifacts: { handoff: "notes/HANDOFF.md" } } }), "notes/HANDOFF.md": "# Handoff\n" });
    commit(sb, d, "Move the handoff");
    accepted("moving the handoff");
    rmSync(join(d, "notes", "HANDOFF.md"));
    const movedHead = commit(sb, d, "Delete the moved handoff");
    const moved = push(sb, d, "origin", "main");
    assert.notEqual(moved.code, 0, moved.all);
    assert.match(moved.all, new RegExp(`commit ${movedHead.slice(0, 12)} removes notes/HANDOFF\\.md, which Skilliton keeps`));
    reset();
    rmSync(join(d, "docs", "HANDOFF.md"));
    commit(sb, d, "Delete the old place of the handoff");
    accepted("deleting the default place once the record moved");

    // A removal signed by an approver is the sanctioned route, and is accepted; a merge that carries an unsigned removal is not.
    rmSync(join(d, "CLAUDE.md"));
    const signedHead = commit(sb, d, "Take Skilliton out of the instruction file", { sign: s.approver });
    accepted("a signed removal");
    assert.equal(tip(sb, s.bare, "main"), signedHead);
    gitOk(sb, d, "checkout", "-q", "-b", "side");
    rmSync(join(d, "docs", "tasks", "one.md"));
    const sideHead = commit(sb, d, "Delete an entry on a side branch");
    gitOk(sb, d, "checkout", "-q", "main");
    gitOk(sb, d, "config", "user.signingkey", s.approver.privateKey);
    gitOk(sb, d, "merge", "-q", "--no-ff", "-S", "-m", "Merge side", "side");
    const merged = push(sb, d, "origin", "main");
    assert.notEqual(merged.code, 0, merged.all);
    assert.match(merged.all, new RegExp(`commit ${sideHead.slice(0, 12)} removes docs/tasks/one\\.md, which Skilliton keeps in this project, without an approver signature`));
    assert.equal(tip(sb, s.bare, "main"), signedHead);
  });
});

test("a branch whose policy is still at the earlier .skillgate/delivery.json stays protected, and moving the policy needs an approver signature", async () => {
  await withSandbox("earlier-policy", async (sb) => {
    const approver = makeKey(sb, "approver");
    const approvers = writeApprovers(sb.path("approvers"), [approver]);
    const bare = initBare(sb, "shared.git");
    assert.equal(install(sb, bare, approvers, ["--apply"]).code, 0);
    const earlierFile = ".skillgate/delivery.json";
    const earlierPolicy = { ...POLICY, schema: "skillgate.delivery/1", policyPaths: [earlierFile] };
    const admin = clone(sb, bare, "admin");
    writeFiles(admin, { ...APP, [earlierFile]: earlierPolicy });
    const seed = commit(sb, admin, "Seed with the policy at the earlier path", { sign: approver });
    const seeded = push(sb, admin, "origin", "main");
    assert.equal(seeded.code, 0, seeded.all);
    assert.match(seeded.all, /accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);

    const c = clone(sb, bare, "c");
    const reset = () => gitOk(sb, c, "reset", "-q", "--hard", "origin/main");
    writeFiles(c, { "lib/greet.mjs": GREET_BROKEN });
    commit(sb, c, "Break greet");
    const broken = push(sb, c, "origin", "main");
    assert.notEqual(broken.code, 0, broken.all);
    assert.match(broken.all, /check "tests" failed/, "the earlier policy's check still runs");
    assert.equal(tip(sb, bare, "main"), seed);

    reset();
    writeFiles(c, { [POLICY_FILE]: { ...POLICY, checks: [] }, "lib/greet.mjs": GREET_BROKEN });
    const weaker = commit(sb, c, "Add a policy without checks under the current name, unsigned");
    const sideways = push(sb, c, "origin", "main");
    assert.notEqual(sideways.code, 0, sideways.all);
    assert.match(sideways.all, new RegExp(`commit ${weaker.slice(0, 12)} changes the policy path \\.skilliton/delivery\\.json without an approver signature`));
    assert.equal(tip(sb, bare, "main"), seed);

    reset();
    gitOk(sb, c, "rm", "-q", earlierFile);
    writeFiles(c, { [POLICY_FILE]: POLICY });
    commit(sb, c, "Move the delivery policy to the Skilliton name, unsigned");
    const unsigned = push(sb, c, "origin", "main");
    assert.notEqual(unsigned.code, 0, unsigned.all);
    assert.match(unsigned.all, /changes the policy path \.skil(lgate|liton)\/delivery\.json .*without an approver signature/);
    const migrated = amendSigned(sb, c, approver);
    const signed = push(sb, c, "origin", "main");
    assert.equal(signed.code, 0, signed.all);
    assert.equal(tip(sb, bare, "main"), migrated);

    writeFiles(c, { "lib/greet.mjs": GREET_BROKEN });
    commit(sb, c, "Break greet after the move");
    const after = push(sb, c, "origin", "main");
    assert.notEqual(after.code, 0, after.all);
    assert.match(after.all, /check "tests" failed/, "the moved policy governs the branch");
    assert.equal(tip(sb, bare, "main"), migrated);
  });
});

test("a merge cannot bring back an earlier policy without an approver: the combined result is checked, for the current and the earlier policy path", async () => {
  await withSandbox("merge-policy", async (sb) => {
    for (const earlierPath of [false, true]) {
      const approver = makeKey(sb, `approver-${earlierPath}`);
      const approvers = writeApprovers(sb.path(`approvers-${earlierPath}`), [approver]);
      const bare = initBare(sb, `shared-${earlierPath}.git`);
      assert.equal(install(sb, bare, approvers, ["--apply"]).code, 0);
      const firstFile = earlierPath ? ".skillgate/delivery.json" : POLICY_FILE;
      const firstPolicy = earlierPath ? { ...POLICY, schema: "skillgate.delivery/1", checks: [], policyPaths: [firstFile] } : { ...POLICY, checks: [] };
      const admin = clone(sb, bare, `admin-${earlierPath}`);
      writeFiles(admin, { ...APP, [firstFile]: firstPolicy });
      const weak = commit(sb, admin, "A policy without checks", { sign: approver });
      assert.equal(push(sb, admin, "origin", "main").code, 0);
      if (earlierPath) gitOk(sb, admin, "rm", "-q", firstFile);
      writeFiles(admin, { [POLICY_FILE]: POLICY });
      const strong = commit(sb, admin, "Add the tests check", { sign: approver });
      const strengthened = push(sb, admin, "origin", "main");
      assert.equal(strengthened.code, 0, strengthened.all);

      const c = clone(sb, bare, `attacker-${earlierPath}`);
      gitOk(sb, c, "checkout", "-q", "-b", "side", weak);
      writeFiles(c, { "lib/greet.mjs": GREET_HI, "test/greet.test.mjs": greetTest("Hi, world") });
      commit(sb, c, "A change on top of the weak policy");
      gitOk(sb, c, "merge", "-q", "--no-gpg-sign", "-s", "ours", "-m", "Merge main, keeping this side's files", strong);
      const merged = push(sb, c, "origin", "side:main");
      assert.notEqual(merged.code, 0, merged.all);
      assert.match(merged.all, /the pushed result changes the policy path \.skil(liton|lgate)\/delivery\.json to content that no approver-signed commit in this push gave it/, earlierPath ? "earlier path" : "current path");
      assert.equal(tip(sb, bare, "main"), strong, "the strong policy still governs main");
    }
  });
});

test("creating a protected branch needs a policy and an approver signature; a missing or invalid policy on the protected tip rejects pushes", async () => {
  await withSandbox("bootstrap", async (sb) => {
    const approver = makeKey(sb, "approver");
    const outsider = makeKey(sb, "outsider");
    const approvers = writeApprovers(sb.path("approvers"), [approver]);

    // An empty repository. Install previews first and writes nothing.
    const fresh = initBare(sb, "fresh.git");
    const preview = install(sb, fresh, approvers);
    assert.equal(preview.code, 0, preview.all);
    assert.match(preview.all, /preview: nothing written; add --apply to write/);
    assert.match(preview.all, /the default branch main does not exist yet/);
    assert.equal(existsSync(join(fresh, "hooks", "pre-receive")), false);
    assert.notEqual(git(sb, sb.root, "--git-dir", fresh, "config", "--get", "skilliton.approvers").code, 0);
    assert.equal(install(sb, fresh, approvers, ["--apply"]).code, 0);

    const x = clone(sb, fresh, "x");
    writeFiles(x, APP);
    commit(sb, x, "The app without a policy", { sign: approver });
    const noPolicy = push(sb, x, "origin", "main");
    assert.notEqual(noPolicy.code, 0, noPolicy.all);
    assert.match(noPolicy.all, /rejected refs\/heads\/main: creating the protected branch main needs a delivery policy \(\.skilliton\/delivery\.json\)/);
    assert.equal(tip(sb, fresh, "main"), null);

    writeFiles(x, { [POLICY_FILE]: POLICY });
    commit(sb, x, "Add the policy, unsigned");
    const unsigned = push(sb, x, "origin", "main");
    assert.notEqual(unsigned.code, 0, unsigned.all);
    assert.match(unsigned.all, /creating the protected branch main needs its tip commit [0-9a-f]{12} signed by an approver: the commit is not signed/);

    amendSigned(sb, x, outsider);
    const byOutsider = push(sb, x, "origin", "main");
    assert.notEqual(byOutsider.code, 0, byOutsider.all);
    assert.match(byOutsider.all, /signed by an approver: its signature is not from a key in the approvers file/);
    assert.equal(tip(sb, fresh, "main"), null);

    const created = amendSigned(sb, x, approver);
    const accepted = push(sb, x, "origin", "main");
    assert.equal(accepted.code, 0, accepted.all);
    assert.match(accepted.all, /checking refs\/heads\/main at [0-9a-f]{12} with the policy in the pushed commit [0-9a-f]{12}, signed by an approver: 1 check\(s\)/);
    assert.match(accepted.all, /accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);
    assert.equal(tip(sb, fresh, "main"), created);

    // A repository whose main existed before the gate, without a policy: every push to main is rejected.
    const legacy = initBare(sb, "legacy.git");
    const y = clone(sb, legacy, "y");
    writeFiles(y, APP);
    commit(sb, y, "Before the gate");
    assert.equal(push(sb, y, "origin", "main").code, 0);
    const legacyInstall = install(sb, legacy, approvers, ["--apply"]);
    assert.equal(legacyInstall.code, 0, legacyInstall.all);
    assert.match(legacyInstall.all, /attention: the default branch main has no \.skilliton\/delivery\.json/);
    writeFiles(y, { "notes.txt": "notes\n" });
    const legacyHead = commit(sb, y, "A change after the gate");
    const legacyPush = push(sb, y, "origin", "main");
    assert.notEqual(legacyPush.code, 0, legacyPush.all);
    assert.match(legacyPush.all, /skilliton delivery: rejected refs\/heads\/main: no delivery policy on the protected branch/);
    assert.notEqual(tip(sb, legacy, "main"), legacyHead);
    const legacyFeature = push(sb, y, "origin", "HEAD:refs/heads/topic");
    assert.equal(legacyFeature.code, 0, legacyFeature.all);
    assert.match(legacyFeature.all, /accepted refs\/heads\/topic without checks/);

    // main protects main and release; release holds an invalid policy: pushes to release are rejected with the reason.
    const split = initBare(sb, "split.git");
    const z = clone(sb, split, "z");
    writeFiles(z, { ...APP, [POLICY_FILE]: { ...POLICY, protectedBranches: ["main", "release"] } });
    commit(sb, z, "Policy protecting main and release");
    assert.equal(push(sb, z, "origin", "main").code, 0);
    writeFiles(z, { [POLICY_FILE]: { ...POLICY, protectedBranches: ["main", "release"], checks: "tests" } });
    commit(sb, z, "A broken policy on release");
    assert.equal(push(sb, z, "origin", "HEAD:refs/heads/release").code, 0);
    assert.equal(install(sb, split, approvers, ["--apply"]).code, 0);
    writeFiles(z, { "notes.txt": "release notes\n" });
    commit(sb, z, "Release notes");
    const releasePush = push(sb, z, "origin", "HEAD:refs/heads/release");
    assert.notEqual(releasePush.code, 0, releasePush.all);
    assert.match(releasePush.all, /rejected refs\/heads\/release: the delivery policy on the protected branch \(\.skilliton\/delivery\.json at [0-9a-f]{12}\) is invalid: "checks" must be an array/);

    // An invalid policy on the default branch: the protected branches cannot be determined, so every push is rejected.
    const garbled = initBare(sb, "garbled.git");
    const w = clone(sb, garbled, "w");
    writeFiles(w, { ...APP, [POLICY_FILE]: { ...POLICY, protectedBranches: "main" } });
    commit(sb, w, "An invalid policy before the gate");
    assert.equal(push(sb, w, "origin", "main").code, 0);
    const garbledInstall = install(sb, garbled, approvers, ["--apply"]);
    assert.equal(garbledInstall.code, 0, garbledInstall.all);
    assert.match(garbledInstall.all, /attention: the delivery policy on the default branch main is invalid/);
    writeFiles(w, { "notes.txt": "notes\n" });
    commit(sb, w, "Notes");
    for (const target of ["main", "HEAD:refs/heads/topic"]) {
      const r = push(sb, w, "origin", target);
      assert.notEqual(r.code, 0, r.all);
      assert.match(r.all, /the delivery policy on the default branch main is invalid \("protectedBranches" must be an array of branch names/);
    }
  });
});

// ---------------------------------------------------------------- install

test("install refuses a foreign hook, a non-bare folder, core.hooksPath, bad approvers or runtime; it replaces only its own hook, with a backup", async () => {
  await withSandbox("install", async (sb) => {
    const approver = makeKey(sb, "approver");
    const approvers = writeApprovers(sb.path("approvers"), [approver]);
    const bare = initBare(sb, "shared.git");
    const hook = join(bare, "hooks", "pre-receive");
    const configured = () => git(sb, sb.root, "--git-dir", bare, "config", "--get-regexp", "^skilliton\\.").stdout.trim();

    // A pre-receive hook someone else wrote is never overwritten.
    const foreign = "#!/bin/sh\necho custom checks\nexit 0\n";
    writeFileSync(hook, foreign);
    chmodSync(hook, 0o755);
    const refusedForeign = install(sb, bare, approvers, ["--apply"]);
    assert.equal(refusedForeign.code, 2, refusedForeign.all);
    assert.match(refusedForeign.all, /already exists and was not written by skilliton delivery install/);
    assert.equal(readFileSync(hook, "utf8"), foreign);
    assert.equal(configured(), "", "a refused install writes no git config");
    rmSync(hook);

    const workTree = sb.path("worktree");
    gitOk(sb, sb.root, "init", "-q", workTree);
    const notBare = install(sb, workTree, approvers, ["--apply"]);
    assert.equal(notBare.code, 2, notBare.all);
    assert.match(notBare.all, /is not a bare git repository/);

    gitOk(sb, sb.root, "--git-dir", bare, "config", "core.hooksPath", sb.path("elsewhere"));
    const hooksPath = install(sb, bare, approvers, ["--apply"]);
    assert.equal(hooksPath.code, 2, hooksPath.all);
    assert.match(hooksPath.all, /core\.hooksPath is set/);
    gitOk(sb, sb.root, "--git-dir", bare, "config", "--unset", "core.hooksPath");

    const badApprovers = [
      ["missing", null, /does not exist/],
      ["garbage", "this is not an allowed signers line\n", /line 1 is not "<principals> \[options\] <key type> <base64 public key>"/],
      ["private", readFileSync(approver.privateKey, "utf8"), /holds a private key/],
      ["empty", "# nobody yet\n", /lists no keys/],
    ];
    for (const [label, content, expected] of badApprovers) {
      const file = sb.path(`approvers-${label}`);
      if (content !== null) writeFileSync(file, content);
      const r = install(sb, bare, file, ["--apply"]);
      assert.equal(r.code, 2, `${label}: ${r.all}`);
      assert.match(r.all, expected, label);
    }

    const notExecutable = sb.path("runtime-not-executable");
    writeFileSync(notExecutable, "#!/bin/sh\nexit 0\n");
    chmodSync(notExecutable, 0o644);
    const badRuntime = install(sb, bare, approvers, ["--runtime", notExecutable, "--apply"]);
    assert.equal(badRuntime.code, 2, badRuntime.all);
    assert.match(badRuntime.all, /is not executable/);
    const missingRuntime = install(sb, bare, approvers, ["--runtime", sb.path("no-runtime"), "--apply"]);
    assert.equal(missingRuntime.code, 2, missingRuntime.all);
    assert.match(missingRuntime.all, /is not a file/);
    assert.equal(existsSync(hook), false);
    assert.equal(configured(), "");

    // A successful install writes an executable hook with the marker and records both paths.
    const ok = install(sb, bare, approvers, ["--apply"]);
    assert.equal(ok.code, 0, ok.all);
    assert.ok(statSync(hook).mode & 0o100, "the hook is executable");
    const written = readFileSync(hook, "utf8");
    assert.match(written, /^# skilliton:delivery-hook v1$/m);
    assert.match(configured(), /^skilliton\.approvers .*approvers$/m);
    assert.match(configured(), /^skilliton\.runtime .*bin\/skilliton$/m);
    accessSync(git(sb, sb.root, "--git-dir", bare, "config", "--get", "skilliton.runtime").stdout.trim(), fsConstants.X_OK);

    const again = install(sb, bare, approvers, ["--apply"]);
    assert.equal(again.code, 0, again.all);
    assert.match(again.all, /already current, unchanged/);
    assert.equal(existsSync(sb.path("backups")), false, "an unchanged hook is not backed up");

    // A hand-edited copy of its own hook is replaced, and the edited copy is kept as a backup.
    writeFileSync(hook, `${written}# a local edit\n`);
    const replaced = install(sb, bare, approvers, ["--apply"]);
    assert.equal(replaced.code, 0, replaced.all);
    assert.match(replaced.all, /backed up the previous hook to /);
    assert.equal(readFileSync(hook, "utf8"), written);
    const stamps = readdirSync(sb.path("backups", "delivery"));
    assert.equal(stamps.length, 1);
    assert.match(readFileSync(sb.path("backups", "delivery", stamps[0], "pre-receive"), "utf8"), /# a local edit/);

    // Invocation mistakes are refused.
    for (const args of [["delivery"], ["delivery", "deploy"], ["delivery", "gate", "--bare", bare, "--apply"], ["delivery", "check", "--bare", bare]]) {
      const r = cli(sb, args, { input: "" });
      assert.equal(r.code, 2, `${args.join(" ")}: ${r.all}`);
    }
  });
});

// ---------------------------------------------------------------- failing closed

function findExecutable(name, pathValue) {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    try { accessSync(join(dir, name), fsConstants.X_OK); return join(dir, name); } catch { /* keep looking */ }
  }
  return null;
}

test("the hook fails closed: a broken runtime path, no node, a missing or changed approvers file, and bad gate input all reject", async (t) => {
  await withSandbox("closed", async (sb) => {
    const s = sharedRepo(sb);
    const d = clone(sb, s.bare, "d");
    writeFiles(d, { "notes.txt": "notes\n" });
    commit(sb, d, "Add notes");

    // The runtime path in the repository's config no longer exists.
    gitOk(sb, sb.root, "--git-dir", s.bare, "config", "skilliton.runtime", sb.path("moved", "bin", "skilliton"));
    const broken = push(sb, d, "origin", "main");
    assert.notEqual(broken.code, 0, broken.all);
    assert.match(broken.all, /skilliton delivery: rejected: the delivery runtime .*moved\/bin\/skilliton is missing or not executable/);
    assert.match(broken.all, /pre-receive hook declined/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);

    gitOk(sb, sb.root, "--git-dir", s.bare, "config", "--unset", "skilliton.runtime");
    const unset = push(sb, d, "origin", "main");
    assert.notEqual(unset.code, 0, unset.all);
    assert.match(unset.all, /skilliton\.runtime is not set/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);
    assert.equal(install(sb, s.bare, s.approvers, ["--apply"]).code, 0);

    // node is not on PATH for the push. git stays reachable through a folder holding only a link to it.
    const realGit = findExecutable("git", sb.env.PATH);
    const onlyGit = sb.path("only-git");
    mkdirSync(onlyGit);
    symlinkSync(realGit, join(onlyGit, "git"));
    const restricted = [onlyGit, "/usr/bin", "/bin"].join(delimiter);
    if (findExecutable("node", restricted)) {
      t.diagnostic(`NOT RUN: node is reachable on the restricted PATH (${restricted}), so the missing-node case could not be arranged here`);
    } else {
      const nodeless = run(sb, join(onlyGit, "git"), ["push", "origin", "main"], { cwd: d, env: { PATH: restricted } });
      assert.notEqual(nodeless.code, 0, nodeless.all);
      assert.match(nodeless.all, /skilliton delivery: rejected: node was not found on PATH/);
      assert.equal(tip(sb, s.bare, "main"), s.seed);
    }

    // The approvers file is gone: every push is rejected, with the reason.
    renameSync(s.approvers, `${s.approvers}.moved`);
    const noApprovers = push(sb, d, "origin", "main");
    assert.notEqual(noApprovers.code, 0, noApprovers.all);
    assert.match(noApprovers.all, /rejected refs\/heads\/main: the approvers file .*approvers does not exist/);
    renameSync(`${s.approvers}.moved`, s.approvers);

    // The approvers file changed after install: the gate reads it at push time.
    writeFiles(d, { [POLICY_FILE]: { ...POLICY, checks: [{ name: "tests", command: ["node", "--test"], timeoutSeconds: 60 }] } });
    commit(sb, d, "Shorter timeout, signed", { sign: s.approver });
    writeApprovers(s.approvers, [s.outsider]);
    const replacedKeys = push(sb, d, "origin", "main");
    assert.notEqual(replacedKeys.code, 0, replacedKeys.all);
    assert.match(replacedKeys.all, /without an approver signature: its signature is not from a key in the approvers file/);
    writeApprovers(s.approvers, [s.approver]);
    const restored = push(sb, d, "origin", "main");
    assert.equal(restored.code, 0, restored.all);

    // Input that is not what git sends is rejected, never accepted.
    const cases = [
      ["garbage", "not a ref update\n", 1, /rejected this push: input line 1 is not "<old> <new> <ref>"/],
      ["empty", "", 1, /no ref updates arrived on standard input/],
      ["unknown commit", `${s.seed} ${"f".repeat(40)} refs/heads/main\n`, 3, /rejected refs\/heads\/main: the gate could not finish/],
      ["mixed id lengths", `${s.seed} ${"a".repeat(64)} refs/heads/main\n`, 1, /input line 1 is not/],
    ];
    for (const [label, input, code, expected] of cases) {
      const r = cli(sb, ["delivery", "gate", "--bare", s.bare], { input });
      assert.equal(r.code, code, `${label}: ${r.all}`);
      assert.match(r.all, expected, label);
    }
  });
});

// ---------------------------------------------------------------- checks that cannot start or never finish

function processGone(pid) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 30; i++) {
    try { process.kill(pid, 0); } catch (e) { if (e.code === "ESRCH") return true; throw e; }
    Atomics.wait(pause, 0, 0, 100);
  }
  return false;
}

test("a check that cannot start or that times out rejects the push, and a timed-out check's child processes are stopped", async () => {
  await withSandbox("timeouts", async (sb) => {
    const s = sharedRepo(sb);
    const t = clone(sb, s.bare, "t");
    const pidFile = sb.path("grandchild.pid");
    const policy = {
      ...POLICY,
      checks: [
        { name: "runs", command: ["./tools/run-check"], timeoutSeconds: 60 },
        { name: "finishes", command: ["node", "tools/finish.mjs"], timeoutSeconds: 2 },
      ],
    };
    const hangs = [
      "import { spawn } from \"node:child_process\";",
      "import { writeFileSync } from \"node:fs\";",
      "const child = spawn(process.execPath, [\"-e\", \"setInterval(() => {}, 1000)\"], { stdio: \"inherit\" });",
      `writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n");

    writeFiles(t, { [POLICY_FILE]: policy, "tools/run-check": "#!/bin/sh\nexit 0\n", "tools/finish.mjs": "console.log(\"finished\");\n" });
    chmodSync(join(t, "tools", "run-check"), 0o755);
    commit(sb, t, "Checks that run repository tools, approved", { sign: s.approver });
    const approved = push(sb, t, "origin", "main");
    assert.equal(approved.code, 0, approved.all);

    // The program a check names is missing from the pushed tree (removing it is a change to a protected path, so approved).
    rmSync(join(t, "tools", "run-check"));
    commit(sb, t, "Remove the check tool, approved", { sign: s.approver });
    const missing = push(sb, t, "origin", "main");
    assert.notEqual(missing.code, 0, missing.all);
    assert.match(missing.all, /rejected refs\/heads\/main: check "runs" failed \(could not start: \.\/tools\/run-check was not found\)/);
    gitOk(sb, t, "reset", "-q", "--hard", "origin/main");

    // A check that never finishes, with a child process holding its output open.
    writeFiles(t, { "tools/finish.mjs": hangs });
    commit(sb, t, "A check that never finishes, approved (the gate protects the files a check runs)", { sign: s.approver });
    const hung = push(sb, t, "origin", "main");
    assert.notEqual(hung.code, 0, hung.all);
    assert.match(hung.all, /skilliton delivery: check "runs" passed/);
    assert.match(hung.all, /rejected refs\/heads\/main: check "finishes" failed \(timed out after 2s\)/);
    const pid = Number(readFileSync(pidFile, "utf8"));
    assert.ok(pid > 0, "the hanging check started its child process");
    assert.ok(processGone(pid), `the timed-out check's child process ${pid} is still running`);

    gitOk(sb, t, "reset", "-q", "--hard", "origin/main");
    writeFiles(t, { "notes.txt": "notes\n" });
    commit(sb, t, "Notes");
    const fine = push(sb, t, "origin", "main");
    assert.equal(fine.code, 0, fine.all);
    assert.match(fine.all, /accepted refs\/heads\/main: 2 check\(s\) passed \(runs, finishes\)/);
  });
});

// ---------------------------------------------------------------- archive integrity

test("a .gitattributes export rule cannot hide files from the checks", async () => {
  await withSandbox("attributes", async (sb) => {
    const s = sharedRepo(sb);
    const e = clone(sb, s.bare, "e");
    writeFiles(e, { ".gitattributes": "test export-ignore\n", "lib/greet.mjs": GREET_BROKEN });
    commit(sb, e, "Hide the tests from git archive and break greet");

    // Control: git archive of this commit really leaves the tests out.
    const archive = spawnSync("git", ["-C", e, "archive", "--format=tar", "HEAD"], { env: sb.env, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(archive.status, 0);
    assert.ok(archive.stdout.includes(Buffer.from("lib/greet.mjs")), "control: the archive holds the library");
    assert.ok(!archive.stdout.includes(Buffer.from("test/greet.test.mjs")), "control: the archive leaves the test out");

    const hidden = push(sb, e, "origin", "main");
    assert.notEqual(hidden.code, 0, hidden.all);
    assert.match(hidden.all, /rejected refs\/heads\/main: the archive of [0-9a-f]{12} does not match the commit \(test\/greet\.test\.mjs is missing\)/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);
  });
});

// ---------------------------------------------------------------- the GitHub template, simulated locally

// The Node script inside templates/github/skilliton-delivery.yml, with the block's indentation removed, as bash's
// quoted heredoc hands it to node. Running it here is a local simulation, not a hosted rehearsal.
// ---------------------------------------------------------------- acceptance: the audit

// Written in pieces so this file does not itself carry the shape it plants: the repository audits its own changed
// files, and a test fixture that trips it would teach everyone to ignore the finding.
const plant = (...parts) => parts.join("");
const SHELL_TRUE = plant("shell", ": true");
const FLAW = (path) => `${APP["lib/greet.mjs"]}\n// ${path} builds a command for the shell.\nconst options = { ${SHELL_TRUE} };\n`;
const MARKED = `${FLAW("lib/greet.mjs").trimEnd()} // skilliton-audit: allow ${plant("shell-", "true")} nothing here is ever run; the fixture proves the marker reaches the gate\n`;

test("the audit rejects a push carrying a planted flaw, accepts the same line once it carries a marker, and is off when the policy says so", async () => {
  await withSandbox("audit", async (sb) => {
    const s = sharedRepo(sb);
    const c = clone(sb, s.bare, "c");

    // A flaw in a file this push changed rejects it, named by file, line, rule and control. The checks never run:
    // there is no reason to spend ten minutes on a test suite before saying something that was known immediately.
    writeFiles(c, { "lib/greet.mjs": FLAW("lib/greet.mjs") });
    commit(sb, c, "Build a command for the shell");
    const flawed = push(sb, c, "origin", "main");
    assert.notEqual(flawed.code, 0, flawed.all);
    assert.match(flawed.all, /skilliton delivery: rejected refs\/heads\/main: the audit found 1 finding\(s\) in the 1 file\(s\) this push changed/);
    assert.match(flawed.all, /lib\/greet\.mjs:4: shell-true \(SG-COMMAND-INJECTION\)/);
    assert.doesNotMatch(flawed.all, /check "tests"/, "the audit runs before the checks");
    assert.match(flawed.all, /pre-receive hook declined/);
    assert.equal(tip(sb, s.bare, "main"), s.seed);

    // The same line with a marker and a reason is accepted, and the gate says which line it allowed and why. The
    // marker is added as a second commit, so this also shows the audit reading the result of the push rather than
    // each commit in it: the flawed commit is still in the history being pushed.
    writeFiles(c, { "lib/greet.mjs": MARKED });
    const marked = commit(sb, c, "Say why the option is there");
    const allowed = push(sb, c, "origin", "main");
    assert.equal(allowed.code, 0, allowed.all);
    assert.match(allowed.all, /skilliton delivery: audit: allowed lib\/greet\.mjs:4 shell-true: nothing here is ever run/);
    assert.match(allowed.all, /skilliton delivery: audit: nothing found in the 1 file\(s\) this push changed/);
    assert.match(allowed.all, /skilliton delivery: accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);
    assert.equal(tip(sb, s.bare, "main"), marked);

    // Turning the audit off is a policy change like any other: it needs an approver's signature, and it governs the
    // pushes that come after it, because the policy that decides an update is the one at the tip being pushed onto.
    writeFiles(c, { [POLICY_FILE]: { ...POLICY, audit: { enabled: false } } });
    commit(sb, c, "Turn the audit off in the delivery policy", { sign: s.approver });
    const off = push(sb, c, "origin", "main");
    assert.equal(off.code, 0, off.all);
    assert.match(off.all, /skilliton delivery: audit: nothing found in the 1 file\(s\) this push changed/);

    writeFiles(c, { "lib/spawner.mjs": FLAW("lib/spawner.mjs") });
    const past = commit(sb, c, "Add a second flaw, with the audit off");
    const unaudited = push(sb, c, "origin", "main");
    assert.equal(unaudited.code, 0, unaudited.all);
    assert.doesNotMatch(unaudited.all, /delivery: audit/, "with the audit off the gate says nothing about it and reads no file");
    assert.match(unaudited.all, /skilliton delivery: accepted refs\/heads\/main: 1 check\(s\) passed \(tests\)/);
    assert.equal(tip(sb, s.bare, "main"), past);
  });
});

function templateScript() {
  const lines = readFileSync(join(here, "..", "templates", "github", "skilliton-delivery.yml"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.trim() === "node --input-type=module - <<'SKILLITON_DELIVERY'");
  const end = lines.findIndex((l, i) => i > start && l.trim() === "SKILLITON_DELIVERY");
  assert.ok(start >= 0 && end > start, "the template holds its script between the heredoc markers");
  const indent = lines[start].match(/^ */)[0].length;
  return lines.slice(start + 1, end).map((l) => l.slice(Math.min(indent, l.match(/^ */)[0].length))).join("\n");
}

test("the GitHub template's script, run locally on simulated merge results (not a hosted rehearsal)", async () => {
  await withSandbox("hosted", async (sb) => {
    const script = templateScript();
    const repo = sb.path("app");
    gitOk(sb, sb.root, "init", "-q", "-b", "main", repo);
    gitOk(sb, repo, "config", "user.name", "Contributor h");
    gitOk(sb, repo, "config", "user.email", "h@example.test");
    writeFiles(repo, { ...APP, [POLICY_FILE]: POLICY });
    const base = commit(sb, repo, "Base with policy");

    // A pull request branch merged the way GitHub builds refs/pull/<n>/merge: base first, pull request head second.
    const simulate = (label, files) => {
      gitOk(sb, repo, "checkout", "-q", "-b", label, base);
      writeFiles(repo, files);
      const prHead = commit(sb, repo, `Pull request ${label}`);
      gitOk(sb, repo, "checkout", "-q", "--detach", base);
      gitOk(sb, repo, "merge", "-q", "--no-ff", "--no-edit", "--no-gpg-sign", label);
      const env = { EVENT_NAME: "pull_request", PR_BASE_REF: "main", PR_HEAD_SHA: prHead };
      return { prHead, result: run(sb, process.execPath, ["--input-type=module", "-"], { cwd: repo, input: script, env }) };
    };

    const passing = simulate("passing", { "lib/greet.mjs": GREET_HI, "test/greet.test.mjs": greetTest("Hi, world") }).result;
    assert.equal(passing.code, 0, passing.all);
    assert.match(passing.all, /skilliton delivery: accepted: 1 check\(s\) passed \(tests\)/);

    const failing = simulate("failing", { "lib/greet.mjs": GREET_BROKEN }).result;
    assert.equal(failing.code, 1, failing.all);
    assert.match(failing.all, /skilliton delivery: rejected: check "tests" failed \(exit 1\)/);

    const policyChange = simulate("policy", { [POLICY_FILE]: { ...POLICY, checks: [] } }).result;
    assert.equal(policyChange.code, 1, policyChange.all);
    assert.match(policyChange.all, /touches policy paths \(\.skilliton\/delivery\.json\)\. This workflow cannot prove who approved a policy change/);
    assert.doesNotMatch(policyChange.all, /check "tests"/);

    // A checkout that is not the merge result (the pull request head alone) is refused.
    const { prHead } = simulate("head-only", { "notes.txt": "notes\n" });
    gitOk(sb, repo, "checkout", "-q", "--detach", prHead);
    const notMerge = run(sb, process.execPath, ["--input-type=module", "-"], { cwd: repo, input: script, env: { EVENT_NAME: "pull_request", PR_BASE_REF: "main", PR_HEAD_SHA: prHead } });
    assert.equal(notMerge.code, 1, notMerge.all);
    assert.match(notMerge.all, /is not GitHub's merge result for this pull request/);

    // A merge queue group: the base comes from the event, and the checks run on the group's commit.
    simulate("queued", { "notes.txt": "queued\n" });
    const queued = run(sb, process.execPath, ["--input-type=module", "-"], { cwd: repo, input: script, env: { EVENT_NAME: "merge_group", MERGE_GROUP_BASE_SHA: base, MERGE_GROUP_BASE_REF: "refs/heads/main" } });
    assert.equal(queued.code, 0, queued.all);
    assert.match(queued.all, /accepted: 1 check\(s\) passed \(tests\)/);
  });
});

// ---------------------------------------------------------------- mutation checks

// Copies the workflow plugin, replaces one statement in the copy's delivery engine, and returns its launcher.
function mutantRuntime(sb, label, target, replacement, file = "delivery.mjs") {
  const copy = sb.path(`mutant-${label}`, "workflow");
  cpSync(PLUGIN, copy, { recursive: true });
  const lib = join(copy, "runtime", "lib", file);
  const source = readFileSync(lib, "utf8");
  assert.equal(source.split(target).length - 1, 1, `mutation "${label}": the target statement must appear exactly once in ${file}`);
  writeFileSync(lib, source.replace(target, replacement));
  return join(copy, "bin", "skilliton");
}

test("mutation checks: the assertions above fail when the gate ignores a failing check or a missing approver signature", async () => {
  await withSandbox("mutation", async (sb) => {
    const s = sharedRepo(sb);
    const m = clone(sb, s.bare, "m");

    // Mutation 1: a failing check no longer rejects. The same failing push the real gate rejects is accepted.
    const ignoresChecks = mutantRuntime(sb, "checks", "if (!outcome.ok) return reject(", "if (false) return reject(");
    assert.equal(install(sb, s.bare, s.approvers, ["--runtime", ignoresChecks, "--apply"]).code, 0);
    writeFiles(m, { "lib/greet.mjs": GREET_BROKEN });
    const broken = commit(sb, m, "Break greet");
    const underMutant = push(sb, m, "origin", "main");
    assert.equal(underMutant.code, 0, `mutation 1 did not take effect, so this check proves nothing:\n${underMutant.all}`);
    assert.equal(tip(sb, s.bare, "main"), broken);
    assert.equal(install(sb, s.bare, s.approvers, ["--apply"]).code, 0);
    writeFiles(m, { "notes.txt": "notes\n" });
    commit(sb, m, "Notes on a broken tip");
    const underReal = push(sb, m, "origin", "main");
    assert.notEqual(underReal.code, 0, underReal.all);
    assert.match(underReal.all, /rejected refs\/heads\/main: check "tests" failed \(exit 1\)/);
    writeFiles(m, { "lib/greet.mjs": APP["lib/greet.mjs"] });
    commit(sb, m, "Fix greet");
    assert.equal(push(sb, m, "origin", "main").code, 0);

    // Mutation 2: an unverified signature on a policy change no longer rejects.
    const ignoresSignatures = mutantRuntime(sb, "signatures", "if (sig.state === \"unverified\") return unsigned(", "if (false) return unsigned(", "delivery-protect.mjs");
    assert.equal(install(sb, s.bare, s.approvers, ["--runtime", ignoresSignatures, "--apply"]).code, 0);
    writeFiles(m, { [POLICY_FILE]: { ...POLICY, checks: [] } });
    const weakened = commit(sb, m, "Drop the check without approval");
    const unsignedUnderMutant = push(sb, m, "origin", "main");
    assert.equal(unsignedUnderMutant.code, 0, `mutation 2 did not take effect, so this check proves nothing:\n${unsignedUnderMutant.all}`);
    assert.equal(tip(sb, s.bare, "main"), weakened);
    assert.equal(install(sb, s.bare, s.approvers, ["--apply"]).code, 0);
    writeFiles(m, { [POLICY_FILE]: POLICY });
    commit(sb, m, "Restore the check without approval");
    const unsignedUnderReal = push(sb, m, "origin", "main");
    assert.notEqual(unsignedUnderReal.code, 0, unsignedUnderReal.all);
    assert.match(unsignedUnderReal.all, /without an approver signature: the commit is not signed/);
  });
});

test("confirm: the preview writes nothing, --apply moves the draft, and no draft, an existing policy or an invalid draft are refused", async () => {
  await withSandbox("confirm", async (sb) => {
    const dir = sb.path("app");
    mkdirSync(dir);
    gitOk(sb, dir, "init", "-q", "-b", "main");
    const draft = { ...POLICY, checks: [{ name: "tests", command: ["node", "--test"], timeoutSeconds: 600 }] };
    const draftFile = ".skilliton/delivery.draft.json";

    const none = cli(sb, ["delivery", "confirm", "--dir", dir]);
    assert.equal(none.code, 2, none.all);
    assert.match(none.all, /no draft to confirm: \.skilliton\/delivery\.draft\.json does not exist \(prepare writes it when a test command is detected\)\..*Nothing was written/);

    writeFiles(dir, { [draftFile]: draft });
    const preview = cli(sb, ["delivery", "confirm", "--dir", dir]);
    assert.equal(preview.code, 0, preview.all);
    assert.match(preview.stdout, /delivery confirm \(preview\)/);
    assert.match(preview.stdout, /protected branches: main/);
    assert.match(preview.stdout, /check "tests": node --test \(timeout 600s\)/);
    assert.match(preview.stdout, /Summary: nothing written; add --apply to move the draft to \.skilliton\/delivery\.json\./);
    assert.equal(existsSync(join(dir, draftFile)), true);
    assert.equal(existsSync(join(dir, POLICY_FILE)), false);

    const applied = cli(sb, ["delivery", "confirm", "--dir", dir, "--apply"]);
    assert.equal(applied.code, 0, applied.all);
    assert.match(applied.stdout, /Summary: confirmed: \.skilliton\/delivery\.draft\.json moved to \.skilliton\/delivery\.json\. Commit it to the default branch/);
    assert.equal(existsSync(join(dir, draftFile)), false);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, POLICY_FILE), "utf8")), draft);

    writeFiles(dir, { [draftFile]: draft });
    const exists = cli(sb, ["delivery", "confirm", "--dir", dir, "--apply"]);
    assert.equal(exists.code, 2, exists.all);
    assert.match(exists.all, /\.skilliton\/delivery\.json already exists, so there is nothing to confirm; remove \.skilliton\/delivery\.draft\.json by hand if it is stale\. Nothing was written/);
    assert.equal(existsSync(join(dir, draftFile)), true, "the stale draft is left alone");

    rmSync(join(dir, POLICY_FILE));
    writeFiles(dir, { [draftFile]: { ...draft, checks: [] , policyPaths: ["nope/"] } });
    const invalid = cli(sb, ["delivery", "confirm", "--dir", dir, "--apply"]);
    assert.equal(invalid.code, 2, invalid.all);
    assert.match(invalid.all, /\.skilliton\/delivery\.draft\.json is not a valid delivery policy, so it cannot be confirmed: .*policyPaths.*Nothing was written/);
    assert.equal(existsSync(join(dir, POLICY_FILE)), false);

    const plain = cli(sb, ["delivery", "confirm", "extra", "--dir", dir]);
    assert.equal(plain.code, 2, plain.all);
    assert.match(plain.all, /delivery confirm takes no plain arguments/);
    const wrongOption = cli(sb, ["delivery", "confirm", "--bare", dir]);
    assert.equal(wrongOption.code, 2, wrongOption.all);
    assert.match(wrongOption.all, /--bare does not apply to delivery confirm/);
  });
});
