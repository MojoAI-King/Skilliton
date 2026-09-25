#!/usr/bin/env node
// awake.test.mjs: a long check run holds a Mac awake, and a failing step that spans a sleep says so (B91).
//
// Measured 2026-09-24: the full run on a release commit failed two steps whose tests took 1,039 s and 968 s, where each
// passes in seconds, while the Mac went into system sleep twice; the same run under caffeinate passed.
// runtime/lib/awake.mjs starts caffeinate for the life of the run on macOS and reads the power log on a failing step.
// The sleep itself cannot be staged in a test, so the power log is a fixture here: the parser reads the real line
// format, and the gate is given a reader that returns a sleep inside the failing run's window.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, "..", "packs", "base", "plugins", "workflow", "runtime", "lib");
const { holdAwake, lastSleepMs, parsePowerLog, sleepLine, sleptBetween } = await import(join(lib, "awake.mjs"));
const { planGate, runGate } = await import(join(lib, "gate.mjs"));

// Lines in the format pmset -g log prints, around one sleep from 19:07:26 to 19:24:47 at -0400.
const LOG = [
  "2026-09-24 18:50:06 -0400 Wake Requests       \t[*process=dasd request=SleepService deltaSecs=975]",
  "2026-09-24 19:06:22 -0400 DarkWake            \tDarkWake from Deep Idle [CDNPB] : due to rtc/SleepService",
  "2026-09-24 19:07:26 -0400 Sleep               \tEntering Sleep state due to 'Sleep Service Back to Sleep'",
  "2026-09-24 19:07:28 -0400 Assertions          \tPID 351(powerd) TimedOut InternalPreventSleep 00:00:44 [System: SRPrevSleep]",
  "2026-09-24 19:24:47 -0400 DarkWake            \tDarkWake from Deep Idle [CDNPB] : due to rtc/SleepService",
  "2026-09-24 19:25:32 -0400 Sleep               \tEntering Sleep state due to 'Sleep Service Back to Sleep'",
].join("\n");
const at = (clock) => Date.parse(`2026-09-24T${clock}-04:00`);

test("the power log parser finds the sleeps inside a window, with their wakes, and ignores the other lines", () => {
  assert.deepEqual(parsePowerLog(LOG, at("19:00:00"), at("19:20:00")), [{ at: at("19:07:26"), until: at("19:24:47") }]);
  assert.deepEqual(parsePowerLog(LOG, at("19:20:00"), at("19:30:00")), [
    { at: at("19:07:26"), until: at("19:24:47") }, // asleep when the window opened
    { at: at("19:25:32"), until: null }, // no wake logged yet
  ]);
  assert.deepEqual(parsePowerLog(LOG, at("18:00:00"), at("19:00:00")), [], "an Assertions line naming SRPrevSleep is not a sleep");
  assert.equal(sleepLine([]), null);
  assert.equal(sleepLine(null), null);
  assert.match(sleepLine(parsePowerLog(LOG, at("19:00:00"), at("19:20:00"))), /asleep during this step \(\d\d:\d\d to \d\d:\d\d, from pmset -g log\).*run it again awake/);
});

test("off macOS nothing is held or read, and the note says so", () => {
  const off = holdAwake({ platform: "linux" });
  assert.equal(off.held, false);
  assert.match(off.note, /nothing holds this machine awake on linux/);
  assert.equal(sleptBetween(0, 1, { platform: "linux" }), null);
  const missing = holdAwake({ platform: "darwin", program: "/nonexistent/caffeinate" });
  assert.equal(missing.held, false);
  assert.match(missing.note, /is not on this Mac/);
});

