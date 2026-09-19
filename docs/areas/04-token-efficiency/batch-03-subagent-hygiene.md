# Subagent hygiene

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** build
- **Goal:** Every dispatched agent carries a context bound and a model choice, shipped in the workflow plugin.
- **Depends on:** 04-01
- **Advances:** M11; B36
- **Estimated sessions:** 2

## Acceptance

- [ ] dispatch briefs carry a bound (what to read, what to return) and a model choice
- [ ] agent definitions with model and effort ship in the workflow plugin, with a packaging test
- [ ] one real dispatch shows peak context per lane under the window, from the meter, filed

## Notes

Depends on what 04-01 verifies about per-agent settings.
