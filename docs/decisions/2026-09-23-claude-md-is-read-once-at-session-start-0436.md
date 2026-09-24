# CLAUDE.md is read once at session start and held in context on every turn, so a mid-session rewrite does not apply and its size is paid each turn

Kind: Living. Decision entry.

- **ID:** 2026-09-23-claude-md-is-read-once-at-session-start-0436
- **Status:** accepted
- **Date:** 2026-09-23

## Decision

The managed instruction block is treated as a per-turn cost and a per-session fact. Claude Code reads the project and user CLAUDE.md files once at session start and holds them in the context of every request afterwards; an edit made during a session does not apply until the next /clear, /compact or restart. Skilliton therefore keeps the block as small as it can be (B65, the smaller template shipped with its 0100 migration) and says, wherever it rewrites the block (prepare, migrate), that the change reaches the assistant in the next session. B75 closes on the documented answer; its measurement half (reading the transcript's cache fields to price a rewrite) is not measured and is not claimed.

## Why

The field report of 2026-09-23 (N54) asked whether a mid-session rewrite of the block is seen, and what a large block costs. The documentation answers both: the file is loaded once and kept, so a rewrite mid-session is invisible until the session is restarted or compacted, and the block sits in the cached project-context layer of every request, so its size is paid on every turn (cache reads are cheaper than fresh input, not free). That is the mechanism behind the 20,000 to 30,000 extra input tokens per session the comparison measured, and the reason shrinking the block is worth a migration in every prepared project.

## Alternatives rejected

Measuring it live in an interactive session (edit the block mid-session, see whether the next turn reflects it, read the cache fields): possible, and still worth doing once, but the documentation states the behavior directly, so a decision does not wait for it. Telling users to restart after every prepare or migrate: the command's own output says it instead, once.

## Risk

The documentation describes the client as of the retrieval date; a later version could re-read the file mid-session, in which case the note in the command output becomes wrong rather than harmful. The per-turn cost statement is the documentation's, not a measurement in this repository.

## Reversibility

Full: the note in the command output and the smaller template can change with the next release; nothing in a prepared project depends on the assumption.

## Evidence

Official documentation, retrieved 2026-09-23: https://code.claude.com/docs/en/prompt-caching.md ("Your project-root and user-level CLAUDE.md files are read once at session start and held in memory. Editing them mid-session does not invalidate the cache, but the edit also doesn't apply. Claude keeps working with the version that was loaded at session start. The new content loads on the next /clear, /compact, or restart.") and https://code.claude.com/docs/en/claude-directory.md ("Loaded into context at the start of every session"). The comparison run of 2026-09-22 (evidence/comparison/2026-09-22/SUMMARY.md, task D) for the measured extra input per session. Backlog row B75.
