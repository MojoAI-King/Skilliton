# Security and shared delivery

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** The hosted delivery gate is rehearsed on a real GitHub repository with branch protection, and the offline audit runs itself in the routine, pre-push and merge gate.
- **Grade:** B
- **Graded on:** 2026-09-18
- **Why that grade:** The delivery policy, the combined-result gate and the evidence collectors are built and tested offline, but the GitHub adapter has not run on a hosted repository (B4), the audit does not run itself (M10, B20), and endpoint security has no product to test under (B29).
- **What A- means here:** One hosted rehearsal with branch protection where a defective combined change is blocked; the audit running in a routine, a pre-push hook and the merge gate; B29 recorded as blocked with what unblocks it.
- **Owner inputs this area waits on:** Owner approval for a throwaway hosted repository (B4). A product to test endpoint security under (B29).
- **Advances:** M4, M10, M12; B4, B20, B29
- **Build progress:** `[###############.....]` 75 (6 of 8) across 3 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 Hosted GitHub adapter (B4)](batch-01-hosted-github-adapter.md) | owner | `[####################]` 100 (3 of 3) |
| [02 Self-running audit (M10, B20)](batch-02-self-running-audit.md) | build | `[####################]` 100 (3 of 3) |
| [03 Endpoint security (B29)](batch-03-endpoint-security.md) | blocked | `[....................]` 0 (0 of 2) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
