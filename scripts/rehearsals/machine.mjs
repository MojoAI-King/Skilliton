#!/usr/bin/env node
// machine.mjs: the PLAN.md M7 rehearsal ("one command per machine"), end to end, in disposable folders.
//
//   node scripts/rehearsals/machine.mjs [--claude <path>] [--codex <path>] [--no-github] [--keep] [--no-evidence]
//
// A company fork with its own name, a company plugin and a signed release is cloned by a developer, who runs
// `skillgate join` on a machine with clean Claude Code and Codex homes. Claude Code already has the company marketplace
// and one of its plugins, installed by hand before join. The rehearsal checks that the preview writes nothing, that
// join sets up both clients, the release signers and the terminal command and ends VERIFIED, that verify then works
// without --source from the terminal command and from an installed copy, that a repeat changes nothing, that undo
// removes exactly what join added and keeps what was there before, and that the refusals happen before any change.
// With network access it also joins from a clone of this public repository, installing from its GitHub source on both
// clients; that repository has no signed release, so verify must report the installs as not approved.
//
// Costs: nothing. Plugin install and verify need no login, and no model session runs. The GitHub step reads the
// public repository only.
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 the rehearsal could not start.

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, Rehearsal, findClient, git, isolatedEnv, parseFlags, readJson, run, sshKey, useSigningKey, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { claude: "value", codex: "value", "no-github": "flag", keep: "flag", "no-evidence": "flag" });
const claude = findClient(flags.claude, "SKILLGATE_CLAUDE", "claude");
const codex = findClient(flags.codex, "SKILLGATE_CODEX", "codex");
if (!claude || !codex) { console.log(`NOT RUN: ${!claude ? "Claude Code" : "Codex"} was not found (pass --claude <path> and --codex <path>); join is rehearsed on both clients.`); process.exit(2); }

const GITHUB_REPO = "MojoAI-King/Skilliton";
const COMPANY = "acme", MARKET = "acme-skills", PLUGIN = "acme-review";
// The team template enables every catalog plugin, in this order; Claude Code has context-hygiene before join runs.
const ALL = ["context-hygiene", "workflow", "guardrails", PLUGIN];
const JOINED_CLAUDE = ALL.filter((p) => p !== "context-hygiene");
const ws = workspace("machine");
const R = new Rehearsal("machine", "Machine rehearsal: one command per machine (M7)");
const fork = join(ws, "company-skills");
const dev = join(ws, "developer-clone");
const keys = join(ws, "keys");
const signers = join(keys, "allowed_signers");
const machine = {
  home: join(ws, "home"), claude: join(ws, "claude-config"), codex: join(ws, "codex-home"),
  trust: join(ws, "trust"), joined: join(ws, "joined"), bin: join(ws, "bin"),
};
const env = isolatedEnv(ws, {
  CLAUDE_CONFIG_DIR: machine.claude, CODEX_HOME: machine.codex, SKILLGATE_TRUST_DIR: machine.trust, SKILLGATE_JOIN_DIR: machine.joined,
  PATH: process.env.PATH,
});
const sgFork = (args) => run(process.execPath, [join(fork, "scripts", "skillgate.mjs"), ...args], { env, cwd: fork });
const sgDev = (args, e = env) => run(process.execPath, [join(dev, "scripts", "skillgate.mjs"), ...args], { env: e, cwd: dev, timeoutMs: 900000 });
const cc = (args, e = env) => run(claude.path, args, { env: e, timeoutMs: 300000 });
const clients = ["--claude", claude.path, "--codex", codex.path];
const joinArgs = ["join", "--company", COMPANY, "--signers", signers, "--marketplace", fork, "--bin-dir", machine.bin, ...clients];
const tail = (r, n = 300) => r.all.trim().slice(-n);
const jsonOf = (r) => { try { return JSON.parse(r.out); } catch { return null; } };

