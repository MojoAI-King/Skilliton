# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-17 00:59 EDT

- **State:** Skilliton itself is unchanged since M9: every technical name is Skilliton (workflow 0.6.0, layout 3), published as 5a67e74 and 1b626d1 (CI 35176795761, 34 of 34) with maintenance e8ab467 (CI 35179607364); rehearsals fork 7 of 7, machine 8 of 8, company release 18 of 18, project 9 of 9. Installed on the owner's machine: nothing. Released: none. After midnight the owner recorded an idea for a separate companion project: a live multiplayer environment where a small team watches and steers one agent session together and owns its context. It is written up in docs/MULTIPLAYER.md (the four pillars, open questions, and a brief to paste into a new Claude session) and kept out of Skilliton's scope (decision 2026-09-17-live-multiplayer-sessions-are-a-separate-b953; PLAN.md section 9). Skilliton stays the harness for each developer. Two earlier handoff times had been typed about 90 minutes ahead of the clock, which let `status` call a stale handoff current; both are corrected below (lesson 2026-09-17-handoff-times-typed-ahead-of-the-clock-h-95ba; backlog B25). This note and those changes are committed on `main` locally and not pushed, because the repository is public and publishing the companion idea is the owner's call.
- **Next:**
  1. Owner: say whether to publish the multiplayer note (push `main`), and start the companion project in its own repository with the brief at the end of docs/MULTIPLAYER.md.
  2. Phase 3 order (docs/PHASE-3.md): the M12 enrollment spike (a Claude Code managed-settings drop-in on a clean container and a clean macOS account), then the M10 security audit, M11 routines, the Cursor spike (needs the owner's Cursor login on this Mac), and the B14 demonstration around 2026-09-23.
  3. The owner's EC2 instance for clean-machine rehearsals (the Linux spike can start in Docker or Colima first) and a milestone proposal for B24 (each developer's skills growing, measured).
  4. Without owner input: B25, B11 and O10. Owner inputs unchanged: B2, B3, B4, B7, B6, B1; a spending ceiling for M14.
- **Blocked:** as before (M5 participant, Codex hooks login, hosted delivery approval, first signed release, any cost statement).
- **Watch out:** read the clock (`date "+%Y-%m-%d %H:%M %Z"`) before writing a Written line; until B25 is built, `status` trusts a time in the future. The rehearsals clone the committed HEAD and never replace recorded evidence (a second run writes `<date>-<name>-run-<n>`). Run the whole suite on the exact tree before saying it passes. Use the editor-bundled Claude Code 2.1.273 for `plugin validate --strict` (the terminal `claude` is 2.1.92).

## Earlier

### 2026-09-16 23:49 EDT
- **Correction (2026-09-17):** first written as 2026-09-17 01:20 EDT, a time typed rather than read from the clock; the heading is now the time of the commit that added this note (e8ab467).
- **State:** The owner paused for the night after M9. M9 is done: every current technical name is Skilliton (workflow 0.6.0, guardrails 0.3.0, context-hygiene 0.2.0, project layout 3), published as 5a67e74 and 1b626d1 with CI 35176795761 passing 34 of 34 (the letter-case test ran on Linux). Rehearsals under the new names on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2: fork 7 of 7, machine 8 of 8 including the GitHub install of the renamed marketplace, company release 18 of 18, project 9 of 9. Earlier projects move by migration `0003-skilliton-names`; this repository moved itself. Earlier machine and repository state is named where found, never read as trust; guardrails and the delivery gate keep protection in force until a project moves. An independent security-first review found 13 issues in the first local version, including a gate bypass by merge that predates the rename; all were fixed with regression tests before publishing. Owner decisions: keep `SG-` control IDs (O23); Cursor as the next tool (O24). The private denylist is now at `~/.config/skilliton/denylist`. Installed on the owner's own machine: nothing. Released: none.
- **Next:**
  1. Phase 3 order (docs/PHASE-3.md): the M12 enrollment spike (a Claude Code managed-settings drop-in on a clean container and a clean macOS account), then the M10 security audit, M11 routines, the Cursor spike (needs the owner's Cursor login on this Mac), and the B14 demonstration around 2026-09-23.
  2. The owner plans an EC2 instance to host virtual machines for the enrollment rehearsals (user-stated); the Linux spike can start in Docker or Colima before it exists. The owner's new direction (B24, each developer's skills growing, measured) needs a milestone proposal in PHASE-3.md.
  3. Owner inputs unchanged: B2, B3, B4, B7, B6, B1; a spending ceiling for M14; a Cursor login on this Mac for the Cursor spike.
  4. Without owner input: B11 and O10.
- **Blocked:** as before (M5 participant, Codex hooks login, hosted delivery approval, first signed release, any cost statement).
- **Watch out:** the rehearsals clone the committed HEAD, so commit before running them, and a second run on one day writes `<date>-<name>-run-<n>` rather than replacing evidence (the M7 machine evidence is `2026-09-17-machine`, the M9 run is `-run-2`). Run the whole suite on the exact tree before saying it passes. Use the editor-bundled Claude Code 2.1.273 for `plugin validate --strict` (the terminal `claude` is 2.1.92).

### 2026-09-16 23:03 EDT
- **Correction (2026-09-17):** first written as 2026-09-17 00:30 EDT, a time typed rather than read from the clock; the heading is now the time of the commit that added this note (5a67e74).
- **State:** M9 (one name) is built locally and not yet published. Every current technical name is Skilliton (workflow 0.6.0, guardrails 0.3.0, context-hygiene 0.2.0, project layout 3). `runtime/lib/legacy-names.mjs` names the earlier ones, and `scripts/names.test.mjs` fails on any other use outside a scoped allowlist. Earlier projects move by migration `0003-skilliton-names`; this repository moved itself (receipt in `.skilliton/migrations/`). Earlier machine and repository state is named where found, never read as trust. Guardrails and the delivery gate keep enforcing an unmigrated project's settings and a policy at the earlier path. An independent security-first review of the first local commit found 13 issues, including a gate bypass by merge that predates the rename; all are fixed with regression tests (decision 2026-09-16-the-rename-moves-projects-by-migration-r-a319, lessons 70e5, 76ff, 8d09, 6d54). Every offline suite and strict validation pass on this tree. Owner decisions recorded: keep `SG-` control IDs (O23); Cursor as the next tool (O24). The private denylist moved to `~/.config/skilliton/denylist`. Published: e5900d5 (CI 35171801478). Installed and released: nothing.
- **Next:**
  1. Rerun the fork, machine (without GitHub), company release and project rehearsals on the final commit; push; read CI; run the machine rehearsal's GitHub step J8 against the pushed repository and commit that evidence.
  2. Then Phase 3 order (docs/PHASE-3.md): the M12 enrollment spike, the M10 security audit, M11 routines, the Cursor spike (needs the owner's Cursor login on this Mac), and the demonstration around 2026-09-23.
  3. Owner inputs unchanged: B2, B3, B4, B7, B6, B1; a spending ceiling for M14.
- **Blocked:** as before (M5 participant, Codex hooks login, hosted delivery approval, first signed release, any cost statement).
- **Watch out:** the rehearsals clone the committed HEAD, so commit before running them. A rehearsal never replaces recorded evidence: a second run on one day writes `<date>-<name>-run-<n>`. Run the whole suite on the exact tree before saying it passes. The case-only file name test is skipped on macOS and runs in CI on Linux.
