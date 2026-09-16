#!/usr/bin/env node
// live-clients.mjs: real Claude Code and Codex sessions against a disposable prepared project, to observe the
// lifecycle behavior PLAN.md M2 requires from actual clients instead of hook calls made by a script.
//
//   node scripts/rehearsals/live-clients.mjs --claude <path> [--codex <path>] [--keep] [--no-evidence]
//
// COSTS REAL USAGE on the logged-in accounts: up to six short Claude Code sessions and three short Codex sessions.
// Your client configuration is not changed: Claude Code loads the plugins from this repository for each session only
// (--plugin-dir, --setting-sources project); Codex runs from a separate, logged-in Codex home you name with
// --codex-home (create it once with CODEX_HOME=<folder> codex login), whose hooks.json this script writes.
//
// Claude Code (2.1.273 measured):
//   L1 session start: the handoff and the Project state reach the model (it quotes a nonce and the current task)
//   L2 stop reminder: after a change, the Stop hook blocks once and the assistant records a checkpoint with skillgate
//   L3 guardrails: a command that discards uncommitted work is asked about, nobody can answer in headless mode, so it
//      is denied and the change survives; the control run without guardrails loses the change
//   L4 interruption: a session killed mid-task leaves no session end; the next session is told it was interrupted
// Codex:
//   X1 session start: a project SessionStart hook's Project state reaches the model
//   X2 guardrails: the same discarding command is refused under Codex (ask becomes deny) and the change survives; the
//      control run without the hook loses it
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 could not start.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, REPO, Rehearsal, findClient, git, parseFlags, run, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { claude: "value", codex: "value", "codex-home": "value", keep: "flag", "no-evidence": "flag" });
const claude = findClient(flags.claude, "SKILLGATE_CLAUDE", "claude");
const codex = findClient(flags.codex, "SKILLGATE_CODEX", "codex");
if (!claude) { console.log("NOT RUN: Claude Code was not found (pass --claude <path>)."); process.exit(2); }

const ws = workspace("live-clients");
const R = new Rehearsal("live-clients", "Live client lifecycle rehearsal (M2)");
const WORKFLOW = join(REPO, "packs", "base", "plugins", "workflow");
const GUARDRAILS = join(REPO, "packs", "base", "plugins", "guardrails");
const BIN = join(WORKFLOW, "bin", "skillgate");
const GUARD = join(GUARDRAILS, "hooks", "guard-bash.sh");
const NONCE = `HANDOFF-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
// Sessions use the real home for login; git identity comes from the repository config set below.
const env = { ...process.env, SKILLGATE_BACKUPS: join(ws, "backups"), GIT_CONFIG_NOSYSTEM: "1" };
delete env.CLAUDE_CONFIG_DIR;
const sg = (args, opts = {}) => run(process.execPath, [CLI, ...args], { env, ...opts });

function project(name) {
  const dir = join(ws, name);
  mkdirSync(dir, { recursive: true });
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.name", "rehearsal"], ["config", "user.email", "rehearsal@example.invalid"], ["config", "commit.gpgsign", "false"]]) git(dir, a, { env });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop", type: "module", scripts: { test: "node --test" } }, null, 2) + "\n");
  writeFileSync(join(dir, "price.js"), "export const price = (qty) => qty * 3;\n");
  git(dir, ["add", "-A"], { env }); git(dir, ["commit", "-q", "-m", "shop"], { env });
  const prep = sg(["prepare", "--dir", dir, "--apply"]);
  if (prep.code !== 0) throw new Error(`prepare failed: ${prep.all.slice(-400)}`);
  const cfgPath = join(dir, ".skillgate", "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.checkpoints = { stopReminder: true, minMinutes: 0 };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  writeFileSync(join(dir, "docs", "HANDOFF.md"), `# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: ${new Date().toISOString()}\n\n- **State:** rehearsal project; the resume nonce is ${NONCE}.\n- **Next:** round invoice totals.\n- **Blocked:** nothing.\n- **Watch out:** nothing known.\n\n## Earlier\n`);
  git(dir, ["add", "-A"], { env }); git(dir, ["commit", "-q", "-m", "prepared"], { env });
  git(dir, ["switch", "-q", "-c", "task/rounding"], { env });
  const t = sg(["task", "start", "Round invoice totals", "--criteria", "totals are whole numbers", "--dir", dir, "--apply"], { cwd: dir });
  if (t.code !== 0) throw new Error(`task start failed: ${t.all.slice(-300)}`);
  git(dir, ["add", "-A"], { env }); git(dir, ["commit", "-q", "-m", "task record"], { env });
  return dir;
}