// Every file under the machine's folders with its content hash and mode: equal snapshots mean nothing changed.
function snapshot(roots) {
  const lines = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { if (e.code === "ENOENT") return; throw e; }
    for (const d of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, d.name);
      if (d.isDirectory()) { lines.push(`${p}/`); walk(p); continue; }
      const st = lstatSync(p);
      const body = d.isFile() ? createHash("sha256").update(readFileSync(p)).digest("hex") : "link";
      lines.push(`${p} ${(st.mode & 0o777).toString(8)} ${body}`);
    }
  };
  for (const r of roots) walk(r);
  return lines.join("\n");
}
const machineRoots = [machine.claude, machine.codex, machine.trust, machine.joined, machine.bin];
const claudeInstalled = (dir = machine.claude) => Object.keys(existsSync(join(dir, "plugins", "installed_plugins.json")) ? readJson(join(dir, "plugins", "installed_plugins.json")).plugins ?? {} : {}).sort();
const codexCached = (home = machine.codex, market = MARKET) => { try { return readdirSync(join(home, "plugins", "cache", market)).sort(); } catch { return []; } };
const codexConfig = (home = machine.codex) => (existsSync(join(home, "config.toml")) ? readFileSync(join(home, "config.toml"), "utf8") : "");
const diffLines = (a, b) => { const A = new Set(a.split("\n")), B = new Set(b.split("\n")); return [...B].filter((l) => !A.has(l)).concat([...A].filter((l) => !B.has(l)).map((l) => `gone ${l}`)).slice(0, 6).join("; "); };

console.log(`workspace: ${ws}`);
console.log(`claude: ${claude.version}; codex: ${codex.version}`);

await R.step("J1", "a company fork with its own name, a company plugin and signed release 1.0.0; a developer clones it", () => {
  const c = git(ws, ["clone", "-q", REPO, fork], { env });
  if (c.code) return { ok: false, critical: true, detail: c.all };
  for (const s of [["config", "user.name", "approver"], ["config", "user.email", "approver@example.invalid"], ["config", "commit.gpgsign", "false"]]) git(fork, s, { env });
  const steps = [
    sgFork(["company", "init", "--name", COMPANY, "--marketplace-repo", "acme/skills", "--marketplace-name", MARKET, "--apply"]),
    sgFork(["new-plugin", PLUGIN, "--pack", COMPANY, "--description", "Acme's own review rules.", "--apply"]),
    sgFork(["new-skill", PLUGIN, "billing-check", "--pack", COMPANY, "--description", "Use when a change touches billing or invoices."]),
  ];
  git(fork, ["add", "-A"], { env });
  git(fork, ["commit", "-q", "-m", "Acme identity and plugin"], { env });
  const approver = sshKey(keys, "approver@example.invalid");
  writeFileSync(signers, `${approver.signersLine}\n`);
  useSigningKey(fork, env, approver);
  const create = sgFork(["release", "create", "--version", "1.0.0", "--apply"]);
  git(fork, ["add", "releases/1.0.0.json"], { env });
  git(fork, ["commit", "-q", "-m", "Release 1.0.0 manifest"], { env });
  const sign = sgFork(["release", "sign", "1.0.0", "--apply"]);
  const clone = git(ws, ["clone", "-q", fork, dev], { env });
  const tags = git(dev, ["tag", "--list", "skillgate-release/*"], { env }).out.trim();
  const ok = steps.every((s) => s.code === 0) && create.code === 0 && sign.code === 0 && clone.code === 0 && tags === "skillgate-release/1.0.0";
  return { ok, critical: true, detail: `company init, new-plugin, new-skill exits ${steps.map((s) => s.code).join(" ")}; release create exit ${create.code}, sign exit ${sign.code}; developer clone exit ${clone.code} with tags: ${tags || "none"}${ok ? "" : ` | ${tail(create)} ${tail(sign)}`}` };
});

