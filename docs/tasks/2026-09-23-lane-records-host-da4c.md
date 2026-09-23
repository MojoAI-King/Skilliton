# Task: Lane records-host

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-records-host-da4c
- **State:** merged
- **Branch:** lane/records-host-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T08:37:20.095Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N50. [FEATURE] A project can set the header line its records open with: packs/base/plugins/workflow/runtime/lib/config.mjs (a new `prepare.recordHeader` string, validated as one line with no control characters and at most 200 characters, containing `{kind}` where the record kind goes, default `Kind: {kind}` so today's output is unchanged byte for byte), one helper that every writer calls, lib/tasks.mjs renderTask (lines 8 and 92), lib/project-files.mjs (the doc() templates, lines 89 to 226), lib/dispatch.mjs line 187, commands/propose.mjs line 96, and every reader that matches `/^Kind:/` (lib/handoff.mjs near line 200 and any other; find them with a search) so a record written with a configured header is still read; a new test file: done when a project whose config sets, for example, `"> {kind}"` gets that line on every new task record, decision and lesson entry and scaffolded record, existing records keep working, and the default output is byte-identical to today (a test asserts that).
- [x] N51. [TOUCH, inside decision docs/decisions/2026-09-19-records-are-written-at-checkpoint-time-m-554d.md] A checkpoint stops rewriting the status index when no task changed state: packs/base/plugins/workflow/runtime/lib/records.mjs (the open-tasks entries near line 120 carry `updated: fields.Updated`, which changes on every checkpoint, and the table renderer that prints it), the test that asserts the table's columns (search scripts/ for the column header): first measure it, by running two checkpoints on one task in a fixture and showing the index section changes between them; then drop the Updated column from the index (the task record keeps the time), so a checkpoint rewrites docs/STATUS.md only when a task is added, renamed, or changes state or branch. Checkpoints still write the indexes, as the decision says. Done when a test shows two checkpoints on one task leave docs/STATUS.md byte-identical after the first, and a state change still updates it. If the measurement shows the churn has another cause, stop, say what it is in LANE_REPORT.md, and do not build.
- [x] N52. [FEATURE] Say when another session looks live in the same checkout: packs/base/plugins/workflow/runtime/lib/lifecycle.mjs (sessionHistory, lines 165 to 184, and the Project state block near lines 450 to 467), lib/session-hooks.mjs if the block text lives there, a new test file: done when, at session start, a different session id whose newest journal event (session-start or stop) is within the last 30 minutes and has no session-end is reported as "Another session looks active in this checkout (last seen <time>): work in a worktree lane, or check before committing shared records", distinct from the existing "interrupted" line (which keeps its meaning for older ones); nothing is blocked; tests cover live, interrupted, and ended sessions, and the current session is never reported against itself.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T06:10:20.785Z

- **State:** N50, N51 and N52 all implemented and committed (3 commits: c47b26d, 615cc86, 038fcb8); every acceptance criterion checked
- **Evidence:** node scripts/lint.test.mjs and bash scripts/scrub-check.sh pass on the final tree; node scripts/checks.mjs --only run individually for every check touching these files (record header, tasks index does not churn, session liveness, prepare/migrate/records, dispatch, handoff writer, lifecycle hooks, docs, size/lint, scrub) all PASS; full node scripts/lifecycle.test.mjs (59 tests) and node --test scripts/records.test.mjs, scripts/record-header.test.mjs, scripts/session-liveness.test.mjs, scripts/index-churn.test.mjs, scripts/dispatch.test.mjs, scripts/handoff-write.test.mjs all pass
- **Next:** Report to the main window; main rebases this branch and runs the full gate
- **Git:** lane/records-host-0923 @ 038fcb8, 1 uncommitted

## Handoff

- **State:** N50, N51 and N52 all implemented and committed (3 commits: c47b26d, 615cc86, 038fcb8); every acceptance criterion checked. Evidence: node scripts/lint.test.mjs and bash scripts/scrub-check.sh pass on the final tree; node scripts/checks.mjs --only run individually for every check touching these files (record header, tasks index does not churn, session liveness, prepare/migrate/records, dispatch, handoff writer, lifecycle hooks, docs, size/lint, scrub) all PASS; full node scripts/lifecycle.test.mjs (59 tests) and node --test scripts/records.test.mjs, scripts/record-header.test.mjs, scripts/session-liveness.test.mjs, scripts/index-churn.test.mjs, scripts/dispatch.test.mjs, scripts/handoff-write.test.mjs all pass.
- **Next:** Report to the main window; main rebases this branch and runs the full gate
- **Blocked:** nothing
- **Watch out:** nothing known
