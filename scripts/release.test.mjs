#!/usr/bin/env node
// release.test.mjs: skillgate release, verify, trust and propose (docs/CONTRACTS.md section 13, releases/SCHEMA.md).
//
//   node scripts/release.test.mjs
//
// Every test works in its own temporary folder under the system temp folder and deletes it afterwards. Each command
// runs with HOME, XDG_CONFIG_HOME, SKILLGATE_TRUST_DIR, SKILLGATE_BACKUPS, SKILLGATE_DENYLIST, CLAUDE_CONFIG_DIR and
// CODEX_HOME pointed into that folder, git's global and system configuration switched off, and no SSH agent, so no
// real key, trust file, git setting or plugin record is read or written. Signing keys are generated there at runtime
// and never leave it. Git identity and signing are configured only inside the temporary repositories.
// The command line is run the way people run it: node scripts/skillgate.mjs, and through bin/skillgate of an
// installed copy. The last tests run deliberately broken copies of the runtime to prove key assertions can fail.
//
// Needs git 2.34 or later (SSH signing) and ssh-keygen. When either is missing the suite fails; it does not skip.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
  statSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "..");
const CLI = join(REPO, "scripts", "skillgate.mjs");
const PLUGINS = join(REPO, "packs", "base", "plugins");
// The migrations a release records come from the workflow runtime's registry when this build has one.
const MIGRATIONS_MODULE = join(PLUGINS, "workflow", "runtime", "lib", "migrations.mjs");
const EXPECTED_MIGRATIONS = existsSync(MIGRATIONS_MODULE) ? (await import(pathToFileURL(MIGRATIONS_MODULE).href)).MIGRATIONS.map((m) => m.id) : [];
const CATALOG = JSON.parse(readFileSync(join(REPO, ".claude-plugin", "marketplace.json"), "utf8"));
const MARKETPLACE = CATALOG.name;
const PLUGIN_NAMES = CATALOG.plugins.map((p) => p.name);
const DENIED = "qzxvexamplename"; // a made-up token standing in for a name that must never ship
const STATES = "VERIFIED|TAMPERED|UNKNOWN VERSION|WITHDRAWN|NOT INSTALLED";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------- prerequisites

function prerequisites() {
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  const m = /git version (\d+)\.(\d+)/.exec(git.stdout ?? "");
  const keygen = spawnSync("ssh-keygen", ["-?"], { encoding: "utf8" });
  const problems = [];
  if (!m) problems.push("git was not found");
  else if (Number(m[1]) < 2 || (Number(m[1]) === 2 && Number(m[2]) < 34)) problems.push(`git ${m[1]}.${m[2]} is older than 2.34, which added SSH signing`);
  if (keygen.error?.code === "ENOENT") problems.push("ssh-keygen was not found");
  return problems;
}

// ---------------------------------------------------------------- sandbox

function sandbox(label) {
  const root = mkdtempSync(join(tmpdir(), `skillgate-release-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 30)}-`));
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(GIT_|SKILLGATE_)/.test(key)) delete env[key];
  for (const key of ["SSH_AUTH_SOCK", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "GNUPGHOME", "XDG_CONFIG_HOME"]) delete env[key];
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GNUPGHOME: join(home, ".gnupg"),
    SKILLGATE_TRUST_DIR: join(root, "trust"),
    SKILLGATE_BACKUPS: join(root, "backups"),
    SKILLGATE_DENYLIST: join(root, "denylist"),
    CLAUDE_CONFIG_DIR: join(root, "claude"),
    CODEX_HOME: join(root, "codex"),
  });
  writeFileSync(env.SKILLGATE_DENYLIST, `# test denylist\n${DENIED}\n`);
  return { root, home, env };
}

// One test, one temporary folder, always removed.
function boxed(name, fn) {
  test(name, async (t) => {
    const missing = prerequisites();
    assert.deepEqual(missing, [], `this suite needs git 2.34+ and ssh-keygen: ${missing.join("; ")}`);
    const box = sandbox(name);
    try { await fn(box, t); } finally { rmSync(box.root, { recursive: true, force: true }); }
  });
}

function cli(box, args, { via = CLI, env = {}, cwd } = {}) {
  const options = { cwd: cwd ?? box.root, env: { ...box.env, ...env }, encoding: "utf8" };
  const r = via.endsWith(".mjs") ? spawnSync(process.execPath, [via, ...args], options) : spawnSync(via, args, options);
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}`, error: r.error };
}

function expectCode(r, code, what) {
  assert.equal(r.code, code, `${what}: expected exit ${code}, got ${r.code}\n${r.all}`);
  return r;
}

function git(box, cwd, args, { ok = true } = {}) {
  const r = spawnSync("git", args, { cwd, env: box.env, encoding: "utf8" });
  if (ok && r.status !== 0) throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr}`);
  return r;
}

function copyTree(src, dst, { reverse = false } = {}) {
  mkdirSync(dst, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true }).filter((e) => e.name !== ".DS_Store");
  if (reverse) entries.reverse();
  for (const ent of entries) {
    const s = join(src, ent.name), d = join(dst, ent.name);
    if (ent.isDirectory()) copyTree(s, d, { reverse });
    else if (ent.isFile()) { copyFileSync(s, d); chmodSync(d, statSync(s).mode & 0o777); }
    else throw new Error(`unexpected non-regular file in the fixture source: ${s}`);
  }
}

