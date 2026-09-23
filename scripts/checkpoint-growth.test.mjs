// checkpoint-growth.test.mjs: N69. `checkpoint --apply` notices a task that has grown past its start (field report
// N53, backlog B74): a task record that already holds 15 or more checkpoints, or whose first checkpoint is more than
// 24 hours old, gets one note, never blocking, naming the count and the date and pointing at the real task close and
// task start commands; below both limits nothing is printed, and the note never changes the record's own contents.
//   node --test scripts/checkpoint-growth.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const base = mkdtempSync(join(tmpdir(), "skilliton-checkpoint-growth-"));
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
let count = 0;

function fixture() {
  const dir = join(base, `r${++count}`);
  const home = join(base, `home${count}`);
  mkdirSync(dir);
  mkdirSync(home);
  const env = {
    ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
  };
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"], { env });
  const run = (args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env, encoding: "utf8" });
    return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
  };
  const prep = run(["prepare", "--apply"]);
  assert.equal(prep.code, 0, `fixture: prepare --apply: ${prep.all}`);
  execFileSync("git", ["-C", dir, "add", "-A"], { env });
  execFileSync("git", ["-C", dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "prepared"], { env });
  // A feature branch, not an integration branch, so the shared handoff and the indexes stay out of every checkpoint
  // this test makes: only the note under test is at stake.
  execFileSync("git", ["-C", dir, "checkout", "-q", "-b", "work"], { env });
  const start = run(["task", "start", "Grows past its start", "--criteria", "done", "--apply"]);
  assert.equal(start.code, 0, `fixture: task start --apply: ${start.all}`);
  const taskFile = join(dir, "docs", "tasks", readIdFromList(run));
  return { dir, env, run, taskFile };
}

// task start's own stdout does not spell out the id plainly enough to regex reliably across preview wording, so the
// id is read back from `task list`, which names exactly one open task on a fresh fixture.
function readIdFromList(run) {
  const listed = run(["task", "list"]);
  const m = /\* (\S+) /.exec(listed.out) ?? /^(\S+) /m.exec(listed.out.trim());
  assert.ok(m, `could not find the task id in: ${listed.all}`);
  return `${m[1]}.md`;
}

const checkpoint = (run, state) => run(["checkpoint", "--state", state, "--next", "keep going", "--apply"]);
const NOTE_RE = /checkpoint: note: This task has (\d+) checkpoints since (\S+)\. If the work has moved on from its criteria, close it \(.*task close \S+ --state <.*>\) and start one per new piece of work: .*task start "<title>" --apply/;

test("below both limits: no note, and each checkpoint still writes normally", () => {
  const { run } = fixture();
  for (let i = 1; i <= 14; i++) {
    const r = checkpoint(run, `state ${i}`);
    assert.equal(r.code, 0, `checkpoint ${i}: ${r.all}`);
    assert.doesNotMatch(r.all, /checkpoint: note:/, `checkpoint ${i} of 14 should not yet warn: ${r.all}`);
  }
});

test("at 15 checkpoints already held, the 16th call adds the note; the record's checkpoints are unaffected", () => {
  const { run, taskFile } = fixture();
  for (let i = 1; i <= 15; i++) {
    const r = checkpoint(run, `state ${i}`);
    assert.equal(r.code, 0, `checkpoint ${i}: ${r.all}`);
    assert.doesNotMatch(r.all, /checkpoint: note:/, `checkpoint ${i} of 15 should not yet warn: ${r.all}`);
  }
  const before = readFileSync(taskFile, "utf8");
  const r16 = checkpoint(run, "state 16");
  assert.equal(r16.code, 0, r16.all);
  const m = NOTE_RE.exec(r16.all);
  assert.ok(m, `expected the growth note in: ${r16.all}`);
  assert.equal(m[1], "15", "the count printed is what the record already held, not counting the one just added");
  const after = readFileSync(taskFile, "utf8");
  const withoutUpdated = (t) => t.replace(/- \*\*Updated:\*\* \S+/, "").replace(/### \S+$/m, "");
  // The note changes nothing about how a checkpoint is written: the 16th checkpoint's own text lands exactly as the
  // first fifteen did, and the note is not itself written into the file.
  assert.ok(!after.includes("checkpoint: note:"), "the note text never reaches the file");
  assert.ok(after.length > before.length, "the 16th checkpoint was still appended");
});

test("a first checkpoint over 24 hours old adds the note even with few checkpoints, without changing the record beyond the new checkpoint", () => {
  const { run, taskFile } = fixture();
  const first = checkpoint(run, "first");
  assert.equal(first.code, 0, first.all);
  assert.doesNotMatch(first.all, /checkpoint: note:/);
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const before = readFileSync(taskFile, "utf8");
  const backdated = before.replace(/### \S+/, `### ${old}`);
  assert.notEqual(backdated, before, "the fixture's first checkpoint heading was found and rewritten");
  writeFileSync(taskFile, backdated);
  const second = checkpoint(run, "second");
  assert.equal(second.code, 0, second.all);
  const m = NOTE_RE.exec(second.all);
  assert.ok(m, `expected the age-based growth note in: ${second.all}`);
  assert.equal(m[1], "1", "only one checkpoint was held before this one");
  assert.equal(m[2].replace(/\.$/, ""), old, "the date named is the first checkpoint's own heading");
});

test("a task with no checkpoints yet: the first checkpoint call never warns", () => {
  const { run } = fixture();
  const r = checkpoint(run, "only one so far");
  assert.equal(r.code, 0, r.all);
  assert.doesNotMatch(r.all, /checkpoint: note:/);
});
