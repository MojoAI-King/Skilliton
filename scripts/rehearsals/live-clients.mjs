#!/usr/bin/env node
// live-clients.mjs: real Claude Code and Codex sessions against a disposable prepared project, to observe the
// lifecycle behavior PLAN.md M2 requires from actual clients instead of hook calls made by a script.
//
//   node scripts/rehearsals/live-clients.mjs --claude <path> [--codex <path>] [--only L5,L6] [--keep] [--no-evidence]
//
// COSTS REAL USAGE on the logged-in accounts: up to nine Claude Code sessions (eight short, L6 fills a 100000-token
// window once) and three short Codex sessions. --only names the steps to run; the others are left out of the record.
// Your client configuration is not changed: Claude Code loads the plugins from this repository for each session only
// (--plugin-dir, --setting-sources project); Codex runs from a separate, logged-in Codex home you name with
// --codex-home (create it once with CODEX_HOME=<folder> codex login), whose hooks.json this script writes.
//
// Claude Code (2.1.273 measured):
//   L1 session start: the handoff and the Project state reach the model (it quotes a nonce and the current task)
//   L2 stop reminder: after a change, the Stop hook blocks once and the assistant records a checkpoint with skilliton
//   L3 guardrails: a command that discards uncommitted work is asked about, nobody can answer in headless mode, so it
//      is denied and the change survives; the control run without guardrails loses the change
//   L4 interruption: a session killed mid-task leaves no session end; the next session is told it was interrupted
//   L5 read guard: the context-hygiene hook refuses a whole-file Read of a 60KB file with the reason and logs it once;
//      a ranged read of the same file goes through
//   L6 compaction: with the project's .claude/settings.json at autoCompactWindow 100000, ranged reads of a large file
//      make the client compact on its own; the PreCompact hook fires and the SessionStart compact matcher shows the
//      Project state again (needs Claude Code 2.1.221 or later; NOT RUN below that)
// Codex:
//   X1 session start: a project SessionStart hook's Project state reaches the model
//   X2 guardrails: the same discarding command is refused under Codex (ask becomes deny) and the change survives; the
//      control run without the hook loses it
// Exit: 0 every step PASS; 1 any step FAIL or NOT RUN; 2 could not start.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, REPO, Rehearsal, findClient, git, parseFlags, run, versionAtLeast, workspace } from "./lib.mjs";

const flags = parseFlags(process.argv.slice(2), { claude: "value", codex: "value", "codex-home": "value", only: "value", keep: "flag", "no-evidence": "flag" });
const claude = findClient(flags.claude, "SKILLITON_CLAUDE", "claude");
const codex = findClient(flags.codex, "SKILLITON_CODEX", "codex");
if (!claude) { console.log("NOT RUN: Claude Code was not found (pass --claude <path>)."); process.exit(2); }

