# Task: Lane runner-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-runner-review-8fed
- **State:** in-progress
- **Branch:** lane/runner-review-0923b
- **Owner:** unassigned
- **Updated:** 2026-09-23T18:11:16.616Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N95. [TOUCH] The local runner fails the way CI fails: scripts/checks.mjs line 96 at the base runs each step with `bash -c`; GitHub's default shell for a `run:` step is `bash --noprofile --norc -eo pipefail`. Run each step with `bash --noprofile --norc -eo pipefail -c` so an early failure in a multi-command step reads FAIL locally as it does in CI. Reproduced at the base: a two-command step whose first command exits 1 and second exits 0 reads PASS and the runner exits 0. Test in scripts/checks-runner.test.mjs: a fixture workflow with that step reads 0 pass 1 fail and exit 1; a step that fails only its pipeline's first stage reads FAIL; a step with a loop and a trailing success still reads PASS when every command succeeds; the runner's `--only` selection still works.
- [ ] N96. [TOUCH] The history-bound tests run in a fresh clone: scripts/migrate.test.mjs line 119 compares fixtures against commit 23aae41, scripts/security-evidence.test.mjs line 28 uses c3fec4bdbc5b6712db3ed49478a6b6828662283b, scripts/rename.test.mjs line 25 uses e5900d5; the history was rewritten on 2026-09-23 and those hashes exist in no fresh clone, so eight tests skip and the runner reads PASS. The rewritten equivalents (same tree, same author date) are 23aae41 to 0bc2a05, c3fec4b to c739bba, e5900d5 to 62f21b6; verify each with `git log -1 --format="%T %at" <old>` against the new one in this checkout, which still holds the old objects under refs/backup/pre-rewrite-main. Preferred fix: snapshot what each test reads from history into scripts/fixtures/ (the files `git show <commit>:<path>` returns), compare against the snapshot, and delete the skip; if a test genuinely needs a commit (rename builds a legacy repository from history), rebind it to the new hash and make a missing commit FAIL with a reason unless `git rev-parse --is-shallow-repository` says the clone is shallow, which is the only case that may skip. The fresh-clone proof in the brief shows 0 skips.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
