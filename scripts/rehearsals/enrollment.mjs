#!/usr/bin/env node
// enrollment.mjs: the PLAN.md M12 enrollment spike (docs/PHASE-3.md, "Riskiest assumption, tested first"). Do a
// company's plugins install on a clean machine from a Claude Code managed settings file alone, with no developer
// command, and how many session starts pass before they are active?
//
//   node scripts/rehearsals/enrollment.mjs [--claude-version <x.y.z>] [--no-github] [--keep] [--no-evidence]
//   node scripts/rehearsals/enrollment.mjs --self-test   proves the session judgement can fail; needs no Docker
//
// Each scenario runs in a new Linux container built with a pinned Claude Code version on a base image pinned by
// digest. Root places files the way device management places them (a drop-in in /etc/claude-code/managed-settings.d/,
// and in two scenarios a read-only plugin seed), and an unprivileged user runs Claude Code. Nothing from the host is
// mounted: files go in with `docker cp`, and scripts go in on standard input.
//
// No login and no credential. A session start reaches plugin loading only when Claude Code believes it can reach a
// model, so the starts use a placeholder API key and a model endpoint on the container's own loopback that accepts
// connections and never answers; each start is stopped after START_SECONDS. The plugin behavior measured is the real
// client's, cloning the real marketplace. A claude.ai login may behave differently and is not measured here.
//
// A start counts only when it ran a session until it was stopped: its init event is present, names the pinned Claude
// Code version, and `timeout` ended it. In such a session a plugin is active when the init event lists its skills and
// every SessionStart hook reports success without a failure notice; the init event's plugin list alone is not enough,
// because it also names enabled plugins that have not loaded. A start that crashed is neither active nor inactive.
//
// The steps assert the behavior measured on 2026-09-17 with Claude Code 2.1.274. A FAIL on another version means that
// version behaves differently, which is a finding to record, not an expectation to change without saying so.
//
// Costs: nothing. Needs Docker. Pulling the base image and installing Claude Code need network access, and so do the
// scenarios that read the public GitHub repository; --no-github marks those NOT RUN. Ctrl-C stops the run at the end of
// the step in progress, removes the containers and the image, writes no evidence and exits 130.
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 the rehearsal could not start; 130 interrupted.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO, Rehearsal, git, parseFlags, run, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { "claude-version": "value", "no-github": "flag", keep: "flag", "no-evidence": "flag", "self-test": "flag" });
const VERSION = flags["claude-version"] ?? "2.1.274";
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) { console.log(`NOT RUN: --claude-version must be a version such as 2.1.274, not "${VERSION}".`); process.exit(2); }

const GITHUB_REPO = "MojoAI-King/Skilliton";
const MARKET = "skilliton";
const PLUGINS = ["workflow", "guardrails", "context-hygiene"];
const BASE_IMAGE = "node:22-bookworm-slim";
// One tag per run, so two runs on one machine never replace or remove each other's image.
const IMAGE = `skilliton-enrollment-spike:${VERSION}-${process.pid}`;
const START_SECONDS = 30;
const DROP_IN = "/etc/claude-code/managed-settings.d/50-skilliton.json";
const FOLDER = "/opt/company-skills";
const SEED = "/opt/skilliton-seed";
const PLACEHOLDER = { ANTHROPIC_API_KEY: "placeholder-not-a-credential", ANTHROPIC_BASE_URL: "http://127.0.0.1:8080" };
const GITHUB_SOURCE = { source: "github", repo: GITHUB_REPO };
const FOLDER_SOURCE = { source: "directory", path: FOLDER };

const tail = (text, n = 240) => String(text).trim().replace(/\s+/g, " ").slice(-n);

// ---------- what runs inside the container ----------

