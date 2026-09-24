# A newcomer walkthrough of the public documents, by a model session

Kind: Evidence. **A model session, not a person:** Claude Opus 5.5 played an engineer who had never seen Skilliton, working only from the public documents of a fresh clone from GitHub at ad9a781, in a disposable folder, on 2026-09-23 at 23:53 EDT to 2026-09-24 about 11:33 EDT (the agent stalled for about eleven hours in the middle; the work itself took under two hours). The five assistant sessions it ran were headless Claude Code 2.1.278 sessions on claude-sonnet-5, with the plugins loaded from the clone and the user's own settings skipped. Every Claude Code plugin command ran with `CLAUDE_CONFIG_DIR` pointing at an empty folder and from a folder that was not a repository, so no real configuration changed. This is the rehearsal an outside review asked for, run by a model; the same walk by a person (backlog B1) is still the owner's to arrange.

## What it walked, and how it went

| Step | Result | What happened |
| --- | --- | --- |
| 1. The demo with nothing installed | pass | exit 0 in 3.1 s, six PASS lines, the output made sense; `node scripts/checks.mjs` read 81 pass, 0 fail, 2 skipped of 83 in 407 s |
| 2. The try path, then the team path's first steps | pass, as far as it can go without a login | marketplace and four plugins installed in 4 s (workflow 0.24.0, guardrails 0.10.0, context-hygiene 0.3.1, code-quality 0.2.1); doctor as INSTALL describes; preflight 40 ok, 1 not checked; a join preview; verify refused until trust, then all four VERIFIED against 1.3.0 |
| 3. Prepare a disposable project | pass | the preview listed 20 files and the apply wrote exactly those; a rerun changed nothing |
| 4. A normal piece of work | pass, handoff partial | the session opened a task record with criteria, made the change and its test (4 of 4 pass), and recorded a checkpoint; it did not write the shared handoff, and left the criteria unticked and the task open |
| 5. An interruption and a fresh-session resume | pass for the result, partial for the signals | the first session ran out of turns mid-task with a bug and no checkpoint; the next session, told only "Carry on where the last session left off", read the task record and the diff, found and fixed the bug, finished, and ended 9 of 9 tests passing. The start said the previous session "ended normally", and its checkpoint, written by hand into the task file, was not counted |
| 6. Upgrade and rollback | pass for the commands, partial for what they change | `pin --release 1.2.0` and `pin --latest` moved the clone and back; the installed plugins did not move, and verify did not say so |
| 7. The day-one guards | pass for the guards; the stop reminder did not reproduce | the read guard refused a 242 KB whole-file read; `git clean -f` asked; `--no-verify`, a force-push to main and removing the handoff were blocked, each with the reason and the safe alternative. The stop reminder held once by hand and never again for the same tree, including after more edits |

## Friction, and what was done about it

No blockers. Six slowdowns and thirteen papercuts; each is listed with where it went.

| Friction | Where it went |
| --- | --- |
| The stop reminder did not reproduce: the tree's fingerprint is HEAD and `git status`, so editing a file that was already changed never re-arms it, and a short session was never held | the first-stop hold (workflow 0.25.0, `checkpoints.holdFirstStop`) and a content digest in the fingerprint (lane friction, N34) |
| A session that ran out of turns read "ended normally" at the next start | lane friction, N35 |
| No documented way to try the team path against this repository itself | INSTALL.md, "To try the team path against this repository itself" |
| A rollback moved the clone but not what runs, and verify did not say so | `pin` now moves Claude Code's marketplace to the release tag (workflow 0.25.0, B18); verify names a clone and install that disagree (lane friction, N39) |
| A checkpoint written by hand was silently not counted | lane friction, N36 |
| Who ticks criteria and closes a task was not documented, and closing did not refresh the index | docs/ONBOARDING.md section 3, step 6; lane friction, N37 |
| `ssh-keygen -V` fails on macOS | INSTALL.md: `command -v ssh-keygen` |
| `preflight` and the `join` preview probe `~/.local/bin` | INSTALL.md names `--bin-dir` for both |
| Moving from the try path to the team path was not described | INSTALL.md, "From the try path to the team path" |
| "a temporary folder" did not say `$TMPDIR` | INSTALL.md |
| No duration for the full check list | INSTALL.md: about 7 minutes |
| The demo's rejection showed "failing tests:" with nothing after it | lane friction, N41 |
| doctor outside a repository said to prepare it; hints printed relative paths | lane friction, N40 |
| The removal path ignored `CLAUDE_CONFIG_DIR` | INSTALL.md |
| Preparing does not write `.claude/settings.json`, and nothing said so | docs/ONBOARDING.md section 2 |
| `pin` on the newest release suggested pinning to it again | lane friction, N38 |
| The pin record was missing from the allow list | docs/IT-ALLOWLIST.md |
| INSTALL and ONBOARDING disagreed on the tested Node versions | INSTALL.md |

## What worked better than expected, in the session's words

The resume worked from the task record and the diff alone and fixed the previous session's bug; every guard refusal said why and gave the safe alternative; every preview matched its apply file for file; the demo ran in 3 seconds and the installs in 4.

## The assistant sessions it ran

| Session | Turns | Input tokens, cache included | Output tokens | Wall time |
| --- | --- | --- | --- | --- |
| a normal task | 12 | 322,627 | 2,830 | 29.5 s |
| interrupted by its turn limit | 7 | 212,995 | 2,233 | 20.5 s |
| the resume | 17 | 546,120 | 5,211 | 52.5 s |
| "throw away everything I haven't committed" | 2 | 67,272 | 323 | 3.9 s |
| the guards, command by command | 6 | 211,561 | 2,192 | 22.2 s |
| total | 44 | 1,360,575 | 12,789 | 128.7 s |

Where it stepped outside its folder, as it reported: the first demo run used the system temporary folder before `TMPDIR` was set (and cleaned up); `preflight` and the `join` preview each wrote and removed a probe file in `~/.local/bin`; the headless sessions wrote their transcripts under the user's Claude Code projects folder; the documented `gh api` call and the client's own marketplace commands reached GitHub.
