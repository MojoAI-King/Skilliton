# Task: PLAN v5: a private Skilliton that harnesses every company computer the same way

Kind: Living. Task record.

- **ID:** 2026-09-26-plan-v5-a-private-skilliton-that-harness-67bd
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-26T05:02:50.216Z

## Request

Help with the four decisions: the fleet harness private (all of Skilliton private), the fleet is every computer harnessed the same way through device management such as Intune, GitHub issues for the work queue, and SOC 2, PCI, HIPAA, HITRUST and other frameworks in the private repo with a spoken 'I need to do a SOC 2 audit' flow to an auditor packet

## Acceptance criteria

- [x] Decision entries for going private (with its consequences and prerequisites), the fleet as every company computer through device management, and compliance engagements inside Skilliton (evidence: docs/decisions ebc3, e1d4 and cbe3 in dd53ed6, the stay-public note in 79aa67a)
- [x] PLAN.md v5: the owner's goal in section 0, Phase 4 milestones and their order in section 7, section 9's scope rewritten to match the decisions (evidence: PLAN.md in dd53ed6, full checks 121 pass, 0 fail, 2 skipped of 123 on that commit)
- [x] The visibility change handed to the owner as pasteable commands with the checks to run after it (evidence: the two commands given in the session on 2026-09-26 and the rules check in decision ebc3's Risk section; the owner chose to stay public for now)

## Decisions

not yet written

## Checkpoints

### 2026-09-26T04:41:18.481Z

- **State:** Three decisions recorded (ebc3 private, e1d4 the fleet is every computer through device management with GitHub issues for agents later, cbe3 compliance engagements for any framework, never certifying); PLAN.md v5 written (goal in section 0, Phase 4 M15 to M18 and the order in section 7, section 9 rewritten); CLAUDE.md, AGENTS.md and MAINTAIN.md name v5; the status milestone table regenerated. The visibility change is not made: it is the owner's step.
- **Evidence:** docs, records, report-card --check, token-direction, living-docs --check, names, scrub, compliance-words exit 0; the full list runs next on the commit.
- **Next:** Full node scripts/checks.mjs on the commit, push if green, read CI, then hand the owner the visibility commands with the ruleset check.
- **Git:** main @ de423c8, 10 uncommitted

### 2026-09-26T05:01:30.492Z

- **State:** PLAN.md v5 and decisions ebc3, e1d4, cbe3 committed (dd53ed6, full list 121 pass, 0 fail, 2 skipped of 123). The owner keeps the repository public for now. Tomorrow's batch (M15 plus B98 and B101) is planned in LANES.md: 7 lanes, 10 items each verified against the code at dd53ed6, N9 (B93) deferred for want of a measured field.
- **Evidence:** Ten read-only verifiers, one per item, all REAL with write sets; full checks on dd53ed6 exit 0; docs, records, living-docs, scrub exit 0 on the records after.
- **Next:** 2026-09-27, when the owner says go: skilliton dispatch (preview), then --apply; run each lane as a workflow:lane agent; merge in LANES.md's order (guard-paths, pin-projects, release-sign, dispatch-scrub, compliance-intake, stop-hook, prompt-count), each rebased with the full gate on its tree, ff-only, pushed and CI read; main applies each lane's CONTRACTS, CI, MAINTAIN, IT-ALLOWLIST, CHANGELOG and BACKLOG lines; then workflow 0.27.0 and release 1.6.0.
- **Git:** main @ dd53ed6, 3 uncommitted

## Handoff

- **State:** PLAN.md v5 and decisions ebc3, e1d4, cbe3 committed (dd53ed6, full list 121 pass, 0 fail, 2 skipped of 123). The owner keeps the repository public for now. Tomorrow's batch (M15 plus B98 and B101) is planned in LANES.md: 7 lanes, 10 items each verified against the code at dd53ed6, N9 (B93) deferred for want of a measured field. Evidence: Ten read-only verifiers, one per item, all REAL with write sets; full checks on dd53ed6 exit 0; docs, records, living-docs, scrub exit 0 on the records after.
- **Next:** 2026-09-27, when the owner says go: skilliton dispatch (preview), then --apply; run each lane as a workflow:lane agent; merge in LANES.md's order (guard-paths, pin-projects, release-sign, dispatch-scrub, compliance-intake, stop-hook, prompt-count), each rebased with the full gate on its tree, ff-only, pushed and CI read; main applies each lane's CONTRACTS, CI, MAINTAIN, IT-ALLOWLIST, CHANGELOG and BACKLOG lines; then workflow 0.27.0 and release 1.6.0.
- **Blocked:** Owner only: confirm the prompt ceiling at the last merge; name a scope on one company product (B101's measurement, M16); an Intune tenant with a clean Mac and a Windows PC (M12); the Usage screen reading before transcripts expire in mid-October; the visibility switch when wanted.
- **Watch out:** lib/release.mjs is pinned at 614 lines and lib/dispatch.mjs is at 591 of 600: lanes move code out, never raise a pin. Only main bumps the workflow version. Lanes share this Mac, so a timing failure is measured before it is called load (lesson 12f0).
