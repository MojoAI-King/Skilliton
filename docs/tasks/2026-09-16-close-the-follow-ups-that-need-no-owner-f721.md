# Task: Close the follow-ups that need no owner input

Kind: Living. Task record.

- **ID:** 2026-09-16-close-the-follow-ups-that-need-no-owner-f721
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-16T21:31:01.350Z

## Request

While the remaining M2 to M5 gates wait for owner access, approval or a participant, close the open items that need none of those (the owner goal: continue independent work).

## Acceptance criteria

- [x] verify treats a file that lost the executable bit its release gives it as attention, with installs measured on both clients (O18)
- [x] decision, lesson and task IDs come from one exported generator with one shared test (O20)
- [x] setup undo keeps settings edits made after apply and removes a settings file it created (O5)
- [x] the drift check stops reporting drift when no model is declared (O4)
- [x] scrub-check --history scans the branch being pushed by default, every ref only on request (O13)
- [x] each closed item's decision, contract, backlog and handoff text agrees, and the full suite, demo and offline rehearsal pass

## Decisions

DECISIONS.md "Follow-ups closed without owner input" (O4, O5, O13, O18, O20 closed). Found and fixed while dogfooding, after the criteria above were met: `skillgate index` no longer appends an empty section to an adopted record, and the rehearsals never substitute another client binary for a path that was given (both in the same decision; docs/LESSONS.md). Rechecked after those fixes: CLI, prepare, migrate and records, lifecycle, release, demo, project rehearsal, packaging and scrub all exit 0.

## Checkpoints

### 2026-09-16T21:12:56.387Z

- **State:** verify now reports a lost executable bit as attention (exit 1) with the content still VERIFIED; a bit the release lacks stays a note
- **Evidence:** clean installs from a clone at 697e5e9 into throwaway Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2 homes kept all 11 executable bits; release.test.mjs case passes and fails when the new branch is disabled
- **Next:** contract and decision text for O18, then O20
- **Git:** main @ 697e5e9, 3 uncommitted

### 2026-09-16T21:17:04.831Z

- **State:** one ID rule in runtime/lib/ids.mjs used by records, tasks and propose (a third copy in propose was found and removed)
- **Evidence:** records.test.mjs 8 of 8 including a structural check that fails when a second pattern is added; lifecycle.test.mjs 32 of 32
- **Next:** setup undo keeps later edits (O5)
- **Git:** main @ 697e5e9, 11 uncommitted

### 2026-09-16T21:19:24.681Z

- **State:** setup --undo keeps settings edits made after --apply, removes a settings file --apply created, refuses when statusLine changed afterwards, and still handles backups made before receipts
- **Evidence:** setup.test.mjs 30 of 30; the same checks against the previous setup.mjs fail 8 of 30
- **Next:** drift check false positive (O4), then scrub-check history scope (O13)
- **Git:** main @ 697e5e9, 13 uncommitted

### 2026-09-16T21:20:34.303Z

- **State:** the drift check reports DRIFT only when a declared model differs from the latest transcript's (aliases by family, context suffix ignored), and says why when there is nothing to compare
- **Evidence:** drift-check.test.sh 12 of 12, run by path with a stand-in claude; the previous script fails 9 of 12
- **Next:** scrub-check history scope (O13)
- **Git:** main @ 697e5e9, 15 uncommitted

### 2026-09-16T21:22:18.365Z

- **State:** scrub-check --history scans the commits the checked-out branch reaches; --history-all scans every ref and is what CI runs; the self-test proves both scopes
- **Evidence:** self-test passes and fails when the branch scope is widened to every ref; --history 59 commits PASS, --history-all 61 commits PASS on this repository
- **Next:** decisions, backlog, plan and handoff text for O4, O5, O13, O18, O20; version bumps; full suite
- **Git:** main @ 697e5e9, 18 uncommitted

### 2026-09-16T21:31:01.263Z

- **State:** follow-ups closed and documented: decisions, backlog and archive, contracts, schema, plan, clients, onboarding, releasing, maintain, lessons and handoff agree
- **Evidence:** full offline suite 24 checks exit 0; after the rehearsal library and doc edits: project rehearsal 9 of 9, packs, records, release and scrub exit 0
- **Next:** review, scrub history, commit, push main, read CI
- **Git:** main @ 697e5e9, 33 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
