# Decisions and lessons went into the monoliths although the instructions say entry files

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-decisions-and-lessons-went-into-the-mono-0925
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

The managed instructions in CLAUDE.md and AGENTS.md say "decisions `DECISIONS.md`, one entry per file in `docs/decisions/`" and "record a decision as its own entry: `skillgate record decision`". Through the integration and the follow-ups on 2026-09-16, the integrating session still appended every new decision and lesson to DECISIONS.md and docs/LESSONS.md by hand; the entry folders held only their READMEs.

## The mechanism

This repository adopted its existing monoliths when it prepared itself, and prepare created the entry folders beside them. Every earlier entry lives in the monolith, so appending looked like following the file's own convention, and nothing compares where new entries land with what the instructions say. The first `skillgate index` preview here then showed a second gap: it would have appended "No decision entries yet." under 30 decisions (fixed in 366468a: a record without markers is left alone until there is an entry to list).

## The fix

From this maintenance run on, new entries are files made with `skillgate record` (decision entry `2026-09-16-new-decisions-and-lessons-in-this-reposi-35d6`), and `skillgate index --apply` lists them at the end of each monolith. Existing entries stay where they are.

## The rule

Follow the record layout the instructions name, even when an adopted file's history suggests another habit; the adopted file is history, the entry folder is where new records go.

## What now enforces it

Nothing yet. A check that notices new second-level headings added to an adopted monolith while its entry folder exists would catch it; it is not built.
