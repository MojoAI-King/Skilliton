# A lane writing through the shell is caught at merge, not by the write guard

Kind: Living. Decision entry.

- **ID:** 2026-09-22-a-lane-writing-through-the-shell-is-caug-81e5
- **Status:** accepted
- **Date:** 2026-09-22

## Decision

The lane write guard keeps covering the assistant's file-writing tool calls only. A lane that writes the integration branch's own paths through the shell is caught by the merge protocol, which stops a merge whose diff touches `mainOnlyPaths`. Closes O26.

## Why

The first real dispatch (B38, 2026-09-21) merged two lanes back and neither wrote outside its files. Covering the shell in `guard-bash.sh` would mean parsing every redirection and program that can write a file, which the guard cannot do reliably, and a guard that misses some writes reads as one that covers them. The merge step already runs `git diff --name-only main...<lane>` and stops on `mainOnlyPaths`, so a shell write is seen before it lands.

## Alternatives rejected

Parsing shell writes in the guard (incomplete, so misleading). Running lanes in a sandbox (a platform feature this product does not control).

## Risk

A lane's shell write sits in its branch until merge. It never reaches the integration branch unseen.

## Reversibility

Easy.

## Evidence

`evidence/live/2026-09-21-dispatch.md`; the dispatch skill's merge protocol step 0; docs/CONTRACTS.md on the lane write guard.
