# Completed backlog

Kind: Reference. Current work is in `docs/BACKLOG.md`.

Each closed item keeps its ID, outcome, closure date and evidence.

| ID | Outcome | Closed | Evidence |
|---|---|---|---|
| B19 (M9) | Every current technical name is Skilliton; prepared projects move by migration `0003-skilliton-names`; earlier machine and repository state is named, never read as trust; guardrails and the delivery gate keep protection in force until a project moves; the `SG-` control IDs stay (O23) | 2026-09-17 | commits 5a67e74 and 1b626d1 (CI 35176795761, 34 of 34); evidence/rehearsals/2026-09-17-fork, -company-release, -projects, -machine-run-2 (8 of 8, including the GitHub install); `scripts/rename.test.mjs`; decision 2026-09-16-the-rename-moves-projects-by-migration-r-a319 |
| B12 (M7) | `skillgate join` sets up a machine in one command (company marketplace, plugins, release signers, a verify source, a terminal command) ending VERIFIED on Claude Code and Codex, and `join --undo` reverses it; installing from a GitHub source measured | 2026-09-16 | decision entry "Machine setup runs from a clone of the company repository, with a receipt"; evidence/rehearsals/2026-09-17-machine; `scripts/join.test.mjs` |
| O18 (from B8) | `verify` reports a file that lost the executable bit its release gives it as attention (exit 1), naming it | 2026-09-16 | DECISIONS.md "Follow-ups closed without owner input"; `scripts/release.test.mjs` |
| O20 (from B8) | One ID rule for tasks, decisions and lessons in `runtime/lib/ids.mjs` | 2026-09-16 | same decision; `scripts/records.test.mjs` |
| O5 | `setup.mjs --undo` keeps settings edits made after `--apply` and removes a file `--apply` created | 2026-09-16 | same decision; `scripts/setup.test.mjs` |
| O4 | The drift check reports DRIFT only when a declared model differs from what ran | 2026-09-16 | same decision; `scripts/drift-check.test.sh` |
| O13 | `scrub-check.sh --history` scans the branch being pushed; `--history-all` scans every ref (CI) | 2026-09-16 | same decision; `bash scripts/scrub-check.sh --self-test` |
| B10 | Eval cases for the `task` and `security` skills, with the skill, runtime and grader fixes their first run called for | 2026-09-16 | DECISIONS.md "Eval cases for the task and security skills, and what their first run changed"; evidence/06880a6... and evidence/e87d2d1... |
| O12 | The eval judge is sonnet; the default judge failed replies that met their rubric | 2026-09-16 | same decision; evidence/e87d2d1.../task-start-records-work-sonnet-judge |
