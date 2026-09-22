#!/usr/bin/env node
// release-refusals.test.mjs: two signed-tag shapes that lib/release.mjs refuses, each tested on its own (N26).
//
//   node --test scripts/release-refusals.test.mjs
//
// A tag signed by a trusted key is still not an approval when the manifest it approves names another version
// (validateManifest's release check), or when the tag object calls itself by a name other than the ref it sits under
// (inspectTag's name check). scripts/release.test.mjs is pinned at its size (scripts/lint.test.mjs), so these live
// here. Each test works in its own temporary folder with HOME, the trust folder, the backups, the denylist and both
// clients' folders pointed into it, git's global and system configuration off and no SSH agent; the signing key is
// generated there at runtime. Needs git 2.34 or later and ssh-keygen.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, "scripts", "skilliton.mjs");

function boxed(name, fn) {
  test(name, (t) => {
    const root = mkdtempSync(join(tmpdir(), "skilliton-release-refusals-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const home = join(root, "home");
    mkdirSync(home, { recursive: true });
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(GIT_|SKILLITON_)/.test(key)) delete env[key];
    for (const key of ["SSH_AUTH_SOCK", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "GNUPGHOME", "XDG_CONFIG_HOME"]) delete env[key];
    Object.assign(env, {
      HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
      GNUPGHOME: join(home, ".gnupg"), SKILLITON_TRUST_DIR: join(root, "trust"), SKILLITON_BACKUPS: join(root, "backups"),
      SKILLITON_DENYLIST: join(root, "denylist"), CLAUDE_CONFIG_DIR: join(root, "claude"), CODEX_HOME: join(root, "codex"),
    });
    writeFileSync(env.SKILLITON_DENYLIST, "# test denylist\nqzxvexamplename\n");
    fn({ root, env });
  });
}

function cli(box, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: box.root, env: box.env, encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
function expectCode(r, code, what) {
  assert.equal(r.code, code, `${what}: expected exit ${code}, got ${r.code}\n${r.all}`);
  return r;
}
function git(box, cwd, args) {
  const r = spawnSync("git", args, { cwd, env: box.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr}`);
  return r.stdout.trim();
}

// A company skills repository (this checkout's plugins, catalog and scrub check) with release 1.0.0 created, committed
// and signed by a maintainer the trust file lists.
function signedRelease(box) {
  const repo = join(box.root, "skills");
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  cpSync(join(REPO, "packs", "base", "plugins"), join(repo, "packs", "base", "plugins"), { recursive: true, filter: (from) => !from.endsWith(".DS_Store") });
  copyFileSync(join(REPO, ".claude-plugin", "marketplace.json"), join(repo, ".claude-plugin", "marketplace.json"));
  mkdirSync(join(repo, "scripts"), { recursive: true });
  copyFileSync(join(REPO, "scripts", "scrub-check.sh"), join(repo, "scripts", "scrub-check.sh"));
  chmodSync(join(repo, "scripts", "scrub-check.sh"), 0o755);
  git(box, box.root, ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.name", "release-test"], ["user.email", "release-test@example.invalid"], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]]) git(box, repo, ["config", k, v]);
  git(box, repo, ["add", "-A"]);
  git(box, repo, ["commit", "-q", "-m", "fixture"]);

  const key = join(box.root, "keys", "maintainer");
  mkdirSync(dirname(key), { recursive: true });
  assert.equal(spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key, "-C", "test"], { env: box.env }).status, 0, "ssh-keygen failed");
  const signers = join(box.root, "keys", "company.signers");
  writeFileSync(signers, `release-maintainer namespaces="git" ${readFileSync(`${key}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ")}\n`);
  expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signers, "--apply"]), 0, "trust add");
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "release create");
  git(box, repo, ["add", "releases/1.0.0.json"]);
  git(box, repo, ["commit", "-q", "-m", "release 1.0.0 manifest"]);
  git(box, repo, ["config", "gpg.format", "ssh"]);
  git(box, repo, ["config", "user.signingkey", key]);
  expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo, "--apply"]), 0, "release sign");
  const approved = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 0, "the fixture's release list");
  assert.match(approved.out, /^approved +1\.0\.0 /m, "the fixture: release 1.0.0 is approved before anything is changed");
  return { repo, key };
}

// Neither release list nor verify may treat the version as approved, and both name the reason.
function refused(box, repo, version, reason) {
  const list = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 2, `release list with ${version} refused`);
  assert.doesNotMatch(list.out, new RegExp(`^approved +${version.replace(/\./g, "\\.")}`, "m"), `${version} must never be listed as approved`);
  assert.match(list.out, new RegExp(`^unapproved +${version.replace(/\./g, "\\.")} `, "m"));
  assert.match(list.all, reason);
  const v = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--json"]), 2, `verify with ${version} refused`);
  const report = JSON.parse(v.out);
  assert.equal(report.result, "invalid");
  assert.match(JSON.stringify(report), reason);
}

boxed("N26: a trusted signed tag approving a manifest that names another version is refused", (box) => {
  const { repo, key } = signedRelease(box);
  // releases/1.0.1.json holds the 1.0.0 manifest unchanged, so it says "release": "1.0.0".
  copyFileSync(join(repo, "releases", "1.0.0.json"), join(repo, "releases", "1.0.1.json"));
  git(box, repo, ["add", "releases/1.0.1.json"]);
  git(box, repo, ["commit", "-q", "-m", "a 1.0.1 manifest that names 1.0.0"]);
  const reason = /release says 1\.0\.0, but the file and tag are for 1\.0\.1/;

  const sign = expectCode(cli(box, ["release", "sign", "1.0.1", "--repo", repo, "--apply"]), 2, "release sign refuses it");
  assert.match(sign.all, reason);

  // Signed by hand with the trusted key, over the exact bytes, the tag verifies and still approves nothing.
  const hash = createHash("sha256").update(readFileSync(join(repo, "releases", "1.0.1.json"))).digest("hex");
  git(box, repo, ["-c", `user.signingkey=${key}`, "tag", "-s", "skilliton-release/1.0.1", "-m", "skilliton release 1.0.1", "-m", `manifest-sha256: ${hash}`]);
  refused(box, repo, "1.0.1", reason);
});

boxed("N26: a trusted signed tag under a ref whose name differs from the tag's own header is refused", (box) => {
  const { repo } = signedRelease(box);
  const oid = git(box, repo, ["rev-parse", "refs/tags/skilliton-release/1.0.0"]);
  git(box, repo, ["update-ref", "refs/tags/skilliton-release/2.0.0", oid]);
  git(box, repo, ["update-ref", "-d", "refs/tags/skilliton-release/1.0.0"]);
  assert.match(git(box, repo, ["cat-file", "tag", oid]), /^tag skilliton-release\/1\.0\.0$/m, "the fixture: the object still calls itself 1.0.0");
  refused(box, repo, "2.0.0", /calls itself \\?"skilliton-release\/1\.0\.0\\?", not \\?"skilliton-release\/2\.0\.0\\?"/);
});
