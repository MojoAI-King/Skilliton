# The frozen copies stay beside the migrations that read them, and the security catalog keeps its identifier

Kind: Living. Decision entry.

- **ID:** 2026-09-22-the-frozen-copies-stay-beside-the-migrat-a3d4
- **Status:** accepted
- **Date:** 2026-09-22

## Decision

`runtime/lib/prototype-v1.mjs`, `legacy-template.mjs` and `legacy-names.mjs` stay where they are, and the catalog keeps the identifier `skillgate-baseline-2`. Closes B57.

## Why

Each of the three files opens with a header that says what it freezes, which migration reads it, and that it must never be edited to make a migration pass, so a cold reader is told on the first line. Moving them under a new folder changes imports in about twenty runtime files and several tests for no change in behavior. The catalog identifier is written into every prepared project's security records, so renaming it needs a migration that rewrites evidence records, and O23 already chose to keep the `SG-` control identifiers for the same reason: an identifier recorded in evidence is not a brand name.

## Alternatives rejected

A `lib/legacy/` folder (a refactor across twenty files the day before a release). A catalog rename with a migration (rewrites recorded evidence).

## Risk

The earlier product name stays visible in one identifier and three file names. `scripts/names.test.mjs` holds every other use of it to an allow list.

## Reversibility

Moderate: the file move is easy; the catalog rename would need a migration with a receipt.

## Evidence

the headers of the three files; DECISIONS.md O23; `scripts/names.test.mjs`.
