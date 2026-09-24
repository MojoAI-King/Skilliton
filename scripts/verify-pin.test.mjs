#!/usr/bin/env node
// verify-pin.test.mjs: verify names a skills clone and an install that disagree (packs/base/plugins/workflow/runtime/
// lib/verify.mjs pinAgreement, reading the pin record through lib/pin.mjs pinnedVersion).
//
// A clone pinned to one release while the installed plugins match another verified cleanly with no word about it,
// so a person who had pinned back to an older release still ran the newer plugins. Now verify adds one line naming
// both releases and the two ways to bring them together, and its exit status is what it was without the line.
//
// No real client runs here. Each test builds a company skills repository with two signed releases (the second bumps
// one plugin's version) in a temporary folder, copies each plugin at the newest release into a stand-in Claude Code
// plugin cache, and writes the install record verify reads. Everything is removed afterwards.
//
//   node --test scripts/verify-pin.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "scripts", "skilliton.mjs");
const CATALOG = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
const MARKET = CATALOG.name;
const PLUGINS = CATALOG.plugins.map((p) => p.name);
const BUMPED = "code-quality";
const which = (name) => {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const SSH_KEYGEN = which("ssh-keygen");

function git(ctx, cwd, ...args) {
  const r = spawnSync("git", ["-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], { cwd, env: ctx.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function cli(ctx, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.base, env: ctx.env, encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function expectCode(r, code, what) {
  assert.equal(r.code, code, `${what}: expected exit ${code}, got ${r.code}\n${r.all}`);
  return r;
}

function release(ctx, version) {
  expectCode(cli(ctx, ["release", "create", "--version", version, "--repo", ctx.repo, "--apply"]), 0, `release create ${version}`);
  git(ctx, ctx.repo, "add", `releases/${version}.json`);
  git(ctx, ctx.repo, "commit", "-q", "-m", `release ${version} manifest`);
  expectCode(cli(ctx, ["release", "sign", version, "--repo", ctx.repo, "--apply"]), 0, `release sign ${version}`);
}

// Releases 1.0.0 and 2.0.0 (BUMPED goes up one patch version in 2.0.0), trusted, and every plugin installed at user
// scope from copies of 2.0.0's files.
function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-verify-pin-")));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const ctx = { base, repo: join(base, "skills"), claudeHome: join(base, "claude"), keys: join(base, "keys") };
  for (const d of [ctx.keys, join(base, "home")]) mkdirSync(d, { recursive: true });
  ctx.env = {
    PATH: process.env.PATH, HOME: join(base, "home"), LANG: "C.UTF-8", SKILLITON_SELF: "skilliton", TMPDIR: tmpdir(),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(base, "home", ".gitconfig"),
    SKILLITON_TRUST_DIR: join(base, "trust"), SKILLITON_BACKUPS: join(base, "backups"), SKILLITON_JOIN_DIR: join(base, "joined"),
    SKILLITON_DENYLIST: join(base, "denylist"), CLAUDE_CONFIG_DIR: ctx.claudeHome, CODEX_HOME: join(base, "codex"),
  };
  writeFileSync(ctx.env.SKILLITON_DENYLIST, "# test denylist\nqzxvexamplename\n");
  writeFileSync(ctx.env.GIT_CONFIG_GLOBAL, "");
  cpSync(join(ROOT, "packs", "base", "plugins"), join(ctx.repo, "packs", "base", "plugins"), { recursive: true });
  cpSync(join(ROOT, ".claude-plugin", "marketplace.json"), join(ctx.repo, ".claude-plugin", "marketplace.json"));
  cpSync(join(ROOT, "scripts", "scrub-check.sh"), join(ctx.repo, "scripts", "scrub-check.sh"));
  git(ctx, base, "init", "-q", "-b", "main", ctx.repo);
  for (const [k, v] of [["user.name", "verify-test"], ["user.email", "verify-test@example.invalid"], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]]) {
    git(ctx, ctx.repo, "config", k, v);
  }
  git(ctx, ctx.repo, "add", "-A");
  git(ctx, ctx.repo, "commit", "-q", "-m", "fixture");
  const key = join(ctx.keys, "maintainer");
  const k = spawnSync(SSH_KEYGEN, ["-q", "-t", "ed25519", "-N", "", "-f", key, "-C", "test"], { encoding: "utf8" });
  assert.equal(k.status, 0, `ssh-keygen failed: ${k.stderr}`);
  const signers = join(ctx.keys, "company.signers");
  writeFileSync(signers, `release-maintainer namespaces="git" ${readFileSync(`${key}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ")}\n`);
  expectCode(cli(ctx, ["trust", "add", "--company", "acme", "--signers", signers, "--apply"]), 0, "trust add");
  git(ctx, ctx.repo, "config", "gpg.format", "ssh");
  git(ctx, ctx.repo, "config", "user.signingkey", key);
  release(ctx, "1.0.0");
  const manifestPath = join(ctx.repo, "packs", "base", "plugins", BUMPED, ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  ctx.oldVersion = manifest.version;
  manifest.version = manifest.version.replace(/\d+$/, (n) => String(Number(n) + 1));
  ctx.newVersion = manifest.version;
  writeJson(manifestPath, manifest);
  git(ctx, ctx.repo, "commit", "-q", "-am", `${BUMPED} ${ctx.newVersion}`);
  release(ctx, "2.0.0");
  const plugins = {};
  for (const p of PLUGINS) {
    const version = JSON.parse(readFileSync(join(ctx.repo, "packs", "base", "plugins", p, ".claude-plugin", "plugin.json"), "utf8")).version;
    const installPath = join(ctx.claudeHome, "plugins", "cache", MARKET, p, version);
    cpSync(join(ctx.repo, "packs", "base", "plugins", p), installPath, { recursive: true });
    plugins[`${p}@${MARKET}`] = [{ scope: "user", installPath, version }];
  }
  writeJson(join(ctx.claudeHome, "plugins", "installed_plugins.json"), { version: 2, plugins });
  return ctx;
}

const verify = (ctx) => cli(ctx, ["verify", "--source", ctx.repo, "--company", "acme"]);
const LINE = /^the clone is pinned to 1\.0\.0, the installed plugins match 2\.0\.0: run skilliton pin --release 1\.0\.0 --apply to move the install, or pin --latest$/m;

test("verify names a clone pinned to one release while the installs match another, and keeps its exit status", { skip: !SSH_KEYGEN && "ssh-keygen is not on PATH" }, (t) => {
  const ctx = fixture(t);
  const unpinned = expectCode(verify(ctx), 0, "verify with the clone not pinned");
  assert.doesNotMatch(unpinned.out, /the clone is pinned to/, "a clone that was never pinned has nothing to disagree with");

  expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--apply"]), 0, "pin 1.0.0");
  const apart = expectCode(verify(ctx), 0, "verify with the clone pinned back");
  assert.match(apart.out, LINE);
  assert.equal(apart.out.match(/the clone is pinned to/g).length, 1, "one line, not one per plugin");
  const lines = apart.out.trimEnd().split("\n");
  assert.match(lines[lines.length - 2], LINE, "it sits just above the Summary line");
  assert.match(lines[lines.length - 1], /^Summary: all \d+ company plugin install\(s\) on this client are VERIFIED/);

  const json = JSON.parse(cli(ctx, ["verify", "--source", ctx.repo, "--company", "acme", "--json"]).out);
  assert.equal(json.details.pin.pinned, "1.0.0");
  assert.deepEqual(json.details.pin.match, ["2.0.0"]);

  expectCode(cli(ctx, ["pin", "--release", "2.0.0", "--repo", ctx.repo, "--apply"]), 0, "pin 2.0.0");
  const together = expectCode(verify(ctx), 0, "verify with the clone on the installed release");
  assert.doesNotMatch(together.out, /the clone is pinned to/);
});

test("the line does not change a failing exit either", { skip: !SSH_KEYGEN && "ssh-keygen is not on PATH" }, (t) => {
  const ctx = fixture(t);
  expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--apply"]), 0, "pin 1.0.0");
  // One plugin's install record goes, so verify reports NOT INSTALLED and exits 1, with or without the pin line.
  const record = join(ctx.claudeHome, "plugins", "installed_plugins.json");
  const installed = JSON.parse(readFileSync(record, "utf8"));
  const dropped = PLUGINS.find((p) => p !== BUMPED);
  delete installed.plugins[`${dropped}@${MARKET}`];
  writeJson(record, installed);
  const r = expectCode(verify(ctx), 1, "verify with a plugin missing");
  assert.match(r.out, LINE);
  assert.match(r.out, /NOT INSTALLED/);
  assert.ok(existsSync(join(ctx.repo, ".git", "skilliton-pin.json")));
});
