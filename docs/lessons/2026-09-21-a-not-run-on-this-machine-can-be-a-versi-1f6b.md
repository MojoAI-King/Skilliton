# A NOT RUN on this machine can be a version gap, not a missing check

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-not-run-on-this-machine-can-be-a-versi-1f6b
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The wave 7 suite reported four of its 55 steps as **NOT RUN**: `claude plugin validate --strict` for the marketplace
and for each of the three plugins, each refused with `error: unknown option '--strict'`. The plain
`claude plugin validate` was run instead on all four targets and passed, and the four steps were reported as not run
rather than counted as passes. That much was right. What was wrong was the conclusion sitting under it, that strict
validation is a check this repository currently has no way to run.

## The mechanism

The flag exists. It is absent from the Claude Code **this machine** has, 2.1.273, which is the version pinned in
`docs/CLIENTS.md` and installed here. CI installs the client unpinned, `npm install --global @anthropic-ai/claude-code`
in `.github/workflows/checks.yml`, and its own `claude --version` line printed **2.1.278** in run 35559200451 on
2026-09-21, immediately before running `claude plugin validate --strict` on all four targets. That step is one of the
61 that reported success.

So the check is not missing from the repository. It runs, on every push, on a newer client than the one this machine
holds, and the only thing that says which is the version printed next to it. Two machines, two clients, one flag, and
a local refusal that says nothing at all about the repository.

## The fix

[docs/MAINTAIN.md](../MAINTAIN.md) step 2 now names both versions and says where strict validation actually runs
rather than telling a session to find a build that has the flag. [docs/COVERAGE.md](../COVERAGE.md)'s Claude Code row
carries 2.1.278 in CI beside 2.1.273 locally, with strict validation named as the thing the newer one proves.

## The rule

When a check refuses to run, print the tool's version beside the refusal, then look for the same check in the other
place it runs before recording it as not covered. A NOT RUN is a statement about one machine.

## What now enforces it

CI runs `claude --version` in the same step as the validation, so every run prints the version that accepted the flag
and a future refusal can be dated against it. Nothing pins that version: CI takes whatever npm publishes that day,
which is what makes the local and CI clients drift apart in the first place (docs/BACKLOG.md B46). This entry is the
other side of [[2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a]]: that one is two lists of checks that can
disagree, this one is one check that behaves differently in the two places the lists send it.
