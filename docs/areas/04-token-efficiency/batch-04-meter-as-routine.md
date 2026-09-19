# The meter as a routine

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** build
- **Goal:** skilliton usage wraps the meter and reports per merged batch; a before-and-after exists before any savings sentence.
- **Depends on:** 04-01
- **Advances:** B9; M14
- **Estimated sessions:** 2

## Acceptance

- [x] the meter reproduces the known window on the machine that holds the transcripts (evidence: node scripts/token-cost.test.mjs --reference, PASS on 2026-09-18)
- [ ] skilliton usage wraps scripts/token-cost.mjs with the scorecard per merged batch, with a test
- [ ] docs/USAGE_BASELINE.md holds the window the owner chose (owner decision), or says it is still a placeholder
- [ ] one before-and-after for one merged batch, dollars as reconstruction only, cross-checked against the usage screen before any sentence about savings

## Notes

PLAN.md sections 6 and 8 govern every number that leaves this repository.
