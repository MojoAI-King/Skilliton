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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

// Where git is started in the runtime, and which of those calls keep the environment they were given. The two in
// delivery.mjs run inside a push hook, where git itself sets GIT_DIR and the quarantine folder for the objects being
// pushed: taking those away would make the hook read the wrong repository. Every other call gets gitEnvironment(),
// which removes the variables that would choose the repository (GIT_DIR, GIT_INDEX_FILE and the rest) or hand in
// settings from outside a configuration file. A line that matches nothing is a failure too, so an exception cannot
// outlive the code it excuses.
const ENVIRONMENT_FROM_THE_CALLER = [
  { file: "delivery.mjs", contains: "env, encoding: buffer", why: "the push hook's own environment names the repository and the quarantined objects" },
  { file: "delivery.mjs", contains: '"archive", "--format=tar"', why: "the same runner's environment, for the archive it extracts" },
];
const RUNTIME_LIB = join(ROOT, "packs/base/plugins/workflow/runtime/lib");
const GIT_START = /(?:spawnSync|spawn|execFileSync|execFile)\(\s*["']git["']|runProgram\(\s*["']git["']/;

test("every git call in the runtime turns the setting off", () => {
  // Read from the code, so a git call added later without the option fails this test rather than waiting for someone
  // to notice a program starting.
  const files = ["journal.mjs", "trust.mjs", "collectors.mjs", "delivery.mjs", "prepare.mjs"].map((f) => join(RUNTIME_LIB, f));
  const missing = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (!GIT_START.test(line)) return;
      if (!line.includes("NO_REPOSITORY_PROGRAMS")) missing.push(`${file.replace(`${ROOT}/`, "")}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(missing, [], `these git calls do not pass NO_REPOSITORY_PROGRAMS, so a repository's own configuration could make git start a program:\n${missing.join("\n")}`);
});

// The text of a call's env option, brace aware, or null when the call passes no env at all.
function envExpression(call) {
  const at = /[{,]\s*env\s*:/.exec(call);
  if (!at) return /[{,]\s*env\s*[,}]/.test(call) ? "env" : null;
  let depth = 0;
  const from = at.index + at[0].length;
  for (let i = from; i < call.length; i++) {
    const c = call[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") { if (depth === 0) return call.slice(from, i).trim(); depth--; }
    else if (c === "," && depth === 0) return call.slice(from, i).trim();
  }
  return call.slice(from).trim();
}

test("every git call in the runtime takes its environment from gitEnvironment, or says why not", () => {
  const found = [];
  const used = new Set();
  for (const name of readdirSync(RUNTIME_LIB).filter((f) => f.endsWith(".mjs"))) {
    const lines = readFileSync(join(RUNTIME_LIB, name), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!GIT_START.test(line)) return;
      const call = lines.slice(i, i + 4).join(" "); // the options of a call written over several lines
      // Read the call's own env expression and decide on that alone: a mention of gitEnvironment elsewhere in the
      // file does not excuse this call. It passes when the expression is built from gitEnvironment(), directly or
      // through a wrapper defined in the same file or a variable assigned just above, and never when it spreads
      // process.env, which is how the environment a repository can reach gets back in.
      const expression = envExpression(call);
      const body = readFileSync(join(RUNTIME_LIB, name), "utf8");
      const wrapper = /([A-Za-z_$][\w$]*)\s*\(/.exec(expression ?? "")?.[1];
      const fromGitEnvironment = expression !== null && !expression.includes("process.env") && (
        expression.includes("gitEnvironment(")
        || (wrapper && new RegExp(`function ${wrapper}\\([^)]*\\)[^\n]*\\{[\\s\\S]{0,400}?gitEnvironment\\(`).test(body))
        || (/^[A-Za-z_$][\w$]*$/.test(expression) && new RegExp(`(?:const|let|var)\\s+${expression}\\s*=\\s*gitEnvironment\\(`).test(lines.slice(Math.max(0, i - 12), i).join("\n")))
      );
      if (fromGitEnvironment) return;
      const allowed = ENVIRONMENT_FROM_THE_CALLER.find((e) => e.file === name && call.includes(e.contains));
      if (allowed) { used.add(allowed.contains); return; }
      found.push(`${name}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(found, [], `these git calls take their environment from around them, so GIT_DIR or GIT_INDEX_FILE could decide which repository they read:\n${found.join("\n")}`);
  const stale = ENVIRONMENT_FROM_THE_CALLER.filter((e) => !used.has(e.contains)).map((e) => `${e.file}: ${e.contains}`);
  assert.deepEqual(stale, [], `these exceptions match no line any more and should be removed:\n${stale.join("\n")}`);
});

// The gate above reads the code; this one measures the behaviour it is there for. GIT_INDEX_FILE names the file git
// treats as the index, and `git ls-files` is what the secret scan uses to decide which files exist. An index of
// someone else's choosing would therefore decide what a secret scan looks at, and the evidence record would say a
// repository was scanned clean when its tracked files were never read.
test("an index named in the environment cannot narrow a secret scan", (t) => {
  const ctx = trapped(t);
  writeFileSync(join(ctx.repo, "config.env"), "TOKEN=not-a-real-value\n");
  ctx.git("add", "-A");
  ctx.git("commit", "-q", "-m", "second");
  const decoy = join(ctx.base, "decoy.index");
  execFileSync("git", ["-C", ctx.repo, "read-tree", "--empty"], { env: { ...process.env, ...GIT_ENV, HOME: ctx.home, GIT_INDEX_FILE: decoy } });

  // The positive control: plain git with that variable lists nothing, so the decoy really does narrow what git sees.
  const control = execFileSync("git", ["-C", ctx.repo, "ls-files"], { encoding: "utf8", env: { ...process.env, ...GIT_ENV, HOME: ctx.home, GIT_INDEX_FILE: decoy } });
  assert.equal(control.trim(), "", "the decoy index did not narrow plain git, so this case would prove nothing");

  const prepared = ctx.run(["prepare", "--apply"]);
  assert.equal(prepared.status, 0, `${prepared.stdout}${prepared.stderr}`);
  ctx.git("add", "-A");
  ctx.git("commit", "-q", "-m", "prepared");
  const tracked = execFileSync("git", ["-C", ctx.repo, "ls-files"], { encoding: "utf8", env: { ...process.env, ...GIT_ENV, HOME: ctx.home } }).trim().split("\n").length;
  assert.ok(tracked > 2, `the fixture has only ${tracked} tracked files, so the count below would prove little`);

  const r = ctx.run(["security", "collect", "secrets"], { env: { GIT_INDEX_FILE: decoy } });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const count = /tracked files to scan:\s*(\d+)/.exec(r.stdout);
  assert.ok(count, `the scan did not say how many files it would read:\n${r.stdout}${r.stderr}`);
  assert.equal(Number(count[1]), tracked, `the scan read the index from the environment, so it would have reported a repository clean without opening its files:\n${r.stdout}`);
});

test("the guardrails hook's git calls turn it off too", () => {
  const text = readFileSync(join(ROOT, "packs/base/plugins/guardrails/hooks/guard-bash.sh"), "utf8");
  const calls = text.split("\n").filter((line) => /^\s*git\s+-C/.test(line));
  assert.ok(calls.length > 0, "no git call found in the guardrails hook, so this check reads the wrong thing");
  for (const line of calls) assert.match(line, /core\.fsmonitor=false/, `a git call in the guardrails hook does not turn core.fsmonitor off: ${line.trim()}`);
});
