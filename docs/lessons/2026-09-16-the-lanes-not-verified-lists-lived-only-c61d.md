# The lanes' not-verified lists lived only in worktrees marked removable

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-the-lanes-not-verified-lists-lived-only-c61d
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

Each of the six integration lanes wrote a `LANE_REPORT.md` with a "Not done or not verified" section, untracked in its worktree under `.claude/worktrees/`. The integration folded the code, contract changes and most open items into the repository, and docs/HANDOFF.md then said the lane worktrees "can be removed". During maintenance, those sections still held items recorded nowhere else: Node.js 18 never run although docs/ONBOARDING.md and `bin/skillgate` state it as the floor, Windows never tried, large-repository timings, SSH and HTTP delivery transports, submodules and sha256 repositories, passphrase-protected signing keys, collector interruption, and the CC BY-SA adaptation question. Removing the worktrees would have deleted the only copy.

## The mechanism

The reports are untracked on purpose (they name absolute paths, which the scrub check refuses), so merging a lane carries its code but not its report. The merge protocol asked the integrator to read each report, not to move its open items into a tracked file.

## The fix

docs/COVERAGE.md holds what has and has not been exercised, consolidated from the six reports and checked against the code, tests and CI logs (for example CI's bash 5.2.21, git 2.55.0 and Node.js 22.23.2); docs/BACKLOG.md B11 covers the untested Node.js floor, and docs/ONBOARDING.md now says which versions have run.

## The rule

At merge, every "not done or not verified" line of a lane report either lands in a tracked document or is closed with evidence, before the lane's worktree can be called removable.

## What now enforces it

Nothing yet. The dispatch skill's merge steps could require it; that change is not made.
