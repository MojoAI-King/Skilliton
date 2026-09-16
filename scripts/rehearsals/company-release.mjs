#!/usr/bin/env node
// company-release.mjs: the PLAN.md M3 rehearsal, end to end, in disposable folders.
//
//   node scripts/rehearsals/company-release.mjs [--claude <path>] [--codex <path>] [--with-eval] [--keep] [--no-evidence]
//
// A company fork is a clone of this repository. It approves release 1.0.0 with a throwaway SSH key. A clean Claude
// Code configuration (and a clean Codex home, when codex is available) installs the company plugins and verifies
// them. A project is prepared with the installed runtime. A lesson from that project becomes a proposal, then an
// improved review skill with a regression check and a behavior eval, then signed release 1.1.0. The clean
// environments update and verify; the project applies the release's migration and rolls it back and forward. Then the
// failure cases: a tampered install, an unauthorized release (unsigned, and signed by a key the company does not
// trust) that reaches the environment, rollback, withdrawal, a secret in a skill import, and removal that keeps the
// project's history.
//
// Costs: nothing unless --with-eval, which runs one eval case twice (before and after the improvement) on the logged-in
// Claude account. Plugin install, update and verify need no login. No model session runs otherwise.
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 the rehearsal could not start.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, REPO, Rehearsal, findClient, git, initRepo, isolatedEnv, parseFlags, readJson, run, sshKey, useSigningKey, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { claude: "value", codex: "value", "with-eval": "flag", keep: "flag", "no-evidence": "flag" });
const claude = findClient(flags.claude, "SKILLGATE_CLAUDE", "claude");
const codex = findClient(flags.codex, "SKILLGATE_CODEX", "codex");
if (!claude) { console.log("NOT RUN: Claude Code was not found (pass --claude <path>); the install and update steps need it."); process.exit(2); }

const ws = workspace("company-release");
const R = new Rehearsal("company-release", "Company release rehearsal (M3)");
const denylist = join(ws, "denylist");
writeFileSync(denylist, "# rehearsal denylist: one made-up token, so the name scan runs\nqzxrehearsalname\n");
const env = isolatedEnv(ws, { SKILLGATE_DENYLIST: denylist });
const fork = join(ws, "company-skills");
const app = join(ws, "app");
const cfgB = join(ws, "claude-b");
const codexC = join(ws, "codex-c");
const envB = { ...env, CLAUDE_CONFIG_DIR: cfgB };
const envC = { ...env, CODEX_HOME: codexC };
const keys = join(ws, "keys");
const sg = (args, opts = {}) => run(process.execPath, [join(fork, "scripts", "skillgate.mjs"), ...args], { env, ...opts });
const cc = (args, e = envB) => run(claude.path, args, { env: e, timeoutMs: 300000 });
const cx = (args) => run(codex.path, args, { env: envC, timeoutMs: 300000 });
const jsonResult = (r) => { try { return JSON.parse(r.out); } catch { return null; } };
const installedPath = (plugin) => readJson(join(cfgB, "plugins", "installed_plugins.json")).plugins[`${plugin}@skillgate`]?.[0]?.installPath;
const installedVersion = (plugin) => readJson(join(cfgB, "plugins", "installed_plugins.json")).plugins[`${plugin}@skillgate`]?.[0]?.version;
const pluginVersion = (dir) => readJson(join(dir, "packs", "base", "plugins", "workflow", ".claude-plugin", "plugin.json")).version;
const built = (command) => !/not built in this version/.test(run(process.execPath, [CLI, command, "--help"]).all);
const verifyB = (extra = []) => sg(["verify", "--config-dir", cfgB, "--source", fork, "--company", "acme", "--json", ...extra]);
const commitAll = (dir, message, paths) => {
  const add = git(dir, ["add", "--", ...paths], { env });
  const c = git(dir, ["commit", "-q", "-m", message], { env });
  if (add.code || c.code) throw new Error(`commit failed: ${add.all}${c.all}`);
  return git(dir, ["rev-parse", "HEAD"], { env }).out.trim();
};
function bumpWorkflow(dir, to) {
  const f = join(dir, "packs", "base", "plugins", "workflow", ".claude-plugin", "plugin.json");
  const text = readFileSync(f, "utf8");
  const from = JSON.parse(text).version;
  writeFileSync(f, text.replace(`"version": "${from}"`, `"version": "${to}"`));
  return from;
}
const nextPatch = (v) => v.replace(/(\d+)$/, (n) => String(Number(n) + 1));