const REPORT_CJS = `"use strict";
// Summarises one \`claude -p --output-format stream-json --verbose --include-hook-events\` run as JSON.
const fs = require("node:fs");
// Notices the base plugins' SessionStart hooks print when they fail while still exiting 0.
const FAILURE = /hook failed|did not run|status check failed|node was not found|awk exited/i;
const out = { init: false, version: null, apiKeySource: null, listedPlugins: [], pluginSkills: [], hooks: {} };
for (const line of fs.readFileSync(process.argv[2], "utf8").split("\\n")) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.type === "system" && e.subtype === "init") {
    out.init = true;
    out.version = e.claude_code_version || null;
    out.apiKeySource = e.apiKeySource || null;
    out.listedPlugins = (e.plugins || []).map((p) => p.source || p.name);
    out.pluginSkills = (e.skills || []).filter((s) => s.includes(":"));
  } else if (e.type === "system" && e.subtype === "hook_response" && e.hook_event === "SessionStart") {
    const text = String(e.stdout || e.output || "");
    // Each base plugin's SessionStart output starts with its own tag, such as [workflow].
    const tag = /^\\[([a-z0-9-]+)\\]/.exec(text);
    const first = text.split("\\n")[0].slice(0, 120);
    (out.hooks[tag ? tag[1] : "untagged"] = out.hooks[tag ? tag[1] : "untagged"] || []).push({ ok: e.outcome === "success" && e.exit_code === 0 && !FAILURE.test(text), outcome: String(e.outcome), exit: e.exit_code, first });
  }
}
process.stdout.write(JSON.stringify(out) + "\\n");
`;

const SILENT_ENDPOINT_CJS = `"use strict";
// A model endpoint on the container's loopback that accepts connections and never answers.
require("node:http").createServer((req) => { req.resume(); }).listen(8080, "127.0.0.1");
`;

const dockerfile = (base) => `FROM ${base}
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps && rm -rf /var/lib/apt/lists/*
ARG CLAUDE_VERSION
RUN npm install -g "@anthropic-ai/claude-code@\${CLAUDE_VERSION}"
RUN useradd -m -s /bin/bash dev
COPY report.cjs silent-endpoint.cjs /opt/spike/
`;

// ---------- judging a session ----------

const pluginSkills = (rep) => rep.pluginSkills.filter((s) => PLUGINS.some((p) => s.startsWith(`${p}:`)));
// The start ran a session of the pinned version until `timeout` stopped it (exit 124).
const ranSession = (rep) => rep.init && rep.version === VERSION && rep.exit === 124;
const hooksOk = (list) => (list ?? []).every((h) => h.ok);
const isActive = (rep) => ranSession(rep) && hooksOk(rep.hooks.untagged)
  && PLUGINS.every((p) => rep.pluginSkills.some((s) => s.startsWith(`${p}:`)) && (rep.hooks[p] ?? []).length > 0 && hooksOk(rep.hooks[p]));
const isInactive = (rep) => ranSession(rep) && pluginSkills(rep).length === 0 && PLUGINS.every((p) => !rep.hooks[p]);
function describe(rep) {
  if (!ranSession(rep)) return `did not run a session as expected (exit ${rep.exit}, init event ${rep.init ? `present, version ${rep.version}` : "absent"})`;
  if (isActive(rep)) return `active (${pluginSkills(rep).length} plugin skills; SessionStart hooks succeeded for ${PLUGINS.join(", ")})`;
  if (isInactive(rep)) return `not active (no plugin skills or hooks${rep.listedPlugins.length ? `; the init event still listed ${rep.listedPlugins.length} plugin(s)` : ""})`;
  const hooks = Object.entries(rep.hooks).map(([name, list]) => `${name}: ${list.map((h) => (h.ok ? "ok" : `${h.outcome} exit ${h.exit} "${h.first}"`)).join(", ")}`);
  return `partly active (plugin skills ${JSON.stringify(pluginSkills(rep))}; hooks ${hooks.join("; ") || "none"})`;
}

