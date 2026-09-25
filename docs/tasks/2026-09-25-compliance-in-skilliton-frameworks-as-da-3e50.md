# Task: Compliance in Skilliton: frameworks as data, detection with a named confirmation, the control sheet from existing evidence

Kind: Living. Task record.

- **ID:** 2026-09-25-compliance-in-skilliton-frameworks-as-da-3e50
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:47:08.417Z

## Request

The compliance/MojoComply folding into this, so that it does compliance when a framework is available, is going to be a huge bonus for us. Owner's choice 2026-09-25: the code lives in public Skilliton; the first increment detects, confirms and fills the sheet.

## Acceptance criteria

- [ ] C1: the public-domain framework libraries (HIPAA Security Rule, HIPAA privacy and breach, 42 CFR Part 2 overlay, FTC Safeguards, NY DFS 500, the NIST CSF 2.0 spine, and the two guidance tiers if their text is original) converted from MojoComply's YAML into JSON under the workflow plugin by a committed converter, with provenance and attribution recorded; SOC 2 and PCI DSS left out, with the licence reason written down
- [ ] C2: skilliton compliance scope proposes frameworks from the repository's own signals (the 21 signals and the scoring ported), prints --json, and --apply --decided-by records the confirmed scope in .skilliton/compliance/scope.json; nothing is recorded without a named person
- [ ] C3: a reviewed crosswalk from the 15 baseline controls to NIST CSF 2.0 subcategories, and skilliton compliance sheet --apply writes docs/COMPLIANCE-CONTROLS.md by projecting the project's security records through the crosswalks: states evidenced, partial, not_started, not_applicable; a disclaimer; the independence line; the list of what a person must supply
- [ ] C4: a banned-word check fails on compliant, certified or passes in the sheet and in the skill's text; security status --json carries the per-control state
- [ ] C5: prepare drafts a scope proposal; the session start names unconfirmed proposals and a stale sheet; maintain --apply refreshes the sheet
- [ ] C6: a compliance skill: propose, get a named confirmation, gather evidence, fill the sheet, never certify
- [ ] C7: measured on two real repositories of the owner's: the proposals against what the owner knows to be true, and the sheet's coverage counts, filed as evidence
- [ ] C8: tests for the converter, the scope (planted signals and clean look-alikes), the projection and the banned-word check run in CI; CONTRACTS, CHANGELOG, PLAN section 9 and the decision entry updated

## Decisions

not yet written

## Checkpoints

### 2026-09-25T04:33:57.866Z

- **State:** Design accepted (decision 39ef); the week-one test of the riskiest assumption run with MojoComply's own scanner on two real repositories (evidence/live/2026-09-25-compliance-two-repositories.md: seven signals and eight proposals on the health-practice repository, none on the feedback tool; owner's verdicts pending); LANES.md written (10 items: 7 in five lanes, N7 done, N8 main at merge, N10 deferred); dispatch --apply created the five worktrees; all five lanes launched as agents
- **Evidence:** skilliton dispatch preview then --apply, 5 lanes created from f47142d; pnpm run scope --json exit 0 on both repositories; scrub-check PASS
- **Next:** Merge lanes as they report, in the order frameworks-data, compliance-runtime, compliance-hooks, security-json, compliance-skill (rebase, the lane's suites one file at a time, ff-only); then N8 records and the workflow version bump; then N10 with the ported scanner and the sheet
- **Git:** main @ f47142d, 4 uncommitted

### 2026-09-25T04:47:08.417Z

- **State:** Two lanes merged and pushed: security-json (N9, security status --json, main 9fb3e65) and compliance-skill (N6, the skill, its never-certifies eval and the words test, main ca4b52a); frameworks-data, compliance-runtime and compliance-hooks still building as agents; the plugin eval for the compliance skill waits for the runtime lane, whose state words and flags its fixture assumes
- **Evidence:** security-json rebased: eleven security suites, lint, lint-shape and the CLI suite (198 checks) exit 0; compliance-skill rebased: words test and its self-test, docs, lint, lint-shape exit 0; both fast-forwards contained; pushes to origin main exit 0
- **Next:** Merge frameworks-data, then compliance-runtime, then compliance-hooks as they report; then N8 (CONTRACTS, CHANGELOG, PLAN section 9, catalog sources, IT allowlist, CI steps for security.test.mjs and compliance-skill-words.test.mjs and the lanes' new tests, the workflow version bump and its description naming the compliance skill), the plugin eval, then N10
- **Git:** main @ ca4b52a, 1 uncommitted

## Handoff

- **State:** Two lanes merged and pushed: security-json (N9, security status --json, main 9fb3e65) and compliance-skill (N6, the skill, its never-certifies eval and the words test, main ca4b52a); frameworks-data, compliance-runtime and compliance-hooks still building as agents; the plugin eval for the compliance skill waits for the runtime lane, whose state words and flags its fixture assumes. Evidence: security-json rebased: eleven security suites, lint, lint-shape and the CLI suite (198 checks) exit 0; compliance-skill rebased: words test and its self-test, docs, lint, lint-shape exit 0; both fast-forwards contained; pushes to origin main exit 0.
- **Next:** Merge frameworks-data, then compliance-runtime, then compliance-hooks as they report; then N8 (CONTRACTS, CHANGELOG, PLAN section 9, catalog sources, IT allowlist, CI steps for security.test.mjs and compliance-skill-words.test.mjs and the lanes' new tests, the workflow version bump and its description naming the compliance skill), the plugin eval, then N10
- **Blocked:** nothing
- **Watch out:** nothing known
