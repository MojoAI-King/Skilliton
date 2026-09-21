# A file_exists grader watches the run's own file operations, not the workspace

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-file-exists-grader-watches-the-run-s-o-4d8a
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

`live-handler-kept`, the trap grader of the dead-code eval case, scored **0 of 3 in both arms**: the arm with the skill and the arm without it. It asks the question the case exists to ask, which is whether a cleanup run deleted a handler that is genuinely live. The file it checks, `handlers/webhook.js`, was present in **all six** kept scaffold trees, so the right answer was 3 of 3 in both arms.

A grader that fails identically in both arms measures nothing. It cannot separate a run that did the right thing from a run that did the wrong thing, and it had been sitting in the middle of the case looking like its most important assertion.

## The mechanism

`file_exists` reads the **run's own file operations**, not the workspace on disk. Measured with three throwaway probe cases rather than reasoned about:

- a file the run created reads as present;
- a file the run deleted reads as absent;
- a file the fixture wrote and the run correctly left alone reads as **MISSING**.

Path spelling is not the variable. Plain, glob, globstar, dot-prefixed and subdirectory forms all failed alike on an untouched file, so the hours that would have gone into trying spellings would have found nothing. The client's own warning names the rule when no write tool is granted, which is the tell.

A `regex` grader with `target: { source: file, path: ... }` reads the real workspace instead, at any depth, including files the run never touched. It also has teeth rather than passing vacuously: when the target file has been deleted, the grader throws and scores zero, which is exactly the trap firing.

So the grader's vocabulary is narrower than its name suggests. `file_exists` can ask **did the run create this** and **did the run delete this**. It cannot ask **did this survive**, and survival was the whole question.

## The fix

`live-handler-kept` is now a `regex` grader over `handlers/webhook.js`, and its prose says why in the file, so a later reader does not simplify it back to the shorter-looking form.

The gap that let it through was the packaging gate: it had nothing at all to say about graders. `scripts/packs.test.mjs` now refuses any `file_exists` grader that asks `exists: true` about a path its own `fixture.sh` already creates, which is the exact shape of a grader that can only ever fail. A self-test case proves the check can fail.

The other `file_exists` grader in this repository, workflow's `record-created`, was re-read against the same rule and is correct: it asks whether the run created a task record, and its fixture does not pre-create one.

## The rule

Before a grader is believed, say in one sentence which of the two arms it is supposed to separate, and confirm the arms actually differ on it. A grader with the same score in both arms is reporting a defect in itself, not a result, whichever direction it points: 0 and 0 is as empty as 3 and 3.

When a grader's behavior is not obvious from its name, measure it with a throwaway probe case rather than guessing; three probes settled this one for 33 cents, and the guess that path spelling was the variable would have cost more than that and been wrong.

## What now enforces it

The new eval-case checks in `scripts/packs.test.mjs`, with their self-test cases, catch the specific shape (a `file_exists exists: true` over a fixture-created path). Nothing automatic catches the general case of a grader that cannot separate the arms, because that is a property of a scored run rather than of a file; the both-arms reading is done by hand when a result is read, and [[2026-09-21-the-tool-said-so-on-its-second-line-and-0a35]] is the half of this that no gate replaces.
