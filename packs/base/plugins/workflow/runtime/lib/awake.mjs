// awake.mjs: keep a Mac awake while a long check runs, and name a sleep that happened during a failing step anyway.
//
// Measured 2026-09-24: a full check run on an idle Mac on power failed two steps whose tests took 1,039 s and 968 s,
// where each passes in seconds, while the machine went into system sleep twice (pmset -g log:
// "Entering Sleep state due to 'Sleep Service Back to Sleep'" at 19:07 and 19:25, woken at 19:24 and 19:41). The same
// run under caffeinate -ims passed. A check that fails because the machine slept is not a finding about the code, and
// a verdict that does not say so sends a person looking for a bug that is not there.
//
// macOS only, by what was measured: caffeinate and pmset ship with it at these paths. On Linux and Windows nothing is
// held and nothing is read, and the note says so; whether systemd-inhibit or a Windows power request would do the same
// is not verified.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const CAFFEINATE = "/usr/bin/caffeinate";
const PMSET = "/usr/bin/pmset";
const SYSCTL = "/usr/sbin/sysctl";

// Starts caffeinate for this process: -i idle sleep, -m disk sleep, -s system sleep while on power, and -w this pid, so it
// ends by itself if the run dies. Returns { held, note, release }: release() stops it when the run ends, so nothing is
// left running and nothing is let go (the footprint rule); it is safe to call more than once and when nothing is held.
export function holdAwake({ platform = process.platform, pid = process.pid, program = CAFFEINATE } = {}) {
  const none = (note) => ({ held: false, note, release: () => {} });
  if (platform !== "darwin") {
    return none(`nothing holds this machine awake on ${platform} (built and measured on macOS only), `
      + "so a step can fail because the machine slept and this run would not say so");
  }
  if (!existsSync(program)) return none(`${program} is not on this Mac, so nothing holds it awake during the run`);
  let child;
  try {
    child = spawn(program, ["-i", "-m", "-s", "-w", String(pid)], { stdio: "ignore" });
  } catch (e) {
    return none(`caffeinate could not start (${e.message}), so nothing holds this Mac awake during the run`);
  }
  child.on("error", () => {}); // a start that fails later leaves the run as it was; a failing step's sleep line still reads the log
  const release = () => { if (child.exitCode === null && child.signalCode === null) child.kill(); };
  return { held: true, note: "caffeinate holds this Mac awake until the run ends (idle, disk and, on power, system sleep)", release };
}

// The power log's sleep entries between two instants: [{ at, until }] in milliseconds, until being the next wake (null
// when none is logged before the end). Lines look like "2026-09-24 19:07:26 -0400 Sleep   <tab>Entering Sleep state ...".
export function parsePowerLog(text, startMs, endMs) {
  const events = [];
  for (const line of String(text).split("\n")) {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (Sleep|Wake|DarkWake)\s/.exec(line);
    if (!m) continue;
    const at = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
    if (!Number.isNaN(at)) events.push({ at, kind: m[5] });
  }
  events.sort((a, b) => a.at - b.at);
  const sleeps = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== "Sleep") continue;
    const wake = events.slice(i + 1).find((x) => x.kind !== "Sleep") ?? null;
    const until = wake ? wake.at : null;
    if (e.at <= endMs && (until === null || until >= startMs)) sleeps.push({ at: e.at, until });
  }
  return sleeps;
}

// When the kernel last went to sleep (kern.sleeptime), or null when it cannot be read. One sysctl call, about 20 ms,
// where pmset -g log took 9 s on 2026-09-25 (201,439 lines) and so made every failing gate run 9 s slower. The kernel
// stamps a sleep a few seconds after the log's Sleep line (10:01:52.9 against 10:01:50), which only means the log is
// read a little more often, never less.
export function lastSleepMs({ program = SYSCTL } = {}) {
  if (!existsSync(program)) return null;
  const r = spawnSync(program, ["-n", "kern.sleeptime"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
  const m = !r.error && r.status === 0 && /sec = (\d+), usec = (\d+)/.exec(r.stdout);
  return m ? Number(m[1]) * 1000 + Math.floor(Number(m[2]) / 1000) : null;
}

// The sleeps the power log records between two instants, or null when it cannot be read (not macOS, no pmset, a failure).
// A step that began after the kernel's last sleep cannot have slept, so the log is not read for it: an empty list.
export function sleptBetween(startMs, endMs, { platform = process.platform, program = PMSET, lastSleep = lastSleepMs } = {}) {
  if (platform !== "darwin" || !existsSync(program)) return null;
  const last = lastSleep();
  if (last !== null && last < startMs) return [];
  const r = spawnSync(program, ["-g", "log"], { encoding: "utf8", timeout: 30000, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error || r.status !== 0) return null;
  return parsePowerLog(r.stdout, startMs, endMs);
}

// One line for a failing step, or null when no sleep is known: when it slept, for how long, and what that means.
export function sleepLine(sleeps) {
  if (!sleeps || !sleeps.length) return null;
  const clock = (ms) => new Date(ms).toTimeString().slice(0, 5);
  const spans = sleeps.map((s) => (s.until ? `${clock(s.at)} to ${clock(s.until)}` : `from ${clock(s.at)}`)).join(", ");
  return `the machine was asleep during this step (${spans}, from pmset -g log): the failure may be the sleep and not the code; run it again awake`;
}
