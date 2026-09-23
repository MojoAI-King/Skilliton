# A whole-tree content scan can be invalidated by the same run's own write to a tracked file it just scanned

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-a-whole-tree-content-scan-can-be-invalid-4895
- **Status:** proposed
- **Date:** 2026-09-23

## What broke

N64 added a `maintain --apply` step that runs `security collect secrets` when SG-SECRETS-IN-SOURCE's record is
missing or stale, placed (as specified) before the existing security-findings step in the same run. A manual
repro against a fresh prepared project showed the very first `maintain --apply` collecting secrets and writing a
record, and the *second* `maintain --apply` collecting secrets *again* and writing a second record for the same
control, even though nothing about secrets in the repository had changed between the two runs. Only the third run
settled into "current, left alone."

## The mechanism

The secrets collector (lib/collectors.mjs collectSecrets) fingerprints every git-tracked file, including
docs/BACKLOG.md, as part of the record's own manifest. The security-findings step, which N64 requires to run
*after* collectors in the same `maintain --apply` call (so the same run's findings reflect the records collectors
just wrote), then rewrites docs/BACKLOG.md to drop the finding the new record just closed. That rewrite happens
after the secrets collector already fingerprinted docs/BACKLOG.md's pre-rewrite content, so the brand-new record
is stale again before the run even finishes. The next `maintain --apply` sees it as stale, collects once more (this
time nothing else changes, so findings do not rewrite the backlog again), and only then does it settle.

## The fix

Nothing was changed in collectSecrets or the findings writer (both are out of this lane's scope, restricted to
their exported functions); the settling behavior is inherent to running collectors before findings in the same
call, which N64's brief specifies on purpose so a fresh run's findings are never one cycle behind its own
collections. The fix here was to stop assuming "collect once, then current forever" and instead verify the actual
run-by-run behavior with a real, disposable git repository before writing the test, and to document the observed
settle (one corrective re-run per control that just transitioned) in scripts/maintain-security-collectors.test.mjs
and in LANE_REPORT.md's Run-time behavior section, rather than asserting the untested assumption.

Then fixed on main (B81): `runMaintain` in packs/base/plugins/workflow/runtime/lib/maintain.mjs checks whether a
collector wrote and the findings step then rewrote the backlog; when both happened, it collects once more and
writes the findings again in the same run, which then change nothing. The number of records is the same as before;
one `maintain --apply` settles instead of three.

## The rule

When a "record what changed" step and a "rewrite a summary of what changed" step run in the same invocation, and
the first step's own evidence set includes the file the second step writes to, expect one extra settling pass
before assuming "collect once, left alone" holds, and run that pass inside the same invocation rather than leaving it
to the next one. Verify multi-run behavior by actually running the command
several times against a disposable fixture rather than reasoning from the diff alone.

## What now enforces it

scripts/maintain-security-collectors.test.mjs's first test asserts that the first `maintain --apply` writes the
secrets record twice (the second naming why) and leaves the findings current, that the next two runs write nothing,
and that adding a delivery policy settles in one run the same way, so a change that loses the in-run pass, or makes
it loop instead of settle, fails the test (it fails against the code before B81).
