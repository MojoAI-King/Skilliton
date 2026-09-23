// gate-context.test.mjs: N68. A failing `skilliton gate` verdict adds what it can measure about the machine and
// the tree without guessing (field report N57, backlog B77): the untracked files present when the run started, the
// tracked files already changed against HEAD, and the one-minute load average with the CPU count. A passing
// verdict is unchanged, and nothing is printed here that the tail-of-a-passing-run test in gate.test.mjs would not
// also see stay silent on.
//   node --test scripts/gate-context.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, "packs", "base", "plugins", "workflow", "runtime", "skilliton.mjs");
const base = mkdtempSync(join(tmpdir(), "skilliton-gate-context-"));
const home = join(base, "home");
mkdirSync(home);
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
const ENV = {
  ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
};
let count = 0;
function repo() {
  const dir = join(base, `r${++count}`);
  mkdirSync(dir);
  writeFileSync(join(dir, "README.md"), "# r\n");
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "first"]]) execFileSync("git", ["-C", dir, ...args], { env: ENV, stdio: "ignore" });
  return dir;
}
const gate = (dir, args, env = {}) => {
  const r = spawnSync(process.execPath, [CLI, "gate", "--dir", dir, ...args], { encoding: "utf8", env: { ...ENV, ...env } });
  return { status: r.status, out: r.stdout, err: r.stderr, all: r.stdout + r.stderr };
};

test("a failing run: untracked files, tracked-changed files against HEAD, load average, and the caveat sentence", () => {
  const dir = repo();
  writeFileSync(join(dir, "README.md"), "# changed\n"); // tracked, changed against HEAD
  writeFileSync(join(dir, "scratch.tmp"), "x\n"); // untracked
  const r = gate(dir, ["--cmd", "exit 1"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /untracked when the run started: 1 \(scratch\.tmp\)/);
  assert.match(r.out, /tracked file\(s\) changed against HEAD: 1 \(README\.md\)/);
  if (process.platform === "win32") {
    assert.match(r.out, /load average \(1m\): not measured on Windows/);
  } else {
    assert.match(r.out, /load average \(1m\): [\d.]+ across \d+ CPU\(s\)/);
  }
  assert.match(r.out, /a failure in a file outside these lists may come from the machine or another session, not the change/);
});

test("a passing run: the verdict is unchanged, no new lines even with an untracked file present", () => {
  const dir = repo();
  writeFileSync(join(dir, "scratch.tmp"), "x\n");
  const r = gate(dir, ["--cmd", "true"]);
  assert.equal(r.status, 0, r.all);
  assert.doesNotMatch(r.out, /untracked when the run started/);
  assert.doesNotMatch(r.out, /tracked file\(s\) changed against HEAD/);
  assert.doesNotMatch(r.out, /load average/);
  assert.doesNotMatch(r.out, /may come from the machine or another session/);
});

test("more than five untracked or tracked-changed files: the count is exact, only five paths are shown, and the rest are named as in the log", () => {
  const dir = repo();
  for (let i = 0; i < 7; i++) writeFileSync(join(dir, `u${i}.tmp`), "x\n");
  const r = gate(dir, ["--cmd", "exit 1"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /untracked when the run started: 7 \(u0\.tmp, u1\.tmp, u2\.tmp, u3\.tmp, u4\.tmp, and 2 more \(in the log\)\)/);
});

test("a clean tree on a failing run: both lists are named as empty, not omitted", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "exit 1"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /untracked when the run started: 0/);
  assert.match(r.out, /tracked file\(s\) changed against HEAD: 0/);
});

test("a file a check itself creates after the run started is not counted as untracked-at-start", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", `${process.execPath} -e "require('fs').writeFileSync('made-by-check.txt','x')"; exit 1`]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /untracked when the run started: 0/);
});
