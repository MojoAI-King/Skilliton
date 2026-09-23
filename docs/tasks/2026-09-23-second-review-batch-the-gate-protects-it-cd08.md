# Task: Second review batch: the gate protects its check program, the guard's remaining gaps, the runner's shell, the history-bound tests, the freshness contract, the documents that ran ahead

Kind: Living. Task record.

- **ID:** 2026-09-23-second-review-batch-the-gate-protects-it-cd08
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-23T18:13:57.788Z

## Request

if you need to fix bugs, go fix some bugs (the owner, after the regrade scorecard and the Codex review of 63b0119)

## Acceptance criteria

- [ ] An unsigned push that rewrites the check program the delivery policy runs is rejected naming the file; the same change signed by an approver is accepted; a normal push is accepted
- [ ] Command text over the size cap asks at once without parsing, under one second at 3 MB; sed -i on a record denies; a shell fed from a pipe or a decoder asks; any write to or removal of .claude/settings.json asks; a glob that can match a record path denies
- [ ] The local runner fails a step whose first command fails; the eight history-bound tests run in a fresh full clone and fail, not skip, when their baseline is missing
- [ ] A source file changed with the same size and a restored timestamp reads stale
- [ ] The handoff hook, the delivery gate's output reader and the skill writers refuse a linked or hard-linked path
- [ ] The timing cases live in their own step that reports not run under load instead of failing a correctness suite
- [ ] README, INSTALL, SECURITY.md, the hook header and prepare --help agree with the code and with each other
- [ ] Full checks green on the merged tree and on the release commit; the release signed, pushed, approved in a fresh clone, verified here

## Decisions

not yet written

## Checkpoints

### 2026-09-23T18:13:57.788Z

- **State:** Four lanes dispatched from LANES-7.md at a19f791 (gate-review, guard-review-2, runner-review, docs-review-2) and building; the README overhead attribution and stop-hook sentence corrected and the journal retention stated on main (b5dfe24, pushed). Not done: the lanes, their red teams, the merges, the policy's protected paths signed, docs/DELIVERY.md and CONTRACTS 14, the changelog, the release
- **Evidence:** docs, allowlist and scrub checks exit 0 on b5dfe24; CI green through a19f791; the earlier cold-review task closed as done (1.2.0 signed, approved, verified)
- **Next:** Merge each lane as its report lands, rolling with the fast checks and its own suites; sign the policy with protectedPaths; write DELIVERY.md and CONTRACTS 14; changelog; full checks; release
- **Git:** main @ b5dfe24, 0 uncommitted

## Handoff

- **State:** Four lanes dispatched from LANES-7.md at a19f791 (gate-review, guard-review-2, runner-review, docs-review-2) and building; the README overhead attribution and stop-hook sentence corrected and the journal retention stated on main (b5dfe24, pushed). Not done: the lanes, their red teams, the merges, the policy's protected paths signed, docs/DELIVERY.md and CONTRACTS 14, the changelog, the release. Evidence: docs, allowlist and scrub checks exit 0 on b5dfe24; CI green through a19f791; the earlier cold-review task closed as done (1.2.0 signed, approved, verified).
- **Next:** Merge each lane as its report lands, rolling with the fast checks and its own suites; sign the policy with protectedPaths; write DELIVERY.md and CONTRACTS 14; changelog; full checks; release
- **Blocked:** nothing
- **Watch out:** nothing known
