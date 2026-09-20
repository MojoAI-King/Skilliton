#!/usr/bin/env node
// projects.mjs: the PLAN.md M1 and M2 rehearsal for repositories, offline, in disposable folders.
//
//   node scripts/rehearsals/projects.mjs [--keep] [--no-evidence]
//
// Drives the Skilliton command line the way a person or a client hook does: a fresh project, adoption of an existing
// project (a synthetic one and a clone of this repository), a prototype (layout 1) project migrated, security evidence
// that goes stale and becomes a backlog finding, the stop reminder, recovery after an interrupted session, two
// contributors whose records never collide, and removal that keeps history. Hooks are called with the JSON a client
// sends on stdin; whether a real client runs them is shown by scripts/live-capability-probe.sh and the live session
// rehearsal, not here. No model call, no cost.
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CLI, REPO, Rehearsal, git, initRepo, isolatedEnv, parseFlags, readJson, run, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { keep: "flag", "no-evidence": "flag" });
const ws = workspace("projects");
const R = new Rehearsal("projects", "Project preparation and continuity rehearsal (M1, M2)");
const env = isolatedEnv(ws);
const BIN = join(REPO, "packs", "base", "plugins", "workflow", "bin", "skilliton");
const sg = (args, opts = {}) => run(process.execPath, [CLI, ...args], { env, ...opts });
const hook = (event, payload, opts = {}) => run(BIN, ["hook", event], { env, input: JSON.stringify(payload), ...opts });
const built = (command) => !/not built in this version/.test(sg([command, "--help"]).all);
const need = (...commands) => { const missing = commands.filter((c) => !built(c)); return missing.length ? { ok: false, detail: `not built yet: ${missing.join(", ")}` } : null; };
const commit = (dir, message) => { git(dir, ["add", "-A"], { env }); const c = git(dir, ["commit", "-q", "-m", message], { env }); if (c.code) throw new Error(c.all); };
function snapshot(dir) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === ".git") continue; const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(`${relative(dir, p)} ${readFileSync(p).toString("base64")}`); } };
  walk(dir);
  return out.sort().join("\n");
}
const LAYOUT2 = ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md", "docs/tasks/README.md", "docs/decisions/README.md", "docs/lessons/README.md", "docs/security/README.md", ".skilliton/config.json", ".skilliton/security/catalog.json", "CLAUDE.md", "AGENTS.md"];

console.log(`workspace: ${ws}`);

const fresh = join(ws, "fresh");
await R.step("N1", "fresh project: preview writes nothing, apply creates layout 3, repeat apply changes nothing", () => {
  const miss = need("prepare"); if (miss) return { ...miss, critical: true };
  initRepo(fresh, env);
  writeFileSync(join(fresh, "README.md"), "# Fresh\n");
  commit(fresh, "init");
  const before = snapshot(fresh);
  const preview = sg(["prepare", "--dir", fresh]);
  const unchanged = snapshot(fresh) === before;
  const apply = sg(["prepare", "--dir", fresh, "--apply"]);
  const missing = LAYOUT2.filter((p) => !existsSync(join(fresh, p)));
  const check = sg(["prepare", "--dir", fresh, "--check"]);
  const afterFirst = snapshot(fresh);
  const again = sg(["prepare", "--dir", fresh, "--apply"]);
  const idempotent = snapshot(fresh) === afterFirst;
  const noCopiedRuntime = !existsSync(join(fresh, ".skilliton", "bin"));
  commit(fresh, "Prepare");
  // Wave 3: a README-only repository declares no test command, and prepare says so instead of drafting anything.
  const noStack = preview.out.includes("no test command was detected") && preview.out.includes("No delivery policy draft was written") && !existsSync(join(fresh, ".skilliton", "delivery.draft.json"));
  return { ok: preview.code === 0 && unchanged && apply.code === 0 && !missing.length && check.code === 0 && again.code === 0 && idempotent && noCopiedRuntime && noStack, critical: true, detail: `preview exit ${preview.code}, wrote nothing: ${unchanged}; apply exit ${apply.code}; missing layout files: ${missing.join(", ") || "none"}; check exit ${check.code}; repeat apply exit ${again.code}, byte-identical: ${idempotent}; no copied runtime: ${noCopiedRuntime}; no test command detected and said so, no draft: ${noStack}` };
});

