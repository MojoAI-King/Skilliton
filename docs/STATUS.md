# Project status

Kind: Living.

Current state (2026-09-20, wave 4 published as 7af3b80): the owner graded the repository against their ten areas on 2026-09-18 (overall C+; docs/REPORT_CARD.md, bars from the batch files under docs/areas/, the owner pass at its end; 45 of 123 items ticked). Wave 4 (workflow 0.11.0) built the dispatch half of the loop: `skilliton dispatch` turns a lane plan into one Git worktree per lane with a brief that bounds it, refusing rather than reusing anything, and three agents (`lane`, `locate`, `verify-item`) ship with the plugin. The VS Code extension has a measured column in docs/CLIENTS.md. Two things are recorded and not explained: no real dispatch has ever been run, and this repository's sessions compact nowhere near the 600000 window the settings name. Next: wave 5 from the report card. Milestone by milestone: the table below. What each open item needs: docs/BACKLOG.md and DECISIONS.md. Claims with evidence: docs/POSITIONING.md. Earlier versions: docs/STATUS_ARCHIVE.md.

<!-- living-docs:milestones:start -->

Written by `node scripts/living-docs.mjs --apply` from PLAN.md section 7 (the milestone table with its acceptance and evidence). PLAN.md is the file to edit; this table is the short view of it. State is the leading phrase of PLAN.md's State cell; Open items are the backlog and open-item IDs that cell names.

| ID | Milestone | State | Open items |
|---|---|---|---|
| M0 | Shared direction | Done | none |
| M1 | One prepared repository | Verified locally | none |
| M2 | Normal-work continuity | Verified on Claude Code | O6, O9 |
| M3 | Approved company updates | Verified at install level | O8 |
| M4 | Security and shared delivery | Verified locally | O15 |
| M5 | Beginner/team rehearsal | Not started: needs a real person | O16 |
| M6 | Make it yours | Verified locally | none |
| M7 | One command per machine | Verified locally | B6 |
| M8 | Autopilot on arrival | Second increment built 2026-09-19 | B2, B3, B13 |
| M9 | One name | Verified locally | none |
| M10 | Security audit that runs itself | Not started | B20 |
| M11 | Routines while working | Not started | B21 |
| M12 | Enrollment through device management | Spike measured on Linux | B22, B29, B30 |
| M13 | Any AI coding tool | Not started | B23, O24 |
| M14 | Proof of value and team view | Not started | B15, B16 |

<!-- living-docs:milestones:end -->

This repository was prepared by its own runtime on 2026-09-16 (layout 2): every existing living document was adopted untouched, the roadmap role points at PLAN.md, and the security register starts with all 15 controls undecided, because applicability is the owner's decision.

Read `docs/HANDOFF.md` for the next step and `docs/BACKLOG.md` for outstanding work. Keep branch-complete, merged, deployed and verified separate; one task's result does not make the whole project complete.

## Open tasks

<!-- skilliton:index:tasks:start -->
Open tasks in `docs/tasks/` (every state except done-local, merged, released, verified and abandoned), sorted by ID. `skilliton index` writes this list from the task records; edit the task records, not the list.

| ID | Title | State | Branch | Owner | Updated |
|---|---|---|---|---|---|
| [2026-09-20-wave-4-the-dispatch-command-subagent-hyg-0fa2](tasks/2026-09-20-wave-4-the-dispatch-command-subagent-hyg-0fa2.md) | Wave 4: the dispatch command, subagent hygiene, the VS Code extension column | in-progress | main | unassigned | 2026-09-20T05:12:31.155Z |
<!-- skilliton:index:tasks:end -->
