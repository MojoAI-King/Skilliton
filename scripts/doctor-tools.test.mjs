// scripts/doctor-tools.test.mjs: what doctor says about the tools the hooks call, and its next step in a repository
// that was never prepared (the 2026-09-23 cold read).
//
// The hooks read their JSON input with the first of jq, node and python3 they find, and node is always there because
// the runtime runs on it, so a machine without jq or python3 is not missing anything required. A repository with no
// .skilliton/config.json gets its harness block from prepare, which also writes the records the block names; doctor
// sending it to harness --apply left a block pointing at records that did not exist.
//
// Run: node --test scripts/doctor-tools.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");

function onPath(name) {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${name} is needed by this test and was not found on PATH`);
  return r.stdout.trim();
}

// A folder holding node and git and nothing else, so jq and python3 are absent on every platform (Linux keeps both in
// /usr/bin, which /bin points at there).
function setup() {
  const base = mkdtempSync(join(tmpdir(), "skilliton-doctor-tools-"));
  const bin = join(base, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));
  symlinkSync(onPath("git"), join(bin, "git"));
  const repo = join(base, "repo");
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const env = { PATH: bin, HOME: join(base, "home"), LANG: "C.UTF-8", GIT_CONFIG_NOSYSTEM: "1" };
  return { base, repo, env };
}

function doctor({ repo, env }) {
  const r = spawnSync(process.execPath, [CLI, "doctor"], { cwd: repo, env, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const line = (out, label) => out.split("\n").find((l) => new RegExp(`^\\S+\\s+${label}: `).test(l)) ?? "";

test("a machine with node and without jq or python3 is not told to install either", { skip: process.platform === "win32" }, () => {
  const ctx = setup();
  try {
    const { out } = doctor(ctx);
    assert.match(line(out, "python3"), /^OK\s+python3: not installed, and not needed: .* use node$/);
    assert.match(line(out, "jq"), /^WARN\s+jq: not installed; .* use node, and .*statusline-quota\.sh.* call jq directly/);
    assert.doesNotMatch(line(out, "jq"), /\[required\]/);
    assert.doesNotMatch(out, /Next: .*install (jq|python3)/);
  } finally {
    rmSync(ctx.base, { recursive: true, force: true });
  }
});

test("a repository that was never prepared is sent to prepare --apply, not harness --apply", { skip: process.platform === "win32" }, () => {
  const ctx = setup();
  try {
    const { status, out } = doctor(ctx);
    assert.equal(status, 1);
    assert.match(out, /Next: .*prepare the project, which writes the harness block and its records: .* prepare --apply/);
    assert.doesNotMatch(out, /harness --apply/);
  } finally {
    rmSync(ctx.base, { recursive: true, force: true });
  }
});
