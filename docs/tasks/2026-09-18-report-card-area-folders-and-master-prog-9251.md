# Task: Report card, area folders and master progress bars: the road to A- in every area

Kind: Living. Task record.

- **ID:** 2026-09-18-report-card-area-folders-and-master-prog-9251
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-18T23:28:00.607Z

## Request

On 2026-09-18 the owner asked, after the chat report card (overall C+), to save the card so it can be updated as things move, to express it as progress bars from 0 to 100 with several per area, to create one folder per area holding the batches (build, research or measure) that take each area to at least A- (the ship bar), to produce a master progress report with a detailed breakdown per area, then to run maintain, and to decide whether to plan per area or all at once. Proof it helps people is deferred to the owner's own use. Nothing is committed this session.

## Acceptance criteria

- [x] docs/REPORT_CARD.md holds the intent, the generated master bars, the grade history and the waves (docs/REPORT_CARD.md; the block between the report-card markers written by --apply on 2026-09-18)
- [x] docs/areas/ holds ten AREA.md files and every batch file from the plan, each with a Kind label, acceptance items and evidence on every ticked item (50 files; node scripts/docs.test.mjs 135 files with a Kind label; node scripts/report-card.mjs --check current)
- [x] scripts/report-card.mjs regenerates the bars, --check fails on a stale block or a ticked item without evidence, --self-test proves each check can fail, and CI and docs/MAINTAIN.md run it (scripts/report-card.test.mjs 14 checks passed; --self-test 7 of 7 caught; .github/workflows/checks.yml three steps; docs/MAINTAIN.md step 2)
- [x] The full offline suite and the scrub check pass on the tree; nothing is committed (scratchpad suite run of 2026-09-18 19:27 EDT: 43 of 43 steps PASS including the three report-card steps; bash scripts/scrub-check.sh PASS; git log unchanged at f8a935c)

## Decisions

- One plan divided into area batches and executed in dependency waves, with count-based bars: docs/decisions/2026-09-18-one-plan-in-dependency-waves-with-count-687f.md.
- A ticked acceptance item must end with its evidence; the generator refuses one that does not, so a bar cannot move on belief.
- The letter grade is history, kept in a dated table; the bar is a count. The card says when they disagree.

## Checkpoints

### 2026-09-18T23:24:53.408Z

- **State:** Wave 0 of the report card plan is built: docs/REPORT_CARD.md with the generated bars (8 of 123 items, every tick with evidence), scripts/report-card.mjs with --apply --check --self-test, scripts/report-card.test.mjs, ten area folders with 40 batch files under docs/areas/, MAINTAIN step 2 bullet, three CI steps, pointers in CLAUDE.md and AUTOPILOT_START_HERE.md, a decision entry filled in. Nothing committed.
- **Evidence:** node scripts/report-card.test.mjs passed 14 checks; --check current; --self-test 7 of 7 caught; docs test 135 files with a Kind label; names check passed; scrub-check PASS; full suite running in the scratchpad
- **Next:** Read the suite result, update the task record, handoff, STATUS; stop before committing and show git status
- **Git:** main @ f8a935c, 61 uncommitted

## Handoff

- **State:** wave 0 built and verified on the tree, uncommitted: the report card, the generator with its test and self-test, ten area folders with 40 batches (8 of 123 acceptance items ticked with evidence), the MAINTAIN bullet, three CI steps, pointers in CLAUDE.md and the start-here index, a decision entry. The card was then shrunk from 178 to 88 lines: it keeps one row per area, and each AREA.md holds its own generated batch table between the report-card markers (self-test 9 of 9, fixture test passed).
- **Next:** the owner decides whether to commit and push; then wave 1 (01-01 install and live use, 04-01 bound context, 04-05 output caps).
- **Blocked:** nothing in wave 0. Wave 1 needs the owner's own session on this machine.
- **Watch out:** after ticking an item, run node scripts/report-card.mjs --apply, or --check fails in CI. A ticked item without (evidence: ...) at the end is refused.
