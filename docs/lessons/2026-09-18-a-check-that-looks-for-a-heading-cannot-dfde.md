# A check that looks for a heading cannot tell a stale section from a current one

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-check-that-looks-for-a-heading-cannot-dfde
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

This repository's `CLAUDE.md` carried a "Session cost" section saying screenshots were the single largest cost line. The meter that section pointed at had since established the opposite (an image is priced by its pixels, about the size of a short file, not by its base64 bytes), and the personal skill that wrote the section had corrected its own template. The skill's harness still reported the section as OK, because its check was `/^## Session cost/m`: the heading was there.

## The mechanism

A presence check answers "is there a section with this name", which is a different question from "is this section the current one". Nothing in the section carried a version, a hash or a marker that the check could compare with the template, so a rewrite of the template could never be detected in a project that already had the heading, and every project that ran the skill early kept the wrong claim with a green check beside it.

## The fix

The rules moved into the managed harness block, which already solves this: the block is keyed by the template's hash, `skilliton migrate` shows a pending instructions migration when the template changes (`0100-instructions-<sha12>`), applies it with a receipt, and refuses when the block was edited by hand. This repository's out-of-block section was cut down to what is particular to it (`CLAUDE.md`, "Session cost, in this repository"). The personal skill now points at this repository as its development home.

## The rule

Text that a tool writes into a project and may later change is written between markers with a version or a hash, and the check compares the content with the source, never the heading with a pattern. A check that cannot go red when the source changes is not a check on the source.

## What now enforces it

For projects Skilliton prepares: `skilliton status` and the session-start hook report a pending instructions migration whenever the harness template's hash differs from the block's receipt (`scripts/migrate.test.mjs`, `0100-instructions-<template sha>`). For the personal skill's own heading check: nothing yet; it is superseded here and its `SKILL.md` says so.
