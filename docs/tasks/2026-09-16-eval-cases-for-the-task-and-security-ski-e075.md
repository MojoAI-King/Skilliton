# Task: Eval cases for the task and security skills

Kind: Living. Task record.

- **ID:** 2026-09-16-eval-cases-for-the-task-and-security-ski-e075
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-16T22:12:58.562Z

## Request

not yet written

## Acceptance criteria

- [ ] a task case and a security case with deterministic checks where possible, run with and without the plugin
- [ ] every failed check is diagnosed from its transcript before the skill or grader changes
- [ ] evidence summaries for the failing run and the run after the changes are committed, with the exact commands

## Decisions

not yet written

## Checkpoints

### 2026-09-16T22:09:39.343Z

- **State:** B10 done: task-start-records-work and security-status-honest added (06880a6); the first run exposed a skill fallback contradiction, unrequested work after set-up, a PATH lookup crash and a judge wording error, all fixed in e87d2d1; O12 settled with a sonnet judge
- **Evidence:** 06880a6 task 0.89 and security 1.00 (default judge); e87d2d1 task 0.94 (default judge) and 1.00 (sonnet judge, delta 0.39), security 1.00 (delta 0.33); transcripts read for every failed check; records.test.mjs PATH case fails on the old lookup
- **Next:** docs, full offline suite, push, CI
- **Git:** main @ e87d2d1, 11 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
