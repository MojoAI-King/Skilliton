# Task: Lane docs-review-2

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-docs-review-2-d153
- **State:** in-progress
- **Branch:** lane/docs-review-2-0923b
- **Owner:** unassigned
- **Updated:** 2026-09-23T19:51:45.797Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N97. [TOUCH] Words that ran ahead of the code, reconciled: (a) the stop hook: README line 26 says a stop with unrecorded changes "is held once until a checkpoint is recorded"; the code (lib/session-hooks.mjs lines 20 to 46) reminds once per working-tree state after `checkpoints.minMinutes` (20) of unrecorded changes and a second stop passes; write the README replacement sentence in the report and fix INSTALL.md line 66 and the two skills to say exactly that; (b) README line 17 says the first comparison run's extra 20,000 to 30,000 input tokens were range reads; evidence/comparison/2026-09-22/SUMMARY.md line 22 says that run had no read-guard refusals and the overhead was the instruction block and session-start context, and the second run's larger gap was the range reads; write the corrected sentence for main (keep the numbers, keep the heading, change only the cause); (c) `prepare --help` says layout 2 while lib/config.mjs LAYOUT_VERSION is 3: fix the help text so it cannot drift (read the constant); (d) SECURITY.md: add the second review's limits to the "Limits found" list in one line each with "fixed in guardrails 0.10.0 and workflow 0.24.0, in progress" (the gate protecting its check program; in-place editors on a record; a shell fed from a pipe; any write to the settings file; globs over record folders; command text over the size cap; the freshness check reading content; the handoff hook and a linked path; the delivery reader's line bound; hard-linked manifests); (e) INSTALL.md path 2 gains the sentence "whoever controls main controls the hooks on a trial machine; a machine that holds client work joins signed" if it is not already there. No em dashes.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T19:51:45.797Z

- **State:** N97 done: INSTALL.md, SECURITY.md, prepare.mjs help text, task SKILL.md and the harness template corrected to match code behavior; README and INSTALL.md line 66 stop-hook wording, README line 17 token-overhead cause, prepare --help layout number, SECURITY.md second-review limits list, and INSTALL.md path 2 sentence
- **Evidence:** scrub-check.sh PASS (749 files, 0 hits); checks.mjs targeted runs all exit 0: Prepare/migrate/remove, Lint, Lint shape, Size ceiling, Packaging, Guides, No current file uses the earlier name, Dead code, Living records, Public-safety scrub; prepare --help now prints layout 3
- **Next:** Merge window applies README's corrected sentences (reported in LANE_REPORT.md) since README.md is a main-only path
- **Git:** lane/docs-review-2-0923b @ 6e4e193, 6 uncommitted

## Handoff

- **State:** N97 done: INSTALL.md, SECURITY.md, prepare.mjs help text, task SKILL.md and the harness template corrected to match code behavior; README and INSTALL.md line 66 stop-hook wording, README line 17 token-overhead cause, prepare --help layout number, SECURITY.md second-review limits list, and INSTALL.md path 2 sentence. Evidence: scrub-check.sh PASS (749 files, 0 hits); checks.mjs targeted runs all exit 0: Prepare/migrate/remove, Lint, Lint shape, Size ceiling, Packaging, Guides, No current file uses the earlier name, Dead code, Living records, Public-safety scrub; prepare --help now prints layout 3.
- **Next:** Merge window applies README's corrected sentences (reported in LANE_REPORT.md) since README.md is a main-only path
- **Blocked:** nothing
- **Watch out:** nothing known
