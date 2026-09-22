# Task: Maintain runs without a person: skilliton maintain, the stop hook's maintenance rule, instruction migrations at session start

Kind: Living. Task record.

- **ID:** 2026-09-22-maintain-runs-without-a-person-skilliton-873a
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T19:06:56.470Z

## Request

maintain and dispatch must run without anyone invoking them; if it just becomes a manual running skill thing, it's pointless; the harness analyzes what's happening and does the proper procedure

## Acceptance criteria

- [ ] skilliton maintain --apply does the mechanical half (indexes, security findings, a maintain journal event) and is refused off an integration branch or in an unprepared repository
- [ ] the stop hook blocks once per commit on an integration branch when a merge landed, or a day and a commit passed, since the last maintain event, alone or before the checkpoint reminder; off when checkpoints.stopReminder is false
- [ ] on a joined machine a pending instruction migration is applied at session start, said in the block, left uncommitted; a layout migration is only named
- [ ] the harness template says which part is enforced; every prepared project migrates by the same route; lifecycle, footprint, deadcode, lint, docs, names and scrub pass; CI green; installed plugin updated

## Decisions

not yet written

## Checkpoints

### 2026-09-22T19:06:56.470Z

- **State:** Maintain automation shipped (12c6ab2, workflow 0.19.0): skilliton maintain --apply does the mechanical half (indexes, security findings block, a maintain journal event) and is refused off an integration branch or unprepared; the stop hook asks for maintenance once per commit on an integration branch when a merge landed, or a day and a commit passed, since the last maintain event, before the checkpoint reminder or alone; on a joined machine a pending instruction migration is applied at session start and said in the block. The harness template marks that line enforced; migrations 0100-f90ef823c901 and 0100-8412cc379963 applied here and committed, so every prepared repository on this machine migrates itself at its next session start. Installed workflow 0.19.0 at user and project scope. Proven live in a fresh repository: session start applied the pending instruction migration, the stop hook held the session, the assistant ran maintain --apply and wrote the handoff (evidence/live/2026-09-22-maintain-automation-live.md). The B61 task record closed done-local.
- **Evidence:** scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on 12c6ab2; lifecycle.test.mjs 58 of 58; backlog self-test 7 of 7 after stripping a real findings block; gh run 35771268958: 64 steps, 0 not success; skilliton migrate: no migration pending; scrub exit 0; the fixture journal: session-start, maintain-reminded, maintain, checkpoint, session-end
- **Next:** Restart Claude Code so the open sessions load workflow 0.19.0. The dispatch automation through the prompt hook (the stop hook cannot start a skill; the prompt hook can name dispatch when a prompt lists tasks, which it already does at the threshold). Then 1.0.0 through /workflow:release on the owner's go, with the three 2026-09-22 live notes and docs/REPORT_CARD.md as evidence. Owner: restart VS Code, commit the prepared and migrated files in each repository as sessions touch them, keyboard checks, the Usage screen comparison for the 2026-09-21 window. Meeting Wednesday 11:00.
- **Git:** main @ 12c6ab2, 4 uncommitted

## Handoff

- **State:** Maintain automation shipped (12c6ab2, workflow 0.19.0): skilliton maintain --apply does the mechanical half (indexes, security findings block, a maintain journal event) and is refused off an integration branch or unprepared; the stop hook asks for maintenance once per commit on an integration branch when a merge landed, or a day and a commit passed, since the last maintain event, before the checkpoint reminder or alone; on a joined machine a pending instruction migration is applied at session start and said in the block. The harness template marks that line enforced; migrations 0100-f90ef823c901 and 0100-8412cc379963 applied here and committed, so every prepared repository on this machine migrates itself at its next session start. Installed workflow 0.19.0 at user and project scope. Proven live in a fresh repository: session start applied the pending instruction migration, the stop hook held the session, the assistant ran maintain --apply and wrote the handoff (evidence/live/2026-09-22-maintain-automation-live.md). The B61 task record closed done-local. Evidence: scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on 12c6ab2; lifecycle.test.mjs 58 of 58; backlog self-test 7 of 7 after stripping a real findings block; gh run 35771268958: 64 steps, 0 not success; skilliton migrate: no migration pending; scrub exit 0; the fixture journal: session-start, maintain-reminded, maintain, checkpoint, session-end.
- **Next:** Restart Claude Code so the open sessions load workflow 0.19.0. The dispatch automation through the prompt hook (the stop hook cannot start a skill; the prompt hook can name dispatch when a prompt lists tasks, which it already does at the threshold). Then 1.0.0 through /workflow:release on the owner's go, with the three 2026-09-22 live notes and docs/REPORT_CARD.md as evidence. Owner: restart VS Code, commit the prepared and migrated files in each repository as sessions touch them, keyboard checks, the Usage screen comparison for the 2026-09-21 window. Meeting Wednesday 11:00.
- **Blocked:** B53 (where the join file is published); the fifteen applicability decisions (the findings block in docs/BACKLOG.md now lists them); the join --apply half of the clean-machine path and every walkthrough step that needs another machine or a person
- **Watch out:** The stop hook now asks for maintenance after a merge on main, once per commit: run skilliton maintain --apply, then the judgment half, or say why not. Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first. Read the clock before typing a time. A template edit makes a new 0100 migration pending; apply it here in the same commit, and every other prepared repository applies it at its next session start on this machine. Hooks in an open session are the copies loaded at its start: restart after a plugin update. join.mjs is at its pin (603). auto-prepare loads prepare.mjs, join.mjs and migrations.mjs lazily; scripts/footprint.test.mjs lists the three.
