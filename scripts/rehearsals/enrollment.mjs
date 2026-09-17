#!/usr/bin/env node
// enrollment.mjs: the PLAN.md M12 enrollment spike (docs/PHASE-3.md, "Riskiest assumption, tested first"). Do a
// company's plugins install on a clean machine from a Claude Code managed settings file alone, with no developer
// command, and how many session starts pass before they are active?
//
//   node scripts/rehearsals/enrollment.mjs [--claude-version <x.y.z>] [--no-github] [--keep-image] [--no-evidence]
//   node scripts/rehearsals/enrollment.mjs --self-test   proves the session judgement can fail; needs no Docker
//
// Each scenario runs in a new Linux container built with a pinned Claude Code version. Root places files the way
// device management places them (a drop-in in /etc/claude-code/managed-settings.d/, and in one scenario a read-only
// plugin seed), and an unprivileged user runs Claude Code. Nothing from the host is mounted: files go in with
// `docker cp`, and scripts go in on standard input.
//
// No login and no credential. A session start reaches plugin loading only when Claude Code believes it can reach a
// model, so the starts use a placeholder API key and a model endpoint on the container's own loopback that accepts
// connections and never answers; each start is stopped after START_SECONDS. The plugin behavior measured is the real
// client's, cloning the real marketplace. A claude.ai login may behave differently and is not measured here.
//
// A plugin counts as active in a session only when the session's init event lists its skills and each of its
// SessionStart hooks reports success. The init event's plugin list is not enough: it also names enabled plugins that
// have not loaded.
//
// The steps assert the behavior measured on 2026-09-17 with Claude Code 2.1.274. A FAIL on another version means that
// version behaves differently, which is a finding to record, not an expectation to change without saying so.
//
// Costs: nothing. Needs Docker. Building the image needs network access, and so do the scenarios that read the public
// GitHub repository; --no-github marks those NOT RUN.
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 the rehearsal could not start.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO, Rehearsal, git, parseFlags, run, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { "claude-version": "value", "no-github": "flag", "keep-image": "flag", "no-evidence": "flag", "self-test": "flag" });
const VERSION = flags["claude-version"] ?? "2.1.274";
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) { console.log(`NOT RUN: --claude-version must be a version such as 2.1.274, not "${VERSION}".`); process.exit(2); }

const docker = (args, { timeoutMs = 600000, input } = {}) => run("docker", args, { timeoutMs, input });

const GITHUB_REPO = "MojoAI-King/Skilliton";
const MARKET = "skilliton";
const PLUGINS = ["workflow", "guardrails", "context-hygiene"];
const BASE_IMAGE = "node:22-bookworm-slim";
const IMAGE = `skilliton-enrollment-spike:${VERSION}`;
const START_SECONDS = 30;
const DROP_IN = "/etc/claude-code/managed-settings.d/50-skilliton.json";
const FOLDER = "/opt/company-skills";
const SEED = "/opt/skilliton-seed";
const PLACEHOLDER = { ANTHROPIC_API_KEY: "placeholder-not-a-credential", ANTHROPIC_BASE_URL: "http://127.0.0.1:8080" };
const GITHUB_SOURCE = { source: "github", repo: GITHUB_REPO };
const FOLDER_SOURCE = { source: "directory", path: FOLDER };

const tail = (text, n = 240) => String(text).trim().replace(/\s+/g, " ").slice(-n);

// ---------- the image ----------

const REPORT_CJS = `"use strict";
// Summarises one \`claude -p --output-format stream-json --verbose --include-hook-events\` run as JSON.
const fs = require("node:fs");
const out = { init: false, listedPlugins: [], pluginSkills: [], hooks: {}, text: "" };
for (const line of fs.readFileSync(process.argv[2], "utf8").split("\\n")) {
  let e;
  try { e = JSON.parse(line); } catch { if (line.trim()) out.text += line.trim().slice(0, 200) + " "; continue; }
  if (e.type === "system" && e.subtype === "init") {
    out.init = true;
    out.listedPlugins = (e.plugins || []).map((p) => p.source || p.name);
    out.pluginSkills = (e.skills || []).filter((s) => s.includes(":"));
  } else if (e.type === "system" && e.subtype === "hook_response" && e.hook_event === "SessionStart") {
    // Each plugin's SessionStart output starts with its own tag, such as [workflow].
    const tag = /^\\[([a-z0-9-]+)\\]/.exec(String(e.stdout || e.output || ""));
    const name = tag ? tag[1] : "untagged";
    (out.hooks[name] = out.hooks[name] || []).push(e.outcome === "success" && e.exit_code === 0 ? "success" : String(e.outcome) + " exit " + e.exit_code);
  }
}
process.stdout.write(JSON.stringify(out) + "\\n");
`;

