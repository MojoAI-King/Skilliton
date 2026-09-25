# Project status

Kind: Living.

Current state (2026-09-25, release 1.4.3 at 6ae2b20): four signed releases on 2026-09-24, each in CHANGELOG.md with its evidence note under evidence/live/. 1.4.3 carries the guard's quiet mode (guardrails 0.12.0): nothing asks during work except before a rule is turned off or saved work is dropped; a command it can make readable is refused with the fix, one it cannot read runs and is noted in the git folder; `guardrails.mode: strict` asks every time. At 6ae2b20: full checks 114 pass, 0 fail, 2 skipped of 116; CI green; 9 releases approved in a fresh clone; all 8 plugin installs on this machine VERIFIED; security 7 of 13 current and observed. Next: the owner pass (docs/OWNER_WALKTHROUGH.md); open items in docs/BACKLOG.md. Earlier: docs/STATUS_ARCHIVE.md.

<!-- living-docs:milestones:start -->

Written by `node scripts/living-docs.mjs --apply` from PLAN.md section 7 (the milestone table with its acceptance and evidence). PLAN.md is the file to edit; this table is the short view of it. State is the leading phrase of PLAN.md's State cell; Open items are the backlog and open-item IDs that cell names.

| ID | Milestone | State | Open items |
|---|---|---|---|
| M0 | Shared direction | Done | none |
| M1 | One prepared repository | Verified locally | none |
| M2 | Normal-work continuity | Verified on Claude Code | O9 |
| M3 | Approved company updates | Verified at install level | O8 |
| M4 | Security and shared delivery | Verified locally and on a hosted repository | none |
| M5 | Beginner/team rehearsal | Not started: needs a real person | O16 |
| M6 | Make it yours | Verified locally | none |
| M7 | One command per machine | Verified locally | none |
| M8 | Autopilot on arrival | Second increment built 2026-09-19 | B2 |
| M9 | One name | Verified locally | none |
| M10 | Security audit that runs itself | Three of its six parts built 2026-09-20 | B17, B45 |
| M11 | Routines while working | Two of three routines built 2026-09-20 | B21 |
| M12 | Enrollment through device management | Spike measured on Linux | B22, B29, B30, B79, B80 |
| M13 | Any AI coding tool | Not started | B23, O24 |
| M14 | Proof of value and team view | Started: first comparison run 2026-09-22 | B15, B16 |

<!-- living-docs:milestones:end -->

This repository was prepared by its own runtime on 2026-09-16 (layout 2): every existing living document was adopted untouched, the roadmap role points at PLAN.md, and the security register starts with all 15 controls undecided, because applicability is the owner's decision.

Read `docs/HANDOFF.md` for the next step and `docs/BACKLOG.md` for outstanding work. Keep branch-complete, merged, deployed and verified separate; one task's result does not make the whole project complete.

## Open tasks

<!-- skilliton:index:tasks:start -->
Open tasks in `docs/tasks/` (every state except done-local, merged, released, verified and abandoned), sorted by ID. `skilliton index` writes this list from the task records; edit the task records, not the list.

| ID | Title | State | Branch | Owner |
|---|---|---|---|---|
| [2026-09-23-everything-a-session-can-finish-the-usag-b6c7](tasks/2026-09-23-everything-a-session-can-finish-the-usag-b6c7.md) | Everything a session can finish: the usage batch, the open backlog rows and the security records | in-progress | main | unassigned |
| [2026-09-25-compliance-in-skilliton-frameworks-as-da-3e50](tasks/2026-09-25-compliance-in-skilliton-frameworks-as-da-3e50.md) | Compliance in Skilliton: frameworks as data, detection with a named confirmation, the control sheet from existing evidence | in-progress | main | unassigned |
| [2026-09-25-lane-compliance-runtime-66a1](tasks/2026-09-25-lane-compliance-runtime-66a1.md) | Lane compliance-runtime | in-progress | lane/compliance-runtime-0925 | unassigned |
| [2026-09-25-lane-compliance-skill-36f4](tasks/2026-09-25-lane-compliance-skill-36f4.md) | Lane compliance-skill | in-progress | lane/compliance-skill-0925 | unassigned |
| [2026-09-25-lane-frameworks-data-98cd](tasks/2026-09-25-lane-frameworks-data-98cd.md) | Lane frameworks-data | in-progress | lane/frameworks-data-0925 | unassigned |
| [2026-09-25-lane-security-json-f6ad](tasks/2026-09-25-lane-security-json-f6ad.md) | Lane security-json | in-progress | lane/security-json-0925 | unassigned |
<!-- skilliton:index:tasks:end -->