await R.step("J2", "Claude Code already has the company marketplace and context-hygiene, installed by hand; join's preview shows them in place and writes nothing", () => {
  mkdirSync(machine.claude, { recursive: true });
  const add = cc(["plugin", "marketplace", "add", fork]);
  const install = cc(["plugin", "install", `context-hygiene@${MARKET}`]);
  const before = snapshot(machineRoots);
  const preview = sgDev(joinArgs);
  const after = snapshot(machineRoots);
  const shows = /already in place\s+marketplace acme-skills/.test(preview.out) && /will add\s+plugin workflow@acme-skills/.test(preview.out) && /is not on PATH/.test(preview.out);
  const ok = add.code === 0 && install.code === 0 && preview.code === 0 && shows && before === after;
  return { ok, critical: true, detail: `hand install: marketplace add exit ${add.code}, context-hygiene exit ${install.code}; preview exit ${preview.code}, shows the Claude Code marketplace in place and the plugins to add: ${shows}; machine folders unchanged: ${before === after}${before === after ? "" : ` (${diffLines(before, after)})`}${ok ? "" : ` | ${tail(preview, 500)}`}` };
}, { requires: ["J1"] });

await R.step("J3", "join --apply installs on both clients, trusts the signers, writes the terminal command and ends with every plugin VERIFIED", () => {
  const r = sgDev([...joinArgs, "--apply"]);
  const receipt = existsSync(join(machine.joined, `${COMPANY}.json`)) ? readJson(join(machine.joined, `${COMPANY}.json`)) : null;
  const claudeNow = claudeInstalled();
  const codexNow = codexCached();
  const launcher = join(machine.bin, "skillgate");
  const launcherOk = existsSync(launcher) && (statSync(launcher).mode & 0o111) !== 0;
  const verified = (r.out.match(/^ {2}VERIFIED\s/gm) ?? []).length;
  const receiptOk = receipt?.clients?.["claude-code"]?.marketplaceAdded === false && receipt.clients["claude-code"].installed.join() === JOINED_CLAUDE.join()
    && receipt.clients.codex?.marketplaceAdded === true && receipt.clients.codex.installed.join() === ALL.join() && Boolean(receipt.trust) && receipt.launcher?.createdFolder === true;
  const ok = r.code === 0 && /^Done: this machine is set up for acme/m.test(r.out) && verified === 8 && launcherOk && receiptOk
    && claudeNow.join() === ALL.map((p) => `${p}@${MARKET}`).sort().join() && codexNow.join() === [...ALL].sort().join();
  return { ok, critical: true, detail: `join exit ${r.code}; VERIFIED lines ${verified} of 8 (4 on each client, including the plugin installed by hand); Claude Code installs ${claudeNow.join(", ")}; Codex cache ${codexNow.join(", ")}; launcher executable: ${launcherOk}; receipt records only what join added: ${receiptOk}${ok ? "" : ` | ${tail(r, 900)}`}` };
}, { requires: ["J2"] });

await R.step("J4", "verify needs no --source afterwards: from the terminal command, and from the installed plugin's own copy", () => {
  const viaLauncher = run(join(machine.bin, "skillgate"), ["verify", "--company", COMPANY, "--json"], { env });
  const installPath = readJson(join(machine.claude, "plugins", "installed_plugins.json")).plugins[`workflow@${MARKET}`][0].installPath;
  const viaInstalled = run(join(installPath, "bin", "skillgate"), ["verify", "--client", "codex", "--json"], { env });
  const a = jsonOf(viaLauncher), b = jsonOf(viaInstalled);
  const ok = viaLauncher.code === 0 && a?.result === "complete" && viaInstalled.code === 0 && b?.result === "complete" && b?.details?.source === dev;
  return { ok, detail: `terminal command verify exit ${viaLauncher.code} (${a?.summary ?? tail(viaLauncher)}); installed copy verify --client codex exit ${viaInstalled.code}, source from the join receipt: ${b?.details?.source === dev}` };
}, { requires: ["J3"] });

await R.step("J5", "a repeat join changes nothing and still verifies", () => {
  const before = snapshot(machineRoots);
  const r = sgDev([...joinArgs, "--apply"]);
  const after = snapshot(machineRoots);
  const ok = r.code === 0 && !/will add/.test(r.out) && before === after;
  return { ok, detail: `repeat exit ${r.code}; nothing listed to add: ${!/will add/.test(r.out)}; machine folders unchanged: ${before === after}${before === after ? "" : ` (${diffLines(before, after)})`}` };
}, { requires: ["J3"] });

