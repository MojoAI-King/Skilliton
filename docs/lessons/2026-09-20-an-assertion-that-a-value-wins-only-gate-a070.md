# An assertion that a value wins only gates when the fixture makes the two values differ

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-an-assertion-that-a-value-wins-only-gate-a070
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

Nothing, visibly, which is the point. A new dispatch test asserted that a lane's own model from `LANES.md` reaches the launch line in its brief, in preference to the model the shipped agent definition declares. The test passed. A mutation that deleted the rule it was meant to prove, replacing the lane's model with the definition's on the command line, also passed: 22 of 22 both ways. The assertion had been green from the moment it was written and would have stayed green if the behavior it named had never been built.

## The mechanism

The reviews lane in the fixture declares `model: sonnet`, and `agents/lane.md` also declares `model: sonnet`. An assertion of the form "A wins over B" is a tautology whenever the fixture sets A equal to B. The test was reading the value it expected out of the same string either path produced, so the two code paths were indistinguishable to it. Nothing about the assertion's wording betrayed this: it named the lane, the flag and the value, and every one of those was correct.

## The fix

Two changes in `scripts/dispatch.test.mjs`. The launch-line assertion moved to the second fixture lane, billing, whose `LANES.md` declares `model: opus` while the definition declares sonnet, so the two paths now print different text. And the test asserts the difference it depends on, rather than assuming the fixture keeps it: `assert.notEqual(model, "opus", "the fixture only proves the lane's model wins while it differs from the definition's")`, where `model` is read out of `agents/lane.md` at run time. If someone later changes the shipped agent to opus, that line fails and says why, instead of the launch assertion going quietly tautological again.

## The rule

An assertion that one source of a value beats another proves nothing unless the fixture makes the two sources disagree, and the test must assert the disagreement rather than rely on it. Before believing any new assertion, mutate the line it is about and watch it go red; a test written in the same session as the code it covers has never been observed failing, and an unobserved failure is an assumption.

## What now enforces it

Nothing automatic, and there is no obvious way to automate it: no checker can tell which equal values in a fixture were meant to be different. What exists is practice. Every assertion added in wave 5 was mutation-checked before it was believed, and the two mutations for this one are recorded in the batch evidence (the definition never loading, 2 failures; the lane's model ignored, 1 failure after the fix and 0 before it). `scripts/fixtures/README.md` records the same discipline for the meter's fixtures, naming each mutation and the exact numbers it produces.
