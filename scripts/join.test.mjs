#!/usr/bin/env node
// join.test.mjs: `skilliton join` and `join --undo` (packs/base/plugins/workflow/runtime/lib/join.mjs), and verify's
// default source from a join receipt.
//
// Each test builds a company skills repository clone in a temporary folder (the real workflow and guardrails plugins,
// a catalog named acme-skills, a team template enabling both) and a throwaway release signers file. Claude Code and
// Codex are replaced by scripts/fixtures/clients/standin.mjs, which acts out the files each client was measured to
// write and logs every call. PATH holds only the stand-ins, node, git and ssh-keygen, and every home, trust, receipt and
// launcher folder is inside the temporary folder, so nothing on the machine running the tests is read or changed. The
// clone has no signed release, so verify ends each successful join with UNKNOWN VERSION (exit 1); the machine
// rehearsal (scripts/rehearsals/machine.mjs) covers a signed release on the real clients.
//
//   node --test scripts/join.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const STANDIN = join(here, "fixtures", "clients", "standin.mjs");
const MARKET = "acme-skills";
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };

const toolPath = (name) => {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${name} is needed by this test and was not found on PATH`);
  return r.stdout.trim();
};
const TOOLS = { node: process.execPath, git: toolPath("git"), "ssh-keygen": toolPath("ssh-keygen") };

function fixture(t, { clients = ["claude", "codex"] } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-join-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = {
    base, repo: join(base, "company-skills"), tools: join(base, "tools"), keys: join(base, "keys"),
    home: join(base, "home"), claude: join(base, "claude-config"), codex: join(base, "codex-home"),
    trust: join(base, "trust"), joined: join(base, "joined"), bin: join(base, "launcher-bin"), backups: join(base, "backups"), log: join(base, "clients.log"),
  };
  for (const d of [ctx.tools, ctx.keys, ctx.home]) mkdirSync(d, { recursive: true });
  for (const [name, target] of Object.entries(TOOLS)) symlinkSync(target, join(ctx.tools, name));
  for (const client of clients) {
    writeFileSync(join(ctx.tools, client), `#!/bin/sh\nexec node ${JSON.stringify(STANDIN)} ${client} "$@"\n`);
    chmodSync(join(ctx.tools, client), 0o755);
  }

  for (const plugin of ["workflow", "guardrails"]) cpSync(join(ROOT, "packs", "base", "plugins", plugin), join(ctx.repo, "packs", "base", "plugins", plugin), { recursive: true });
  mkdirSync(join(ctx.repo, "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "skilliton.mjs"), join(ctx.repo, "scripts", "skilliton.mjs"));
  writeJson(join(ctx.repo, ".claude-plugin", "marketplace.json"), {
    name: MARKET, owner: { name: "acme" },
    plugins: ["workflow", "guardrails"].map((name) => ({ name, source: `./packs/base/plugins/${name}`, description: name, license: "MIT" })),
  });
  writeJson(join(ctx.repo, "templates", "project-settings.json"), {
    extraKnownMarketplaces: { [MARKET]: { source: { source: "github", repo: "acme/skills" }, autoUpdate: true } },
    enabledPlugins: { [`workflow@${MARKET}`]: true, [`guardrails@${MARKET}`]: true },
  });
  gitIn(ctx, ctx.repo, "init", "-q", "-b", "main");
  gitIn(ctx, ctx.repo, "add", "-A");
  gitIn(ctx, ctx.repo, "commit", "-q", "-m", "company skills");

  execFileSync(TOOLS["ssh-keygen"], ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(ctx.keys, "approver")]);
  const pub = readFileSync(join(ctx.keys, "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
  ctx.signers = join(ctx.keys, "allowed_signers");
  writeFileSync(ctx.signers, `approver@example.invalid namespaces="git" ${pub}\n`);
  return ctx;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function envOf(ctx, extra = {}) {
  return {
    ...GIT_ENV, PATH: ctx.tools, HOME: ctx.home, LANG: "C.UTF-8", SKILLITON_SELF: "skilliton",
    CLAUDE_CONFIG_DIR: ctx.claude, CODEX_HOME: ctx.codex, SKILLITON_TRUST_DIR: ctx.trust, SKILLITON_JOIN_DIR: ctx.joined,
    SKILLITON_BACKUPS: ctx.backups, STANDIN_LOG: ctx.log, ...extra,
  };
}

const gitIn = (ctx, dir, ...args) => execFileSync(TOOLS.git, ["-C", dir, ...args], { env: { ...GIT_ENV, PATH: dirname(TOOLS.git), HOME: ctx.home }, encoding: "utf8" });

function sg(ctx, args, { cli = join(ctx.repo, "scripts", "skilliton.mjs"), env = {} } = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: ctx.base, env: envOf(ctx, env), encoding: "utf8" });
  return { code: r.status, out: r.stdout, all: `${r.stdout}${r.stderr}` };
}

const joinArgs = (ctx, ...extra) => ["join", "--company", "acme", "--signers", ctx.signers, "--marketplace", ctx.repo, "--bin-dir", ctx.bin, ...extra];
// Every command the stand-in clients received, in order.
const calls = (ctx) => (existsSync(ctx.log) ? readFileSync(ctx.log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [])
  .map((c) => `${c.client} ${c.args.filter((a) => a !== "--json").join(" ")}`);
const receipt = (ctx) => JSON.parse(readFileSync(join(ctx.joined, "acme.json"), "utf8"));
const claudePlugins = (ctx) => Object.keys(JSON.parse(readFileSync(join(ctx.claude, "plugins", "installed_plugins.json"), "utf8")).plugins).sort();
const codexCache = (ctx) => (existsSync(join(ctx.codex, "plugins", "cache", MARKET)) ? readdirSync(join(ctx.codex, "plugins", "cache", MARKET)).sort() : []);

// Every file under the machine-side folders with its size and content: equal snapshots mean nothing was written.
function snapshot(ctx) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { out.push(`${p}/`); walk(p); } else out.push(`${p} ${(st.mode & 0o777).toString(8)} ${readFileSync(p, "utf8")}`);
    }
  };
  for (const d of [ctx.claude, ctx.codex, ctx.trust, ctx.joined, ctx.bin]) walk(d);
  return out.join("\n");
}

