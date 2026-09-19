# Clean code and an organized repository

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** A lint and format step runs in CI, no runtime file exceeds a stated size, and a cleanup pack exists with evidence it helps.
- **Grade:** C
- **Graded on:** 2026-09-18
- **Why that grade:** There is no lint or format step; lib/core.mjs carries several commands that could be their own files; the code-quality pack (B17) is an idea with no eval; no dead code scan exists. The offline suite is strong but tests behavior, not shape.
- **What A- means here:** A lint step in CI with a decision on how it is installed; runtime files under a stated ceiling held by a test; a dead code and duplicate scan with its findings fixed or recorded; the cleanup pack shipped only with eval evidence.
- **Owner inputs this area waits on:** The owner's ceiling for paid evals (batch 03).
- **Advances:** M2; B17
- **Build progress:** `[....................]` 0 (0 of 10) across 4 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 Lint and format in CI](batch-01-lint-in-ci.md) | research | `[....................]` 0 (0 of 3) |
| [02 Split core.mjs and size ceilings](batch-02-split-core-and-ceilings.md) | build | `[....................]` 0 (0 of 3) |
| [03 Code-quality pack (B17)](batch-03-code-quality-pack.md) | build | `[....................]` 0 (0 of 2) |
| [04 Dead code and duplicate scan](batch-04-dead-code-scan.md) | build | `[....................]` 0 (0 of 2) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
