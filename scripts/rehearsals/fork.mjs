#!/usr/bin/env node
// fork.mjs: the PLAN.md M6 rehearsal ("make it yours"), end to end, in disposable folders.
//
//   node scripts/rehearsals/fork.mjs [--claude <path>] [--codex <path>] [--keep] [--no-evidence]
//
// A company forks this repository and makes it its own with the commands docs/HOW-IT-WORKS.md shows: company init
// renames the marketplace and points the team settings template at the fork; new-plugin and new-skill add a company
// plugin with a skill. The fork passes the packaging checks and strict plugin validation, releases 1.0.0 signed by a
// throwaway approver key, and a clean Claude Code configuration (and a clean Codex home, when codex is available)
// installs the base plugins and the company plugin from the renamed marketplace and verifies them. A new application
// receives the fork's team settings and is prepared with the installed runtime. The refusals a person meets on the way
// are checked too.
//
// Costs: nothing. Plugin install and verify need no login, and no model session runs.
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 the rehearsal could not start.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, Rehearsal, findClient, git, initRepo, isolatedEnv, parseFlags, readJson, run, sshKey, useSigningKey, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { claude: "value", codex: "value", keep: "flag", "no-evidence": "flag" });
const claude = findClient(flags.claude, "SKILLITON_CLAUDE", "claude");
const codex = findClient(flags.codex, "SKILLITON_CODEX", "codex");
if (!claude) { console.log("NOT RUN: Claude Code was not found (pass --claude <path>); the validate and install steps need it."); process.exit(2); }

const COMPANY = "acme", MARKET = "acme-skills", GITHUB = "acme/skills", PLUGIN = "acme-review", SKILL = "billing-check";
const BASE = ["workflow", "guardrails", "context-hygiene"];
const ws = workspace("fork");
const R = new Rehearsal("fork", "Fork rehearsal: make it yours (M6)");
const env = isolatedEnv(ws);
const fork = join(ws, "company-skills");
const app = join(ws, "app");
const cfg = join(ws, "claude-config");
const codexHome = join(ws, "codex-home");
const keys = join(ws, "keys");
const sg = (args, opts = {}) => run(process.execPath, [join(fork, "scripts", "skilliton.mjs"), ...args], { env, cwd: fork, ...opts });
const cc = (args) => run(claude.path, args, { env: { ...env, CLAUDE_CONFIG_DIR: cfg }, timeoutMs: 300000 });
const cx = (args) => run(codex.path, args, { env: { ...env, CODEX_HOME: codexHome }, timeoutMs: 300000 });
const jsonOf = (r) => { try { return JSON.parse(r.out); } catch { return null; } };
const tail = (r, n = 300) => r.all.trim().slice(-n);
// Every file in the fork's working tree with its bytes, so "wrote nothing" is checked, not assumed.
const treeState = () => git(fork, ["status", "--porcelain", "--untracked-files=all"], { env }).out;
const commitAll = (message) => {
  const add = git(fork, ["add", "-A"], { env });
  const c = git(fork, ["commit", "-q", "-m", message], { env });
  if (add.code || c.code) throw new Error(`commit failed: ${add.all}${c.all}`);
};
const pluginStates = (j) => Object.fromEntries((j?.details?.plugins ?? []).map((l) => [`${l.plugin}@${l.marketplace}`, l.state]));
const allVerified = (j, names) => names.every((p) => pluginStates(j)[`${p}@${MARKET}`] === "VERIFIED");

console.log(`workspace: ${ws}`);
console.log(`claude: ${claude.version}${codex ? `; codex: ${codex.version}` : "; codex: not found (the Codex step will be NOT RUN)"}`);

