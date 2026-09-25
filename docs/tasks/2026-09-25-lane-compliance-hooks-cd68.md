# Task: Lane compliance-hooks

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-compliance-hooks-cd68
- **State:** in-progress
- **Branch:** lane/compliance-hooks-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:32:42.955Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N5. [FEATURE] Prepare, session start and maintain: packs/base/plugins/workflow/runtime/lib/prepare.mjs (planPrepareItems :528-547 adds a scope proposal item that calls proposeScope and writes .skilliton/compliance/scope.proposal.json, and writes `compliance.builtByCompany: false` into the drafted config with a comment-free note in the plan output that a person sets it true when the company built the software), packs/base/plugins/workflow/runtime/lib/project-files.mjs (:230-240 the security README gains two sentences on compliance: what the proposal is and how to confirm it), packs/base/plugins/workflow/runtime/lib/lifecycle.mjs (the Project state next to securityCheck :486-501 gains one line: "compliance: proposal waiting for a named confirmation (<n> frameworks): skilliton compliance scope --apply --decided-by <you>" or "compliance: <n> frameworks in scope, sheet <current|stale|missing>: skilliton compliance sheet --apply", nothing when there is no proposal and no scope), packs/base/plugins/workflow/runtime/lib/maintain.mjs (after the findings step :152-206, when a scope exists: writeSheet with apply and report "compliance sheet: <n> rows changed" or "current"), the matching tests (lifecycle, prepare, maintain) with the seam modules stubbed: a project with a proposal shows the waiting line, one with a scope and a stale sheet shows stale, one with neither shows nothing, maintain refreshes and reports the count. Done looks like: the session-start line reads correctly in all three states in the test output.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