test("the preview names every change and writes nothing", (t) => {
  const ctx = fixture(t);
  const r = sg(ctx, joinArgs(ctx));
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /skilliton join \(preview; nothing written\)/);
  assert.match(r.out, /will add\s+marketplace acme-skills/);
  assert.match(r.out, /will add\s+plugin workflow@acme-skills/);
  assert.match(r.out, /will add\s+the home folder .*codex-home, which Codex needs to exist/);
  assert.match(r.out, /is not on PATH\. To use skilliton in new terminals/);
  assert.match(r.out, /has no release tags yet/);
  assert.deepEqual(calls(ctx), [], "a preview runs no client at all");
  assert.equal(snapshot(ctx), "", "nothing exists under the machine folders");
});

test("apply sets up both clients, the signers and the launcher, records each step, and runs verify", (t) => {
  const ctx = fixture(t);
  const r = sg(ctx, [...joinArgs(ctx), "--apply"]);
  assert.equal(r.code, 1, `verify cannot approve without a signed release: ${r.all}`);
  assert.deepEqual(calls(ctx), [
    `claude plugin marketplace add ${ctx.repo}`, `claude plugin install workflow@${MARKET}`, `claude plugin install guardrails@${MARKET}`,
    `codex plugin marketplace add ${ctx.repo}`, `codex plugin add workflow@${MARKET}`, `codex plugin add guardrails@${MARKET}`,
  ]);
  assert.deepEqual(claudePlugins(ctx), [`guardrails@${MARKET}`, `workflow@${MARKET}`]);
  assert.deepEqual(codexCache(ctx), ["guardrails", "workflow"]);
  assert.equal(readFileSync(join(ctx.trust, "acme.allowed_signers"), "utf8"), readFileSync(ctx.signers, "utf8"));
  assert.match(r.out, /verify, Claude Code: .*\n {2}UNKNOWN VERSION/);
  assert.match(r.out, /verify, Codex: .*\n {2}UNKNOWN VERSION/);

  const rec = receipt(ctx);
  assert.equal(rec.schema, "skilliton.join/1");
  assert.equal(rec.source, ctx.repo);
  assert.deepEqual(rec.marketplace, { name: MARKET, kind: "directory", location: ctx.repo });
  assert.deepEqual(rec.clients["claude-code"], { home: ctx.claude, marketplaceAdded: true, installed: ["workflow", "guardrails"] });
  assert.deepEqual(rec.clients.codex, { home: ctx.codex, marketplaceAdded: true, installed: ["workflow", "guardrails"], createdHome: true }, "Codex needs its home to exist, so join created it");
  assert.equal(rec.trust.path, join(ctx.trust, "acme.allowed_signers"));
  assert.equal(rec.launcher.path, join(ctx.bin, "skilliton"));
  assert.equal(rec.launcher.createdFolder, true);
  assert.equal(statSync(join(ctx.base, "joined", "acme.json")).mode & 0o777, 0o600, "the receipt is private to the user");

  const launcher = spawnSync(join(ctx.bin, "skilliton"), ["--version"], { env: envOf(ctx), encoding: "utf8" });
  assert.equal(launcher.status, 0, launcher.stderr);
  assert.match(launcher.stdout, /^skilliton runtime \d+\.\d+\.\d+/);
});

