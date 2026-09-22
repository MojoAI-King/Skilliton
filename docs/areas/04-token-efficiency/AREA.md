# Token efficiency that improves the work

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** Context is bounded in every session including subagents, the read guard and the gate are used in real sessions, and one merged batch shows the meter's counters moving in the intended direction, with the owner's usage screen as the cross-check.
- **Grade:** C-
- **Graded on:** 2026-09-18
- **Why that grade:** The pieces shipped on 2026-09-18 (read guard, gate, session cost rules, the meter reconciled) but none has been measured in a real session, the global compaction window on this machine reads 1000000 while the template says 200000, and the measured cost drivers (subagent peak context 335K to 560K, median session context 244K) are untouched by any of it.
- **What A- means here:** The window is set from measurement in the team settings and in agent definitions; the guard and gate are seen in live sessions; subagent peak context in one real dispatch stays under the window; a before-and-after for one merged batch exists from the meter, cross-checked against the usage screen, with no savings sentence until then.
- **Owner inputs this area waits on:** The owner's usage screen for the cross-check. The owner's decision on the baseline window (docs/USAGE_BASELINE.md).
- **Advances:** M2, M11; B9, B34, B36
- **Build progress:** `[#################...]` 84 (16 of 19) across 5 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 Bound context (B36)](batch-01-bound-context.md) | research | `[################....]` 80 (4 of 5) |
| [02 Guard and gate in real sessions (B34)](batch-02-guard-and-gate-live.md) | measure | `[####################]` 100 (4 of 4) |
| [03 Subagent hygiene](batch-03-subagent-hygiene.md) | build | `[#############.......]` 67 (2 of 3) |
| [04 The meter as a routine](batch-04-meter-as-routine.md) | build | `[###############.....]` 75 (3 of 4) |
| [05 Output caps in the team settings](batch-05-output-caps.md) | build | `[####################]` 100 (3 of 3) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