const SILENT_ENDPOINT_CJS = `"use strict";
// A model endpoint on the container's loopback that accepts connections and never answers.
require("node:http").createServer((req) => { req.resume(); }).listen(8080, "127.0.0.1");
`;

const DOCKERFILE = `FROM ${BASE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps && rm -rf /var/lib/apt/lists/*
ARG CLAUDE_VERSION
RUN npm install -g "@anthropic-ai/claude-code@\${CLAUDE_VERSION}"
RUN useradd -m -s /bin/bash dev
COPY report.cjs silent-endpoint.cjs /opt/spike/
`;

// ---------- judging a session ----------

const isActive = (rep) => PLUGINS.every((p) => rep.pluginSkills.some((s) => s.startsWith(`${p}:`)) && (rep.hooks[p] ?? []).length > 0 && rep.hooks[p].every((h) => h === "success"));
const isInactive = (rep) => rep.pluginSkills.every((s) => !PLUGINS.some((p) => s.startsWith(`${p}:`))) && PLUGINS.every((p) => !rep.hooks[p]);
const describe = (rep) => (isActive(rep)
  ? `active (${rep.pluginSkills.filter((s) => PLUGINS.some((p) => s.startsWith(`${p}:`))).length} plugin skills; SessionStart hooks succeeded for ${PLUGINS.join(", ")})`
  : isInactive(rep) ? `not active (no plugin skills or hooks${rep.listedPlugins.length ? `; the init event still listed ${rep.listedPlugins.length} plugin(s)` : ""})` : `partly active (skills ${JSON.stringify(rep.pluginSkills)}, hooks ${JSON.stringify(rep.hooks)})`);

// Runs the in-container report on synthetic stream-json runs and checks the judgement, including runs it must not
// call active. Needs Node only.
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "skilliton-enrollment-self-test-"));
  const init = (skills, plugins = PLUGINS) => ({ type: "system", subtype: "init", plugins: plugins.map((p) => ({ name: p, source: `${p}@${MARKET}` })), skills });
  const hook = (plugin, outcome = "success", exit = 0) => ({ type: "system", subtype: "hook_response", hook_event: "SessionStart", stdout: `[${plugin}] ready`, outcome, exit_code: exit });
  const allSkills = ["workflow:task", "workflow:review", "guardrails:guardrails", "context-hygiene:context-hygiene", "debug"];
  const cases = [
    { name: "every plugin's skills and successful hooks is active", events: [init(allSkills), ...PLUGINS.map((p) => hook(p))], active: true, inactive: false },
    { name: "plugins listed with no skills or hooks is not active", events: [init(["debug"])], active: false, inactive: true },
    { name: "a failed hook is not active", events: [init(allSkills), hook("workflow"), hook("guardrails", "error", 1), hook("context-hygiene")], active: false, inactive: false },
    { name: "a missing plugin's skills is not active", events: [init(allSkills.filter((s) => !s.startsWith("guardrails:"))), ...PLUGINS.map((p) => hook(p))], active: false, inactive: false },
    { name: "a plugin with skills but no hook is not active", events: [init(allSkills), hook("workflow"), hook("guardrails")], active: false, inactive: false },
    { name: "an untagged hook does not count for any plugin", events: [init(allSkills), { ...hook("workflow"), stdout: "ready" }, hook("guardrails"), hook("context-hygiene")], active: false, inactive: false },
    { name: "a hook for another event does not count", events: [init(allSkills), { ...hook("workflow"), hook_event: "Stop" }, hook("guardrails"), hook("context-hygiene")], active: false, inactive: false },
  ];
  let failed = 0;
  try {
    writeFileSync(join(dir, "report.cjs"), REPORT_CJS);
    for (const c of cases) {
      const file = join(dir, "run.jsonl");
      writeFileSync(file, `${c.events.map((e) => JSON.stringify(e)).join("\n")}\nnot json\n`);
      const r = run(process.execPath, [join(dir, "report.cjs"), file]);
      let rep = null;
      try { rep = JSON.parse(r.out); } catch { /* reported below */ }
      const ok = rep !== null && isActive(rep) === c.active && isInactive(rep) === c.inactive;
      console.log(`${ok ? "ok  " : "FAIL"} ${c.name}${rep ? "" : ` (no report: ${tail(r.all)})`}`);
      if (!ok) failed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : "\nself-test passed: the session judgement fails on inactive, partial and failed runs");
  return failed ? 1 : 0;
}

