// dispatch-links.test.mjs: `skilliton dispatch --apply` never writes a lane's brief, task record or report through a
// symbolic link. Each lane worktree is checked out from the base commit, so a committed link at LANE_BRIEF.md, at
// LANE_REPORT.md or at a folder of the task record's path made dispatch write outside the repository (reproduced
// 2026-09-24 with an absolute link: the brief landed in the file it pointed at, exit 0). Such a base commit is now
// refused before any worktree is made. A failure after a worktree exists names that worktree; before, the message said
// "No lane was created" while the failing lane's worktree and branch were still there.
//   node scripts/dispatch-links.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "skilliton.mjs");
const ORIGINAL = "a file outside the repository\n";
const ID = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };

function withRepo(body) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "dispatch-links-")));
  try {
    const repo = join(dir, "repo"), outside = join(dir, "outside");
    mkdirSync(repo); mkdirSync(outside);
    const env = { ...process.env, ...ID, SKILLITON_AUTO_PREPARE: "off", SKILLITON_BACKUPS: join(dir, "backups") };
    const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8", env });
    const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: "utf8", env });
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "init");
    assert.equal(cli("prepare", "--apply").status, 0, "prepare");
    writeFileSync(join(outside, "target.md"), ORIGINAL);
    const commitAll = (m) => { git("add", "-A"); git("commit", "-q", "-m", m); };
    const plan = () => writeFileSync(join(repo, "LANES.md"), `Base commit: ${git("rev-parse", "HEAD").stdout.trim()}\n\n## Lane: one   branch: lane/one-0924\n\n### Brief\n\nItems:\nN1. [TOUCH] a thing: src/a.js: done\n`);
    body({ dir, repo, outside, git, cli, commitAll, plan });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const worktrees = (git) => git("worktree", "list", "--porcelain").stdout.split("\n").filter((l) => l.startsWith("worktree ")).length;

test("control: a base commit with no link dispatches one lane and writes its brief inside it", () => withRepo(({ dir, git, cli, commitAll, plan }) => {
  commitAll("prepared");
  plan();
  const r = cli("dispatch", "--apply");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(readFileSync(join(dir, "repo-lanes", "one", "LANE_BRIEF.md"), "utf8"), /^# Lane brief: one/);
  assert.equal(worktrees(git), 2);
}));

test("a committed LANE_BRIEF.md linked outside is refused before any worktree is made", () => withRepo(({ repo, outside, git, cli, commitAll, plan }) => {
  symlinkSync(join(outside, "target.md"), join(repo, "LANE_BRIEF.md"));
  commitAll("a linked brief");
  plan();
  const r = cli("dispatch", "--apply");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /the base commit holds a symbolic link at LANE_BRIEF\.md, where dispatch writes in each lane/);
  assert.equal(readFileSync(join(outside, "target.md"), "utf8"), ORIGINAL, "the file outside keeps every byte");
  assert.equal(worktrees(git), 1, "no lane worktree was made");
}));

test("a tasks folder or LANE_REPORT.md linked in the base commit is refused the same way", () => withRepo(({ repo, outside, cli, commitAll, plan }) => {
  const tasks = join(repo, "docs", "tasks");
  const keep = readFileSync(join(tasks, "README.md"));
  rmSync(tasks, { recursive: true });
  symlinkSync(outside, tasks);
  symlinkSync(join(outside, "target.md"), join(repo, "LANE_REPORT.md"));
  commitAll("linked tasks folder and report");
  // The working tree gets its real folder back, so only the base commit holds the link: the project's own tasks-folder
  // check (which refuses a linked folder in the working tree) passes, and the base-commit check is what is tested.
  rmSync(tasks);
  mkdirSync(tasks);
  writeFileSync(join(tasks, "README.md"), keep);
  plan();
  const r = cli("dispatch", "--apply");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /symbolic link at docs\/tasks,/);
  assert.match(r.stdout + r.stderr, /symbolic link at LANE_REPORT\.md,/);
  assert.equal(readFileSync(join(outside, "target.md"), "utf8"), ORIGINAL);
}));

test("a failure after the worktree exists names that worktree instead of saying none was made", () => withRepo(({ repo, git, cli, commitAll, plan }) => {
  mkdirSync(join(repo, "LANE_BRIEF.md")); // a folder where the brief goes: not a link, so the plan passes and the write fails
  writeFileSync(join(repo, "LANE_BRIEF.md", "keep"), "x\n");
  commitAll("a folder named like the brief");
  plan();
  const r = cli("dispatch", "--apply");
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /1 worktree\(s\) exist from this run: one \(.*repo-lanes\/one, branch lane\/one-0924\)\. Remove one with: git worktree remove/);
  assert.doesNotMatch(r.stdout + r.stderr, /No lane was created|No worktree was made/);
  assert.equal(worktrees(git), 2, "the worktree the message names is really there");
  assert.equal(existsSync(join(repo, "..", "repo-lanes", "one")), true);
}));
