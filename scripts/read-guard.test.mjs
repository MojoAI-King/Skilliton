// read-guard.test.mjs: the context-hygiene read guard against fixture payloads, run exactly as Claude Code runs a
// plugin hook (the command string through bash -c, so the shebang picks node), with the log sent to a temporary
// folder. The refusal case is the positive control for every "stays silent" case below it.
//   node --test scripts/read-guard.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "packs", "base", "plugins", "context-hygiene");
const HOOK = join(PLUGIN, "hooks", "read-guard.mjs");
const HOOKS_JSON = join(PLUGIN, "hooks", "hooks.json");

const dir = mkdtempSync(join(tmpdir(), "skilliton-read-guard-"));
const LOG = join(dir, "logs", "read-guard.log");
const fileOf = (name, kb) => { const p = join(dir, name); writeFileSync(p, "x".repeat(kb * 1024)); return p; };
const big = fileOf("big.txt", 60);
const small = fileOf("small.txt", 10);
const image = fileOf("shot.PNG", 900);
const pdf = fileOf("paper.pdf", 300);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

// Runs the hook the way the client does: `bash -c '<command>'` with the payload on stdin.
function guard(payload, env = {}) {
  const r = spawnSync("bash", ["-c", `"${HOOK}"`], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, SKILLITON_READ_GUARD_LOG: LOG, ...env },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, decision: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}
const logLines = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean) : []);

test("a whole-file read of a 60KB text file is refused with a reason that names the file and the size", () => {
  const before = logLines().length;
  const r = guard({ tool_name: "Read", tool_input: { file_path: big }, session_id: "s1", cwd: dir, hook_event_name: "PreToolUse" });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.decision.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(r.decision.hookSpecificOutput.permissionDecision, "deny");
  const reason = r.decision.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /60KB/);
  assert.ok(reason.includes(big), reason);
  assert.match(reason, /offset and limit/);
  const lines = logLines();
  assert.equal(lines.length, before + 1, "one log line per refusal");
  const entry = JSON.parse(lines.at(-1));
  assert.equal(entry.file, big);
  assert.equal(entry.kb, 60);
  assert.equal(entry.session, "s1");
});

for (const [what, payload] of [
  ["a 10KB text file", { tool_name: "Read", tool_input: { file_path: small } }],
  ["a ranged read of the 60KB file (limit given)", { tool_name: "Read", tool_input: { file_path: big, offset: 100, limit: 50 } }],
  ["a 900KB image, whatever the case of its extension", { tool_name: "Read", tool_input: { file_path: image } }],
  ["a 300KB PDF (read by page)", { tool_name: "Read", tool_input: { file_path: pdf } }],
  ["a file that does not exist (the tool reports that itself)", { tool_name: "Read", tool_input: { file_path: join(dir, "missing.txt") } }],
  ["another tool's call", { tool_name: "Bash", tool_input: { command: `cat ${big}` } }],
  ["a Read with no file path", { tool_name: "Read", tool_input: {} }],
  ["a Read whose input is not an object", { tool_name: "Read", tool_input: "big.txt" }],
  ["a payload that is not JSON", "{not json"],
  ["an empty payload", ""],
]) {
  test(`stays silent and exits 0 for ${what}`, () => {
    const before = logLines().length;
    const r = guard(payload);
    assert.equal(r.status, 0, r.err);
    assert.equal(r.out, "", `printed: ${r.out}`);
    assert.equal(logLines().length, before, "nothing logged");
  });
}

test("an offset without a limit is still a read to the end, so it is refused", () => {
  const r = guard({ tool_name: "Read", tool_input: { file_path: big, offset: 5 } });
  assert.equal(r.decision?.hookSpecificOutput.permissionDecision, "deny");
});