// Wave 3 (M8 second increment): in a repository of each kind, one prepare drafts the test command and a delivery
// policy draft from what the repository shows, the plan is shown before anything is written, confirm makes the draft
// the policy the gate runs, and the first task record carries the user's request.
const KINDS = [
  ["K1", "node", { "package.json": `${JSON.stringify({ name: "k1", scripts: { test: "node --test" } }, null, 2)}\n` }, "npm test", ["npm", "test"], "package.json scripts.test"],
  ["K2", "python", { "pyproject.toml": "[project]\nname = \"k2\"\n\n[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n", "tests/test_a.py": "def test_a():\n    assert True\n" }, "pytest", ["pytest"], "pyproject.toml [tool.pytest]"],
  ["K3", "go", { "go.mod": "module example.test/k3\n\ngo 1.22\n", "main.go": "package main\n\nfunc main() {}\n" }, "go test ./...", ["go", "test", "./..."], "go.mod"],
];
for (const [id, kind, files, lane, argv, source] of KINDS) {
  await R.step(id, `${kind} project: prepare drafts the test command and a delivery policy draft, confirm makes it the policy, the first task carries the request`, async () => {
    const miss = need("prepare", "delivery", "task"); if (miss) return miss;
    const dir = join(ws, `kind-${kind}`);
    initRepo(dir, env);
    for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); }
    commit(dir, "init");
    const draftFile = join(dir, ".skilliton", "delivery.draft.json"), policyFile = join(dir, ".skilliton", "delivery.json");
    const preview = sg(["prepare", "--dir", dir]);
    const previewSaysDraft = preview.out.includes(`dispatch.laneTestCommand "${lane}" drafted from ${source}`) && preview.out.includes(`delivery policy draft with one check "tests" (${lane}) from ${source}`) && !existsSync(draftFile);
    const apply = sg(["prepare", "--dir", dir, "--apply"]);
    const planFirst = apply.out.indexOf("  draft    .skilliton/delivery.draft.json") > 0 && apply.out.indexOf("  draft    .skilliton/delivery.draft.json") < apply.out.indexOf("Writing ") && apply.out.indexOf("Writing ") < apply.out.indexOf("Written:") && apply.out.indexOf("Written:") < apply.out.indexOf("  drafted  .skilliton/delivery.draft.json");
    const config = existsSync(join(dir, ".skilliton", "config.json")) ? readJson(join(dir, ".skilliton", "config.json")) : {};
    const dispatchOk = config.dispatch?.laneTestCommand === lane && config.dispatch?.laneRoot === `../kind-${kind}-lanes`;
    const draft = existsSync(draftFile) ? readJson(draftFile) : null;
    const draftOk = draft?.schema === "skilliton.delivery/1" && JSON.stringify(draft?.protectedBranches) === JSON.stringify(["main"]) && draft?.checks?.length === 1 && draft.checks[0].name === "tests" && JSON.stringify(draft.checks[0].command) === JSON.stringify(argv) && !existsSync(policyFile);
    const check = sg(["prepare", "--dir", dir, "--check"]);
    const confirmPreview = sg(["delivery", "confirm", "--dir", dir]);
    const previewKept = existsSync(draftFile) && !existsSync(policyFile);
    const confirm = sg(["delivery", "confirm", "--dir", dir, "--apply"]);
    const confirmed = existsSync(policyFile) && !existsSync(draftFile) && JSON.stringify(readJson(policyFile)) === JSON.stringify(draft);
    const { planGate } = await import(join(REPO, "packs", "base", "plugins", "workflow", "runtime", "lib", "gate.mjs"));
    let gate; try { gate = planGate(dir, {}); } catch (e) { gate = { error: String(e?.message ?? e) }; }
    const gateOk = gate.kind === "policy" && gate.runs?.length === 1 && gate.runs[0].name === "tests" && JSON.stringify(gate.runs[0].argv) === JSON.stringify(argv);
    commit(dir, "Prepare and confirm the delivery policy");
    const request = `Set the ${kind} project up and make the tests run before a merge`;
    const task = sg(["task", "start", "First task", "--request", request, "--criteria", "The delivery policy runs the tests", "--criteria", "The task record holds the request", "--dir", dir, "--apply"]);
    const created = /created (\S+\.md)/.exec(task.out);
    const record = created ? readFileSync(join(dir, created[1]), "utf8") : "";
    const requestOk = record.includes(`## Request\n\n${request}\n\n## Acceptance criteria\n\n- [ ] The delivery policy runs the tests\n`);
    const ok = preview.code === 0 && previewSaysDraft && apply.code === 0 && planFirst && dispatchOk && draftOk && check.code === 0 && confirmPreview.code === 0 && previewKept && confirm.code === 0 && confirmed && gateOk && task.code === 0 && requestOk;
    return { ok, detail: `preview exit ${preview.code}, names the drafted command and the policy draft, no draft file yet: ${previewSaysDraft}; apply exit ${apply.code}, plan shown before Writing, Written after: ${planFirst}; config dispatch laneTestCommand "${config.dispatch?.laneTestCommand}" laneRoot "${config.dispatch?.laneRoot}": ${dispatchOk}; draft is skilliton.delivery/1 with one check "tests" ${JSON.stringify(argv)}, no policy yet: ${draftOk}; check exit ${check.code}; confirm preview exit ${confirmPreview.code}, draft kept: ${previewKept}; confirm --apply exit ${confirm.code}, policy present and draft gone, same content: ${confirmed}; planGate kind ${gate.kind ?? gate.error} with one run "tests": ${gateOk}; task start exit ${task.code}, Request section holds the request: ${requestOk}` };
  });
}

