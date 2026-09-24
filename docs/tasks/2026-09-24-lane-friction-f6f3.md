# Task: Lane friction

Kind: Living. Task record.

- **ID:** 2026-09-24-lane-friction-f6f3
- **State:** in-progress
- **Branch:** lane/friction-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T15:59:47.260Z

## Request

LANES.md, dispatched 2026-09-24: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N34. [TOUCH] An edit to a file that was already changed re-arms the stop reminder: lib/journal.mjs fingerprintOf takes HEAD, the porcelain and a content digest of the changed paths (git hash-object on each changed or untracked path from the porcelain, at most 200 paths and files under 8 MB each, a path over either bound contributing its size and mtime instead, and the bound named in the code comment); every caller keeps working; the one-time effect after upgrade (old events' fingerprints never match, so one reminder may repeat once) is named under Run-time behavior; a new scripts/fingerprint-content.test.mjs: editing an already-modified tracked file changes the fingerprint, editing an untracked file changes it, touching nothing does not, and the bounds hold.
- [ ] N35. [TOUCH] A session that ended with changes and no checkpoint is said so at the next start: lib/lifecycle.mjs, where the previous session is described as "ended normally" (line 471 at the base): when that session's last journal events show a dirty tree at its end (its session-end or last stop event carries dirty greater than 0) and it recorded no checkpoint, say "the previous session ended with <n> uncommitted change(s) and no checkpoint: read git status and the open task before carrying on" instead; a session that ended clean or with a checkpoint still reads "ended normally"; cases in a new scripts/previous-session.test.mjs.
- [ ] N36. [TOUCH] A checkpoint written by hand is not silently lost: lib/tasks.mjs and commands/task.mjs: when a task record's Checkpoints section holds text the parser does not read as a checkpoint (a hand-edited entry), task show and the session-start task line say "<n> line(s) under Checkpoints could not be read as checkpoints; record them with skilliton checkpoint" rather than reporting 0 checkpoints with no word; new cases in a new test file.
- [ ] N37. [TOUCH] Closing a task refreshes the tasks index: commands/task.mjs task close --apply regenerates the tasks index (the same writer index --apply uses for tasks) after it writes, and says so on one line; a case in the new test file.
- [ ] N38. [TOUCH] pin on the newest release says so: commands/pin.mjs line 65 at the base suggests pin --release <the release it is already on>; when the clone is already pinned to the newest approved release, print "already on the newest approved release (<version>)" and no Next line; a case in scripts/pin-marketplace.test.mjs or a new file.
- [ ] N39. [TOUCH] verify names a clone and install that disagree: when the skills clone is pinned (the pin record under its git folder) to a release other than the one the installed plugins verify against, verify adds one line "the clone is pinned to <a>, the installed plugins match <b>: run skilliton pin --release <a> --apply to move the install, or pin --latest" and keeps its exit status; a case in a new test file.
- [ ] N40. [TOUCH] doctor outside a git repository says so: commands/doctor.mjs line 229 at the base tells a folder that is not a git repository to prepare the project; say "this folder is not a git repository, so there is nothing to prepare: run doctor inside a repository" there, and print hint commands with absolute paths rather than paths relative to the current folder; cases in the doctor tests or a new file.
- [ ] N41. [TOUCH] The gate's rejection keeps the failing test names: where the delivery gate's rejection prints the tail of a check's output (lib/delivery.mjs), a node --test summary whose "failing tests:" header is followed by the failing test lines keeps those lines (the header alone, with nothing after it, is what a newcomer saw in the demo); if the tail is cut, cut before the header, not after it; a case in scripts/delivery.test.mjs if it may grow, else a new file.
- [ ] N42. [TOUCH] The lane brief bounds a tool call's running time (B87): packs/base/plugins/workflow/runtime/lib/dispatch-brief.mjs is not in this lane: skip this item if the usage lane has not merged; the main window will do it. (Listed so the ledger is whole.)

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
