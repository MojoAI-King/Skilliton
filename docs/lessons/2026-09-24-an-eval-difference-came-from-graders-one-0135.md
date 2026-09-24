# An eval difference came from graders one setup could not pass

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-an-eval-difference-came-from-graders-one-0135
- **Status:** accepted
- **Date:** 2026-09-24

## What broke

The first eval run of `audit-finding-acted-on` on 1.4.0 scored 0.62 with the plugin and 0.86 without it, which read as the security skill making the model worse at acting on an audit finding. From the traces, all six runs fixed the flaw correctly.

## The mechanism

Three graders measured something other than the fix. `audit-clean-after` looked for `skilliton audit: nothing found` in the trace and was marked `arm: both`, but without the plugin there is no `skilliton` command, so it could not pass there, and with the plugin the security skill never named the audit, so the model never ran it. `fix-on-line`'s pattern required the fixed call on the first line of the function and rejected two correct fixes with a comment line above it. `fix-is-real` was judged on the last message, which the stop hook's first-stop hold had turned into a checkpoint note. The real behavior difference was the skill sending the model to the evidence register for about ten extra turns.

## The fix

workflow 0.25.1: the security skill's first section runs `skilliton audit`, the fix and a second audit for a request to audit code (packs/base/plugins/workflow/skills/security/SKILL.md); the checkpoint reminder asks the model to end with its answer (lib/session-hooks.mjs stopReason); `audit-clean-after` is `arm: with-only`; `fix-on-line` accepts comment lines; `check-fix-pattern.mjs` reads the grader's own pattern. The rerun scored 1.00 in both setups, every run with the plugin ran the audit, 11 to 15 turns (evidence/60aed2c/audit-finding-acted-on/SUMMARY.md).

## The rule

Before an eval's difference is believed, read every failed check against its trace and say whether it could have passed in that setup; a check that needs a tool only one setup has counts in that setup only.

## What now enforces it

docs/MAINTAIN.md's eval step already requires every failed check diagnosed from its kept transcript in the notes; `self-check.sh` now proves `fix-on-line` accepts a commented fix; `scripts/stop-reason-answer.test.mjs` pins the reminder's ask. Nothing checks a grader's `arm` against the tools each setup has: that is judgment at review.