await R.step("J6", "join --undo previews without writing, then removes exactly what join added and keeps what was there before", () => {
  const before = snapshot(machineRoots);
  const preview = sgDev(["join", "--undo", "--company", COMPANY, ...clients]);
  const unchanged = snapshot(machineRoots) === before;
  const r = sgDev(["join", "--undo", "--company", COMPANY, ...clients, "--apply"]);
  const claudeNow = claudeInstalled();
  const knownNow = Object.keys(readJson(join(machine.claude, "plugins", "known_marketplaces.json")));
  const codexNow = codexCached();
  const gone = !existsSync(join(machine.trust, `${COMPANY}.allowed_signers`)) && !existsSync(machine.bin) && !existsSync(join(machine.joined, `${COMPANY}.json`));
  const codexClean = !/marketplaces\.acme-skills|acme-skills/.test(codexConfig());
  const ok = preview.code === 0 && unchanged && r.code === 0 && claudeNow.join() === `context-hygiene@${MARKET}` && knownNow.includes(MARKET) && codexNow.length === 0 && codexClean && gone;
  return { ok, detail: `preview exit ${preview.code}, wrote nothing: ${unchanged}; undo exit ${r.code}; Claude Code keeps ${claudeNow.join(", ") || "nothing"} and marketplaces ${knownNow.join(", ")}; Codex cache ${codexNow.join(", ") || "empty"}, config names acme-skills: ${!codexClean}; signers, terminal command, its folder and receipt removed: ${gone}${ok ? "" : ` | ${tail(r, 700)}`}` };
}, { requires: ["J3"] });

await R.step("J7", "refusals before any change: a shallow clone, a different signers file already trusted, and a marketplace of the same name from another source", () => {
  const shallow = join(ws, "shallow-clone");
  git(ws, ["clone", "-q", "--depth", "1", `file://${fork}`, shallow], { env });
  const otherKey = sshKey(keys, "someone-else@example.invalid");
  const otherSigners = join(keys, "other_signers");
  writeFileSync(otherSigners, `${otherKey.signersLine}\n`);
  const before = snapshot(machineRoots);
  const fromShallow = run(process.execPath, [join(REPO, "scripts", "skillgate.mjs"), ...joinArgs.map((a) => a), "--repo", shallow, "--apply"], { env });
  const trustOther = sgDev(["trust", "add", "--company", COMPANY, "--signers", otherSigners, "--apply"]);
  const afterTrust = snapshot(machineRoots);
  const differentSigners = sgDev([...joinArgs, "--apply"]);
  const otherSource = sgDev(["join", "--company", COMPANY, "--signers", otherSigners, "--marketplace", "acme/skills", "--client", "claude-code", "--no-launcher", "--claude", claude.path, "--apply"]);
  const unchanged = snapshot(machineRoots) === afterTrust;
  sgDev(["trust", "remove", "--company", COMPANY, "--apply"]);
  const ok = fromShallow.code === 2 && /shallow clone/.test(fromShallow.all) && trustOther.code === 0 && differentSigners.code === 2 && /already trusted with a different signers file/.test(differentSigners.all)
    && otherSource.code === 2 && /already has a marketplace named acme-skills from directory/.test(otherSource.all) && unchanged && before !== afterTrust;
  return { ok, detail: `shallow clone exit ${fromShallow.code}; different signers exit ${differentSigners.code}; marketplace from another source exit ${otherSource.code}; machine unchanged by the three refusals: ${unchanged}${ok ? "" : ` | ${tail(fromShallow, 200)} ${tail(differentSigners, 200)} ${tail(otherSource, 300)}`}` };
}, { requires: ["J6"] });