console.log(`workspace: ${ws}`);
console.log(`claude: ${claude.version}${codex ? `; codex: ${codex.version}` : "; codex: not found (Codex steps will be NOT RUN)"}`);

await R.step("F1", "company fork with an approver key and a trusted signers file", () => {
  const c = git(ws, ["clone", "-q", REPO, fork], { env });
  if (c.code) return { ok: false, critical: true, detail: c.all };
  for (const s of [["config", "user.name", "approver"], ["config", "user.email", "approver@example.invalid"], ["config", "commit.gpgsign", "false"]]) git(fork, s, { env });
  const approver = sshKey(keys, "approver@example.invalid");
  sshKey(keys, "intruder@example.invalid");
  writeFileSync(join(keys, "allowed_signers"), approver.signersLine + "\n");
  useSigningKey(fork, env, approver);
  const t = sg(["trust", "add", "--company", "acme", "--signers", join(keys, "allowed_signers"), "--apply"]);
  return { ok: t.code === 0, critical: true, detail: `fork at ${git(fork, ["rev-parse", "--short", "HEAD"], { env }).out.trim()}; trust add exit ${t.code}` };
});

await R.step("F2", "release 1.0.0 created, committed and signed; listed as approved", () => {
  const create = sg(["release", "create", "--version", "1.0.0", "--apply"], { cwd: fork });
  if (create.code) return { ok: false, critical: true, detail: `create exit ${create.code}: ${create.all.slice(-400)}` };
  commitAll(fork, "Release 1.0.0 manifest", ["releases/1.0.0.json"]);
  const sign = sg(["release", "sign", "1.0.0", "--apply"], { cwd: fork });
  const list = sg(["release", "list", "--company", "acme"], { cwd: fork });
  const ok = sign.code === 0 && list.code === 0 && /^approved\s+1\.0\.0\b/m.test(list.out);
  return { ok, critical: true, detail: `sign exit ${sign.code}; list exit ${list.code}; ${ok ? "1.0.0 approved" : list.all.slice(-300)}` };
}, { requires: ["F1"] });

await R.step("C1", "clean Claude Code configuration installs the company plugins and verifies them", () => {
  const add = cc(["plugin", "marketplace", "add", fork]);
  const installs = ["workflow", "guardrails", "context-hygiene"].map((p) => [p, cc(["plugin", "install", `${p}@skillgate`]).code]);
  const v = verifyB();
  const j = jsonResult(v);
  const ok = add.code === 0 && installs.every(([, code]) => code === 0) && v.code === 0 && j?.result === "complete";
  return { ok, critical: true, detail: `marketplace add exit ${add.code}; installs ${installs.map(([p, code]) => `${p}:${code}`).join(" ")}; verify exit ${v.code} (${j?.summary ?? v.all.slice(-200)})` };
}, { requires: ["F2"] });

await R.step("X1", "clean Codex home installs the company plugins and verifies them", () => {
  if (!codex) return { ok: false, detail: "codex not found; pass --codex <path>" };
  mkdirSync(codexC, { recursive: true });
  const add = cx(["plugin", "marketplace", "add", fork, "--json"]);
  const installs = ["workflow", "guardrails", "context-hygiene"].map((p) => [p, cx(["plugin", "add", `${p}@skillgate`, "--json"]).code]);
  const v = sg(["verify", "--client", "codex", "--config-dir", codexC, "--source", fork, "--company", "acme", "--json"]);
  const j = jsonResult(v);
  return { ok: add.code === 0 && installs.every(([, c]) => c === 0) && v.code === 0 && j?.result === "complete", detail: `marketplace add exit ${add.code}; installs ${installs.map(([p, c]) => `${p}:${c}`).join(" ")}; verify exit ${v.code} (${j?.summary ?? v.all.slice(-200)})` };
}, { requires: ["F2"] });

