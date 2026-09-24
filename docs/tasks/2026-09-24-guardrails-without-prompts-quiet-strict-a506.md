# Task: Guardrails without prompts: quiet, strict and fleet modes

Kind: Living. Task record.

- **ID:** 2026-09-24-guardrails-without-prompts-quiet-strict-a506
- **State:** in-progress
- **Branch:** lane/quiet-guard-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T19:52:48.478Z

## Request

We need to reorganize how the guardrails work, because people will not use this if it requires being at the computer approving tool and command requests all day, and worrying whether it is even running or stalled.

## Acceptance criteria

- [ ] Q1: guardrails.mode (quiet default, strict, fleet) is read from .skilliton/config.json and SKILLITON_GUARDRAILS_MODE, the stricter source wins, an invalid value falls back to strict and says so
- [ ] Q2: every ask site in guard-bash.sh carries one kind (lose-work, drop-saved, opaque, unresolved, hook-skip, settings, guard-degraded) and a test fails on an ask without one
- [ ] Q3: in quiet and fleet modes no command is ever answered with ask; run-and-note prints no decision (never permissionDecision allow); the mapping table holds for each kind
- [ ] Q4: a command that throws away work runs when nothing would be lost and is otherwise refused with the save-first fix; a dropped stash or deleted branch is noted with its commit and the restore command
- [ ] Q5: notes go to the project's git dir skilliton/guardrails.jsonl with time, mode, kind, reason and program name, never command text; the guardrails session start reports them by kind
- [ ] Q6: the five existing guard suites pass unchanged in strict mode; a new modes suite covers every kind in quiet and fleet, with mutants applied alone and recorded case by case; the timing suite stays green
- [ ] Q7: the 2026-09-24 confirmations replayed through the new hook ask nobody in quiet or fleet mode; counts per answer reported; no command text printed, written or committed
- [ ] Q8: the guardrails skill and hook header describe the four answers and three modes; guardrails plugin.json 0.12.0; proposed wording for main-only files in LANE_REPORT.md

## Decisions

not yet written

## Checkpoints

### 2026-09-24T19:21:41.051Z

- **State:** Guard, skill, plugin.json 0.12.0, five suite pins and the new modes suite written, all uncommitted; guardrails.mode quiet/strict/fleet works: the shipped suites pass as shipped (main 670, review 224, review2 163, timing 16, bypass exit 0), the modes suite 59 of 60 with one stale expectation in its fleet section; replay of 189 asks: 13 ask, 33 fix, 143 noted
- **Evidence:** bash scripts/guardrails.test.sh and the four others, logs in the session scratchpad; bash scripts/guardrails-modes.test.sh: 1 FAIL (test line), 59 ok; scrub-check PASS
- **Next:** Owner runs the scratchpad's finish-lane.py (two edits the client's auto-mode check refused twice), then the modes suite, then commit; the two cp lines put the guard on this machine now; main-only docs at merge
- **Git:** lane/quiet-guard-0924 @ 38a22ad, 9 uncommitted

### 2026-09-24T19:31:40.550Z

- **State:** Installed on this machine by the owner: both plugin caches hold the lane's guard, quiet mode live (an eval ran with no dialog and was noted). Lane still uncommitted (12 paths): the owner ran finish-lane.py, which fixed the fleet test expectation and the skill's defaults JSON; the proposed decision and lesson entries are written; the modes suite run and the commit are the owner's next two commands
- **Evidence:** Shipped suites as shipped: guardrails.test.sh 670 ok, bypass 144 (wrapping review 224 and review2 163), timing 16; modes suite 59 of 60 before finish-lane.py, rerun pending; scrub-check PASS; notes file in the main checkout's git dir holds three lines, none with command text
- **Next:** Owner: bash scripts/guardrails-modes.test.sh (expect PASS 60), then git add -A and commit; then the lane merges like the others and main takes CHANGELOG, CONTRACTS, the decision index and the harness template's confirmation sentence
- **Git:** lane/quiet-guard-0924 @ 38a22ad, 12 uncommitted

### 2026-09-24T19:52:48.478Z

- **State:** Lane committed: 2ba2a2f (the owner's terminal: guard, skill, plugin.json 0.12.0, five suite pins, modes suite, proposed decision and lesson) and ba2067d (the modes suite closes stdin on its session-start calls, which hung in a terminal). Installed live on this machine over both plugin caches. Met: Q1, Q3, Q5 (notes); partial: Q2 (sorted by reason text, no per-site kind), Q4 (dropped stash or branch still asks), Q6 (no mutants), Q7 (replay from the scratchpad), Q8 (main-only wording in LANE_REPORT.md)
- **Evidence:** Five shipped suites as shipped: 670, 144 (wrapping 224 and 163), 224, 163, 16; modes suite 61 under Claude Code's shell and under a pseudo-terminal; the pre-fix copy hung at the session-start section until a 75 s alarm; scrub-check PASS before each commit; replay of 189 asks: 13 ask, 33 fix, 143 noted
- **Next:** Merge like the other lanes (rebase on main, the five suites plus the modes suite, ff-only, push); main then takes CHANGELOG, CONTRACTS, the two indexes, README and INSTALL, and the harness template's confirmation sentence
- **Git:** lane/quiet-guard-0924 @ ba2067d, 0 uncommitted

## Handoff

- **State:** Lane committed: 2ba2a2f (the owner's terminal: guard, skill, plugin.json 0.12.0, five suite pins, modes suite, proposed decision and lesson) and ba2067d (the modes suite closes stdin on its session-start calls, which hung in a terminal). Installed live on this machine over both plugin caches. Met: Q1, Q3, Q5 (notes); partial: Q2 (sorted by reason text, no per-site kind), Q4 (dropped stash or branch still asks), Q6 (no mutants), Q7 (replay from the scratchpad), Q8 (main-only wording in LANE_REPORT.md). Evidence: Five shipped suites as shipped: 670, 144 (wrapping 224 and 163), 224, 163, 16; modes suite 61 under Claude Code's shell and under a pseudo-terminal; the pre-fix copy hung at the session-start section until a 75 s alarm; scrub-check PASS before each commit; replay of 189 asks: 13 ask, 33 fix, 143 noted.
- **Next:** Merge like the other lanes (rebase on main, the five suites plus the modes suite, ff-only, push); main then takes CHANGELOG, CONTRACTS, the two indexes, README and INSTALL, and the harness template's confirmation sentence
- **Blocked:** nothing
- **Watch out:** nothing known
