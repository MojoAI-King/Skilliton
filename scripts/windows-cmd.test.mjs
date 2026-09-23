// windows-cmd.test.mjs: runProgram starts a .cmd or .bat file through cmd.exe on Windows only, and only when nothing in
// the line is a character cmd.exe would read. The rule is a pure function, so it is tested here on every platform.
import { test } from "node:test";
import assert from "node:assert/strict";
import { windowsCmdLine } from "../packs/base/plugins/workflow/runtime/lib/core.mjs";

test("a .cmd launcher on Windows goes through cmd.exe with the path quoted", () => {
  assert.deepEqual(windowsCmdLine("C:\\npm\\prefix\\claude.CMD", ["--version"], "win32", "C:\\Windows\\system32\\cmd.exe"),
    ["C:\\Windows\\system32\\cmd.exe", ["/d", "/s", "/c", '""C:\\npm\\prefix\\claude.CMD" --version"']]);
  assert.deepEqual(windowsCmdLine("C:\\Program Files\\x\\tool.bat", [], "win32", undefined), ["cmd.exe", ["/d", "/s", "/c", '""C:\\Program Files\\x\\tool.bat""']]);
});

test("anything else is started as before", () => {
  assert.equal(windowsCmdLine("/usr/local/bin/claude", ["--version"], "darwin"), null);
  assert.equal(windowsCmdLine("C:\\npm\\claude.cmd", ["--version"], "linux"), null);
  assert.equal(windowsCmdLine("C:\\bin\\node.exe", ["--version"], "win32"), null);
});

test("a character cmd.exe would read keeps the program out of cmd.exe", () => {
  for (const bad of ["a&b", "a|b", "a>b", "a<b", "a^b", "%PATH%", "a\"b", "a b", "!x!"]) {
    assert.equal(windowsCmdLine("C:\\npm\\claude.cmd", [bad], "win32"), null, bad);
  }
  assert.equal(windowsCmdLine("C:\\npm\\a&b\\claude.cmd", ["--version"], "win32"), null);
});
