---
name: make-a-test-fail
description: Use when writing a test, reviewing one, or asked whether a green test or a passing check is actually testing anything. A test that has never been seen to fail has not been tested, so this proves it by breaking the code it covers and watching it go red. Lists the shapes that cannot fail (asserting on a value the test computed, a mock returning what it was told, a swallowed error, an unawaited assertion, a check that exits zero on its own error path) and what to report.
---

Kind: Reference. Not shipped: its eval case could not tell a run with it from a run without it (docs/not-shipped.md). Kept for the record, outside every installable plugin.

# Prove the test can fail

A passing test tells you two things at once and does not say which: the code is right, or the test cannot fail. Until you have watched it go red, you have a green light of unknown wiring.

The proof takes about a minute. **Break the code the test claims to cover, run the test, watch it fail, put the code back.** Then the green means something.

## Do it like this

1. Run the test and record that it passes.
2. Change the code under test so the behavior it asserts is wrong. Invert a comparison, return a constant, drop a line, off by one. One change.
3. Run it again. It must fail, and **the failure must name the thing you broke**. A test that fails for a different reason is passing by accident.
4. Restore the code exactly, and run once more to get back to green.
5. Say in your report what you broke, what you expected, and what you saw.

If it stays green under the mutation, the test is the bug. Fix the test first, then go back to the code.

## The shapes that cannot fail

Recognize these on sight, in your own tests and in review.

- **Asserting on a value the test computed.** `assert(total === sum(items))` where `sum` is the function under test compares it with itself and passes whatever it returns. The expected value has to be written independently, by hand, in the test.
- **Asserting on a mock.** A stub was told to return `42` and the test checks it returned `42`. That tests the stub.
- **A type or truthiness check standing in for a value check.** `typeof result === "number"`, `assert(result)`, `expect(x).toBeDefined()`. Every wrong answer of the right shape passes.
- **A swallowed failure.** An assertion inside a `try` whose `catch` logs and moves on. An `it` that returns before its assertions. A `for` loop over a list that turned out empty, with every assertion inside it.
- **An assertion nobody waited for.** An async assertion without `await`, a promise not returned, a callback the runner never called. The test finishes green before the check runs.
- **A snapshot written from today's output.** It asserts that the code still does what it did when you pressed record, including the bug.
- **A check that reports instead of failing.** A script that prints findings and exits zero, a workflow step with a continuing-on-error setting, a linter whose rule is set to warn. The pipeline is green by construction. This is the same failure wearing a build badge.

## For a gate, a hook or a script

A check that guards something is a test of the same kind and earns the same proof. Give it a self test that plants each failure it is supposed to catch and asserts it goes red, and **read the exit status, not the output text**. Grepping the output for the word "error" passes the day a message is reworded.

Run the self test in the same place the gate runs. A gate proved on your machine and never watched refusing in the pipeline is a gate with an untested half.

## What to report

The mutation you made, in one line. The result you expected. The result you got. If you did not run the mutation, say that instead of implying it, because "this test covers the discount logic" and "I watched this test fail when I broke the discount logic" are different claims and only one of them is evidence.
