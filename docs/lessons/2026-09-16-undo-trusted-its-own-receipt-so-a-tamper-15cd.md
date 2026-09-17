# Undo trusted its own receipt, so a tampered receipt could delete any file whose hash it named

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-undo-trusted-its-own-receipt-so-a-tamper-15cd
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

The first version of `skillgate join --undo` passed its tests and the machine rehearsal on both real clients. An independent security-first review then reproduced twelve problems in it. The most serious: with the receipt's `launcher.path` edited to point at an unrelated file and its sha256 set to match, `join --undo --apply` deleted that file without a backup and exited 0. Other findings in the same family: a receipt with `"trust": {}` or a `__proto__` client key crashed with exit 3; an unreadable `known_marketplaces.json`, or Codex marketplaces written in another valid TOML form, read as "no marketplace", so join would record adding a marketplace that already existed and undo could remove it; undo removed a marketplace the user had re-added from another source; a marketplace folder whose catalog had another name left a marketplace behind while undo reported success.

## The mechanism

`readReceipt` checked the shape of `clients` and the marketplace name only, and `applyUndo` removed whatever `trust.path` and `launcher.path` named when the file's hash matched the recorded one. The hash proved the file had not changed since some writer computed it, not that join had written it or that it was at the place join writes. The client readers inherited verify's leniency, where an unreadable record is a note; for verify that is safe (nothing is approved), but for join "unreadable" became "absent", which decides what gets added and later removed. The tests exercised the receipts join itself writes and the file shapes the stand-ins write, so none of these inputs were ever produced.

## The fix

Commit 5358f37, `packs/base/plugins/workflow/runtime/lib/join.mjs`: `receiptProblem` validates every field, including names against the plugin name rule and `Object.hasOwn` for client keys; undo removes the signers file only at `trustFilePath(company)` and the launcher only when its text is exactly `launcherText(company, receipt.source)`; `readClaudeMarketplaces` and `readCodexMarketplaces` refuse records they cannot read and marketplace declarations in any other form; the marketplace is checked before adding (a folder's catalog name) and after (the client lists it from the planned source); undo keeps a marketplace whose source changed or that other installs use. `scripts/join.test.mjs` has a regression test for each finding.

## The rule

A file a command wrote is still untrusted input when it later drives deletion: bind every path it names to where the command itself would write, and match content, not only a hash the file supplies. A reader that is lenient for reporting must be strict when its answer decides what to add or remove.

## What now enforces it

The regression tests in `scripts/join.test.mjs` (tampered launcher and trust paths, malformed receipts, unreadable client records, a re-pointed marketplace, a project-scope install, a moved clone), run in CI. An independent review pass before publishing a command that deletes files is a practice, not a check; nothing enforces it yet.
