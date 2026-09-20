# A test killed by its own timeout is contention until it is re-run on a quiet machine

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-test-killed-by-its-own-timeout-is-cont-3b76
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

The full offline suite reported `security-evidence collectors` failing with `AssertionError: 'SIGTERM' !== null`, on a step that had passed every run before it and whose code had not been touched all session. Read at face value, it says a `skilliton security` invocation was killed. Read as a logic failure, it would have sent the session hunting for a hang in code that did not have one.

## The mechanism

`scripts/security-evidence.test.mjs:59` spawns the CLI with `timeout: 30000` and then asserts `p.signal === null`, which is the right shape for a test: a run that never returns fails loudly instead of hanging the suite. The failure is therefore a wall-clock statement, not a behavioral one. That step took 97.6 seconds in the failing run and 15.4 seconds in the clean one, with the same 52 tests. The difference was the machine: the suite was running in the background while the session ran `living-docs`, `report-card`, `backlog.test` and a record write in the foreground, several of them spawning their own node processes over temporary repositories. One subprocess crossed 30 seconds and was killed.

## The fix

Re-run the step on a quiet machine and read the result, rather than editing the test or raising its timeout. The second full run, with nothing else issued while it ran, was 46 of 46 with `security-evidence` at 15.4 seconds. The timeout stays at 30 seconds, because a real hang has to fail.

## The rule

A failure whose evidence is a signal or a timeout is contention until proved otherwise, and it is proved by one quiet re-run, not by reasoning. The other half of the rule is what caused it: do not run other commands while a suite is running. The suite's whole purpose is a verdict on one tree at one moment, and every command issued beside it both slows it and makes its result harder to trust. A backgrounded suite is a reason to wait, not a licence to work in parallel.

## What now enforces it

Nothing automatic; the honesty rule is what carries it, since the failure mode is reporting a red step as understood without re-running it. `docs/MAINTAIN.md` already requires every gate to be its own step with its exit status read on its own line, and the suite runner in the scratchpad does that; this lesson adds that the run wants the machine to itself. The countervailing risk is real and worth stating: "it was contention" is exactly what a session would say about a genuine flake it did not want to investigate, so the claim is only allowed with both timings named, as they are above.
