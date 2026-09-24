// write-links.test.mjs: harness, project-settings and dispatch's record merge never write through a symbolic link
// that leaves the repository. A repository can commit a link at CLAUDE.md, AGENTS.md or .claude/settings.json; before
// workflow 0.25.0, `harness --apply` wrote its block into the file such a link pointed at and `project-settings --apply`
// rewrote it, outside the repository, each saying it had written the project's own file. A link that stays inside the
// repository (AGENTS.md linked to CLAUDE.md) is followed as before; a dangling link and a second hard link are refused.
//   node scripts/write-links.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { linkedWriteProblem } from "../packs/base/plugins/workflow/runtime/lib/core.mjs";
import { applyMerge } from "../packs/base/plugins/workflow/runtime/lib/dispatch.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "skilliton.mjs");
const ORIGINAL = "a file outside the repository\n";

function withRepo(body) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "write-links-")));
  try {
    const repo = join(dir, "repo"), outside = join(dir, "outside");
    mkdirSync(repo); mkdirSync(outside);
    spawnSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(outside, "target.md"), ORIGINAL);
    const env = { ...process.env, SKILLITON_BACKUPS: join(dir, "backups") };
    const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: repo, encoding: "utf8", env });
    body({ repo, outside, cli });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const unchanged = (outside) => assert.equal(readFileSync(join(outside, "target.md"), "utf8"), ORIGINAL, "the file outside keeps every byte");

test("harness refuses a CLAUDE.md linked outside the repository, with nothing read or written", () => withRepo(({ repo, outside, cli }) => {
  symlinkSync(join(outside, "target.md"), join(repo, "CLAUDE.md"));
  const r = cli("harness", "--apply", "--file", "CLAUDE.md");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /CLAUDE\.md is a symbolic link to a place outside this repository.*Nothing was read or written/s);
  unchanged(outside);
}));

test("harness follows AGENTS.md linked to CLAUDE.md inside the repository, and writes one block", () => withRepo(({ repo, cli }) => {
  writeFileSync(join(repo, "CLAUDE.md"), "# Project\n");
  symlinkSync("CLAUDE.md", join(repo, "AGENTS.md"));
  const r = cli("harness", "--apply");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = readFileSync(join(repo, "CLAUDE.md"), "utf8");
  assert.equal(text.split("skilliton:harness:start").length - 1, 1, "one block, not two");
  assert.equal(linkedWriteProblem(repo, "AGENTS.md"), null);
}));

test("project-settings refuses a .claude/settings.json linked outside, and a linked .claude folder", () => withRepo(({ repo, outside, cli }) => {
  mkdirSync(join(repo, ".claude"));
  symlinkSync(join(outside, "target.md"), join(repo, ".claude", "settings.json"));
  assert.match(linkedWriteProblem(repo, ".claude/settings.json"), /settings\.json is a symbolic link to a place outside/);
  const r = cli("project-settings", "--apply", "--template", join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "project-settings.json"));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /settings\.json is a symbolic link to a place outside this repository/);
  unchanged(outside);
  rmSync(join(repo, ".claude"), { recursive: true });
  symlinkSync(outside, join(repo, ".claude"));
  assert.match(linkedWriteProblem(repo, ".claude/settings.json"), /^\.claude is a symbolic link to a place outside/);
}));

test("a dangling link and a second hard link are refused", () => withRepo(({ repo, outside }) => {
  symlinkSync(join(outside, "missing.md"), join(repo, "CLAUDE.md"));
  assert.match(linkedWriteProblem(repo, "CLAUDE.md"), /target does not exist/);
  linkSync(join(outside, "target.md"), join(repo, "AGENTS.md"));
  assert.match(linkedWriteProblem(repo, "AGENTS.md"), /has 2 hard links/);
  assert.equal(linkedWriteProblem(repo, "docs/not-there-yet.md"), null, "a path that does not exist yet is fine");
}));

test("dispatch's record merge stops at a record folder linked outside, and says what it wrote first", () => withRepo(({ repo, outside }) => {
  mkdirSync(join(repo, "docs"));
  symlinkSync(outside, join(repo, "docs", "tasks"));
  const plan = { bring: [
    { path: "docs/decisions/one.md", content: "one\n", lane: "a" },
    { path: "docs/tasks/two.md", content: "two\n", lane: "b" },
  ] };
  assert.throws(() => applyMerge(repo, plan), /docs\/tasks\/two\.md from lane b was not written: docs\/tasks is a symbolic link to a place outside.*1 record was written first: docs\/decisions\/one\.md/s);
  assert.equal(existsSync(join(outside, "two.md")), false);
}));