await R.step("K1", "company init renames the fork: preview writes nothing, apply writes, a repeat changes nothing, doctor sees the catalog and template agree", () => {
  const c = git(ws, ["clone", "-q", REPO, fork], { env });
  if (c.code) return { ok: false, critical: true, detail: c.all };
  for (const s of [["config", "user.name", "approver"], ["config", "user.email", "approver@example.invalid"], ["config", "commit.gpgsign", "false"]]) git(fork, s, { env });
  const init = ["company", "init", "--name", COMPANY, "--marketplace-repo", GITHUB, "--marketplace-name", MARKET];
  const preview = sg(init);
  const untouched = treeState() === "";
  const apply = sg([...init, "--apply"]);
  const catalog = readJson(join(fork, ".claude-plugin", "marketplace.json"));
  const template = readJson(join(fork, "templates", "project-settings.json"));
  const renamed = catalog.name === MARKET && template.extraKnownMarketplaces?.[MARKET]?.source?.repo === GITHUB && BASE.every((p) => template.enabledPlugins?.[`${p}@${MARKET}`] === true);
  const settled = treeState();
  const again = sg([...init, "--apply"]);
  const repeatNoop = again.code === 0 && /nothing to change/.test(again.out) && treeState() === settled;
  const doctor = sg(["doctor"]);
  const agree = /^OK\s+skills repo catalog:/m.test(doctor.out);
  const ok = preview.code === 0 && untouched && apply.code === 0 && renamed && repeatNoop && agree;
  return { ok, critical: true, detail: `fork at ${git(fork, ["rev-parse", "--short", "HEAD"], { env }).out.trim()}; preview exit ${preview.code}, wrote nothing: ${untouched}; apply exit ${apply.code}; catalog ${catalog.name}, template ${Object.keys(template.extraKnownMarketplaces ?? {}).join(",")} at ${template.extraKnownMarketplaces?.[MARKET]?.source?.repo}; repeat changed nothing: ${repeatNoop}; doctor catalog line OK: ${agree}${ok ? "" : ` | ${tail(apply)} ${(doctor.out.match(/^.*skills repo catalog.*$/m) ?? [""])[0]}`}` };
});

await R.step("K2", "new-plugin and new-skill add a company plugin with a skill; packaging checks and strict validation pass", () => {
  const plugin = sg(["new-plugin", PLUGIN, "--pack", COMPANY, "--description", "Acme's own review rules.", "--apply"]);
  const skill = sg(["new-skill", PLUGIN, SKILL, "--pack", COMPANY, "--description", "Use when a change touches billing or invoices: check rounding, currency and repeated charges.", "--apply"]);
  const skillFile = join(fork, "packs", COMPANY, "plugins", PLUGIN, "skills", SKILL, "SKILL.md");
  writeFileSync(skillFile, readFileSync(skillFile, "utf8").replace(/TODO\(skilliton\)[^\n]*/g, "Check amounts are rounded once, in the invoice currency, and that a retried request cannot charge twice."));
  const packs = run(process.execPath, [join(fork, "scripts", "packs.test.mjs"), "--root", fork], { env });
  const validateRepo = cc(["plugin", "validate", "--strict", fork]);
  const validatePlugin = cc(["plugin", "validate", "--strict", join(fork, "packs", COMPANY, "plugins", PLUGIN)]);
  const version = readJson(join(fork, "packs", COMPANY, "plugins", PLUGIN, ".claude-plugin", "plugin.json")).version;
  const ok = plugin.code === 0 && skill.code === 0 && packs.code === 0 && validateRepo.code === 0 && validatePlugin.code === 0 && version === "0.1.1";
  if (ok) commitAll("Acme: company identity, acme-review plugin with billing-check skill");
  return { ok, critical: true, detail: `new-plugin exit ${plugin.code}; new-skill exit ${skill.code} (plugin now ${version}); packs.test exit ${packs.code}; validate --strict: repository exit ${validateRepo.code}, ${PLUGIN} exit ${validatePlugin.code} (license UNLICENSED)${ok ? "" : ` | ${tail(plugin, 200)} ${tail(packs, 200)} ${tail(validateRepo, 200)} ${tail(validatePlugin, 200)}`}` };
}, { requires: ["K1"] });

