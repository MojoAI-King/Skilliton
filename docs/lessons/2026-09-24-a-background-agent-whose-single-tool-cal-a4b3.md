# A background agent whose single tool call runs past ten minutes is stopped as stalled, so a lane runs its suites one file at a time

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-a-background-agent-whose-single-tool-cal-a4b3
- **Status:** accepted
- **Date:** 2026-09-24

## What broke

Three background agents of the 2026-09-24 batch (the legacy-and-template lane, the guard lane and the newcomer walkthrough) were stopped with "Agent stalled: no progress for 600s (stream watchdog did not recover)" about forty minutes in. Their worktrees and commits were intact, and each was resumed with a message.

## The mechanism

The harness watches each agent's output stream and stops one that produces nothing for ten minutes. A single tool call that runs longer than that (a whole guard suite under load, a full check run, a long headless session) produces no stream output while it runs, so the watchdog reads it as a stall.

## The fix

Each agent was resumed with an instruction to keep every tool call under about eight minutes: run suites one file at a time, give a headless session a turn limit, and never run the full check list inside a lane.

## The rule

A lane brief and any long-running agent prompt say: no single command over about eight minutes; long suites run one file at a time; the full check run belongs to the main window.

## What now enforces it

Nothing yet: the lane briefs written by skilliton dispatch do not say it. A sentence in lib/dispatch-brief.mjs's checks section would carry it to every lane.
