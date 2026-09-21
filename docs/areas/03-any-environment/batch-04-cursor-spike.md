# Cursor spike (M13, O24)

Kind: Living. Batch record. Area [03-any-environment](AREA.md).

- **Type:** research
- **Goal:** What Cursor reads (rules, hooks, plugin files) and what an adapter must write; a decision entry.
- **Depends on:** a Cursor account (owner)
- **Advances:** M13; B23
- **Estimated sessions:** 1

## Acceptance

- [x] a decision entry lists what Cursor reads, from its documentation with retrieval dates, and what a Skilliton adapter would write (evidence: docs/decisions/2026-09-20-what-cursor-reads-and-what-a-skilliton-a-006f.md, six published pages read on 2026-09-20 with their URLs, and a table of what an adapter would have to write for each piece)
- [x] docs/CLIENTS.md gains a Cursor column, measured or documented only, and says which (evidence: the fourth column of the matrix, headed "Cursor, documentation only, retrieved 2026-09-20"; every cell carries its URL or reads "not documented", none says measured, and node scripts/docs.test.mjs reports 4 columns with 3 having a measured row)

## Notes

Documentation only, and labelled so. No Cursor session has been run, so the column can never make Cursor supported under this repository's own rule; the measured half needs a Cursor login and stays with the owner.

Two findings worth carrying into any adapter work. Cursor reads `AGENTS.md` at the root and in subdirectories and reads skills from `.agents/skills/`, both of which Skilliton already writes for Codex, so a large part of the harness reaches Cursor today with nothing new written. Against that, `beforeSubmitPrompt` returns only `continue` and `user_message` with no context field, so the dispatch suggestion wave 6 added has **no Cursor route at all** and an adapter would have to say so rather than quietly ship six hooks of seven.
