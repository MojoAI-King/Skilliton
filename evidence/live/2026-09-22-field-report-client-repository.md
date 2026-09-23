# Field report: one day of real use in a client production repository

Kind: Evidence. Reported 2026-09-22, late evening EDT, by the Claude Code session that did a day of production work in a client repository with Skilliton installed, and pasted into this repository's session by the owner on 2026-09-23 at about 00:50 EDT. The repository, its product and its people are not named here. **This is the working session's own account, relayed by the owner; this session did not measure it.** Where this session checked a claim against the code, the verdict is given with its evidence.

## What the repository was

A production repository with a large test suite and its own CI secret scanning, prepared by Skilliton. On the day reported, two Claude Code sessions and a Codex session worked in the same checkout, mostly committing straight to `main`, and one production rollout was coordinated between the two Claude sessions.

## What helped, in the report's words

1. The session-start "Project state" block (a pending migration, an interrupted prior session, a stale handoff and the security counts in one read) "oriented the session faster than reading the docs."
2. Checkpoints in the task record "were the most valuable feature": one session learned of the other's parallel lane and its plan from the other's checkpoint "before its owner did, and that is how two agents coordinated one production roll. Cross-session visibility is the product."
3. The managed block's enforced, instructed and checked-at-merge labels "are honest and useful."
4. Guardrails: "no evidence either way"; every block the session hit came from Claude Code's own permission handling.

Not exercised that day: Skilliton's dispatch (the repository used its own), `skilliton gate` (it used its own gate wrapper), and the read guard (it never fired). No token or time saving is claimed from this report; nothing was measured.

## What hurt, and what this session found in the code

| N | The report | Verdict here | Evidence |
|---|---|---|---|
| N43 | 15 security controls sat undecided for days; propose applicability defaults for the detected stack | real, not built | backlog B70 |
| N44 | collectors run only by hand; run them inside maintain and CI | real, not built | backlog B71 |
| N45 | two of three collectors need `.skilliton/delivery.json`, which nothing flagged | real; the collector refuses, but nothing says so up front | lane security-loop (LANES-4) |
| N46 | existing evidence (the repository's own secret scanning, dependency audit, test reports) was invisible | real, not built | backlog B72 |
| N47 | the secrets collector flagged 12 high-confidence lines, all benign (a public certificate bundle, a cloud provider's published example keys, a fake live-shaped payment string in a refusal test, a deleted key's id in docs), with no allowlist, so the gap is permanent | real: `collectSecrets` has no allow check (lib/collectors.mjs near lines 346 to 359) | lane security-loop |
| N48 | 41 commits of production work went without maintenance; the nudge is satisfied by the wrong act | real: maintenance was due only after a merge commit or a day, and direct commits make no merge | fixed in 9ed0785: due after 15 commits since the last `skilliton maintain`, and when the handoff is 15 commits behind |
| N49 | "no maintenance recorded yet" when the repository's own maintain had run three times; three maintain paths that do not know each other | real: only `skilliton maintain` writes the journal event | 9ed0785 says so in the paragraph; one path for all three is backlog B73 |
| N50 | new task records open `Kind: Living.` where the host's docs test requires its own header, so every new record broke the build | real: the header is a literal in five writers, with no config key | lane records-host |
| N51 | every checkpoint on main rewrote docs/STATUS.md, about ten commits that night, and pushes needed an autostash around the other session's edit | real, and inside a recorded decision (docs/decisions/2026-09-19-records-are-written-at-checkpoint-time-m-554d.md) that puts index writes in every checkpoint; the likely cause is the index's Updated column | lane records-host, inside the decision |
| N52 | detect a second live session in the checkout and warn | real: the journal has what is needed | lane records-host |
| N53 | one task swallowed a whole day of unrelated work; prompt to split | real, not built | backlog B74 |
| N54 | the managed block was rewritten twice in one evening, mid-session, which the report says discards the prompt cache | the automatic path runs only at session start (lib/auto-prepare.mjs, commands/hook.mjs); a mid-session rewrite comes from an assistant running `migrate --apply`. Whether Claude Code re-reads CLAUDE.md mid-session, and the cache cost, are **unverified** | backlog B75 names the test |
| N55 | `security record` exited 2 with no reason; it was the reviewer label | partly: the refusal lists every possible cause without naming the field | lane security-loop |
| N56 | another session edited a user-level skill and the repository's copy diverged, found as a red build | the copy is the host's own file, not Skilliton's | backlog B76 |
| N57 | gate verdicts do not separate the change from the machine (another session's browser, untracked file, skill edit; about 45 minutes of reruns) | real, not built; the repository used its own gate, not `skilliton gate` | backlog B77 |
| N58 | `security findings` writes 25 lines into the backlog the owner reads daily | real; moving it is a records layout change | backlog B78 |
| N59 | "SKILLITON_LESSONS not set; injecting nothing" at every session start | already fixed on main in 9ffa3b9 (context-hygiene 0.3.1); it reaches installs with 1.0.1 | |

## Also said in the report, and checked

- "The header format changed in its newer version": not borne out. Skilliton's task-record header is unchanged since 2026-09-16 (`git log -S"Kind: Living. Task record."` finds only the two original commits); the conflict is with the host's own convention, which is N50.
- "The checkpoint hook is satisfied by a task-record note": the maintenance reminder was never quieted by a checkpoint in the code; it was simply never due, which is N48.
