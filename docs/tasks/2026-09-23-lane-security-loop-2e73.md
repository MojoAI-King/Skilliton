# Task: Lane security-loop

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-security-loop-2e73
- **State:** in-progress
- **Branch:** lane/security-loop-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T05:29:57.997Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N47. [FEATURE] Secrets allowlist with a reason per entry: packs/base/plugins/workflow/runtime/lib/collectors.mjs (collectSecrets, the hit loop near line 325 to 349 and the specific/assessment step near 352 to 359, the report block near 364 to 384, the manifest near 386 to 390), a loader in collectors.mjs or lib/security-io.mjs, scripts/collectors.test.mjs or a new scripts/secrets-allow.test.mjs if collectors.test.mjs is at its size pin: done when `.skilliton/security/secrets-allow.json` (entries of `path`, `rule`, and `line` or `sha256` of the matched line, plus a required non-empty `reason`) moves a matching hit from the matches into an "Allowed" section of the report with its reason and never its text; the assessment is gap only when an unallowed specific hit remains; an entry that matched nothing this run is listed as unused; an invalid file (a missing reason, an unknown key, a bad path) refuses with exit 2 naming the entry index and field, nothing written; the allowlist file is fingerprinted into the record's sources, so editing it makes the record stale; tests prove each of these, including that a planted secret value never appears in any output. Match the audit's own allow design in lib/audit.mjs lines 112 to 126 where it fits (an allowed match is kept and shown, never dropped).
- [x] N55. [TOUCH] `security record` names the field it refused: packs/base/plugins/workflow/runtime/lib/security.mjs createRecord (line 126 and the attachment checks after it), lib/security-io.mjs (the INVALID_RECORD_INPUT text near line 43 and `fail(code, detail)` near 83), the covering test in scripts/security-evidence.test.mjs or a new test file if that one is at its pin: done when the refusal says which of control, assessment, note, reviewer, sources or artifacts failed and which rule it broke (empty, too long, surrounding spaces, control characters, looks like a secret, listed twice, not in the catalog), never echoing the value; exit 2 and "Nothing was written" unchanged; a test per field.
- [x] N45. [TOUCH] Say up front that two collectors need a delivery policy: packs/base/plugins/workflow/runtime/commands/security.mjs (the status output) and lib/security-io.mjs (the NO_DELIVERY_POLICY text near line 59): done when `security status` prints one line, when `.skilliton/delivery.json` is absent, naming the collectors that need it (tests, delivery-policy) and the command that makes it (`skilliton delivery confirm --apply` when `.skilliton/delivery.draft.json` exists, else what to write); the collector refusal names the same command; a test covers both the draft and no-draft cases. Do not change lib/lifecycle.mjs (the records-host lane owns it).

## Decisions

not yet written

## Checkpoints

### 2026-09-23T05:29:57.997Z

- **State:** N47, N55 and N45 all done: secrets allowlist with per-entry reasons, security record names the refused field and rule, and security status/the tests collector name the fix for a missing delivery policy
- **Evidence:** node --test scripts/collectors.test.mjs (21 tests), scripts/security-evidence.test.mjs (38 tests), scripts/security-record-refusals.test.mjs (9 tests) all pass; node scripts/lint.test.mjs passes
- **Next:** hand off to the integration window for merge
- **Git:** lane/security-loop-0923 @ 4afc933, 2 uncommitted

## Handoff

- **State:** N47, N55 and N45 all done: secrets allowlist with per-entry reasons, security record names the refused field and rule, and security status/the tests collector name the fix for a missing delivery policy. Evidence: node --test scripts/collectors.test.mjs (21 tests), scripts/security-evidence.test.mjs (38 tests), scripts/security-record-refusals.test.mjs (9 tests) all pass; node scripts/lint.test.mjs passes.
- **Next:** hand off to the integration window for merge
- **Blocked:** nothing
- **Watch out:** nothing known
