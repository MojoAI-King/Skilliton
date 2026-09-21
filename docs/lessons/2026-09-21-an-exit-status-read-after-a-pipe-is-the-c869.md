# An exit status read after a pipe is the pipe's, so every gate reported success

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-an-exit-status-read-after-a-pipe-is-the-c869
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

During the wave 8 maintain pass, each gate was run as `node scripts/<gate>.mjs 2>&1 | tail -2; echo "exit $?"` and each one reported `exit 0`. Five gates were read that way and all five were believed.

`$?` after a pipeline is the exit status of the **last command in it**, which was `tail`. `tail` succeeds whenever it can read its input, so the number printed was a statement that `tail` worked. Every gate would have printed `exit 0` in exactly the same way had it failed, and the session would have committed on it.

The gates were in fact green, which is the uncomfortable part: the report was right by luck and the method was worthless. Re-run unpiped, 19 of 19 passed with the status taken from each gate.

## The mechanism

Two independent errors in one line, and either alone is enough.

1. **`$?` after a pipeline is the last stage's status.** In both bash and zsh this is the defined behavior, not a quirk. Reaching the real status needs `${PIPESTATUS[0]}` in bash or `$pipestatus[1]` in zsh, and the two spellings are not interchangeable, which is its own trap in a repository whose scripts run under both.
2. **`tail` discards the evidence.** A failing gate's diagnosis is usually above its last two lines, so even a correctly read failure would have arrived with the reason cut off.

What made it survive scrutiny is that the output **looked like the right shape**: a line of gate output, then `exit 0`. Nothing about it reads as broken, and a green run is the case where nobody looks twice. `docs/MAINTAIN.md` line 3 already forbids exactly this, in those words: every gate runs as its own step with its exit status read on its own line, never piped into `head`, `tail` or `grep` before a commit. The rule was in the file, had been read this session, and was broken anyway, one gate at a time, because each single call looked harmless.

## The fix

The gates were re-run through the same runner the offline suite uses, which captures the whole output, reads the status from the command itself, and prints the output only when it is non-zero:

```bash
run() { n=$((n+1)); local name="$1"; shift; local out rc
  out=$("$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "$n PASS $name (exit 0)"; else echo "$n FAIL $name exit $rc"; echo "$out" | sed 's/^/    /'; fi; }
```

Command substitution keeps the status of the command, not of a pipe stage, and a failure arrives whole. The earlier `exit 0` lines were withdrawn in the session rather than left standing.

## The rule

Never read `$?` after a pipeline. A gate is run through command substitution, its status captured on the next line, and its output printed only on failure. The temptation this covers is real and should be named: piping to `tail` is done to keep a long gate's output out of the conversation, which is a genuine goal here, and the runner above meets it without trading the status away.

The wider form: any convenience applied to a check must not touch what the check reports. Bounding output is fine; standing between the check and its verdict is not.

## What now enforces it

Nothing automatic, and it is worth being exact about why. The rule binds text the assistant types into a shell, and no hook reads a command for this shape; the guardrails hook inspects commands for destructive patterns, not for whether their status is being read honestly. `docs/MAINTAIN.md` line 3 states the rule and did not prevent it.

What does help is not typing the line: the suite runner in the scratchpad already has `run`, and the repository ships `skilliton gate`, which exists for this exact purpose, keeping the full output in a log under `.git/skilliton/gate/` and printing the verdict from the exit status. Reaching for one of those rather than composing a pipe by hand is the practical form of this lesson. [[2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a]] is the neighbouring failure: a check list kept by hand has no check of its own, and neither does a hand-typed invocation of it.
