# A patch that aborts leaves the file unchanged, and a self-test nobody wrote still passes

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-patch-that-aborts-leaves-the-file-unch-910d
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

A review found that the rule refusing `bash -s` and `sh -` had no test at all: disabling it left every checker
green. The self-test cases for it had been written in the previous round, in a script that edited the file in four
places. The first edit did not match, the script stopped with an assertion, nothing was written, and the run that
followed printed a passing self-test with the old case count, which read as success.

## The mechanism

A patch script that edits several places and asserts on each one leaves the file untouched when an early assertion
fails, and a test suite that reports "42 cases passed" says nothing about how many cases there should be. The number
was in the output of every run before and after, and it did not change, which is exactly what nobody looks at.

## The fix

The four cases were written again and the count went from 42 to 46, and then to 49 with the rules from the tenth
round. Every self-test case added since is followed by a run whose case count is read, not just its colour.

## The rule

After a scripted edit, read the file back or read a number that must have changed. A silent no-op is the failure
mode of every multi-part patch, and the report that follows it is the one most likely to be believed, because
nothing looks broken. When adding a test, the proof that it exists is the count going up; when adding a rule, the
proof that it works is reverting it and watching something go red.

## What now enforces it

`node scripts/allowlist.test.mjs --self-test` prints the number of cases (49), and `scripts/footprint.test.mjs`
does the same (34). A case that was not written shows as a count that did not move. Nothing enforces the reading of
it, which is why it is written here.
