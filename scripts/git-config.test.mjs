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
import { jsProgramCalls } from "./inventory.mjs";
import { CONFIG_FROM_THE_ENVIRONMENT, REPOSITORY_OVERRIDES } from "../packs/base/plugins/workflow/runtime/lib/journal.mjs";

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
// which removes the variables that would choose the repository (GIT_DIR, GIT_INDEX_FILE and the rest), hand in
// settings from outside a configuration file, or name a program for git to run. A line that matches nothing is a
// failure too, so an exception cannot outlive the code it excuses.
//
// Both gates read the calls with the same reader the allow-list and footprint checks use, rather than with a regular
// expression of their own. A regular expression over single lines let five ways of writing the same call through: a
// program name in backticks or in a constant, a call split over two lines, exec with a command line, and a wrapper
// that puts process.env back. The reader follows all of them, and it reads every file in the runtime rather than a
// list written here, so a git call in a new file cannot arrive unchecked.
const ENVIRONMENT_FROM_THE_CALLER = [
  { file: "delivery.mjs", contains: "env, encoding: buffer", why: "the push hook's own environment names the repository and the quarantined objects" },
  { file: "delivery.mjs", contains: '"archive", "--format=tar"', why: "the same runner's environment, for the archive it extracts" },
];
const RUNTIME_LIB = join(ROOT, "packs/base/plugins/workflow/runtime/lib");
const RUNTIME_COMMANDS = join(ROOT, "packs/base/plugins/workflow/runtime/commands");
// The wrappers a git call can be made through, so a call to one of these is read as a start of git too.
const WRAPPERS = ["runGit", "runProgram", "git", "startOnce"];

// Every start of git in the runtime: { file, line, call (its text), argsText, options, direct (a child_process call
// rather than a call to a wrapper) }.
function gitStarts() {
  const found = [];
  for (const dir of [RUNTIME_LIB, RUNTIME_COMMANDS]) {
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".mjs"))) {
      const text = readFileSync(join(dir, name), "utf8");
      const lines = text.split("\n");
      for (const call of jsProgramCalls(text, WRAPPERS).calls) {
        // `git`, `/usr/bin/git`, `git.exe`, and exec's whole command line beginning with git.
        if (!call.program || !/(?:^|[\\/])git(?:\.exe)?(?:$|\s)/.test(call.program)) continue;
        found.push({
          file: name, line: call.line, direct: call.fn !== null, fn: call.fn,
          call: lines.slice(call.line - 1, call.line + 3).join(" "),
          argsText: call.argsText ?? "", options: call.options, body: text,
        });
      }
    }
  }
  return found;
}

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

// True when an expression is built from gitEnvironment() and nothing else: written there, or the name of a wrapper
// defined in the same file whose body calls it and never reaches for process.env, or a variable assigned from it.
function fromGitEnvironment(expression, start) {
  if (expression === null || expression.includes("process.env")) return false;
  if (expression.includes("gitEnvironment(")) return true;
  const wrapper = /([A-Za-z_$][\w$]*)\s*\(/.exec(expression)?.[1];
  if (wrapper) {
    const body = new RegExp(`function ${wrapper}\\([^)]*\\)[^\n]*\\{([\\s\\S]{0,600}?)\n\\}`).exec(start.body)?.[1] ?? "";
    return body.includes("gitEnvironment(") && !body.includes("process.env");
  }
  if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
    const above = start.body.split("\n").slice(Math.max(0, start.line - 13), start.line).join("\n");
    return new RegExp(`(?:const|let|var)\\s+${expression}\\s*=\\s*gitEnvironment\\(`).test(above);
  }
  return false;
}

test("every git call in the runtime turns the setting off", () => {
  const starts = gitStarts();
  assert.ok(starts.length >= 5, `only ${starts.length} git call(s) were found in the runtime, so this check is reading the wrong thing`);
  const missing = starts
    .filter((s) => !s.argsText.includes("NO_REPOSITORY_PROGRAMS") && !/core\.fsmonitor=false/.test(s.call))
    .map((s) => `${s.file}:${s.line}: ${s.call.trim().slice(0, 120)}`);
  assert.deepEqual(missing, [], `these git calls do not pass NO_REPOSITORY_PROGRAMS, so a repository's own configuration could make git start a program:\n${missing.join("\n")}`);
});

test("every git call in the runtime takes its environment from gitEnvironment, or says why not", () => {
  const used = new Set();
  const found = [];
  for (const start of gitStarts()) {
    const allowed = ENVIRONMENT_FROM_THE_CALLER.find((e) => e.file === start.file && start.call.includes(e.contains));
    if (allowed) { used.add(allowed.contains); continue; }
    // A call made through a wrapper does not carry spawn options itself: what it must show is that it hands the
    // wrapper an environment built from gitEnvironment(). The wrapper's own call to child_process is in this list
    // too, and is read the strict way.
    const expression = start.direct ? envExpression(start.call) : (/gitEnvironment\(/.test(start.call) ? "gitEnvironment()" : envExpression(start.call));
    if (!fromGitEnvironment(expression, start)) {
      found.push(`${start.file}:${start.line}: ${start.call.trim().slice(0, 140)}`);
    }
  }
  const stale = ENVIRONMENT_FROM_THE_CALLER.filter((e) => !used.has(e.contains)).map((e) => `${e.file}: ${e.contains}`);
  // Checked before the findings, so a real violation cannot hide a stale exception.
  assert.deepEqual(stale, [], `these exceptions match no line any more and should be removed:\n${stale.join("\n")}`);
  assert.deepEqual(found, [], `these git calls take their environment from around them, so GIT_DIR or GIT_INDEX_FILE could decide which repository they read:\n${found.join("\n")}`);
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

test("the guardrails hook's git calls turn it off too, and take the same variables out", () => {
  const text = readFileSync(join(ROOT, "packs/base/plugins/guardrails/hooks/guard-bash.sh"), "utf8");
  const calls = text.split("\n").filter((line) => /^\s*(env .*)?git\s+-C/.test(line));
  assert.ok(calls.length > 0, "no git call found in the guardrails hook, so this check reads the wrong thing");
  for (const line of calls) assert.match(line, /core\.fsmonitor=false/, `a git call in the guardrails hook does not turn core.fsmonitor off: ${line.trim()}`);
  // The hook decides whether a command a session is running is allowed, so its own reading of the repository must
  // not be answerable by the environment that session set up. The list is the runtime's, in the shell's spelling.
  const helper = /^g\(\)[\s\S]{0,1600}?^\}/m.exec(text)?.[0] ?? "";
  assert.ok(helper.includes("git -C"), "the git helper in the guardrails hook could not be found, so this check reads nothing");
  for (const name of [...REPOSITORY_OVERRIDES, ...CONFIG_FROM_THE_ENVIRONMENT]) {
    assert.match(helper, new RegExp(`-u ${name}\\b`), `the guardrails hook's git helper does not take ${name} out of the environment`);
  }
});