test("a repeat changes nothing, and verify still runs", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, [...joinArgs(ctx), "--apply"]).code, 1);
  const before = snapshot(ctx);
  const callsBefore = calls(ctx).length;
  const r = sg(ctx, [...joinArgs(ctx), "--apply"]);
  assert.equal(r.code, 1, r.all);
  assert.doesNotMatch(r.out, /will add/);
  assert.match(r.out, /verify, Codex:/);
  assert.equal(calls(ctx).length, callsBefore, "no client command runs");
  assert.equal(snapshot(ctx), before, "no file changes, including the receipt");
});

test("what was there before is left in place, recorded as not added, and kept by undo", (t) => {
  const ctx = fixture(t);
  const env = envOf(ctx);
  for (const args of [["plugin", "marketplace", "add", ctx.repo], ["plugin", "install", `guardrails@${MARKET}`]]) {
    assert.equal(spawnSync(join(ctx.tools, "claude"), args, { env, encoding: "utf8" }).status, 0);
  }
  writeFileSync(ctx.log, "");
  const r = sg(ctx, [...joinArgs(ctx), "--client", "claude-code", "--apply"]);
  assert.equal(r.code, 1, r.all);
  assert.deepEqual(calls(ctx), [`claude plugin install workflow@${MARKET}`]);
  assert.deepEqual(receipt(ctx).clients, { "claude-code": { home: ctx.claude, marketplaceAdded: false, installed: ["workflow"] } });

  const undo = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
  assert.equal(undo.code, 0, undo.all);
  assert.deepEqual(claudePlugins(ctx), [`guardrails@${MARKET}`]);
  assert.ok(JSON.parse(readFileSync(join(ctx.claude, "plugins", "known_marketplaces.json"), "utf8"))[MARKET], "the marketplace added by hand stays");
});

test("undo previews, then removes everything join added, keeping backups of the signers and the receipt", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, [...joinArgs(ctx), "--apply"]).code, 1);
  const before = snapshot(ctx);
  const preview = sg(ctx, ["join", "--undo", "--company", "acme"]);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /will uninstall workflow@acme-skills/);
  assert.equal(snapshot(ctx), before, "the undo preview writes nothing");

  writeFileSync(ctx.log, "");
  const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(calls(ctx), [
    `claude plugin uninstall workflow@${MARKET}`, `claude plugin uninstall guardrails@${MARKET}`, `claude plugin marketplace remove ${MARKET}`,
    `codex plugin remove workflow@${MARKET}`, `codex plugin remove guardrails@${MARKET}`, `codex plugin marketplace remove ${MARKET}`,
  ]);
  assert.deepEqual(claudePlugins(ctx), []);
  assert.deepEqual(codexCache(ctx), []);
  for (const gone of [join(ctx.trust, "acme.allowed_signers"), ctx.bin, join(ctx.joined, "acme.json")]) assert.equal(existsSync(gone), false, `${gone} is removed`);
  const backups = readdirSync(join(ctx.backups, "join-undo"));
  assert.equal(backups.length, 1);
  assert.deepEqual(readdirSync(join(ctx.backups, "join-undo", backups[0])).sort(), ["acme.allowed_signers", "acme.json"]);
});