await R.step("N2", "doctor recognizes the prepared project's layout, versions and instruction blocks", () => {
  const d = sg(["doctor", "--dir", fresh]);
  const layout = /^OK +project layout: layout 3/m.test(d.out);
  const requires = /^OK +requires workflow:/m.test(d.out);
  const blocks = ["CLAUDE.md", "AGENTS.md"].every((f) => new RegExp(`^OK +${f.replace(".", "\\.")}: harness block present and matches the current template`, "m").test(d.out));
  return { ok: layout && requires && blocks, detail: `layout line OK: ${layout}; requires line OK: ${requires}; both harness blocks current: ${blocks} (doctor exit ${d.code}; machine-level plugin lines are not part of this step)` };
}, { requires: ["N1"] });

const existing = join(ws, "existing");
await R.step("A1", "adoption of an existing project keeps its records, names and settings", () => {
  const miss = need("prepare"); if (miss) return miss;
  initRepo(existing, env);
  const files = {
    "STATUS.md": "# Status\n\nShipping the invoice page this week.\n",
    "TODO.md": "# Todo\n\n- [ ] invoice totals\n",
    "HANDOFF.md": "# Handoff\n\n## RESUME HERE\n\nWritten: 2026-09-01 10:00\n\n- **State:** mid-way through invoices.\n",
    "docs/DECISIONS.md": "# Decisions\n\nWe use plain SQL.\n",
    "CLAUDE.md": "# Team notes\n\nAlways run the linter.\n",
    ".skilliton/config.json": JSON.stringify({ dispatch: { minItemsForLanes: 9 }, teamExtra: { keep: true } }, null, 2) + "\n",
  };
  for (const [p, text] of Object.entries(files)) { mkdirSync(join(existing, p, ".."), { recursive: true }); writeFileSync(join(existing, p), text); }
  commit(existing, "existing project");
  const apply = sg(["prepare", "--dir", existing, "--apply"]);
  const kept = ["STATUS.md", "TODO.md", "HANDOFF.md", "docs/DECISIONS.md"].every((p) => readFileSync(join(existing, p), "utf8") === files[p]);
  const cfg = JSON.parse(readFileSync(join(existing, ".skilliton", "config.json"), "utf8"));
  const adopted = cfg.prepare?.artifacts?.status === "STATUS.md" && cfg.prepare?.artifacts?.backlog === "TODO.md" && cfg.prepare?.artifacts?.handoff === "HANDOFF.md" && cfg.prepare?.artifacts?.decisions === "docs/DECISIONS.md";
  const settingsKept = cfg.dispatch?.minItemsForLanes === 9 && cfg.teamExtra?.keep === true;
  const claudeMd = readFileSync(join(existing, "CLAUDE.md"), "utf8");
  const humanKept = claudeMd.startsWith(files["CLAUDE.md"]);
  const namesAdopted = claudeMd.includes("`HANDOFF.md`") && !claudeMd.includes("docs/HANDOFF.md");
  if (apply.code === 0) commit(existing, "Prepare with Skilliton");
  return { ok: apply.code === 0 && kept && adopted && settingsKept && humanKept && namesAdopted, detail: `apply exit ${apply.code}; existing records byte-identical: ${kept}; adopted paths recorded: ${adopted}; unrelated settings kept: ${settingsKept}; human CLAUDE.md text kept: ${humanKept}; instructions name the adopted handoff: ${namesAdopted}` };
});

