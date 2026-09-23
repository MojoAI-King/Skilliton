// resolve-program.test.mjs: resolveProgram is what every start of a bare-named program (git, a delivery-policy
// check, ...) passes to spawn or spawnSync instead of the name itself, so that on Windows a program placed in the
// working folder cannot stand in for the one on PATH (a decoy node.exe, measured in
// evidence/live/windows/2026-09-23-hosted-runner-port.md; backlog B79). The rule is a pure function of the platform
// and a `which` this test injects, so every branch is proved here on every platform the suite runs on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProgram } from "../packs/base/plugins/workflow/runtime/lib/core.mjs";

test("a win32 bare name comes back as the PATH match", () => {
  const which = (name) => (name === "git" ? "C:\\Program Files\\Git\\cmd\\git.exe" : null);
  assert.equal(resolveProgram("git", { platform: "win32", which }), "C:\\Program Files\\Git\\cmd\\git.exe");
});

test("a name with a path separator comes back unchanged, on win32 too", () => {
  const which = () => { throw new Error("which must not be asked about a path"); };
  assert.equal(resolveProgram("C:\\Program Files\\Git\\cmd\\git.exe", { platform: "win32", which }), "C:\\Program Files\\Git\\cmd\\git.exe");
  assert.equal(resolveProgram("./git", { platform: "win32", which }), "./git");
  assert.equal(resolveProgram("bin/git", { platform: "win32", which }), "bin/git");
});

test("every non-Windows platform comes back unchanged, without asking which", () => {
  const which = () => { throw new Error("which must not be asked off Windows"); };
  for (const platform of ["darwin", "linux", "aix", "freebsd"]) {
    assert.equal(resolveProgram("git", { platform, which }), "git");
  }
});

test("a missing program comes back unchanged, so the start fails and is reported exactly as before", () => {
  const which = () => null;
  assert.equal(resolveProgram("git", { platform: "win32", which }), "git");
});

test("behavior off Windows is byte-identical to the platform default: which is never consulted", () => {
  assert.equal(resolveProgram("git", { platform: "darwin" }), "git");
  assert.equal(resolveProgram("git", { platform: "linux" }), "git");
});
