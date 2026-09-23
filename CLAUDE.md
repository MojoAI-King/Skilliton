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

Skilliton's block (`packs/base/plugins/workflow/templates/harness.md`); text outside: the project's.

**Enforced**: plugin hook, installed/enabled, fires. **Instructed**: asked of assistant. **Checked at merge**: shared delivery checks decide. Proved only on Claude Code (Codex: no plugin hooks, manual trust per hook, no IDE plugins); treat enforced as instructed unless verified.

### Project records
- Status `docs/STATUS.md`, backlog `docs/BACKLOG.md` (done to `docs/BACKLOG_ARCHIVE.md`), roadmap `PLAN.md`, decisions `DECISIONS.md`/`docs/decisions`, lessons `docs/LESSONS.md`/`docs/lessons`, handoff `docs/HANDOFF.md`, maintain `docs/MAINTAIN.md`, tasks `docs/tasks/`. Shared records go on `main` only; elsewhere, the task record; propose decisions/lessons as new entries.
- Commands: `skilliton <command>` (PATH via `skilliton join`, or plugin `bin/` after install). Missing: say so, use `bin/skilliton` or `node scripts/skilliton.mjs`.

### Start of a session
- **Enforced:** shows `docs/HANDOFF.md`'s `RESUME HERE`, "Project state" (layout, migrations, versions, records, security). **Instructed:** check files/`git status`, tell the user in 2-3 sentences what's stale; absent, run `skilliton status`; no task, ask what's wanted.

### Starting work
- **Instructed:** before changing code, make a task record with acceptance criteria: `skilliton task start "<title>" --request --criteria --apply` (repeat `--criteria`); one task/branch, small work may stay on it; explain changes plainly, especially for non-developers. **Enforced (Claude Code):** 6+ items in a prompt (`dispatch.minItemsForLanes`): prompt-hook nudge for `/workflow:dispatch`, repeated by the stop hook if no `LANES.md` follows; run it, or note items aren't separate, carry on.

### While working
- **Enforced:** stop hook asks for checkpoint when none recent. **Instructed:** checkpoint on decision, verification, block: `skilliton checkpoint --state --evidence --next --apply` (`--handoff` writes `docs/HANDOFF.md` on integration branch too); decision: `skilliton record decision "<title>" --apply`, fill in. **Enforced (guardrails):** blocks force-pushes to protected branches, skipped hooks, secret-shaped commits, removing Skilliton's files (`.skilliton/`, records, `CLAUDE.md`/`AGENTS.md`, this block) only via `skilliton remove --apply`, by a person; discarding uncommitted work needs confirmation (blocked in Codex); other terminals/indirect not covered. **Instructed:** explain, offer an alternative, never bypass.

### Session cost
- **Enforced (context-hygiene):** whole-file read over 50KB (non-image) refused, with reason; read ranges, search, summarize via bounded script. **Instructed:** run checks via `skilliton gate` (policy, else `npm run verify`, else `--cmd`); prints a verdict, not a transcript; never pipe through `head`/`tail`; skip it when a summary works; batch inspections, don't poll; brief a subagent with a bound. **Enforced (team settings):** auto-compacts at `autoCompactWindow`; don't wait: write handoff, end session as context grows; pick model at start, not mid-way; cost claims: only the company's meter vs the client's usage screen.

### Before committing
- **Instructed:** run `/workflow:review` (changed, could break, tested, security evidence: `skilliton security status`); run tests, read results; never commit on a failing test without explicit user agreement. **Checked at merge:** shared branch accepts only a combined result passing `.skilliton/delivery.json`'s checks; policy changes need an approver's signature; local checks/security evidence neither replace that gate nor certify compliance.

### End of a stretch of work
- **Instructed:** run `/workflow:handoff` when work ends, the user steps away, or the conversation grows large; on `main` it updates `docs/HANDOFF.md`, elsewhere the task record. **Enforced (on `main`):** stop hook blocks first stop (once/commit): a merge, 15 commits, a day-with-commit since last `skilliton maintain`, or handoff 15+ behind. **Instructed:** run `skilliton maintain --apply`, record decisions/lessons, reconcile status/backlog with what merged, write handoff; do this after a batch merge too.

### Always
- **Instructed:** say "I don't know"/"not verified" instead of guessing; never report a failed/skipped check as success; keep done locally, merged, released, installed, verified separate; never write a secret (keys, tokens, passwords) into any file, commit, message.
<!-- skilliton:harness:end -->

## Session cost, in this repository

The rules are in the managed block above (its "Session cost" section) and in the context-hygiene skill; they reach every prepared project the same way. What is particular to this repository:

- `scripts/token-cost.mjs` is the meter. `node scripts/token-cost.test.mjs` must pass before its output is believed, and `--reference` must reproduce the known window on the machine that holds those transcripts (it reports NOT RUN elsewhere). `node scripts/token-cost.mjs <from> <to> --project <key>` reports a window; the key is the folder name for this checkout under the client's own projects folder, which is particular to one machine and is deliberately not written here.
- `docs/USAGE_BASELINE.md` is the frozen before-picture. Both are reconstructions, not a bill: the client's Usage screen is the only real meter, and PLAN.md sections 6 and 8 govern any number that leaves this repository.
- An image is priced by its pixels, not its bytes: read one when you are going to look at it. The read guard never refuses an image or a PDF.
