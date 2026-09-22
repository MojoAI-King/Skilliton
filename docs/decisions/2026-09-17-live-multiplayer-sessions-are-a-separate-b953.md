# Live multiplayer sessions are a separate companion project

Kind: Living. Decision entry.

- **ID:** 2026-09-17-live-multiplayer-sessions-are-a-separate-b953
- **Status:** accepted
- **Date:** 2026-09-17

## Decision

Live multiplayer sessions, where a team of developers watches and steers one agent session together with context the team owns, are a separate companion project with its own repository. They are not part of Skilliton. Skilliton stays the harness for each developer working with an AI assistant: the company package on every machine, the project records, the security checks and the merge gate. The idea, its four pillars (shared sessions, observable work, live steering and handoffs, team-owned context), and open questions were first written in docs/MULTIPLAYER.md, with a standalone brief outside this repository; later on 2026-09-17 the owner moved both to the companion project's own repository and removed the note from this one. PLAN.md section 9 lists it as out of scope.

## Why

The owner said so on 2026-09-17: the multiplayer environment "might be a different repo", "a secondary project that's going to work kind of in conjunction with this", recorded here "so this project can stay a little focused". Live collaboration also needs its own security model (whose credentials the agent uses, what teammates can see of command output), which the local-first harness does not have and should not take on before the demonstration planned around 2026-09-23.

## Alternatives rejected

- Adding it to Phase 3 as a milestone: it would widen the plan before the demonstration and mix a live-collaboration security model into a harness that runs on each person's machine.
- Leaving the idea in the conversation: it would be lost at the next compaction, and a later session could read "teams of developers who build with AI together" in docs/PHASE-3.md as a reason to build live sessions into Skilliton.

## Risk

The owner expects the two projects to work together, and the natural meeting point is Skilliton's project records. Designing that interface before the companion project has its own design would be guessing, so it stays an open question in the companion project. If the companion project later needs a change here, it arrives as a proposed Skilliton milestone.

## Reversibility

Easy. Nothing is built, and a later decision can bring any part of it into Skilliton.

## Evidence

The owner's note in this session, 2026-09-17 around 00:50 EDT. Only documentation changed: docs/MULTIPLAYER.md (since removed), docs/PHASE-3.md ("Where Skilliton stops"), PLAN.md section 9, docs/README.md.
