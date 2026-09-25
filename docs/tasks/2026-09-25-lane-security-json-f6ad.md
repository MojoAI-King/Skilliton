# Task: Lane security-json

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-security-json-f6ad
- **State:** in-progress
- **Branch:** lane/security-json-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:32:42.955Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N9. [TOUCH] `skilliton security status --json`: packs/base/plugins/workflow/runtime/commands/security.mjs, packs/base/plugins/workflow/runtime/lib/security.mjs (a pure `statusJson(evaluation) -> {schema:"skilliton.security-status/1", catalogVersion, generatedAt, controls:[{id, title, applies, decidedBy, assessment, freshness, recordId, recordedAt, maxAgeDays}], counts}` built from what evaluateSecurity :285-348 already computes; nothing new is computed), scripts/security.test.mjs (a case per freshness state and one for an undecided control, and the JSON validates against the shape the test holds): the human report is unchanged; the JSON goes to stdout alone; refusals keep never echoing values. Done looks like: `skilliton security status --json | jq .counts` on the project rehearsal fixture equals the counts the text report prints.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
