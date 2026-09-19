# Records are written at checkpoint time; maintain reconciles

Kind: Living. Decision entry.

- **ID:** 2026-09-19-records-are-written-at-checkpoint-time-m-554d
- **Status:** accepted
- **Date:** 2026-09-19

## Decision

The mechanical parts of the end-of-day maintain move into `skilliton checkpoint` (workflow 0.9.0), and the maintain skill's steps for them become checks. Every `checkpoint --apply` now rewrites the task record's `## Handoff` four bullets in the same write as the checkpoint, and on an integration branch regenerates the indexes as `skilliton index --apply` would. A new `--handoff` flag, on an integration branch, rewrites the `## RESUME HERE` block of `docs/HANDOFF.md` from the checkpoint text: `Written:` from the clock, State with the evidence folded in, Next, Blocked and Watch out (the last two carried over from the previous note when not given, each carry-over printed), and a Git line; the previous block moves to the top of `## Earlier`, five entries stay there, and the rest move to the top of `docs/HANDOFF_ARCHIVE.md`, created from the record template when missing. Off an integration branch the flag writes the task record only and says so. The judgment parts stay with the maintain skill: new decisions and lessons as entry files, the current-state paragraph of `docs/STATUS.md`, and the backlog rows. Its handoff step now reads: compare the block's Written time with the git log and write one more checkpoint only when the block is behind.

Refusals write nothing (exit 2): a handoff whose Written time is later than the clock by more than five minutes (the skew `status` already reports), no `## RESUME HERE`, no `Written:` line, a Written value the zone table cannot read, and on every checkpoint a task record whose Updated is ahead of the clock by the same skew. The order of writes is fixed: task record, then shared handoff and archive in one transaction, then indexes in their own, then the journal; a failure after the task record was written prints what stands and what to run.

The harness template's line about the stop hook and checkpoints is not edited in this wave, because a template change makes migration 0100 pending in every prepared project, this one included, and the handoff skill already routes to the flag. Editing it is a follow-up for the next wave that changes the template anyway.

## Why

The owner reported on 2026-09-18 that the end-of-session maintain costs 5 to 10 minutes each time (backlog B35), because the handoff block, the task handoff and the indexes were written from scratch at the end, by the assistant, from memory of the session. Those three are mechanical: their content is the checkpoint text and the git state, and a program can write them at the moment the facts are known. Lessons, decisions and the status paragraph are not: they need someone to decide what mattered. Splitting the two lets the mechanical part run as many times a day as there are checkpoints, and leaves the end-of-day step a reconciliation. The Written time also stops being typed: two earlier notes carried times about ninety minutes ahead of the clock (lesson 95ba, backlog B25), which hid staleness from `status`; a time read from the clock by the command cannot do that, and the refusal on a Written ahead of the clock means the command never overwrites a note that is newer than the machine thinks now.

## Alternatives rejected

- A separate `skilliton handoff` command: rejected, because the handoff is the checkpoint's own text and a second command means the two drift; one command, one flag.
- Writing the shared handoff on every branch: rejected, because two branches writing one file is how one note overwrites the other; the branch decides, as the skills already said.
- Rewriting `docs/HANDOFF.md` whole from a template: rejected, because people add sections to it; the writer parses the two managed sections and leaves everything else byte for byte (the parser round-trips this repository's file unchanged).
- Moving lessons and decisions into checkpoint as well: rejected, because they need judgment, and a checkpoint that asks for them every time is a ritual again.
- Editing the harness template line in this wave: rejected for now, because it makes a migration pending in every prepared project for one sentence.

## Risk

The Written format depends on the reader's zone table: a machine whose local zone abbreviation is not in the table writes ISO with a Z suffix, which the reader accepts, so nothing breaks, but the note reads less naturally there. The minutes the owner saves are not measured: 01-02 item 5 and 05-05 stay open until the owner times one day before and one after, and until then nothing here is a time or cost claim. A checkpoint on an integration branch now writes the indexes too, so a project with a hand-edited index sees a larger diff at the first checkpoint; the preview shows it. A task record edited by hand with an Updated in the future is refused rather than repaired; the message names the line.

## Reversibility

The command keeps working without `--handoff` and without `--blocked` or `--watch-out`; a project that prefers the by-hand note keeps the skill's section 3 layout, which is unchanged. Reverting is one plugin version and the two skill paragraphs. What would change it: the owner's before-and-after minutes showing no difference, or a second writer of the shared handoff appearing (the companion multiplayer project), which would need a lock the command does not have.

## Evidence

- `packs/base/plugins/workflow/runtime/lib/handoff.mjs`, `runtime/commands/checkpoint.mjs`, `runtime/lib/tasks.mjs` (`rewriteHandoffSection`), `runtime/lib/records.mjs` (index overlay); workflow plugin 0.9.0.
- `scripts/handoff-write.test.mjs` (7 tests) and `scripts/lifecycle.test.mjs` (38 tests: the round-trip on main, carry-over, rotation into a created archive, the branch case, the five refusals with nothing written, the index side effect, the skip messages, and a mutation check that removes the skew bound), both passing 2026-09-19.
- The first live use: this wave's own handoff, written by `skilliton checkpoint --handoff --apply` on main and read back by `skilliton status` (docs/HANDOFF.md).
- docs/CONTRACTS.md section 3 and 11; the handoff and maintain skills; docs/MAINTAIN.md step 6; docs/BACKLOG.md B35 (half done, the minutes pending).
