# Dispatch creates worktrees and refuses to reuse one, and the bound is written prose

Kind: Living. Decision entry.

- **ID:** 2026-09-20-dispatch-creates-worktrees-and-refuses-t-2249
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

`skilliton dispatch` reads a lane plan (`LANES.md` by default), and with `--apply` creates one Git worktree per lane under the project's lane root, each holding a `LANE_BRIEF.md`. Four choices are fixed by this entry:

1. **It never reuses anything.** An existing lane branch, an existing lane folder, or a path Git already has registered as a worktree is a refusal. So is a lane root inside the repository, a base commit this repository does not have, a duplicate lane name or branch, and a lane plan larger than 200000 bytes. Every problem found is listed in one refusal, and nothing is created.
2. **It runs no command from the project's configuration.** `dispatch.laneSetup` is printed in the preview and written into each brief for a person or the lane session to run.
3. **The brief is the bound, and the bound is prose.** Each brief names the lane's items, what to read, what to return, the paths that belong to the integration branch, the check to run, and a context ceiling. None of that is enforced by the client.
4. **Three agents ship with the workflow plugin**, in `agents/`: `lane` (sonnet, high), `locate` (sonnet, low, 12 turns, read-only tools) and `verify-item` (sonnet, medium, 20 turns). Each names a model and an effort.

## Why

**Refusing beats reusing** because the failure it prevents is silent. A lane that starts on a branch another session already holds, or in a folder with someone's uncommitted work in it, produces a merge whose losses nobody sees until later. A refusal costs one command; the alternative costs a bisect. Listing every problem at once follows from the same reasoning: fixing a five-lane plan one refusal at a time is five runs.

**Nothing in the documented agent frontmatter sets a subagent's context window or its compaction.** That was checked against the official sub-agents and plugins reference on 2026-09-20. `model`, `effort` and `maxTurns` exist and are honored; a context bound is not one of them. So a "context ceiling" in a brief is a sentence the lane is asked to hold to, and this repository says so in those words. Writing it as though the client enforced it would be inventing a capability, which the session contract forbids.

**A brief per lane rather than the plan itself:** the plan holds every lane, and a lane session that reads it pays for the other lanes' items on every later turn. The brief is the one lane's page, written where that session already is.

**Not running setup** is the rule that already keeps `prepare` from executing repository code. A command in a checked-in configuration file is code, and running it because a plan mentioned it turns `dispatch --apply` into an arbitrary-execution step.

## Alternatives rejected

- **Reuse an existing branch or folder when it looks compatible.** Rejected: "looks compatible" is a guess about another session's uncommitted state, and being wrong is unrecoverable.
- **Run `dispatch.laneSetup` automatically** so a lane starts installed and built. Rejected on the execution rule above. The brief names the commands, which keeps them visible without making the command run them.
- **Put the bound in agent frontmatter.** Rejected because no such key is documented. If one appears, this decision changes: the ceiling moves from prose into the definition and the briefs say it is enforced.
- **One agent with instructions per task instead of three.** Rejected: `locate` and `verify-item` exist to be cheap and bounded, and a single general agent cannot carry both a 12-turn read-only bound and a lane's open-ended build.

## Risk

The ceiling is advisory, so a lane can exceed it and nothing stops it. That is stated in the brief and in docs/CONTRACTS.md section 18 rather than hidden. The real proof is still missing: no dispatch of two or more lanes has been run and metered, which is why area 04 batch 03 item 3 stays open.

The refusals are strict enough to be annoying in the one case where a person deliberately re-runs a dispatch after deleting a worktree folder by hand, leaving Git's registration behind. The refusal names that case and the `git worktree prune` that clears it.

## Reversibility

High. `dispatch` is a new command with its own module and its own tests; removing it touches nothing else. The three agent files are additive: a plugin with no `agents/` folder behaves as before. The refusal set is the part that would hurt to loosen later, because a project that has learned to expect a refusal would start silently reusing branches.

## Evidence

`packs/base/plugins/workflow/runtime/lib/dispatch.mjs` and `runtime/commands/dispatch.mjs` (workflow 0.11.0); `packs/base/plugins/workflow/agents/`; `node --test scripts/dispatch.test.mjs`, 14 of 14 on 2026-09-20; the agents loop in `scripts/packs.test.mjs`; docs/CONTRACTS.md sections 17 and 18. The frontmatter key sets were read from https://code.claude.com/docs/en/sub-agents.md and https://code.claude.com/docs/en/plugins-reference.md on 2026-09-20.
