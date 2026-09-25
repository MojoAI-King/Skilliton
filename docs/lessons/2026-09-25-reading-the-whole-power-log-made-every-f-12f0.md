# Reading the whole power log made every failing gate run on a Mac 9 seconds slower

Kind: Living. Lesson entry.

- **ID:** 2026-09-25-reading-the-whole-power-log-made-every-f-12f0
- **Status:** accepted
- **Date:** 2026-09-25

## What broke

The full check list on the first 1.5.0 release commit failed one step of 123: `scripts/gate.test.mjs`, two of 19 tests, "stopped by the timeout, not by the sleep ending" and "stopped by the policy's one second, not the gate's sixty". Both assert that a gate run with a one-second timeout ends in under 15 s. The compliance batch had seen the same two fail and recorded it as "gate timing under load"; a rerun passed then. Here a rerun at a 1-minute load of 4.4 failed the same two again, with every test in the suite taking about 15 s, which load alone does not explain.

## The mechanism

B91 (workflow 0.25.2) made a failing gate run read `pmset -g log` to say whether the machine slept during the failing step. On this Mac on 2026-09-25 that command printed 201,439 lines and took 9 s, and it runs once per failing gate run, so every failing run paid 9 s, more under load. A timeout test is a failing run: node's start, the one-second timeout and the 9 s read put it at about 15 s, over the bound. The log grows until the system rotates it, which is why the same tests passed at 1.4.3 and fail now: the cost depends on the log's size on the day, not on the code under test.

## The fix

`runtime/lib/awake.mjs`: `lastSleepMs()` reads `sysctl -n kern.sleeptime`, the time the kernel last went to sleep, in about 20 ms, and `sleptBetween()` returns an empty list without reading the power log when that sleep began before the failing step did, since a step cannot have slept after the last sleep. Measured on this Mac: the kernel's time was 10:01:52.9 against the log's last Sleep line at 10:01:50, so it is a few seconds late, which only means the log is read a little more often, never less. `sysctl` joins the allow list tables (`scripts/allowlist-tables.mjs`, docs/IT-ALLOWLIST.md section 1, `lib/preflight-programs.mjs`) and the footprint check's system paths (`scripts/footprint.test.mjs` SYSTEM_PATHS). The last was missed: the fix was pushed after eight chosen checks instead of the full list, and CI's footprint step failed on it (run 36178260049), which is lesson 2026-09-25-a-lane-s-own-suites-are-not-the-merge-ga-2e32 again, in the main window. After the fix: `scripts/gate.test.mjs` 19 of 19 in 14.8 s where it had taken 132 s, the timeout test 1.2 s where it had taken 15.8 s, a plain failing gate run 0.18 s where it had taken 21 s.

## The rule

A diagnostic that runs on every failure is on the failure path of every user, so its cost is measured on a real machine before it ships, and it reads the cheapest source that can answer first. A timing test that fails once is not "load" until the load is measured and shown to account for the time; here it did not.

## What now enforces it

`scripts/awake.test.mjs`, "the power log is read only when the kernel's last sleep began after the step did": a last sleep before the step returns an empty list without running the log reader, one during the step or an unreadable kernel time reads it, and `kern.sleeptime`'s seconds and microseconds parse to milliseconds. It fails against the code before the fix. The two timeout tests in `scripts/gate.test.mjs` keep their 15 s bound.