// Runs the in-container report on synthetic stream-json runs and checks the judgement, including runs it must not
// call active or inactive. Needs Node only.
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "skilliton-enrollment-self-test-"));
  const init = (skills, extra = {}) => ({ type: "system", subtype: "init", claude_code_version: VERSION, apiKeySource: "ANTHROPIC_API_KEY", plugins: PLUGINS.map((p) => ({ name: p, source: `${p}@${MARKET}` })), skills, ...extra });
  const hook = (plugin, extra = {}) => ({ type: "system", subtype: "hook_response", hook_event: "SessionStart", stdout: `[${plugin}] ready`, outcome: "success", exit_code: 0, ...extra });
  const skills = ["workflow:task", "workflow:review", "guardrails:guardrails", "context-hygiene:context-hygiene", "debug"];
  const allHooks = PLUGINS.map((p) => hook(p));
  const cases = [
    { name: "every plugin's skills and successful hooks is active", events: [init(skills), ...allHooks], active: true, inactive: false },
    { name: "plugins listed with no skills or hooks is not active", events: [init(["debug"])], active: false, inactive: true },
    { name: "no init event is neither active nor inactive", events: [], active: false, inactive: false },
    { name: "a start that ended by itself is neither", events: [init(["debug"])], exit: 1, active: false, inactive: false },
    { name: "another Claude Code version is neither", events: [init(skills, { claude_code_version: "0.0.1" }), ...allHooks], active: false, inactive: false },
    { name: "a failed hook is not active", events: [init(skills), hook("workflow"), hook("guardrails", { outcome: "error", exit_code: 1 }), hook("context-hygiene")], active: false, inactive: false },
    { name: "a failure notice with exit 0 is not active", events: [init(skills), ...allHooks, hook("workflow", { stdout: "[workflow] Skilliton session-start hook failed (boom); nothing was blocked" })], active: false, inactive: false },
    { name: "an untagged failing hook is not active", events: [init(skills), ...allHooks, hook("x", { stdout: "", outcome: "error", exit_code: 3 })], active: false, inactive: false },
    { name: "a missing plugin's skills is not active", events: [init(skills.filter((s) => !s.startsWith("guardrails:"))), ...allHooks], active: false, inactive: false },
    { name: "a plugin with skills but no hook is not active", events: [init(skills), hook("workflow"), hook("guardrails")], active: false, inactive: false },
    { name: "a hook for another event does not count", events: [init(skills), hook("workflow", { hook_event: "Stop" }), hook("guardrails"), hook("context-hygiene")], active: false, inactive: false },
  ];
  let failed = 0;
  try {
    writeFileSync(join(dir, "report.cjs"), REPORT_CJS);
    for (const c of cases) {
      const file = join(dir, "run.jsonl");
      writeFileSync(file, `${c.events.map((e) => JSON.stringify(e)).join("\n")}\nnot json\n`);
      const r = run(process.execPath, [join(dir, "report.cjs"), file]);
      let rep = null;
      try { rep = { ...JSON.parse(r.out), exit: c.exit ?? 124 }; } catch { /* reported below */ }
      const ok = rep !== null && isActive(rep) === c.active && isInactive(rep) === c.inactive;
      console.log(`${ok ? "ok  " : "FAIL"} ${c.name}${rep ? "" : ` (no report: ${tail(r.all)})`}`);
      if (!ok) failed++;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : "\nself-test passed: the session judgement fails on crashed, inactive, partial and failed runs");
  return failed ? 1 : 0;
}

if (flags["self-test"]) process.exit(selfTest());

// ---------- Docker, and stopping cleanly ----------

const live = new Set();
let imageBuilt = false;
let ws = null;
function removeAll() {
  for (const id of live) run("docker", ["rm", "-f", id], { timeoutMs: 60000 });
  live.clear();
  if (imageBuilt && !flags.keep) { run("docker", ["image", "rm", IMAGE], { timeoutMs: 120000 }); imageBuilt = false; }
}
function interrupted(signal) {
  console.log(`\nINTERRUPTED (${signal}): containers, the image and the workspace are removed, and no evidence is written.`);
  removeAll();
  if (ws && !flags.keep) rmSync(ws, { recursive: true, force: true });
  process.exit(130);
}
process.on("exit", removeAll);
process.on("SIGINT", () => interrupted("SIGINT"));
process.on("SIGTERM", () => interrupted("SIGTERM"));
// Docker commands run synchronously, so a signal sent to this process is handled only when the event loop gets a turn:
// before and after every step and machine. A Ctrl-C at the terminal also reaches the docker command running at that
// moment, which then exits 0 with no output (measured), so the step it belonged to may fail; the run stops at the next
// turn, before any evidence is written.
const tick = () => new Promise((resolve) => setImmediate(resolve));
const step = async (...args) => { await tick(); const result = await R.step(...args); await tick(); return result; };

