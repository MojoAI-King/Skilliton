# Backlog

Kind: Living.

The open acceptance items after the 2026-09-16 integration. Details and history for each are in DECISIONS.md under the same O number.

| ID | Requested outcome | State | Evidence or next step |
|---|---|---|---|
| B1 (O16) | A real new builder completes the M5 rehearsal | blocked on a participant | docs/rehearsals/NEW_BUILDER.md |
| B2 (O9) | Codex lifecycle hooks observed in real sessions | blocked on a logged-in isolated Codex home | `CODEX_HOME=<folder> codex login`, then `node scripts/rehearsals/live-clients.mjs --codex-home <folder>` |
| B3 (O8) | A model session and automatic updates observed in a clean Claude Code configuration | blocked on one login in a fresh `CLAUDE_CONFIG_DIR` | company release rehearsal already covers install, update and verify there |
| B4 (O15) | The GitHub delivery adapter rehearsed on a hosted repository with branch protection | blocked on approval to create a throwaway repository | docs/DELIVERY.md |
| B5 (O6, O7) | The session start and the guardrails confirmation prompt seen in an interactive session | needs a person at the keyboard | headless behavior measured (evidence/rehearsals/2026-09-16-live-clients) |
| B6 (O17) | A signed release of this repository | needs the owner's signing key and version choice | docs/RELEASING.md |
| B7 | Applicability decisions for this repository's own security register | needs the owner | `skillgate security status`, then `skillgate security applicability ... --decided-by <owner> --apply` |
| B8 (O10, O19, O21, O22) | Smaller follow-ups: guardrails allowlist for env files, verify's tag policy, guardrails client detection, secrets tiering review | open; O21 needs the Codex run in B2 and O22 a real application | DECISIONS.md open items (O18 and O20 closed; docs/BACKLOG_ARCHIVE.md) |
| B9 (O2, O3) | Usage reproduction before any savings claim | blocked on the owner's original scope and cutoff | DECISIONS.md O2 |
| B13 (M8) | A never-prepared repository is offered preparation at session start, and a delivery policy is drafted from its detected test commands | open; the live session needs the B3 login | PLAN.md section 7 M8 |
| B11 | The stated Node.js 18 floor either run in CI or raised to a version CI runs, and supported operating systems stated as exercised | open, no owner input needed | docs/COVERAGE.md |

Give each item a stable ID and link its task and decisions. Move a completed item to `docs/BACKLOG_ARCHIVE.md` with its closure date and evidence.
