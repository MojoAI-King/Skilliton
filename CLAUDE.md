# Skilliton: session contract

Kind: Living.

All preparation/security source, tests, demo, verification and archived design notes are in this checkout. Read docs/AUTOPILOT_START_HERE.md for the material index and docs/BUILD_GOAL.md for the full execution objective; no earlier chat or sibling worktree is required.

Read PLAN.md v4 before doing anything. It is the canonical development-autopilot direction; its milestones supersede the older day-by-day scope. Then read docs/HANDOFF.md (where things stand), DECISIONS.md (every choice and the open items), docs/CONTRACTS.md (shared names and formats), and docs/LESSONS.md (what went wrong here and what now prevents it). docs/MAINTAIN.md lists this repo's own end-of-session steps.

Rules for every session in this repo:
- Continue authorized work from the current milestone in PLAN.md and docs/HANDOFF.md. Use docs/AUTOPILOT_INTEGRATION.md for the next integration. Do not revive a superseded branch roadmap or wait for an obsolete day number. Keep unverified gates open.
- Agree shared files and interfaces before parallel implementation. Preserve other sessions' work. The integrating session owns shared contracts, PLAN.md and final decision/status reconciliation.
- Nothing silent, ever. A crashed check, a missing field, or an unverified assumption is reported as such, never rounded up to success.
- Do not invent Claude Code hook or plugin capabilities. If a behavior is not confirmed in the official docs or by running it, say "unverified" and propose the test.
- No dollar or percentage savings claims anywhere in this repo unless produced by scripts/token-cost.mjs and cross-checked. See PLAN.md Sections 6 and 8 and DECISIONS.md O2/O3.
- No em dashes or en dashes in any file.
- Do not touch client material. Public examples are sanitized copies only. No client, evaluator, or personal names anywhere in this repo; run scripts/scrub-check.sh before every commit.

<!-- skillgate:harness:start v1 -->
## How we work here (Skilliton)

This block is managed by Skilliton. The company edits it in its skills repository (`packs/base/plugins/workflow/templates/harness.md`), and it reaches this project when `skillgate harness --apply` or a project migration runs. Text outside this block belongs to the project.

Each behavior is marked **enforced** (a hook of an installed, enabled plugin does it on a supported client event), **instructed** (you, the assistant, are asked to do it), or **checked at merge** (the shared repository's trusted delivery checks decide). Hooks are proved on Claude Code. Codex does not run hooks shipped inside plugins, asks a person to trust each hook a team configures, and has no plugins in its IDE extension, so in Codex treat every enforced line as instructed unless your company has set up and verified its Codex hooks.

### Project records
- Status `docs/STATUS.md`; backlog `docs/BACKLOG.md` (finished items move to `docs/BACKLOG_ARCHIVE.md`); roadmap `PLAN.md`; decisions `DECISIONS.md`, one entry per file in `docs/decisions/`; lessons `docs/LESSONS.md`, entries in `docs/lessons/`; handoff `docs/HANDOFF.md`; this repository's own maintenance steps `docs/MAINTAIN.md`; one task record per piece of work in `docs/tasks/`.
- The shared records (status, backlog, handoff and the indexes) are written on `main` only. On any other branch, record progress in that branch's task record, and propose decisions and lessons as new entry files.
- Commands below are `skillgate <command>`. In Claude Code the workflow plugin puts `skillgate` on the shell path. If it is not found, say so, then use the `bin/skillgate` next to the workflow skills you were given, or `node scripts/skillgate.mjs` in the company skills repository.

### Start of a session
- **Enforced:** the latest `RESUME HERE` from `docs/HANDOFF.md` and a "Project state" block (pending migrations, versions, the current task, an interrupted previous session, a stale handoff, security evidence counts) are shown. **Instructed:** read both, check their claims against the files and `git status`, and tell the user in two or three plain sentences where things stand and what is missing or stale. If the block is absent, run `skillgate status`.
- **Instructed:** if there is no current task, ask what the user wants to get done before exploring the code.

### Starting a piece of work
- **Instructed:** before changing code, turn the request into a task record with acceptance criteria: `skillgate task start "<title>" --criteria "<criterion>" --apply` (repeat `--criteria`). Keep one task per branch; small work may stay on the current branch.
- **Instructed:** when the user gives six or more separate tasks, bugs or notes, use `/workflow:dispatch` to verify and split them before writing code.
- **Instructed:** explain what you are about to change in plain language before changing it, especially for users who are not developers.

### While working
- **Enforced:** when you try to finish with changes and no recent checkpoint, the stop hook asks you to record one. **Instructed:** record a checkpoint whenever something is decided, verified or blocked: `skillgate checkpoint --state "<what is true now>" --evidence "<what ran and its result>" --next "<next step>" --apply`. Record a decision as its own entry: `skillgate record decision "<title>" --apply`, then fill in the file.
- **Instructed:** never load a large file whole; search it or read the part you need. Keep command output out of the conversation when a summary will do.
- **Enforced (guardrails enabled, shell commands the assistant runs):** force-pushes to protected branches, skipped git hooks and secret-shaped commits are blocked; commands that throw away uncommitted work need confirmation, and in Codex they are blocked instead. Other terminals and indirect commands are not covered. **Instructed:** when a command is blocked, explain why and offer a safe next step; never try to get around a block.

### Before committing
- **Instructed:** run `/workflow:review` and show its summary: what changed, what could break, what was tested, and the security evidence state from `skillgate security status`.
- **Instructed:** run the project's tests and read the result before committing. Never commit on a failing test without the user explicitly agreeing.
- **Checked at merge:** where the delivery gate is installed, the shared branch accepts only a combined result that passes the checks in `.skillgate/delivery.json`, and policy changes need an approver's signature. Local checks and security evidence do not replace that gate, and none of it is a compliance certification.

### End of a stretch of work
- **Instructed:** when the work is finished, when the user is stepping away, or when the conversation has grown large, run `/workflow:handoff`. On `main` it updates `docs/HANDOFF.md`; on other branches it updates the task record.
- **Instructed:** after merging a batch of work or at the end of a working day, run `/workflow:maintain` on an integration branch, then `skillgate index --apply`.

### Always
- **Instructed:** say "I don't know" or "not verified" instead of guessing; never report a failed or skipped check as a success; keep done locally, merged, released, installed and verified separate.
- **Instructed:** never write a secret value (keys, tokens, passwords) into any file, commit or message.
<!-- skillgate:harness:end -->