test("undo keeps a launcher or signers file changed after join, and says so", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, [...joinArgs(ctx), "--apply"]).code, 1);
  writeFileSync(join(ctx.bin, "skilliton"), "#!/bin/sh\necho mine\n");
  writeFileSync(join(ctx.trust, "acme.allowed_signers"), readFileSync(ctx.signers, "utf8").replace("approver@", "changed@"));
  const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /Kept:\n.*acme\.allowed_signers, because it changed after join/);
  assert.match(r.out, /launcher-bin\/skilliton, because it changed after join/);
  assert.equal(readFileSync(join(ctx.bin, "skilliton"), "utf8"), "#!/bin/sh\necho mine\n");
});

test("a launcher that is not this company's is never overwritten", (t) => {
  const ctx = fixture(t);
  mkdirSync(ctx.bin, { recursive: true });
  writeFileSync(join(ctx.bin, "skilliton"), "#!/bin/sh\necho someone else\n");
  const r = sg(ctx, [...joinArgs(ctx), "--apply"]);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /not written: .*skilliton already exists and is not this company's launcher/);
  assert.equal(readFileSync(join(ctx.bin, "skilliton"), "utf8"), "#!/bin/sh\necho someone else\n");
  assert.equal(receipt(ctx).launcher, null);
});

test("a client command that fails part way exits 3 with an accurate receipt, and undo cleans up", (t) => {
  const ctx = fixture(t);
  const r = sg(ctx, [...joinArgs(ctx), "--apply"], { env: { STANDIN_FAIL: "install guardrails" } });
  assert.equal(r.code, 3, r.all);
  assert.match(r.out, /FAILED: claude plugin install guardrails@acme-skills: exit 1/);
  const rec = receipt(ctx);
  assert.deepEqual(rec.clients["claude-code"], { home: ctx.claude, marketplaceAdded: true, installed: ["workflow"] });
  assert.equal(rec.clients.codex, undefined, "Codex was not reached");
  assert.equal(rec.launcher, null);
  const undo = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
  assert.equal(undo.code, 0, undo.all);
  assert.deepEqual(claudePlugins(ctx), []);
  assert.equal(existsSync(join(ctx.joined, "acme.json")), false);
});

test("verify from an installed copy finds its source in the join receipt", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, [...joinArgs(ctx), "--apply"]).code, 1);
  const installed = JSON.parse(readFileSync(join(ctx.claude, "plugins", "installed_plugins.json"), "utf8")).plugins[`workflow@${MARKET}`][0].installPath;
  const cli = join(installed, "runtime", "skilliton.mjs");
  const r = sg(ctx, ["verify", "--client", "codex", "--json"], { cli });
  const report = JSON.parse(r.out);
  assert.equal(report.details.source, ctx.repo, r.all);
  assert.equal(r.code, 1, "installed, not approved");

  const second = join(ctx.joined, "other.json");
  writeFileSync(second, readFileSync(join(ctx.joined, "acme.json"), "utf8").replace('"company": "acme"', '"company": "other"'));
  const ambiguous = sg(ctx, ["verify", "--client", "codex"], { cli });
  assert.equal(ambiguous.code, 2, "with two receipts and no --company, verify asks for --source");
  assert.match(ambiguous.all, /verify needs --source .*several companies joined this machine \(acme, other\); pass --company <name>/);
  const named = sg(ctx, ["verify", "--client", "codex", "--company", "acme", "--json"], { cli });
  assert.equal(JSON.parse(named.out).details.source, ctx.repo, named.all);
});

