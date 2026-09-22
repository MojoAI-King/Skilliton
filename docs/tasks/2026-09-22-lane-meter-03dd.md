# Task: Lane meter

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-meter-03dd
- **State:** in-progress
- **Branch:** lane/meter-0922
- **Owner:** unassigned
- **Updated:** 2026-09-22T22:43:49.371Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N1. [TOUCH] The meter prices every model a window used (B63): scripts/token-cost.mjs, scripts/token-cost.test.mjs or a new scripts/token-cost-models.test.mjs: add claude-opus-5-5 (and any other model the local transcripts name that has no price) from Anthropic's published pricing page, fetched tonight, with the page URL and retrieval date in a comment beside the table; a fixture proves a window using that model is no longer marked incomplete; `node scripts/token-cost.test.mjs` and its `--reference` still pass. If the published page does not list a model, leave it unpriced and say so in the report; never guess a price.
- [ ] N2. [FEATURE] A measured direction-of-travel note for token use: evidence/live/2026-09-22-token-direction.md (new), plus a script only if one is needed (scripts/token-direction.mjs, new, with its own test): run the meter per day from 2026-09-16 to 2026-09-22 for this repository's project folder (key derived at run time, never written) and table, per day: top-level requests, peak context, median and mean context per request, compaction boundaries, and whether the day is complete. Also count, from the same transcripts, the read-guard refusals (the context-hygiene hook's refusal text) and the `skilliton gate` runs. Mark every number a reconstruction from local transcripts, not a bill, name the models each day used, and state which pieces shipped on which day (read guard and gate 2026-09-18, compaction window measured 2026-09-22) so the reader can see the order of events. No savings sentence and no percentage: the Usage screen cross-check is the owner's. Run `node scripts/token-cost.test.mjs` first and record its result in the note.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
