# A test that proves an attack is prevented needs its positive control in the same run

Kind: Living. Lesson entry.

- **ID:** 2026-09-17-a-test-that-proves-an-attack-is-prevente-af61
- **Status:** accepted
- **Date:** 2026-09-17

## What broke

A review showed that a repository's own `.git/config` could make `skilliton preflight`'s reachability check run a
command of the repository author's choosing. While fixing it, the first confirmation run looked perfect: the marker
file the attack would have created was not there. It was not there because the trap had not been set correctly (git's
`ext::` transport escapes a space as `% `, not `%20`), so the check proved nothing. The same shape appeared again in a
test fixture whose stand-in programs were dangling symlinks: every program was reported missing, and the product looked
broken when the fixture was.

## The mechanism

An absence has two causes that look identical: the guard worked, or the thing that was meant to happen never could.
A test whose pass condition is "nothing happened" therefore proves nothing on its own, and it degrades quietly: the day
the fixture stops arming the trap, the test still passes.

## The fix

Every attack test in `scripts/preflight.test.mjs` sets the trap, runs plain git in the same folder first, and asserts
the attack DID fire, before running the check and asserting it did not. `scripts/git-config.test.mjs` opens with the
same control for a repository-configured fsmonitor program.

## The rule

A test that asserts an absence carries, in the same run, a control that produces the presence. Where the control
cannot run in the same test, the test says so in its name and its message, and is not counted as coverage.

## What now enforces it

The control assertions themselves, each with the message "the fixture did not ... so this case would prove nothing":
`scripts/preflight.test.mjs` (both git configuration attacks) and `scripts/git-config.test.mjs` (the first case).
