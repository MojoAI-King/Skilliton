# Three backlog rows wait while the batch makes existing promises dependable: ingesting CI reports, splitting long functions, one test convention

Kind: Living. Decision entry.

- **ID:** 2026-09-24-three-backlog-rows-wait-while-the-batch-1492
- **Status:** accepted
- **Date:** 2026-09-24

## Decision

B72 (ingesting a repository's own CI secret scan, dependency audit and test reports), B68's function splits and B58 (one test convention in scripts/) stay open and out of the 2026-09-24 batch. The batch makes existing promises dependable instead: the usage view, continuity at the writing end, the guard's sourced scripts, the security records, the release pin, the claims.

## Why

An outside review of 63b0119 (the owner's second cold review, forwarded 2026-09-23) advised freezing new features until someone else can use, understand and maintain the product, and said splitting files only to lower line counts earns little credit. B72 is a new collector surface; B68's splits move code without changing what it does; B58 renames test files and CI steps while five lanes are editing them.

## Alternatives rejected

Doing all three in the batch: B72 adds surface the review asked to hold, and B58 and B68 would conflict with every lane at merge. Closing them as won't do: each is still worth doing when a change needs it (B68 when a function has to change anyway, B58 once no lane is open).

## Risk

B72's absence keeps a client's existing evidence invisible to the register, which the first field report named (N46); the owner may overrule and it can be laned on its own.

## Reversibility

Full: each row stays in docs/BACKLOG.md with this entry as its reason.

## Evidence

LANES-8.md (gitignored, the batch plan) lists them as deferred with these reasons; the review's text is the owner's copy outside this repository; backlog rows B58, B68, B72.
