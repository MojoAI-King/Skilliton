# Assessment note: SG-WORKFLOW-IMPROVEMENT

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Turn supported lessons into tested workflow improvements. Expected: a reviewed prevention change, a
regression scenario, and a release record. Assessment recorded: observed.

## One chain, end to end

- Reviewed: the decision with suffix 6ef8 under docs/decisions/ (dated 2026-09-22, a cold review gates the release)
  makes an independent review a release gate; evidence/live/2026-09-23-release-1.3.0.md records the two red-team
  passes and the second cold review of 63b0119.
- Prevention change and regression scenario: the guardrails 0.10.0 fixes, with scripts/guardrails-review2.test.sh
  carrying every case with the decision at 63b0119 beside the decision now (each fix fails against the code at
  63b0119, as CHANGELOG.md 1.3.0 states).
- Release record: releases/1.3.0.json, the signed tag skilliton-release/1.3.0, and the CHANGELOG.md 1.3.0 entry.

## Lessons that name the test now enforcing them

- suffix 3e4a (2026-09-21): scripts/release.test.mjs; shipped in 1.0.0 (workflow 0.15.1).
- suffix a324 (2026-09-22): scripts/guardrails.test.sh; shipped in 1.0.0 (guardrails 0.6.0).
- About 33 of the 59 entries name a test in "What now enforces it".

## Limits

No lesson links the release that shipped its fix; the link is read from plugin versions and dates in CHANGELOG.md.
Review is recorded per release and per review batch, not per lesson.
