# The usage ledger skips an empty window and is read only in the default scope

Kind: Living. Decision entry.

- **ID:** 2026-09-24-the-usage-ledger-skips-an-empty-window-a-aea2
- **Status:** proposed
- **Date:** 2026-09-24

## Decision

`skilliton maintain --apply` appends a batch row to `.skilliton/usage/ledger.jsonl` only when the meter saw at least one request in the window since the last row; an empty window writes nothing, and the next row starts where the empty one would have, so the rows still tile. `skilliton usage` shows ledger rows only in its default scope (this repository and its lane worktrees, matched exactly) and without `--since`; with `--project`, `--all-projects` or `--since` it reads the transcripts alone, and `--ledger-only` is refused there. The row is written before the security collectors run, so the secrets record they write in the same maintenance has already seen it.

## Why

Every maintenance run in a repository with no transcripts on the machine (a fixture, a fresh clone, a laptop that never opened a session there) would otherwise add a row of zeros, and each such row changes a tracked file, which makes the secrets record stale and re-collected at the next maintenance. Skipping loses nothing: the next row covers the empty span and names its boundaries. Ledger rows were measured in the default scope, so printing them under a different scope would put two different readings in one table.

## Alternatives rejected

A row for every maintenance, zeros included: tiles the same way, but churns a committed file and the secrets evidence for no information. Recomputing old rows in whatever scope was asked for: the transcripts a committed row came from may be gone, which is the reason the ledger exists.

## Risk

A committed ledger is appended at most once per maintenance; the secrets collector fingerprints tracked files, so a maintenance that writes a row still re-collects secrets at the next one (the ledger changed). That churn is one evidence record per maintenance that measured anything; excluding the ledger from the fingerprint is the security lane's call, not this one's.

## Reversibility

Easy: the skip is one condition in lib/usage-ledger.mjs ledgerStep, and the scope rule one condition in commands/usage.mjs readRows. Rows already written are unaffected either way.

## Evidence

scripts/usage-ledger.test.mjs: an empty window writes nothing and says so; two runs with requests write two rows that tile and end at the maintain events' own times; the ledger text carries no dollar sign, no money-shaped key, no folder name and no path. node --test scripts/maintain-security-collectors.test.mjs and scripts/lifecycle.test.mjs still pass with the step in place.