if (flags["self-test"]) process.exit(selfTest());

const dockerServer = docker(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 30000 });
if (dockerServer.code !== 0) { console.log(`NOT RUN: Docker is not available (${dockerServer.all.trim().slice(0, 200)}).`); process.exit(2); }
const ws = workspace("enrollment");
const R = new Rehearsal("enrollment", "Enrollment spike: company plugins from managed settings on a clean Linux machine (M12)");
const meta = { "Claude Code": VERSION, "Base image": BASE_IMAGE, Docker: dockerServer.out.trim(), "Start length": `${START_SECONDS} seconds, then stopped` };

// ---------- containers ----------

const live = new Set();
const removeAll = () => { for (const id of live) docker(["rm", "-f", id], { timeoutMs: 60000 }); live.clear(); };
process.on("exit", removeAll);
process.on("SIGINT", () => { removeAll(); process.exit(130); });

function newMachine() {
  const started = docker(["run", "-d", "--rm", IMAGE, "sh", "-c", "node /opt/spike/silent-endpoint.cjs & exec sleep 3600"], { timeoutMs: 120000 });
  if (started.code !== 0) throw new Error(`docker run failed: ${tail(started.all)}`);
  const id = started.out.trim();
  live.add(id);
  const exec = (user, script, env = {}) => docker(["exec", "-i", ...user, ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), id, "bash", "-s"], { input: script });
  const m = {
    root: (script) => exec([], script),
    dev: (script, env = {}) => exec(["-u", "dev", "-w", "/home/dev"], script, { HOME: "/home/dev", ...env }),
    copy: (from, to) => docker(["cp", from, `${id}:${to}`]),
    remove: () => { docker(["rm", "-f", id], { timeoutMs: 60000 }); live.delete(id); },
  };
  const ready = m.root("for i in $(seq 50); do (echo > /dev/tcp/127.0.0.1/8080) 2>/dev/null && exit 0; sleep 0.1; done; exit 1");
  if (ready.code !== 0) throw new Error("the placeholder model endpoint did not start");
  return m;
}

async function withMachine(fn) {
  const m = newMachine();
  try { return await fn(m); } finally { m.remove(); }
}

function managedSettings(source, extra = {}) {
  const marketplace = source.source === "github" ? { source, autoUpdate: true } : { source };
  return JSON.stringify({ ...extra, extraKnownMarketplaces: { [MARKET]: marketplace }, enabledPlugins: Object.fromEntries(PLUGINS.map((p) => [`${p}@${MARKET}`, true])) }, null, 2);
}

function placeManaged(m, text) {
  const r = m.root(`set -eu\ninstall -d -m 0755 /etc/claude-code/managed-settings.d\ncat > ${DROP_IN} <<'SKILLITON_JSON'\n${text}\nSKILLITON_JSON\nchmod 0644 ${DROP_IN}\n`);
  if (r.code !== 0) throw new Error(`placing the managed settings failed: ${tail(r.all)}`);
}

let skillsArchive = null;
function placeFolderMarketplace(m) {
  if (!skillsArchive) {
    skillsArchive = join(ws, "skills.tar");
    const a = git(REPO, ["archive", "--format=tar", "-o", skillsArchive, "HEAD"]);
    if (a.code !== 0) throw new Error(`git archive failed: ${tail(a.all)}`);
  }
  const c = m.copy(skillsArchive, "/tmp/skills.tar");
  if (c.code !== 0) throw new Error(`docker cp failed: ${tail(c.all)}`);
  const r = m.root(`set -eu\ninstall -d -m 0755 ${FOLDER}\ntar -xf /tmp/skills.tar -C ${FOLDER}\nchown -R root:root ${FOLDER}\nchmod -R a+rX,go-w ${FOLDER}\nrm /tmp/skills.tar\n`);
  if (r.code !== 0) throw new Error(`placing the folder marketplace failed: ${tail(r.all)}`);
}

