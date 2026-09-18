// gate.test.mjs: `skilliton gate` against real commands in a temporary repository: a pass prints a verdict and
// nothing of the output; a failure prints the exit status and a bounded tail; a signal, a timeout and a program
// that cannot start are failures that say so; the policy's checks run in order and stop at the first failure;
// the tree is named; refusals write nothing.
//   node --test scripts/gate.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, "packs", "base", "plugins", "workflow", "runtime", "skilliton.mjs");
const base = mkdtempSync(join(tmpdir(), "skilliton-gate-"));
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
const logOf = (dir, label = "gate") => readFileSync(join(dir, ".git", "skilliton", "gate", `${label}.log`), "utf8");
const node = (script) => [process.execPath, "-e", script];

test("a passing command: verdict, tree, log path, and none of the output", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "echo the-secret-word; echo more >&2"]);
  assert.equal(r.status, 0, r.all);
  assert.match(r.out, /^skilliton gate \(gate\): PASS: echo the-secret-word; echo more >&2 exit 0 in [\d.]+s, from the --cmd option$/m);
  assert.match(r.out, /tree: [0-9a-f]{7,} on main, clean/);
  assert.match(r.out, /log: .*\.git\/skilliton\/gate\/gate\.log/);
  assert.equal(r.out.split("\n").filter((l) => l.startsWith("the-secret-word")).length, 0, "the output stays out of the conversation");
  const log = logOf(dir);
  assert.match(log, /the-secret-word/);
  assert.match(log, /more/);
  assert.match(log, /=== echo the-secret-word; echo more >&2: exit 0 ===/);
  assert.match(log, /tree: [0-9a-f]{7,} on main, uncommitted: none/);
});

test("a failing command: exit 1, the real exit status, and the last lines", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "seq 1 40; echo boom >&2; exit 7"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /FAIL: exit 7 after/);
  assert.match(r.out, /--- last 25 line\(s\)/);
  assert.match(r.out, /^  boom$/m);
  assert.match(r.out, /^  40$/m);
  assert.doesNotMatch(r.out, /^  1$/m, "only the tail is shown");
  assert.match(logOf(dir), /^1\n2\n/m);
});

test("--tail bounds the failure report", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "seq 1 40; exit 1", "--tail", "3"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /--- last 3 line\(s\)/);
  assert.match(r.out, /^  38\n  39\n  40$/m);
});

test("a command killed by a signal is a failure that names the signal", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "kill -TERM $$"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /FAIL: killed by SIGTERM/);
});

test("a command that runs past --timeout is stopped and reported", () => {
  const dir = repo();
  const began = Date.now();
  const r = gate(dir, ["--cmd", "sleep 30; echo late", "--timeout", "1"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /FAIL: timed out and was stopped/);
  assert.ok(Date.now() - began < 15000, "stopped by the timeout, not by the sleep ending");
  assert.doesNotMatch(logOf(dir), /^late$/m, "the command's own output after the timeout never arrived");
});

test("large output goes to the log in full, and the conversation gets a bounded verdict", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "seq 1 30000"]);
  assert.equal(r.status, 0, r.all);
  assert.ok(r.out.length < 1500, `verdict is ${r.out.length} bytes`);
  const lines = logOf(dir).split("\n");
  assert.ok(lines.includes("30000"), "the last line of the output reached the log");
  assert.ok(lines.includes("1"));
});

test("a changed tree is named, so a green is not mistaken for proof of a commit", () => {
  const dir = repo();
  writeFileSync(join(dir, "README.md"), "# changed\n");
  writeFileSync(join(dir, "new.txt"), "x\n");
  const r = gate(dir, ["--cmd", "true"]);
  assert.equal(r.status, 0);
  assert.match(r.out, /2 uncommitted file\(s\), so this verdict is about this tree and not about a commit: README\.md, new\.txt/);
});

test("--label names the log, and the log is private to the user", { skip: process.platform === "win32" }, () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "true", "--label", "c7.run-1"]);
  assert.equal(r.status, 0);
  const path = join(dir, ".git", "skilliton", "gate", "c7.run-1.log");
  assert.ok(existsSync(path));
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
});

test("the delivery policy's checks run in order, stop at the first failure, and the verdict names it", () => {
  const dir = repo();
  mkdirSync(join(dir, ".skilliton"));
  writeFileSync(join(dir, ".skilliton", "delivery.json"), JSON.stringify({
    schema: "skilliton.delivery/1", protectedBranches: ["main"], policyPaths: [".skilliton/delivery.json"],
    checks: [
      { name: "lint", command: node("console.log('lint ok')") },
      { name: "test", command: node("console.log('t1'); console.error('assertion failed'); process.exit(2)") },
      { name: "build", command: node("console.log('never')") },
    ],
  }, null, 2));
  const r = gate(dir, []);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /FAIL: check "test" exit 2 after [\d.]+s \(1 passed first: lint\); 1 later check\(s\) not run, from the 3 check\(s\) in \.skilliton\/delivery\.json/);
  assert.match(r.out, /--- last 2 line\(s\) of "test" ---\n  t1\n  assertion failed/);
  const log = logOf(dir);
  assert.ok(log.indexOf("=== lint ===") < log.indexOf("=== test ==="));
  assert.doesNotMatch(log, /never/);
  writeFileSync(join(dir, ".skilliton", "delivery.json"), JSON.stringify({
    schema: "skilliton.delivery/1", protectedBranches: ["main"], policyPaths: [".skilliton/delivery.json"],
    checks: [{ name: "lint", command: node("console.log('lint ok')") }, { name: "test", command: node("console.log('t ok')") }],
  }));
  const ok = gate(dir, ["--policy"]);
  assert.equal(ok.status, 0, ok.all);
  assert.match(ok.out, /PASS: 2 check\(s\) passed \(lint, test\) in/);
});

