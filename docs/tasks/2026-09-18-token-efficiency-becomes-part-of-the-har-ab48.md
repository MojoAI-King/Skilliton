# Task: Token efficiency becomes part of the harness: read guard, session cost rules, meter reconciliation and a gate command

Kind: Living. Task record.

- **ID:** 2026-09-18-token-efficiency-becomes-part-of-the-har-ab48
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-18T22:01:57.337Z

## Request

The owner asked that the personal token-efficiency skill become part of Skilliton, that the four daily skills (maintain, dispatch, a 200000-token compaction window, token efficiency) ship in it, and that Skilliton auto-harness new repositories (M8). This task covers the harness pieces and M8's first increment.

## Acceptance criteria

- [x] The context-hygiene plugin ships the read guard as a PreToolUse hook on Read that refuses a whole-file read of a non-image file over 50KB with a reason the model sees; fixture tests cover deny, allow, image, ranged read, malformed input and a missing file; the IT allow list names its log
- [x] The harness template carries a Session cost section with no dollar or percentage figures; prepared projects receive it by migration; this repository is migrated and its out-of-block section reconciled with the corrected meter's findings
- [x] scripts/token-cost.mjs reproduces the reference window (1919 and 439 requests; 407.68 and 70.72 dollars at the 5m rate) with a stated mechanism for every change; a fixture test fails without the tie-break; the reference check reports NOT RUN where the transcripts are absent; O2 closes or says exactly what still differs
- [x] skilliton gate runs a project's verify command and returns the bare exit status with a bounded summary and a full log; tests cover pass, fail, a signal and provenance
- [x] The personal token-efficiency skill points at this repository as its development home; the offline suite passes on the exact tree; the scrub check passes; an independent security-first review ran and its findings were fixed before publishing

## Decisions

- docs/decisions/2026-09-18-token-efficiency-ships-in-the-harness-an-a3f4.md (the harness carries token efficiency; O2 closed).
- The compaction window default stays 200000 until B36 is measured; the owner's report that it is too tight is recorded, not acted on.

## Checkpoints

### 2026-09-18T16:35:40.833Z

- **State:** Meter reproduces the reference window (1919/439 requests, both figures) after the largest-output tie-break and the synthetic counter; read guard shipped in context-hygiene 0.3.0 with 16 tests; skilliton gate built in workflow 0.8.0 with 13 tests; harness template has a Session cost section and this repository migrated to it (0100-instructions-ff8374b8e33a); team settings template carries autoCompactWindow 200000; allow list, footprint, packaging, git-config, names and docs checks pass except the preflight table still lacks npm
- **Evidence:** node scripts/token-cost.test.mjs --reference: fixture and reference pass; node --test scripts/read-guard.test.mjs 16/16; node --test scripts/gate.test.mjs 13/13; footprint, packs, git-config, names, docs pass; allowlist 1 problem (npm not in preflight PROGRAMS)
- **Next:** Add npm to the preflight program table; the M8 first increment (a plain-words offer in the unprepared session start) with a lifecycle test; fill the decision and two lesson entries; CLIENTS, COVERAGE, PLAN, BACKLOG; full suite; scrub; security review; push
- **Git:** main @ 671d36a, 34 uncommitted

### 2026-09-18T20:23:26.449Z

- **State:** Lifecycle 32/32 after the M8 offer line reads report.data.layout.version; fixtures README describes the streaming-partial copies and the synthetic record; portable lessons 185 to 188 and protocol 2.70.0 written on the Desktop; security review agent running
- **Evidence:** node scripts/lifecycle.test.mjs pass 32 fail 0; session-start smoke in an empty git repo prints the Not prepared line
- **Next:** Read the review findings and fix them; full suite on the final tree; scrub; handoff; commit; push; CI
- **Git:** main @ 671d36a, 50 uncommitted

### 2026-09-18T21:53:15.787Z

- **State:** Security review findings fixed: the gate opens its log before any check starts (exit 3 on EISDIR/EACCES, a mid-run write error kills the group and is exit 3), the tail carry is bounded, the read-guard log override is accepted only as an absolute non-symlink .log path, a numeric-string limit counts as a ranged read; gate help and allow list name the worktree log path; A2 rehearsal migrates the clone before its check; backlog B35 (rolling maintenance) and B36 (compaction window) recorded from the owner
- **Evidence:** node --test scripts/gate.test.mjs 17/17; node --test scripts/read-guard.test.mjs 20/20; node scripts/rehearsals/projects.mjs --no-evidence A2 PASS; earlier full suite 39/40 with only A2 failing
- **Next:** Full suite on this tree; scrub and history scrub; handoff and status; commit; push; CI
- **Git:** main @ 671d36a, 52 uncommitted

## Handoff

- **State:** Done locally on the tree this record is committed with; every criterion met with the evidence in the checkpoints; the independent review's findings fixed and tested; published and CI state recorded in docs/HANDOFF.md after the push.
- **Next:** B36 measurement and B35 design (docs/HANDOFF.md RESUME HERE).
- **Blocked:** nothing in this task; the live-session check of the read guard and compaction (B34) needs a real session.
- **Watch out:** the allow-list test pins the read-guard log line by text; the A2 rehearsal migrates its clone before checking it.
