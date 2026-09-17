# Rollback ordered receipts by ID, so an older instructions receipt would have blocked undoing the rename

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-rollback-ordered-receipts-by-id-so-an-ol-70e5
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

A new test built a project with the earlier release, migrated it with 0003, and tried to roll 0003 back. Rollback refused with "roll back the later migration(s) first: 0100-instructions-aaaaaaaaaaaa", although that instructions receipt was applied before 0003. This repository has such a receipt, so its own migration could never have been undone, and the named receipt cannot be rolled back by the current runtime either.

## The mechanism

`planRollback` in `runtime/lib/migrations.mjs` took "later" to mean "its ID sorts after this ID" (`other > id`). That held while the only layout migration was 0002, because an instructions refresh (0100-...) could only be applied after it. The IDs of instructions refreshes are fixed at 0100 and they can be applied at any layout, so "0100-..." sorts after "0003-..." whenever it was applied.

## The fix

`laterReceipts` in `runtime/lib/migrations.mjs` compares each receipt's recorded `appliedAt` with the one being rolled back, and lists a receipt whose time cannot be read as possibly later. `receiptProblem` now requires a usable `appliedAt`.

## The rule

Never infer the order of events from identifiers chosen for another purpose; use the recorded time or sequence, and treat an unreadable one as unknown rather than earlier.

## What now enforces it

`scripts/rename.test.mjs` ("migration 0003 refuses what it cannot move safely") rolls back 0003 with an older instructions receipt present, and `scripts/migrate.test.mjs` rolls back 0003 then 0002 in order.