await R.step("K3", "release 1.0.0 of the renamed fork is created, committed, signed by the approver and listed as approved", () => {
  const approver = sshKey(keys, "approver@example.invalid");
  writeFileSync(join(keys, "allowed_signers"), approver.signersLine + "\n");
  useSigningKey(fork, env, approver);
  const trust = sg(["trust", "add", "--company", COMPANY, "--signers", join(keys, "allowed_signers"), "--apply"]);
  const create = sg(["release", "create", "--version", "1.0.0", "--apply"]);
  if (create.code) return { ok: false, critical: true, detail: `trust exit ${trust.code}; create exit ${create.code}: ${tail(create, 400)}` };
  const manifest = readJson(join(fork, "releases", "1.0.0.json"));
  commitAll("Release 1.0.0 manifest");
  const sign = sg(["release", "sign", "1.0.0", "--apply"]);
  const list = sg(["release", "list", "--company", COMPANY]);
  const names = (manifest.components ?? []).map((c) => c.name);
  const ok = trust.code === 0 && sign.code === 0 && list.code === 0 && /^approved\s+1\.0\.0\b/m.test(list.out) && manifest.marketplace === MARKET && names.includes(PLUGIN);
  return { ok, critical: true, detail: `trust add exit ${trust.code}; manifest marketplace ${manifest.marketplace}, plugins ${names.join(", ")}; sign exit ${sign.code}; list exit ${list.code}${ok ? "; 1.0.0 approved" : ` | ${tail(list)}`}` };
}, { requires: ["K2"] });

await R.step("K4", `a clean Claude Code configuration installs the base plugins and ${PLUGIN} from ${MARKET} and verifies all four`, () => {
  const add = cc(["plugin", "marketplace", "add", fork]);
  const installs = [...BASE, PLUGIN].map((p) => [p, cc(["plugin", "install", `${p}@${MARKET}`]).code]);
  const records = readJson(join(cfg, "plugins", "installed_plugins.json")).plugins ?? {};
  const v = sg(["verify", "--config-dir", cfg, "--source", fork, "--company", COMPANY, "--json"]);
  const j = jsonOf(v);
  const ok = add.code === 0 && installs.every(([, code]) => code === 0) && Object.hasOwn(records, `${PLUGIN}@${MARKET}`) && v.code === 0 && j?.result === "complete" && allVerified(j, [...BASE, PLUGIN]);
  return { ok, detail: `marketplace add exit ${add.code}; installs ${installs.map(([p, code]) => `${p}:${code}`).join(" ")}; install records ${Object.keys(records).sort().join(", ")}; verify exit ${v.code}: ${JSON.stringify(pluginStates(j))}${ok ? "" : ` | ${j?.summary ?? tail(v)}`}` };
}, { requires: ["K3"] });

await R.step("K5", `a clean Codex home installs the same plugins from ${MARKET} and verifies all four`, () => {
  if (!codex) return { notRun: "codex not found; pass --codex <path>" };
  mkdirSync(codexHome, { recursive: true });
  const add = cx(["plugin", "marketplace", "add", fork, "--json"]);
  const installs = [...BASE, PLUGIN].map((p) => [p, cx(["plugin", "add", `${p}@${MARKET}`, "--json"]).code]);
  const v = sg(["verify", "--client", "codex", "--config-dir", codexHome, "--source", fork, "--company", COMPANY, "--json"]);
  const j = jsonOf(v);
  const ok = add.code === 0 && installs.every(([, c]) => c === 0) && v.code === 0 && j?.result === "complete" && allVerified(j, [...BASE, PLUGIN]);
  return { ok, detail: `marketplace add exit ${add.code}; installs ${installs.map(([p, c]) => `${p}:${c}`).join(" ")}; verify exit ${v.code}: ${JSON.stringify(pluginStates(j))}${ok ? "" : ` | ${j?.summary ?? tail(v)} ${tail(add, 200)}`}` };
}, { requires: ["K3"] });

