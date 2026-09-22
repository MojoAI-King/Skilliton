# Task: A-quality pass before the Wednesday review: cold review, README, docs map, code habits

Kind: Living. Task record.

- **ID:** 2026-09-22-a-quality-pass-before-the-wednesday-revi-0d34
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T04:22:24.958Z

## Request

I need this code to be A quality and all the different criterias as close to A- as possible since they will be having a claude tool of theirs reviewing and judging this product. That means a perfect readme, coding habits and organization.

## Acceptance criteria

- [ ] A cold judge-style review by a fresh subagent with no session context grades the repository and lists what costs it a grade; each item is fixed or recorded as declined with a reason; a second cold review reads better than the first
- [ ] README.md reads in a cold reviewer's order: what it is in two sentences, the tech facts, install in three commands, the two paths, enforced versus instructed, proven versus not; every command in it runs as written
- [ ] docs/ has a one-screen map that separates living records from reference and archived material, with archived material moved under docs/archive and every link still resolving (docs.test.mjs passes)
- [ ] The runtime's largest pinned file is smaller than before and lint, dead code and the full suite pass; no savings claim anywhere
- [ ] B50 live probe, B55 and B43 folding done or recorded as deferred with a reason

## Decisions

not yet written

## Checkpoints

### 2026-09-22T04:14:12.017Z

- **State:** Cold review done (README C+, organisation B-, habits B+, tests A-, docs B-, twelve items). Shipped at 1ea056f and 28ad475: README rewritten in a cold reader's order; docs index as a one-screen map with Living, Reference and build-record folders; BUILD_GOAL, GOAL_COMMAND, AUTOPILOT_INTEGRATION and DAY-1-KICKOFF archived; LANES.md removed; the three unshipped skills moved out of the installable plugin (code-quality 0.2.1); evidence/README.md; context-hygiene description made true; lint header states the Bash exemption. Deferred with reasons as B57 to B60: legacy modules and catalog name, one test convention, a scripts/ size ceiling, the handoff trimmed to RESUME HERE. Not yet done: the security.mjs split (review item 7), a second cold review
- **Evidence:** docs, packs, lint, backlog, names, scrub, living-docs, evidence, footprint, deadcode, allowlist, setup all exit 0 on 28ad475; plugin validate --strict passes for the tree and code-quality; my link rewrite had edited files inside six old lane worktrees and every one was reverted and reads clean; CI for 28ad475 running
- **Next:** Split security.mjs by subject with the split-a-file skill, tests before and after; then the second cold review; then B50 probe, B55, B43 folding
- **Git:** main @ 28ad475, 0 uncommitted

### 2026-09-22T04:22:24.958Z

- **State:** Review item 7 done: lib/security.mjs split along the file-layer seam into lib/security-io.mjs (250 lines) and the engine (498 lines, under the ceiling, pin row deleted); workflow 0.15.8; contracts history entry. Items 1 to 6, 11 and 12 shipped earlier tonight; 8, 9, 10 deferred as B57 to B59 with reasons; the second cold review is next
- **Evidence:** Byte-identical move proven against git show HEAD; security-evidence and collectors 52 of 52, lifecycle 55 of 55, prepare and migrate 56 of 56, audit, skilliton, lint and self-test, deadcode, footprint, allowlist, packs, plugin validate, demo all pass; docs, scrub, names exit 0; CI for 28ad475 was 63 of 63
- **Next:** CI for this commit; second cold review by a fresh subagent on the new tree; then B50 live probe, B55, B43 folding, handoff
- **Git:** main @ 0cada16, 0 uncommitted

## Handoff

- **State:** Review item 7 done: lib/security.mjs split along the file-layer seam into lib/security-io.mjs (250 lines) and the engine (498 lines, under the ceiling, pin row deleted); workflow 0.15.8; contracts history entry. Items 1 to 6, 11 and 12 shipped earlier tonight; 8, 9, 10 deferred as B57 to B59 with reasons; the second cold review is next. Evidence: Byte-identical move proven against git show HEAD; security-evidence and collectors 52 of 52, lifecycle 55 of 55, prepare and migrate 56 of 56, audit, skilliton, lint and self-test, deadcode, footprint, allowlist, packs, plugin validate, demo all pass; docs, scrub, names exit 0; CI for 28ad475 was 63 of 63.
- **Next:** CI for this commit; second cold review by a fresh subagent on the new tree; then B50 live probe, B55, B43 folding, handoff
- **Blocked:** nothing
- **Watch out:** nothing known
