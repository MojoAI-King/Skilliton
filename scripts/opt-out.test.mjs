#!/usr/bin/env node
// opt-out.test.mjs: an empty .skilliton-off at a repository's root, or a skilliton-off inside its Git folder, is
// honored by every workflow hook, not only by auto-prepare (N35).
//
// With the file, session start prints one line saying the workflow hooks leave the repository alone and that the
// guardrails and the read guard still run, and nothing else; stop, user-prompt-submit, pre-compact and session-end
// print nothing; no hook records an event. Without it, each hook does what it did before, which is checked first in
// the same repository so the "with" cases cannot pass because the fixture never gave a hook anything to do.
//
// Hooks run the way Claude Code runs them: the shipped bin/skilliton executed by path with the hook JSON on stdin.
// scripts/lifecycle.test.mjs is pinned at its size (scripts/lint.test.mjs), so these cases live here.
//
//   node --test scripts/opt-out.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "packs", "base", "plugins", "workflow", "bin", "skilliton");
const SIX = "1. Fix the login bug\n2. Add a retry\n3. Rename the module\n4. Update the docs\n5. Bump the version\n6. Run the tests";
const LEFT_ALONE = (where) => `[workflow] Skilliton's workflow hooks leave this repository alone because ${where} (delete it to have them run again); the guardrails and the read guard, where installed, still run.\n`;
const AT_ROOT = ".skilliton-off is present at the repository root";
const IN_GIT = "skilliton-off is present inside the Git folder";

function fixture(t, label) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `skilliton-opt-out-${label}-`)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
    // No joined machine: auto-prepare does nothing either way, so what is measured is the hooks' own opt-out.
    SKILLITON_JOIN_DIR: join(dir, "not-joined"),
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  const repo = join(dir, "repo");
  const git = (...args) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  mkdirSync(join(repo, ".skilliton"), { recursive: true });
  git("init", "-q");
  git("symbolic-ref", "HEAD", "refs/heads/main");
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  // A project that set its own checkpoint rules, so the stop reminder is due once the session is old enough.
  writeFileSync(join(repo, ".skilliton", "config.json"), `${JSON.stringify({ checkpoints: { minMinutes: 20 }, dispatch: { minItemsForLanes: 6 } }, null, 2)}\n`);
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
  const gitDir = git("rev-parse", "--absolute-git-dir").trim();
  const journal = join(gitDir, "skilliton", "journal.jsonl");
  const events = () => (existsSync(journal) ? readFileSync(journal, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const hook = (event, payload = {}) => {
    const r = spawnSync(BIN, ["hook", event], { cwd: repo, env, input: JSON.stringify({ cwd: repo, hook_event_name: event, ...payload }), encoding: "utf8" });
    return { code: r.status, out: r.stdout, all: `${r.stdout}${r.stderr}` };
  };
  // The session started thirty minutes ago and the tree has changed since: the state in which stop blocks.
  const age = (session) => {
    const lines = events().map((e) => (e.event === "session-start" && e.session === session ? { ...e, at: new Date(Date.parse(e.at) - 30 * 60000).toISOString() } : e));
    writeFileSync(journal, `${lines.map((e) => JSON.stringify(e)).join("\n")}\n`);
    writeFileSync(join(repo, "work.txt"), `changed ${session}\n`);
  };
  return { repo, git, gitDir, events, hook, age };
}

// Every hook, first without the file (each does its work), then with it (each does nothing), for one opt-out place.
function everyHook(t, label, place) {
  const f = fixture(t, label);
  const optOut = place === "root" ? join(f.repo, ".skilliton-off") : join(f.gitDir, "skilliton-off");

  // Without the file.
  const start = f.hook("session-start", { session_id: "s1", source: "startup" });
  assert.equal(start.code, 0, start.all);
  assert.match(start.out, /^\[workflow\] Project state \(skilliton hook session-start\):\n/, "without the file, session start reports the project as usual");
  assert.equal(f.events().filter((e) => e.event === "session-start").length, 1, "and records the session start");
  f.age("s1");
  const stop = f.hook("stop", { session_id: "s1" });
  assert.equal(stop.code, 0, stop.all);
  assert.equal(JSON.parse(stop.out).decision, "block", "without the file, the stop reminder is given");
  const prompt = f.hook("user-prompt-submit", { session_id: "s1", prompt: SIX });
  assert.equal(prompt.code, 0, prompt.all);
  assert.match(JSON.parse(prompt.out).hookSpecificOutput.additionalContext, /reads as 6 separate items/, "without the file, the dispatch note is given");
  for (const event of ["pre-compact", "session-end"]) {
    const r = f.hook(event, { session_id: "s1" });
    assert.equal(r.code, 0, r.all);
    assert.equal(r.out, "");
  }
  const recorded = f.events().map((e) => e.event);
  for (const event of ["session-start", "stop-reminded", "dispatch-suggested", "pre-compact", "session-end"]) assert.ok(recorded.includes(event), `without the file, ${event} is recorded`);

  // With the file: a new session in the same state, so every hook would have something to do.
  writeFileSync(optOut, "");
  const before = f.events().length;
  const offStart = f.hook("session-start", { session_id: "s2", source: "startup" });
  assert.equal(offStart.code, 0, offStart.all);
  assert.equal(offStart.out, LEFT_ALONE(place === "root" ? AT_ROOT : IN_GIT), "with the file, session start prints the one line and nothing else");
  f.age("s1"); // the old session is still the one a stop would measure from, and the tree changed again
  for (const [event, payload] of [["stop", { session_id: "s1" }], ["user-prompt-submit", { session_id: "s2", prompt: SIX }], ["pre-compact", { session_id: "s2", trigger: "auto" }], ["session-end", { session_id: "s2" }]]) {
    const r = f.hook(event, payload);
    assert.equal(r.code, 0, r.all);
    assert.equal(r.out, "", `with the file, ${event} prints nothing`);
  }
  assert.equal(f.events().length, before, "with the file, no hook records an event");

  // Taken away again, the hooks run as before.
  rmSync(optOut);
  const back = f.hook("session-start", { session_id: "s3", source: "startup" });
  assert.match(back.out, /^\[workflow\] Project state/, "with the file gone, session start reports the project again");
  assert.equal(f.events().length, before + 1);
}

test("N35: an empty .skilliton-off at the root keeps every workflow hook out of the repository", (t) => everyHook(t, "root", "root"));

test("N35: a skilliton-off inside the Git folder does the same", (t) => everyHook(t, "git", "git"));

test("N35: an unprepared repository with the file gets the one line, not the offer to prepare it", (t) => {
  const f = fixture(t, "unprepared");
  f.git("rm", "-r", "-q", ".skilliton");
  f.git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "never prepared");
  const offer = f.hook("session-start", { session_id: "u1", source: "startup" });
  assert.match(offer.out, /^- Not prepared \(needs attention\): offer it/m, "without the file, the offer is made");
  writeFileSync(join(f.repo, ".skilliton-off"), "");
  const before = f.events().length;
  const off = f.hook("session-start", { session_id: "u2", source: "startup" });
  assert.equal(off.code, 0, off.all);
  assert.equal(off.out, LEFT_ALONE(AT_ROOT));
  assert.equal(f.events().length, before);
  assert.equal(existsSync(join(f.repo, ".skilliton")), false, "nothing was written");
});
