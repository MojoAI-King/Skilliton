# Task: Lane code-clarity

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-code-clarity-3584
- **State:** in-progress
- **Branch:** lane/code-clarity-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T08:37:44.213Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N66. [FEATURE] The lint holds line length and function length the way it holds file length (backlog B68): scripts/lint.test.mjs (it is pinned at its own size; if it cannot grow, put the new rules in a new scripts/lint-shape.test.mjs with its own `--self-test`, in the same failures and oks shape): done when a line over 160 characters and a function over 80 lines in packs/base/plugins/ are failures, except the files and functions recorded in a ratchet table with their counts today (a count may go down, never up; a new file starts at zero), a `--self-test` proves each rule can fail, and CI runs it.
- [x] N67. [TOUCH] The longest functions are split into named steps that read top to bottom, behavior unchanged: in packs/base/plugins/workflow/runtime/, in this order, stopping when the lane's context runs low: commands/migrate.mjs `run` (about 161 lines), commands/join.mjs `join` (about 131), lib/verify.mjs `runVerify` (about 118), lib/prepare.mjs `planPrepare` (about 111), lib/dispatch.mjs `planDispatch` (about 108) and `briefText` (about 99): done when each is under 80 lines, calls helpers whose names say what each step does, keeps its exported signature, the ratchet table from N66 is lowered to match, and `node scripts/checks.mjs` passes after each split. Do not touch lib/delivery.mjs (security-critical and pinned), lib/collectors.mjs (another lane), commands/checkpoint.mjs (another lane), lib/lifecycle.mjs (another lane) or lib/maintain.mjs (another lane). Wrap the long lines only in the functions you split.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T07:14:35.607Z

- **State:** N66 done: scripts/lint-shape.test.mjs adds line-length (160 char) and function-length (80 line) rules, ratcheted like lint.test.mjs pins file size (69 line-length pins, 14 function-length pins recorded today); CI wired in .github/workflows/checks.yml
- **Evidence:** node scripts/lint-shape.test.mjs --self-test: 22/22 ok, exit 0; node scripts/lint-shape.test.mjs: clean against the real tree, exit 0; node scripts/lint.test.mjs: still passes (77 runtime files, 17 pins); node scripts/checks.mjs --only "Line length": PASS
- **Next:** N67: split run/join/runVerify/planPrepare/planDispatch/briefText under 80 lines, lowering the function-length ratchet as each drops
- **Git:** lane/code-clarity-0923 @ 2718af2, 3 uncommitted

### 2026-09-23T08:37:44.213Z

- **State:** N67 done: run (migrate.mjs), join (join.mjs), runVerify (verify.mjs), planPrepare (prepare.mjs), planDispatch and briefText (dispatch.mjs, briefText moved to new lib/dispatch-brief.mjs) all split under 80 lines each; N66's ratchet table lowered to match (14 function-length pins down to 8); two new same-plugin sibling files (lib/prepare-plan.mjs, lib/dispatch-brief.mjs) hold pieces that had no room left under prepare.mjs's and dispatch.mjs's own line ceilings, one-directional imports only, matching the delivery-install.mjs/delivery-policy.mjs precedent
- **Evidence:** node scripts/lint.test.mjs and lint-shape.test.mjs: both pass, all six N67 pins removed, no stale/grown pins; node --test scripts/dispatch.test.mjs: 23/23 pass including exact-regex brief-content assertions; node scripts/checks.mjs (full run): 73 pass, 0 fail, 2 skipped, of 75, identical to the pre-N67 baseline; automated literal-extraction diff of every touched file against HEAD: zero output/error text changed in any split function, confirmed word-for-word; node scripts/deadcode.mjs: passes, both new files read automatically (79 runtime modules, no dead exports); scripts/allowlist.test.mjs reads via scripts/inventory.mjs's recursive walk() over the plugin folder, so both new files are in scope with no registration needed
- **Next:** Lane complete: write LANE_REPORT.md and hand back
- **Git:** lane/code-clarity-0923 @ 9f32f39, 11 uncommitted

## Handoff

- **State:** N67 done: run (migrate.mjs), join (join.mjs), runVerify (verify.mjs), planPrepare (prepare.mjs), planDispatch and briefText (dispatch.mjs, briefText moved to new lib/dispatch-brief.mjs) all split under 80 lines each; N66's ratchet table lowered to match (14 function-length pins down to 8); two new same-plugin sibling files (lib/prepare-plan.mjs, lib/dispatch-brief.mjs) hold pieces that had no room left under prepare.mjs's and dispatch.mjs's own line ceilings, one-directional imports only, matching the delivery-install.mjs/delivery-policy.mjs precedent. Evidence: node scripts/lint.test.mjs and lint-shape.test.mjs: both pass, all six N67 pins removed, no stale/grown pins; node --test scripts/dispatch.test.mjs: 23/23 pass including exact-regex brief-content assertions; node scripts/checks.mjs (full run): 73 pass, 0 fail, 2 skipped, of 75, identical to the pre-N67 baseline; automated literal-extraction diff of every touched file against HEAD: zero output/error text changed in any split function, confirmed word-for-word; node scripts/deadcode.mjs: passes, both new files read automatically (79 runtime modules, no dead exports); scripts/allowlist.test.mjs reads via scripts/inventory.mjs's recursive walk() over the plugin folder, so both new files are in scope with no registration needed.
- **Next:** Lane complete: write LANE_REPORT.md and hand back
- **Blocked:** nothing
- **Watch out:** nothing known
