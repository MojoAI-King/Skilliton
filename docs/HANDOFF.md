# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-25 01:31 EDT

- **State:** Maintenance run at 6bdc129 (ledger row, findings, two lessons, backlog B97 to B101, the dispatch skill says a seam can be data). Four lanes merged; the compliance-hooks lane is rebased on main and reconciling its N5 to the real modules (compliance-scope.mjs and compliance-sheet.mjs, proposal.json, ids not times) as a second commit; not merged yet. Evidence: CI read from the forge: every run since a08158c fails on one step only, the public-safety scrub with --history-all (4 lines: two lane task records that dispatch committed from LANES.md with a folder under the home directory, and the two lane commits that removed it); every other step is green, the new compliance steps included. Locally: docs, packs, lint, scrub (tree), names exit 0 on 6bdc129.
- **Next:** Merge compliance-hooks when it reports again (its suites plus lifecycle, prepare group, maintain, rename, the whole-tree checks, ff-only), close its task record, run claude plugin eval for compliance-never-certifies, maintain --apply, the handoff, close the batch (detach the lane folders, delete the lane branches), then the release (1.5.0). The owner: run the history rewrite (the steps and the replace file are in this session scratchpad under history-rewrite/, nothing with a path is in the repository), after the lane branches are deleted; review the baseline crosswalk; the verdict column; the SOC 2 and PCI DSS terms.
- **Blocked:** CI stays red on the scrub step until the owner rewrites main from 1c6fe70 onward to drop the two home paths (a force-push to a protected branch, so only the owner, with ruleset 23792740 toggled); no release can be signed on a red main.
- **Watch out:** Never put a folder under the home directory into LANES.md: dispatch copies item text into task records and commits them without the scrub (B97). The lane branches still hold the old commits, so delete them before the rewrite, not after.
- **Git:** main @ 6bdc129, 1 uncommitted

## Earlier