test("refusals happen before anything is written", async (t) => {
  // Each case prepares one fixture and returns the command to run and the refusal it must print.
  const cases = [
    { label: "a shallow clone", setup: (ctx) => {
      const shallow = join(ctx.base, "shallow");
      execFileSync(TOOLS.git, ["clone", "-q", "--depth", "1", `file://${ctx.repo}`, shallow], { env: { ...GIT_ENV, PATH: dirname(TOOLS.git), HOME: ctx.home } });
      return { args: [...joinArgs(ctx), "--repo", shallow, "--apply"], expect: /shallow clone/ };
    } },
    { label: "a catalog and template that name different marketplaces", setup: (ctx) => {
      writeJson(join(ctx.repo, "templates", "project-settings.json"), { extraKnownMarketplaces: { other: { source: { source: "github", repo: "acme/skills" } } }, enabledPlugins: {} });
      return { args: [...joinArgs(ctx), "--apply"], expect: /names the marketplace "acme-skills", but templates\/project-settings\.json names "other"/ };
    } },
    { label: "a marketplace of the same name from another source", setup: (ctx) => {
      writeJson(join(ctx.claude, "plugins", "known_marketplaces.json"), { [MARKET]: { source: { source: "github", repo: "someone/else" } } });
      return { args: [...joinArgs(ctx), "--apply"], expect: /Claude Code already has a marketplace named acme-skills from github someone\/else/ };
    } },
    { label: "a different signers file already trusted", setup: (ctx) => {
      mkdirSync(ctx.trust, { recursive: true });
      writeFileSync(join(ctx.trust, "acme.allowed_signers"), readFileSync(ctx.signers, "utf8").replace("approver@", "other@"));
      return { args: [...joinArgs(ctx), "--apply"], expect: /already trusted with a different signers file/ };
    } },
    { label: "a plugin list without workflow", setup: (ctx) => ({ args: [...joinArgs(ctx), "--plugins", "guardrails", "--apply"], expect: /do not include workflow/ }) },
    { label: "a plugin the catalog does not list", setup: (ctx) => ({ args: [...joinArgs(ctx), "--plugins", "workflow,nope", "--apply"], expect: /does not list nope/ }) },
    { label: "a client that is not installed", clients: ["claude"], setup: (ctx) => ({ args: [...joinArgs(ctx), "--client", "codex", "--apply"], expect: /Codex was not found on PATH/ }) },
    { label: "a URL as the marketplace", setup: (ctx) => ({ args: ["join", "--company", "acme", "--signers", ctx.signers, "--marketplace", "https://example.invalid/acme.git", "--apply"], expect: /must be a GitHub owner\/repo or an existing folder/ }) },
    { label: "undo with nothing to undo", setup: () => ({ args: ["join", "--undo", "--company", "acme", "--apply"], expect: /has not joined this machine/ }) },
  ];
  for (const { label, clients, setup } of cases) {
    await t.test(label, (tt) => {
      const ctx = fixture(tt, clients ? { clients } : {});
      const { args, expect } = setup(ctx);
      const before = snapshot(ctx);
      const r = sg(ctx, args);
      assert.equal(r.code, 2, `${label}: ${r.all}`);
      assert.match(r.all, expect);
      assert.equal(snapshot(ctx), before, `${label}: nothing written`);
      assert.deepEqual(calls(ctx), [], `${label}: no client command`);
    });
  }
});

