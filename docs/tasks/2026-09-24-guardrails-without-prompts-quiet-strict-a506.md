# Task: Guardrails without prompts: quiet, strict and fleet modes

Kind: Living. Task record.

- **ID:** 2026-09-24-guardrails-without-prompts-quiet-strict-a506
- **State:** in-progress
- **Branch:** lane/quiet-guard-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T16:51:22.588Z

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

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
