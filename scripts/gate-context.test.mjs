// gate-context.test.mjs: N68. A failing `skilliton gate` verdict adds what it can measure about the machine and
// the tree without guessing (field report N57, backlog B77): the untracked files present when the run started, the
// tracked files already changed against HEAD, and the one-minute load average with the CPU count. A passing
// verdict is unchanged, and nothing is printed here that the tail-of-a-passing-run test in gate.test.mjs would not
// also see stay silent on. N16: a failing verdict also names the tracked files its output mentions that are outside
// the change (against the merge base with the integration branch), and the other node processes running at the start.
//   node --test scripts/gate-context.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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
  assert.doesNotMatch(r.out, /failing files outside your change|competing processes/);
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

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { env: ENV, stdio: "ignore" });

test("a failing run names the tracked files its output mentions that are outside the change, and only those", () => {
  const dir = repo();
  mkdirSync(join(dir, "lib"));
  writeFileSync(join(dir, "lib", "other.js"), "1\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "other");
  git(dir, "checkout", "-q", "-b", "feature");
  writeFileSync(join(dir, "mine.js"), "2\n");
  git(dir, "add", "mine.js");
  git(dir, "commit", "-q", "-m", "mine"); // committed on the branch: in the change through the merge base, not the tree
  writeFileSync(join(dir, "README.md"), "# changed\n"); // changed in the working tree: in the change too
  const script = [
    `echo "Error: at check (${join(dir, "lib", "other.js")}:3:1)"`, 'echo "at mine.js:1:1 and README.md"',
    'echo "missing/nothing.js is not in the tree"', "exit 1",
  ].join("; ");
  const r = gate(dir, ["--cmd", script]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /failing files outside your change: 1 \(lib\/other\.js\); the change is what differs from the merge base with main, and the working tree/);
});

test("a failing run names the other node processes running at the start; the gate's own process is not one of them", async (t) => {
  if (process.platform === "win32") {
    const r = gate(repo(), ["--cmd", "exit 1"]);
    assert.match(r.out, /competing processes: not measured on Windows/);
    return;
  }
  const other = spawn(process.execPath, ["-e", "setTimeout(Date, 60000)"], { stdio: "ignore" });
  t.after(() => other.kill("SIGKILL"));
  const r = gate(repo(), ["--cmd", "exit 1"]);
  assert.equal(r.status, 1, r.all);
  const m = /competing processes: (\d+) other node process\(es\) running at the start: (.*)$/m.exec(r.out);
  assert.ok(m, `no competing processes line in:\n${r.out}`);
  const count = Number(m[1]);
  const shown = m[2].split("; ");
  assert.ok(count >= 1, "the node process started for this case is counted");
  assert.ok(shown.length <= 3 && shown.length === Math.min(3, count), "the first three are shown, never more");
  for (const line of shown) assert.match(line, /^\d+ [\d:-]+ .{1,80}$/, "each is pid, elapsed time and a command cut at 80 characters");
  // Newest first, so the process this case started a moment ago is normally shown; another suite starting node in the
  // same instant can push it past the first three, which the count still reflects.
  assert.ok(shown.some((line) => line.startsWith(`${other.pid} `)) || count > 3, `process ${other.pid} is not shown:\n${r.out}`);
});
