# Guardrails never wait on a person, except before a rule is turned off or saved work is dropped

Kind: Living. Decision entry.

- **ID:** 2026-09-24-guardrails-never-wait-on-a-person-except-649e
- **Status:** proposed
- **Date:** 2026-09-24

## Decision

The owner decided on 2026-09-24, after the measurement below, that the guardrails hook stops answering "ask" with a dialog. The hook gains a mode, `guardrails.mode` in `.skilliton/config.json` or `SKILLITON_GUARDRAILS_MODE` for one session, with three values and the stricter of the two sources winning:

- **quiet**, the default: an ask is answered by the hook itself, by what the reason says. One the assistant can rewrite (edits that would be lost, when the working tree has something to lose: commit or stash them first; a path or branch held in a variable: write it out; a `git add` in a folder that is not a repository yet: `git init` on its own; a command too long or with a quote that does not close: split it) is refused with that fix. One the hook cannot read (a script outside the project, `eval` of text made while the command runs, a shell fed from a pipe, `env -S`) or a check that could not run: the command runs, and one line goes to `<git dir>/skilliton/guardrails.jsonl` with the time, the mode, the answer and the reason, never the command text. Two things still ask: a way to turn a rule off (a settings file, a hook skip, a git alias set on the command, `BASH_ENV`) and saved work dropped for good (a stash, an unmerged branch, a worktree, the repository itself).
- **strict**: every ask asks, as before this date.
- **fleet**: every ask is refused, for a machine nobody watches.

Blocked commands stay blocked in every mode. A command that would throw away edits runs when the tree where it runs has nothing to lose.

## Why

The owner: a tool that needs a person at the keyboard approving commands all day is not used, and it leaves the person watching whether the thing is running or stalled. Measured over the 24 hours to the afternoon of 2026-09-24, across every project on the owner's machine and including the background agents' transcripts: 171 guardrails confirmations, 168 approved; about 7 were the danger the guard exists for, the rest were "cannot see, so ask". Replayed through the new classes (189 asks by the time of the replay): 13 still ask, 33 are refused with the fix, 143 run and are noted. A question always answered yes protects nothing, and a fleet machine (the plan's Skilliton Ultra) has nobody to answer it at all.

## Alternatives rejected

- Ask only for a "recognized danger" and run the rest silently: rejected, because a silent run of what the hook could not read leaves no trace; the note line is the trace.
- Refuse everything the hook cannot read, for people too: rejected for the user harness, because that is the fleet's rule, and on a laptop it would refuse the owner's own credential exports and scripts many times a day.
- Keep asking before losing work, with a cheap undo: replaced by "refused with the fix: stash first" when the tree is dirty, which never loses anything and never asks; when the tree is clean the command runs.
- Let settings-file writes run and note them: rejected, because a write to the client's settings or to `.skilliton/config.json` is how a rule is turned off, and the note would be written by the guard that is about to be switched off.

## Risk

A command the hook cannot read now runs on a laptop. The header states the limit and the note records it; a person who wants the old behaviour sets `strict`. Whole-tree dirtiness is judged for `git checkout -- <path>`, so a clean file next to a dirty one is refused with the stash hint (a leftover). Nothing here changes what is blocked.

## Reversibility

`"mode": "strict"` in the project's settings, or `SKILLITON_GUARDRAILS_MODE=strict`, restores the previous behaviour with no code change. The lane can be reverted whole.

## Evidence

Lane lane/quiet-guard-0924: the five shipped suites pass as shipped against the new hook (guardrails.test.sh 670, bypass 144 with the two reviews it wraps at 224 and 163, timing 16); scripts/guardrails-modes.test.sh covers the three modes, the two sources and the notes file (60 checks; one expectation was left stale by a refused edit when this entry was written). The prompt count and the replay ran from the session scratchpad over this machine's transcripts and are not committed. The plan document "Skilliton direction: one tool for people and fleets" carries the same decision for the owner's review.