await R.step("J8", `GitHub source: join from a clone of ${GITHUB_REPO} installs from GitHub on both clients, verify reports no approved release, and undo removes it`, () => {
  if (flags["no-github"]) return { notRun: "--no-github was passed" };
  const reach = git(ws, ["ls-remote", "--heads", `https://github.com/${GITHUB_REPO}`, "main"], { env });
  if (reach.code !== 0) return { notRun: `github.com was not reachable (git ls-remote exit ${reach.code})` };
  const upstream = join(ws, "upstream-clone");
  const clone = git(ws, ["clone", "-q", `https://github.com/${GITHUB_REPO}`, upstream], { env, timeoutMs: 600000 });
  if (clone.code) return { ok: false, detail: `clone failed: ${tail(clone)}` };
  const second = { claude: join(ws, "claude-config-github"), codex: join(ws, "codex-home-github"), trust: join(ws, "trust-github"), joined: join(ws, "joined-github") };
  const e = { ...env, CLAUDE_CONFIG_DIR: second.claude, CODEX_HOME: second.codex, SKILLGATE_TRUST_DIR: second.trust, SKILLGATE_JOIN_DIR: second.joined };
  mkdirSync(second.claude, { recursive: true });
  const local = (args) => run(process.execPath, [join(REPO, "scripts", "skillgate.mjs"), ...args], { env: e, timeoutMs: 900000 });
  const r = local(["join", "--repo", upstream, "--company", "upstream", "--signers", signers, "--no-launcher", ...clients, "--apply"]);
  const records = existsSync(join(second.claude, "plugins", "installed_plugins.json")) ? readJson(join(second.claude, "plugins", "installed_plugins.json")).plugins : {};
  const known = existsSync(join(second.claude, "plugins", "known_marketplaces.json")) ? readJson(join(second.claude, "plugins", "known_marketplaces.json")) : {};
  const head = git(upstream, ["rev-parse", "HEAD"], { env }).out.trim();
  const fromGithub = known.skillgate?.source?.source === "github" && records["workflow@skillgate"]?.[0]?.gitCommitSha === head && /source = "https:\/\/github\.com\/MojoAI-King\/Skilliton\.git"/.test(codexConfig(second.codex));
  const unknown = (r.out.match(/^ {2}UNKNOWN VERSION\s/gm) ?? []).length;
  const undo = local(["join", "--undo", "--company", "upstream", ...clients, "--apply"]);
  const cleaned = claudeInstalled(second.claude).length === 0 && codexCached(second.codex, "skillgate").length === 0 && !existsSync(join(second.joined, "upstream.json"));
  const ok = r.code === 1 && fromGithub && unknown === 6 && !/^ {2}VERIFIED/m.test(r.out) && undo.code === 0 && cleaned;
  return { ok, detail: `join exit ${r.code} (1: installed, not approved); Claude Code marketplace source ${known.skillgate?.source?.source ?? "none"}, workflow at commit ${records["workflow@skillgate"]?.[0]?.gitCommitSha?.slice(0, 7) ?? "none"} = clone HEAD ${head.slice(0, 7)}; Codex source is the GitHub URL: ${fromGithub}; UNKNOWN VERSION lines ${unknown} of 6; undo exit ${undo.code}, both clients clean: ${cleaned}${ok ? "" : ` | ${tail(r, 600)} ${tail(undo, 300)}`}` };
}, { requires: ["J1"] });

R.note("Every client home, the trust folder, the join receipts and the terminal command folder are inside the disposable workspace (CLAUDE_CONFIG_DIR, CODEX_HOME, SKILLGATE_TRUST_DIR, SKILLGATE_JOIN_DIR, --bin-dir); nothing on the machine running the rehearsal is changed.");
R.note("Measured limits of undo: Claude Code leaves empty enabledPlugins and extraKnownMarketplaces entries in its settings and keeps downloaded plugins under plugins/cache/, which verify does not count because it reads installed_plugins.json; Codex deletes each removed plugin's cache folder, which is its install record, and keeps the empty plugins/cache/<marketplace>/ folder.");

const meta = { "Claude Code": claude.version, Codex: codex.version, "GitHub step": flags["no-github"] ? "not run (--no-github)" : "run when github.com is reachable", Node: process.version };
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exit(R.failed ? 1 : 0);
