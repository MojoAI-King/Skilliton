// checks-runner.test.mjs: the local check runner (scripts/checks.mjs) fails the way CI fails. GitHub runs a `run:`
// step with `bash --noprofile --norc -eo pipefail`, so a step whose first command fails is a failed step even when
// its last command succeeds, and a pipeline whose first stage fails fails the step. The runner read PASS for both
// before (N95). Each test writes a fixture workflow, runs the runner against it with --workflow, and reads the
// verdict lines and the exit status; the logs go to a temporary folder so a real run's logs are left alone.
//   node --test scripts/checks-runner.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STEP_SHELL, readSteps } from "./checks.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = join(REPO, "scripts", "checks.mjs");
const base = mkdtempSync(join(tmpdir(), "skilliton-checks-runner-"));
process.on("exit", () => rmSync(base, { recursive: true, force: true }));

let count = 0;
// A workflow in the shape checks.yml has: one job, each step a name and a run line or a `run: |` block.
function workflow(steps) {
  const lines = ["name: fixture", "jobs:", "  checks:", "    runs-on: ubuntu-latest", "    steps:"];
  for (const s of steps) {
    lines.push(`      - name: ${s.name}`);
    if (s.run.includes("\n")) {
      lines.push("        run: |");
      for (const l of s.run.split("\n")) lines.push(l ? `          ${l}` : "");
    } else lines.push(`        run: ${s.run}`);
    lines.push("");
  }
  const file = join(base, `workflow-${++count}.yml`);
  writeFileSync(file, lines.join("\n"));
  return file;
}
function run(file, extra = []) {
  const logs = mkdtempSync(join(base, "logs-"));
  const r = spawnSync(process.execPath, [RUNNER, "--workflow", file, ...extra], {
    encoding: "utf8", env: { ...process.env, SKILLITON_CHECKS_LOG_DIR: logs },
  });
  return { status: r.status, out: r.stdout, all: r.stdout + r.stderr };
}

test("the runner uses the shell GitHub gives a run step", () => {
  assert.deepEqual(STEP_SHELL, ["--noprofile", "--norc", "-eo", "pipefail", "-c"]);
});

test("the fixture reads back as the steps written", () => {
  const file = workflow([{ name: "One", run: "true" }, { name: "Two", run: "false\ntrue" }]);
  assert.deepEqual(readSteps(readFileSync(file, "utf8")), [{ name: "One", run: "true" }, { name: "Two", run: "false\ntrue" }]);
});

test("a step whose first command exits 1 and second exits 0 reads FAIL, 0 pass 1 fail, exit 1", () => {
  const r = run(workflow([{ name: "Early failure", run: "sh -c 'exit 1'\nsh -c 'exit 0'" }]));
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, / 1 FAIL Early failure exit 1 /);
  assert.match(r.out, /checks: 0 pass, 1 fail, 0 skipped, of 1/);
});

test("the plain two-command case: false then true is a failed step", () => {
  const r = run(workflow([{ name: "False then true", run: "false\ntrue" }]));
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, /checks: 0 pass, 1 fail, 0 skipped, of 1/);
});

test("a step that fails only its pipeline's first stage reads FAIL", () => {
  const r = run(workflow([{ name: "First stage fails", run: "false | cat" }]));
  assert.equal(r.status, 1, r.all);
  assert.match(r.out, / 1 FAIL First stage fails exit 1 /);
  assert.match(r.out, /checks: 0 pass, 1 fail, 0 skipped, of 1/);
});

test("a step with a loop and a trailing success reads PASS when every command succeeds", () => {
  const r = run(workflow([{ name: "Loop then success", run: "for t in a b c; do test -n \"$t\" || exit 1; done\necho done | cat" }]));
  assert.equal(r.status, 0, r.all);
  assert.match(r.out, / 1 PASS Loop then success /);
  assert.match(r.out, /checks: 1 pass, 0 fail, 0 skipped, of 1/);
});

test("--only still selects by name, and a failure outside the selection does not count", () => {
  const file = workflow([
    { name: "Alpha passes", run: "true" },
    { name: "Beta fails early", run: "false\ntrue" },
    { name: "Gamma passes", run: "echo ok" },
  ]);
  const chosen = run(file, ["--only", "Gamma"]);
  assert.equal(chosen.status, 0, chosen.all);
  assert.match(chosen.out, /checks: 1 step\(s\) from /);
  assert.match(chosen.out, / 1 PASS Gamma passes /);
  assert.doesNotMatch(chosen.out, /Beta/);
  assert.match(chosen.out, /checks: 1 pass, 0 fail, 0 skipped, of 1/);

  const failing = run(file, ["--only", "Beta"]);
  assert.equal(failing.status, 1, failing.all);
  assert.match(failing.out, /checks: 0 pass, 1 fail, 0 skipped, of 1/);

  const all = run(file);
  assert.equal(all.status, 1, all.all);
  assert.match(all.out, /checks: 2 pass, 1 fail, 0 skipped, of 3/);
  assert.match(all.out, /  failed: Beta fails early/);

  const none = run(file, ["--only", "Delta"]);
  assert.equal(none.status, 2, none.all);
  assert.match(none.out, /checks NOT RUN: no step name contains "Delta"/);
});

test("a workflow file that does not exist is NOT RUN, exit 2", () => {
  const r = run(join(base, "missing.yml"));
  assert.equal(r.status, 2, r.all);
  assert.match(r.out, /checks NOT RUN: .*missing\.yml does not exist/);
});