// A company skills repository: this checkout's base plugins, catalog and scrub check, committed on main.
function skillsRepo(box, { name = "skills", reverse = false } = {}) {
  const repo = join(box.root, name);
  copyTree(PLUGINS, join(repo, "packs", "base", "plugins"), { reverse });
  mkdirSync(join(repo, ".claude-plugin"), { recursive: true });
  copyFileSync(join(REPO, ".claude-plugin", "marketplace.json"), join(repo, ".claude-plugin", "marketplace.json"));
  mkdirSync(join(repo, "scripts"), { recursive: true });
  copyFileSync(join(REPO, "scripts", "scrub-check.sh"), join(repo, "scripts", "scrub-check.sh"));
  chmodSync(join(repo, "scripts", "scrub-check.sh"), 0o755);
  git(box, box.root, ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.name", "release-test"], ["user.email", "release-test@example.invalid"], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]]) git(box, repo, ["config", k, v]);
  commitAll(box, repo, "fixture");
  return repo;
}

function commitAll(box, repo, message) {
  git(box, repo, ["add", "-A"]);
  git(box, repo, ["commit", "-q", "-m", message]);
  return git(box, repo, ["rev-parse", "HEAD"]).stdout.trim();
}

function makeKey(box, name) {
  const dir = join(box.root, "keys");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  const r = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", path, "-C", "test"], { env: box.env, encoding: "utf8" });
  assert.equal(r.status, 0, `ssh-keygen failed: ${r.stderr}`);
  return { path, pub: readFileSync(`${path}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ") };
}

function signersFile(box, name, entries) {
  const path = join(box.root, "keys", `${name}.signers`);
  writeFileSync(path, entries.map(([principal, key]) => `${principal} namespaces="git" ${key.pub}\n`).join(""));
  return path;
}

function useSigningKey(box, repo, key) {
  git(box, repo, ["config", "gpg.format", "ssh"]);
  git(box, repo, ["config", "user.signingkey", key.path]);
}

function pluginVersion(dir) {
  return JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8")).version;
}

// create, commit and sign one release with a trusted maintainer key.
function signedRelease(box, { version = "1.0.0", repo = skillsRepo(box) } = {}) {
  const maintainer = makeKey(box, "maintainer");
  const signers = signersFile(box, "company", [["release-maintainer", maintainer]]);
  expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signers, "--apply"]), 0, "trust add");
  expectCode(cli(box, ["release", "create", "--version", version, "--repo", repo, "--apply"]), 0, "release create");
  git(box, repo, ["add", `releases/${version}.json`]);
  git(box, repo, ["commit", "-q", "-m", `release ${version} manifest`]);
  useSigningKey(box, repo, maintainer);
  expectCode(cli(box, ["release", "sign", version, "--repo", repo, "--apply"]), 0, "release sign");
  return { repo, maintainer, signers };
}

// A fake Claude Code install: plugin folders copied into <config>/plugins/cache and the records that point at them.
function installClaude(box, repo, { plugins = PLUGIN_NAMES, versions = {}, configDir = box.env.CLAUDE_CONFIG_DIR } = {}) {
  const records = {}, paths = {};
  const head = git(box, repo, ["rev-parse", "HEAD"]).stdout.trim();
  for (const name of plugins) {
    const src = join(repo, "packs", "base", "plugins", name);
    const version = versions[name] ?? pluginVersion(src);
    const dest = join(configDir, "plugins", "cache", MARKETPLACE, name, version);
    rmSync(dest, { recursive: true, force: true });
    copyTree(src, dest);
    records[`${name}@${MARKETPLACE}`] = [{ scope: "user", installPath: dest, version, installedAt: "2026-09-16T00:00:00.000Z", lastUpdated: "2026-09-16T00:00:00.000Z", gitCommitSha: head }];
    paths[name] = dest;
  }
  mkdirSync(join(configDir, "plugins"), { recursive: true });
  writeFileSync(join(configDir, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: records }, null, 2));
  writeFileSync(join(configDir, "plugins", "known_marketplaces.json"), JSON.stringify({ [MARKETPLACE]: { source: { source: "directory", path: repo }, installLocation: repo, lastUpdated: "2026-09-16T00:00:00.000Z" } }, null, 2));
  return paths;
}

function verifyLine(out, plugin) {
  const m = new RegExp(`^(${STATES}) +${plugin}[ :].*$`, "m").exec(out);
  return m ? { state: m[1], line: m[0] } : { state: null, line: null };
}

function treeHashes(out) {
  const found = {};
  for (const m of out.matchAll(/^ {2}(\S+) +\S+ +\S+ +\d+ file\(s\) +treeSha256 ([0-9a-f]{64})$/gm)) found[m[1]] = m[2];
  return found;
}

function flipByte(path) {
  const bytes = readFileSync(path);
  bytes[0] = bytes[0] ^ 0x01;
  writeFileSync(path, bytes);
}

// An independent reproduction of the tree hash with standard tools (the recipe in releases/SCHEMA.md).
function shellTreeHash(dir) {
  const tool = ["sha256sum", "shasum -a 256"].find((t) => spawnSync("bash", ["-c", `command -v ${t.split(" ")[0]}`]).status === 0);
  if (!tool) return null;
  const script = `find . -type f ! -name .DS_Store | sed 's|^\\./||' | LC_ALL=C sort | while IFS= read -r f; do ${tool} "$f"; done | ${tool}`;
  const r = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split(/\s+/)[0];
}

// A tag written directly with git mktag, for tag shapes release sign never makes.
function mktag(box, repo, name, message) {
  const commit = git(box, repo, ["rev-parse", "HEAD"]).stdout.trim();
  const body = `object ${commit}\ntype commit\ntag ${name}\ntagger release-test <release-test@example.invalid> 1789500000 +0000\n\n${message}`;
  const r = spawnSync("git", ["mktag"], { cwd: repo, env: box.env, input: body, encoding: "utf8" });
  assert.equal(r.status, 0, `git mktag failed: ${r.stderr}`);
  git(box, repo, ["update-ref", `refs/tags/${name}`, r.stdout.trim()]);
}

// ================================================================ tree hash

boxed("tree hash: stable across runs and creation order, and reproduced by standard tools", async (box, t) => {
  const a = skillsRepo(box, { name: "a" });
  const b = skillsRepo(box, { name: "b", reverse: true });
  const first = expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", a]), 0, "preview a");
  const again = expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", a]), 0, "preview a again");
  const other = expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", b]), 0, "preview b");
  const h1 = treeHashes(first.out), h2 = treeHashes(again.out), h3 = treeHashes(other.out);
  assert.deepEqual(Object.keys(h1).sort(), [...PLUGIN_NAMES].sort(), first.out);
  assert.deepEqual(h2, h1, "the same tree hashed twice must give the same hashes");
  assert.deepEqual(h3, h1, "files created in the opposite order must give the same hashes");

  const { treeSha256Of, hashTree } = await import(pathToFileURL(join(PLUGINS, "workflow", "runtime", "lib", "treehash.mjs")).href);
  const files = hashTree(join(a, "packs", "base", "plugins", "workflow")).files;
  const shuffled = [...files].reverse();
  [shuffled[0], shuffled[3]] = [shuffled[3], shuffled[0]];
  assert.equal(treeSha256Of(shuffled), h1.workflow, "the tree hash of a reordered file list must not change");

  const oracle = shellTreeHash(join(a, "packs", "base", "plugins", "guardrails"));
  if (oracle === null) t.diagnostic("NOT RUN: neither sha256sum nor shasum is on PATH, so the standard-tools reproduction was not checked");
  else assert.equal(oracle, h1.guardrails, "find | sort | sha256sum must reproduce treeSha256");
});

boxed("tree hash: a one-byte edit and an added file change it; the executable bit is recorded, not hashed; links are refused", (box) => {
  const repo = skillsRepo(box);
  const hashOf = () => treeHashes(expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo]), 0, "preview").out).guardrails;
  const skill = join(repo, "packs", "base", "plugins", "guardrails", "skills", "guardrails", "SKILL.md");
  const h0 = hashOf();
  flipByte(skill);
  commitAll(box, repo, "one byte");
  const h1 = hashOf();
  assert.notEqual(h1, h0, "a one-byte edit must change the tree hash");
  writeFileSync(join(repo, "packs", "base", "plugins", "guardrails", "skills", "guardrails", "extra.md"), "added\n");
  commitAll(box, repo, "added file");
  const h2 = hashOf();
  assert.notEqual(h2, h1, "an added file must change the tree hash");
  chmodSync(skill, 0o755);
  commitAll(box, repo, "mode only");
  assert.equal(hashOf(), h2, "the executable bit must not change the tree hash");
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "create");
  const manifest = JSON.parse(readFileSync(join(repo, "releases", "1.0.0.json"), "utf8"));
  const entry = manifest.components.find((c) => c.name === "guardrails").files.find((f) => f.path === "skills/guardrails/SKILL.md");
  assert.equal(entry.executable, true, "the manifest must record the executable bit");
  rmSync(join(repo, "releases"), { recursive: true });

  symlinkSync("SKILL.md", join(repo, "packs", "base", "plugins", "guardrails", "skills", "guardrails", "link.md"));
  commitAll(box, repo, "a link");
  const refused = expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo]), 2, "a symbolic link");
  assert.match(refused.all, /link\.md \(a symbolic link\)/);
});

// ================================================================ release create

boxed("release create: preview writes nothing; --apply writes a manifest with every field", (box) => {
  const repo = skillsRepo(box);
  mkdirSync(join(repo, "evidence", "releases", "1.0.0"), { recursive: true });
  mkdirSync(join(repo, "evidence", "rehearsals", "2026-09-16-join"), { recursive: true });
  writeFileSync(join(repo, "evidence", "releases", "1.0.0", "checks.md"), "# Checks\n\nall offline checks ran\n");
  writeFileSync(join(repo, "evidence", "rehearsals", "2026-09-16-join", "notes.md"), "# Rehearsal\n");
  const head = commitAll(box, repo, "evidence");
  const args = ["release", "create", "--version", "1.0.0", "--repo", repo, "--evidence", join(repo, "evidence", "releases", "1.0.0", "checks.md"), "--evidence", "evidence/rehearsals/2026-09-16-join/notes.md"];

  const preview = expectCode(cli(box, args, { cwd: repo }), 0, "preview");
  assert.match(preview.out, /preview; nothing written/);
  assert.match(preview.out, /would write releases\/1\.0\.0\.json/);
  assert.equal(existsSync(join(repo, "releases")), false, "a preview must not create releases/");

  const applied = expectCode(cli(box, [...args, "--apply"], { cwd: repo }), 0, "apply");
  assert.match(applied.out, /wrote releases\/1\.0\.0\.json \(manifest-sha256 [0-9a-f]{64}\)/);
  const bytes = readFileSync(join(repo, "releases", "1.0.0.json"));
  assert.match(applied.out, new RegExp(sha256(bytes)), "the printed manifest-sha256 must be the file's sha256");
  const m = JSON.parse(bytes.toString("utf8"));
  assert.equal(m.schema, "skillgate.release/1");
  assert.equal(m.release, "1.0.0");
  assert.equal(m.sourceCommit, head);
  assert.ok(!Number.isNaN(Date.parse(m.createdAt)));
  assert.equal(m.marketplace, MARKETPLACE);
  assert.equal(m.projectLayout, 2);
  assert.deepEqual(m.migrations, EXPECTED_MIGRATIONS);
  if (!EXPECTED_MIGRATIONS.length) assert.ok(m.notes.some((n) => /not available in this build/.test(n)), JSON.stringify(m.notes));
  assert.deepEqual(m.components.map((c) => c.name), PLUGIN_NAMES);
  for (const c of m.components) {
    assert.equal(c.kind, "plugin");
    const dir = join(repo, c.path);
    assert.equal(c.version, pluginVersion(dir));
    for (const f of c.files) assert.equal(f.sha256, sha256(readFileSync(join(dir, f.path))), `${c.name}/${f.path}`);
    const lines = [...c.files].sort((x, y) => Buffer.compare(Buffer.from(x.path), Buffer.from(y.path))).map((f) => `${f.sha256}  ${f.path}\n`).join("");
    assert.equal(c.treeSha256, sha256(Buffer.from(lines)), `${c.name} treeSha256 must be the sha256 of its sorted lines`);
  }
  assert.deepEqual(m.evidence, [
    { kind: "release", path: "evidence/releases/1.0.0/checks.md", sha256: sha256(readFileSync(join(repo, "evidence", "releases", "1.0.0", "checks.md"))) },
    { kind: "rehearsal", path: "evidence/rehearsals/2026-09-16-join/notes.md", sha256: sha256(readFileSync(join(repo, "evidence", "rehearsals", "2026-09-16-join", "notes.md"))) },
  ]);
  assert.equal(m.clients["claude-code"].marketplace, MARKETPLACE);
  assert.equal(m.clients.codex.marketplace, null);
});

boxed("release create refuses uncommitted work: a change, an untracked file, an ignored file, a change hidden from git status, and uncommitted evidence", (box) => {
  const repo = skillsRepo(box);
  writeFileSync(join(repo, ".gitignore"), "*.log\n");
  commitAll(box, repo, "ignore logs");
  const create = (extra = []) => cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply", ...extra]);
  const hook = join(repo, "packs", "base", "plugins", "guardrails", "hooks", "guard-bash.sh");
  const original = readFileSync(hook);
  const noManifest = () => assert.equal(existsSync(join(repo, "releases", "1.0.0.json")), false, "a refused create must write nothing");

  appendFileSync(hook, "# edited\n");
  let r = expectCode(create(), 2, "changed file");
  assert.match(r.all, /guardrails\/hooks\/guard-bash\.sh \(changed since the commit\)/);
  assert.match(r.all, /Nothing was written/);
  noManifest();
  writeFileSync(hook, original);

  writeFileSync(join(repo, "packs", "base", "plugins", "workflow", "untracked.md"), "x\n");
  r = expectCode(create(), 2, "untracked file");
  assert.match(r.all, /workflow\/untracked\.md \(not in the commit/);
  noManifest();
  unlinkSync(join(repo, "packs", "base", "plugins", "workflow", "untracked.md"));

  writeFileSync(join(repo, "packs", "base", "plugins", "workflow", "debug.log"), "x\n");
  assert.equal(git(box, repo, ["status", "--porcelain"]).stdout, "", "git status does not show an ignored file");
  r = expectCode(create(), 2, "ignored file");
  assert.match(r.all, /workflow\/debug\.log \(not in the commit/);
  noManifest();
  unlinkSync(join(repo, "packs", "base", "plugins", "workflow", "debug.log"));

  git(box, repo, ["update-index", "--assume-unchanged", "packs/base/plugins/guardrails/hooks/guard-bash.sh"]);
  appendFileSync(hook, "# hidden\n");
  assert.equal(git(box, repo, ["status", "--porcelain"]).stdout, "", "assume-unchanged hides the edit from git status");
  r = expectCode(create(), 2, "hidden change");
  assert.match(r.all, /guard-bash\.sh \(changed since the commit\)/);
  noManifest();
  writeFileSync(hook, original);
  git(box, repo, ["update-index", "--no-assume-unchanged", "packs/base/plugins/guardrails/hooks/guard-bash.sh"]);

  mkdirSync(join(repo, "evidence", "releases"), { recursive: true });
  writeFileSync(join(repo, "evidence", "releases", "draft.md"), "not committed\n");
  r = expectCode(create(["--evidence", join(repo, "evidence", "releases", "draft.md")]), 2, "uncommitted evidence");
  assert.match(r.all, /is not committed/);
  r = expectCode(create(["--evidence", join(box.root, "denylist")]), 2, "evidence outside the repository");
  assert.match(r.all, /outside the repository/);
  noManifest();

  expectCode(create(), 0, "clean tree");
});

boxed("release create refuses a duplicate version: a manifest file, a committed manifest, or an existing tag", (box) => {
  const repo = skillsRepo(box);
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "first");
  const before = readFileSync(join(repo, "releases", "1.0.0.json"));
  let r = expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 2, "manifest file present");
  assert.match(r.all, /already has a manifest/);
  assert.deepEqual(readFileSync(join(repo, "releases", "1.0.0.json")), before, "the existing manifest must be untouched");
  commitAll(box, repo, "manifest");
  unlinkSync(join(repo, "releases", "1.0.0.json"));
  r = expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo]), 2, "manifest committed, file deleted");
  assert.match(r.all, /already has a manifest/);
  git(box, repo, ["checkout", "--", "releases/1.0.0.json"]);
  git(box, repo, ["tag", "-a", "skillgate-release/2.0.0", "-m", "skillgate release 2.0.0"]);
  r = expectCode(cli(box, ["release", "create", "--version", "2.0.0", "--repo", repo]), 2, "tag present");
  assert.match(r.all, /already has the tag skillgate-release\/2\.0\.0/);
  r = expectCode(cli(box, ["release", "create", "--version", "v2", "--repo", repo]), 2, "bad version");
  assert.match(r.all, /MAJOR\.MINOR\.PATCH/);
});

boxed("release create refuses escaping, linked and external plugin paths, and a plugin whose Claude Code and Codex versions disagree", (box) => {
  const repo = skillsRepo(box);
  const catalogPath = join(repo, ".claude-plugin", "marketplace.json");
  const original = readFileSync(catalogPath, "utf8");
  const withSource = (source) => {
    const c = JSON.parse(original);
    c.plugins[1].source = source;
    writeFileSync(catalogPath, JSON.stringify(c, null, 2));
  };
  const create = () => cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]);
  mkdirSync(join(box.root, "outside", "workflow", ".claude-plugin"), { recursive: true });

  withSource("./packs/base/../../../outside/workflow");
  let r = expectCode(create(), 2, "a .. path");
  assert.match(r.all, /uses \.\. and so escapes the repository/);
  withSource(join(box.root, "outside", "workflow"));
  r = expectCode(create(), 2, "an absolute path");
  assert.match(r.all, /escapes the repository/);
  symlinkSync(join(box.root, "outside", "workflow"), join(repo, "packs", "base", "linked"));
  withSource("./packs/base/linked");
  r = expectCode(create(), 2, "a linked folder");
  assert.match(r.all, /symbolic link/);
  unlinkSync(join(repo, "packs", "base", "linked"));
  withSource({ source: "github", repo: "example/elsewhere" });
  r = expectCode(create(), 2, "an external source");
  assert.match(r.all, /outside this repository/);
  assert.equal(existsSync(join(repo, "releases")), false);
  writeFileSync(catalogPath, original);

  const codexDir = join(repo, "packs", "base", "plugins", "guardrails", ".codex-plugin");
  mkdirSync(codexDir);
  writeFileSync(join(codexDir, "plugin.json"), JSON.stringify({ name: "guardrails", version: "9.9.9", skills: "./skills/" }, null, 2));
  commitAll(box, repo, "codex manifest with another version");
  r = expectCode(create(), 2, "versions disagree");
  assert.match(r.all, /plugin "guardrails" has two versions/);
  writeFileSync(join(codexDir, "plugin.json"), JSON.stringify({ name: "guardrails", version: pluginVersion(join(repo, "packs", "base", "plugins", "guardrails")), skills: "./skills/" }, null, 2));
  commitAll(box, repo, "codex manifest agrees");
  expectCode(create(), 0, "versions agree");
});

// ================================================================ approval

boxed("a signed release is approved by release list and VERIFIED by verify, including from the installed runtime itself", (box) => {
  const { repo } = signedRelease(box);
  const tagMessage = git(box, repo, ["for-each-ref", "--format=%(contents)", "refs/tags/skillgate-release/1.0.0"]).stdout;
  assert.match(tagMessage, /^skillgate release 1\.0\.0\n/);
  assert.match(tagMessage, new RegExp(`^manifest-sha256: ${sha256(readFileSync(join(repo, "releases", "1.0.0.json")))}$`, "m"));

  const list = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 0, "release list");
  assert.match(list.out, /^approved +1\.0\.0 +signed by release-maintainer \(ED25519 SHA256:/m);

  const paths = installClaude(box, repo);
  const v = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 0, "verify");
  for (const name of PLUGIN_NAMES) assert.equal(verifyLine(v.out, name).state, "VERIFIED", v.out);
  assert.match(v.out, /format not documented; read as observed/);

  const inferred = expectCode(cli(box, ["verify", "--source", repo]), 0, "verify with the only trusted company");
  assert.match(inferred.out, /the only company configured/);

  mkdirSync(join(box.root, "empty-claude"));
  const elsewhere = { CLAUDE_CONFIG_DIR: join(box.root, "empty-claude") };
  const viaOption = expectCode(cli(box, ["verify", "--source", repo, "--config-dir", box.env.CLAUDE_CONFIG_DIR], { env: elsewhere }), 0, "--config-dir overrides CLAUDE_CONFIG_DIR");
  for (const name of PLUGIN_NAMES) assert.equal(verifyLine(viaOption.out, name).state, "VERIFIED", viaOption.out);
  const viaEnv = expectCode(cli(box, ["verify", "--source", repo], { env: elsewhere }), 1, "CLAUDE_CONFIG_DIR is read when --config-dir is absent");
  assert.equal(verifyLine(viaEnv.out, "workflow").state, "NOT INSTALLED", viaEnv.out);

  const json = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--json"]), 0, "verify --json");
  const parsed = JSON.parse(json.out);
  assert.equal(parsed.schema, "skillgate.result/1");
  assert.equal(parsed.command, "verify");
  assert.equal(parsed.result, "complete");
  assert.equal(parsed.details.counts.VERIFIED, PLUGIN_NAMES.length);

  const installedBin = join(paths.workflow, "bin", "skillgate");
  const self = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"], { via: installedBin }), 0, "verify through the installed bin/skillgate");
  assert.equal(verifyLine(self.out, "workflow").state, "VERIFIED", self.out);
});

boxed("release sign previews without tagging and refuses an uncommitted manifest, missing SSH signing, and plugins changed after create", (box) => {
  const repo = skillsRepo(box);
  const key = makeKey(box, "maintainer");
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "create");
  let r = expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo]), 2, "manifest not committed");
  assert.match(r.all, /is not in the current commit/);
  commitAll(box, repo, "manifest");
  r = expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo, "--apply"]), 2, "no SSH signing configured");
  assert.match(r.all, /not set up to sign with an SSH key/);
  useSigningKey(box, repo, key);
  r = expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo]), 0, "preview");
  assert.match(r.out, /command: git tag -s skillgate-release\/1\.0\.0 -m 'skillgate release 1\.0\.0' -m 'manifest-sha256: [0-9a-f]{64}' [0-9a-f]{40}/);
  assert.equal(git(box, repo, ["tag", "-l"]).stdout, "", "a preview must not create a tag");
  appendFileSync(join(repo, "packs", "base", "plugins", "workflow", "skills", "review", "SKILL.md"), "\nchanged after the manifest\n");
  commitAll(box, repo, "change after create");
  r = expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo, "--apply"]), 2, "changed plugin");
  assert.match(r.all, /plugin "workflow" \(packs\/base\/plugins\/workflow\) has changed since the manifest was created/);
  assert.equal(git(box, repo, ["tag", "-l"]).stdout, "", "a refused sign must not create a tag");
});

boxed("an unsigned tag, a lightweight tag, a tag signed another way and a tag signed by an untrusted key give exit 2 and are never approved", (box) => {
  const repo = skillsRepo(box);
  const maintainer = makeKey(box, "maintainer");
  const stranger = makeKey(box, "stranger");
  expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signersFile(box, "company", [["release-maintainer", maintainer]]), "--apply"]), 0, "trust add");
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "create");
  commitAll(box, repo, "manifest");
  installClaude(box, repo);
  const hash = sha256(readFileSync(join(repo, "releases", "1.0.0.json")));
  const tag = "skillgate-release/1.0.0";
  const check = (label, reason) => {
    const list = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 2, `${label}: release list`);
    assert.doesNotMatch(list.out, /^approved +1\.0\.0/m, `${label} must never be listed as approved`);
    assert.match(list.out, /^unapproved +1\.0\.0 /m);
    assert.match(list.out, reason);
    const v = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, `${label}: verify`);
    assert.doesNotMatch(v.out, /^VERIFIED/m, `${label} must never produce VERIFIED`);
    const json = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--json"]), 2, `${label}: verify --json`);
    assert.equal(JSON.parse(json.out).result, "invalid");
    git(box, repo, ["tag", "-d", tag]);
  };

  git(box, repo, ["tag", "-a", tag, "-m", "skillgate release 1.0.0", "-m", `manifest-sha256: ${hash}`]);
  check("an unsigned annotated tag", /has no signature/);
  git(box, repo, ["tag", tag]);
  check("a lightweight tag", /lightweight tag/);
  mktag(box, repo, tag, `skillgate release 1.0.0\n\nmanifest-sha256: ${hash}\n${"-----BEGIN " + "PGP SIGNATURE-----"}\n\nnot a real signature\n-----END PGP SIGNATURE-----\n`);
  check("a tag signed another way", /signed some other way than with an SSH key/);
  git(box, repo, ["-c", "gpg.format=ssh", "-c", `user.signingkey=${maintainer.path}`, "tag", "-s", tag, "-m", "skillgate release 1.0.0", "-m", `manifest-sha256: ${"0".repeat(64)}`]);
  const raw = git(box, repo, ["cat-file", "tag", tag]).stdout;
  const copied = raw.slice(raw.indexOf("-----BEGIN SSH SIGNATURE-----"));
  assert.ok(copied.startsWith("-----BEGIN SSH SIGNATURE-----"), "the fixture needs a real SSH signature to copy");
  git(box, repo, ["tag", "-d", tag]);
  mktag(box, repo, tag, `skillgate release 1.0.0\n\nmanifest-sha256: ${hash}\n${copied}`);
  check("a trusted signature copied onto another message", /git verify-tag did not accept it/);
  git(box, repo, ["-c", "gpg.format=ssh", "-c", `user.signingkey=${stranger.path}`, "tag", "-s", tag, "-m", "skillgate release 1.0.0", "-m", `manifest-sha256: ${hash}`]);
  check("a tag signed by an untrusted key", /signed by a key the trust file does not list/);

  git(box, repo, ["-c", "gpg.format=ssh", "-c", `user.signingkey=${maintainer.path}`, "tag", "-s", tag, "-m", "skillgate release 1.0.0", "-m", `manifest-sha256: ${"0".repeat(64)}`]);
  const wrongHash = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "a trusted tag approving other manifest bytes");
  assert.match(wrongHash.out, /the signed tag approves 000000000000/);
  assert.doesNotMatch(wrongHash.out, /^VERIFIED/m);
});

// ================================================================ verify states

boxed("verify says TAMPERED and names the files after a one-byte change, an added file, a deleted file and a link", (box) => {
  const { repo } = signedRelease(box);
  const paths = installClaude(box, repo);
  flipByte(join(paths.guardrails, "hooks", "guard-bash.sh"));
  let r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "one byte");
  const line = verifyLine(r.out, "guardrails");
  assert.equal(line.state, "TAMPERED", r.out);
  assert.match(line.line, /changed: hooks\/guard-bash\.sh/);
  assert.equal(verifyLine(r.out, "workflow").state, "VERIFIED");
  const json = JSON.parse(expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--json"]), 1, "json").out);
  assert.equal(json.result, "attention");
  assert.deepEqual(json.details.plugins.find((p) => p.plugin === "guardrails").files.changed, ["hooks/guard-bash.sh"]);

  writeFileSync(join(paths.workflow, "extra.sh"), "echo extra\n");
  const removed = readdirSync(join(paths["context-hygiene"], "hooks")).sort()[0];
  unlinkSync(join(paths["context-hygiene"], "hooks", removed));
  symlinkSync("SKILL.md", join(paths.workflow, "skills", "review", "link.md"));
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "added, missing and linked");
  assert.match(verifyLine(r.out, "workflow").line, /added: extra\.sh/);
  assert.match(verifyLine(r.out, "workflow").line, /skills\/review\/link\.md \(a symbolic link\)/);
  assert.match(verifyLine(r.out, "context-hygiene").line, new RegExp(`missing: hooks/${removed.replace(/\./g, "\\.")}`));
});

boxed("verify: a hook that lost its executable bit keeps VERIFIED content but is attention; a bit the release lacks is a note", (box) => {
  const { repo } = signedRelease(box);
  const paths = installClaude(box, repo);
  const extra = readdirSync(join(paths.workflow, "skills", "review")).sort()[0];
  chmodSync(join(paths.workflow, "skills", "review", extra), 0o755);
  let r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 0, "gained bit only");
  assert.equal(verifyLine(r.out, "workflow").state, "VERIFIED");
  assert.match(r.out, new RegExp(`executable although the release does not mark it so \\(the content hash does not cover the bit\\): skills/review/${extra.replace(/\./g, "\\.")}`));

  chmodSync(join(paths.guardrails, "hooks", "guard-bash.sh"), 0o644);
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--json"]), 1, "lost bit");
  const result = JSON.parse(r.out);
  assert.equal(result.result, "attention");
  const guard = result.details.plugins.find((p) => p.plugin === "guardrails");
  assert.equal(guard.state, "VERIFIED", "the content still matches the release");
  assert.deepEqual(guard.notRunnable, ["hooks/guard-bash.sh"]);
  assert.match(result.summary, /1 file\(s\) the release marks executable are not executable, so the client cannot run them \(guardrails\/hooks\/guard-bash\.sh\)/);
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "lost bit, text");
  assert.match(verifyLine(r.out, "guardrails").line, /^VERIFIED/);
  assert.match(r.out, /not executable although the release marks it executable, so the client cannot run it: hooks\/guard-bash\.sh; reinstall the plugin/);
});

boxed("verify says UNKNOWN VERSION for a version no approved release has, and NOT INSTALLED for a released plugin the client lacks", (box) => {
  const { repo } = signedRelease(box);
  installClaude(box, repo, { plugins: ["workflow", "guardrails"], versions: { workflow: "9.9.9" } });
  const r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "unknown version");
  const line = verifyLine(r.out, "workflow");
  assert.equal(line.state, "UNKNOWN VERSION", r.out);
  assert.match(line.line, /no approved release has workflow 9\.9\.9/);
  assert.match(r.out, /its files are exactly workflow \S+ of release 1\.0\.0/);
  assert.equal(verifyLine(r.out, "guardrails").state, "VERIFIED");
  assert.equal(verifyLine(r.out, "context-hygiene").state, "NOT INSTALLED");
});

boxed("release withdraw previews, then a signed withdrawal makes release list say withdrawn and verify say WITHDRAWN; an unsigned withdrawal is exit 2", (box) => {
  const { repo } = signedRelease(box);
  installClaude(box, repo);
  const preview = expectCode(cli(box, ["release", "withdraw", "1.0.0", "--reason", "the review hook blocks valid pushes", "--repo", repo]), 0, "preview");
  assert.match(preview.out, /command: git tag -s skillgate-withdrawn\/1\.0\.0 -m 'skillgate withdrawn 1\.0\.0' -m 'reason: the review hook blocks valid pushes'/);
  assert.equal(git(box, repo, ["tag", "-l", "skillgate-withdrawn/*"]).stdout, "", "a preview must not tag");
  expectCode(cli(box, ["release", "withdraw", "1.0.0", "--repo", repo, "--apply"]), 2, "no reason");
  expectCode(cli(box, ["release", "withdraw", "1.0.0", "--reason", "the review hook blocks valid pushes", "--repo", repo, "--apply"]), 0, "withdraw");

  const list = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 0, "list");
  assert.match(list.out, /^withdrawn +1\.0\.0 +withdrawn \S+ by release-maintainer \(ED25519 SHA256:\S+\): the review hook blocks valid pushes; it had been approved/m);
  const v = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "verify");
  for (const name of PLUGIN_NAMES) assert.equal(verifyLine(v.out, name).state, "WITHDRAWN", v.out);
  assert.match(verifyLine(v.out, "workflow").line, /the review hook blocks valid pushes/);

  git(box, repo, ["tag", "-d", "skillgate-withdrawn/1.0.0"]);
  git(box, repo, ["tag", "-a", "skillgate-withdrawn/1.0.0", "-m", "skillgate withdrawn 1.0.0", "-m", "reason: forged"]);
  expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 2, "unsigned withdrawal: list");
  const forged = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "unsigned withdrawal: verify");
  assert.match(forged.out, /skillgate-withdrawn\/1\.0\.0 does not verify: it has no signature/);
});

boxed("ref drift: the marketplace branch moves to an unsigned commit with a bumped version, and verify says UNKNOWN VERSION", (box) => {
  const { repo } = signedRelease(box);
  const guardrails = join(repo, "packs", "base", "plugins", "guardrails");
  const manifestPath = join(guardrails, ".claude-plugin", "plugin.json");
  const from = pluginVersion(guardrails);
  const bumped = from.replace(/(\d+)$/, (n) => String(Number(n) + 1));
  writeFileSync(manifestPath, readFileSync(manifestPath, "utf8").replace(`"version": "${from}"`, `"version": "${bumped}"`));
  assert.equal(pluginVersion(guardrails), bumped, "the fixture must bump the version");
  appendFileSync(join(guardrails, "hooks", "guard-bash.sh"), "# unreviewed change\n");
  commitAll(box, repo, "unreviewed bump");
  expectCode(cli(box, ["release", "create", "--version", "1.0.1", "--repo", repo, "--apply"]), 0, "an unapproved manifest");
  commitAll(box, repo, "manifest 1.0.1, never signed");
  installClaude(box, repo);

  const v = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "verify after drift");
  assert.equal(verifyLine(v.out, "guardrails").state, "UNKNOWN VERSION", v.out);
  assert.match(verifyLine(v.out, "guardrails").line, new RegExp(`no approved release has guardrails ${bumped.replace(/\./g, "\\.")}`));
  assert.equal(verifyLine(v.out, "workflow").state, "VERIFIED", "unchanged plugins still match release 1.0.0");
  const list = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 0, "list");
  assert.match(list.out, /^unapproved +1\.0\.1 +releases\/1\.0\.1\.json exists, but there is no skillgate-release\/1\.0\.1 tag/m);

  const oid = git(box, repo, ["rev-parse", "refs/tags/skillgate-release/1.0.0"]).stdout.trim();
  git(box, repo, ["update-ref", "refs/tags/skillgate-release/1.0.1", oid]);
  const renamed = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "an approved tag object under another version's name");
  assert.match(renamed.out, /calls itself "skillgate-release\/1\.0\.0", not "skillgate-release\/1\.0\.1"/);
  assert.equal(verifyLine(renamed.out, "guardrails").state, "UNKNOWN VERSION");
});

boxed("a manifest component path with .. is refused by release sign and, once signed by hand, by verify", (box) => {
  const repo = skillsRepo(box);
  const maintainer = makeKey(box, "maintainer");
  expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signersFile(box, "company", [["release-maintainer", maintainer]]), "--apply"]), 0, "trust add");
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "create");
  const path = join(repo, "releases", "1.0.0.json");
  const m = JSON.parse(readFileSync(path, "utf8"));
  m.components[0].path = "packs/base/../../outside";
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
  commitAll(box, repo, "a manifest with an escaping path");
  useSigningKey(box, repo, maintainer);
  const sign = expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo, "--apply"]), 2, "sign");
  assert.match(sign.all, /components\[0\]\.path is a path with a \.\. part/);
  const hash = sha256(readFileSync(path));
  git(box, repo, ["tag", "-s", "skillgate-release/1.0.0", "-m", "skillgate release 1.0.0", "-m", `manifest-sha256: ${hash}`]);
  installClaude(box, repo);
  const v = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "verify");
  assert.match(v.out, /release 1\.0\.0 has an invalid manifest: releases\/1\.0\.0\.json: components\[0\]\.path is a path with a \.\. part/);
  assert.doesNotMatch(v.out, /^VERIFIED/m);
});

boxed("verify reads Codex's plugin cache folders, including a local version folder", (box) => {
  const { repo } = signedRelease(box);
  const cache = join(box.env.CODEX_HOME, "plugins", "cache", MARKETPLACE);
  for (const name of PLUGIN_NAMES) {
    const src = join(repo, "packs", "base", "plugins", name);
    copyTree(src, join(cache, name, name === "workflow" ? "local" : pluginVersion(src)));
  }
  const r = expectCode(cli(box, ["verify", "--client", "codex", "--source", repo, "--company", "acme"]), 0, "codex verify");
  for (const name of PLUGIN_NAMES) assert.equal(verifyLine(r.out, name).state, "VERIFIED", r.out);
  assert.match(r.out, /the version folder is "local"; version \S+ was read from its \.claude-plugin\/plugin\.json/);
  assert.match(r.out, /layout not documented; read as observed/);
  flipByte(join(cache, "workflow", "local", "skills", "review", "SKILL.md"));
  const t = expectCode(cli(box, ["verify", "--client", "codex", "--source", repo, "--company", "acme"]), 1, "codex tampered");
  assert.match(verifyLine(t.out, "workflow").line, /changed: skills\/review\/SKILL\.md/);
});

boxed("verify refuses corrupted client records, missing or corrupted trust, and a source that is not a repository", (box) => {
  const { repo } = signedRelease(box);
  const records = join(box.env.CLAUDE_CONFIG_DIR, "plugins", "installed_plugins.json");
  let r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 1, "no records");
  for (const name of PLUGIN_NAMES) assert.equal(verifyLine(r.out, name).state, "NOT INSTALLED", r.out);
  assert.match(r.out, /installed_plugins\.json was not found/);

  installClaude(box, repo);
  writeFileSync(records, "{ not json");
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "records that do not parse");
  assert.match(r.out, /installed_plugins\.json is not valid JSON/);
  writeFileSync(records, JSON.stringify({ version: 2, plugins: [] }));
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "records with another shape");
  assert.match(r.out, /does not have the shape Skilliton has observed/);

  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--config-dir", join(box.root, "no-such-config")]), 2, "a --config-dir that does not exist");
  assert.match(r.all, /--config-dir \S+ is not an existing folder/);
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme", "--client", "vscode"]), 2, "an unknown client");
  assert.match(r.all, /--client must be one of claude-code, codex/);
  r = expectCode(cli(box, ["verify", "--source", box.root, "--company", "acme"]), 2, "source that is not a repository");
  assert.match(r.all, /is not inside a Git repository/);
  r = expectCode(cli(box, ["verify", "--source", "https://example.invalid/skills.git", "--company", "acme"]), 2, "a URL source");
  assert.match(r.all, /not built in this version/);
  const json = expectCode(cli(box, ["verify", "--json", "--source", join(box.root, "absent"), "--company", "acme"]), 2, "refusal as JSON");
  const parsed = JSON.parse(json.out);
  assert.equal(parsed.result, "invalid");
  assert.match(parsed.summary, /not an existing folder/);

  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "other"]), 2, "company not trusted");
  assert.match(r.all, /trust is not configured for company "other"/);
  writeFileSync(join(box.env.SKILLGATE_TRUST_DIR, "acme.allowed_signers"), "release-maintainer namespaces=\"git\" ssh-ed25519 not-base64!\n");
  r = expectCode(cli(box, ["verify", "--source", repo, "--company", "acme"]), 2, "corrupted trust file");
  assert.match(r.all, /is invalid: line 1: the key is missing or is not base64/);
  rmSync(box.env.SKILLGATE_TRUST_DIR, { recursive: true });
  r = expectCode(cli(box, ["verify", "--source", repo]), 2, "no trust at all");
  assert.match(r.all, /trust is not configured/);
});

// ================================================================ trust

boxed("trust add previews and writes only with --apply; refuses a private key, an invalid line, a folder inside a repository and a different file; remove keeps a backup", (box) => {
  const key = makeKey(box, "maintainer");
  const other = makeKey(box, "other");
  const signers = signersFile(box, "company", [["release-maintainer", key]]);
  const dest = join(box.env.SKILLGATE_TRUST_DIR, "acme.allowed_signers");

  const preview = expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signers]), 0, "preview");
  assert.match(preview.out, /would copy it to/);
  assert.equal(existsSync(dest), false, "a preview must not write the trust file");
  const fingerprint = spawnSync("ssh-keygen", ["-l", "-f", `${key.path}.pub`], { env: box.env, encoding: "utf8" }).stdout.split(/\s+/)[1];
  assert.match(fingerprint, /^SHA256:/);
  assert.ok(preview.out.includes(`release-maintainer  ssh-ed25519  ${fingerprint}  namespaces="git"`), `the fingerprint must match ssh-keygen -l\n${preview.out}`);

  expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signers, "--apply"]), 0, "apply");
  assert.deepEqual(readFileSync(dest), readFileSync(signers));
  const same = expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signers, "--apply"]), 0, "same file again");
  assert.match(same.out, /already holds exactly this file/);
  let r = expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signersFile(box, "other", [["someone-else", other]]), "--apply"]), 2, "a different file");
  assert.match(r.all, /already trusted with a different signers file/);
  assert.deepEqual(readFileSync(dest), readFileSync(signers), "a refused add must leave the trust file as it was");

  r = expectCode(cli(box, ["trust", "add", "--company", "beta", "--signers", key.path, "--apply"]), 2, "a private key");
  assert.match(r.all, /holds a private key/);
  const garbage = join(box.root, "keys", "garbage.signers");
  writeFileSync(garbage, "release-maintainer namespaces=\"git\" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA\n");
  r = expectCode(cli(box, ["trust", "add", "--company", "beta", "--signers", garbage, "--apply"]), 2, "an invalid key");
  assert.match(r.all, /line 1/);
  r = expectCode(cli(box, ["trust", "add", "--company", "Bad Name", "--signers", signers]), 2, "a bad company name");
  assert.equal(existsSync(join(box.env.SKILLGATE_TRUST_DIR, "beta.allowed_signers")), false);

  const repo = skillsRepo(box);
  r = expectCode(cli(box, ["trust", "add", "--company", "beta", "--signers", signers, "--apply"], { env: { SKILLGATE_TRUST_DIR: join(repo, "trust") } }), 2, "a trust folder inside a repository");
  assert.match(r.all, /inside a Git repository/);
  assert.equal(existsSync(join(repo, "trust")), false);

  const show = expectCode(cli(box, ["trust", "show"]), 0, "show");
  assert.match(show.out, /^acme  .*1 signer\(s\)$/m);
  assert.ok(show.out.includes(fingerprint));

  r = expectCode(cli(box, ["trust", "remove", "--company", "acme"]), 0, "remove preview");
  assert.equal(existsSync(dest), true, "a preview must not remove the trust file");
  r = expectCode(cli(box, ["trust", "remove", "--company", "acme", "--apply"]), 0, "remove");
  assert.equal(existsSync(dest), false);
  const backups = join(box.env.SKILLGATE_BACKUPS, "trust");
  const stamps = readdirSync(backups);
  assert.equal(stamps.length, 1);
  assert.deepEqual(readFileSync(join(backups, stamps[0], "acme.allowed_signers")), readFileSync(signers), "the backup must hold the removed bytes");
  expectCode(cli(box, ["trust", "show"]), 1, "show with nothing trusted");
  expectCode(cli(box, ["trust", "remove", "--company", "acme", "--apply"]), 2, "remove again");
});

// ================================================================ propose

boxed("propose writes a scrubbed proposal only with --apply, and refuses a denylisted name, a runtime-built fake key, a dash, a missing denylist and a file that is not a lesson entry", (box) => {
  const repo = skillsRepo(box);
  const lessons = join(box.root, "project", "docs", "lessons");
  mkdirSync(lessons, { recursive: true });
  const id = "2026-09-16-hook-ran-without-executable-bit-a1b2";
  const lesson = (extra = "") => [
    "# A hook that could never run passed every test", "", "Kind: Living. Lesson entry.", "",
    `- **ID:** ${id}`, "- **Status:** accepted", "- **Date:** 2026-09-16", "",
    "## What broke", "", `The hook shipped without its executable bit.${extra}`, "",
    "## The rule", "", "Run a script in tests the way production runs it.", "",
  ].join("\n");
  const file = join(lessons, `${id}.md`);
  const proposal = join(repo, "proposals", `${id}.md`);
  const propose = (apply = true, env = {}) => cli(box, ["propose", file, "--repo", repo, ...(apply ? ["--apply"] : [])], { env });

  writeFileSync(file, lesson());
  const preview = expectCode(propose(false), 0, "preview");
  assert.match(preview.out, /scrub: scrub-check: PASS/);
  assert.equal(existsSync(join(repo, "proposals")), false, "a preview must not create proposals/");
  expectCode(propose(), 0, "apply");
  const text = readFileSync(proposal, "utf8");
  assert.match(text, /^# Proposal: A hook that could never run passed every test$/m);
  assert.match(text, new RegExp(`^- source lesson: ${id}$`, "m"));
  assert.match(text, /^- date: \d{4}-\d{2}-\d{2}$/m);
  assert.match(text, /^- status: proposed; needs a regression scenario, review and an approved release$/m);
  assert.ok(text.endsWith(lesson()), "the lesson must be copied exactly");
  const again = expectCode(propose(), 2, "proposed twice");
  assert.match(again.all, /has already been proposed/);
  rmSync(join(repo, "proposals"), { recursive: true });

  const refusals = [
    ["a denylisted name", ` Reported by ${DENIED}.`, {}, /scrub check found lines to fix/],
    ["a runtime-built fake private key", ` ${"-----BEGIN " + "OPENSSH PRIVATE" + " KEY-----"}`, {}, /secret-shaped or home-path line/],
    ["a runtime-built fake access key id", ` ${"AKIA" + "QZXV".repeat(4)}`, {}, /secret-shaped or home-path line/],
    ["an em dash", ` one ${String.fromCharCode(0x2014)} two`, {}, /scrub check found lines to fix/],
    ["a missing denylist", "", { SKILLGATE_DENYLIST: join(box.root, "no-denylist") }, /did not complete, so names were not scanned/],
  ];
  for (const [label, extra, env, reason] of refusals) {
    writeFileSync(file, lesson(extra));
    const r = expectCode(propose(true, env), 2, label);
    assert.match(r.all, reason, label);
    assert.match(r.all, /stopped before writing anything/);
    assert.equal(existsSync(join(repo, "proposals")), false, `${label}: nothing may be written`);
    if (extra.trim()) assert.ok(!r.all.includes(extra.trim()), `${label}: the matched text must not be printed`);
  }

  const notEntry = join(box.root, "project", "notes.md");
  writeFileSync(notEntry, "# Just notes\n\nNo id here.\n");
  const r = expectCode(cli(box, ["propose", notEntry, "--repo", repo, "--apply"]), 2, "not a lesson entry");
  assert.match(r.all, /is not a lesson entry/);
});

// ================================================================ mutation checks

function mutantRuntime(box, file, from, to) {
  const dir = join(box.root, "mutant", "workflow");
  copyTree(join(PLUGINS, "workflow"), dir);
  const target = join(dir, "runtime", "lib", file);
  const source = readFileSync(target, "utf8");
  assert.ok(source.includes(from), `mutation target not found in ${file}; update this mutation test with the current code: ${from}`);
  writeFileSync(target, source.replace(from, to));
  return join(dir, "bin", "skillgate");
}

boxed("mutation: a verify that ignores file contents would pass a tampered install, and the TAMPERED assertion catches it", (box) => {
  const { repo } = signedRelease(box);
  const paths = installClaude(box, repo);
  flipByte(join(paths.guardrails, "hooks", "guard-bash.sh"));
  const mutant = mutantRuntime(box, "verify.mjs",
    "const matches = (r) => tree !== null && componentOf(r, install.plugin).treeSha256 === tree;",
    "const matches = (r) => true;");
  const broken = cli(box, ["verify", "--source", repo, "--company", "acme"], { via: mutant });
  assert.equal(verifyLine(broken.out, "guardrails").state, "VERIFIED", `the mutant must miss the tampering, or this check proves nothing\n${broken.all}`);
  const real = cli(box, ["verify", "--source", repo, "--company", "acme"]);
  assert.equal(verifyLine(real.out, "guardrails").state, "TAMPERED", real.all);
});

boxed("mutation: a signature check that trusts any key would approve a stranger's tag, and the exit-2 assertion catches it", (box) => {
  const repo = skillsRepo(box);
  const maintainer = makeKey(box, "maintainer");
  const stranger = makeKey(box, "stranger");
  expectCode(cli(box, ["trust", "add", "--company", "acme", "--signers", signersFile(box, "company", [["release-maintainer", maintainer]]), "--apply"]), 0, "trust add");
  expectCode(cli(box, ["release", "create", "--version", "1.0.0", "--repo", repo, "--apply"]), 0, "create");
  commitAll(box, repo, "manifest");
  useSigningKey(box, repo, stranger);
  expectCode(cli(box, ["release", "sign", "1.0.0", "--repo", repo, "--apply"]), 0, "signed with the stranger's key");
  const mutant = mutantRuntime(box, "trust.mjs", "const verified = r.ok && good !== null;", "const verified = true;");
  const broken = cli(box, ["release", "list", "--company", "acme", "--repo", repo], { via: mutant });
  assert.equal(broken.code, 0, `the mutant must accept the stranger's tag, or this check proves nothing\n${broken.all}`);
  assert.match(broken.out, /^approved +1\.0\.0/m);
  const real = expectCode(cli(box, ["release", "list", "--company", "acme", "--repo", repo]), 2, "the real runtime");
  assert.doesNotMatch(real.out, /^approved +1\.0\.0/m);
});
