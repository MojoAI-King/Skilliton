# Handoff times typed ahead of the clock hide a stale handoff

Kind: Living. Lesson entry.

- **ID:** 2026-09-17-handoff-times-typed-ahead-of-the-clock-h-95ba
- **Status:** accepted
- **Date:** 2026-09-17

## What broke

The two handoff notes written at the end of the M9 session said `Written: 2026-09-17 00:30 EDT` and `Written: 2026-09-17 01:20 EDT`. The commits that added them were made at 2026-09-16 23:03 EDT (5a67e74) and 23:49 EDT (e8ab467), so both times were about an hour and a half in the future. `skilliton status` then called a stale handoff current: at 00:58 EDT, with six uncommitted documentation changes made after the handoff, it printed `OK handoff: docs/HANDOFF.md was written 2026-09-17 01:20 EDT; no later commit or uncommitted change (6 uncommitted path(s))`.

## The mechanism

The times were typed from a sense of how late it was, not read from the clock. The runtime's own timestamps were right: the task records' checkpoints are written by the command in UTC (for example `2026-09-17T03:04:11Z`, which is 23:04 EDT). The freshness check, `handoffCheck` in `packs/base/plugins/workflow/runtime/lib/lifecycle.mjs`, calls the handoff stale only when the latest commit time or an uncommitted file's modification time is later than the Written time. It never compares the Written time with the current time, so a Written time in the future hides every commit and change made before it.

## The fix

Both times in docs/HANDOFF.md were corrected to their commit times, with a note saying so, and the new note's time was read with `date "+%Y-%m-%d %H:%M %Z"`. The check itself is not changed yet.

## The rule

Read the clock when writing a Written line or any dated statement, and never type a time from memory. A freshness check must also reject a recorded time later than now, because a check that only asks whether something is newer than the record is disarmed by a record from the future.

## What now enforces it

Nothing yet. Backlog B25: the project state report behind `status` and the session start reports a Written time later than the current time (allowing a few minutes of clock difference) as a problem, with a test.
