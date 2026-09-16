# New decisions and lessons in this repository are entry files

Kind: Living. Decision entry.

- **ID:** 2026-09-16-new-decisions-and-lessons-in-this-reposi-35d6
- **Status:** accepted
- **Date:** 2026-09-16

## Decision

From 2026-09-16 on, a new decision or lesson in this repository is its own file, created with `skillgate record decision "<title>" --apply` or `skillgate record lesson "<title>" --apply` in `docs/decisions/` or `docs/lessons/`. DECISIONS.md and docs/LESSONS.md keep every entry written before this one, unchanged, as adopted history, and `skillgate index --apply` lists the entry files in a managed section at the end of each. The open-items table stays in DECISIONS.md and is still edited there.

## Why

The instructions every session reads (the managed block in CLAUDE.md and AGENTS.md) say one entry per file, and this repository runs parallel sessions; appending to one shared file is how two sessions collide. Until this maintenance run the integrating session kept appending to the two monoliths by habit.

## Alternatives rejected

- Moving the existing entries into files: rewrites history that other documents cite by heading.
- Keeping only the monoliths: contradicts the instructions and the adoption model Skillgate ships to every project.

## Risk

Decisions now live in two places: the history in DECISIONS.md and new entries in `docs/decisions/`. The generated section at the end of DECISIONS.md lists the new ones, and the open items stay in one table.

## Reversibility

EASY.

## Evidence

This entry and the two lesson entries written with it are the first entry files; `skillgate index --apply` appended the index sections after the adopted text, the path `scripts/records.test.mjs` covers ("index leaves an adopted record without markers alone until there is an entry to list, then appends the section").
