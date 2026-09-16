# Completed backlog

Kind: Reference. Current work is in `docs/BACKLOG.md`.

Each closed item keeps its ID, outcome, closure date and evidence.

| ID | Outcome | Closed | Evidence |
|---|---|---|---|
| O18 (from B8) | `verify` reports a file that lost the executable bit its release gives it as attention (exit 1), naming it | 2026-09-16 | DECISIONS.md "Follow-ups closed without owner input"; `scripts/release.test.mjs` |
| O20 (from B8) | One ID rule for tasks, decisions and lessons in `runtime/lib/ids.mjs` | 2026-09-16 | same decision; `scripts/records.test.mjs` |
| O5 | `setup.mjs --undo` keeps settings edits made after `--apply` and removes a file `--apply` created | 2026-09-16 | same decision; `scripts/setup.test.mjs` |
| O4 | The drift check reports DRIFT only when a declared model differs from what ran | 2026-09-16 | same decision; `scripts/drift-check.test.sh` |
| O13 | `scrub-check.sh --history` scans the branch being pushed; `--history-all` scans every ref (CI) | 2026-09-16 | same decision; `bash scripts/scrub-check.sh --self-test` |
| B10 | Eval cases for the `task` and `security` skills, with the skill, runtime and grader fixes their first run called for | 2026-09-16 | DECISIONS.md "Eval cases for the task and security skills, and what their first run changed"; evidence/06880a6... and evidence/e87d2d1... |
| O12 | The eval judge is sonnet; the default judge failed replies that met their rubric | 2026-09-16 | same decision; evidence/e87d2d1.../task-start-records-work-sonnet-judge |
