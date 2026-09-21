# The meter as a routine

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** build
- **Goal:** skilliton usage wraps the meter and reports per merged batch; a before-and-after exists before any savings sentence.
- **Depends on:** 04-01
- **Advances:** B9; M14
- **Estimated sessions:** 2

## Acceptance

- [x] the meter reproduces the known window on the machine that holds the transcripts (evidence: node scripts/token-cost.test.mjs --reference, PASS on 2026-09-18)
- [x] skilliton usage wraps scripts/token-cost.mjs with the scorecard per merged batch, with a test (evidence: runtime/lib/usage.mjs and runtime/commands/usage.mjs, workflow 0.14.0; node scripts/usage.test.mjs exit 0, 19 checks over the window boundaries, the meter's own test run first in the same run, a timezone disagreement failing rather than reporting a wrong window, and no output line carrying a percentage or a savings claim; run against the real meter, skilliton usage --limit 3 exit 0)
- [x] docs/USAGE_BASELINE.md holds the window the owner chose (owner decision), or says it is still a placeholder (evidence: docs/USAGE_BASELINE.md, second paragraph in bold: the Window row is a placeholder and every row under it is empty for that reason, to be read as not measured and never as zero; step 6 names skilliton usage and its two limits)
- [ ] one before-and-after for one merged batch, dollars as reconstruction only, cross-checked against the usage screen before any sentence about savings

## Notes

PLAN.md sections 6 and 8 govern every number that leaves this repository.

Item 2 ticks on the second branch the item itself offers. Choosing the window writes this machine's per-day reconstructed cost into a public repository, which is the owner's call, so the placeholder is stated as one.

An honest limit of the design, measured on 2026-09-20: a window is whole days because the meter buckets by day, and every one of this repository's 13 merges landed on 2026-09-16, so `skilliton usage` produces exactly **one row** here. A row per merge would have asked the meter for the same day twice and doubled the totals.

Item 4 stays open and is owner-gated: a before-and-after needs the usage screen to cross-check against, and no dollar or percentage sentence may leave this repository until it has one.
