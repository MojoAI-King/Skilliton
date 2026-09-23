## How we work here (Skilliton)

Skilliton's block (`packs/base/plugins/workflow/templates/harness.md`); text outside: the project's.

**Enforced**: plugin hook, installed/enabled, fires. **Instructed**: asked of assistant. **Checked at merge**: shared delivery checks decide. Proved only on Claude Code (Codex: no plugin hooks, manual trust per hook, no IDE plugins); treat enforced as instructed unless verified.

### Project records
- Status `{{status}}`, backlog `{{backlog}}` (done to `{{backlogArchive}}`), roadmap `{{roadmap}}`, decisions `{{decisions}}`/`{{decisionsDir}}`, lessons `{{lessons}}`/`{{lessonsDir}}`, handoff `{{handoff}}`, maintain `{{maintain}}`, tasks `{{tasksDir}}/`. Shared records go on `{{integrationBranches}}` only; elsewhere, the task record; propose decisions/lessons as new entries.
- Commands: `skilliton <command>` (PATH via `skilliton join`, or plugin `bin/` after install). Missing: say so, use `bin/skilliton` or `node scripts/skilliton.mjs`.

### Start of a session
- **Enforced:** shows `{{handoff}}`'s `RESUME HERE`, "Project state" (layout, migrations, versions, records, security). **Instructed:** check files/`git status`, tell the user in 2-3 sentences what's stale; absent, run `skilliton status`; no task, ask what's wanted.

### Starting work
- **Instructed:** before changing code, make a task record with acceptance criteria: `skilliton task start "<title>" --request --criteria --apply` (repeat `--criteria`); one task/branch, small work may stay on it; explain changes plainly, especially for non-developers. **Enforced (Claude Code):** 6+ items in a prompt (`dispatch.minItemsForLanes`): prompt-hook nudge for `/workflow:dispatch`, repeated by the stop hook if no `LANES.md` follows; run it, or note items aren't separate, carry on.

### While working
- **Enforced:** stop hook asks for checkpoint when none recent. **Instructed:** checkpoint on decision, verification, block: `skilliton checkpoint --state --evidence --next --apply` (`--handoff` writes `{{handoff}}` on integration branch too); decision: `skilliton record decision "<title>" --apply`, fill in. **Enforced (guardrails):** blocks force-pushes to protected branches, skipped hooks, secret-shaped commits, removing Skilliton's files (`.skilliton/`, records, `CLAUDE.md`/`AGENTS.md`, this block) only via `skilliton remove --apply`, by a person; discarding uncommitted work needs confirmation (blocked in Codex); other terminals/indirect not covered. **Instructed:** explain, offer an alternative, never bypass.

### Session cost
- **Enforced (context-hygiene):** whole-file read over 50KB (non-image) refused, with reason; read ranges, search, summarize via bounded script. **Instructed:** run checks via `skilliton gate` (policy, else `npm run verify`, else `--cmd`); prints a verdict, not a transcript; never pipe through `head`/`tail`; skip it when a summary works; batch inspections, don't poll; brief a subagent with a bound. **Enforced (team settings):** auto-compacts at `autoCompactWindow`; don't wait: write handoff, end session as context grows; pick model at start, not mid-way; cost claims: only the company's meter vs the client's usage screen.

### Before committing
- **Instructed:** run `/workflow:review` (changed, could break, tested, security evidence: `skilliton security status`); run tests, read results; never commit on a failing test without explicit user agreement. **Checked at merge:** shared branch accepts only a combined result passing `.skilliton/delivery.json`'s checks; policy changes need an approver's signature; local checks/security evidence neither replace that gate nor certify compliance.

### End of a stretch of work
- **Instructed:** run `/workflow:handoff` when work ends, the user steps away, or the conversation grows large; on `{{integrationBranches}}` it updates `{{handoff}}`, elsewhere the task record. **Enforced (on `{{integrationBranches}}`):** stop hook blocks first stop (once/commit): a merge, 15 commits, a day-with-commit since last `skilliton maintain`, or handoff 15+ behind. **Instructed:** run `skilliton maintain --apply`, record decisions/lessons, reconcile status/backlog with what merged, write handoff; do this after a batch merge too.

### Always
- **Instructed:** say "I don't know"/"not verified" instead of guessing; never report a failed/skipped check as success; keep done locally, merged, released, installed, verified separate; never write a secret (keys, tokens, passwords) into any file, commit, message.
