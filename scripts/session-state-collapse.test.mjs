#!/usr/bin/env node
// session-state-collapse.test.mjs: N61. Session start's "Project state" block used to print layout, migrations,
// versions and records as their own line even when each said only "ok, nothing to act on", so a clean, current
// project paid for four lines nobody needed to read. Now those four collapse into one "- Checks: <names> ok" line
// naming only the ones that are ok; any of the four that needs attention (or is not-run, or failed) keeps its own
// line, worded exactly as before, in its usual place. tasks, sessions, handoff and security are never collapsed:
// each carries a summary worth reading even when it is ok (packs/base/plugins/workflow/runtime/lib/session-hooks.mjs
// sessionStartBlock, BLOCK_ORDER and COLLAPSIBLE).
//
//   node --test scripts/session-state-collapse.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { sessionStartBlock } from "../packs/base/plugins/workflow/runtime/lib/session-hooks.mjs";

// A minimal report: only what sessionStartBlock reads (report.git, report.configProblem, report.checks, report.data,
// report.current). `overrides` replaces individual check entries by name; any name left out of `statuses` is left off
// the checks array entirely, which sessionStartBlock already treats as "nothing to say" (the `if (!check) continue`
// guard it has for every other check it might not have been given).
function report(statuses, { current = null, data = {} } = {}) {
  const checks = Object.entries(statuses).map(([name, status]) => ({ name, status, summary: `${name} summary (${status})` }));
  return {
    root: "/repo", generatedAt: new Date().toISOString(), configProblem: null,
    git: { branch: "main", head: "aaaaaaaaaaaa", shortHead: "aaaaaaa", dirty: 0 },
    checks, data, current,
  };
}

const run = (statuses, opts) => sessionStartBlock(report(statuses, opts), { maxBytes: 100000 }).text.split("\n").filter(Boolean);

test("all four collapsible checks ok: one combined line, in layout/migrations/versions/records order, no individual lines", () => {
  const lines = run({ tasks: "ok", layout: "ok", migrations: "ok", versions: "ok", records: "ok" });
  assert.ok(lines.includes("- Checks: layout, migrations, versions, records ok"), lines.join("\n"));
  for (const word of ["Layout summary", "Pending migrations summary", "Versions summary", "Records summary"]) {
    assert.ok(!lines.some((l) => l.includes(word)), `an ok check's own summary must not appear: ${word}\n${lines.join("\n")}`);
  }
});

test("a mix: the ok ones collapse, the one needing attention keeps its own line and wording, unchanged", () => {
  const lines = run({ tasks: "ok", layout: "ok", migrations: "attention", versions: "ok", records: "ok" });
  assert.ok(lines.some((l) => l === "- Pending migrations (needs attention): migrations summary (attention)"), lines.join("\n"));
  assert.ok(lines.includes("- Checks: layout, versions, records ok"), lines.join("\n"));
  assert.ok(!lines.some((l) => l.startsWith("- Layout:") || l.startsWith("- Versions:") || l.startsWith("- Records:")), lines.join("\n"));
});

test("none of the four is ok: no combined line at all, each keeps its own", () => {
  const lines = run({ tasks: "ok", layout: "attention", migrations: "not-run", versions: "failed", records: "attention" });
  assert.ok(!lines.some((l) => l.startsWith("- Checks:")), lines.join("\n"));
  assert.ok(lines.some((l) => l === "- Layout (needs attention): layout summary (attention)"), lines.join("\n"));
  assert.ok(lines.some((l) => l === "- Pending migrations (not run): migrations summary (not-run)"), lines.join("\n"));
  assert.ok(lines.some((l) => l === "- Versions (failed): versions summary (failed)"), lines.join("\n"));
  assert.ok(lines.some((l) => l === "- Records (needs attention): records summary (attention)"), lines.join("\n"));
});

test("a project missing one of the four (never run, or the build lacks it) is not counted as ok or as attention: it is simply absent, and the combined line names only the ones actually seen", () => {
  const lines = run({ tasks: "ok", layout: "ok", versions: "ok", records: "ok" }); // no "migrations" entry at all
  assert.ok(lines.includes("- Checks: layout, versions, records ok"), lines.join("\n"));
  assert.ok(!lines.some((l) => l.toLowerCase().includes("migration")), lines.join("\n"));
});

test("tasks, sessions, handoff and security are never folded into the combined line, ok or not", () => {
  const lines = run({
    tasks: "ok", sessions: "ok", handoff: "ok", security: "ok",
    layout: "ok", migrations: "ok", versions: "ok", records: "ok",
  }, { current: null });
  assert.ok(lines.includes("- Checks: layout, migrations, versions, records ok"), lines.join("\n"));
  assert.ok(lines.some((l) => l.startsWith("- Current task: tasks summary")), lines.join("\n"));
  assert.ok(lines.some((l) => l.startsWith("- Previous session: sessions summary")), lines.join("\n"));
  assert.ok(lines.some((l) => l.startsWith("- Shared handoff: handoff summary")), lines.join("\n"));
  assert.ok(lines.some((l) => l.startsWith("- Security: security summary")), lines.join("\n"));
});

test("the not-prepared offer still follows layout's own line when layout needs attention with no version, exactly as before the collapse", () => {
  const lines = run(
    { tasks: "ok", layout: "attention", migrations: "ok", versions: "ok", records: "ok" },
    { data: { layout: { version: null, removed: false } } },
  );
  const i = lines.findIndex((l) => l.startsWith("- Layout (needs attention):"));
  assert.ok(i >= 0, lines.join("\n"));
  assert.ok(lines[i + 1].startsWith("- Not prepared (needs attention): offer it in plain words"), lines.join("\n"));
  assert.ok(lines.includes("- Checks: migrations, versions, records ok"), lines.join("\n"));
});

test("this test file holds no forbidden dash characters", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(text.includes(String.fromCharCode(0x2014)) || text.includes(String.fromCharCode(0x2013)), false);
});