await R.step("P1", "a new application is prepared with the installed plugin's own runtime", () => {
  if (!built("prepare")) return { ok: false, detail: "prepare is not built in this runtime yet" };
  initRepo(app, env);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", type: "module", scripts: { test: "node --test" } }, null, 2) + "\n");
  writeFileSync(join(app, "price.js"), "export const price = (qty) => qty * 3;\n");
  writeFileSync(join(app, "price.test.js"), "import test from 'node:test';\nimport assert from 'node:assert';\nimport { price } from './price.js';\ntest('price', () => assert.equal(price(2), 6));\n");
  writeFileSync(join(app, "CLAUDE.md"), "# App\n\nHuman notes that Skillgate must keep.\n");
  commitAll(app, "App", ["package.json", "price.js", "price.test.js", "CLAUDE.md"]);
  const bin = join(installedPath("workflow"), "bin", "skillgate");
  const prep = run(bin, ["prepare", "--dir", app, "--apply"], { env });
  const check = run(bin, ["prepare", "--dir", app, "--check"], { env });
  const kept = readFileSync(join(app, "CLAUDE.md"), "utf8").includes("Human notes that Skillgate must keep.");
  if (prep.code === 0) git(app, ["add", "-A"], { env }), git(app, ["commit", "-q", "-m", "Prepare with Skillgate"], { env });
  return { ok: prep.code === 0 && check.code === 0 && kept, detail: `prepare exit ${prep.code}; check exit ${check.code}; human text kept: ${kept}` };
}, { requires: ["C1"] });

await R.step("P2", "moving the company fork does not break the prepared project or verification", () => {
  const moved = `${fork}-moved`;
  renameSync(fork, moved);
  try {
    const bin = join(installedPath("workflow"), "bin", "skillgate");
    const status = run(bin, ["status", "--dir", app], { env });
    const v = run(bin, ["verify", "--config-dir", cfgB, "--source", moved, "--company", "acme", "--json"], { env });
    const statusRan = [0, 1].includes(status.code) && !/not built/.test(status.all);
    return { ok: statusRan && v.code === 0, detail: `installed runtime status exit ${status.code} (0 or 1 is a completed evaluation); verify exit ${v.code}` };
  } finally { renameSync(moved, fork); }
}, { requires: ["P1"] });

