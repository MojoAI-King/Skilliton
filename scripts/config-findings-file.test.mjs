#!/usr/bin/env node
// config-findings-file.test.mjs: security.findingsFile is checked when the config is read, with the same rule the
// findings writer applies, so a bad value is named before a maintenance run trips on it (B78).
import assert from "node:assert/strict";
import { test } from "node:test";
import { configProblems } from "../packs/base/plugins/workflow/runtime/lib/config.mjs";

const MESSAGE = "security.findingsFile must be a repository-relative .md path";

test("no findingsFile, and a plain repository-relative one, are accepted", () => {
  assert.deepEqual(configProblems({}), []);
  assert.deepEqual(configProblems({ security: { findingsFile: "docs/SECURITY_FINDINGS.md" } }), []);
  assert.deepEqual(configProblems({ security: { findingsFile: "records/security.md" } }), []);
});

test("an absolute path, a path that climbs out, another extension and a non-string are refused, by name only", () => {
  for (const bad of ["/etc/findings.md", "../outside.md", "docs/../../x.md", "docs\\..\\x.md", "docs/findings.txt", 42, null]) {
    const problems = configProblems({ security: { findingsFile: bad } });
    assert.deepEqual(problems, [MESSAGE], `value ${JSON.stringify(bad)}`);
    if (typeof bad === "string") assert.ok(!problems.join("").includes(bad), "the value is never echoed");
  }
});
