# Subagent hygiene

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** build
- **Goal:** Every dispatched agent carries a context bound and a model choice, shipped in the workflow plugin.
- **Depends on:** 04-01
- **Advances:** M11; B36
- **Estimated sessions:** 2

## Acceptance

- [x] dispatch briefs carry a bound (what to read, what to return) and a model choice (evidence: briefText in packs/base/plugins/workflow/runtime/lib/dispatch.mjs, pinned by the brief test in scripts/dispatch.test.mjs)
- [x] agent definitions with model and effort ship in the workflow plugin, with a packaging test (evidence: packs/base/plugins/workflow/agents/ holds lane, locate and verify-item; the agents loop in scripts/packs.test.mjs checks name, description, model, effort and maxTurns, with three self-test cases)
- [ ] one real dispatch shows peak context per lane under the window, from the meter, filed

## Notes

04-01 settled the per-agent settings on 2026-09-20, from the official documentation: `model` takes sonnet, opus, haiku, fable, inherit or a full model id; `effort` takes low, medium, high, xhigh, max; `maxTurns` takes a positive integer; plugin agents are discovered from `agents/` with no manifest key needed. **No documented key sets a subagent's context window or its compaction**, so the bound in a brief is written prose the agent is asked to hold to, not a setting the client enforces. Say it that way in any claim about it.

Item 3 is not buildable from a build session: it needs one real dispatch of two or more lanes and the meter over the window it ran in. It waits on the meter question in 04-01 item 5, which the compaction finding of 2026-09-20 reopened.