// A docker command ended by a signal it was not sent for exceeding its time limit also ends the run.
function docker(args, { timeoutMs = 600000, input } = {}) {
  const r = run("docker", args, { timeoutMs, input });
  if ((r.signal === "SIGINT" || r.signal === "SIGTERM") && !r.timedOut) interrupted(r.signal);
  return r;
}

const dockerServer = docker(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 30000 });
if (dockerServer.code !== 0) { console.log(`NOT RUN: Docker is not available (${tail(dockerServer.all, 200)}).`); process.exit(2); }
ws = workspace("enrollment");
const R = new Rehearsal("enrollment", "Enrollment spike: company plugins from managed settings on a clean Linux machine (M12)");
const meta = { "Claude Code": VERSION, "Base image": `${BASE_IMAGE} (digest not read)`, Docker: dockerServer.out.trim(), "Start length": `${START_SECONDS} seconds, then stopped` };
const keySources = new Set();

function newMachine() {
  const started = docker(["run", "-d", "--rm", "--pull=never", IMAGE, "sh", "-c", "node /opt/spike/silent-endpoint.cjs & exec sleep 3600"], { timeoutMs: 120000 });
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
  await tick();
  const m = newMachine();
  try { return await fn(m); } finally { m.remove(); await tick(); }
}

function managedSettings(source, extra = {}) {
  const marketplace = source.source === "github" ? { source, autoUpdate: true } : { source };
  return JSON.stringify({ ...extra, extraKnownMarketplaces: { [MARKET]: marketplace }, enabledPlugins: Object.fromEntries(PLUGINS.map((p) => [`${p}@${MARKET}`, true])) }, null, 2);
}

function placeManaged(m, text) {
  const r = m.root(`set -eu\ninstall -d -m 0755 /etc/claude-code/managed-settings.d\ncat > ${DROP_IN} <<'SKILLITON_JSON'\n${text}\nSKILLITON_JSON\nchmod 0644 ${DROP_IN}\n`);
  if (r.code !== 0) throw new Error(`placing the managed settings failed: ${tail(r.all)}`);
}

// The folder marketplace is this repository at one commit, read once, archived exactly and recorded in the evidence.
let skillsArchive = null;
function placeFolderMarketplace(m) {
  if (!skillsArchive) {
    const commit = git(REPO, ["rev-parse", "--verify", "HEAD^{commit}"]);
    if (commit.code !== 0) throw new Error(`git rev-parse failed: ${tail(commit.all)}`);
    const id = commit.out.trim();
    const file = join(ws, "skills.tar");
    const a = git(REPO, ["archive", "--format=tar", "-o", file, id]);
    if (a.code !== 0) throw new Error(`git archive failed: ${tail(a.all)}`);
    meta["Skills repository commit (folder scenarios)"] = id.slice(0, 7);
    skillsArchive = file;
  }
  const c = m.copy(skillsArchive, "/tmp/skills.tar");
  if (c.code !== 0) throw new Error(`docker cp failed: ${tail(c.all)}`);
  const r = m.root(`set -eu\ninstall -d -m 0755 ${FOLDER}\ntar -xf /tmp/skills.tar -C ${FOLDER}\nchown -R root:root ${FOLDER}\nchmod -R a+rX,go-w ${FOLDER}\nrm /tmp/skills.tar\n`);
  if (r.code !== 0) throw new Error(`placing the folder marketplace failed: ${tail(r.all)}`);
}