// One session start as the developer. Returns the report of what loaded.
function start(m, n, env = PLACEHOLDER) {
  const r = m.dev(`timeout ${START_SECONDS} claude -p "reply ok" --output-format stream-json --verbose --include-hook-events </dev/null >/tmp/start-${n}.jsonl 2>/tmp/start-${n}.err\necho "exit=$?"\nnode /opt/spike/report.cjs /tmp/start-${n}.jsonl\nhead -c 400 /tmp/start-${n}.err\n`, env);
  const lines = r.out.split("\n");
  const exit = Number((/^exit=(\d+)$/m.exec(r.out) ?? [])[1]);
  const json = lines.find((l) => l.startsWith("{"));
  if (!json) throw new Error(`start ${n} produced no report: ${tail(r.all)}`);
  const report = JSON.parse(json);
  report.exit = exit;
  report.err = lines.slice(lines.indexOf(json) + 1).join(" ").trim();
  return report;
}

// The developer's plugin records, read from the files (reading them runs no Claude Code command).
function records(m) {
  const r = m.dev(`cat ~/.claude/plugins/known_marketplaces.json 2>/dev/null || echo null\necho "@@SPLIT@@"\ncat ~/.claude/plugins/installed_plugins.json 2>/dev/null || echo null\n`);
  const [known, installed] = r.out.split("@@SPLIT@@").map((s) => { try { return JSON.parse(s); } catch { return null; } });
  const plugins = installed?.plugins ?? {};
  return {
    marketplace: known?.[MARKET] ?? null,
    installed: PLUGINS.filter((p) => (plugins[`${p}@${MARKET}`] ?? []).length > 0),
    entries: PLUGINS.flatMap((p) => plugins[`${p}@${MARKET}`] ?? []),
  };
}

function pluginList(m, env = {}) {
  const r = m.dev("timeout 60 claude plugin list --json\n", env);
  try { return { code: r.code, list: JSON.parse(r.out) }; } catch { return { code: r.code, list: null, text: tail(r.all) }; }
}

// Collects each expectation's result so a step reports every mismatch, not only the first.
function checks() {
  const failed = [], seen = [];
  return {
    expect(ok, what) { (ok ? seen : failed).push(what); },
    result(extra = "") { return { ok: failed.length === 0, detail: `${failed.length ? `NOT AS MEASURED BEFORE: ${failed.join("; ")}. ` : ""}${seen.join("; ")}${extra ? `. ${extra}` : ""}` }; },
  };
}

// ---------- steps ----------

await R.step("E1", `a clean image with Claude Code ${VERSION} and an unprivileged user builds`, () => {
  const ctx = join(ws, "image");
  mkdirSync(ctx, { recursive: true });
  writeFileSync(join(ctx, "Dockerfile"), DOCKERFILE);
  writeFileSync(join(ctx, "report.cjs"), REPORT_CJS);
  writeFileSync(join(ctx, "silent-endpoint.cjs"), SILENT_ENDPOINT_CJS);
  const b = docker(["build", "-q", "--build-arg", `CLAUDE_VERSION=${VERSION}`, "-t", IMAGE, ctx], { timeoutMs: 1800000 });
  if (b.code !== 0) return { ok: false, critical: true, detail: `docker build failed: ${tail(b.all)}` };
  const v = docker(["run", "--rm", IMAGE, "claude", "--version"], { timeoutMs: 120000 });
  const digest = docker(["image", "inspect", BASE_IMAGE, "--format", "{{index .RepoDigests 0}}"], { timeoutMs: 30000 });
  if (digest.code === 0) meta["Base image"] = digest.out.trim();
  return { ok: v.code === 0 && v.out.includes(VERSION), critical: true, detail: `${v.out.trim()}; no credential, no login, nothing mounted from the host` };
});

await R.step("E2", "control: an unreadable managed drop-in stops Claude Code, so the drop-in folder is read", () => withMachine((m) => {
  placeManaged(m, managedSettings(FOLDER_SOURCE));
  m.root("printf '{' > /etc/claude-code/managed-settings.d/60-broken.json\n");
  const c = checks();
  const list = m.dev("timeout 60 claude plugin list\necho \"exit=$?\"\n");
  const headless = m.dev(`timeout 60 claude -p "reply ok" </dev/null\necho "exit=$?"\n`, PLACEHOLDER);
  for (const [name, r] of [["plugin list", list], ["a session start", headless]]) {
    const message = /[^\n]*could not be parsed as a JSON object[^\n]*/.exec(r.all)?.[0].replace(/^.*?60-broken\.json: /, "") ?? tail(r.all, 140);
    c.expect(/could not be parsed as a JSON object/.test(r.all) && !/exit=0/.test(r.out), `${name} refused with "${message}"`);
  }
  return c.result();
}));

