# The autopilot loop

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** In a prepared repository the assistant starts from the handoff, turns a request into a task record, checkpoints as it works, reviews before committing and hands off at the end, with hooks doing the parts that can be enforced and the records written as the work goes rather than in a long ritual at the end.
- **Grade:** B-
- **Graded on:** 2026-09-18
- **Why that grade:** The loop exists end to end and every hook is fixture-tested, but none of it has been seen firing in the owner's own live session on this machine (B5, B34 open), the records it writes are long (RESUME HERE blocks of a screen or more), and the end-of-session maintain costs the owner 5 to 10 reported minutes (B35).
- **What A- means here:** The plugins are installed on the owner's machine and one real session in this repository shows the session start block, the stop hook and the guardrails prompt (evidence files under evidence/live/); a checkpoint regenerates the records as work goes and the end-of-day step is a short reconciliation the owner reports as quicker; the resume block is bounded by a test; the routines (M11) are decided from the hooks reference and at least the compaction snapshot is measured live.
- **Owner inputs this area waits on:** The owner runs join on this machine and works one real session (batch 01). The owner reports the maintain minutes before and after batch 02. A logged-in isolated Codex for batch 05 (B2).
- **Advances:** M2, M8, M11; B5, B21, B34, B35, B2
- **Build progress:** `[########............]` 40 (8 of 20) across 5 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 Install and live use on this machine](batch-01-install-and-live-use.md) | measure | `[###.................]` 17 (1 of 6) |
| [02 Rolling maintenance (B35)](batch-02-rolling-maintenance.md) | build | `[################....]` 80 (4 of 5) |
| [03 Short records](batch-03-short-records.md) | build | `[####################]` 100 (3 of 3) |
| [04 Routines while working (M11, B21)](batch-04-routines.md) | research | `[....................]` 0 (0 of 4) |
| [05 Codex parity (B2)](batch-05-codex-parity.md) | measure | `[....................]` 0 (0 of 2) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
