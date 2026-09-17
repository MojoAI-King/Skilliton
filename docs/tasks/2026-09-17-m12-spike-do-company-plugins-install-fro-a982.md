# Task: M12 spike: do company plugins install from managed settings with no developer command

Kind: Living. Task record.

- **ID:** 2026-09-17-m12-spike-do-company-plugins-install-fro-a982
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T16:02:19.631Z

## Request

not yet written

## Acceptance criteria

- [ ] On a clean Linux container, with a Claude Code managed-settings drop-in placed by root where device management places it, each trigger (no command, plugin list, a headless run without login, an interactive start) is measured for whether the company marketplace is registered and its plugins installed
- [ ] Both a GitHub marketplace source and a local folder source are measured, on a stated Claude Code version, with no login and no secret inside the container
- [ ] The run is a repeatable script whose evidence (files placed, commands, outputs) is committed under evidence/rehearsals after the scrub check
- [ ] PHASE-3.md riskiest assumption, CLIENTS.md, COVERAGE.md and PLAN.md M12 state say what was measured, and the design consequence for first-login setup is recorded as a decision
- [ ] The clean macOS account half is reported as not run, with what it needs

## Decisions

not yet written

## Checkpoints

### 2026-09-17T16:02:19.536Z

- **State:** Linux half measured: a managed drop-in installs the company plugins with no developer command, active from the third start (GitHub) or second (folder); a seed is active from the second and never updates; a first-login install makes the first start active. Decision 9cf3 pairs the drop-in with a first-login install. macOS half not run.
- **Evidence:** node scripts/rehearsals/enrollment.mjs from 466515c: 8 of 8 on Claude Code 2.1.274, evidence/rehearsals/2026-09-17-enrollment; --self-test 11 of 11 plus three mutants failing; independent review found 8 issues, all fixed (lesson da88); Ctrl-C and SIGTERM tested
- **Next:** macOS clean account on a separate Mac or VM; re-measure with a real login (B3); then build the M12 bundle
- **Git:** main @ 466515c, 19 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