await R.step("E3", "without a login, a session start and plugin list register and install nothing", () => withMachine((m) => {
  placeFolderMarketplace(m);
  placeManaged(m, managedSettings(FOLDER_SOURCE));
  const c = checks();
  const list = pluginList(m);
  c.expect(Array.isArray(list.list) && list.list.length === 0 && !records(m).marketplace, `plugin list printed ${JSON.stringify(list.list)} and registered no marketplace`);
  const headless = m.dev(`timeout 60 claude -p "reply ok" </dev/null\necho "exit=$?"\n`);
  const afterHeadless = records(m);
  c.expect(/Not logged in/.test(headless.all) && afterHeadless.installed.length === 0, `a headless start said "${tail(headless.all.replace(/exit=\d+/, ""), 60)}" and installed ${afterHeadless.installed.length} plugin(s)`);
  const tty = m.dev(`TERM=xterm-256color timeout ${START_SECONDS} script -q -c claude /dev/null </dev/null >/tmp/tty.log 2>&1\nsed -e 's/\\x1b\\[[0-9;?]*[a-zA-Z]//g' /tmp/tty.log | tr -d ' \\r\\n' | head -c 4000\n`);
  const afterTty = records(m);
  c.expect(/Let'sgetstarted/.test(tty.out) && afterTty.installed.length === 0, `an interactive start stopped at the first-run screen ("Let's get started", before any login) and installed ${afterTty.installed.length} plugin(s)`);
  return c.result();
}));

await R.step("E4", "managed settings with the GitHub marketplace: start 1 registers, start 2 installs, start 3 is active", () => {
  if (flags["no-github"]) return { notRun: "--no-github was given" };
  return withMachine((m) => {
    placeManaged(m, managedSettings(GITHUB_SOURCE));
    const c = checks();
    const s1 = start(m, 1), r1 = records(m);
    c.expect(r1.marketplace?.source?.repo === GITHUB_REPO && r1.marketplace?.autoUpdate === true && r1.installed.length === 0 && isInactive(s1), `start 1: marketplace ${r1.marketplace ? `registered (autoUpdate ${r1.marketplace.autoUpdate})` : "not registered"}, ${r1.installed.length} installed, session ${describe(s1)}`);
    const s2 = start(m, 2), r2 = records(m);
    const commits = [...new Set(r2.entries.map((e) => String(e.gitCommitSha ?? "").slice(0, 7)))];
    if (commits.length === 1 && commits[0]) meta["GitHub commit installed"] = commits[0];
    c.expect(r2.installed.length === PLUGINS.length && r2.entries.every((e) => e.scope === "managed") && isInactive(s2), `start 2: ${r2.installed.length} installed (scope ${[...new Set(r2.entries.map((e) => e.scope))].join(", ") || "none"}, commit ${commits.join(", ") || "none"}), session ${describe(s2)}`);
    const s3 = start(m, 3);
    c.expect(isActive(s3), `start 3: session ${describe(s3)}`);
    return c.result("No developer command ran");
  });
});

await R.step("E5", "managed settings with a marketplace folder on the machine: start 1 installs, start 2 is active", () => withMachine((m) => {
  placeFolderMarketplace(m);
  placeManaged(m, managedSettings(FOLDER_SOURCE));
  const c = checks();
  const s1 = start(m, 1), r1 = records(m);
  c.expect(r1.marketplace?.source?.path === FOLDER && isInactive(s1), `start 1: marketplace ${r1.marketplace ? "registered" : "not registered"}, ${r1.installed.length} installed, session ${describe(s1)}`);
  const s2 = start(m, 2), r2 = records(m);
  c.expect(r2.installed.length === PLUGINS.length && r2.entries.every((e) => e.scope === "managed") && isActive(s2), `start 2: ${r2.installed.length} installed (scope ${[...new Set(r2.entries.map((e) => e.scope))].join(", ") || "none"}), session ${describe(s2)}`);
  return c.result("No developer command ran. Claude Code documents the directory source as for development only");
}));

for (const [id, placement] of [["E6", "managed settings env"], ["E7", "the process environment"]]) {
  await R.step(id, `a read-only plugin seed placed by root, its variable set in ${placement}: start 1 is not active, start 2 is`, () => {
    if (flags["no-github"]) return { notRun: "--no-github was given (the seed is built from the GitHub marketplace)" };
    return withMachine((m) => {
      const build = m.root(`export HOME=/root\nCLAUDE_CODE_PLUGIN_CACHE_DIR=${SEED} timeout 180 claude plugin marketplace add ${GITHUB_REPO} || exit 1\nfor p in ${PLUGINS.join(" ")}; do CLAUDE_CODE_PLUGIN_CACHE_DIR=${SEED} timeout 120 claude plugin install "$p@${MARKET}" || exit 1; done\nchown -R root:root ${SEED}\nchmod -R a+rX,go-w ${SEED}\n`);
      if (build.code !== 0) return { ok: false, detail: `building the seed failed: ${tail(build.all)}` };
      const inSettings = id === "E6";
      placeManaged(m, managedSettings(GITHUB_SOURCE, inSettings ? { env: { CLAUDE_CODE_PLUGIN_SEED_DIR: SEED } } : {}));
      const env = inSettings ? PLACEHOLDER : { ...PLACEHOLDER, CLAUDE_CODE_PLUGIN_SEED_DIR: SEED };
      const c = checks();
      const s1 = start(m, 1, env);
      c.expect(isInactive(s1) && s1.listedPlugins.length === PLUGINS.length, `start 1: session ${describe(s1)}`);
      const s2 = start(m, 2, env), r2 = records(m);
      c.expect(isActive(s2), `start 2: session ${describe(s2)}`);
      c.expect(r2.marketplace?.installLocation?.startsWith(SEED) && r2.marketplace?.autoUpdate === false, `the developer's marketplace record points into the seed (${r2.marketplace?.installLocation ?? "none"}) with autoUpdate ${r2.marketplace?.autoUpdate}`);
      return c.result("The seed build ran as root with no login");
    });
  });
}

await R.step("E8", "a first-login install run as the developer before any session: start 1 is active and the plugins become managed", () => {
  if (flags["no-github"]) return { notRun: "--no-github was given" };
  return withMachine((m) => {
    placeManaged(m, managedSettings(GITHUB_SOURCE));
    const c = checks();
    // The commands Skilliton's join runs for Claude Code, run without any login or placeholder.
    const setup = m.dev(`timeout 180 claude plugin marketplace add ${GITHUB_REPO} || exit 1\nfor p in ${PLUGINS.join(" ")}; do timeout 120 claude plugin install "$p@${MARKET}" || exit 1; done\n`);
    c.expect(setup.code === 0, `first-login install ${setup.code === 0 ? "succeeded" : `failed: ${tail(setup.all)}`} with no login`);
    const before = pluginList(m).list ?? [];
    c.expect(before.length === PLUGINS.length && before.every((p) => p.scope === "user"), `before start 1 the plugins were installed with scope ${[...new Set(before.map((p) => p.scope))].join(", ") || "none"}`);
    const s1 = start(m, 1);
    c.expect(isActive(s1), `start 1: session ${describe(s1)}`);
    const after = pluginList(m).list ?? [];
    c.expect(after.length === PLUGINS.length && after.every((p) => p.scope === "managed"), `after start 1: ${after.length} plugin(s) listed, scope ${[...new Set(after.map((p) => p.scope))].join(", ") || "none"}`);
    return c.result();
  });
});

// ---------- notes and evidence ----------

R.note("Every start used a placeholder API key and a model endpoint on the container's loopback that never answers. No model ran, no credential existed, and a claude.ai login was not measured (docs/BACKLOG.md B3).");
R.note("Without a login Claude Code stops before plugin registration: a headless start at \"Not logged in\", an interactive start at the first-run screen. On a real machine the developer's first login comes first; whether registration then happens in that same first session is not measured.");
R.note("The session init event lists enabled plugins even when they have not loaded, so activity is judged by plugin skills and SessionStart hook results only.");
R.note("A macOS clean account was not run. On macOS, managed settings live in a machine-wide folder, so placing them on the build machine would change the owner's own Claude Code sessions; it needs a separate Mac or a macOS virtual machine.");
R.note("`claude plugin marketplace add` reports the marketplace as declared in user settings, so first-login setup writes to the developer's settings; offboarding has to remove that entry.");

const passed = R.steps.filter((s) => s.status === "PASS").length;
console.log(`\n${passed} of ${R.steps.length} steps passed.`);
if (!flags["keep-image"]) docker(["image", "rm", IMAGE], { timeoutMs: 120000 });
meta["Skills repository commit (folder scenarios)"] = git(REPO, ["rev-parse", "--short", "HEAD"]).out.trim();
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
process.exitCode = R.failed ? 1 : 0;
