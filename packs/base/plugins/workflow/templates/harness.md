## How we work here (Skilliton)

This block is managed by Skilliton. The company edits it in its skills repository (`packs/base/plugins/workflow/templates/harness.md`), and it reaches this project when `skilliton harness --apply` or a project migration runs. Text outside this block belongs to the project.

Each behavior is marked **enforced** (a hook of an installed, enabled plugin does it on a supported client event), **instructed** (you, the assistant, are asked to do it), or **checked at merge** (the shared repository's trusted delivery checks decide). Hooks are proved on Claude Code. Codex does not run hooks shipped inside plugins, asks a person to trust each hook a team configures, and has no plugins in its IDE extension, so in Codex treat every enforced line as instructed unless your company has set up and verified its Codex hooks.

### Project records
- Status `{{status}}`; backlog `{{backlog}}` (finished items move to `{{backlogArchive}}`); roadmap `{{roadmap}}`; decisions `{{decisions}}`, one entry per file in `{{decisionsDir}}/`; lessons `{{lessons}}`, entries in `{{lessonsDir}}/`; handoff `{{handoff}}`; this repository's own maintenance steps `{{maintain}}`; one task record per piece of work in `{{tasksDir}}/`.
- The shared records (status, backlog, handoff and the indexes) are written on `{{integrationBranches}}` only. On any other branch, record progress in that branch's task record, and propose decisions and lessons as new entry files.
- Commands below are `skilliton <command>`. Two routes put it on the path: the terminal command `skilliton join` writes into `~/.local/bin` (measured as the one a session resolves first), and the workflow plugin's `bin/`, which Claude Code adds to the Bash tool's PATH in a session started after the plugin was installed (measured). If it is not found, say so, then use the `bin/skilliton` next to the workflow skills you were given, or `node scripts/skilliton.mjs` in the company skills repository.

### Start of a session
- **Enforced:** the latest `RESUME HERE` from `{{handoff}}` and a "Project state" block (pending migrations, versions, the current task, an interrupted previous session, a stale handoff, security evidence counts) are shown. **Instructed:** read both, check their claims against the files and `git status`, and tell the user in two or three plain sentences where things stand and what is missing or stale. If the block is absent, run `skilliton status`.
- **Instructed:** if there is no current task, ask what the user wants to get done before exploring the code.

### Starting a piece of work
- **Instructed:** before changing code, turn the request into a task record with acceptance criteria: `skilliton task start "<title>" --request "<the user's words>" --criteria "<criterion>" --apply` (repeat `--criteria`; the request is what the user asked for, the criteria are what done means). Keep one task per branch; small work may stay on the current branch.
- **Instructed:** when the user gives six or more separate tasks, bugs or notes, use `/workflow:dispatch` to verify and split them before writing code.
- **Instructed:** explain what you are about to change in plain language before changing it, especially for users who are not developers.

### While working
- **Enforced:** when you try to finish with changes and no recent checkpoint, the stop hook asks you to record one. **Instructed:** record a checkpoint whenever something is decided, verified or blocked: `skilliton checkpoint --state "<what is true now>" --evidence "<what ran and its result>" --next "<next step>" --apply`; add `--handoff` on an integration branch to write the shared handoff (`{{handoff}}`) in the same write. Record a decision as its own entry: `skilliton record decision "<title>" --apply`, then fill in the file.
- **Enforced (guardrails enabled, shell commands the assistant runs):** force-pushes to protected branches, skipped git hooks and secret-shaped commits are blocked, and so is removing what Skilliton keeps here (the `.skilliton` folder, the records, `CLAUDE.md` and `AGENTS.md`), for which `skilliton remove --apply`, run by a person, is the one route; a write that would take this block out of `CLAUDE.md` or `AGENTS.md` is refused; commands that throw away uncommitted work need confirmation, and in Codex they are blocked instead. Other terminals and indirect commands are not covered. **Instructed:** when a command is blocked, explain why and offer a safe next step; never try to get around a block.

### Session cost
- **Enforced (context-hygiene enabled, Claude Code):** a whole-file read of a non-image file over 50KB is refused, with the reason. **Instructed:** never load a large file whole; read a range with offset and limit, search it, or summarize it with a script that prints a bounded result.
- **Instructed:** run the project's checks through `skilliton gate` (the delivery policy's checks, else `npm run verify`, else `--cmd "<command>"`). It keeps the full output in a log under `.git/skilliton/gate/` and prints the verdict from the exit status with the tree it ran on, so a test run reaches the conversation as a result, not a transcript. Never pipe a check through `head` or `tail`, and keep other command output out of the conversation when a summary will do.
- **Instructed:** batch independent inspections into one call and do not poll. A subagent is a session of its own: brief it with a bound and ask for a conclusion, and never spawn one where a direct lookup would do.
- **Enforced (Claude Code, where the team settings are applied):** the session compacts automatically at the window `autoCompactWindow` sets in `.claude/settings.json`. **Instructed:** do not wait for it: when finished work has grown the context, write the handoff and end the session; pick the model at the start of a session rather than switching mid-way. Any statement about cost or savings comes from the company's meter cross-checked against the client's usage screen, never from an estimate.

### Before committing
- **Instructed:** run `/workflow:review` and show its summary: what changed, what could break, what was tested, and the security evidence state from `skilliton security status`.
- **Instructed:** run the project's tests and read the result before committing. Never commit on a failing test without the user explicitly agreeing.
- **Checked at merge:** where the delivery gate is installed, the shared branch accepts only a combined result that passes the checks in `.skilliton/delivery.json`, and policy changes need an approver's signature. Local checks and security evidence do not replace that gate, and none of it is a compliance certification.

### End of a stretch of work
- **Instructed:** when the work is finished, when the user is stepping away, or when the conversation has grown large, run `/workflow:handoff`. On `{{integrationBranches}}` it updates `{{handoff}}`; on other branches it updates the task record.
- **Enforced (Claude Code, on `{{integrationBranches}}`):** when a merge commit landed, or a day and at least one commit passed, since the last maintenance, the stop hook blocks the first stop, once per commit, with a paragraph naming `skilliton maintain --apply` (the indexes, the security findings, the maintenance recorded) and the judgment half. **Instructed:** do both before finishing: run that command, then record the decisions and lessons from this conversation as entry files, reconcile the status record and the backlog with what merged, and write the handoff (`/workflow:maintain` has the steps). Run it yourself after merging a batch when you would rather not wait for the stop.

### Always
- **Instructed:** say "I don't know" or "not verified" instead of guessing; never report a failed or skipped check as a success; keep done locally, merged, released, installed and verified separate.
- **Instructed:** never write a secret value (keys, tokens, passwords) into any file, commit or message.