// Regressions from the security-first review of 2026-09-16: each case reproduces a finding and shows it now holds.
test("undo treats the receipt as untrusted and deletes nothing it does not own", async (t) => {
  const joined = (tt) => {
    const ctx = fixture(tt);
    assert.equal(sg(ctx, [...joinArgs(ctx), "--apply"]).code, 1);
    return ctx;
  };
  const rewrite = (ctx, change) => {
    const rec = receipt(ctx);
    change(rec);
    writeFileSync(join(ctx.joined, "acme.json"), `${JSON.stringify(rec, null, 2)}\n`);
  };

  await t.test("a launcher path pointing at another file is refused, and the file is kept", (tt) => {
    const ctx = joined(tt);
    const victim = join(ctx.base, "victim.txt");
    writeFileSync(victim, "keep me\n");
    rewrite(ctx, (rec) => { rec.launcher.path = victim; });
    const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
    assert.equal(r.code, 2, r.all);
    assert.match(r.all, /not a valid join receipt .*launcher/);
    assert.equal(readFileSync(victim, "utf8"), "keep me\n");
  });

  await t.test("a launcher path to a different file named skilliton is kept, because its text is not join's", (tt) => {
    const ctx = joined(tt);
    const other = join(ctx.base, "elsewhere", "skilliton");
    mkdirSync(dirname(other), { recursive: true });
    writeFileSync(other, "#!/bin/sh\necho mine\n");
    rewrite(ctx, (rec) => { rec.launcher.path = other; });
    const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
    assert.equal(r.code, 1, r.all);
    assert.equal(readFileSync(other, "utf8"), "#!/bin/sh\necho mine\n");
  });

  await t.test("a signers path outside the company's trust file is refused, and the file is kept", (tt) => {
    const ctx = joined(tt);
    const elsewhere = join(ctx.base, "elsewhere", "acme.allowed_signers");
    mkdirSync(dirname(elsewhere), { recursive: true });
    cpSync(join(ctx.trust, "acme.allowed_signers"), elsewhere);
    rewrite(ctx, (rec) => { rec.trust.path = elsewhere; });
    const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
    assert.equal(r.code, 2, r.all);
    assert.match(r.all, /company acme's trust file is/);
    assert.ok(existsSync(elsewhere));
  });

  for (const [label, change] of [
    ["an empty trust object", (rec) => { rec.trust = {}; }],
    ["an inherited client name", (rec) => { rec.clients = JSON.parse('{"__proto__": {"home": "/x", "marketplaceAdded": false, "installed": []}}'); }],
    ["a plugin name shaped like an option", (rec) => { rec.clients.codex.installed.push("--scope=project"); }],
  ]) {
    await t.test(`${label} is refused, not crashed on`, (tt) => {
      const ctx = joined(tt);
      rewrite(ctx, change);
      const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
      assert.equal(r.code, 2, r.all);
      assert.match(r.all, /not a valid join receipt/);
    });
  }
});

test("join refuses client state it cannot read, instead of treating a marketplace as absent", async (t) => {
  const cases = [
    { label: "known_marketplaces.json that is not valid JSON", setup: (ctx) => { mkdirSync(join(ctx.claude, "plugins"), { recursive: true }); writeFileSync(join(ctx.claude, "plugins", "known_marketplaces.json"), "{"); }, expect: /known_marketplaces\.json is not valid JSON/ },
    { label: "known_marketplaces.json that is a symbolic link", setup: (ctx) => {
      mkdirSync(join(ctx.claude, "plugins"), { recursive: true });
      writeJson(join(ctx.base, "elsewhere.json"), { [MARKET]: { source: { source: "github", repo: "someone/else" } } });
      symlinkSync(join(ctx.base, "elsewhere.json"), join(ctx.claude, "plugins", "known_marketplaces.json"));
    }, expect: /known_marketplaces\.json is not a regular file/ },
    { label: "a Codex marketplaces table in another form", setup: (ctx) => { mkdirSync(ctx.codex, { recursive: true }); writeFileSync(join(ctx.codex, "config.toml"), `[ marketplaces.${MARKET} ]\nsource_type = "git"\nsource = "https://github.com/someone/else.git"\n`); }, expect: /config\.toml line 1 declares a marketplaces table in another form/ },
    { label: "a Codex marketplace set with a dotted key", setup: (ctx) => { mkdirSync(ctx.codex, { recursive: true }); writeFileSync(join(ctx.codex, "config.toml"), `marketplaces.${MARKET}.source = "x"\n`); }, expect: /sets marketplaces with a dotted key/ },
    { label: "a marketplace folder whose catalog has another name", setup: (ctx) => {
      const other = join(ctx.base, "upstream");
      cpSync(ctx.repo, other, { recursive: true });
      writeJson(join(other, ".claude-plugin", "marketplace.json"), { ...JSON.parse(readFileSync(join(ctx.repo, ".claude-plugin", "marketplace.json"), "utf8")), name: "upstream" });
      return ["--marketplace", other];
    }, expect: /is named "upstream", but this clone's catalog names "acme-skills"/ },
    { label: "a template repository shaped like an option", setup: (ctx) => {
      writeJson(join(ctx.repo, "templates", "project-settings.json"), { extraKnownMarketplaces: { [MARKET]: { source: { source: "github", repo: "-x/y" } } }, enabledPlugins: { [`workflow@${MARKET}`]: true } });
      return ["--no-marketplace-flag"];
    }, expect: /the repository in templates\/project-settings\.json must look like owner\/repo/ },
  ];
  for (const { label, setup, expect } of cases) {
    await t.test(label, (tt) => {
      const ctx = fixture(tt);
      const extra = setup(ctx) ?? [];
      const args = extra[0] === "--no-marketplace-flag"
        ? ["join", "--company", "acme", "--signers", ctx.signers, "--bin-dir", ctx.bin, "--apply"]
        : [...joinArgs(ctx).filter((a, i, all) => !(extra[0] === "--marketplace" && (a === "--marketplace" || all[i - 1] === "--marketplace"))), ...extra, "--apply"];
      const before = snapshot(ctx);
      const r = sg(ctx, args);
      assert.equal(r.code, 2, r.all);
      assert.match(r.all, expect);
      assert.equal(snapshot(ctx), before);
      assert.deepEqual(calls(ctx), []);
    });
  }
});

test("undo keeps a marketplace that now points elsewhere, and join counts only user-scope installs as present", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, [...joinArgs(ctx), "--client", "claude-code", "--apply"]).code, 1);
  const knownPath = join(ctx.claude, "plugins", "known_marketplaces.json");
  writeJson(knownPath, { [MARKET]: { source: { source: "github", repo: "me/my-fork" } } });
  const r = sg(ctx, ["join", "--undo", "--company", "acme", "--apply"]);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /Kept:\n.*marketplace acme-skills, because it now comes from github me\/my-fork/);
  assert.equal(calls(ctx).filter((c) => c.includes("marketplace remove")).length, 0);

  const scoped = fixture(t);
  writeJson(join(scoped.claude, "plugins", "installed_plugins.json"), { version: 2, plugins: { [`workflow@${MARKET}`]: [{ scope: "project", installPath: join(scoped.base, "project-install"), version: "0.5.0" }] } });
  const preview = sg(scoped, [...joinArgs(scoped), "--client", "claude-code"]);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /will add\s+plugin workflow@acme-skills/);
});

