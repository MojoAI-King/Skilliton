#!/usr/bin/env node
// pin-marketplace.test.mjs: `skilliton pin` moving this machine's Claude Code marketplace to a signed release tag
// (packs/base/plugins/workflow/runtime/lib/marketplace-pin.mjs), and `skilliton join` adding it at the tag.
//
// No real client runs here, ever. Each test builds a company skills repository with one signed release in a temporary
// folder, and a stub `claude` written by this file into that folder, passed with --claude (or found on a PATH this
// file builds). The stub records every call with its arguments and working directory, keeps its state in a
// CLAUDE_CONFIG_DIR inside the temporary folder, and acts out the side effect measured on Claude Code 2.1.278: a
// marketplace remove run inside a folder with .claude/settings.json empties that file's plugin entries. The CLI is
// started from a project fixture holding such a file, so a client command run from the project would show up as a
// changed file. join's machine check asks git to reach the company repository; a git wrapper answers that one
// question locally, so nothing is contacted.
//
//   node scripts/pin-marketplace.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "scripts", "skilliton.mjs");
const CATALOG = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
const MARKET = CATALOG.name;
const PLUGINS = CATALOG.plugins.map((p) => p.name);
const TAG = "skilliton-release/1.0.0";
const SYSTEM_PATH = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