const ws = workspace("live-clients");
const only = flags.only ? new Set(flags.only.split(",").map((s) => s.trim()).filter(Boolean)) : null;
const R = new Rehearsal("live-clients", "Live client lifecycle rehearsal (M2)", { only });
const WORKFLOW = join(REPO, "packs", "base", "plugins", "workflow");
const GUARDRAILS = join(REPO, "packs", "base", "plugins", "guardrails");
const CONTEXT_HYGIENE = join(REPO, "packs", "base", "plugins", "context-hygiene");
const BIN = join(WORKFLOW, "bin", "skilliton");
const GUARD = join(GUARDRAILS, "hooks", "guard-bash.sh");
const NONCE = `HANDOFF-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
// Sessions use the real home for login; git identity comes from the repository config set below.
const env = { ...process.env, SKILLITON_BACKUPS: join(ws, "backups"), GIT_CONFIG_NOSYSTEM: "1" };
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
  const cfgPath = join(dir, ".skilliton", "config.json");
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
  const file = join(gitDir, "skilliton", "journal.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

// One headless Claude Code session. Returns the parsed stream events, the final text and the exit code. killWhen ends
// the session as an interruption (L4); stopWhen ends it once the stream has shown what the step needs (L6), which is
// reported separately as "stopped". extraEnv is merged over the session environment (L5 moves the read-guard log).
function claudeSession(dir, prompt, { plugins = [WORKFLOW, GUARDRAILS], allow = ["Bash"], killWhen = null, stopWhen = null, maxTurns = 14, extraEnv = {} } = {}) {
  const args = ["-p", prompt, ...plugins.flatMap((p) => ["--plugin-dir", p]), "--setting-sources", "project", "--output-format", "stream-json", "--verbose", "--include-hook-events", "--permission-prompts", "none", "--max-turns", String(maxTurns), "--allowedTools", ...allow];
  return new Promise((resolve) => {
    const child = spawn(claude.path, args, { cwd: dir, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const lines = [];
    let buffer = "", killed = false, stopped = false;
    const end = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    const timer = setTimeout(() => { killed = true; end(); }, 600000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        try {
          const e = JSON.parse(line); lines.push(e);
          if (killWhen && !killed && !stopped && killWhen(e, lines)) { killed = true; end(); }
          if (stopWhen && !killed && !stopped && stopWhen(e, lines)) { stopped = true; end(); }
        } catch {}
      }
    });
    child.stderr.on("data", () => {});
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const texts = lines.filter((e) => e.type === "assistant").flatMap((e) => e.message.content.filter((c) => c.type === "text").map((c) => c.text)).join("\n");
      const toolUses = lines.filter((e) => e.type === "assistant").flatMap((e) => e.message.content.filter((c) => c.type === "tool_use"));
      const toolResults = lines.filter((e) => e.type === "user" && Array.isArray(e.message?.content)).flatMap((e) => e.message.content.filter((c) => c.type === "tool_result").map((c) => (typeof c.content === "string" ? c.content : Array.isArray(c.content) ? c.content.map((p) => p.text ?? "").join("\n") : "")));
      const hooks = lines.filter((e) => e.type === "system" && /^hook_/.test(e.subtype ?? ""));
      resolve({ code, signal, killed, stopped, lines, texts, toolUses, toolResults, hooks, result: lines.find((e) => e.type === "result") ?? null });
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
  const ranCheckpoint = s.toolUses.some((t) => t.name === "Bash" && /skilliton[^\n]*checkpoint/.test(t.input?.command ?? ""));
  const after = checkpointsIn(taskFile());
  const recorded = events(a).some((e) => e.event === "checkpoint");
  const reminded = events(a).filter((e) => e.event === "stop-reminded").length;
  return { ok: s.code === 0 && blocks.length === 1 && ranCheckpoint && after === before + 1 && recorded && reminded === 1, detail: `session exit ${s.code}; Stop blocks ${blocks.length}; assistant ran skilliton checkpoint: ${ranCheckpoint}; task record checkpoints ${before} before, ${after} after; journal checkpoint event: ${recorded}; stop-reminded events ${reminded}` };
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

const hookText = (h) => h.output ?? h.stdout ?? "";

await R.step("L5", "Claude Code: the context-hygiene read guard refuses a whole-file Read of a 60KB file with the reason and logs it once; a ranged read of the same file goes through", async () => {
  const dir = project("claude-readguard");
  const nonce = `RANGE-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const big = join(dir, "big.txt");
  // 960 lines of 64 bytes: 61440 bytes, which the guard reports as 60KB, over its 50KB limit.
  const rows = [];
  for (let i = 1; i <= 960; i++) rows.push((i === 5 ? `line ${i} nonce ${nonce} ` : `line ${i} `).padEnd(63, "x"));
  writeFileSync(big, rows.join("\n") + "\n");
  const log = join(ws, "read-guard.log");
  const extraEnv = { SKILLITON_READ_GUARD_LOG: log };
  const logLines = () => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((l) => l.file === big) : []);
  const refusal = /context-hygiene read guard: .*big\.txt is \d+KB/;
  const whole = await claudeSession(dir, `Deliberate hook test in a disposable project. Call the Read tool on ${big} exactly once, with no offset and no limit. Then report the tool's response in one line, quoting it, and stop. Do not retry with a range and do not run any other tool.`, { plugins: [WORKFLOW, CONTEXT_HYGIENE], allow: ["Read"], extraEnv, maxTurns: 4 });
  const wholeReads = whole.toolUses.filter((t) => t.name === "Read" && String(t.input?.file_path ?? "").endsWith("big.txt"));
  const triedWhole = wholeReads.some((t) => t.input?.limit === undefined || t.input?.limit === null);
  const hookDenied = whole.hooks.some((h) => h.subtype === "hook_response" && h.hook_event === "PreToolUse" && refusal.test(hookText(h)));
  const resultDenied = whole.toolResults.some((t) => refusal.test(t)) || whole.lines.some((e) => e.type === "system" && e.subtype === "permission_denied" && refusal.test(JSON.stringify(e)));
  const after1 = logLines();
  const ranged = await claudeSession(dir, `Deliberate hook test in a disposable project. Call the Read tool on ${big} exactly once with offset 1 and limit 20, then answer in one line with the nonce written on line 5 (it starts with RANGE-), and stop.`, { plugins: [WORKFLOW, CONTEXT_HYGIENE], allow: ["Read"], extraEnv, maxTurns: 4 });
  const after2 = logLines();
  const quoted = ranged.texts.includes(nonce);
  const ok = whole.code === 0 && triedWhole && (hookDenied || resultDenied) && after1.length === 1 && after1[0].kb === 60 && ranged.code === 0 && after2.length === 1 && quoted;
  return { ok, detail: `whole read: exit ${whole.code}, the model attempted a whole Read: ${triedWhole} (Read inputs seen: ${JSON.stringify(wholeReads.map((t) => ({ offset: t.input?.offset ?? null, limit: t.input?.limit ?? null })))}), PreToolUse hook_response carrying the refusal: ${hookDenied}, the refusal reached the model as a tool result or a permission_denied event: ${resultDenied}, read-guard log lines for the file: ${after1.length} (kb ${after1[0]?.kb ?? "none"}); ranged read: exit ${ranged.code}, log lines still ${after2.length}, nonce on line 5 quoted: ${quoted}` };
});

