#!/usr/bin/env node
// check-tail.test.mjs: the delivery gate's rejection keeps the failing test names of a node --test run
// (packs/base/plugins/workflow/runtime/lib/check-tail.mjs, used by lib/delivery.mjs runCheck).
//
// The gate printed the last lines of a failing check. For node --test that is the end of the last stack trace, and a
// newcomer saw the "failing tests:" header with nothing after it. Now, when the header appears, the tail starts at it
// and keeps the lines that name each failing test ahead of the rest; without it, the tail is the last lines as before.
// One case runs a real node --test on a failing fixture, so the format under test is the one this node prints.
//
//   node --test scripts/check-tail.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { tailCollector } = await import(pathToFileURL(join(here, "..", "packs", "base", "plugins", "workflow", "runtime", "lib", "check-tail.mjs")).href);
const X = "\u2716";

const collect = (lines, max = 20) => {
  const c = tailCollector(max);
  for (const line of lines) c.keep(line);
  return c.lines();
};

// The shape of node's spec reporter at the end of a failing run: the summary, the header, then each failure again.
function specOutput(failures, stackLines = 15) {
  const out = [`${X} one (1ms)`, "\u2139 tests 4", "\u2139 pass 1", `\u2139 fail ${failures}`, `${X} failing tests:`, ""];
  for (let f = 1; f <= failures; f++) {
    out.push(`test at scripts/x.test.mjs:${f * 10}:1`, `${X} failure number ${f} (2ms)`, "  AssertionError [ERR_ASSERTION]: boom");
    for (let s = 0; s < stackLines; s++) out.push(`      at frame ${s} (file:///x.mjs:${s}:1)`);
    out.push("");
  }
  return out;
}

test("with a failing tests header, the tail starts at it and names every failing test", () => {
  const tail = collect(specOutput(3));
  assert.ok(tail.length <= 20, `${tail.length} lines kept`);
  assert.equal(tail[0], `${X} failing tests:`, "the cut falls before the header, never after it");
  for (let f = 1; f <= 3; f++) {
    assert.ok(tail.includes(`test at scripts/x.test.mjs:${f * 10}:1`), `failure ${f}'s location is kept`);
    assert.ok(tail.includes(`${X} failure number ${f} (2ms)`), `failure ${f}'s name is kept`);
  }
  assert.ok(tail.includes("  AssertionError [ERR_ASSERTION]: boom"), "the first detail lines fill what room is left");
  const order = tail.map((l) => /number (\d)/.exec(l)?.[1]).filter(Boolean);
  assert.deepEqual(order, ["1", "2", "3"], "lines stay in the order the check printed them");
});

test("more failing tests than fit: the header and the first names that fit, nothing else", () => {
  const tail = collect(specOutput(30), 20);
  assert.equal(tail.length, 20);
  assert.equal(tail[0], `${X} failing tests:`);
  assert.ok(tail.slice(1).every((l) => /^(test at |\u2716 )/.test(l)), tail.join("\n"));
});

test("without the header, the tail is the last lines, as before", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
  assert.deepEqual(collect(lines), lines.slice(-20));
  assert.deepEqual(collect(["only", "two"]), ["only", "two"]);
});

test("a header with nothing after it is kept as it is", () => {
  assert.deepEqual(collect(["a", "b", `${X} failing tests:`]), [`${X} failing tests:`]);
});

test("the output of a real failing node --test run keeps its failing test names", () => {
  const dir = mkdtempSync(join(tmpdir(), "skilliton-check-tail-"));
  try {
    const file = join(dir, "fails.test.mjs");
    const body = ["import { test } from \"node:test\";", "import assert from \"node:assert/strict\";"];
    for (let i = 1; i <= 4; i++) body.push(`test("fixture failure ${i}", () => { assert.equal(${i}, 0); });`);
    writeFileSync(file, `${body.join("\n")}\n`);
    // NODE_TEST_CONTEXT would make the child report to this runner instead of printing its own summary.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ["--test", "--test-reporter=spec", file], { cwd: dir, env, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    const lines = `${r.stdout}${r.stderr}`.replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).filter(Boolean);
    assert.ok(lines.some((l) => /failing tests:$/.test(l)), "this node prints the header; if it stops, this test says so");
    const tail = collect(lines);
    assert.match(tail[0], /failing tests:$/);
    for (let i = 1; i <= 4; i++) assert.ok(tail.some((l) => l.includes(`fixture failure ${i}`)), `failure ${i} is named in:\n${tail.join("\n")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