const which = (name) => {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${name} is needed by this test and was not found on PATH`);
  return r.stdout.trim();
};
const TOOLS = { node: process.execPath, "ssh-keygen": which("ssh-keygen") };
const REAL_GIT = which("git");

// The stub client. State lives in $CLAUDE_CONFIG_DIR/plugins; every call is one JSON line in $STUB_LOG.
const STUB = String.raw`
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
const args = process.argv.slice(2);
const env = process.env;
appendFileSync(env.STUB_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\n");
const fail = (m) => { process.stderr.write("stub claude: " + m + "\n"); process.exit(1); };
if (!env.CLAUDE_CONFIG_DIR) fail("CLAUDE_CONFIG_DIR is not set");
const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const write = (p, v) => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const home = env.CLAUDE_CONFIG_DIR;
const knownPath = join(home, "plugins", "known_marketplaces.json");
const installedPath = join(home, "plugins", "installed_plugins.json");
const known = read(knownPath, {});
const installed = read(installedPath, { version: 2, plugins: {} });
const root = env.STUB_MARKET_ROOT;
const catalog = read(join(root, ".claude-plugin", "marketplace.json"), {});
const cmd = args.slice(0, 3).join(" ");
function flat(name, s) { return { name, source: s.source, repo: s.repo, url: s.url, path: s.path, ref: s.ref, installLocation: root }; }
function install(id) {
  const [plugin, market] = id.split("@");
  if (!known[market]) fail("marketplace " + market + " is not added");
  const entry = catalog.plugins.find((p) => p.name === plugin);
  const dir = resolve(root, entry.source);
  const version = read(join(dir, ".claude-plugin", "plugin.json"), {}).version;
  const dest = join(home, "plugins", "cache", market, plugin, version);
  cpSync(dir, dest, { recursive: true });
  installed.plugins[id] = [{ scope: "user", installPath: dest, version, installedAt: "t", lastUpdated: "t" }];
  write(installedPath, installed);
}
if (cmd === "plugin marketplace list" && args[3] === "--json") {
  const list = Object.entries(known).map(([n, m]) => flat(n, m.source));
  if (env.STUB_REPORT_REF) for (const m of list) if (m.ref) m.ref = env.STUB_REPORT_REF;
  process.stdout.write(JSON.stringify(list) + "\n");
} else if (cmd === "plugin marketplace remove") {
  if (!known[args[3]]) fail("marketplace " + args[3] + " is not added");
  delete known[args[3]];
  write(knownPath, known);
  if (env.STUB_REMOVE_UNINSTALLS) {
    for (const id of Object.keys(installed.plugins)) if (id.endsWith("@" + args[3])) delete installed.plugins[id];
    write(installedPath, installed);
  }
  const project = join(process.cwd(), ".claude", "settings.json");
  if (existsSync(project)) { const s = read(project, {}); s.enabledPlugins = {}; s.extraKnownMarketplaces = {}; write(project, s); }
} else if (cmd === "plugin marketplace add") {
  const [base, ref] = args[3].split("#");
  if (ref && env.STUB_REFUSE_REF) fail("fatal: Remote branch " + ref + " not found in upstream origin");
  const source = isAbsolute(base) ? { source: "directory", path: base }
    : /^[\w.-]+\/[\w.-]+$/.test(base) ? { source: "github", repo: base } : { source: "git", url: base };
  if (ref) source.ref = ref;
  known[catalog.name] = { source, installLocation: root, lastUpdated: "t" };
  write(knownPath, known);
} else if (args[0] === "plugin" && args[1] === "update") {
  if (!installed.plugins[args[2]]) fail(args[2] + " is not installed");
  install(args[2]);
} else if (args[0] === "plugin" && args[1] === "install") {
  install(args[2]);
} else fail("unsupported command: " + args.join(" "));
`;

function git(ctx, cwd, ...args) {
  const r = spawnSync(REAL_GIT, ["-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], { cwd, env: ctx.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function cli(ctx, args, { env = {} } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.project, env: { ...ctx.env, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function expectCode(r, code, what) {
  assert.equal(r.code, code, `${what}: expected exit ${code}, got ${r.code}\n${r.all}`);
  return r;
}

// A signed release 1.0.0 of a skills repository holding this checkout's plugins, a trusted signer, a project that
// declares the marketplace, the stub client and a PATH that holds no real client.
function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-pin-marketplace-")));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const ctx = { base, repo: join(base, "skills"), project: join(base, "project"), tools: join(base, "tools"), keys: join(base, "keys") };
  ctx.claudeHome = join(base, "claude");
  ctx.log = join(base, "stub.log");
  ctx.stub = join(base, "stub", "claude");
  for (const d of [ctx.tools, ctx.keys, ctx.project, join(base, "home"), dirname(ctx.stub)]) mkdirSync(d, { recursive: true });
  for (const [name, target] of Object.entries(TOOLS)) symlinkSync(target, join(ctx.tools, name));
  // git, except for the one question join's machine check asks of the network.
  const answer = `{ printf '%s\\trefs/heads/main\\n' ${"0".repeat(40)}; exit 0; }`;
  writeFileSync(join(ctx.tools, "git"), `#!/bin/sh\nfor a in "$@"; do [ "$a" = ls-remote ] && ${answer}; done\nexec ${JSON.stringify(REAL_GIT)} "$@"\n`);
  chmodSync(join(ctx.tools, "git"), 0o755);
  writeFileSync(join(dirname(ctx.stub), "stub.mjs"), STUB);
  writeFileSync(ctx.stub, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dirname(ctx.stub), "stub.mjs"))} "$@"\n`);
  chmodSync(ctx.stub, 0o755);
  ctx.path = [ctx.tools, ...SYSTEM_PATH].join(":");
  for (const dir of SYSTEM_PATH) assert.equal(existsSync(join(dir, "claude")), false, `${dir}/claude exists; this test must run with no real client on PATH`);
  ctx.env = {
    PATH: ctx.path, HOME: join(base, "home"), LANG: "C.UTF-8", SKILLITON_SELF: "skilliton", TMPDIR: tmpdir(),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(base, "home", ".gitconfig"),
    SKILLITON_TRUST_DIR: join(base, "trust"), SKILLITON_BACKUPS: join(base, "backups"), SKILLITON_JOIN_DIR: join(base, "joined"),
    SKILLITON_DENYLIST: join(base, "denylist"), CLAUDE_CONFIG_DIR: ctx.claudeHome, CODEX_HOME: join(base, "codex"),
    STUB_LOG: ctx.log, STUB_MARKET_ROOT: ctx.repo,
  };
  writeFileSync(ctx.env.SKILLITON_DENYLIST, "# test denylist\nqzxvexamplename\n");
  writeFileSync(ctx.env.GIT_CONFIG_GLOBAL, "");
  buildRelease(ctx);
  writeJson(join(ctx.project, ".claude", "settings.json"), {
    enabledPlugins: Object.fromEntries(PLUGINS.map((p) => [`${p}@${MARKET}`, true])),
    extraKnownMarketplaces: { [MARKET]: { source: { source: "github", repo: "acme/skills" }, autoUpdate: false } },
  });
  ctx.projectSettings = readFileSync(join(ctx.project, ".claude", "settings.json"), "utf8");
  return ctx;
}

function buildRelease(ctx) {
  cpSync(join(ROOT, "packs", "base", "plugins"), join(ctx.repo, "packs", "base", "plugins"), { recursive: true });
  cpSync(join(ROOT, ".claude-plugin", "marketplace.json"), join(ctx.repo, ".claude-plugin", "marketplace.json"));
  cpSync(join(ROOT, "scripts", "scrub-check.sh"), join(ctx.repo, "scripts", "scrub-check.sh"));
  writeJson(join(ctx.repo, "templates", "project-settings.json"), {
    extraKnownMarketplaces: { [MARKET]: { source: { source: "github", repo: "acme/skills" }, autoUpdate: false } },
    enabledPlugins: Object.fromEntries(PLUGINS.map((p) => [`${p}@${MARKET}`, true])),
  });
  git(ctx, ctx.base, "init", "-q", "-b", "main", ctx.repo);
  const config = [["user.name", "pin-test"], ["user.email", "pin-test@example.invalid"], ["commit.gpgsign", "false"], ["tag.gpgsign", "false"]];
  for (const [k, v] of config) git(ctx, ctx.repo, "config", k, v);
  git(ctx, ctx.repo, "add", "-A");
  git(ctx, ctx.repo, "commit", "-q", "-m", "fixture");
  const key = join(ctx.keys, "maintainer");
  const k = spawnSync(TOOLS["ssh-keygen"], ["-q", "-t", "ed25519", "-N", "", "-f", key, "-C", "test"], { encoding: "utf8" });
  assert.equal(k.status, 0, `ssh-keygen failed: ${k.stderr}`);
  ctx.signers = join(ctx.keys, "company.signers");
  writeFileSync(ctx.signers, `release-maintainer namespaces="git" ${readFileSync(`${key}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ")}\n`);
  expectCode(cli(ctx, ["trust", "add", "--company", "acme", "--signers", ctx.signers, "--apply"]), 0, "trust add");
  expectCode(cli(ctx, ["release", "create", "--version", "1.0.0", "--repo", ctx.repo, "--apply"]), 0, "release create");
  git(ctx, ctx.repo, "add", "releases/1.0.0.json");
  git(ctx, ctx.repo, "commit", "-q", "-m", "release 1.0.0 manifest");
  git(ctx, ctx.repo, "config", "gpg.format", "ssh");
  git(ctx, ctx.repo, "config", "user.signingkey", key);
  expectCode(cli(ctx, ["release", "sign", "1.0.0", "--repo", ctx.repo, "--apply"]), 0, "release sign");
  git(ctx, ctx.repo, "commit", "-q", "--allow-empty", "-m", "work after the release");
}

