# Bound context (B36)

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** research
- **Goal:** The compaction window and the subagent bound set from measurement, not from a guess.
- **Depends on:** none
- **Advances:** B36
- **Estimated sessions:** 1 to decide, 1 to ship

## Acceptance

- [x] the measured spread of session context is on record: median 244K tokens, 57.7 percent of turns over 200K, subagent peaks 335K to 560K in the top ten lanes (evidence: scratchpad measurement of this machine's transcripts on 2026-09-18, reported in chat and recorded in B36)
- [x] the global autoCompactWindow value on this machine and how it reached 1000000 (file changed 17:57 on 2026-09-18) is explained in a decision entry (evidence: docs/decisions/2026-09-18-the-team-compaction-window-is-600000-own-e7ee.md, owner-set while the autocompact question was open; a project file overrides it)
- [x] whether a subagent can be given a smaller window or a cheaper model by its agent definition is verified in the documentation or by running it, and says unverified otherwise (evidence: the subagents reference read on 2026-09-18 through the documentation agent lists model, effort and maxTurns as the agent frontmatter, no window key; recorded in the decision entry above; a cheaper model per lane is documented, a smaller window is not available, and neither was run here)
- [x] the team settings template carries the window the decision names, with the reason in the decision entry (evidence: templates/project-settings.json autoCompactWindow 600000; scripts/skilliton.test.mjs section "team settings template: the keys a team relies on are pinned", 188 checks pass 2026-09-18; the decision entry above)
- [ ] one session after the change shows its context staying under the window, filed

## Notes

The template moved from 200000 to 600000 on 2026-09-18 by the owner's choice, unmeasured (the decision entry says what would change it). Never set the global value from a session; it is live-managed by the running app. The last item stays open until a session in a project carrying 600000 is measured through the meter; the rehearsal's L6 step measures compaction at the documented minimum, 100000, in a disposable project, which shows the mechanism and not this value.