await R.step("A2", "adoption of a large real project (a clone of this repository)", () => {
  const miss = need("prepare"); if (miss) return miss;
  const clone = join(ws, "skills-clone");
  const c = git(ws, ["clone", "-q", REPO, clone], { env });
  if (c.code) return { ok: false, detail: c.all };
  const watched = ["DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/MAINTAIN.md", "PLAN.md", "README.md"];
  const before = Object.fromEntries(watched.map((p) => [p, readFileSync(join(clone, p), "utf8")]));
  const preview = sg(["prepare", "--dir", clone]);
  const apply = sg(["prepare", "--dir", clone, "--apply"]);
  const kept = watched.every((p) => readFileSync(join(clone, p), "utf8") === before[p]);
  const claude = readFileSync(join(clone, "CLAUDE.md"), "utf8");
  const humanRulesKept = claude.includes("Rules for every session in this repo:");
  const oneBlock = (claude.match(/skilliton:harness:start/g) ?? []).length === 1;
  // The clone carries the committed block; this runtime's template may be newer, and then the block waits for a
  // migration. Bringing it current is part of adopting a real project, so the check runs after the migration.
  const migrated = sg(["migrate", "--dir", clone, "--apply"]);
  const again = sg(["prepare", "--dir", clone, "--check"]);
  return { ok: preview.code === 0 && apply.code === 0 && kept && humanRulesKept && oneBlock && migrated.code === 0 && again.code === 0, detail: `preview ${preview.code}; apply ${apply.code}; migrate ${migrated.code}; living documents byte-identical: ${kept}; human rules kept in CLAUDE.md: ${humanRulesKept}; exactly one managed block: ${oneBlock}; check after apply ${again.code}` };
});

await R.step("G1", "a prototype (layout 1) project migrates to layout 3 (the integrated layout under the Skilliton names) through the command line", () => {
  const miss = need("migrate"); if (miss) return miss;
  const proto = join(REPO, "scripts", "fixtures", "prototype-v1");
  if (!existsSync(join(proto, "prepare.mjs"))) return { ok: false, detail: "the prototype fixture is not in this build (scripts/fixtures/prototype-v1)" };
  const legacy = join(ws, "legacy");
  initRepo(legacy, env);
  writeFileSync(join(legacy, "CLAUDE.md"), "# Legacy notes\n\nKeep this.\n");
  commit(legacy, "legacy");
  const staged = join(ws, "prototype-tools");
  cpSync(proto, staged, { recursive: true });
  const old = run(process.execPath, [join(staged, "prepare.mjs"), "--dir", legacy, "--apply"], { env });
  commit(legacy, "prototype setup");
  const hadCopy = existsSync(join(legacy, ".skillgate", "bin", "security-evidence.mjs"));
  const refused = sg(["prepare", "--dir", legacy, "--apply"]);
  const preview = sg(["migrate", "--dir", legacy]);
  const apply = sg(["migrate", "--dir", legacy, "--apply"]);
  const claude = readFileSync(join(legacy, "CLAUDE.md"), "utf8");
  const migrated = !existsSync(join(legacy, ".skillgate")) && existsSync(join(legacy, ".skilliton", "config.json")) && !claude.includes("skillgate:project") && claude.includes("skilliton:harness:start") && claude.includes("Keep this.");
  const receipts = existsSync(join(legacy, ".skilliton", "migrations")) ? readdirSync(join(legacy, ".skilliton", "migrations")).length : 0;
  return { ok: old.code === 0 && hadCopy && refused.code === 2 && apply.code === 0 && migrated && receipts === 2, detail: `prototype setup exit ${old.code} (copied runtime present: ${hadCopy}); prepare on layout 1 refused: exit ${refused.code}; migrate preview ${preview.code}, apply ${apply.code}; migrated with human text kept: ${migrated}; receipts ${receipts}` };
});