// One session start as the developer. Returns the report of what loaded, with the start's exit code.
function start(m, n, env = PLACEHOLDER) {
  const r = m.dev(`timeout ${START_SECONDS} claude -p "reply ok" --output-format stream-json --verbose --include-hook-events </dev/null >/tmp/start-${n}.jsonl 2>/tmp/start-${n}.err\necho "exit=$?"\nnode /opt/spike/report.cjs /tmp/start-${n}.jsonl\n`, env);
  const exit = /^exit=(\d+)$/m.exec(r.out);
  const json = r.out.split("\n").find((l) => l.startsWith("{"));
  if (!exit || !json) throw new Error(`start ${n} produced no report: ${tail(r.all)}`);
  const report = { ...JSON.parse(json), exit: Number(exit[1]) };
  if (report.apiKeySource) keySources.add(report.apiKeySource);
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

const scopes = (entries) => [...new Set(entries.map((e) => e.scope))].join(", ") || "none";

// Collects each expectation's result so a step reports every mismatch, not only the first.
function checks() {
  const failed = [], seen = [];
  return {
    expect(ok, what) { (ok ? seen : failed).push(what); },
    result(extra = "") { return { ok: failed.length === 0, detail: `${failed.length ? `NOT AS MEASURED BEFORE: ${failed.join("; ")}. ` : ""}${seen.join("; ")}${extra ? `. ${extra}` : ""}` }; },
  };
}

// ---------- steps ----------

await step("E1", `a clean image with Claude Code ${VERSION}, on a base pinned by digest, and an unprivileged user builds`, () => {
  const pull = docker(["pull", "-q", BASE_IMAGE], { timeoutMs: 900000 });
  if (pull.code !== 0) return { ok: false, critical: true, detail: `docker pull ${BASE_IMAGE} failed: ${tail(pull.all)}` };
  const digest = docker(["image", "inspect", BASE_IMAGE, "--format", "{{index .RepoDigests 0}}"], { timeoutMs: 30000 });
  const pinned = digest.out.trim();
  if (digest.code !== 0 || !/@sha256:[0-9a-f]{64}$/.test(pinned)) return { ok: false, critical: true, detail: `the digest of ${BASE_IMAGE} could not be read: ${tail(digest.all)}` };
  meta["Base image"] = pinned;
  const ctx = join(ws, "image");
  mkdirSync(ctx, { recursive: true });
  writeFileSync(join(ctx, "Dockerfile"), dockerfile(pinned));
  writeFileSync(join(ctx, "report.cjs"), REPORT_CJS);
  writeFileSync(join(ctx, "silent-endpoint.cjs"), SILENT_ENDPOINT_CJS);
  const b = docker(["build", "-q", "--build-arg", `CLAUDE_VERSION=${VERSION}`, "-t", IMAGE, ctx], { timeoutMs: 1800000 });
  if (b.code !== 0) return { ok: false, critical: true, detail: `docker build failed: ${tail(b.all)}` };
  imageBuilt = true;
  const v = docker(["run", "--rm", "--pull=never", IMAGE, "claude", "--version"], { timeoutMs: 120000 });
  return { ok: v.code === 0 && v.out.includes(VERSION), critical: true, detail: `${v.out.trim()} on ${pinned}; no credential, no login, nothing mounted from the host` };
});

await step("E2", "control: a malformed managed drop-in stops Claude Code, so the drop-in folder is read", () => withMachine((m) => {
  placeManaged(m, managedSettings(FOLDER_SOURCE));
  m.root("printf '{' > /etc/claude-code/managed-settings.d/60-broken.json\n");
  const c = checks();
  const list = m.dev("timeout 60 claude plugin list\necho \"exit=$?\"\n");
  const headless = m.dev(`timeout 60 claude -p "reply ok" </dev/null\necho "exit=$?"\n`, PLACEHOLDER);
  for (const [name, r] of [["plugin list", list], ["a session start", headless]]) {
    const line = /[^\n]*60-broken\.json[^\n]*could not be parsed as a JSON object[^\n]*/.exec(r.all)?.[0] ?? "";
    c.expect(line !== "" && !/exit=0/.test(r.out), `${name} refused${line ? ` naming the drop-in: "${line.replace(/^.*?60-broken\.json: /, "")}"` : `: ${tail(r.all, 140)}`}`);
  }
  return c.result();
}));

await step("E3", "without a login nothing is installed: a GitHub marketplace is not registered, a folder marketplace is", async () => {
  if (flags["no-github"]) return { notRun: "--no-github was given" };
  const c = checks();
  const headless = (m) => m.dev(`timeout 60 claude -p "reply ok" </dev/null\necho "exit=$?"\n`);
  const said = (r) => tail(r.all.replace(/exit=\d+/, ""), 60);
  const registered = (rec) => (rec.marketplace ? "registered the marketplace" : "registered no marketplace");
  await withMachine((m) => {
    placeManaged(m, managedSettings(GITHUB_SOURCE));
    const list = pluginList(m);
    c.expect(Array.isArray(list.list) && list.list.length === 0 && !records(m).marketplace, `GitHub: plugin list printed ${JSON.stringify(list.list)} and registered no marketplace`);
    const r = headless(m), rec = records(m);
    c.expect(/Not logged in/.test(r.all) && !rec.marketplace && rec.installed.length === 0, `GitHub: a headless start said "${said(r)}", ${registered(rec)} and installed ${rec.installed.length} plugin(s)`);
  });
  await withMachine((m) => {
    placeManaged(m, managedSettings(GITHUB_SOURCE));
    const tty = m.dev(`TERM=xterm-256color timeout ${START_SECONDS} script -q -c claude /dev/null </dev/null >/tmp/tty.log 2>&1\nsed -e 's/\\x1b\\[[0-9;?]*[a-zA-Z]//g' /tmp/tty.log | tr -d ' \\r\\n' | head -c 4000\n`);
    const rec = records(m);
    c.expect(/Let'sgetstarted/.test(tty.out) && !rec.marketplace && rec.installed.length === 0, `GitHub, a new machine: an interactive start stopped at the first-run screen ("Let's get started", before any login), ${registered(rec)} and installed ${rec.installed.length} plugin(s)`);
  });
  await withMachine((m) => {
    placeFolderMarketplace(m);
    placeManaged(m, managedSettings(FOLDER_SOURCE));
    const r = headless(m), rec = records(m);
    c.expect(/Not logged in/.test(r.all) && rec.marketplace?.source?.path === FOLDER && rec.installed.length === 0, `folder, a new machine: a headless start said "${said(r)}", ${registered(rec)} and installed ${rec.installed.length} plugin(s)`);
  });
  return c.result();
});

await step("E4", "managed settings with the GitHub marketplace: start 1 registers, start 2 installs, start 3 is active", () => {
  if (flags["no-github"]) return { notRun: "--no-github was given" };
  return withMachine((m) => {
    placeManaged(m, managedSettings(GITHUB_SOURCE));
    const c = checks();
    const s1 = start(m, 1), r1 = records(m);
    c.expect(r1.marketplace?.source?.repo === GITHUB_REPO && r1.marketplace?.autoUpdate === true && r1.installed.length === 0 && isInactive(s1), `start 1: marketplace ${r1.marketplace ? `registered (autoUpdate ${r1.marketplace.autoUpdate})` : "not registered"}, ${r1.installed.length} installed, session ${describe(s1)}`);
    const s2 = start(m, 2), r2 = records(m);
    const commits = [...new Set(r2.entries.map((e) => String(e.gitCommitSha ?? "").slice(0, 7)))];
    if (commits.length === 1 && commits[0]) meta["GitHub commit installed"] = commits[0];
    c.expect(r2.installed.length === PLUGINS.length && r2.entries.every((e) => e.scope === "managed") && isInactive(s2), `start 2: ${r2.installed.length} installed (scope ${scopes(r2.entries)}, commit ${commits.join(", ") || "none"}), session ${describe(s2)}`);
    const s3 = start(m, 3);
    c.expect(isActive(s3), `start 3: session ${describe(s3)}`);
    return c.result("No developer command ran");
  });
});

await step("E5", "managed settings with a marketplace folder on the machine: start 1 registers, start 2 installs and is active", () => withMachine((m) => {
  placeFolderMarketplace(m);
  placeManaged(m, managedSettings(FOLDER_SOURCE));
  const c = checks();
  const s1 = start(m, 1), r1 = records(m);
  c.expect(r1.marketplace?.source?.path === FOLDER && r1.installed.length === 0 && isInactive(s1), `start 1: marketplace ${r1.marketplace ? "registered" : "not registered"}, ${r1.installed.length} installed, session ${describe(s1)}`);
  const s2 = start(m, 2), r2 = records(m);
  c.expect(r2.installed.length === PLUGINS.length && r2.entries.every((e) => e.scope === "managed") && isActive(s2), `start 2: ${r2.installed.length} installed (scope ${scopes(r2.entries)}), session ${describe(s2)}`);
  return c.result("No developer command ran. Claude Code documents the directory source as for development only");
}));

for (const [id, placement] of [["E6", "managed settings env"], ["E7", "the process environment"]]) {
  await step(id, `a read-only plugin seed placed by root, its variable set in ${placement}: start 1 is not active, start 2 is`, () => {
    if (flags["no-github"]) return { notRun: "--no-github was given (the seed is built from the GitHub marketplace)" };
    return withMachine((m) => {
      const build = m.root(`export HOME=/root\nCLAUDE_CODE_PLUGIN_CACHE_DIR=${SEED} timeout 180 claude plugin marketplace add ${GITHUB_REPO} </dev/null || exit 1\nfor p in ${PLUGINS.join(" ")}; do CLAUDE_CODE_PLUGIN_CACHE_DIR=${SEED} timeout 120 claude plugin install "$p@${MARKET}" </dev/null || exit 1; done\nchown -R root:root ${SEED}\nchmod -R a+rX,go-w ${SEED}\n`);
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

await step("E8", "a first-login install run as the developer before any session: start 1 is active and the plugins become managed", () => {
  if (flags["no-github"]) return { notRun: "--no-github was given" };
  return withMachine((m) => {
    placeManaged(m, managedSettings(GITHUB_SOURCE));
    const c = checks();
    // The commands Skilliton's join runs for Claude Code, run without any login or placeholder.
    const setup = m.dev(`timeout 180 claude plugin marketplace add ${GITHUB_REPO} </dev/null || exit 1\nfor p in ${PLUGINS.join(" ")}; do timeout 120 claude plugin install "$p@${MARKET}" </dev/null || exit 1; done\n`);
    c.expect(setup.code === 0, `first-login install ${setup.code === 0 ? "succeeded" : `failed: ${tail(setup.all)}`} with no login`);
    const before = pluginList(m).list ?? [];
    c.expect(before.length === PLUGINS.length && before.every((p) => p.scope === "user"), `before start 1: ${before.length} plugin(s) installed with scope ${scopes(before)}`);
    const s1 = start(m, 1);
    c.expect(isActive(s1), `start 1: session ${describe(s1)}`);
    const after = pluginList(m).list ?? [];
    c.expect(after.length === PLUGINS.length && after.every((p) => p.scope === "managed"), `after start 1: ${after.length} plugin(s) listed with scope ${scopes(after)}`);
    return c.result();
  });
});

// ---------- notes and evidence ----------

meta["Key source reported by the sessions"] = [...keySources].join(", ") || "none reported";
R.note("Every session start used a placeholder API key and a model endpoint on the container's loopback that never answers. No model ran, no credential existed, and a claude.ai login was not measured (docs/BACKLOG.md B3).");
R.note("Without a login no plugin is installed: a headless start stops at \"Not logged in\" and an interactive start at the first-run screen. A GitHub marketplace is not registered before then; a folder marketplace is. On a real machine the developer's first login comes first; whether registration and installation then happen in that same first session is not measured.");
R.note("A start counts only when its init event names the pinned version and `timeout` stopped it. Activity is judged by plugin skills and SessionStart hook results, because the init event lists enabled plugins even when they have not loaded.");
R.note("A macOS clean account was not run. On macOS, managed settings live in a machine-wide folder, so placing them on the build machine would change the owner's own Claude Code sessions; it needs a separate Mac or a macOS virtual machine.");
R.note("`claude plugin marketplace add` reports the marketplace as declared in user settings, so first-login setup writes to the developer's settings; offboarding has to remove that entry.");

await tick();
const passed = R.steps.filter((s) => s.status === "PASS").length;
console.log(`\n${passed} of ${R.steps.length} steps passed.`);
removeAll();
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exitCode = R.failed ? 1 : 0;
