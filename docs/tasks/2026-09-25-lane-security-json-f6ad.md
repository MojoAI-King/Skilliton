# Task: Lane security-json

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-security-json-f6ad
- **State:** in-progress
- **Branch:** lane/security-json-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:42:28.004Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N9. [TOUCH] `skilliton security status --json`: packs/base/plugins/workflow/runtime/commands/security.mjs, packs/base/plugins/workflow/runtime/lib/security.mjs (a pure `statusJson(evaluation) -> {schema:"skilliton.security-status/1", catalogVersion, generatedAt, controls:[{id, title, applies, decidedBy, assessment, freshness, recordId, recordedAt, maxAgeDays}], counts}` built from what evaluateSecurity :285-348 already computes; nothing new is computed), scripts/security.test.mjs (a case per freshness state and one for an undecided control, and the JSON validates against the shape the test holds): the human report is unchanged; the JSON goes to stdout alone; refusals keep never echoing values. Done looks like: `skilliton security status --json | jq .counts` on the project rehearsal fixture equals the counts the text report prints.

## Decisions

not yet written

## Checkpoints

### 2026-09-25T04:42:28.004Z

- **State:** N9 done: security status --json ships. lib/security.mjs exports statusJson(ev), pure, built only from evaluateSecurity's rows/counts/now; commands/security.mjs wires --json on the status subcommand, printing exactly one JSON object and refusing to combine with --apply or --require-collected.
- **Evidence:** node --test scripts/security.test.mjs: 9/9 pass (one case per freshness state plus undecided, a shape check, a counts-vs-text-report equality check, and the --apply/--require-collected refusal). node --test scripts/security-evidence.test.mjs scripts/collectors.test.mjs scripts/security-record-refusals.test.mjs scripts/security-propose.test.mjs scripts/security-freshness.test.mjs: 76/76 pass. node scripts/security-require.test.mjs, security-findings.test.mjs, security-entry-paths.test.mjs, security-path-refusals.test.mjs, maintain-security-collectors.test.mjs: all pass. node scripts/lint.test.mjs and scripts/lint-shape.test.mjs and scripts/deadcode.mjs: pass (lib/security.mjs stayed under the 600-line ceiling at 598, no new pin needed). On this repo's own project: node scripts/skilliton.mjs security status --json | jq .counts equals the numbers in the text report's Result line (current 1, applicable 13, missing 0, stale 11, expired 0, invalid 0, gaps 0, needsHuman 1, undecided 0), and both exit 1.
- **Next:** Nothing further in this lane's scope. Integration should wire scripts/security.test.mjs into .github/workflows/checks.yml's security step (line 245) so CI runs it; that file is a dispatch hotspot and was left untouched here.
- **Git:** lane/security-json-0925 @ 841a4b7, 4 uncommitted

## Handoff

- **State:** N9 done: security status --json ships. lib/security.mjs exports statusJson(ev), pure, built only from evaluateSecurity's rows/counts/now; commands/security.mjs wires --json on the status subcommand, printing exactly one JSON object and refusing to combine with --apply or --require-collected. Evidence: node --test scripts/security.test.mjs: 9/9 pass (one case per freshness state plus undecided, a shape check, a counts-vs-text-report equality check, and the --apply/--require-collected refusal). node --test scripts/security-evidence.test.mjs scripts/collectors.test.mjs scripts/security-record-refusals.test.mjs scripts/security-propose.test.mjs scripts/security-freshness.test.mjs: 76/76 pass. node scripts/security-require.test.mjs, security-findings.test.mjs, security-entry-paths.test.mjs, security-path-refusals.test.mjs, maintain-security-collectors.test.mjs: all pass. node scripts/lint.test.mjs and scripts/lint-shape.test.mjs and scripts/deadcode.mjs: pass (lib/security.mjs stayed under the 600-line ceiling at 598, no new pin needed). On this repo's own project: node scripts/skilliton.mjs security status --json | jq .counts equals the numbers in the text report's Result line (current 1, applicable 13, missing 0, stale 11, expired 0, invalid 0, gaps 0, needsHuman 1, undecided 0), and both exit 1.
- **Next:** Nothing further in this lane's scope. Integration should wire scripts/security.test.mjs into .github/workflows/checks.yml's security step (line 245) so CI runs it; that file is a dispatch hotspot and was left untouched here.
- **Blocked:** nothing
- **Watch out:** nothing known
