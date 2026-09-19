# Task: Wave 3: M8 second increment, path everywhere, stack detection

Kind: Living. Task record.

- **ID:** 2026-09-19-wave-3-m8-second-increment-path-everywhe-0619
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-19T05:11:03.546Z

## Request

Okay, get to work (wave 3 per the handoff: 02-01 M8 second increment, 02-02 path everywhere, 02-04 stack detection)

## Acceptance criteria

- [ ] 02-04 items 1 to 3: lib/stack.mjs detects the test command and hotspots, prepare drafts dispatch fields and a delivery draft, tests pass
- [ ] 02-01 items 1 to 4: prepare --apply shows the plan first, delivery confirm moves the draft, task start --request fills the Request section, three repository kinds rehearsed with evidence
- [ ] 02-02 items 1 to 4: the which measurement filed, the .cmd launcher built with a content test, the harness template line rewritten and migrated here
- [ ] Suite, scrub, commit, push, CI green, maintain and handoff

## Decisions

not yet written

## Checkpoints

### 2026-09-19T05:00:59.339Z

- **State:** Wave 3 steps 1 to 4 built: stack detection, prepare drafts dispatch fields and a delivery policy draft with the plan shown before writing, delivery confirm and the gate's draft refusal, task start --request and the rewritten prepare offer
- **Evidence:** node --test scripts/stack.test.mjs 6 of 6; scripts/prepare.test.mjs all pass; scripts/gate.test.mjs 18 of 18; node scripts/delivery.test.mjs 13 of 13; node scripts/lifecycle.test.mjs 38 of 38 after the --request refusal loop fix
- **Next:** Step 5: skilliton.cmd launcher in lib/join.mjs with join tests and docs/WINDOWS.md; then template, rehearsal, docs, suite, commit
- **Git:** main @ 19c6900, 16 uncommitted

### 2026-09-19T05:11:03.546Z

- **State:** Steps 5 to 7 built: join writes skilliton.cmd on win32 with undo (39 join tests pass), the harness template names both measured PATH routes and --request and --handoff (migration 0100 applied here twice), rehearsal K1 node, K2 python, K3 go with N1 no-stack note (12 of 12 PASS, evidence under evidence/rehearsals/2026-09-19-projects), two live PATH evidence files written from a session read and a headless probe that showed the plugin SessionStart hooks
- **Evidence:** node --test scripts/join.test.mjs 39 pass; node scripts/rehearsals/projects.mjs 12 PASS; node scripts/lifecycle.test.mjs 38 pass; claude -p probe stream carried the workflow SessionStart hook events and which -a skilliton listing the join launcher then the plugin bin
- **Next:** Step 8: contracts, DELIVERY.md, backlog, decision entry, batch ticks, report card, plugin 0.10.0, CI and MAINTAIN registration; then step 9 suite, scrub, commit, push, CI read, maintain, handoff
- **Git:** main @ 19c6900, 34 uncommitted

## Handoff

- **State:** Steps 5 to 7 built: join writes skilliton.cmd on win32 with undo (39 join tests pass), the harness template names both measured PATH routes and --request and --handoff (migration 0100 applied here twice), rehearsal K1 node, K2 python, K3 go with N1 no-stack note (12 of 12 PASS, evidence under evidence/rehearsals/2026-09-19-projects), two live PATH evidence files written from a session read and a headless probe that showed the plugin SessionStart hooks. Evidence: node --test scripts/join.test.mjs 39 pass; node scripts/rehearsals/projects.mjs 12 PASS; node scripts/lifecycle.test.mjs 38 pass; claude -p probe stream carried the workflow SessionStart hook events and which -a skilliton listing the join launcher then the plugin bin.
- **Next:** Step 8: contracts, DELIVERY.md, backlog, decision entry, batch ticks, report card, plugin 0.10.0, CI and MAINTAIN registration; then step 9 suite, scrub, commit, push, CI read, maintain, handoff
- **Blocked:** nothing
- **Watch out:** nothing known
