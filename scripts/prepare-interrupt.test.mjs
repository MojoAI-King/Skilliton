#!/usr/bin/env node
// prepare-interrupt.test.mjs: an interrupted `skilliton prepare --apply` recovers by the book (B: N82).
//
// prepare's lock (.skilliton/prepare.lock) is released in a `finally` (packs/base/plugins/workflow/runtime/lib/
// prepare.mjs applyChanges), which never runs when the process is ended by a signal it does not handle: a real
// crash, or an operator's SIGTERM, leaves the lock and whatever files were written before the signal landed. Neither
// prepare.mjs nor the CLI entry point installs a SIGTERM handler, so the default disposition (immediate termination)
// applies, the same as a crash.
//
// This proves the documented way back from that state: the next prepare --apply refuses, naming the lock and what
// to do about it (read the lock for the process id, confirm that process is gone, delete the lock, run again);
// following those steps finishes the job; and what it leaves behind is byte for byte what an uninterrupted
// prepare --apply would have written to the same fixture, comparing every file's path and contents, never a
// modification time. A crash-atomic multi-file transaction is not what this proves: prepare's own rollback already
// covers a write that fails mid-run (scripts/prepare.test.mjs); this is the separate, documented recovery for a run
// that was not there to roll itself back.
//
//   node --test scripts/prepare-interrupt.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-prepare-interrupt-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d);
  git(ctx.dir, "init", "-q", "-b", "main");
  return ctx;
}

function sg(ctx, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const prepare = (ctx, ...args) => sg(ctx, ["prepare", "--dir", ctx.dir, ...args]);

// Every entry under dir except .git: folders and files, by their bytes, never a modification time, so two trees
// compare equal exactly when prepare wrote the same paths with the same content in each.
function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    const entries = readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (!rel && e.name === ".git") continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { out[`${p}/`] = "folder"; walk(p); }
      else out[p] = readFileSync(join(dir, p)).toString("base64");
    }
  };
  walk("");
  return out;
}

// Holds the process for up to 2s right after docs/STATUS.md (the first file prepare's plan creates: ROLES's first
// role, "status") is renamed into place, so the test can observe it on disk and send a real SIGTERM before the run
// reaches its next file. Without this, catching the process between two of nineteen small, fast writes would be a
// race the test could lose; the pause makes the interruption point deterministic, the signal itself is not faked.
const PAUSE_AFTER_STATUS = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const rename = fs.renameSync; let fired = false;
fs.renameSync = (a, b) => {
  const out = rename(a, b);
  if (!fired && String(b).replace(/\\\\/g, '/').endsWith('/docs/STATUS.md')) { fired = true; const until = Date.now() + 2000; while (Date.now() < until) { /* held so the test can observe the file and signal before the run writes anything more */ } }
  return out;
};
syncBuiltinESMExports();`;

test("an interrupted prepare --apply recovers by the book, and finishes the same job", async (t) => {
  const ctx = fixture(t);

  // What an uninterrupted prepare --apply produces on an identical fixture, for the final comparison.
  const control = fixture(t);
  assert.equal(prepare(control, "--apply").code, 0, "control run: an uninterrupted prepare --apply should succeed");
  const wanted = snapshot(control.dir);

  const preloadPath = join(ctx.base, "pause-after-status.mjs");
  writeFileSync(preloadPath, PAUSE_AFTER_STATUS);
  const child = spawn(process.execPath, ["--import", pathToFileURL(preloadPath).href, CLI, "prepare", "--dir", ctx.dir, "--apply"], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home } });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });
  child.stdout.resume();

  const statusFile = join(ctx.dir, "docs", "STATUS.md");
  const deadline = Date.now() + 15000;
  while (!existsSync(statusFile)) {
    if (Date.now() > deadline) { child.kill("SIGKILL"); assert.fail(`docs/STATUS.md was never written within 15s; the interrupted-prepare scenario could not be set up (stderr so far: ${stderr})`); }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const interruptedPid = child.pid;
  child.kill("SIGTERM");
  const { code, signal } = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  assert.equal(signal, "SIGTERM", `expected the process to end by the signal sent to it, not exit on its own (code ${code}, stderr: ${stderr})`);

  // The interruption really did what a crash does: the lock is left behind, naming the process that held it, and the
  // run stopped after its first file, before its second (docs/BACKLOG.md, the next role in ROLES).
  const lockPath = join(ctx.dir, ".skilliton", "prepare.lock");
  assert.equal(existsSync(lockPath), true, "a process ended by a signal never reaches the `finally` that removes the lock");
  const lockText = readFileSync(lockPath, "utf8");
  assert.match(lockText, new RegExp(`\\bprocess ${interruptedPid}\\b`), `the lock does not name the interrupted process's id:\n${lockText}`);
  assert.equal(existsSync(join(ctx.dir, "docs", "BACKLOG.md")), false, "a file later in the plan than STATUS.md should not exist yet");

  // The next prepare --apply refuses, naming the lock and the exact recovery: read it for the process id, confirm
  // that process is gone, delete the lock, run again. If this text ever stops naming the process id or the steps,
  // that is a real regression this test is written to catch, not a fixture to relax.
  const beforeRefusal = snapshot(ctx.dir);
  const blocked = prepare(ctx, "--apply");
  assert.equal(blocked.code, 2, blocked.all);
  assert.match(blocked.err, /\.skilliton\/prepare\.lock exists/);
  assert.match(blocked.err, /read \.skilliton\/prepare\.lock for the process id it names/, `the refusal does not point at the lock's own process id:\n${blocked.err}`);
  assert.match(blocked.err, /confirm that process is gone/, `the refusal does not name confirming the process is gone:\n${blocked.err}`);
  assert.match(blocked.err, /delete \.skilliton\/prepare\.lock and run again/, `the refusal does not name deleting the lock and running again:\n${blocked.err}`);
  assert.deepEqual(snapshot(ctx.dir), beforeRefusal, "the refusal itself must write nothing");

  // Follow the steps the refusal names.
  let processGone = false;
  try { process.kill(interruptedPid, 0); } catch (e) { processGone = e.code === "ESRCH"; }
  assert.equal(processGone, true, "the process named in the lock should already be gone; it was ended above and its id is not expected to have been reused this fast");
  rmSync(lockPath);
  const recovered = prepare(ctx, "--apply");
  assert.equal(recovered.code, 0, recovered.all);

  // The result is exactly what an uninterrupted run would have produced: the same paths, the same bytes.
  assert.deepEqual(snapshot(ctx.dir), wanted);
});