await R.step("S1", "security evidence: an observation goes stale when its source changes and becomes one backlog finding", () => {
  const miss = need("security"); if (miss) return miss;
  mkdirSync(join(fresh, "src"), { recursive: true });
  mkdirSync(join(fresh, ".skilliton", "private-evidence"), { recursive: true });
  writeFileSync(join(fresh, "src", "access.js"), "export const mayEdit = (role) => role === 'admin';\n");
  writeFileSync(join(fresh, ".skilliton", "private-evidence", "access-tests.txt"), "2 tests passed\n");
  commit(fresh, "access check");
  const rec = sg(["security", "record", "--dir", fresh, "--control", "SG-SECURITY-TESTS", "--assessment", "observed", "--source", "src/access.js", "--artifact", ".skilliton/private-evidence/access-tests.txt", "--note", "Role check tests passed for admin and viewer.", "--reviewer", "rehearsal", "--apply"]);
  const recordsDir = join(fresh, ".skilliton", "security", "records");
  const recordFile = existsSync(recordsDir) ? readdirSync(recordsDir).find((f) => f.endsWith(".json")) : null;
  const recordBytes = recordFile ? readFileSync(join(recordsDir, recordFile), "utf8") : null;
  const st1 = sg(["security", "status", "--dir", fresh]);
  writeFileSync(join(fresh, "src", "access.js"), "export const mayEdit = () => true;\n");
  const st2 = sg(["security", "status", "--dir", fresh]);
  const staleShown = /SG-SECURITY-TESTS[^\n]*stale/.test(st2.out);
  const unchangedRecord = recordFile && readFileSync(join(recordsDir, recordFile), "utf8") === recordBytes;
  const f1 = sg(["security", "findings", "--dir", fresh, "--apply"]);
  const f2 = sg(["security", "findings", "--dir", fresh, "--apply"]);
  const backlog = readFileSync(join(fresh, "docs", "BACKLOG.md"), "utf8");
  const rows = (backlog.match(/SEC-SG-SECURITY-TESTS/g) ?? []).length;
  return { ok: rec.code === 0 && !!recordFile && st2.code === 1 && staleShown && unchangedRecord && f1.code === 0 && f2.code === 0 && rows === 1, detail: `record exit ${rec.code}; status before change exit ${st1.code}; after change exit ${st2.code}, stale shown: ${staleShown}; original record unchanged: ${unchangedRecord}; findings twice: ${f1.code}/${f2.code}; backlog rows for the finding: ${rows}` };
}, { requires: ["N1"] });

