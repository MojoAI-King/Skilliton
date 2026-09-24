// preflight-load.mjs: the limit scripts/preflight.test.mjs gives the runtime probe on this machine now (backlog B83).
//
// The product's own probe (lib/preflight.mjs, probeRuntimeProgram) gives node --version 20 seconds and keeps that
// limit: on a person's machine a program that takes longer is worth naming. On a machine running other suites at the
// same time the same probe failed under a one-minute load of 12 and passed alone, so the test's verdict was about the
// machine and not the product. The rule here follows scripts/guardrails-timing.test.sh: the load is read, a case is
// NOT RUN with the reason when the load is above twice the CPU count, and otherwise the probe gets 20 seconds scaled
// by the load factor (the one-minute load divided by the CPU count, never below 1), capped at 120 seconds. Below twice
// the CPU count the factor is at most 2, so the cap only matters if that threshold is ever raised.
//
// The test cannot hand its limit to the product (preflight has no option for it), so the fixture times the same
// start itself: node --version answering after the product's 20 seconds but within this machine's limit makes the
// cases that need the probe to answer NOT RUN, with the time and the load; answering within 20 seconds, or not
// answering at all within the machine's limit, lets them run and say what they see.
import { spawnSync } from "node:child_process";
import { cpus, loadavg } from "node:os";

export const PRODUCT_PROBE_SECONDS = 20;
export const CAP_SECONDS = 120;
export const OVERLOAD_FACTOR = 2;

// { notRun: reason | null, seconds: the limit or null, text: what was measured }. Windows reports a load of 0
// (Node's documented behaviour), and a machine that names no CPU cannot be divided by, so both keep the product's own
// limit and say the load was not read.
export function loadLimit({ platform = process.platform, load1 = loadavg()[0], cpuCount = cpus().length } = {}) {
  if (platform === "win32" || !(cpuCount > 0) || !Number.isFinite(load1)) {
    return { notRun: null, seconds: PRODUCT_PROBE_SECONDS, text: "load not readable here, so the product's own limit applies" };
  }
  const text = `one-minute load ${load1.toFixed(2)} on ${cpuCount} CPUs`;
  if (load1 > OVERLOAD_FACTOR * cpuCount) return { notRun: `NOT RUN: ${text}, above twice the CPU count`, seconds: null, text };
  const factor = Math.max(1, load1 / cpuCount);
  return { notRun: null, seconds: Math.min(CAP_SECONDS, Math.round(PRODUCT_PROBE_SECONDS * factor)), text };
}

// The skip option for a case whose verdict needs the product's runtime probe to answer: a NOT RUN reason, or false
// to run the case. `program` is the node the fixture puts on PATH.
export function probeSkip({ program = process.execPath, limit = loadLimit() } = {}) {
  if (limit.notRun) return limit.notRun;
  const began = Date.now();
  const r = spawnSync(program, ["--version"], { timeout: limit.seconds * 1000, stdio: "ignore", env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1" } });
  const took = Math.round((Date.now() - began) / 100) / 10;
  if (r.error || r.status !== 0) return false;
  if (took <= PRODUCT_PROBE_SECONDS) return false;
  return `NOT RUN: node --version took ${took} s (${limit.text}), past the product's own ${PRODUCT_PROBE_SECONDS} s probe limit and within this machine's limit of ${limit.seconds} s`;
}
