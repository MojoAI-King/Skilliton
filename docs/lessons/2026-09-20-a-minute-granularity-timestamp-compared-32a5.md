# A minute-granularity timestamp compared against file times needs a window as wide as the write

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-minute-granularity-timestamp-compared-32a5
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

CI run 35491126289, on the wave 4 maintenance commit 3896fcb, failed in the step "Tasks, checkpoints, status and lifecycle hooks". Test 30 of `scripts/lifecycle.test.mjs` (line 1336, "checkpoint --handoff on main rewrites RESUME HERE byte for byte, the task Handoff, the tasks index, and reads back as current") asserted `'attention' !== 'ok'` and the run stopped; every later step was skipped, so a green branch went red on a commit that had changed no runtime code.

The message named the product's own behaviour, not the test's:

```
docs/HANDOFF.md was written 2026-09-20 05:14 UTC, which is older than 2 uncommitted
change(s) modified after it (for example docs/STATUS.md, docs/tasks/2026-09-20-resume-on-main-c2c5.md)
```

Both of those files had been written by the same `skilliton checkpoint --handoff --apply` run that wrote the handoff. The command was reporting its own write as work done after itself. The same test passed locally on the same tree, which is what made it look like flake.

## The mechanism

It is not flake. It is a resolution mismatch that only shows when a write straddles a minute boundary.

`docs/HANDOFF.md` carries a `Written:` line printed to the minute (`2026-09-20 05:14 UTC`). `parseWritten` in `packs/base/plugins/workflow/runtime/lib/lifecycle.mjs` returns `end` as the last instant of that minute, which is the most generous reading available: 05:14:59.999. The freshness check then compares that instant against each uncommitted file's `mtimeMs`, which is a millisecond time.

One checkpoint writes three things in order: the handoff, then the task record, then the indexes. When the run begins at 05:14:59.8, the handoff's minute is 05:14 and the task record and `docs/STATUS.md` land at 05:15:00.1. Every later file is then newer than the end of the minute the note names, and the check reports the note as stale against files the same command wrote a fraction of a second later.

So the failure rate is the share of a minute the write occupies. CI is slower than this machine, the write is a few hundred milliseconds, and the run is unlucky perhaps once in a few hundred. That is why it passed locally and had passed in CI until now.

The general shape: **when a coarse timestamp is compared against fine-grained events, the comparison needs a tolerance at least as wide as the operation that produced both.** Reading the coarse value as the end of its interval removes the error inside the interval; it does nothing for an operation that crosses out of it.

## The fix

`packs/base/plugins/workflow/runtime/lib/lifecycle.mjs`, a new exported constant at line 343 and its use at line 484:

```js
export const HANDOFF_WRITE_WINDOW_MS = 5 * 1000;
...
if (st.mtimeMs > parsed.end.getTime() + HANDOFF_WRITE_WINDOW_MS) {
```

Five seconds, not more. The window has to cover one checkpoint's own write, which is under a second; the next real edit in a session is minutes away, not seconds. A window measured in minutes would hide the thing the check exists to catch, which is a handoff written before the work it describes.

A comment at the constant says the same thing, so the next reader does not widen it.

## The rule

1. Before comparing a stored timestamp against a file time, a clock or an event time, ask what granularity each side carries. If they differ, the comparison needs a tolerance, and the tolerance is the width of the write, not a round number picked for comfort.
2. A test that fails in CI and passes locally is a probability, not a verdict. Compute the odds from the mechanism before calling it flake. Here it was the share of a minute a sub-second write occupies, which is small and nonzero, which is exactly what an intermittent failure looks like.
3. A check that can report a command's own write as later work is a product defect. Fix the product, not the test.

## What now enforces it

`scripts/lifecycle.test.mjs` line 1403, "a file the same checkpoint wrote, landing in the next minute, is not newer than the handoff". It runs a real checkpoint, parses the handoff's own `Written:` line, and sets `docs/STATUS.md` to one millisecond past the end of that minute: the check must stay `ok`. It then sets the same file to 30 seconds past and asserts the check goes to `attention` with the "modified after it" summary, so the window cannot be widened without the test noticing. The test reproduced the exact CI assertion before the fix and passes after it.

The rule about granularity is stated in docs/CONTRACTS.md, in the freshness bullet of the handoff section, so a reimplementation of the check inherits it.
