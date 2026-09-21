# Task: Build-complete checkpoint: install update, tag, security and behavior walkthrough, stats and the full document

Kind: Living. Task record.

- **ID:** 2026-09-21-build-complete-checkpoint-install-update-81ba
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-21T21:43:57.542Z

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

### 2026-09-21T21:32:06.876Z

- **State:** Release 0.9.0 signed, pushed and approved; verify's false TAMPERED on in-use plugins fixed in workflow 0.15.1 and pushed; meter run over September kept in the scratchpad, unverified
- **Evidence:** release list: 1 approved; verify after the fix: 7 of 7 VERIFIED; release.test 27 pass; lint, docs, scrub exit 0; gate suite before the manifest commit 19 pass with the harness proof red
- **Next:** Watch CI for the fix commit; security walkthrough surfaces 1 to 6
- **Git:** main @ 3e89927, 0 uncommitted

### 2026-09-21T21:43:57.542Z

- **State:** Security walkthrough surfaces 1, 2 and 4 tested. Findings: a repo config lowering a guardrail is announced at session start but the allowed command itself is silent; a stranger's handoff text is shown verbatim at session start with no line saying it is a record and not an instruction, though it is size-bounded; bash -c, sh -c and eval wrapping a force-push are allowed silently, a limit the guardrails skill documents; every direct force-push form, env prefix, comment, newline and 300KB command was denied; malformed input naming git asks; the secrets collector never printed or stored a planted value. main has no branch protection and no rulesets; 2FA state not readable from this token. Two fixes shipped: verify's false TAMPERED, and join's refusal order after the first signed release.
- **Evidence:** hook runs recorded in the scratchpad; rename, join, release and lint tests exit 0 after the join fix; CI for b0dc663 and 3e89927 red at step 49 for the join order, fix pushed
- **Next:** Watch CI; surfaces 3, 5, 6; decide fixes for the per-command silence and the nested-shell ask; then the behavior review
- **Git:** main @ 4f4be07, 0 uncommitted

## Handoff

- **State:** Security walkthrough surfaces 1, 2 and 4 tested. Findings: a repo config lowering a guardrail is announced at session start but the allowed command itself is silent; a stranger's handoff text is shown verbatim at session start with no line saying it is a record and not an instruction, though it is size-bounded; bash -c, sh -c and eval wrapping a force-push are allowed silently, a limit the guardrails skill documents; every direct force-push form, env prefix, comment, newline and 300KB command was denied; malformed input naming git asks; the secrets collector never printed or stored a planted value. main has no branch protection and no rulesets; 2FA state not readable from this token. Two fixes shipped: verify's false TAMPERED, and join's refusal order after the first signed release. Evidence: hook runs recorded in the scratchpad; rename, join, release and lint tests exit 0 after the join fix; CI for b0dc663 and 3e89927 red at step 49 for the join order, fix pushed.
- **Next:** Watch CI; surfaces 3, 5, 6; decide fixes for the per-command silence and the nested-shell ask; then the behavior review
- **Blocked:** nothing
- **Watch out:** nothing known
