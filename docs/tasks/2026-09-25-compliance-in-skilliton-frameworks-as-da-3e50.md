# Task: Compliance in Skilliton: frameworks as data, detection with a named confirmation, the control sheet from existing evidence

Kind: Living. Task record.

- **ID:** 2026-09-25-compliance-in-skilliton-frameworks-as-da-3e50
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-25T05:15:48.597Z

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

### 2026-09-25T05:15:48.597Z

- **State:** Four of five lanes merged on main: security-json (9fb3e65), compliance-skill (ca4b52a), frameworks-data (a08158c) and compliance-runtime (d26e71a, with a merge fix where the vocabulary check met the converted libraries: five phrases reworded in the converter, the baseline crosswalk checked on its own); the allow-list table names the eval fixture (5f58d44). N8 records written: CONTRACTS section 19 plus the config, command, layout and status --json entries; CHANGELOG Unreleased; PLAN sections 4 and 9; security-catalog-sources framework libraries; IT-ALLOWLIST row; workflow plugin.json 0.26.0 naming the compliance skill; decision 31e5 on rewording. The compliance-hooks lane is still building.
- **Evidence:** On the rebased compliance-runtime tree, 22 suites each exit 0, read one by one: compliance-scope 12 pass (the shipped knowledge-base case now runs), compliance-sheet 6, compliance-words and its --self-test, frameworks 91 ok plus 2 NOT RUN without the source and 93 with it, frameworks-convert --check 16 files match, lint, lint-shape, footprint, write-sites, deadcode, allowlist, skilliton 198, docs, names, packs, the two config tests, scrub-check, the security group with security.test.mjs, prepare/migrate/records, compliance-skill-words. On main after the records: docs, names, packs, allowlist, lint, scrub, skilliton, compliance-words and compliance-skill-words exit 0. Logs under the scratchpad merge folder.
- **Next:** Merge compliance-hooks when it reports (rebase, its suites, ff-only), and in the same step add the CI steps for frameworks, compliance-scope, compliance-sheet, compliance-words with --self-test, security.test.mjs, compliance-skill-words and the hooks tests; close the five lane task records as merged and run index; run claude plugin eval for compliance-never-certifies; N10, the two-repository re-measurement with the port; maintain --apply and the handoff. Owner items: review the baseline crosswalk and set reviewedBy, fill the verdict column in the two-repository evidence, check the terms for SOC 2 and PCI DSS.
- **Git:** main @ d26e71a, 10 uncommitted

## Handoff

- **State:** Four of five lanes merged on main: security-json (9fb3e65), compliance-skill (ca4b52a), frameworks-data (a08158c) and compliance-runtime (d26e71a, with a merge fix where the vocabulary check met the converted libraries: five phrases reworded in the converter, the baseline crosswalk checked on its own); the allow-list table names the eval fixture (5f58d44). N8 records written: CONTRACTS section 19 plus the config, command, layout and status --json entries; CHANGELOG Unreleased; PLAN sections 4 and 9; security-catalog-sources framework libraries; IT-ALLOWLIST row; workflow plugin.json 0.26.0 naming the compliance skill; decision 31e5 on rewording. The compliance-hooks lane is still building. Evidence: On the rebased compliance-runtime tree, 22 suites each exit 0, read one by one: compliance-scope 12 pass (the shipped knowledge-base case now runs), compliance-sheet 6, compliance-words and its --self-test, frameworks 91 ok plus 2 NOT RUN without the source and 93 with it, frameworks-convert --check 16 files match, lint, lint-shape, footprint, write-sites, deadcode, allowlist, skilliton 198, docs, names, packs, the two config tests, scrub-check, the security group with security.test.mjs, prepare/migrate/records, compliance-skill-words. On main after the records: docs, names, packs, allowlist, lint, scrub, skilliton, compliance-words and compliance-skill-words exit 0. Logs under the scratchpad merge folder.
- **Next:** Merge compliance-hooks when it reports (rebase, its suites, ff-only), and in the same step add the CI steps for frameworks, compliance-scope, compliance-sheet, compliance-words with --self-test, security.test.mjs, compliance-skill-words and the hooks tests; close the five lane task records as merged and run index; run claude plugin eval for compliance-never-certifies; N10, the two-repository re-measurement with the port; maintain --apply and the handoff. Owner items: review the baseline crosswalk and set reviewedBy, fill the verdict column in the two-repository evidence, check the terms for SOC 2 and PCI DSS.
- **Blocked:** nothing
- **Watch out:** nothing known
