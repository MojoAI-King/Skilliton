# Evidence

Kind: Living. What was measured, by folder. Nothing here is edited after the fact; a later measurement gets a new file.

| Folder | What it holds | Made by |
|---|---|---|
| `live/` | One file per real session or probe on a real client, dated: guardrails denials, joining this machine, the VS Code extension session, the hosted delivery gate, the private repository, the first real dispatch | Pasted from the session by the person who ran it |
| `rehearsals/` | Scripted end-to-end rehearsals with their summaries: projects, company release, fork, machine, live clients; one folder per run, dated | `scripts/rehearsals/*.mjs` |
| `06880a62f9...`, `e87d2d1f55...` | The first eval runs of the `task` and `security` skills (cases `task-start-records-work`, `security-status-honest`, one with a Sonnet judge), one summary per case; the folder is named by the commit evaluated | `claude plugin eval` |
| `15b842e883...`, `325d38f95a...`, `d5a37499fc...` | Later eval runs of the workflow skills, summarised to `SUMMARY.md` and `summary.json`; named by the commit evaluated | `scripts/evidence.mjs` from `claude plugin eval` |
| `1242dcb/` | The code-quality pack's eval evidence in three passes: four cleanup skills run with and without, one shipped (docs/not-shipped.md has the scores) | `claude plugin eval`, summarised by hand in its README |
| `day-1/` | The first hook fixture run, written on 2026-09-16 | `scripts/hook-fixture.test.sh --write-evidence` |
| `autopilot-foundation/` | Validation of the prototype import that this repository started from | The prototype's own scripts |

A folder named by a commit hash is an evaluation of the product at that commit. `scripts/evidence.test.mjs` checks that every generated summary matches its JSON.
