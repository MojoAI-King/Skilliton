#!/usr/bin/env node
// previous-session.test.mjs: a session that ended with uncommitted changes and no checkpoint is said so at the next
// start (packs/base/plugins/workflow/runtime/lib/previous-session.mjs, used by lib/lifecycle.mjs sessionsCheck).
//
// The "Previous session" line said "ended normally" for any session with a session-end, including one that left
// work uncommitted and unrecorded. Now, when that session's session-end (or, without a count there, its newest stop
// event) carries dirty greater than 0 and no checkpoint event falls between its start and its end, the line says so
// and asks the next session to read git status and the open task first. Clean, or checkpointed, still reads
// "ended normally".
//
// Hooks run the way Claude Code runs them: the shipped bin/skilliton with the hook JSON on stdin. Each test works in
// its own folder under os.tmpdir(), with HOME pointed inside it, and removes it afterwards.
//
//   node --test scripts/previous-session.test.mjs

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const BIN = join(PLUGIN, "bin", "skilliton");
const { sessionEndState, endedWords } = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "previous-session.mjs")).href);

const WARNING = /^- Previous session: the previous session ended with (\d+) uncommitted change\(s\) and no checkpoint: read git status and the open task before carrying on \(session s1 \(started [^)]+\)\)$/m;
const NORMAL = /^- Previous session: session s1 \(started [^)]+\) ended normally$/m;

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-previous-session-${label}-`));
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

function initRepo(dir, env) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  git(dir, ["add", "-A"], env);
  git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"], env);
  return dir;
}

function hook(cwd, event, payload, env) {
  const input = JSON.stringify({ cwd, hook_event_name: event, ...payload });
  const r = spawnSync(BIN, ["hook", event], { cwd, env, input, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

const journalFile = (dir, env) => join(git(dir, ["rev-parse", "--absolute-git-dir"], env).trim(), "skilliton", "journal.jsonl");
const appendRaw = (dir, env, event) => {
  const file = journalFile(dir, env);
  writeFileSync(file, `${readFileSync(file, "utf8").replace(/\n?$/, "\n")}${JSON.stringify(event)}\n`);
};

test("a session that ended with changes and no checkpoint is said so at the next start", async () => withTemp("dirty", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  writeFileSync(join(p, "README.md"), "# changed\n");
  writeFileSync(join(p, "new.txt"), "draft\n");
  assert.equal(hook(p, "session-end", { session_id: "s1", reason: "prompt_input_exit" }, env).code, 0);
  const next = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(next.code, 0, next.all);
  const m = WARNING.exec(next.out);
  assert.ok(m, next.out);
  assert.equal(m[1], "2");
  assert.doesNotMatch(next.out, /ended normally/);
}));

test("a session that ended clean still reads ended normally", async () => withTemp("clean", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  assert.equal(hook(p, "session-end", { session_id: "s1", reason: "prompt_input_exit" }, env).code, 0);
  const next = hook(p, "session-start", { session_id: "s2" }, env);
  assert.match(next.out, NORMAL);
  assert.doesNotMatch(next.out, /no checkpoint/);
}));

test("a session that ended dirty with a checkpoint recorded still reads ended normally", async () => withTemp("checkpointed", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  writeFileSync(join(p, "new.txt"), "draft\n");
  // The checkpoint command writes its event with no session id; it counts because it falls inside s1's span.
  appendRaw(p, env, { at: new Date().toISOString(), event: "checkpoint", session: null, branch: "main", head: null, dirty: 1, fingerprint: "x", task: "t" });
  assert.equal(hook(p, "session-end", { session_id: "s1", reason: "prompt_input_exit" }, env).code, 0);
  const next = hook(p, "session-start", { session_id: "s2" }, env);
  assert.match(next.out, NORMAL);
}));

// ---------------------------------------------------------------- the rule, on synthetic journals

const ev = (event, session, extra = {}) => ({ at: extra.at ?? "2026-09-24T10:00:00.000Z", event, session, ...extra });

test("the end count comes from session-end, else from the newest stop event of that session", () => {
  const start = ev("session-start", "s1");
  const previous = { session: "s1", startedAt: start.at };
  assert.deepEqual(sessionEndState([start, ev("session-end", "s1", { dirty: 3 })], previous), { dirty: 3, checkpoint: false });
  const timedOut = [start, ev("stop-reminded", "s1", { dirty: 1 }), ev("stop-reminded", "s1", { dirty: 4 }), ev("session-end", "s1", { dirty: null })];
  assert.deepEqual(sessionEndState(timedOut, previous), { dirty: 4, checkpoint: false });
  const otherSession = [start, ev("stop-reminded", "s9", { dirty: 5 }), ev("session-end", "s1", { dirty: null })];
  assert.equal(sessionEndState(otherSession, previous).dirty, null, "another session's stop event is not this session's end");
});

test("a checkpoint outside the session's span does not count for it", () => {
  const start = ev("session-start", "s1", { at: "2026-09-24T10:00:00.000Z" });
  const previous = { session: "s1", startedAt: start.at };
  const before = [ev("checkpoint", null), start, ev("session-end", "s1", { dirty: 2 })];
  assert.equal(sessionEndState(before, previous).checkpoint, false);
  const after = [start, ev("session-end", "s1", { dirty: 2 }), ev("checkpoint", null)];
  assert.equal(sessionEndState(after, previous).checkpoint, false);
  assert.equal(endedWords("session s1", after, previous).unrecorded, true);
});

test("no count, no id, or a zero count reads ended normally", () => {
  const start = ev("session-start", "s1");
  const previous = { session: "s1", startedAt: start.at };
  assert.match(endedWords("w", [start, ev("session-end", "s1", { dirty: null })], previous).words, /^w ended normally$/);
  assert.match(endedWords("w", [start, ev("session-end", "s1", { dirty: 0 })], previous).words, /^w ended normally$/);
  assert.match(endedWords("w", [ev("session-start", null), ev("session-end", null, { dirty: 3 })], { session: null, startedAt: start.at }).words, /^w ended normally$/);
});
