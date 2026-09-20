# Routines while working (M11, B21)

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** research
- **Goal:** The three routines decided from the hooks reference, then built with fixture tests: a dispatch suggestion on a prompt with six or more items, a checkpoint snapshot before compaction shown again after it, and a maintain suggestion after a merge.
- **Depends on:** 01-01
- **Advances:** M11; B21
- **Estimated sessions:** 2 (one to decide, one to build)

## Acceptance

- [x] a decision entry names, for each routine, the client event it uses (UserPromptSubmit, PreCompact, SessionStart with matcher compact, Stop, or a git hook) with the documentation line that confirms the event exists, or says unverified (evidence: docs/decisions/2026-09-20-the-client-event-behind-each-of-the-thre-f6c2.md quotes the hooks reference read on 2026-09-20 at code.claude.com/docs/en/hooks for all three: UserPromptSubmit fires "When you submit a prompt, before Claude processes it" and carries user_prompt, with additionalContext as "Text to add as context to Claude before processing the prompt"; PreCompact fires "Before context compaction" and the SessionStart source list holds compact; the after-merge routine names the Stop hook already shipped and records why no git hook is installed. Whether Claude Code delivers UserPromptSubmit to a plugin hook is written there as unverified, with the live sighting named)
- [x] the compaction snapshot (PreCompact plus SessionStart compact, already wired in hooks.json) is measured in a live session and the evidence filed (evidence: live rehearsal L6 on Claude Code 2.1.276, filed at evidence/rehearsals/2026-09-19-live-clients-run-4/SUMMARY.md. A disposable project set autoCompactWindow to 100000, the session compacted on its own, the PreCompact hook ran with trigger auto, a SessionStart with source compact followed it in the same session, its hook_response in the stream carried the Project state and the model went on reading. Headless only: docs/CLIENTS.md line 20 keeps the interactive path unverified, and the VS Code extension session filed at evidence/live/2026-09-20-vs-code-extension-session.md saw source compact reach the model but not this plugin's block, with the install confound stated there)
- [x] the dispatch suggestion hook exists with a fixture test (shared with area 07 batch 04) (evidence: UserPromptSubmit in packs/base/plugins/workflow/hooks/hooks.json runs skilliton hook user-prompt-submit with a 10 second timeout, countPromptItems and dispatchSuggestion in runtime/lib/session-hooks.mjs count numbered lines, bulleted lines and imperative sentences outside fenced code, and scripts/lifecycle.test.mjs proves the counting table, the additionalContext shape, the journal dispatch-suggested event, silence below the threshold, the threshold read from dispatch.minItemsForLanes at 3 and at 20, and silence outside a project. Four fixture tests, and two mutation checks that break the fenced-code skip and hardcode the threshold, each shown failing; suite 51 of 51 on 2026-09-20)
- [x] the after-merge maintain suggestion exists with a fixture test, or the decision entry says why it is instructed only (evidence: the shipped Stop hook gained one rule. mergesSince in runtime/lib/journal.mjs counts merge commits between the baseline event's commit and HEAD over the same window the reminder measures, and stopReason adds one sentence naming /workflow:maintain. Three fixture tests in scripts/lifecycle.test.mjs cover a merge in the window with a clean tree, an ordinary commit that is not a batch, and a window the merge check could not read. Of the three mutants, dropping the --merges flag kills two cases and not one, which is recorded in the Notes below rather than rounded up)

## Notes

Do not invent hook capabilities. Every event named must be in the hooks reference or seen running.

Measured 2026-09-20, and reported rather than smoothed: the three mutation checks over the after-merge rule do not
map one to one onto the three cases. Deleting the merge sentence kills case 1 only; replacing `none(problem)` kills
case 3 only; but dropping `--merges` from the range kills cases 1 and 2, because without the flag the range holds two
commits and case 1's exact "1 merge commit ... sha" assertion already fails. Case 2 is therefore a regression guard
whose worth is that it names the reason directly and does not lean on case 1's exactness, not a case with a mutant of
its own. A mutant that kills more than its own case is a finding about the tests, not a detail to leave out.

Both sources were restored from their backups after the measurement and proved byte-identical with `diff`.
