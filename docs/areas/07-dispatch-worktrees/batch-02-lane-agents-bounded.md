# Lane agents with a bound

Kind: Living. Batch record. Area [07-dispatch-worktrees](AREA.md).

- **Type:** build
- **Goal:** A lane agent launches with the shipped definition, model and window, and its work is measured.
- **Depends on:** 07-01, 04-01, 04-03
- **Advances:** M11; B36
- **Estimated sessions:** 2

## Acceptance

- [x] a lane agent launches from the brief with the shipped agent definition (evidence: evidence/live/2026-09-21-dispatch.md; two lanes on 2026-09-21, each launched from its brief with the text of packs/base/plugins/workflow/agents/lane.md as its instructions on sonnet, because the plugin agent was not offered as a subagent type in the extension session; the brief's --agent line itself is unverified)
- [x] each lane writes its own task record in the worktree (evidence: dispatch --apply renders the record and commits it on the lane branch as lane <name>: task record from LANES.md, one acceptance criterion per plan item; node --test scripts/dispatch.test.mjs 22 of 22 on 2026-09-20)
- [x] one real dispatch shows peak context per lane under the window, from the meter, filed (evidence: evidence/live/2026-09-21-dispatch.md; preview-before-write 107161 and apply-sweep-test 115485 against a ceiling of 120000, by the meter's peak_context definition applied to each lane's own transcript)

## Notes

Items 1 and 3 were ticked on 2026-09-21 by the first real dispatch (evidence/live/2026-09-21-dispatch.md, B38). Item 1 is ticked on the reading that the shipped definition ran: the client did not offer the plugin's `lane` agent as a subagent type in that session, so each lane was a general-purpose subagent given the definition's text; a launch through the brief's `--agent` line is still unverified and needs a terminal session. Item 3's per-lane figures come from the meter's definition applied to each lane's transcript, because the meter reports the subagent scope as one bucket when lanes run inside one session.

Item 1's instrument shipped on 2026-09-20: the brief carries a Launching this lane section naming the shipped `lane` agent and repeating the model and effort read from packs/base/plugins/workflow/agents/lane.md, with the lane's own model from the plan heading when it is a bare token. `claude --help` on Claude Code 2.1.92 lists --agent, --model and --effort, checked on this machine on 2026-09-20, so the line is a runnable command and not a description. Two dispatch tests read it against the definition. What is missing is an observed launch.

Item 3's instrument shipped the same day: scripts/token-cost.mjs now carries peak_context per bucket, the largest input plus cache read plus cache writes one request carried, as a peak_ctx column and a --json byScope field aggregated with a maximum. scripts/token-cost.test.mjs asserts it by hand over the fixtures with three negative controls, and two mutations proved it gates. What is missing is a real dispatch to measure.