// Claude Code's records as the stub keeps them: a marketplace from source, and every plugin installed at user scope.
function machineWith(ctx, source, { installs = PLUGINS } = {}) {
  writeJson(join(ctx.claudeHome, "plugins", "known_marketplaces.json"), { [MARKET]: { source, installLocation: ctx.repo, lastUpdated: "t" } });
  const record = (p) => [{ scope: "user", installPath: join(ctx.claudeHome, "plugins", "cache", MARKET, p, "0.0.1"), version: "0.0.1" }];
  const plugins = Object.fromEntries(installs.map((p) => [`${p}@${MARKET}`, record(p)]));
  writeJson(join(ctx.claudeHome, "plugins", "installed_plugins.json"), { version: 2, plugins });
}

const calls = (ctx) => (existsSync(ctx.log) ? readFileSync(ctx.log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const commands = (ctx) => calls(ctx).map((c) => c.args.join(" "));
const known = (ctx) => JSON.parse(readFileSync(join(ctx.claudeHome, "plugins", "known_marketplaces.json"), "utf8"))[MARKET];
const pinRecord = (ctx) => join(ctx.repo, ".git", "skilliton-pin.json");
const inside = (child, parent) => { const r = relative(parent, child); return r === "" || (!r.startsWith("..") && !r.startsWith("/")); };
const updates = PLUGINS.map((p) => `plugin update ${p}@${MARKET}`);
const pinApply = (ctx) => ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--claude", ctx.stub, "--apply"];

// Every stub call ran from a folder of its own: not the project, not inside it or the clone, and gone afterwards.
function assertNeutral(ctx) {
  const list = calls(ctx);
  assert.ok(list.length > 0, "the stub was called");
  for (const c of list) {
    assert.ok(!inside(c.cwd, ctx.project), `${c.args.join(" ")} ran inside the project folder ${c.cwd}`);
    assert.ok(!inside(c.cwd, ctx.repo), `${c.args.join(" ")} ran inside the clone ${c.cwd}`);
    assert.match(c.cwd, /skilliton-client-/, `${c.args.join(" ")} ran from ${c.cwd}, not a neutral folder`);
    assert.equal(existsSync(c.cwd), false, `the neutral folder ${c.cwd} was left behind`);
  }
  assert.equal(readFileSync(join(ctx.project, ".claude", "settings.json"), "utf8"), ctx.projectSettings, "the project's settings changed");
}

// ---------------------------------------------------------------- pin

test("pin: the preview shows the client commands, runs no client and writes nothing", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  const before = readFileSync(join(ctx.claudeHome, "plugins", "known_marketplaces.json"), "utf8");
  const head = git(ctx, ctx.repo, "rev-parse", "HEAD");
  const r = expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--claude", ctx.stub]), 0, "preview");
  assert.match(r.out, new RegExp(`plugin marketplace remove ${MARKET}\\n`));
  assert.match(r.out, new RegExp(`plugin marketplace add acme/skills#${TAG}\\n`));
  for (const u of updates) assert.ok(r.out.includes(u), `the preview names ${u}`);
  assert.match(r.out, /a tag, not a commit/);
  assert.deepEqual(calls(ctx), [], "a preview runs no client at all");
  assert.equal(readFileSync(join(ctx.claudeHome, "plugins", "known_marketplaces.json"), "utf8"), before);
  assert.equal(git(ctx, ctx.repo, "rev-parse", "HEAD"), head, "a preview does not move the clone");
  assert.equal(existsSync(pinRecord(ctx)), false, "a preview writes no pin record");
  assert.equal(readFileSync(join(ctx.project, ".claude", "settings.json"), "utf8"), ctx.projectSettings);
});

test("pin --apply moves a GitHub marketplace: remove, add at the tag, read back, then update, never from the project", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  const r = expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--claude", ctx.stub, "--apply"]), 0, "apply");
  assert.deepEqual(commands(ctx), [
    "plugin marketplace list --json", `plugin marketplace remove ${MARKET}`, `plugin marketplace add acme/skills#${TAG}`,
    "plugin marketplace list --json", ...updates,
  ]);
  assertNeutral(ctx);
  assert.equal(known(ctx).source.ref, TAG);
  assert.ok(existsSync(pinRecord(ctx)), "the clone is pinned too");
  assert.match(r.out, new RegExp(`Done: Claude Code's marketplace ${MARKET} is at ${TAG}`));
  assert.match(r.out, /verify reads the installed plugins against the signed manifest/);
});