function events(dir) {
  const gitDir = git(dir, ["rev-parse", "--absolute-git-dir"], { env }).out.trim();
  const file = join(gitDir, "skillgate", "journal.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

// One headless Claude Code session. Returns the parsed stream events, the final text and the exit code.
function claudeSession(dir, prompt, { plugins = [WORKFLOW, GUARDRAILS], allow = ["Bash"], killWhen = null, maxTurns = 14 } = {}) {
  const args = ["-p", prompt, ...plugins.flatMap((p) => ["--plugin-dir", p]), "--setting-sources", "project", "--output-format", "stream-json", "--verbose", "--include-hook-events", "--permission-prompts", "none", "--max-turns", String(maxTurns), "--allowedTools", ...allow];
  return new Promise((resolve) => {
    const child = spawn(claude.path, args, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const lines = [];
    let buffer = "", killed = false;
    const timer = setTimeout(() => { killed = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 600000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        try { const e = JSON.parse(line); lines.push(e); if (killWhen && !killed && killWhen(e, lines)) { killed = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} } } catch {}
      }
    });
    child.stderr.on("data", () => {});
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const texts = lines.filter((e) => e.type === "assistant").flatMap((e) => e.message.content.filter((c) => c.type === "text").map((c) => c.text)).join("\n");
      const toolUses = lines.filter((e) => e.type === "assistant").flatMap((e) => e.message.content.filter((c) => c.type === "tool_use"));
      const hooks = lines.filter((e) => e.type === "system" && /^hook_/.test(e.subtype ?? ""));
      resolve({ code, signal, killed, lines, texts, toolUses, hooks, result: lines.find((e) => e.type === "result") ?? null });
    });
  });
}

console.log(`workspace: ${ws}`);
console.log(`claude: ${claude.version}; codex: ${codex?.version ?? "not found (Codex steps NOT RUN)"}; resume nonce ${NONCE}`);

const a = project("claude-app");

await R.step("L1", "Claude Code: the handoff and the Project state reach the model at session start", async () => {
  const s = await claudeSession(a, "Automated check in a disposable project. Do not run any commands. Answer in exactly two lines: 1) the resume nonce from the RESUME HERE note you were given, 2) the title of the current task from the Project state you were given.", { allow: ["Read"] });
  const starts = s.hooks.filter((h) => h.subtype === "hook_response" && h.hook_event === "SessionStart");
  const projectState = starts.some((h) => /Project state/.test(h.output ?? h.stdout ?? ""));
  const quotedNonce = s.texts.includes(NONCE);
  const quotedTask = /Round invoice totals/.test(s.texts);
  const journaled = events(a).some((e) => e.event === "session-start");
  return { ok: s.code === 0 && projectState && quotedNonce && quotedTask && journaled, detail: `session exit ${s.code}; SessionStart hook responses ${starts.length}, one with the Project state: ${projectState}; model quoted the nonce: ${quotedNonce}, the task: ${quotedTask}; journal session-start: ${journaled}` };
});

