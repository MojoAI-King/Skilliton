# Task: One command per machine (M7)

Kind: Living. Task record.

- **ID:** 2026-09-16-one-command-per-machine-m7-5e21
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T00:25:22.214Z

## Request

not yet written

## Acceptance criteria

- [ ] installing from a GitHub owner/repo marketplace source is measured on Claude Code and Codex in throwaway homes, and recorded in CLIENTS.md and COVERAGE.md
- [ ] skillgate join previews, then adds the company marketplace, installs the plugins the team template enables, records the release signers from an out-of-band file, keeps a verify source and puts skillgate on the terminal path, ending with verify
- [ ] join --undo removes exactly what join added and keeps what was there before
- [ ] a machine rehearsal runs join and undo on clean Claude Code and Codex homes, with a signed company release, and ends VERIFIED
- [ ] CONTRACTS, guides, HOW-IT-WORKS, PLAN M7, backlog and handoff agree

## Decisions

not yet written

## Checkpoints

### 2026-09-17T00:11:49.280Z

- **State:** join and join --undo built (local commit 0d350ea, not pushed); machine rehearsal 8 of 8 on real Claude Code 2.1.273 and Codex 0.154 without evidence; docs, contracts, CI step, decision and lesson entries written; independent security-first review running
- **Evidence:** node --test scripts/join.test.mjs 19 of 19; offline suites exit 0; rehearsal J1-J8 PASS (run with --no-evidence); GitHub source installs measured on both clients
- **Next:** apply verified review findings, rerun join tests and the rehearsal with evidence, then commit, push and read CI
- **Git:** main @ 0d350ea, 16 uncommitted

### 2026-09-17T00:25:22.125Z

- **State:** M7 built, reviewed and verified locally: join and join --undo; 12 review findings fixed with regression tests
- **Evidence:** join.test 36 of 36; machine rehearsal 8 of 8 after the fixes (evidence/rehearsals/2026-09-17-machine); all offline suites exit 0; docs test and self-test pass
- **Next:** push main and read every CI step; then M8
- **Git:** main @ 5358f37, 22 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