test("joining again with other folders, or from a moved clone, is refused with the way forward", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, [...joinArgs(ctx), "--apply"]).code, 1);
  const otherBin = sg(ctx, ["join", "--company", "acme", "--signers", ctx.signers, "--marketplace", ctx.repo, "--bin-dir", join(ctx.base, "other-bin"), "--apply"]);
  assert.equal(otherBin.code, 2, otherBin.all);
  assert.match(otherBin.all, /wrote its terminal command at .*launcher-bin\/skilliton/);
  const otherTrust = sg(ctx, [...joinArgs(ctx), "--apply"], { env: { SKILLITON_TRUST_DIR: join(ctx.base, "other-trust") } });
  assert.equal(otherTrust.code, 2, otherTrust.all);
  assert.match(otherTrust.all, /set SKILLITON_TRUST_DIR as it was/);

  const moved = join(ctx.base, "moved-clone");
  execFileSync("mv", [ctx.repo, moved]);
  const r = sg(ctx, ["join", "--company", "acme", "--signers", ctx.signers, "--marketplace", moved, "--bin-dir", ctx.bin], { cli: join(moved, "scripts", "skilliton.mjs") });
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /already joined this machine from .*company-skills/);
});

test("verify validates the company name before reading a receipt", (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.base, "notes.json"), '"private text"');
  const installedCopy = join(ctx.base, "installed-workflow");
  cpSync(join(ctx.repo, "packs", "base", "plugins", "workflow"), installedCopy, { recursive: true });
  const r = sg(ctx, ["verify", "--company", "../notes"], { cli: join(installedCopy, "runtime", "skilliton.mjs") });
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /--company "\.\.\/notes" is not allowed/);
  assert.doesNotMatch(r.all, /private text/);
});
