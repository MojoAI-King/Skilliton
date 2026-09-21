# A NOT RUN was the wrong binary, not a version gap

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-not-run-on-this-machine-can-be-a-versi-1f6b
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The wave 7 suite reported four of its 55 steps as failures that were then written up as **NOT RUN**:
`claude plugin validate --strict` for the marketplace and for each of the three plugins, each refused with
`error: unknown option '--strict'`. The plain `claude plugin validate` was run instead and passed, and the four steps
were recorded as not run rather than counted as passes. That much was right.

Everything written under it was wrong, and this entry is the second version of itself. The first version, committed
in 51c38e5, said the flag is absent from 2.1.273, the version this machine holds, and present in 2.1.278, which CI
installs, so the check runs in CI and cannot run here. Neither half was measured. Strict validation had been passing
on this machine for three waves, and 2.1.273 was never the binary that refused.

## The mechanism

This machine carries three Claude Code installs. `/opt/homebrew/bin/claude` and the one under `~/.local/bin` are both
**2.1.92**; `/usr/local/bin/claude` is **2.1.79**. PATH resolves the homebrew one, so bare `claude` is 2.1.92, which
has no `--strict` flag. The client this repository's sessions actually run under is the editor extension's native
binary named by `$CLAUDE_CODE_EXECPATH`, **2.1.276**, which accepts the flag and validates all four targets at exit 0.

The suite scripts for waves 4, 5 and 6 set a variable to that binary's path and every validation step printed PASS.
The wave 7 script dropped the variable and invoked bare `claude`. The version written into the docs was then read
from docs/CLIENTS.md rather than from the binary that produced the refusal, so a refusal from 2.1.92 was recorded as
a fact about 2.1.273, and the conclusion drawn from it, that the repository has no local way to run strict
validation, was the opposite of true.

Two probes make this worse rather than better, and both were tried: `claude plugin eval --help` on 2.1.92 exits **0**
and prints the parent command's help, and `claude plugin eval` with no flag prints `error: unknown command 'eval'` and
also exits **0**. A subcommand that does not exist passes both of the obvious presence tests. The only reliable probe
is reading the subcommand list out of `claude plugin --help`.

## The fix

[docs/MAINTAIN.md](../MAINTAIN.md) step 2 now tells the session to run strict validation with
`"$CLAUDE_CODE_EXECPATH" plugin validate --strict <target>` and never with bare `claude`, and says that a refusal
means the wrong binary before it means a missing check. [docs/COVERAGE.md](../COVERAGE.md)'s Claude Code row records
strict validation as exercised on 2.1.276 with all four targets at exit 0, and names 2.1.92, the version PATH
resolves, as the one that has no flag. [docs/BACKLOG.md](../BACKLOG.md) B46 keeps the unpinned CI install, which is a
real gap, and states that its local half was wrong when written.

## The rule

Record a capability against the binary that showed it, taken from that binary in the same command as the measurement,
never from a reference table. Before writing a check down as not covered, run `command -v` and a version print for
every copy of the tool on the machine, and try the one the session itself is running under. A tool's exit status is
not a presence test when its argument parser falls back to help.

## What now enforces it

The MAINTAIN instruction, and nothing automatic. The suite is rebuilt by hand from that instruction every wave, which
is how the client variable went missing between wave 6 and wave 7; it is a third hand-kept copy of the check list
beside the two [[2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a]] already names, and B43 is where that is
tracked. CI runs `claude --version` in the same step as the validation, so every run carries the pairing on the CI
side. Nothing yet carries it on this side.