await R.step("L6", "Claude Code: a session compacts on its own at the autoCompactWindow the project's settings set; the PreCompact hook fires and the SessionStart compact matcher shows the Project state again", async () => {
  if (!versionAtLeast(claude.version, "2.1.221")) return { notRun: `Claude Code ${claude.version} is older than 2.1.221, the first version whose settings reference documents autoCompactWindow; pass --claude <newer binary>` };
  const dir = project("claude-compact");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "settings.json"), JSON.stringify({ autoCompactWindow: 100000 }, null, 2) + "\n"); // the documented minimum
  const cp = sg(["checkpoint", "--state", "corpus reading begins", "--evidence", "none yet", "--next", "read the corpus in ranges", "--dir", dir, "--apply"], { cwd: dir });
  if (cp.code !== 0) throw new Error(`checkpoint failed: ${cp.all.slice(-300)}`);
  // 12000 lines of varied plain-language sentences (a numbered ledger of deliveries): enough tokens to pass the window
  // in a few reads, and summarizable, which a corpus of random hashes was not (the client reported "compaction failed
  // 3 times in a row" on one, 2026-09-18, and ended the session).
  const corpus = join(dir, "corpus.txt");
  const who = ["the bakery", "a courier", "the night shift", "the warehouse", "a supplier", "the front desk", "the repair team", "the archive"];
  const what = ["twelve crates of apples", "a pallet of paper", "three spare pumps", "the signed contracts", "forty chairs", "a box of fuses", "the winter stock", "two ladders"];
  const where = ["dock four", "the east gate", "the loading bay", "the top floor", "the cold room", "the yard", "the annex", "the main hall"];
  const note = ["with one crate short", "ahead of schedule", "after a delay at the gate", "counted twice", "with the invoice attached", "on the second attempt", "before the rain", "without a receipt"];
  let h = 0x9e3779b9;
  const next = () => { h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; return h; };
  const rows = [];
  for (let i = 1; i <= 12000; i++) rows.push(`${String(i).padStart(5, "0")} On day ${(next() % 365) + 1}, ${who[next() % 8]} delivered ${what[next() % 8]} to ${where[next() % 8]} ${note[next() % 8]}, ticket ${(next() % 90000) + 10000}.`);
  writeFileSync(corpus, rows.join("\n") + "\n");
  const isHook = (e, event) => e.type === "system" && e.subtype === "hook_response" && e.hook_event === event;
  const s = await claudeSession(dir, `Deliberate compaction test in a disposable project; the point is to fill the context window, so keep going. Read the file ${corpus} with the Read tool in ranges of 600 lines: offset 1 limit 600, then offset 601 limit 600, and so on, in order, until all 12000 lines have been read (twenty Read calls in total). Do all twenty in this one reply: do not stop, end your reply, or ask anything before the twentieth Read has returned. After each Read say only "read to line N" and go straight on to the next Read. Do not summarize the content and do not run any other tool. When the twentieth Read has returned, say done.`, {
    plugins: [WORKFLOW], allow: ["Read"], maxTurns: 40,
    // The stream carries no PreCompact hook events on 2.1.276 (measured 2026-09-18); the compaction shows as a system
    // event with subtype compact_boundary, and the compact SessionStart hook's output as a later SessionStart
    // hook_response. Stop once that has been seen, so the session does not run on to the client's own give-up point
    // (it ends a session that hits the window again within 3 turns of a compaction, 3 times in a row; measured).
    stopWhen: (e, lines) => isHook(e, "SessionStart") && /Project state/.test(hookText(e)) && lines.some((p) => p.type === "system" && p.subtype === "compact_boundary"),
  });
  writeFileSync(join(ws, "l6-stream.jsonl"), s.lines.map((e) => JSON.stringify(e)).join("\n") + "\n"); // kept with --keep, never evidence
  const ev = events(dir);
  const pcIdx = ev.findIndex((e) => e.event === "pre-compact");
  const pc = pcIdx >= 0 ? ev[pcIdx] : null;
  const compactStart = pc ? ev.slice(pcIdx + 1).find((e) => e.event === "session-start" && e.source === "compact") : null;
  const sameSession = Boolean(pc && compactStart && pc.session === compactStart.session);
  const boundaryIdx = s.lines.findIndex((e) => e.type === "system" && e.subtype === "compact_boundary");
  const streamPre = s.hooks.findIndex((h) => h.subtype === "hook_response" && h.hook_event === "PreCompact");
  const streamStart = boundaryIdx >= 0 ? s.lines.slice(boundaryIdx + 1).find((e) => isHook(e, "SessionStart") && /Project state/.test(hookText(e))) : null;
  const continued = boundaryIdx >= 0 && s.lines.slice(boundaryIdx + 1).some((e) => e.type === "assistant" && e.message.content.some((c) => c.type === "tool_use" && c.name === "Read"));
  const usage = (e) => (e.message?.usage ? (e.message.usage.input_tokens ?? 0) + (e.message.usage.cache_read_input_tokens ?? 0) + (e.message.usage.cache_creation_input_tokens ?? 0) : 0);
  const peak = Math.max(0, ...s.lines.filter((e) => e.type === "assistant").map(usage));
  const reads = s.toolUses.filter((t) => t.name === "Read").length;
  const subtypes = [...new Set(s.lines.filter((e) => e.type === "system").map((e) => e.subtype ?? "?"))].join(",");
  const hookEvents = [...new Set(s.hooks.map((h) => `${h.subtype}:${h.hook_event ?? h.hook_name ?? "?"}`))].join(",");
  const cycles = ev.filter((e) => e.event === "pre-compact").length;
  const restarts = ev.filter((e) => e.event === "session-start" && e.source === "compact").length;
  const ending = `journal pre-compact events ${cycles}, compact session-starts ${restarts}; system subtypes seen: ${subtypes}; hook events seen: ${hookEvents}; result ${s.result?.subtype ?? "none"}, ${s.result?.num_turns ?? "?"} turns, last words: ${JSON.stringify(s.texts.trim().slice(-200))}`;
  const ok = Boolean(pc && pc.trigger === "auto" && compactStart && sameSession && boundaryIdx >= 0 && streamStart);
  return { ok, detail: `session exit ${s.code} (ended by the script once compaction was seen: ${s.stopped}; killed by the timeout: ${s.killed}); Read calls ${reads}; peak context on one assistant turn ${peak} tokens against a 100000 window; journal pre-compact: ${pc ? `yes (trigger ${pc.trigger ?? "absent"})` : "no"}, session-start with source compact after it in the same session: ${sameSession}; stream compact_boundary system event: ${boundaryIdx >= 0}, a PreCompact hook_response in the stream: ${streamPre >= 0}, a SessionStart hook_response carrying the Project state after the boundary: ${Boolean(streamStart)}, the model went on reading after the boundary: ${continued}; ${ending}` };
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
  const notReady = codexReady(); if (notReady) return { notRun: notReady };
  const dir = project("codex-app");
  codexHooks({ guard: false });
  const r = codexExec(dir, "Automated check in a disposable project. Do not run any commands. Answer in one line: the title of the current task from the Project state you were given at the start of this session, or NONE if you were given no Project state.");
  const quotedTask = /Round invoice totals/.test(r.last);
  const journaled = events(dir).some((e) => e.event === "session-start");
  return { ok: r.code === 0 && quotedTask && journaled, detail: `codex exec exit ${r.code}; journal session-start written by the hook: ${journaled}; model named the task: ${quotedTask}` };
});

await R.step("X2", "Codex: guardrails refuses a command that discards uncommitted work (ask becomes deny); without the hook the work is lost", () => {
  const notReady = codexReady(); if (notReady) return { notRun: notReady };
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
R.note("L5 moves the read-guard log into the workspace with SKILLITON_READ_GUARD_LOG, so the machine's own log is not read or written. L6 sets autoCompactWindow in the disposable project's .claude/settings.json only; the person's own settings are not loaded (--setting-sources project) and not changed.");
R.note("Codex hooks run from the isolated Codex home's hooks.json with --dangerously-bypass-hook-trust; plugin-bundled hooks (removed in the measured Codex version) and the /hooks trust review a person performs were not exercised.");
const meta = { "Claude Code": claude.version, Codex: codex?.version ?? "not found", Node: process.version };
if (!flags["no-evidence"]) R.writeEvidence(ws, meta);
if (!flags.keep && !R.failed) rmSync(ws, { recursive: true, force: true });
else console.log(`kept for inspection: ${ws}`);
process.exit(R.failed ? 1 : 0);
