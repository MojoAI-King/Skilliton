# Owner walkthrough: the fourteen things only you can do, in order

Kind: Living. Written for the owner. Every acceptance item left in docs/REPORT_CARD.md that a headless session cannot reach is here, once, in the order that wastes the least of your time. Nothing in this file asks you to write code. **For the evening before the 2026-09-23 meeting, start with docs/OWNER_TESTS.md**: it is the short list of what can be done tonight on this machine, with the exact commands, and it says which steps below it covers. Updated 2026-09-22: steps 3 and 6 and parts of step 2 were measured by headless sessions that day, and the items they ticked are named where they appear.

## How to work through it

**The order is not arbitrary.** Step 1 unblocks `skilliton verify` for every later step, so it comes first even though it is the shortest. Steps 2 and 3 are one sitting and settle nine acceptance items between them. Steps 4 and 5 are five minutes each on two different days, so start step 4 the first evening you think of it and let the rest of the list run in parallel.

**You observe; a later session files the doc rows.** For each step, note what you saw, in the exact words the client showed, and save it as `evidence/live/<date>-<short name>.md` in the shape of the files already in that folder: an H1 reading `Live check: ...`, a `Kind: Reference.` line carrying the date and the client version, the pasted lines in one fenced block, each numbered observation marked seen or not seen, then `What this shows` and `What it does not show`. Write `<home>` for any home path. Then `bash scripts/scrub-check.sh evidence/live/<the file>` before it is committed.

**Not seen is a result.** A step that fails is a finding with a fix and a test, not a step to repeat until it passes. A box is ticked only for what was actually observed, so a half-seen step ticks half its items and the rest stay open with the reason written down. That rule is why the bars in the report card can be trusted.

**Where the detail lives.** Each step below names its batch file. That file carries the full protocol, the exact commands and the filing instructions; this list is the order and the reason, not a second copy of them.

## 1. Your signing key and the first signed release

- **Needs:** an SSH signing key you are willing to approve releases with, and a version number to call the first release.
- **Do:** follow docs/RELEASING.md section 1 step 4 and section 2 step 5. Put your own line in an `allowed_signers` file, then on `main`: `node scripts/skilliton.mjs release create --version <x.y.z> --evidence <summary files> --apply`, commit the manifest, `node scripts/skilliton.mjs release sign <x.y.z> --apply`, push the tag. Then `node scripts/skilliton.mjs verify` on this machine.
- **Good looks like:** verify prints VERIFIED for all three plugins instead of UNKNOWN VERSION, and `release list` shows the version as approved.
- **Ticks:** 08-01 items 2 and 3. It also changes what every later step sees, because `verify` is the line that currently reads UNKNOWN VERSION everywhere.
- **Why first:** it costs one sitting and it is the only step whose output the other thirteen depend on.
- **Batch:** docs/areas/08-make-it-yours/batch-01-first-signed-release.md

## 2. One session in this repository, in the VS Code extension

- **Needs:** a brand new session in the Claude Code VS Code extension in this repository, started after the plugins were installed on 2026-09-19. Not `--plugin-dir`, not the session that is already open.
- **Do:** the seven numbered checks in the batch file's own protocol: the Project state block and the RESUME HERE note at start; a blocked `git commit --no-verify`; the guardrails confirmation prompt on `git checkout -- .` with an uncommitted change, answered no; the eight slash skills under `/`; a whole-file read of `scripts/skilliton.test.mjs` refused by the read guard; the stop hook asking for a checkpoint when you end with changes and none recorded; and one real test run through `skilliton gate` with its log path.
- **Good looks like:** each of the seven either happened with text you can paste, or did not, with that written down. The status line is the eighth thing to look at while you are there.
- **Ticks:** 01-01 item 3 (the confirmation prompt), 03-01 items 1 and 2. The rest of 01-01, 04-02 items 3 and 4, and 07-04 item 2 are ticked already, the last by the headless dispatch runs of 2026-09-22.
- **Settled since:** 04-01 item 5, the window, was measured on 2026-09-22: the day's automatic compactions happened at 568433 and 569293 tokens under the project's 600000 (evidence/live/2026-09-22-compaction-window-measured.md).
- **Batch:** docs/areas/01-autopilot-loop/batch-01-install-and-live-use.md, with docs/areas/03-any-environment/batch-01-vscode-column.md and docs/areas/04-token-efficiency/batch-02-guard-and-gate-live.md