let lessonFile = null;
await R.step("L1", "a lesson recorded in the project is proposed to the company fork, scrubbed", () => {
  if (!built("record") || !built("propose")) return { ok: false, detail: "record or propose is not built yet" };
  const bin = join(installedPath("workflow"), "bin", "skillgate");
  const rec = run(bin, ["record", "lesson", "A removed delivery check was only flagged, not stopped", "--dir", app, "--apply"], { env, cwd: app });
  const dir = join(app, "docs", "lessons");
  lessonFile = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => join(dir, f))[0] : null;
  if (!lessonFile) return { ok: false, detail: `record exit ${rec.code}; no lesson entry file found: ${rec.all.slice(-300)}` };
  const text = readFileSync(lessonFile, "utf8")
    .replace(/## What broke\n+[^#]*/, "## What broke\n\nA change removed the test check from .skillgate/delivery.json together with a code change. Review said NEEDS ATTENTION and it was merged.\n\n")
    .replace(/## The rule\n+[^#]*/, "## The rule\n\nRemoving or loosening a validation check is a STOP in review until whoever approves the checks agrees.\n\n");
  writeFileSync(lessonFile, text);
  commitAll(app, "Lesson: removed delivery check", [lessonFile.slice(app.length + 1)]);
  const prop = sg(["propose", lessonFile, "--repo", fork, "--apply"], { cwd: fork });
  const proposals = existsSync(join(fork, "proposals")) ? readdirSync(join(fork, "proposals")) : [];
  if (prop.code === 0 && proposals.length) commitAll(fork, "Proposal from a project lesson", proposals.map((p) => `proposals/${p}`));
  return { ok: prop.code === 0 && proposals.length === 1, detail: `record exit ${rec.code}; propose exit ${prop.code}; proposals: ${proposals.length}` };
}, { requires: ["P1"] });

const improvementDir = join(REPO, "scripts", "rehearsals", "fixtures", "improvement-policy-weakening");
let evalEvidence = [];
async function runEval(label) {
  const out = join(ws, `eval-${label}`);
  const e = run(claude.path, ["plugin", "eval", join(fork, "packs", "base", "plugins", "workflow"), "--case", "review-policy-weakening", "--runs", "1", "--ablation", "none", "--scaffold", "--trust-plugin", "--no-publish", "--output-dir", out], { env: { ...process.env, SKILLGATE_DENYLIST: denylist }, timeoutMs: 900000 });
  const agg = existsSync(join(out, "aggregate-result.json")) ? readJson(join(out, "aggregate-result.json")) : null;
  // aggregate-result.json schemaVersion 1: cases[].arms[arm][] runs, each with graders[] { name, passed } (scripts/evidence.mjs reads the same).
  const runs = agg?.schemaVersion === 1 ? Object.values(agg.cases?.find((c) => c.name === "review-policy-weakening")?.arms ?? {}).flat() : [];
  const stopPassed = runs.length > 0 && runs.every((r) => (r.graders ?? []).find((g) => g.name === "verdict-stop")?.passed === true);
  return { exit: e.code, agg, out, stopPassed, tail: e.all.slice(-300) };
}

await R.step("I1", "the improvement: review skill rule, template sentence, eval case, version bump, offline checks", async () => {
  const rule = readJson(join(improvementDir, "review-stop-rule.json"));
  const skillFile = join(fork, rule.file);
  const skill = readFileSync(skillFile, "utf8");
  if (skill.split(rule.find).length !== 2) return { ok: false, critical: true, detail: "the review skill no longer contains the anchor text the improvement replaces" };
  cpSync(join(improvementDir, "evals", "review-policy-weakening"), join(fork, "packs", "base", "plugins", "workflow", "evals", "review-policy-weakening"), { recursive: true });
  if (flags["with-eval"]) {
    const before = await runEval("before");
    R.note(`eval before the improvement: exit ${before.exit}; STOP grader passed: ${before.stopPassed}`);
    evalEvidence.push(["before", before]);
  }
  writeFileSync(skillFile, skill.replace(rule.find, rule.replace));
  const tpl = join(fork, "packs", "base", "plugins", "workflow", "templates", "harness.md");
  const anchor = "### Before committing\n";
  writeFileSync(tpl, readFileSync(tpl, "utf8").replace(anchor, `${anchor}- **Instructed:** a change that removes or loosens a check in \`.skillgate/delivery.json\` or a CI workflow gets a STOP verdict in review until whoever approves the repository's checks agrees.\n`));
  const from = pluginVersion(fork);
  bumpWorkflow(fork, nextPatch(from));
  const checks = ["packs.test.mjs", "skillgate.test.mjs"].map((t) => [t, run(process.execPath, [join(fork, "scripts", t)], { cwd: fork, env })]);
  const evDir = join(fork, "evidence", "releases", "1.1.0");
  mkdirSync(evDir, { recursive: true });
  writeFileSync(join(evDir, "offline-checks.txt"), checks.map(([t, r]) => `== node scripts/${t}: exit ${r.code}\n${r.out.split("\n").slice(-3).join("\n")}`).join("\n"));
  const paths = [rule.file, "packs/base/plugins/workflow/templates/harness.md", "packs/base/plugins/workflow/.claude-plugin/plugin.json", "packs/base/plugins/workflow/evals/review-policy-weakening", "evidence/releases/1.1.0/offline-checks.txt"];
  if (flags["with-eval"]) {
    const after = await runEval("after");
    R.note(`eval after the improvement: exit ${after.exit}; STOP grader passed: ${after.stopPassed}`);
    evalEvidence.push(["after", after]);
    if (after.agg) {
      const summary = run(process.execPath, [join(fork, "scripts", "evidence.mjs"), join(after.out, "aggregate-result.json"), "--sha", git(fork, ["rev-parse", "HEAD"], { env }).out.trim()], { cwd: fork, env });
      R.note(`eval evidence summary: exit ${summary.code}`);
    }
  }
  commitAll(fork, `Review stops on removed validation checks (workflow ${nextPatch(from)})`, paths);
  const ok = checks.every(([, r]) => r.code === 0) && (!flags["with-eval"] || (evalEvidence.length === 2 && !evalEvidence[0][1].stopPassed && evalEvidence[1][1].stopPassed));
  return { ok, critical: true, detail: `workflow ${from} to ${nextPatch(from)}; offline checks ${checks.map(([t, r]) => `${t}:${r.code}`).join(" ")}${flags["with-eval"] ? `; eval STOP grader before ${evalEvidence[0]?.[1].stopPassed}, after ${evalEvidence[1]?.[1].stopPassed}` : "; behavior eval not run (pass --with-eval)"}` };
}, { requires: ["L1"] });

await R.step("I2", "release 1.1.0 created with its evidence and signed", () => {
  const create = sg(["release", "create", "--version", "1.1.0", "--evidence", "evidence/releases/1.1.0/offline-checks.txt", "--apply"], { cwd: fork });
  if (create.code) return { ok: false, critical: true, detail: `create exit ${create.code}: ${create.all.slice(-400)}` };
  commitAll(fork, "Release 1.1.0 manifest", ["releases/1.1.0.json"]);
  const sign = sg(["release", "sign", "1.1.0", "--apply"], { cwd: fork });
  const list = sg(["release", "list", "--company", "acme"], { cwd: fork });
  return { ok: sign.code === 0 && /^approved\s+1\.1\.0\b/m.test(list.out), critical: true, detail: `sign exit ${sign.code}; list: ${list.out.split("\n").filter((l) => /^(approved|unapproved|withdrawn)/.test(l)).join("; ")}` };
}, { requires: ["I1"] });

await R.step("U1", "the Claude Code environment receives the improved skill and verifies it", () => {
  const mu = cc(["plugin", "marketplace", "update", "skillgate"]);
  const pu = cc(["plugin", "update", "workflow@skillgate"]);
  const version = installedVersion("workflow");
  const rule = readJson(join(improvementDir, "review-stop-rule.json"));
  const hasRule = readFileSync(join(installedPath("workflow"), "skills", "review", "SKILL.md"), "utf8").includes(rule.replace);
  const v = verifyB();
  return { ok: mu.code === 0 && pu.code === 0 && version === pluginVersion(fork) && hasRule && v.code === 0, detail: `marketplace update ${mu.code}; plugin update ${pu.code}; installed ${version}; improved rule present: ${hasRule}; verify exit ${v.code} (${jsonResult(v)?.summary ?? ""})` };
}, { requires: ["I2", "C1"] });

await R.step("U2", "the Codex environment receives the improved skill and verifies it", () => {
  const up = cx(["plugin", "marketplace", "upgrade", "skillgate"]);
  const add = cx(["plugin", "add", "workflow@skillgate", "--json"]);
  const v = sg(["verify", "--client", "codex", "--config-dir", codexC, "--source", fork, "--company", "acme", "--json"]);
  return { ok: up.code === 0 && add.code === 0 && v.code === 0, detail: `marketplace upgrade ${up.code}; plugin add ${add.code}; verify exit ${v.code} (${jsonResult(v)?.summary ?? v.all.slice(-200)})` };
}, { requires: ["I2", "X1"] });

await R.step("M1", "the project applies the release's migration, rolls it back, and applies it again, keeping human text", () => {
  if (!built("migrate")) return { ok: false, detail: "migrate is not built yet" };
  const bin = join(installedPath("workflow"), "bin", "skillgate");
  appendFileSync(join(app, "CLAUDE.md"), "\nA note a person added after preparing.\n");
  commitAll(app, "Human note", ["CLAUDE.md"]);
  const preview = run(bin, ["migrate", "--dir", app], { env });
  const apply = run(bin, ["migrate", "--dir", app, "--apply", "--json"], { env });
  const receipts = existsSync(join(app, ".skillgate", "migrations")) ? readdirSync(join(app, ".skillgate", "migrations")) : [];
  const text = readFileSync(join(app, "CLAUDE.md"), "utf8");
  const refreshed = text.includes("gets a STOP verdict in review") && text.includes("A note a person added after preparing.") && text.includes("Human notes that Skillgate must keep.");
  const id = receipts[0]?.replace(/\.json$/, "");
  const rollback = id ? run(bin, ["migrate", "--dir", app, "--rollback", id, "--apply"], { env }) : { code: -1, all: "no receipt" };
  const rolledBack = !readFileSync(join(app, "CLAUDE.md"), "utf8").includes("gets a STOP verdict in review");
  const again = run(bin, ["migrate", "--dir", app, "--apply"], { env });
  const final = readFileSync(join(app, "CLAUDE.md"), "utf8").includes("gets a STOP verdict in review");
  return { ok: preview.code === 1 && apply.code === 0 && receipts.length === 1 && refreshed && rollback.code === 0 && rolledBack && again.code === 0 && final, detail: `preview exit ${preview.code} (1 = migration pending); apply ${apply.code}; receipts ${receipts.length}; block refreshed with human text kept: ${refreshed}; rollback ${rollback.code} restored: ${rolledBack}; reapply ${again.code}` };
}, { requires: ["U1", "P1"] });

await R.step("T1", "a tampered install is reported TAMPERED with the file named, and a reinstall restores VERIFIED", () => {
  const hook = join(installedPath("guardrails"), "hooks", "guard-bash.sh");
  appendFileSync(hook, "\n# tampered\n");
  const v = verifyB();
  const j = jsonResult(v);
  const named = /guard-bash\.sh/.test(JSON.stringify(j ?? v.out));
  const un = cc(["plugin", "uninstall", "guardrails@skillgate"]);
  const re = cc(["plugin", "install", "guardrails@skillgate"]);
  const v2 = verifyB();
  return { ok: v.code === 1 && /TAMPERED/.test(JSON.stringify(j ?? v.out)) && named && un.code === 0 && re.code === 0 && v2.code === 0, detail: `verify exit ${v.code} naming guard-bash.sh: ${named}; reinstall ${un.code}/${re.code}; verify again ${v2.code}` };
}, { requires: ["U1"] });

await R.step("A1", "an unauthorized release (unsigned bump with a changed hook, plus a tag signed by an untrusted key) reaches the environment and is not VERIFIED", () => {
  const hook = join(fork, "packs", "base", "plugins", "workflow", "hooks", "session-start-handoff.sh");
  appendFileSync(hook, "\n# rehearsal: an unreviewed change that would run on every session start\n");
  const from = pluginVersion(fork);
  bumpWorkflow(fork, nextPatch(from));
  commitAll(fork, "Unreviewed workflow change", ["packs/base/plugins/workflow/hooks/session-start-handoff.sh", "packs/base/plugins/workflow/.claude-plugin/plugin.json"]);
  const intruderEnv = { ...env };
  const tag = run("git", ["-c", "gpg.format=ssh", "-c", `user.signingkey=${join(keys, "intruder-example-invalid")}`, "tag", "-s", `skillgate-release/9.9.9`, "-m", "skillgate release 9.9.9", "-m", "manifest-sha256: 0000"], { cwd: fork, env: intruderEnv });
  const list = sg(["release", "list", "--company", "acme"], { cwd: fork });
  cc(["plugin", "marketplace", "update", "skillgate"]);
  const pu = cc(["plugin", "update", "workflow@skillgate"]);
  const version = installedVersion("workflow");
  const v = verifyB();
  const j = jsonResult(v);
  const unknown = /UNKNOWN VERSION/.test(JSON.stringify(j ?? v.out));
  R.note(`unauthorized release: the environment updated to ${version} (plugin update exit ${pu.code}); verify exit ${v.code}; release list exit ${list.code} with the untrusted tag`);
  return { ok: tag.code === 0 && version === pluginVersion(fork) && unknown && v.code !== 0 && !/^approved\s+9\.9\.9/m.test(list.out), detail: `untrusted tag created: ${tag.code === 0}; environment received ${version}; verify exit ${v.code}, UNKNOWN VERSION reported: ${unknown}; 9.9.9 never listed approved` };
}, { requires: ["U1"] });

await R.step("R1", "rollback: the company removes the bad tag and reverts; the environment downgrades and verifies", () => {
  git(fork, ["tag", "-d", "skillgate-release/9.9.9"], { env });
  const rev = git(fork, ["revert", "--no-edit", "HEAD"], { env });
  cc(["plugin", "marketplace", "update", "skillgate"]);
  const pu = cc(["plugin", "update", "workflow@skillgate"]);
  const version = installedVersion("workflow");
  const v = verifyB();
  return { ok: rev.code === 0 && version === pluginVersion(fork) && v.code === 0, detail: `revert ${rev.code}; plugin update ${pu.code}; installed ${version}; verify exit ${v.code}` };
}, { requires: ["A1"] });

await R.step("W1", "withdrawal: a signed withdrawal makes the installed release WITHDRAWN", () => {
  const w = sg(["release", "withdraw", "1.1.0", "--reason", "rehearsal withdrawal", "--apply"], { cwd: fork });
  const v = verifyB();
  const withdrawn = /WITHDRAWN/.test(JSON.stringify(jsonResult(v) ?? v.out));
  return { ok: w.code === 0 && v.code === 1 && withdrawn, detail: `withdraw exit ${w.code}; verify exit ${v.code}; WITHDRAWN reported: ${withdrawn}` };
}, { requires: ["R1"] });

await R.step("S1", "a skill folder holding a secret-shaped value is refused at import", () => {
  const src = join(ws, "leaky-skill");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "SKILL.md"), `---\nname: leaky-skill\ndescription: rehearsal\n---\n\nkey: ${"AKIA"}${"REHEARSALFAKE0001"}\n`);
  const r = sg(["import", src, "--into", "workflow"], { cwd: fork });
  return { ok: r.code === 2 && !r.all.includes("REHEARSALFAKE0001"), detail: `import exit ${r.code}; the value was not printed` };
}, { requires: ["F1"] });

