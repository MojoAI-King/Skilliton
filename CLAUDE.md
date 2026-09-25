# Skilliton: session contract

Kind: Living.

All preparation/security source, tests, demo, verification and archived design notes are in this checkout. Read docs/README.md for the material index and docs/archive/BUILD_GOAL.md for the full execution objective; no earlier chat or sibling worktree is required.

Read PLAN.md v4 before doing anything. It is the canonical development-autopilot direction; its milestones supersede the older day-by-day scope. Then read docs/HANDOFF.md (where things stand), DECISIONS.md (every choice and the open items), docs/CONTRACTS.md (shared names and formats), and docs/LESSONS.md (what went wrong here and what now prevents it). docs/MAINTAIN.md lists this repo's own end-of-session steps. docs/REPORT_CARD.md is the master progress report: the ten areas the owner grades this repository against, one bar per area and per batch, computed by scripts/report-card.mjs from the batch files under docs/areas/. Work is picked from its waves; a ticked acceptance item names its evidence.

Rules for every session in this repo:
- Continue authorized work from the current milestone in PLAN.md and docs/HANDOFF.md. The build is complete; docs/archive/AUTOPILOT_INTEGRATION.md is its record. Do not revive a superseded branch roadmap or wait for an obsolete day number. Keep unverified gates open.
- Agree shared files and interfaces before parallel implementation. Preserve other sessions' work. The integrating session owns shared contracts, PLAN.md and final decision/status reconciliation.
- Nothing silent, ever. A crashed check, a missing field, or an unverified assumption is reported as such, never rounded up to success.
- Do not invent Claude Code hook or plugin capabilities. If a behavior is not confirmed in the official docs or by running it, say "unverified" and propose the test.
- No dollar or percentage savings claims anywhere in this repo unless produced by scripts/token-cost.mjs and cross-checked. See PLAN.md Sections 6 and 8 and DECISIONS.md O2/O3.
- No em dashes or en dashes in any file.
- Do not touch client material. Public examples are sanitized copies only. No client, evaluator, or personal names anywhere in this repo; run scripts/scrub-check.sh before every commit.

<!-- skilliton:harness:start v1 -->
## How we work here (Skilliton)

Skilliton's block; other text is the project's.

**Enforced (E)**: a plugin hook fires. **Instructed (I)**: asked of the assistant. **Checked at merge (M)**: shared checks decide. Proved on Claude Code; elsewhere treat E as I unless verified.

### Project records
`docs/STATUS.md`, `docs/BACKLOG.md` (done: `docs/BACKLOG_ARCHIVE.md`), `PLAN.md`, `DECISIONS.md`/`docs/decisions`, `docs/LESSONS.md`/`docs/lessons`, `docs/HANDOFF.md`, `docs/MAINTAIN.md`, `docs/tasks/`. Shared only on `main`, else the task record; propose decisions/lessons. Run `skilliton <command>`; not on PATH: say so, use `bin/skilliton` or `node scripts/skilliton.mjs`.

### Start of a session
E: `docs/HANDOFF.md`'s RESUME HERE, project state (layout, migrations, versions, records, security). I: check files/git status, brief on what's stale; absent, run status; no task, ask.

### Starting work
I: before code, a task record with criteria (`skilliton task start "<title>" --apply`); one branch per task; explain plainly. E: 6+ prompt items nudge dispatch; stop hook repeats without LANES.md; run it or say otherwise.

### While working
E: stop hook nudges checkpoints. I: on decision/verify/block (`skilliton checkpoint --apply`); decisions too. E: blocks protected-branch force-pushes, skipped hooks, secret-shaped commits, file removal (person-only: `skilliton remove --apply`). Quiet mode (default): what it can make readable is refused with the fix, what it cannot read runs and is noted; it asks only before a rule is turned off or saved work is dropped. I: apply the fix, never bypass.

### Session cost
E: a read over 50KB (non-image): refused; read ranges or summarize instead. I: via `skilliton gate`; never pipe through head/tail; skip if a summary answers; batch checks. E: auto-compacts at a limit. I: handoff as context grows; cost claims: company meter vs client usage.

### Before committing
I: `/workflow:review` (changed, could break, tested, security status); run tests; never commit on a failing test without agreement. M: shared branch takes only a passing delivery result; a policy change needs approver signature; local checks aren't a substitute.

### End of a stretch of work
I: `/workflow:handoff` at end, pause, or long chat; updates `docs/HANDOFF.md` on `main`, else the task record. E: stop hook blocks the first stop after a merge, 15 commits, a day with a commit since last maintain, or handoff 15+ behind. I: then `skilliton maintain --apply`, record decisions/lessons, reconcile status/backlog, write handoff, same after a batch merge.

### Always
I: say "I don't know" or "not verified" rather than guess; never report a failed/skipped check as success; keep done locally, merged, released, installed, verified separate; never write a secret into any file, commit or message.
<!-- skilliton:harness:end -->

## Session cost, in this repository

The rules are in the managed block above (its "Session cost" section) and in the context-hygiene skill; they reach every prepared project the same way. What is particular to this repository:

- `scripts/token-cost.mjs` is the meter. `node scripts/token-cost.test.mjs` must pass before its output is believed, and `--reference` must reproduce the known window on the machine that holds those transcripts (it reports NOT RUN elsewhere). `node scripts/token-cost.mjs <from> <to> --project <key>` reports a window; the key is the folder name for this checkout under the client's own projects folder, which is particular to one machine and is deliberately not written here.
- `docs/USAGE_BASELINE.md` is the frozen before-picture. Both are reconstructions, not a bill: the client's Usage screen is the only real meter, and PLAN.md sections 6 and 8 govern any number that leaves this repository.
- An image is priced by its pixels, not its bytes: read one when you are going to look at it. The read guard never refuses an image or a PDF.
