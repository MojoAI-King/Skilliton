# Skilliton in use on its author's machine, counted

Kind: Evidence. Measured 2026-09-22 at 19:40 EDT on the owner's Mac from the records Skilliton itself writes. Counts only: no repository is named, because most of them are other people's work.

## Method

A script walked the Desktop to a depth of three folders, found every git checkout, and grouped checkouts by their common git folder, so a repository with several worktrees counts once. For each repository it read `.skilliton/config.json` (prepared when `prepare.version` is set) and every session journal Skilliton keeps (`<git folder>/skilliton/journal.jsonl`, one per worktree). The journal is written by the plugin's own hooks, one line per event, so each count below is something a hook recorded, not something a person reported.

## What was counted

| Measure | Count |
|---|---|
| Distinct git repositories on the Desktop | 27 |
| Prepared by Skilliton | 26 |
| With at least one session journal | 6 |
| Days with journal events | 6, 2026-09-17 to 2026-09-22 |

The difference between 26 and 6 is expected: preparing a repository writes its records, and a journal starts only when a Claude Code session with the plugins runs there. The other 20 prepared repositories have no session journal yet; most were prepared by the one-line sweep on 2026-09-22.

Journal events, summed over the six repositories:

| Event | Count | Written when |
|---|---|---|
| session-start | 95 | a session started, resumed or compacted |
| session-end | 72 | a session ended |
| pre-compact | 12 | the client was about to compact the context |
| checkpoint | 133 | a checkpoint was recorded in a task record |
| stop-reminded | 64 | the stop hook held a session to ask for a checkpoint |
| maintain-reminded | 1 | the stop hook held a session because maintenance was due |
| maintain | 3 | `skilliton maintain --apply` ran |
| dispatch-suggested | 2 | the prompt hook directed `/workflow:dispatch` |
| dispatch-reminded | 1 | the stop hook asked once more because no lane plan was written |

One more count comes from the same journals. **Of the 64 checkpoint reminders, 33 were followed by a checkpoint in the same repository within 30 minutes.** The other 31 include reminders the assistant answered by saying why the work should not be recorded, which the reminder allows. One such case, a reminder on a clean tree right after a commit, was found on 2026-09-22 and fixed for release 1.0.1 (docs/decisions/2026-09-22-a-clean-working-tree-gets-no-checkpoint-8302.md).

## What this shows and what it does not

- **It shows** that the hooks run on real work and not only in tests, in six repositories over six days. Every session start, stop hold and checkpoint above was written by the shipped plugins.
- **It does not show** that the work got better or cheaper. There is no comparison group: every count is from sessions with Skilliton on. The measured comparison is area 10 batch 02 of docs/REPORT_CARD.md, and its protocol is agreed with the owner before it runs.
- **It is one developer on one machine.** A team using it is not yet measured.
- The one repository that holds most checkpoints and task records is this one, where the work is itself Skilliton.
