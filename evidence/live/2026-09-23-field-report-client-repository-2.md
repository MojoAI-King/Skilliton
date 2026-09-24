# Second field report: usage, savings and lane cost in a client repository

Kind: Evidence. Reported 2026-09-23 at about 13:50 EDT, after release 1.2.0, by the Claude Code session doing production work in a client repository prepared by Skilliton, and pasted into this repository's session by the owner. This is a sanitized copy: the client is not named, no dollar figure is kept, and paths are generalized. The owner asked for it to be stored and not acted on; on 2026-09-23 at 23:15 EDT the owner said to do everything a session can finish, and the batch planned from it is LANES-8 (items N1 to N7).

## What the report asked for

The report opens with the owner's words: "I really want to be able to see how the tool is saving me money. And time." Its finding: `skilliton usage` showed nothing in that repository.

| Ask | What the report measured | Verdict here | Answered by |
| --- | --- | --- | --- |
| Ship the meter with the plugin and make it the default | The repository's own copy of the meter was an older personal version (v1.1.0): flag-style dates, no `--json`, no price for claude-opus-5-5 (23,156 records dropped from its totals that week), its test built in rather than beside it, so `usage` refused. Pointed at this repository's meter, `usage` passed the fixture test and printed rows in 80 seconds. | real: `usage` depended on a project-local meter speaking its contract | N1 |
| Count fast-forward batches | The repository merges lanes with `git merge --ff-only`, as dispatch's own merge rule says: 434 commits since 2026-09-15 and 0 merge commits, so the newest row was 2026-09-14 and that week was invisible. | real: batches came from merge commits only | N2 |
| Default to this project | Without `--project`, a row counted every project on the machine, this repository's own lanes included. | real: there was no per-project default | N3 |
| Keep the rows | Claude Code removes transcripts after 30 days by default (no `cleanupPeriodDays` set; the oldest there was 2026-08-25), so the 2026-09-01 to 09-15 baseline becomes unreadable in mid-October. | real: nothing kept a row once its transcripts were gone | N4 |
| Build the savings view, honestly | Keep "the meter alone never says saved" and add cost per batch and per closed task against the baseline, time per task, gate runs and reds before green, the Usage screen readings with a date beside the meter's trend, the controlled comparison, and one short summary. | real: the standing ask; the design follows PLAN.md sections 6 and 8 | N5 |
| Lane reports carry cost and peak context | Seven of the ten most expensive subagent runs that week were Skilliton lanes, peaking at 370,000 to 560,000 tokens of context, past dispatch's own bound of about 200,000. | real: nothing measured a lane against its bound | N6, N7 |

## What stays out of this file

The client's name, the dollar figures the report quoted per lane and per week, and the paths on the client's machine are kept in the owner's own notes outside every repository. The token counts, commit counts and dates above are the report's own.