await R.step("D1", "removal: plugins uninstalled, managed content removed, records and history kept", () => {
  if (!built("remove")) return { ok: false, detail: "remove is not built yet" };
  const before = git(app, ["rev-list", "--count", "HEAD"], { env }).out.trim();
  const uninstalls = ["workflow", "guardrails", "context-hygiene"].map((p) => cc(["plugin", "uninstall", `${p}@skillgate`]).code);
  const rm = sg(["remove", "--dir", app, "--apply"]);
  const claudeMd = readFileSync(join(app, "CLAUDE.md"), "utf8");
  const blockGone = !claudeMd.includes("skillgate:harness:start");
  const humanKept = claudeMd.includes("Human notes that Skillgate must keep.");
  const recordsKept = existsSync(join(app, "docs", "lessons")) && existsSync(join(app, ".skillgate", "migrations"));
  const after = git(app, ["rev-list", "--count", "HEAD"], { env }).out.trim();
  const v = verifyB();
  return { ok: uninstalls.every((c) => c === 0) && rm.code === 0 && blockGone && humanKept && recordsKept && before === after && v.code === 1, detail: `uninstalls ${uninstalls.join(" ")}; remove exit ${rm.code}; block removed ${blockGone}; human text kept ${humanKept}; records kept ${recordsKept}; commits ${before} before and ${after} after; verify exit ${v.code} (nothing installed)` };
}, { requires: ["M1"] });

R.note("Security-review cases (PLAN.md section 8): ref drift and an unauthorized release reaching an environment (A1); exact approved content versus tampering (T1); withdrawn but installed code (W1); private material in a skill import (S1). Escaping manifest paths are covered by scripts/release.test.mjs; local guardrail bypass limits by scripts/guardrails.test.sh and the guardrails skill.");
R.note("What this does not show: a malicious hook that an approver reviewed and signed would verify. Release verification proves the installed bytes are what was approved, not that what was approved is safe; review of executable files (hooks, bin, runtime) is the control for that.");

const meta = { "Claude Code": claude.version, Codex: codex?.version ?? "not found", "Behavior eval": flags["with-eval"] ? "run" : "not run (pass --with-eval)", Node: process.version };
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exit(R.failed ? 1 : 0);