test("the limit follows SKILLITON_READ_LIMIT_KB, and a value that is not a positive whole number keeps the default", () => {
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: small } }, { SKILLITON_READ_LIMIT_KB: "5" }).decision?.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: big } }, { SKILLITON_READ_LIMIT_KB: "100" }).decision, null);
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: small } }, { SKILLITON_READ_LIMIT_KB: "abc" }).decision, null);
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: small } }, { SKILLITON_READ_LIMIT_KB: "-5" }).decision, null);
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: big } }, { SKILLITON_READ_LIMIT_KB: "0" }).decision?.hookSpecificOutput.permissionDecision, "deny");
});

test("a log it cannot write never stops the refusal", () => {
  const blocked = join(dir, "not-a-folder");
  writeFileSync(blocked, "a file where the log folder should be");
  const r = guard({ tool_name: "Read", tool_input: { file_path: big } }, { SKILLITON_READ_GUARD_LOG: join(blocked, "read-guard.log") });
  assert.equal(r.status, 0);
  assert.equal(r.decision?.hookSpecificOutput.permissionDecision, "deny");
});

test("the hook is registered under PreToolUse with matcher Read, run through bash, and the file is executable", () => {
  const hooks = JSON.parse(readFileSync(HOOKS_JSON, "utf8")).hooks;
  const entry = hooks.PreToolUse.find((h) => h.matcher === "Read");
  assert.ok(entry, "a PreToolUse entry with matcher Read");
  assert.equal(entry.hooks.length, 1);
  assert.equal(entry.hooks[0].command, '"${CLAUDE_PLUGIN_ROOT}"/hooks/read-guard.mjs');
  assert.equal(entry.hooks[0].shell, "bash");
  assert.ok(statSync(HOOK).mode & 0o111, "executable bit set");
  assert.equal(readFileSync(HOOK, "utf8").split("\n")[0], "#!/usr/bin/env node");
});

test("the positive control fails when the guard is silenced: a limit far above the file passes the same payload", () => {
  // The refusal test above is the control for the silent cases; this shows the same payload with a different limit
  // takes the other branch, so a guard that never denied would fail the first test and a guard that always denied
  // would fail this one.
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: big } }, { SKILLITON_READ_LIMIT_KB: "1000" }).decision, null);
});

test("the boundary: exactly the limit is allowed, one byte over is refused", () => {
  const atLimit = fileOf("at-limit.txt", 50);
  const over = join(dir, "over.txt");
  writeFileSync(over, "x".repeat(50 * 1024 + 1));
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: atLimit } }).decision, null);
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: over } }).decision.hookSpecificOutput.permissionDecision, "deny");
});

test("a directory stays silent; a symbolic link is judged by its target", { skip: process.platform === "win32" }, () => {
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: dir } }).decision, null);
  const link = join(dir, "link-to-big.txt");
  symlinkSync(big, link);
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: link } }).decision.hookSpecificOutput.permissionDecision, "deny");
});

test("a limit that arrives as a numeric string is still a ranged read", () => {
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: big, limit: "50" } }).decision, null);
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: big, limit: "" } }).decision.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(guard({ tool_name: "Read", tool_input: { file_path: big, limit: "abc" } }).decision.hookSpecificOutput.permissionDecision, "deny");
});

test("the log override is honoured only for an absolute .log path that is not a symbolic link", { skip: process.platform === "win32" }, () => {
  const home = join(dir, "home");
  const fallback = join(home, ".claude", "skilliton", "read-guard.log");
  const linked = join(dir, "linked.log");
  symlinkSync(join(dir, "target.log"), linked);
  for (const bad of ["relative.log", join(dir, "notes.txt"), linked]) {
    rmSync(home, { recursive: true, force: true });
    const r = guard({ tool_name: "Read", tool_input: { file_path: big } }, { SKILLITON_READ_GUARD_LOG: bad, HOME: home });
    assert.equal(r.decision.hookSpecificOutput.permissionDecision, "deny", bad);
    assert.ok(existsSync(fallback), `${bad}: the line went to the default location under HOME`);
    assert.ok(!existsSync(join(dir, "target.log")) && !existsSync(join(dir, "relative.log")) && !existsSync(join(dir, "notes.txt")), `${bad}: nothing written at the override`);
  }
});