## 3. Two real lanes, dispatched from that same session

- **Needs:** nothing new. Do it before you close the session from step 2.
- **Do:** give the session six or more separate notes or tasks so `/workflow:dispatch` is the right tool, let it split them, then launch at least one lane from the line the brief prints. When both lanes are done, `skilliton usage` for the window they ran in.
- **Good looks like:** a lane agent starts from the brief with the shipped agent definition, each lane writes its own task record in its own worktree, and the meter's `peak_ctx` column shows a number per lane.
- **Ticks:** nothing left: 07-02 and 04-03 item 3 were ticked from the first real dispatch on 2026-09-21 (evidence/live/2026-09-21-dispatch.md). Do it anyway if you want to watch dispatch in the extension; since workflow 0.20.1 the prompt hook directs it on its own.
- **Batch:** docs/areas/07-dispatch-worktrees/batch-02-lane-agents-bounded.md

## 4. The maintain minutes, one day before

- **Needs:** five minutes at the end of any working day, before you adopt the rolling maintenance the fourth wave shipped.
- **Do:** run the end-of-day maintain the way you have been running it, and note the minutes on a clock.
- **Good looks like:** one number, reported by you. Nothing measures this for you and nothing should.
- **Ticks:** half of 05-05 item 1. It is the before half of the only claim this repository makes about your time, so without it the after half means nothing.
- **Batch:** docs/areas/05-repo-maintenance/batch-05-maintain-time-measured.md

## 5. The maintain minutes, one day after

- **Needs:** a different day, after at least one day of checkpoints written with `skilliton checkpoint --handoff --apply`.
- **Do:** the same thing, timed the same way.
- **Good looks like:** a second number. If it is not smaller, say so: that is a finding about the rolling maintenance, and it is more useful than a number that flatters it.
- **Ticks:** 05-05 item 2 and 01-02 item 5.
- **Batch:** the same file as step 4.

## 6. One unprepared repository, harnessed live

- **Needs:** any repository on this machine that Skilliton has never touched. A scratch clone is fine.
- **Do:** open a session in it and answer yes to the offer at session start. Watch what the preview says before you accept it, then let it write the first task record from your first request.
- **Good looks like:** the offer appears, the preview matches what is written, a delivery policy draft is written from the test command it detected, and the first task record carries acceptance criteria it proposed.
- **Ticks:** nothing left: 02-01 item 5 was ticked from the headless auto-prepare run of 2026-09-22. On a joined machine the repository is now prepared at session start without an offer, so what you would watch is that.
- **Batch:** docs/areas/02-auto-harness/batch-01-m8-second-increment.md

## 7. One Codex session in a prepared repository

- **Needs:** a logged-in Codex in an isolated home (backlog B2). This is the blocker, not the session.
- **Do:** open a prepared repository in Codex and record which lifecycle hooks fired and which did not.
- **Good looks like:** every enforced line in the harness confirmed as instructed rather than enforced there, which is what the 2026-09-20 decision already predicts. A hook that does fire would be the surprise, and would be a better finding than a confirmation.
- **Ticks:** 01-05 items 1 and 2, and 03-03 item 3.
- **Batch:** docs/areas/01-autopilot-loop/batch-05-codex-parity.md

## 8. The clean macOS account

- **Needs:** a fresh user account on a Mac, and no Skilliton anywhere in it.
- **Do:** run the drop-in and the first-login install as a person arriving at a new machine would, and file the output.
- **Good looks like:** the install completes without a step that needed knowledge you already had. Where you had to know something, that is a docs fix.
- **Ticks:** 02-03 items 1 and 3. Item 2 is already closed: the session start now says enrollment comes first when the plugins a project enables are not installed for the user.
- **Batch:** docs/areas/02-auto-harness/batch-03-macos-enrollment.md

## 9. The Windows run

