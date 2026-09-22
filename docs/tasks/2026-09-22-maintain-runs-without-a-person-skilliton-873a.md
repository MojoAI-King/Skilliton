# Task: Maintain runs without a person: skilliton maintain, the stop hook's maintenance rule, instruction migrations at session start

Kind: Living. Task record.

- **ID:** 2026-09-22-maintain-runs-without-a-person-skilliton-873a
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T18:57:29.806Z

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

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