test("the power log is read only when the kernel's last sleep began after the step did (9 s saved per failing run)", () => {
  // The program given as pmset is node, which refuses -g: reading it gives null, so null proves the log was read and []
  // proves it was not.
  const read = (last) => sleptBetween(1000, 2000, { platform: "darwin", program: process.execPath, lastSleep: () => last });
  assert.deepEqual(read(999), [], "the last sleep began before the step: nothing to read");
  assert.equal(read(1500), null, "the last sleep began during the step: the log is read");
  assert.equal(read(null), null, "the kernel's time cannot be read: the log is read, as before");
  const dir = mkdtempSync(join(tmpdir(), "skilliton-sysctl-"));
  try {
    const stub = join(dir, "sysctl");
    writeFileSync(stub, "#!/bin/sh\necho '{ sec = 1790344912, usec = 891615 } Fri Sep 25 10:01:52 2026'\n");
    chmodSync(stub, 0o755);
    assert.equal(lastSleepMs({ program: stub }), 1790344912891, "kern.sleeptime's seconds and microseconds, as milliseconds");
    assert.equal(lastSleepMs({ program: join(dir, "missing") }), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  if (process.platform === "darwin") {
    const last = lastSleepMs();
    assert.ok(last === null || last <= Date.now(), "on this Mac the kernel's last sleep is a time in the past");
  }
});

test("on macOS caffeinate holds the machine for the process it names and ends with it", { skip: process.platform !== "darwin" && "macOS only" }, async () => {
  const target = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "ignore" });
  try {
    const r = holdAwake({ pid: target.pid });
    assert.equal(r.held, true, r.note);
    const running = () => spawnSync("pgrep", ["-f", `caffeinate -i -m -s -w ${target.pid}`], { encoding: "utf8" }).stdout.trim();
    assert.notEqual(running(), "", "caffeinate is running for that pid");
    assert.match(execFileSync("pmset", ["-g", "assertions"], { encoding: "utf8" }), /caffeinate/, "the power manager lists its assertion");
    target.kill();
    await new Promise((resolve) => target.on("exit", resolve));
    for (let i = 0; i < 50 && running(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(running(), "", "caffeinate exits when the process it waits for does");
  } finally {
    target.kill();
  }
});

test("on macOS release() stops caffeinate while the run's process is still alive, so nothing is left running", { skip: process.platform !== "darwin" && "macOS only" }, async () => {
  const target = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "ignore" });
  try {
    const r = holdAwake({ pid: target.pid });
    const running = () => spawnSync("pgrep", ["-f", `caffeinate -i -m -s -w ${target.pid}`], { encoding: "utf8" }).stdout.trim();
    assert.notEqual(running(), "");
    r.release();
    r.release(); // a second call is harmless
    for (let i = 0; i < 50 && running(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(running(), "", "released while the process it waits for still runs");
    assert.equal(target.exitCode, null, "the run's own process was not touched");
  } finally {
    target.kill();
  }
});

test("a failing gate run that spans a sleep says so in the verdict data and the log; a passing one reads no power log", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gate-awake-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  const gitDir = join(root, ".git");
  const asked = [];
  const powerLog = (start, end) => { asked.push([start, end]); return [{ at: start, until: end }]; };
  const fail = await runGate(planGate(root, { cmd: `"${process.execPath}" -e "process.exit(3)"` }), { root, gitDir, label: "t", tailLines: 5, signals: false, powerLog });
  assert.equal(fail.results[0].ok, false);
  assert.equal(asked.length, 1);
  assert.ok(asked[0][0] <= asked[0][1], "the window is the failing run's own start and end");
  assert.equal(fail.slept.length, 1);
  assert.match(sleepLine(fail.slept), /asleep during this step/);
  const pass = await runGate(planGate(root, { cmd: `"${process.execPath}" -e "0"` }), { root, gitDir, label: "t", tailLines: 5, signals: false, powerLog });
  assert.equal(pass.results[0].ok, true);
  assert.equal(pass.slept, null);
  assert.equal(asked.length, 1, "no power log is read for a passing run");
});

test("the check runner says whether it holds the machine awake", () => {
  const logs = realpathSync(mkdtempSync(join(tmpdir(), "checks-awake-")));
  try {
    const r = spawnSync(process.execPath, [join(here, "checks.mjs"), "--only", "Names check can fail"], {
      encoding: "utf8", env: { ...process.env, SKILLITON_CHECKS_LOG_DIR: logs },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^checks: kept awake: (caffeinate holds this Mac awake|nothing holds this machine awake on )/m);
  } finally {
    rmSync(logs, { recursive: true, force: true });
  }
});
