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
| B7 | Applicability decisions for this repository's own security register | needs the owner | `skilliton security status`, then `skilliton security applicability ... --decided-by <owner> --apply` |
| B8 (O10, O19, O21, O22) | Smaller follow-ups: guardrails allowlist for env files, verify's tag policy, guardrails client detection, secrets tiering review | open; O21 needs the Codex run in B2 and O22 a real application | DECISIONS.md open items (O18 and O20 closed; docs/BACKLOG_ARCHIVE.md) |
| B9 (O2, O3) | Usage reproduction before any savings claim | blocked on the owner's original scope and cutoff | DECISIONS.md O2 |
| B13 (M8) | A never-prepared repository is offered preparation at session start, and a delivery policy is drafted from its detected test commands | open; the live session needs the B3 login | PLAN.md section 7 M8 |
| B14 | A live "one company, two developers" demonstration built on the existing rehearsals and demo, showing only the Phase 3 work that passed its checks | open; order 6 in docs/PHASE-3.md, for the demonstration around 2026-09-23 | docs/PHASE-3.md order table; docs/POSITIONING.md |
| B15 (M14) | A read-only team view for a lead, generated locally from project records, verify results and audit findings | open, after the demonstration | PLAN.md M14; docs/PHASE-3.md |
| B16 (M14) | A small measured comparison against the plain tool (tokens cross-checked, time, interventions, rework, planted flaws caught, resume accuracy) before any time or cost statement | open; paid runs need the owner's approval and a ceiling | PLAN.md M14; DECISIONS.md O2 |
| B17 | An optional code-quality pack of cleanup skills, each with eval cases run with and without it, following M10's pattern of deterministic checks plus a skill | proposed, after M10 | docs/POSITIONING.md |
| B18 (M12) | Installs pinned to signed release tags, so a laptop cannot follow the marketplace branch past the approved release; the basis of release rings | open, part of M12; `ref` and `sha` pins are documented by Claude Code, not yet tested | docs/PHASE-3.md M12; docs/CLIENTS.md marketplace sources |
| B20 (M10) | A security audit that runs in a Claude Code routine, a git pre-push hook and the merge gate, with recorded findings and evals on planted flaws | open; order 3 | PLAN.md M10 |
| B21 (M11) | Routines while working: dispatch suggestion, checkpoint snapshot around compaction, maintain suggestion, each measured live on Claude Code | open; order 4 | PLAN.md M11 |
| B22 (M12) | Enrollment through a company's device management: profile, bundle, first-login setup, detection and offboarding scripts, rings | open; order 2 is the automatic registration spike; a real Intune or Jamf tenant needs the owner | PLAN.md M12; docs/PHASE-3.md riskiest assumption |
| B23 (M13) | Any AI coding tool: an adapter and a measured CLIENTS.md column per tool | open; order 5 is Cursor, on the owner's account (O24, decided); live sessions need the owner's Cursor login on this machine; other tools ranked after it | PLAN.md M13; docs/PHASE-3.md Tool support |
| B24 | Skilliton helps each developer's own skills grow over time, measured before it is claimed (owner direction, 2026-09-17) | proposed, not yet a milestone; needs a design and a measure | docs/PHASE-3.md "Direction the owner added" |
| B11 | The stated Node.js 18 floor either run in CI or raised to a version CI runs, and supported operating systems stated as exercised | open, no owner input needed | docs/COVERAGE.md |

Give each item a stable ID and link its task and decisions. Move a completed item to `docs/BACKLOG_ARCHIVE.md` with its closure date and evidence.