test("pin on its own, once the clone and the marketplace are on the newest approved release, says so and gives no Next", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  const status = ["pin", "--repo", ctx.repo, "--claude", ctx.stub];
  const before = expectCode(cli(ctx, status), 0, "status before");
  assert.match(before.out, /^Next: skilliton pin --release 1\.0\.0 --apply$/m);
  expectCode(cli(ctx, pinApply(ctx)), 0, "apply");
  const after = expectCode(cli(ctx, status), 0, "status after");
  assert.match(after.out, /^already on the newest approved release \(1\.0\.0\)$/m);
  assert.doesNotMatch(after.out, /^Next:/m, "no Next line suggests the pin it is already on");
});

test("pin --apply moves a git marketplace to <url>#<tag>", (t) => {
  const ctx = fixture(t);
  const url = "https://example.invalid/acme/skills.git";
  machineWith(ctx, { source: "git", url });
  expectCode(cli(ctx, ["pin", "--latest", "--repo", ctx.repo, "--claude", ctx.stub, "--apply"]), 0, "apply");
  assert.deepEqual(commands(ctx).slice(0, 3), [
    "plugin marketplace list --json", `plugin marketplace remove ${MARKET}`, `plugin marketplace add ${url}#${TAG}`,
  ]);
  assertNeutral(ctx);
  assert.deepEqual([known(ctx).source.url, known(ctx).source.ref], [url, TAG]);
});