- **Needs:** the Windows machine.
- **Do:** run every command in docs/WINDOWS.md and file the output under `evidence/live/windows/`. Pay particular attention to section 4's open question about the bare program name, and to whether the `skilliton.cmd` launcher join writes actually runs.
- **Good looks like:** each failure carries either a fix with a test or a documented limitation. The launcher has a content test and has never been executed on Windows, so this is the first time anyone finds out.
- **Ticks:** 03-02 items 1 to 4, and it is what holds the third area at its current grade.
- **Batch:** docs/areas/03-any-environment/batch-02-windows-run.md

## 10. A throwaway hosted repository with branch protection

- **Needs:** your approval to create a disposable repository on the hosted service, and an account that can set branch protection on it.
- **Do:** let the delivery adapter configure branch protection on it, then push a deliberately defective combined change at it.
- **Good looks like:** the push is rejected by the hosted gate, naming the check that failed. A gate that has not been watched rejecting has not been tested, and this one has only ever been watched in a local bare repository.
- **Ticks:** 09-01 items 2 and 3, which is what caps the ninth area.
- **Batch:** docs/areas/09-security-delivery/batch-01-hosted-github-adapter.md

## 11. A throwaway private repository

- **Needs:** the same approval, for a private repository this time, and a credential you are willing to use on it.
- **Do:** run install, update and verify against it.
- **Good looks like:** all three work over a private source. File the output with the credential named by its location only, never its value.
- **Ticks:** 08-02 items 1 and 2. It can share a sitting with step 10 but not a repository, because one needs to be reachable by the gate and the other needs to be private.
- **Batch:** docs/areas/08-make-it-yours/batch-02-private-repository.md

## 12. The applicability decisions

- **Needs:** you, a list, and about an hour. No machine.
- **Do:** run `skilliton security status` in this repository, take the controls it lists as needing attention, and for each one decide: it applies and here is the evidence, or it does not apply and here is why.
- **Good looks like:** every control on that list has a recorded decision. A control marked not applicable with a reason is a finished control; a control left silent is the thing the register exists to prevent.
- **Ticks:** 05-03 item 1, which caps the security half of the fifth area.
- **Batch:** docs/areas/05-repo-maintenance/batch-03-own-security-register.md

## 13. The measured comparison

- **Needs:** the tasks, the ceiling and the measure agreed before the first run, and your usage screen open at the end.
- **Do:** agree the three, run the comparison, then read `skilliton usage` for the window and cross-check every number against the usage screen before any sentence about it is written anywhere.
- **Good looks like:** one before-and-after for one merged batch, with the reconstruction note attached to every figure. The meter is a reconstruction and the usage screen is the only real meter, so a figure that the two disagree on is reported as a disagreement.
- **Ticks:** 04-04 item 4 and 10-02 items 1 and 2.
- **Batch:** docs/areas/10-proof/batch-02-measured-comparison.md
- **The standing rule:** no dollar or percentage claim leaves this repository unless `scripts/token-cost.mjs` produced it and the usage screen agrees.

## 14. The new builder rehearsal

- **Needs:** a real person who has not seen this repository, and their time.
- **Do:** let them work through the onboarding without help, and write down every place they got stuck.
- **Good looks like:** each sticking point becomes a docs fix or a backlog item. You deferred this on 2026-09-18 to your own use of the product, so it is last on purpose.
- **Ticks:** 10-01 items 1 and 2, the whole tenth area.
- **Batch:** docs/areas/10-proof/batch-01-new-builder-rehearsal.md

## What no step here reaches

Two items are open for reasons no walkthrough can close, and they are listed so their absence is not mistaken for an oversight.

- **09-03, endpoint security.** It needs a named endpoint-security product and a policy to test under. Until you name one there is no step to write. Recorded as blocked rather than unfinished.
- **03-03 item 2, a fixture test over the Codex configuration.** The decision of 2026-09-20 is that Skilliton writes no Codex hook configuration, so there is no configuration for a test to cover. A session may not tick what it did not do, so the box stays open; removing the item is a regrade for you to make, not a tick for a session to take.

One more item is open but is not yours: 05-03 item 2 ticks from a green CI run of the evidence collectors, which a build session reads and files.
