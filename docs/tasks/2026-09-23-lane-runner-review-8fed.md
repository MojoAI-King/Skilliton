# Task: Lane runner-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-runner-review-8fed
- **State:** merged
- **Branch:** lane/runner-review-0923b
- **Owner:** unassigned
- **Updated:** 2026-09-23T21:24:34.640Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N95. [TOUCH] The local runner fails the way CI fails: scripts/checks.mjs line 96 at the base runs each step with `bash -c`; GitHub's default shell for a `run:` step is `bash --noprofile --norc -eo pipefail`. Run each step with `bash --noprofile --norc -eo pipefail -c` so an early failure in a multi-command step reads FAIL locally as it does in CI. Reproduced at the base: a two-command step whose first command exits 1 and second exits 0 reads PASS and the runner exits 0. Test in scripts/checks-runner.test.mjs: a fixture workflow with that step reads 0 pass 1 fail and exit 1; a step that fails only its pipeline's first stage reads FAIL; a step with a loop and a trailing success still reads PASS when every command succeeds; the runner's `--only` selection still works.
- [x] N96. [TOUCH] The history-bound tests run in a fresh clone: scripts/migrate.test.mjs line 119 compares fixtures against commit 23aae41, scripts/security-evidence.test.mjs line 28 uses c3fec4bdbc5b6712db3ed49478a6b6828662283b, scripts/rename.test.mjs line 25 uses e5900d5; the history was rewritten on 2026-09-23 and those hashes exist in no fresh clone, so eight tests skip and the runner reads PASS. The rewritten equivalents (same tree, same author date) are 23aae41 to 0bc2a05, c3fec4b to c739bba, e5900d5 to 62f21b6; verify each with `git log -1 --format="%T %at" <old>` against the new one in this checkout, which still holds the old objects under refs/backup/pre-rewrite-main. Preferred fix: snapshot what each test reads from history into scripts/fixtures/ (the files `git show <commit>:<path>` returns), compare against the snapshot, and delete the skip; if a test genuinely needs a commit (rename builds a legacy repository from history), rebind it to the new hash and make a missing commit FAIL with a reason unless `git rev-parse --is-shallow-repository` says the clone is shallow, which is the only case that may skip. The fresh-clone proof in the brief shows 0 skips.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T19:44:22.673Z

- **State:** N95 done: scripts/checks.mjs runs each step with bash --noprofile --norc -eo pipefail -c; --workflow and SKILLITON_CHECKS_LOG_DIR let a test drive it with a fixture; the new test is a step in checks.yml
- **Evidence:** node --test scripts/checks-runner.test.mjs: 8 pass 0 fail, exit 0; with the base's bash -c put back, 4 of 8 fail, exit 1; scrub-check PASS; docs.test exit 0
- **Next:** N96: history-bound tests read snapshots or rebound hashes
- **Git:** lane/runner-review-0923b @ 80cd193, 4 uncommitted

### 2026-09-23T21:13:23.522Z

- **State:** N96 done: migrate.test pins the prototype-v1 fixture digests and compares with 0bc2a05; security-evidence.test runs the byte-identical fixture; rename.test builds from 62f21b6; a missing commit fails unless the clone is shallow
- **Evidence:** tree and author date match for 23aae41/0bc2a05, c3fec4b/c739bba, e5900d5/62f21b6; fresh single-branch clone: base tests 8 skips, lane tests 0 history skips (1 letter-case skip on this case-insensitive disk); bogus hash in a full clone fails migrate 1 and rename 6 with the reason; depth-1 clone skips 1 and 6 with the shallow reason; lint exit 0
- **Next:** full node scripts/checks.mjs, then LANE_REPORT.md
- **Git:** lane/runner-review-0923b @ 07d45b7, 1 uncommitted

## Handoff

- **State:** N96 done: migrate.test pins the prototype-v1 fixture digests and compares with 0bc2a05; security-evidence.test runs the byte-identical fixture; rename.test builds from 62f21b6; a missing commit fails unless the clone is shallow. Evidence: tree and author date match for 23aae41/0bc2a05, c3fec4b/c739bba, e5900d5/62f21b6; fresh single-branch clone: base tests 8 skips, lane tests 0 history skips (1 letter-case skip on this case-insensitive disk); bogus hash in a full clone fails migrate 1 and rename 6 with the reason; depth-1 clone skips 1 and 6 with the shallow reason; lint exit 0.
- **Next:** full node scripts/checks.mjs, then LANE_REPORT.md
- **Blocked:** nothing
- **Watch out:** nothing known
