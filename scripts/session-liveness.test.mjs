#!/usr/bin/env node
// session-liveness.test.mjs: the session-start hook's "Previous session" line distinguishes a session that looks
// live in this checkout from one that was interrupted a while ago (packs/base/plugins/workflow/runtime/lib/lifecycle.mjs
// sessionHistory and sessionsCheck; the printed label itself is generic, lib/session-hooks.mjs BLOCK_LABELS.sessions).
//
// A previous session with no session-end was always reported as "interrupted". Now: when its newest journal activity
// (a session-start, or a stop, which fires often while a session is in use) is within the last 30 minutes, it reads
// as "another session looks active in this checkout" instead, because it likely still is one, not a crash to clean
// up after. Older than that, with still no session-end, it keeps the "interrupted" wording exactly as before.
// Nothing is ever blocked by either message: this only changes what the session-start block says.
//
// Hooks run the way Claude Code runs them: the shipped bin/skilliton with the hook JSON on stdin. Each test works in
// its own folder under os.tmpdir(), with HOME pointed inside it, and removes it afterwards.
//
//   node --test scripts/session-liveness.test.mjs

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const BIN = join(PLUGIN, "bin", "skilliton");

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-session-liveness-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  try {
    await body({ dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (cwd, env, message) => { git(cwd, ["add", "-A"], env); git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message], env); };

function initRepo(dir, env, { branch = "main" } = {}) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", `refs/heads/${branch}`], env);
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  commit(dir, env, "init");
  return dir;
}

function hook(cwd, event, payload, env) {
  const input = JSON.stringify({ cwd, hook_event_name: event, ...payload });
  const r = spawnSync(BIN, ["hook", event], { cwd, env, input, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

const gitDir = (dir, env) => git(dir, ["rev-parse", "--absolute-git-dir"], env).trim();
const journalFile = (dir, env) => join(gitDir(dir, env), "skilliton", "journal.jsonl");

function rewriteEvents(dir, env, edit) {
  const file = journalFile(dir, env);
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.stringify(edit(JSON.parse(line))));
  writeFileSync(file, `${lines.join("\n")}\n`);
}

// Appends one event straight to the journal file, bypassing the hooks: the "stop" event type is in JOURNAL_EVENTS
// (journal.mjs), but nothing in this build's hook.mjs appends a bare one today (only the rarer "stop-reminded", when
// the checkpoint reminder actually fires). sessionHistory reads the journal's event schema, not this build's callers
// of it, so this is how the "stop counts as activity" half of the contract is exercised until something appends one.
function appendRawEvent(dir, env, event) {
  const file = journalFile(dir, env);
  writeFileSync(file, `${readFileSync(file, "utf8").replace(/\n?$/, "\n")}${JSON.stringify(event)}\n`);
}

const minutesEarlier = (iso, minutes) => new Date(Date.parse(iso) - minutes * 60000).toISOString();
// Moves every event for `session` earlier by `minutes`, session-start and stop alike, so "backdating a session"
// backdates all of its activity, not only its start.
const backdateSession = (dir, env, session, minutes) => rewriteEvents(dir, env, (e) => (e.session === session ? { ...e, at: minutesEarlier(e.at, minutes) } : e));

test("a previous session with recent activity and no session-end looks live, and nothing is blocked", async () => withTemp("live", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const first = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(first.code, 0, first.all);
  // s1 never ends: its only activity (session-start) is seconds old when s2 starts, well inside the 30 minute window.
  const second = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(second.code, 0, second.all, "a live previous session must not block the new one");
  assert.match(second.out, /^- Previous session: another session looks active in this checkout \(last seen [^)]+\): work in a worktree lane, or check before committing shared records$/m);
  assert.doesNotMatch(second.out, /interrupted/, "a live session is not also reported as interrupted");
}));

test("a previous session's own stop event counts as activity, so a session started a while ago but stopped recently still looks live", async () => withTemp("live-stop", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  // Push s1's session-start itself back past the window; if only session-start counted, s1 would now read as
  // interrupted. A stop event recorded next, at "now", is what keeps it live.
  backdateSession(p, env, "s1", 40);
  appendRawEvent(p, env, { at: new Date().toISOString(), event: "stop", session: "s1" });
  const second = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(second.code, 0, second.all);
  assert.match(second.out, /^- Previous session: another session looks active in this checkout \(last seen [^)]+\): work in a worktree lane, or check before committing shared records$/m);
}));

test("a previous session with no recent activity and no session-end is still reported as interrupted", async () => withTemp("interrupted", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  // Past the 30 minute live window, with no session-end: the older meaning applies unchanged.
  backdateSession(p, env, "s1", 40);
  const second = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(second.code, 0, second.all);
  assert.match(second.out, /^- Previous session: interrupted: session s1 \(started [^)]+\) has no session-end; 0 uncommitted change\(s\) in the working tree now$/m);
  assert.doesNotMatch(second.out, /looks active/, "an old interrupted session is not reported as live");
}));

test("a session right at the edge of the window: just inside is live, just past it is interrupted", async () => withTemp("edge", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  backdateSession(p, env, "s1", 29);
  const inside = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(inside.code, 0, inside.all);
  assert.match(inside.out, /looks active/, "29 minutes ago is inside the 30 minute window");

  const q = initRepo(join(dir, "q"), env);
  assert.equal(hook(q, "session-start", { session_id: "t1" }, env).code, 0);
  backdateSession(q, env, "t1", 31);
  const outside = hook(q, "session-start", { session_id: "t2" }, env);
  assert.equal(outside.code, 0, outside.all);
  assert.match(outside.out, /interrupted/, "31 minutes ago is outside the 30 minute window");
  assert.doesNotMatch(outside.out, /looks active/);
}));

test("a session that ended normally is reported as ended, never as live or interrupted, however recent it was", async () => withTemp("ended", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  assert.equal(hook(p, "session-end", { session_id: "s1", reason: "prompt_input_exit" }, env).code, 0);
  const second = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(second.code, 0, second.all);
  assert.match(second.out, /^- Previous session: session s1 \(started [^)]+\) ended normally$/m);
  assert.doesNotMatch(second.out, /looks active|interrupted/);
}));

test("the current session is never reported against itself, live or otherwise", async () => withTemp("self", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const first = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(first.code, 0, first.all);
  assert.match(first.out, /^- Previous session: none recorded/m, "the very first session has no previous session, live or otherwise");

  // A second session-start with the SAME id (a compaction restart) must not read as another live session.
  const restarted = hook(p, "session-start", { session_id: "s1", source: "compact" }, env);
  assert.equal(restarted.code, 0, restarted.all);
  assert.match(restarted.out, /^- Previous session: none recorded/m, "a compaction restart of the same session id is still not a previous session");
  assert.doesNotMatch(restarted.out, /looks active/);
}));

test("no previous session at all is reported plainly, not as live or interrupted", async () => withTemp("none", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const only = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(only.code, 0, only.all);
  assert.match(only.out, /^- Previous session: none recorded in this worktree's journal$/m);
}));

test("this test file holds no forbidden dash characters or home paths", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(text.includes(String.fromCharCode(0x2014)) || text.includes(String.fromCharCode(0x2013)), false);
  assert.equal(new RegExp(["/Us", "ers/[A-Za-z0-9._-]+/|/ho", "me/[A-Za-z0-9._-]+/"].join("")).test(text), false);
});
