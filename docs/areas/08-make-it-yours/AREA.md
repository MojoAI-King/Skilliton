# Make it yours

Kind: Living. Area record. One of the ten areas in docs/REPORT_CARD.md; the batches in this folder take it to at least A-.

- **Intent:** A fork releases a signed version, a machine installs it from GitHub pinned to the tag, and a private company repository works with real credentials.
- **Grade:** B+
- **Graded on:** 2026-09-18
- **Why that grade:** The fork, rename, release and verify are rehearsed offline and pass in the suite, but no signed release exists (B6), no private repository has been tried (B31), and installs follow the marketplace branch rather than a tag (B18).
- **What A- means here:** One signed release verified from the GitHub source; one private repository install, update and verify with real credentials on a throwaway; installs pinned to signed tags.
- **Owner inputs this area waits on:** The owner's signing key and version choice (B6). Owner approval for a throwaway private repository (B31).
- **Advances:** M3, M6, M12; B6, B18, B31
- **Build progress:** `[#########...........]` 43 (3 of 7) across 3 batch(es), by `node scripts/report-card.mjs --apply`

## Batches

<!-- report-card:start -->

| Batch | Type | Progress |
|---|---|---|
| [01 First signed release (B6)](batch-01-first-signed-release.md) | owner | `[#######.............]` 33 (1 of 3) |
| [02 Private repository (B31)](batch-02-private-repository.md) | owner | `[....................]` 0 (0 of 2) |
| [03 Pinned installs (B18)](batch-03-pinned-installs.md) | build | `[####################]` 100 (2 of 2) |

<!-- report-card:end -->

The bar for each batch counts its ticked acceptance items. A ticked item ends with the evidence that proves it; the generator refuses one that does not.
