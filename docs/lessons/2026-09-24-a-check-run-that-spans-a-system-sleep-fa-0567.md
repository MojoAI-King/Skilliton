# A check run that spans a system sleep fails steps that are not broken

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-a-check-run-that-spans-a-system-sleep-fa-0567
- **Status:** accepted
- **Date:** 2026-09-24

## What broke

The full check run on the 1.4.1 release commit (52b24f8), started at 18:27 with nothing holding the machine awake, failed two steps: machine setup with join and undo (`scripts/join.test.mjs`, one test took 1,039 s and its `join --apply` exited 3 where 1 was expected) and verify naming a pinned clone (`scripts/verify-pin.test.mjs`, one test took 968 s and verify exited 2 where 0 was expected). Each passed alone in about 3 s.

## The mechanism

The Mac was idle on power and went into system sleep at 19:07:26 and again at 19:25:32 (`pmset -g log`: "Entering Sleep state due to 'Sleep Service Back to Sleep'"), with dark wakes at 19:24:47 and 19:41:40; the two failing tests' windows each spanned one of those sleeps. How a sleep turned into those exit codes is not known: neither test prints the command's own output when its exit code is wrong. The same tree passed 110 of 112 (2 CI-only skips) when run again under `caffeinate -ims`, with no sleep logged while it ran.

## The fix

workflow 0.25.2, `packs/base/plugins/workflow/runtime/lib/awake.mjs`: `holdAwake` starts `/usr/bin/caffeinate -i -m -s -w <pid>` for the run and `release()` stops it at the end; `sleptBetween` reads `pmset -g log` for a failing step and `sleepLine` says when the machine slept inside it. `scripts/checks.mjs` and `skilliton gate` (`lib/gate.mjs` runGate) use both and print on their first line whether anything holds the machine awake.

## The rule

A long run that is meant to be left alone holds the machine awake from inside the runner, not from a step a person remembers; a step that failed in a window the power log shows asleep is run again awake before anyone reads it as a code failure.

## What now enforces it

`scripts/awake.test.mjs` in CI (6 tests: the power log parser on the real line format, caffeinate seen running for the named pid, exiting with it and stopped by release(), a failing gate run reading the power log and a passing one not, the runner's first line). Nothing makes a test print its command's output on a wrong exit code; that is judgment at review.
