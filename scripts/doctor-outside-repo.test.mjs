// scripts/doctor-outside-repo.test.mjs: doctor in a folder that is not a git repository says so, and every hint it
// prints names the project folder by its absolute path (packs/base/plugins/workflow/runtime/commands/doctor.mjs).
//
// Run in a folder outside any repository, doctor told the person to prepare the project, and prepare then refused,
// because there is no repository to prepare. Its hints also relied on the current folder (prepare --apply with no
// --dir), so a line pasted into another terminal acted on the wrong folder.
//
// Run: node --test scripts/doctor-outside-repo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const NOT_A_REPOSITORY = "this folder is not a git repository, so there is nothing to prepare: run doctor inside a repository";

function onPath(name) {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${name} is needed by this test and was not found on PATH`);
  return r.stdout.trim();
}

function setup(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-doctor-outside-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const bin = join(base, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync(onPath("git"), join(bin, "git"));
  // GIT_CEILING_DIRECTORIES stops git looking above base, so a temporary folder inside some repository still reads
  // as outside one.
  const env = { PATH: bin, HOME: join(base, "home"), LANG: "C.UTF-8", GIT_CONFIG_NOSYSTEM: "1", GIT_CEILING_DIRECTORIES: base };
  return { base, env };
}

function doctor(cwd, env) {
  const r = spawnSync(process.execPath, [CLI, "doctor"], { cwd, env, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("a folder that is not a git repository is told so, not sent to prepare", { skip: process.platform === "win32" }, (t) => {
  const { base, env } = setup(t);
  const folder = join(base, "plain");
  mkdirSync(folder);
  const { status, out } = doctor(folder, env);
  assert.equal(status, 1, out);
  assert.match(out, /^project: .*plain \(not a git repository\)$/m);
  assert.match(out, new RegExp(`^Summary: .*Next: (.*; then )?${NOT_A_REPOSITORY}; then run doctor again\\.$`, "m"));
  assert.match(out, new RegExp(`project layout: not prepared by Skilliton; ${NOT_A_REPOSITORY}$`, "m"));
  assert.doesNotMatch(out, /prepare --apply|prepare --dir|harness --apply/, "no hint sends it to a command that would refuse");
});

test("in a repository, the prepare hint names the folder by its absolute path", { skip: process.platform === "win32" }, (t) => {
  const { base, env } = setup(t);
  const repo = join(base, "repo");
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const { status, out } = doctor(repo, env);
  assert.equal(status, 1, out);
  assert.doesNotMatch(out, /not a git repository/);
  const m = /prepare the project, which writes the harness block and its records: .+? prepare --apply --dir ([^\s;]+)/.exec(out);
  assert.ok(m, out);
  assert.ok(isAbsolute(m[1]), `the hint names ${m[1]}, which is not an absolute path`);
  assert.equal(realpathSync(m[1]), realpathSync(repo));
  assert.match(out, / prepare --dir \S+/, "the layout line's hint carries the folder too");
});
