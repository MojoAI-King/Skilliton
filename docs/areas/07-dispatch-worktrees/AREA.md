# Dispatch into worktrees

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** One command turns notes into lanes, creates the worktrees, launches bounded agents, and merges their records back, measured on one real dispatch with peak context per lane under the window.
- **Grade:** C+
- **Graded on:** 2026-09-18
- **Why that grade:** The dispatch skill and the config's dispatch section exist and are rehearsed, but there is no command that creates the worktrees, no bound on the lane agents, no merge-back of lane records, and no measured real dispatch.
- **What A- means here:** skilliton dispatch creates lanes and worktrees previewably; lane agents launch with a shipped definition and a window; a guardrails rule refuses writes to main-only paths in lanes; skilliton dispatch merge integrates the records; one real dispatch measured under the window.
- **Owner inputs this area waits on:** None beyond area 04 batch 01's decision.
- **Advances:** M11; B21, B36
- **Build progress:** `[####################]` 100 (12 of 12) across 4 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 The dispatch command](batch-01-dispatch-command.md) | build | `[####################]` 100 (4 of 4) |
| [02 Lane agents with a bound](batch-02-lane-agents-bounded.md) | build | `[####################]` 100 (3 of 3) |
| [03 Merge-back and main-only paths](batch-03-merge-back.md) | build | `[####################]` 100 (3 of 3) |
| [04 Dispatch suggestion (M11)](batch-04-dispatch-suggestion.md) | build | `[####################]` 100 (2 of 2) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
