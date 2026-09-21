# Task: Build-complete checkpoint: install update, tag, security and behavior walkthrough, stats and the full document

Kind: Living. Task record.

- **ID:** 2026-09-21-build-complete-checkpoint-install-update-81ba
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-21T21:22:52.325Z

## Request

Mark this as a checkpoint in the development of the tool. Update the installed plugins, tag the checkpoint, run a security walkthrough and a behavior review of every hook and command, polish, then a stats page and a full document explaining the tool. Deadline Wednesday 2026-09-23 11:00 EDT.

## Acceptance criteria

- [ ] The installed plugins on this machine match the repo versions, read from the cache after the update
- [ ] A tag marks the checkpoint, labeled unsigned if no signing key was used
- [ ] Each of the six security surfaces is tested and its result recorded, fixed or documented as a limit
- [ ] Every hook and command is checked for what it blocks, what it says, and that it never reports success falsely
- [ ] A private stats page with every figure labeled by source, the meter figure marked unverified
- [ ] A full document for the owner describing the tool as it stands, with its source in docs/

## Decisions

not yet written

## Checkpoints

### 2026-09-21T21:22:52.325Z

- **State:** Installed plugins updated to the repo versions: workflow 0.8.0 to 0.15.0, guardrails 0.4.0 to 0.5.1, context-hygiene already 0.3.0, code-quality 0.2.0 installed; marketplace clone at 84ded53
- **Evidence:** installed_plugins.json names the four new cache paths; diff -rq of each against packs/base/plugins exits 0; old cache copies 0.8.0 and 0.4.0 still carry .in_use but the registry does not point at them; takes effect on restart
- **Next:** Tag the checkpoint, then the meter before/after, then the security walkthrough
- **Git:** main @ 84ded53, 1 uncommitted

## Handoff

- **State:** Installed plugins updated to the repo versions: workflow 0.8.0 to 0.15.0, guardrails 0.4.0 to 0.5.1, context-hygiene already 0.3.0, code-quality 0.2.0 installed; marketplace clone at 84ded53. Evidence: installed_plugins.json names the four new cache paths; diff -rq of each against packs/base/plugins exits 0; old cache copies 0.8.0 and 0.4.0 still carry .in_use but the registry does not point at them; takes effect on restart.
- **Next:** Tag the checkpoint, then the meter before/after, then the security walkthrough
- **Blocked:** nothing
- **Watch out:** nothing known
