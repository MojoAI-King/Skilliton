# Auto-harness on arrival

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** A developer opens any repository in a supported client on an enrolled machine and, with one yes, the repository is prepared, a delivery policy is drafted from what the repository shows, and the first task record exists.
- **Grade:** D+
- **Graded on:** 2026-09-18
- **Why that grade:** The first M8 increment only offers preparation at session start; it does not apply it, draft a policy or start a task, and it has not been seen live (B13). Enrollment is rehearsed on Linux only (M12); the skilliton command was not on the shell path in this session, so even a prepared repository needs a person to find the runtime.
- **What A- means here:** One yes at session start prepares the repository, drafts the delivery policy from the detected test command for a person to confirm, and opens the first task; rehearsed on three repository kinds and seen live once; the command is on the path in every supported client's terminal; enrollment rehearsed on macOS as it is on Linux.
- **Owner inputs this area waits on:** One live unprepared repository session (owner). A macOS VM or second Mac for batch 03.
- **Advances:** M7, M8, M12; B13, B22
- **Build progress:** `[#################...]` 87 (13 of 15) across 4 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 M8 second increment (B13)](batch-01-m8-second-increment.md) | build | `[####################]` 100 (5 of 5) |
| [02 The command on the path everywhere](batch-02-path-everywhere.md) | build | `[####################]` 100 (4 of 4) |
| [03 Enrollment on macOS (M12, B22)](batch-03-macos-enrollment.md) | build | `[#######.............]` 33 (1 of 3) |
| [04 Stack detection for the project config](batch-04-stack-detection.md) | build | `[####################]` 100 (3 of 3) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
