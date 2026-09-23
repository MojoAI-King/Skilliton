# Task: Lane gate-and-tasks

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-gate-and-tasks-a44a
- **State:** in-progress
- **Branch:** lane/gate-and-tasks-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T07:00:49.645Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N68. [FEATURE] The gate's verdict separates the change from the machine (field report N57, backlog B77): packs/base/plugins/workflow/runtime/lib/gate.mjs and commands/gate.mjs (197 and its command file), a new test file: done when a failing run's verdict adds, after the existing lines, what it can measure without guessing: the untracked files in the working tree when the run started (count and up to five paths), the tracked files changed against HEAD (count and up to five), the one-minute load average from os.loadavg() with the CPU count (not on Windows, where it is always zero; say "not measured on Windows"), and the sentence "a failure in a file outside these lists may come from the machine or another session, not the change"; a passing run's verdict is unchanged; nothing is printed that the gate did not measure; tests cover a failing run in a fixture with an untracked file and a clean passing run.
- [ ] N69. [TOUCH] A task that has grown past its start is noticed when a checkpoint is written (field report N53, backlog B74): packs/base/plugins/workflow/runtime/commands/checkpoint.mjs and lib/tasks.mjs if a helper belongs there, a new test file: done when `checkpoint --apply` prints one note, never blocking, when the task record already holds 15 or more checkpoints or its first checkpoint is more than 24 hours old: "This task has <n> checkpoints since <date>. If the work has moved on from its criteria, close it (skilliton task done or its equivalent) and start one per new piece of work: skilliton task start ..." with the real command names from `node scripts/skilliton.mjs task --help`; the note is not printed below both limits; the record's contents are unchanged by the note.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
