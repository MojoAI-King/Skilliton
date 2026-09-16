# Task: Make a fork yours and show how Skillgate works

Kind: Living. Task record.

- **ID:** 2026-09-16-make-a-fork-yours-and-show-how-skillgate-da03
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-16T23:44:34.568Z

## Request

not yet written

## Acceptance criteria

- [ ] company init renames a fork's marketplace, owner and team settings template in one previewable command
- [ ] new-plugin creates a company plugin, its catalog entry and its settings entry, so new-skill --pack <company> works on a fresh fork
- [ ] a fork rehearsal runs every step docs/HOW-IT-WORKS.md shows, installing and verifying under the renamed marketplace on Claude Code and Codex
- [ ] docs/HOW-IT-WORKS.md explains fork, customize, release, install, daily use and improvement with diagrams, and a docs test checks its commands and links
- [ ] PLAN.md section 7 carries M6 to M8 and the backlog, decisions, contracts and handoff agree

## Decisions

not yet written

## Checkpoints

### 2026-09-16T23:32:54.811Z

- **State:** company init and new-plugin built (commands/company.mjs, commands/new-plugin.mjs, lib/fork.mjs); new-skill's refusal names new-plugin; doctor's catalog check covers every pack
- **Evidence:** node scripts/skillgate.test.mjs: 181 checks passed (32 new, including packs.test.mjs --root on a fork made by the two commands); smoke run on a scratch copy
- **Next:** scripts/rehearsals/fork.mjs with real Claude Code and Codex installs under the renamed marketplace
- **Git:** main @ 7a528e7, 7 uncommitted

### 2026-09-16T23:38:04.489Z

- **State:** fork rehearsal 7 of 7 PASS on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2 under the renamed acme-skills marketplace; code committed locally as e2784bd, not pushed
- **Evidence:** node scripts/rehearsals/fork.mjs --claude <2.1.273> --codex <0.154>: K1-K7 PASS, evidence/rehearsals/2026-09-16-fork; offline suites and demo exit 0; validate --strict exit 0
- **Next:** docs/HOW-IT-WORKS.md with diagrams, scripts/docs.test.mjs, then README, RELEASING, CONTRACTS, PLAN and records
- **Git:** main @ e2784bd, 2 uncommitted

### 2026-09-16T23:44:34.479Z

- **State:** M6 built and verified locally; docs/HOW-IT-WORKS.md written with five diagrams re-rendered after the last edit; roadmap M6 to M8 in PLAN.md; records, contracts, coverage, CI and handoff aligned
- **Evidence:** fork rehearsal 7 of 7; offline suites 21 of 21 exit 0 (CLI 181, docs test and self-test); mermaid-cli rendered 5 of 5
- **Next:** push main and read every CI step, then M7
- **Git:** main @ e2784bd, 23 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