test("a check whose program does not exist is a failure that says so, not a crash", () => {
  const dir = repo();
  mkdirSync(join(dir, ".skilliton"));
  writeFileSync(join(dir, ".skilliton", "delivery.json"), JSON.stringify({ schema: "skilliton.delivery/1", protectedBranches: ["main"], policyPaths: [".skilliton/delivery.json"], checks: [{ name: "x", command: ["no-such-program-8f3a"] }] }));
  const r = gate(dir, []);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /FAIL: check "x" could not start: no-such-program-8f3a was not found on PATH/);
});

test("package.json's verify script is the fallback, run as npm run verify", () => {
  const dir = repo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", scripts: { verify: "node -e 0" } }));
  const bin = join(base, `bin${count}`);
  mkdirSync(bin);
  writeFileSync(join(bin, "npm"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(bin, "args")}"\necho fake npm ran\n`);
  chmodSync(join(bin, "npm"), 0o755);
  const r = gate(dir, [], { PATH: `${bin}:${process.env.PATH}` });
  assert.equal(r.status, 0, r.all);
  assert.match(r.out, /PASS: npm run verify exit 0 in [\d.]+s, from the "verify" script in package\.json/);
  assert.equal(readFileSync(join(bin, "args"), "utf8"), "run\nverify\n");
});

test("refusals: nothing to run, a bad label, a bad number, --cmd with --policy, --policy without a policy, a plain argument, an invalid policy", () => {
  const dir = repo();
  const cases = [
    [[], /nothing to run: no --cmd was given, \.skilliton\/delivery\.json does not exist, and package\.json has no "verify" script/],
    [["--cmd", "true", "--label", "bad label"], /--label must be/],
    [["--cmd", "true", "--tail", "0"], /--tail must be a whole number from 1 to 200/],
    [["--cmd", "true", "--timeout", "x"], /--timeout must be a whole number/],
    [["--cmd", "true", "--policy"], /--cmd and --policy cannot be combined/],
    [["--policy"], /--policy was given, but \.skilliton\/delivery\.json does not exist/],
    [["true"], /gate takes no plain arguments/],
  ];
  for (const [args, re] of cases) {
    const r = gate(dir, args);
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.all}`);
    assert.match(r.all, re);
  }
  mkdirSync(join(dir, ".skilliton"));
  writeFileSync(join(dir, ".skilliton", "delivery.json"), "{ not json");
  const bad = gate(dir, []);
  assert.equal(bad.status, 2, bad.all);
  assert.match(bad.all, /is not a valid delivery policy/);
  assert.ok(!existsSync(join(dir, ".git", "skilliton", "gate")), "a refusal writes nothing");
});

test("gate --help names the log location and the exit codes", () => {
  const r = spawnSync(process.execPath, [CLI, "gate", "--help"], { encoding: "utf8", env: ENV });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\.git\/skilliton\/gate\/<label>\.log/);
  assert.match(r.stdout, /Exit codes: 0 every run passed; 1 a run failed/);
});

test("a gate log that cannot be written is exit 3, not a run's verdict, and no check is started", { skip: process.platform === "win32" }, () => {
  const dir = repo();
  mkdirSync(join(dir, ".git", "skilliton", "gate", "gate.log"), { recursive: true }); // a directory where the log goes
  const marker = join(dir, "marker");
  const r = gate(dir, ["--cmd", `sleep 2; touch ${marker}`]);
  assert.equal(r.status, 3, r.all);
  assert.match(r.all, /the gate log could not be written \(EISDIR/);
  assert.doesNotMatch(r.all, /PASS|FAIL/);
  assert.ok(!existsSync(marker), "no check was started");
  spawnSync("sleep", ["3"]);
  assert.ok(!existsSync(marker), "and none was left running after the gate returned");
});

test("a timeout kills the whole process group, so a grandchild cannot outlive the check", { skip: process.platform === "win32" }, () => {
  const dir = repo();
  const escaped = join(dir, "escaped");
  const r = gate(dir, ["--cmd", `(sleep 3; touch ${escaped}) & sleep 30`, "--timeout", "1"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /timed out and was stopped/);
  spawnSync("sleep", ["4"]);
  assert.ok(!existsSync(escaped), "the backgrounded grandchild was killed with the group");
});

test("a policy check's own shorter timeout applies even when --timeout is longer", () => {
  const dir = repo();
  mkdirSync(join(dir, ".skilliton"));
  writeFileSync(join(dir, ".skilliton", "delivery.json"), JSON.stringify({
    schema: "skilliton.delivery/1", protectedBranches: ["main"], policyPaths: [".skilliton/delivery.json"],
    checks: [{ name: "slow", command: node("setTimeout(() => {}, 30000)"), timeoutSeconds: 1 }],
  }, null, 2));
  const began = Date.now();
  const r = gate(dir, ["--timeout", "60"]);
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /FAIL: check "slow" timed out and was stopped/);
  assert.ok(Date.now() - began < 15000, "stopped by the policy's one second, not the gate's sixty");
});

test("a newline-free stream keeps the tail bounded and the log complete", () => {
  const dir = repo();
  const r = gate(dir, ["--cmd", "head -c 3000000 /dev/zero | tr '\\0' a; exit 4", "--tail", "3"]);
  assert.equal(r.status, 1, r.all);
  assert.ok(r.out.length < 3000, `the verdict stays bounded (${r.out.length} chars)`);
  assert.equal((logOf(dir).match(/a/g) || []).length >= 3000000, true, "every byte reached the log");
});