await R.step("L2", "Claude Code: after a change, the Stop hook blocks once and the assistant records a checkpoint", async () => {
  const taskDir = join(a, "docs", "tasks");
  const taskFile = () => { const f = readdirSync(taskDir).find((n) => n.endsWith(".md") && n !== "README.md"); return f ? join(taskDir, f) : null; };
  const checkpointsIn = (file) => (file ? (readFileSync(file, "utf8").split("## Checkpoints")[1] ?? "").split("## Handoff")[0].match(/^### /gm)?.length ?? 0 : -1);
  const before = checkpointsIn(taskFile());
  const s = await claudeSession(a, "Automated check in a disposable project. Use the shell to create notes.txt containing the single line rounded. Then finish. If a hook asks you to record a checkpoint, run exactly the command it gives, filling in short truthful values, and then finish.", { allow: ["Bash"] });
  const blocks = s.hooks.filter((h) => h.subtype === "hook_response" && h.hook_event === "Stop" && /"decision"\s*:\s*"block"/.test(h.output ?? h.stdout ?? ""));
  const ranCheckpoint = s.toolUses.some((t) => t.name === "Bash" && /skillgate[^\n]*checkpoint/.test(t.input?.command ?? ""));
  const after = checkpointsIn(taskFile());
  const recorded = events(a).some((e) => e.event === "checkpoint");
  const reminded = events(a).filter((e) => e.event === "stop-reminded").length;
  return { ok: s.code === 0 && blocks.length === 1 && ranCheckpoint && after === before + 1 && recorded && reminded === 1, detail: `session exit ${s.code}; Stop blocks ${blocks.length}; assistant ran skillgate checkpoint: ${ranCheckpoint}; task record checkpoints ${before} before, ${after} after; journal checkpoint event: ${recorded}; stop-reminded events ${reminded}` };
}, { requires: ["L1"] });

async function discardCheck(dir, plugins) {
  writeFileSync(join(dir, "price.js"), "export const price = (qty) => qty * 4;\n");
  const s = await claudeSession(dir, "Automated check in a disposable project. Run exactly this shell command and nothing else, then report its outcome in one line: git reset --hard", { plugins, allow: ["Bash(git reset:*)"] });
  const survived = readFileSync(join(dir, "price.js"), "utf8").includes("qty * 4");
  const denied = s.lines.some((e) => e.type === "system" && e.subtype === "permission_denied");
  return { s, survived, denied };
}

await R.step("L3", "Claude Code: guardrails asks before discarding uncommitted work; with nobody to answer it is denied; without guardrails the work is lost", async () => {
  const withGuard = await discardCheck(project("claude-guard"), [WORKFLOW, GUARDRAILS]);
  const control = await discardCheck(project("claude-control"), [WORKFLOW]);
  return { ok: withGuard.s.code === 0 && withGuard.denied && withGuard.survived && control.s.code === 0 && !control.survived, detail: `with guardrails: exit ${withGuard.s.code}, permission_denied ${withGuard.denied}, change survived ${withGuard.survived}; control without guardrails: exit ${control.s.code}, change survived ${control.survived}` };
});

await R.step("L4", "Claude Code: a session killed mid-task is reported as interrupted to the next session", async () => {
  const dir = project("claude-interrupt");
  const first = await claudeSession(dir, "Automated check in a disposable project. Use the shell to create draft.txt containing the word draft. Then run the shell command sleep 120. Then say done.", {
    allow: ["Bash"], killWhen: (e) => e.type === "assistant" && e.message.content.some((c) => c.type === "tool_use" && /sleep/.test(c.input?.command ?? "")),
  });
  const startEvents = events(dir).filter((e) => e.event === "session-start").length;
  const endEvents = events(dir).filter((e) => e.event === "session-end").length;
  const draft = existsSync(join(dir, "draft.txt"));
  const second = await claudeSession(dir, "Automated check. Do not run any commands. From the Project state you were given: was a previous session interrupted? Answer yes or no, then quote the line that says so.", { allow: ["Read"] });
  const told = /\byes\b/i.test(second.texts) && /interrupt/i.test(second.texts);
  return { ok: first.killed && draft && startEvents >= 1 && endEvents === 0 && second.code === 0 && told, detail: `first session killed: ${first.killed} (draft written: ${draft}); journal starts ${startEvents}, ends ${endEvents}; next session exit ${second.code}, said it was interrupted: ${told}` };
});

// Codex hooks run from a logged-in, isolated Codex home given with --codex-home (its hooks.json is the user layer,
// which loads without project trust). Measured on 0.154.0-alpha.6.2: plugin_hooks is "removed", and a project
// .codex/ layer did not load under codex exec with a trust override, so neither route is used here.
const codexHome = flags["codex-home"] ?? null;
function codexHooks({ session = true, guard = true } = {}) {
  const hooks = {};
  if (session) hooks.SessionStart = [{ hooks: [{ type: "command", command: `"${BIN}" hook session-start`, timeout: 15 }] }];
  if (guard) hooks.PreToolUse = [{ matcher: "Bash", hooks: [{ type: "command", command: `"${GUARD}"`, timeout: 15 }] }];
  writeFileSync(join(codexHome, "hooks.json"), JSON.stringify({ hooks }, null, 2) + "\n");
}
function codexExec(dir, prompt, { sandbox = "read-only" } = {}) {
  const out = join(ws, `codex-last-${Math.random().toString(16).slice(2, 8)}.txt`);
  const r = run(codex.path, ["exec", "--json", "--dangerously-bypass-hook-trust", "--sandbox", sandbox, "-C", dir, "-o", out, prompt], { env: { ...env, CODEX_HOME: codexHome }, timeoutMs: 600000 });
  const last = existsSync(out) ? readFileSync(out, "utf8") : "";
  writeFileSync(join(ws, `codex-events-${Math.random().toString(16).slice(2, 8)}.jsonl`), r.out);
  return { ...r, last };
}
const codexReady = () => (!codex ? "codex not found; pass --codex <path>" : !codexHome ? "no isolated Codex home: run CODEX_HOME=<folder> codex login once, then pass --codex-home <folder> (your main Codex configuration is never changed)" : null);

await R.step("X1", "Codex: a project SessionStart hook's Project state reaches the model", () => {
  const notReady = codexReady(); if (notReady) return { ok: false, detail: notReady };
  const dir = project("codex-app");
  codexHooks({ guard: false });
  const r = codexExec(dir, "Automated check in a disposable project. Do not run any commands. Answer in one line: the title of the current task from the Project state you were given at the start of this session, or NONE if you were given no Project state.");
  const quotedTask = /Round invoice totals/.test(r.last);
  const journaled = events(dir).some((e) => e.event === "session-start");
  return { ok: r.code === 0 && quotedTask && journaled, detail: `codex exec exit ${r.code}; journal session-start written by the hook: ${journaled}; model named the task: ${quotedTask}` };
});

await R.step("X2", "Codex: guardrails refuses a command that discards uncommitted work (ask becomes deny); without the hook the work is lost", () => {
  const notReady = codexReady(); if (notReady) return { ok: false, detail: notReady };
  const attempt = (name, guard) => {
    const dir = project(name);
    codexHooks({ session: false, guard });
    writeFileSync(join(dir, "price.js"), "export const price = (qty) => qty * 4;\n");
    const r = codexExec(dir, "Automated check in a disposable project. Run exactly this shell command and nothing else, then report its outcome in one line: git reset --hard", { sandbox: "workspace-write" });
    return { r, survived: readFileSync(join(dir, "price.js"), "utf8").includes("qty * 4") };
  };
  const guarded = attempt("codex-guard", true);
  const control = attempt("codex-control", false);
  return { ok: guarded.r.code === 0 && guarded.survived && control.r.code === 0 && !control.survived, detail: `with the guardrails hook: exit ${guarded.r.code}, change survived ${guarded.survived}; control without it: exit ${control.r.code}, change survived ${control.survived}` };
});

R.note("Claude Code plugins were loaded with --plugin-dir for each session; marketplace installation is shown by the company release rehearsal. The interactive confirmation a person would see for an ask decision was not observed (headless sessions have no one to answer).");
R.note("Codex hooks run from the isolated Codex home's hooks.json with --dangerously-bypass-hook-trust; plugin-bundled hooks (removed in the measured Codex version) and the /hooks trust review a person performs were not exercised.");
const meta = { "Claude Code": claude.version, Codex: codex?.version ?? "not found", Node: process.version };
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exit(R.failed ? 1 : 0);
