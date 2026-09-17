#!/usr/bin/env node
// git-config.test.mjs: a repository's own Git configuration cannot make Skilliton start a program (backlog B33).
//
// A clone does not carry .git/config, but a copied working folder does, and `core.fsmonitor` names a program that git
// starts during an ordinary `git status`. Skilliton reads a repository at every session start, so a folder someone
// hands you could otherwise run a program of its author's choosing the moment a session opens. Every git call the
// runtime makes therefore passes `-c core.fsmonitor=false`.
//
// The first case is the positive control: plain git in the same repository DOES start the program, so the absence of
// that program's marker in every later case means the guard worked, not that the trap was never set.
//
//   node --test scripts/git-config.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "scripts", "skilliton.mjs");
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };

// A repository whose own configuration names a program for git to start, and the marker that program writes.
function trapped(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-gitconfig-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, repo: join(base, "repo"), marker: join(base, "MARKER"), program: join(base, "fsmonitor.sh"), home: join(base, "home") };
  mkdirSync(ctx.repo, { recursive: true });
  mkdirSync(ctx.home, { recursive: true });
  writeFileSync(ctx.program, `#!/bin/sh\n: > ${JSON.stringify(ctx.marker)}\nexit 1\n`);
  chmodSync(ctx.program, 0o755);

  const git = (...args) => execFileSync("git", ["-C", ctx.repo, ...args], { encoding: "utf8", env: { ...process.env, ...GIT_ENV, HOME: ctx.home } });
  git("init", "-q", "-b", "main");
  writeFileSync(join(ctx.repo, "README.md"), "# a repository\n");
  git("add", "-A");
  git("commit", "-q", "-m", "first");
  git("config", "core.fsmonitor", ctx.program);
  writeFileSync(join(ctx.repo, "README.md"), "# a repository, changed\n"); // an uncommitted change, so git looks
  ctx.git = git;
  ctx.started = () => existsSync(ctx.marker);
  ctx.reset = () => rmSync(ctx.marker, { force: true });
  ctx.run = (args, options = {}) => spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8", cwd: options.cwd ?? ctx.repo, input: options.input, timeout: 120000,
    env: { ...process.env, ...GIT_ENV, HOME: ctx.home, SKILLITON_SELF: "skilliton", SKILLITON_BACKUPS: join(ctx.base, "backups"), ...options.env },
  });
  return ctx;
}

test("the trap works: plain git in this repository starts the program", (t) => {
  const ctx = trapped(t);
  ctx.git("status", "--porcelain");
  assert.equal(ctx.started(), true, "the fixture did not trigger core.fsmonitor, so the later cases would prove nothing");
});

test("status reads the repository without starting it", (t) => {
  const ctx = trapped(t);
  const r = ctx.run(["status", "--dir", ctx.repo]);
  assert.equal(ctx.started(), false, `skilliton status started the repository's program:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /skilliton status/);
});

test("the session hooks read the repository without starting it", (t) => {
  const ctx = trapped(t);
  for (const event of ["session-start", "stop", "pre-compact", "session-end"]) {
    const r = ctx.run(["hook", event], {
      input: JSON.stringify({ session_id: "s1", cwd: ctx.repo, hook_event_name: event }),
      env: { CLAUDE_PROJECT_DIR: ctx.repo },
    });
    assert.equal(ctx.started(), false, `the ${event} hook started the repository's program:\n${r.stdout}${r.stderr}`);
  }
});

test("prepare reads the repository without starting it", (t) => {
  const ctx = trapped(t);
  const r = ctx.run(["prepare", "--dir", ctx.repo]);
  assert.equal(ctx.started(), false, `prepare started the repository's program:\n${r.stdout}${r.stderr}`);
});

test("every git call in the runtime turns the setting off", () => {
  // Read from the code, so a git call added later without the option fails this test rather than waiting for someone
  // to notice a program starting.
  const files = ["journal.mjs", "trust.mjs", "collectors.mjs", "delivery.mjs", "prepare.mjs"].map((f) => join(ROOT, "packs/base/plugins/workflow/runtime/lib", f));
  const missing = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (!/spawnSync\(\s*["']git["']|runProgram\(\s*["']git["']/.test(line)) return;
      if (!line.includes("NO_REPOSITORY_PROGRAMS")) missing.push(`${file.replace(`${ROOT}/`, "")}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(missing, [], `these git calls do not pass NO_REPOSITORY_PROGRAMS, so a repository's own configuration could make git start a program:\n${missing.join("\n")}`);
});

test("the guardrails hook's git calls turn it off too", () => {
  const text = readFileSync(join(ROOT, "packs/base/plugins/guardrails/hooks/guard-bash.sh"), "utf8");
  const calls = text.split("\n").filter((line) => /^\s*git\s+-C/.test(line));
  assert.ok(calls.length > 0, "no git call found in the guardrails hook, so this check reads the wrong thing");
  for (const line of calls) assert.match(line, /core\.fsmonitor=false/, `a git call in the guardrails hook does not turn core.fsmonitor off: ${line.trim()}`);
});