await R.step("K6", "a new application gets the fork's team settings and is prepared with the installed runtime; doctor sees no mismatch", () => {
  initRepo(app, env);
  writeFileSync(join(app, "README.md"), "# App\n");
  git(app, ["add", "README.md"], { env });
  git(app, ["commit", "-q", "-m", "App"], { env });
  const settings = sg(["project-settings", "--dir", app, "--apply"]);
  const s = readJson(join(app, ".claude", "settings.json"));
  const declared = s.extraKnownMarketplaces?.[MARKET]?.source?.repo === GITHUB && s.enabledPlugins?.[`${PLUGIN}@${MARKET}`] === true && !Object.keys(s.enabledPlugins ?? {}).some((id) => id.endsWith("@skilliton"));
  const installed = readJson(join(cfg, "plugins", "installed_plugins.json")).plugins?.[`workflow@${MARKET}`]?.[0]?.installPath;
  const bin = installed ? join(installed, "bin", "skilliton") : null;
  const prep = bin ? run(bin, ["prepare", "--dir", app, "--apply"], { env }) : { code: -1, all: "no installed workflow plugin" };
  const check = bin ? run(bin, ["prepare", "--dir", app, "--check"], { env }) : { code: -1, all: "" };
  const doctor = sg(["doctor", "--dir", app]);
  const settingsLine = (doctor.out.match(/^\S+\s+\.claude\/settings\.json:.*$/m) ?? [""])[0];
  const ok = settings.code === 0 && declared && prep.code === 0 && check.code === 0 && /^OK\s+\.claude\/settings\.json:/.test(settingsLine) && /^OK\s+skills repo catalog:/m.test(doctor.out);
  return { ok, detail: `project-settings exit ${settings.code}; declares ${MARKET} at ${s.extraKnownMarketplaces?.[MARKET]?.source?.repo} and enables ${Object.keys(s.enabledPlugins ?? {}).join(", ")}; installed-runtime prepare exit ${prep.code}, check exit ${check.code}; doctor: ${settingsLine.replace(/\s+/, " ")}${ok ? "" : ` | ${tail(prep, 200)}`}` };
}, { requires: ["K4"] });

await R.step("K7", "the refusals a person meets: a skill for a plugin not created yet, a taken plugin name, a rename without the fork's repository", () => {
  const before = treeState();
  const missing = sg(["new-skill", "acme-other", "x", "--pack", COMPANY]);
  const taken = sg(["new-plugin", "workflow", "--pack", COMPANY, "--apply"]);
  const noRepo = sg(["company", "init", "--name", COMPANY, "--apply"]);
  const unchanged = treeState() === before;
  const ok = missing.code === 2 && /new-plugin acme-other --pack acme --apply/.test(missing.all) && taken.code === 2 && /already exists/.test(taken.all) && noRepo.code === 2 && /upstream plugins/.test(noRepo.all) && unchanged;
  return { ok, detail: `new-skill into a missing plugin exit ${missing.code} (names new-plugin: ${/new-plugin acme-other/.test(missing.all)}); new-plugin workflow exit ${taken.code}; company init without --marketplace-repo exit ${noRepo.code}; fork unchanged: ${unchanged}` };
}, { requires: ["K2"] });

R.note("The marketplace is a local folder here, as in the company release rehearsal. Installing from a GitHub owner/repo source is documented but not run yet (PLAN.md M7).");
R.note("Update, tamper, rollback and withdrawal are rehearsed under the default marketplace name by scripts/rehearsals/company-release.mjs; this rehearsal shows the renamed fork releases, installs and verifies, including a plugin outside packs/base.");

const meta = { "Claude Code": claude.version, Codex: codex?.version ?? "not found", Node: process.version };
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exit(R.failed ? 1 : 0);
