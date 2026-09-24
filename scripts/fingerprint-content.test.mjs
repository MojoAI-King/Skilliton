#!/usr/bin/env node
// fingerprint-content.test.mjs: the working tree fingerprint moves when the content of a changed path moves
// (packs/base/plugins/workflow/runtime/lib/journal.mjs, fingerprintOf and contentDigest).
//
// Before this, the fingerprint was HEAD plus the porcelain status, so a second edit to a file that was already
// modified left it unchanged and the stop reminder stayed quiet about real work. Now a content digest of the changed
// paths is part of it: `git hash-object` on each changed or untracked path, at most DIGEST_MAX_PATHS paths and only
// files under DIGEST_MAX_FILE_BYTES, with size and mtime standing in for a path over either bound.
//
// Each test works in its own folder under os.tmpdir() and removes it afterwards.
//
//   node --test scripts/fingerprint-content.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const JOURNAL = join(here, "..", "packs", "base", "plugins", "workflow", "runtime", "lib", "journal.mjs");
const { readGitState, contentDigest, fingerprintOf, porcelainPath, DIGEST_MAX_PATHS, DIGEST_MAX_FILE_BYTES } =
  await import(pathToFileURL(JOURNAL).href);

const git = (dir, ...args) => execFileSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args], { encoding: "utf8" });

function withRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), "skilliton-fingerprint-"));
  try {
    git(dir, "init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(dir, "add", "a.txt");
    git(dir, "commit", "-q", "-m", "first");
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("editing a tracked file that is already modified changes the fingerprint", () => withRepo((dir) => {
  writeFileSync(join(dir, "a.txt"), "two\n");
  const before = readGitState(dir);
  writeFileSync(join(dir, "a.txt"), "three\n");
  const after = readGitState(dir);
  assert.equal(before.porcelain, after.porcelain, "the porcelain is the same both times, so only content can tell them apart");
  assert.notEqual(before.fingerprint, after.fingerprint);
}));

test("editing an untracked file changes the fingerprint", () => withRepo((dir) => {
  writeFileSync(join(dir, "new.txt"), "draft\n");
  const before = readGitState(dir);
  writeFileSync(join(dir, "new.txt"), "draft, edited\n");
  const after = readGitState(dir);
  assert.equal(before.porcelain, after.porcelain);
  assert.notEqual(before.fingerprint, after.fingerprint);
}));

test("touching nothing leaves the fingerprint where it was, clean or dirty", () => withRepo((dir) => {
  assert.equal(readGitState(dir).fingerprint, readGitState(dir).fingerprint);
  writeFileSync(join(dir, "a.txt"), "two\n");
  writeFileSync(join(dir, "new.txt"), "draft\n");
  const first = readGitState(dir);
  assert.equal(first.fingerprint, readGitState(dir).fingerprint);
  assert.equal(first.dirty, 2);
}));

test("a clean tree has an empty digest, and fingerprintOf without one is HEAD plus porcelain as before", () => withRepo((dir) => {
  const state = readGitState(dir);
  assert.equal(contentDigest(dir, state.porcelain), "");
  assert.equal(state.fingerprint, fingerprintOf(state.head, state.porcelain));
}));

test("a changed file gets its object id; a deleted one says gone", () => withRepo((dir) => {
  writeFileSync(join(dir, "a.txt"), "two\n");
  const id = git(dir, "hash-object", "a.txt").trim();
  assert.equal(contentDigest(dir, " M a.txt\n"), `a.txt ${id}`);
  rmSync(join(dir, "a.txt"));
  assert.equal(contentDigest(dir, " D a.txt\n"), "a.txt gone");
}));

test("a file at the size bound contributes size and mtime, and an edit to it still moves the fingerprint", () => withRepo((dir) => {
  const big = join(dir, "big.bin");
  writeFileSync(big, "");
  truncateSync(big, DIGEST_MAX_FILE_BYTES);
  utimesSync(big, 1000, 1000);
  const digest = contentDigest(dir, "?? big.bin\n");
  assert.equal(digest, `big.bin ${DIGEST_MAX_FILE_BYTES}:1000000`);
  const before = readGitState(dir).fingerprint;
  utimesSync(big, 2000, 2000);
  assert.notEqual(readGitState(dir).fingerprint, before);
}));

test("only the first DIGEST_MAX_PATHS paths are hashed; the rest contribute size and mtime", () => withRepo((dir) => {
  const names = [];
  for (let i = 0; i < DIGEST_MAX_PATHS + 5; i++) {
    const name = `f${String(i).padStart(4, "0")}.txt`;
    writeFileSync(join(dir, name), `${i}\n`);
    names.push(name);
  }
  const porcelain = names.map((n) => `?? ${n}`).join("\n") + "\n";
  const lines = contentDigest(dir, porcelain).split("\n");
  assert.equal(lines.length, names.length);
  const hashed = lines.filter((l) => /^\S+ [0-9a-f]{40,64}$/.test(l)).length;
  assert.equal(hashed, DIGEST_MAX_PATHS);
  assert.match(lines[DIGEST_MAX_PATHS], /^f0200\.txt \d+:[\d.]+$/);
  // The 201st file is past the bound, and a rewrite of a different length still moves the fingerprint.
  const before = readGitState(dir).fingerprint;
  writeFileSync(join(dir, names[DIGEST_MAX_PATHS]), "a longer line than before\n");
  assert.notEqual(readGitState(dir).fingerprint, before);
}));

test("porcelain paths: renames give the destination, and quoted paths are unquoted", () => {
  assert.equal(porcelainPath("R  old.txt -> new.txt"), "new.txt");
  assert.equal(porcelainPath(" M plain.txt"), "plain.txt");
  assert.equal(porcelainPath('?? "with \\"quote\\".txt"'), 'with "quote".txt');
  assert.equal(porcelainPath('?? "caf\\303\\251.txt"'), "café.txt");
  assert.equal(porcelainPath('?? "tab\\there.txt"'), "tab\there.txt");
});

test("a quoted untracked path is hashed, not reported gone", () => withRepo((dir) => {
  writeFileSync(join(dir, "café.txt"), "x\n");
  const state = readGitState(dir);
  // git quotes the name unless core.quotePath is off on this machine; either way the digest must find the file.
  assert.doesNotMatch(contentDigest(dir, state.porcelain), /gone/);
}));