await R.step("I1", "the stop reminder asks once for a checkpoint, then recovery after an interrupted session shows what was left", () => {
  const miss = need("hook", "task", "checkpoint"); if (miss) return miss;
  const cfgPath = join(fresh, ".skilliton", "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.checkpoints = { stopReminder: true, minMinutes: 0 };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  git(fresh, ["switch", "-q", "-c", "task/discounts"], { env });
  const start = sg(["task", "start", "Add discounts", "--criteria", "a 10 percent code reduces the total", "--dir", fresh, "--apply"], { cwd: fresh });
  commit(fresh, "task record");
  hook("session-start", { session_id: "s-one", cwd: fresh, hook_event_name: "SessionStart", source: "startup" });
  writeFileSync(join(fresh, "src", "discount.js"), "export const discount = (total) => total * 0.9;\n");
  const stop1 = hook("stop", { session_id: "s-one", cwd: fresh, hook_event_name: "Stop", stop_hook_active: false });
  const blocked = /"decision"\s*:\s*"block"/.test(stop1.out);
  const stop2 = hook("stop", { session_id: "s-one", cwd: fresh, hook_event_name: "Stop", stop_hook_active: true });
  const allowedWhenActive = !/"decision"\s*:\s*"block"/.test(stop2.out);
  // The session ends without a session-end event: the client or machine was interrupted.
  const next = hook("session-start", { session_id: "s-two", cwd: fresh, hook_event_name: "SessionStart", source: "startup" });
  const mentionsInterrupted = /interrupt/i.test(next.out);
  const mentionsTask = next.out.includes("Add discounts");
  const mentionsUncommitted = /uncommitted|not committed|dirty/i.test(next.out);
  const cp = sg(["checkpoint", "--dir", fresh, "--state", "discount function written, untested", "--next", "add a test for the 10 percent code", "--apply"], { cwd: fresh });
  const stop3 = hook("stop", { session_id: "s-two", cwd: fresh, hook_event_name: "Stop", stop_hook_active: false });
  const allowedAfterCheckpoint = !/"decision"\s*:\s*"block"/.test(stop3.out);
  return { ok: start.code === 0 && blocked && allowedWhenActive && mentionsInterrupted && mentionsTask && mentionsUncommitted && cp.code === 0 && allowedAfterCheckpoint, detail: `task start ${start.code}; stop blocked once for unrecorded changes: ${blocked}; allowed when stop_hook_active: ${allowedWhenActive}; next session names the interruption ${mentionsInterrupted}, the task ${mentionsTask}, uncommitted work ${mentionsUncommitted}; checkpoint ${cp.code}; stop allowed after the checkpoint: ${allowedAfterCheckpoint}` };
}, { requires: ["N1"] });

await R.step("C1", "two contributors on two branches add tasks and decisions; merging both needs no record conflict resolution", () => {
  const miss = need("task", "record", "index"); if (miss) return miss;
  const remote = join(ws, "shared.git");
  git(ws, ["init", "-q", "--bare", "-b", "main", remote], { env });
  const seed = join(ws, "seed");
  git(ws, ["clone", "-q", existing, seed], { env });
  for (const s of [["config", "user.name", "seed"], ["config", "user.email", "seed@example.invalid"]]) git(seed, s, { env });
  git(seed, ["push", "-q", remote, "HEAD:main"], { env });
  const clones = {};
  for (const who of ["alex", "sam"]) {
    const dir = join(ws, who);
    git(ws, ["clone", "-q", remote, dir], { env });
    for (const s of [["config", "user.name", who], ["config", "user.email", `${who}@example.invalid`]]) git(dir, s, { env });
    git(dir, ["switch", "-q", "-c", `task/${who}`], { env });
    sg(["task", "start", `${who} task`, "--criteria", "done", "--dir", dir, "--apply"], { cwd: dir });
    sg(["record", "decision", `${who} decision`, "--dir", dir, "--apply"], { cwd: dir });
    commit(dir, `${who}: task and decision`);
    clones[who] = dir;
  }
  const alex = clones.alex;
  git(alex, ["fetch", "-q", "origin"], { env });
  git(alex, ["switch", "-q", "main"], { env });
  const m1 = git(alex, ["merge", "--no-edit", "-q", "task/alex"], { env });
  git(alex, ["fetch", "-q", join(ws, "sam"), "task/sam:task/sam"], { env });
  const m2 = git(alex, ["merge", "--no-edit", "-q", "task/sam"], { env });
  const tasks = readdirSync(join(alex, "docs", "tasks")).filter((f) => f !== "README.md").length;
  const decisions = readdirSync(join(alex, "docs", "decisions")).filter((f) => f !== "README.md").length;
  const idx1 = sg(["index", "--dir", alex, "--apply"]);
  const snap = snapshot(alex);
  const idx2 = sg(["index", "--dir", alex, "--apply"]);
  const deterministic = snapshot(alex) === snap;
  const handoffUntouched = readFileSync(join(alex, "HANDOFF.md"), "utf8").includes("mid-way through invoices.");
  return { ok: m1.code === 0 && m2.code === 0 && tasks === 2 && decisions === 2 && idx1.code === 0 && idx2.code === 0 && deterministic && handoffUntouched, detail: `merges ${m1.code}/${m2.code} (no conflicts); task records ${tasks}; decision entries ${decisions}; index twice ${idx1.code}/${idx2.code}, identical: ${deterministic}; shared handoff untouched by task branches: ${handoffUntouched}` };
}, { requires: ["A1"] });

await R.step("D1", "remove keeps every record, entry, observation and the history", () => {
  const miss = need("remove"); if (miss) return miss;
  const before = git(fresh, ["rev-list", "--count", "HEAD"], { env }).out.trim();
  const rm = sg(["remove", "--dir", fresh, "--apply"]);
  const claude = existsSync(join(fresh, "CLAUDE.md")) ? readFileSync(join(fresh, "CLAUDE.md"), "utf8") : "";
  const kept = ["docs/STATUS.md", "docs/HANDOFF.md", "docs/tasks", ".skilliton/security/records"].every((p) => existsSync(join(fresh, p)));
  const after = git(fresh, ["rev-list", "--count", "HEAD"], { env }).out.trim();
  return { ok: rm.code === 0 && !claude.includes("skilliton:harness:start") && kept && before === after, detail: `remove exit ${rm.code}; managed block gone: ${!claude.includes("skilliton:harness:start")}; records kept: ${kept}; commits ${before} and ${after}` };
}, { requires: ["N1"] });

const meta = { Node: process.version, git: run("git", ["--version"]).out.trim() };
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exit(R.failed ? 1 : 0);
