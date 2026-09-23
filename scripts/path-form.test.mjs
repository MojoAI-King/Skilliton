// path-form.test.mjs: the path comparison behind the plain Git folder check, on every platform.
//
// The first Windows run refused every repository because git printed C:/Users/... and Node's realpath gave
// C:\Users\... for the same folder. samePath takes the platform as an argument, so the win32 rules are proved here on
// Linux and macOS too; the real-folder cases then run the check prepare makes on an ordinary Git folder and on a
// linked one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { samePath } from "../packs/base/plugins/workflow/runtime/lib/path-form.mjs";
import { resolveGitRoot } from "../packs/base/plugins/workflow/runtime/lib/prepare.mjs";

test("POSIX compares exactly", () => {
  assert.equal(samePath("/a/b/.git", "/a/b/.git", "linux"), true);
  assert.equal(samePath("/a/b/.git", "/a/B/.git", "darwin"), false);
  assert.equal(samePath("/a/b/.git", "/a/b/.git/", "linux"), false);
  assert.equal(samePath("/a/b\\.git", "/a/b/.git", "linux"), false);
});

test("win32 ignores the separator, letter case, a trailing separator and the long-path prefix", () => {
  const real = "D:\\a\\work\\repo\\.git";
  for (const printed of ["D:/a/work/repo/.git", "d:\\a\\work\\repo\\.git", "D:/a/work/repo/.git/", "\\\\?\\D:\\a\\work\\repo\\.git"]) {
    assert.equal(samePath(real, printed, "win32"), true, printed);
  }
  assert.equal(samePath("C:\\", "c:/", "win32"), true);
});

test("win32 still tells two places apart", () => {
  const real = "D:\\a\\work\\repo\\.git";
  assert.equal(samePath(real, "D:/a/work/other/.git", "win32"), false);
  assert.equal(samePath(real, "C:/a/work/repo/.git", "win32"), false);
  assert.equal(samePath(real, "D:/a/work/repo/.git/x/..", "win32"), true, "the same folder by normalization");
  assert.equal(samePath("C:\\Program Files\\Git", "C:/PROGRA~1/Git", "win32"), false, "a short name is not expanded here");
});

test("a failed realpath never matches", () => {
  for (const platform of ["linux", "win32"]) {
    assert.equal(samePath(null, "/a", platform), false);
    assert.equal(samePath("/a", undefined, platform), false);
  }
});

const git = (dir, ...args) => spawnSync("git", ["-C", dir, "-c", "init.defaultBranch=main", ...args], { encoding: "utf8" });

test("prepare accepts an ordinary Git folder", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-path-form-")));
  try {
    assert.equal(git(dir, "init", "-q").status, 0);
    const { root, gitDir } = resolveGitRoot(dir);
    assert.equal(samePath(root, realpathSync.native(dir)), true);
    assert.equal(samePath(realpathSync(gitDir), join(root, ".git")), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Measured on macOS 2026-09-22: git resolves a linked .git before it prints --absolute-git-dir, so the comparison
// sees the real folder and passes, and the backups land in that real folder, not through the link. This pins that
// behavior; the comparison itself catches a Git folder that cannot be opened (the realpath fails).
test("a linked .git is reported as the folder it points at", { skip: process.platform === "win32" ? "a symbolic link needs developer mode or administrator rights on Windows" : false }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-path-form-")));
  try {
    const repo = join(dir, "repo"), elsewhere = join(dir, "elsewhere");
    mkdirSync(repo); mkdirSync(elsewhere);
    assert.equal(git(elsewhere, "init", "-q").status, 0);
    symlinkSync(join(elsewhere, ".git"), join(repo, ".git"));
    assert.equal(resolveGitRoot(repo).gitDir, join(elsewhere, ".git"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
