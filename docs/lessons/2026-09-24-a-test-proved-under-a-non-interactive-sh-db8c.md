# A test proved under a non-interactive shell is not proved for a terminal

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-a-test-proved-under-a-non-interactive-sh-db8c
- **Status:** accepted
- **Date:** 2026-09-24

## What broke

The new modes suite passed twice under the assistant's shell, was handed to the owner to run before committing, and sat on the owner's screen for 21 minutes with no output. The owner read it as the tool hanging.

## The mechanism

The suite's last section runs the hook's session-start check, which reads its input from stdin. Under the assistant's shell stdin is not a terminal and the read returns at once; in the owner's terminal stdin is the terminal, nobody types, and the read waits forever. The suite was piped through `tail -1`, so nothing at all appeared until the end that never came.

## The fix

Commit ba2067d on lane/quiet-guard-0924: `</dev/null` on both session-start calls, with a comment saying why. The hang was reproduced under a pseudo-terminal (`script -q /dev/null`, stdin held open, killed by an alarm at 75 s) and the fixed suite passed under the same pseudo-terminal, 61 checks.

## The rule

A test that runs anything which reads stdin closes it, and a test is not called green until it has run once under a terminal (a pseudo-terminal is enough) as well as under the shell that wrote it. When a person is asked to run a check, it is run the way they will run it first.

## What now enforces it

Nothing yet. The other guardrails suites already redirect stdin on every hook call, which is why they never hung; a check that greps each suite for a hook call without a stdin redirection would make this a rule rather than a memory.
