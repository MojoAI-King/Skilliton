# Task: Second review batch: the gate protects its check program, the guard's remaining gaps, the runner's shell, the history-bound tests, the freshness contract, the documents that ran ahead

Kind: Living. Task record.

- **ID:** 2026-09-23-second-review-batch-the-gate-protects-it-cd08
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-23T22:07:14.153Z

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

### 2026-09-23T20:18:55.088Z

- **State:** Second batch: docs-review-2 and gate-review merged and pushed (main c93b51b): the gate protects the program that runs its checks (protectedPaths, this repository lists scripts/ and .github/workflows/), the reader bound, hard-linked manifests, the handoff hook and links, freshness by content; INSTALL, SECURITY.md, prepare --help reconciled; README overhead and stop-hook sentences corrected. Running: guard-review-2 (N88 and N93 in, five items left, then its red team), runner-review (both items in, proof and full run pending), the gate's red team. Not done: those merges, the version bumps (workflow 0.24.0, guardrails 0.10.0), the changelog, full checks, the release
- **Evidence:** Gate lane on the rebased tree: its five suites 68 pass 0 fail, hook-fixture exit 0, fast checks each exit 0; docs lane: scrub and skilliton.test exit 0; delivery-protect test exit 0 after the policy change; CI green through 737960b, watched on c93b51b
- **Next:** Merge runner-review and guard-review-2 as their reports land; bump versions; changelog 1.3.0; full checks on merged main; release create, sign, push, fresh clone, verify; handoff
- **Git:** main @ c93b51b, 3 uncommitted

### 2026-09-23T22:01:03.754Z

- **State:** All four second-batch lanes merged on main: the gate protects its check program (protectedPaths, read at both tips, folder links refused; this repository protects scripts/ and .github/workflows/), the reader bound, hard-linked manifests, the handoff hook and links, freshness by content, the 64 KB command cap, in-place editors on records, shells fed from pipes and files, any settings-file write, record globs, the timing cases in their own step, the runner fail-fast, the history-bound tests in a fresh clone, the docs reconciled; guardrails 0.10.0 and workflow 0.24.0; the 1.3.0 manifest committed at 312c212 and pushed. Not done: CI on 312c212 (running), the tag signature and push, the fresh-clone check, verify, the evidence note; the guard's red team has not reported
- **Evidence:** checks.mjs 81 pass 0 fail 2 skipped of 83 on 3930380 (merged main); CI green on 3930380 (run 35925048519); fast checks and release.test 27 pass on 312c212; audit 0 findings in 759 files; gate red team second pass 8 of 8 cases as required, 0 open; every lane's own suites green on its rebased tree
- **Next:** Read CI on 312c212; release sign 1.3.0 --apply; push the tag; fresh clone release list; plugin update and verify; evidence note; read the guard red team; handoff
- **Git:** main @ 312c212, 0 uncommitted

## Handoff

- **State:** All four second-batch lanes merged on main: the gate protects its check program (protectedPaths, read at both tips, folder links refused; this repository protects scripts/ and .github/workflows/), the reader bound, hard-linked manifests, the handoff hook and links, freshness by content, the 64 KB command cap, in-place editors on records, shells fed from pipes and files, any settings-file write, record globs, the timing cases in their own step, the runner fail-fast, the history-bound tests in a fresh clone, the docs reconciled; guardrails 0.10.0 and workflow 0.24.0; the 1.3.0 manifest committed at 312c212 and pushed. Not done: CI on 312c212 (running), the tag signature and push, the fresh-clone check, verify, the evidence note; the guard's red team has not reported. Evidence: checks.mjs 81 pass 0 fail 2 skipped of 83 on 3930380 (merged main); CI green on 3930380 (run 35925048519); fast checks and release.test 27 pass on 312c212; audit 0 findings in 759 files; gate red team second pass 8 of 8 cases as required, 0 open; every lane's own suites green on its rebased tree.
- **Next:** Read CI on 312c212; release sign 1.3.0 --apply; push the tag; fresh clone release list; plugin update and verify; evidence note; read the guard red team; handoff
- **Blocked:** Only the owner can do these: read the Usage screen for the token window (turns the meter's reconstruction into a number that may be stated), report the end-of-day maintain minutes before and after, the extension keyboard checks and the other rows of docs/OWNER_TESTS.md, a clean macOS account, a Codex login, a Windows machine with a Claude login, an endpoint security product to test under, and a participant for the new builder rehearsal
- **Watch out:** Restart the client before the new hooks run (workflow 0.22.0, guardrails 0.8.0, context-hygiene 0.3.1 installed at 10:00 EDT). The lane folder ~/Desktop/Skilliton-lanes/instruction-size still has its branch checked out because the guard refused moving its stale receipt; remove that file by hand, detach, delete the branch. Windows stays not supported (B80, no Claude Code session there). Read the clock before typing a time