test("pin --apply fails loudly when the client reports another ref after the add", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  const r = expectCode(cli(ctx, pinApply(ctx), { env: { STUB_REPORT_REF: "main" } }), 3, "ref check");
  assert.match(r.out, new RegExp(`FAILED: after .*plugin marketplace add acme/skills#${TAG}, the client reports the ref main, not ${TAG}`));
  assert.equal(commands(ctx).filter((c) => c.startsWith("plugin update")).length, 0, "nothing is updated from a marketplace that did not land on the tag");
  assert.doesNotMatch(r.out, /Done: Claude Code/);
  assertNeutral(ctx);
});

test("pin --apply adds the marketplace back without the ref when the client refuses the tag form", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  const r = expectCode(cli(ctx, pinApply(ctx), { env: { STUB_REFUSE_REF: "1" } }), 3, "refused ref");
  assert.deepEqual(commands(ctx).slice(1), [
    `plugin marketplace remove ${MARKET}`, `plugin marketplace add acme/skills#${TAG}`, "plugin marketplace add acme/skills",
  ]);
  assert.match(r.out, /NOT PINNED: .*plugin marketplace add acme\/skills#skilliton-release\/1\.0\.0 failed/);
  assert.match(r.out, /added back without the ref/);
  assert.equal(known(ctx).source.ref, undefined);
  assertNeutral(ctx);
});

test("pin --apply installs again a plugin the remove took away, and updates the rest", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  expectCode(cli(ctx, pinApply(ctx), { env: { STUB_REMOVE_UNINSTALLS: "1" } }), 0, "apply");
  assert.deepEqual(commands(ctx).slice(4), PLUGINS.map((p) => `plugin install ${p}@${MARKET}`));
  assertNeutral(ctx);
});

test("pin: a marketplace added from a folder is named as not pinnable, and the clone is still pinned", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "directory", path: ctx.repo });
  const r = expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--claude", ctx.stub, "--apply"]), 1, "folder");
  assert.match(r.out, /is from the folder .*, which is not a git source, so it cannot be pinned/);
  assert.match(r.out, /NOT PINNED: the marketplace was not moved \(it is not a git source\)/);
  assert.ok(existsSync(pinRecord(ctx)), "the clone pin is still done");
  assert.deepEqual(calls(ctx), [], "nothing is run for a folder marketplace");
});

