# Project preparation and continuity rehearsal (M1, M2)

Kind: Reference. Recorded 2026-09-16 by `scripts/rehearsals/projects.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Node:** v25.8.1
- **git:** git version 2.51.1

| Step | Result | Evidence |
|---|---|---|
| N1 fresh project: preview writes nothing, apply creates layout 2, repeat apply changes nothing | PASS | preview exit 0, wrote nothing: true; apply exit 0; missing layout files: none; check exit 0; repeat apply exit 0, byte-identical: true; no copied runtime: true |
| N2 doctor recognizes the prepared project's layout, versions and instruction blocks | PASS | layout line OK: true; requires line OK: true; both harness blocks current: true (doctor exit 1; machine-level plugin lines are not part of this step) |
| A1 adoption of an existing project keeps its records, names and settings | PASS | apply exit 0; existing records byte-identical: true; adopted paths recorded: true; unrelated settings kept: true; human CLAUDE.md text kept: true; instructions name the adopted handoff: true |
| A2 adoption of a large real project (a clone of this repository) | PASS | preview 0; apply 0; living documents byte-identical: true; human rules kept in CLAUDE.md: true; exactly one managed block: true; check after apply 0 |
| G1 a prototype (layout 1) project migrates to layout 2 through the command line | PASS | prototype setup exit 0 (copied runtime present: true); prepare on layout 1 refused: exit 2; migrate preview 1, apply 0; migrated with human text kept: true; receipts 1 |
| S1 security evidence: an observation goes stale when its source changes and becomes one backlog finding | PASS | record exit 0; status before change exit 1; after change exit 1, stale shown: true; original record unchanged: true; findings twice: 0/0; backlog rows for the finding: 1 |
| I1 the stop reminder asks once for a checkpoint, then recovery after an interrupted session shows what was left | PASS | task start 0; stop blocked once for unrecorded changes: true; allowed when stop_hook_active: true; next session names the interruption true, the task true, uncommitted work true; checkpoint 0; stop allowed after the checkpoint: true |
| C1 two contributors on two branches add tasks and decisions; merging both needs no record conflict resolution | PASS | merges 0/0 (no conflicts); task records 2; decision entries 2; index twice 0/0, identical: true; shared handoff untouched by task branches: true |
| D1 remove keeps every record, entry, observation and the history | PASS | remove exit 0; managed block gone: true; records kept: true; commits 4 and 4 |

Result: 9 of 9 steps passed.
