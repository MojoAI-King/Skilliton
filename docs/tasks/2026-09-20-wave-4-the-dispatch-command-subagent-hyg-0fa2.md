# Task: Wave 4: the dispatch command, subagent hygiene, the VS Code extension column

Kind: Living. Task record.

- **ID:** 2026-09-20-wave-4-the-dispatch-command-subagent-hyg-0fa2
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T04:59:15.638Z

## Request

keep going (wave 4 per docs/REPORT_CARD.md)

## Acceptance criteria

- [x] skilliton dispatch reads the lanes and --apply creates one worktree per lane with git worktree add under the lane root, the plan shown first
- [x] each lane gets a brief file with its scope, its bound (what to read, what to return, a model choice) and the main-only paths it must not touch
- [x] tests over a fixture repository cover create, preview and the refusal when a lane branch exists
- [x] agent definitions with model and effort ship in the workflow plugin, with a packaging test
- [x] the VS Code extension session is filed as evidence and docs/CLIENTS.md gains a measured extension column

## Decisions

- **Dispatch refuses rather than reuses**, runs no command from the project's configuration, and states its context ceiling as prose because no documented agent frontmatter key bounds a subagent's context: `docs/decisions/2026-09-20-dispatch-creates-worktrees-and-refuses-t-2249.md`.
- **The VS Code extension evidence is filed with its confound stated first**: the plugins were installed about 59 hours into the session, so a plugin hook that did not fire is not evidence against the client. Items 1 and 2 of batch 03-01 stay open with one settling test.
- **A finding was recorded, not explained**: this session compacted automatically 17 times and never near the project's `autoCompactWindow` of 600000. No cause is asserted anywhere.

## Checkpoints

### 2026-09-20T04:59:15.638Z

- **State:** Wave 4 is built and green: dispatch creates worktrees from a lane plan with 14 fixture tests, three agents ship in the workflow plugin 0.11.0 with a frontmatter packaging test, and the VS Code extension has a measured column in docs/CLIENTS.md
- **Evidence:** the offline suite of 50 steps passed with no failures on 2026-09-20; node --test scripts/dispatch.test.mjs 14 of 14; claude plugin validate --strict passes on the marketplace and all three plugins with binary 2.1.276; report-card --check current at 45 of 123
- **Next:** commit and push, read the CI run step by step, then maintain and write the wave handoff
- **Git:** main @ 12c207e, 33 uncommitted

## Handoff

- **State:** Wave 4 is built and green: dispatch creates worktrees from a lane plan with 14 fixture tests, three agents ship in the workflow plugin 0.11.0 with a frontmatter packaging test, and the VS Code extension has a measured column in docs/CLIENTS.md. Evidence: the offline suite of 50 steps passed with no failures on 2026-09-20; node --test scripts/dispatch.test.mjs 14 of 14; claude plugin validate --strict passes on the marketplace and all three plugins with binary 2.1.276; report-card --check current at 45 of 123.
- **Next:** commit and push, read the CI run step by step, then maintain and write the wave handoff
- **Blocked:** nothing
- **Watch out:** nothing known