test("pin: with no client found, the clone is pinned and the exact commands are printed", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills" });
  const r = expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--apply"]), 1, "no client");
  assert.ok(existsSync(pinRecord(ctx)), "the clone is pinned");
  assert.match(r.out, /NOT PINNED: Claude Code was not found on PATH/);
  assert.match(r.out, /from an empty folder that is not a project/);
  for (const line of [`claude plugin marketplace remove ${MARKET}`, `claude plugin marketplace add acme/skills#${TAG}`, ...updates.map((u) => `claude ${u}`)]) {
    assert.ok(r.out.includes(`  ${line}\n`), `the output names ${line}`);
  }
  assert.deepEqual(calls(ctx), []);
});

test("pin: a marketplace already at the tag, with the clone pinned, has nothing to do", (t) => {
  const ctx = fixture(t);
  machineWith(ctx, { source: "github", repo: "acme/skills", ref: TAG });
  expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--apply"]), 0, "clone pin");
  const r = expectCode(cli(ctx, ["pin", "--release", "1.0.0", "--repo", ctx.repo, "--claude", ctx.stub, "--apply"]), 0, "again");
  assert.match(r.out, new RegExp(`already at ${TAG}`));
  assert.match(r.out, /Already pinned there; nothing to do/);
  assert.deepEqual(calls(ctx), []);
});

// ---------------------------------------------------------------- join

const joinArgs = (ctx, ...extra) => [
  "join", "--company", "acme", "--signers", ctx.signers, "--client", "claude-code", "--claude", ctx.stub, "--no-launcher", "--repo", ctx.repo, ...extra,
];

test("join with a release adds the marketplace at that release's tag, from a neutral folder", (t) => {
  const ctx = fixture(t);
  const preview = expectCode(cli(ctx, joinArgs(ctx)), 0, "join preview");
  assert.match(preview.out, new RegExp(`marketplace: ${MARKET} from GitHub acme/skills, added to Claude Code at the release tag ${TAG}`));
  assert.deepEqual(calls(ctx), [], "a join preview runs no client");
  const r = cli(ctx, joinArgs(ctx, "--apply"));
  assert.equal(commands(ctx)[0], `plugin marketplace add acme/skills#${TAG}`, r.all);
  assert.deepEqual(commands(ctx).slice(1), PLUGINS.map((p) => `plugin install ${p}@${MARKET}`));
  assertNeutral(ctx);
  assert.equal(known(ctx).source.ref, TAG);
  assert.match(r.out, new RegExp(`added marketplace ${MARKET} \\(GitHub acme/skills at ${TAG}\\)`));
  assert.doesNotMatch(r.out, /NOT PINNED/);
  assert.equal(r.code, 0, `a pinned join with every plugin VERIFIED exits 0: ${r.all}`);
});

test("join without a release adds the marketplace with no ref", (t) => {
  const ctx = fixture(t);
  cli(ctx, joinArgs(ctx, "--no-pin", "--apply"));
  assert.equal(commands(ctx)[0], "plugin marketplace add acme/skills");
  assertNeutral(ctx);
  assert.equal(known(ctx).source.ref, undefined);
});

test("join reports NOT PINNED with the exact command when the client refuses the tag form, carries on, and exits 1", (t) => {
  const ctx = fixture(t);
  const r = expectCode(cli(ctx, joinArgs(ctx, "--apply"), { env: { STUB_REFUSE_REF: "1" } }), 1, "refused ref");
  assert.deepEqual(commands(ctx).slice(0, 2), [`plugin marketplace add acme/skills#${TAG}`, "plugin marketplace add acme/skills"]);
  assert.deepEqual(commands(ctx).slice(2), PLUGINS.map((p) => `plugin install ${p}@${MARKET}`), "join carries on");
  assert.match(r.out, new RegExp(`NOT PINNED: Claude Code refused .*plugin marketplace add acme/skills#${TAG}`));
  assert.match(r.out, /skilliton pin --release 1\.0\.0 --apply/);
  assertNeutral(ctx);
});
