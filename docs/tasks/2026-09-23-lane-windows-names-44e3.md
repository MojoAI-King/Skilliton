# Task: Lane windows-names

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-windows-names-44e3
- **State:** in-progress
- **Branch:** lane/windows-names-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T07:15:47.669Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N63. [FEATURE] On Windows, every program the runtime starts by a bare name is resolved through PATH before it starts, so a program in the working folder cannot stand in for it (backlog B79; measured with a decoy node.exe in evidence/live/windows/2026-09-23-hosted-runner-port.md): one exported helper in packs/base/plugins/workflow/runtime/lib/core.mjs (for example `resolveProgram(name, { platform, which })`: on win32 and when the name has no path separator, `which(name)` or, when not found, the name unchanged so the start fails as before and is reported), used at every start of a program by bare name: the `git` starts in lib/collectors.mjs (4), lib/delivery.mjs (2; that file is pinned at its size in scripts/lint.test.mjs and may not grow, so keep the same line count), lib/journal.mjs (1), lib/trust.mjs (1), the delivery-policy checks in lib/collectors.mjs (the spawn near line 212), lib/delivery.mjs (near line 297) and lib/gate.mjs (near line 89), runProgram in core.mjs, and any other start the allow-list inventory lists; scripts/inventory.mjs (and scripts/allowlist.test.mjs's DYNAMIC_CALLS if needed) taught that `resolveProgram("<literal>")` starts that literal program, so section 1 of docs/IT-ALLOWLIST.md still matches with no new dynamic entries; a new test file with the platform and `which` injected: done when a win32 bare name comes back as the PATH match, a name with a separator and every non-Windows platform come back unchanged, a missing program comes back unchanged, `node scripts/allowlist.test.mjs` passes, and behavior on macOS and Linux is byte-identical. The .github/workflows/windows.yml decoy step should then pass; do not push to run it, main does.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T07:15:47.669Z

- **State:** N63 implemented: resolveProgram added to core.mjs and used at every bare-name git/check start named in the item (collectors.mjs x4+1 check-spawn, delivery.mjs x2+1 check-spawn kept at its pinned 599 lines, journal.mjs x1, trust.mjs x1, gate.mjs 1 check-spawn, runProgram in core.mjs); inventory.mjs taught to read resolveProgram("<literal>") as that literal with a net-zero line change (pinned at 688); allowlist.test.mjs's three check-spawn DYNAMIC_CALLS entries updated to their new arg text; new scripts/resolve-program.test.mjs covers win32 PATH match, separator/non-win32/missing-program passthrough; a step for it added to .github/workflows/checks.yml
- **Evidence:** node scripts/allowlist.test.mjs (incl. --self-test), node scripts/lint.test.mjs (incl. --self-test), node scripts/deadcode.mjs, node scripts/docs.test.mjs, node scripts/footprint.test.mjs all passed exit 0; node --test on collectors.test.mjs (21 pass), delivery.test.mjs (15 pass), gate.test.mjs (18 pass), git-config.test.mjs (8 pass), resolve-program.test.mjs (5 pass) all green
- **Next:** main merges this lane, then the .github/workflows/windows.yml decoy step should pass on a push
- **Git:** lane/windows-names-0923 @ 96b6cc1, 10 uncommitted

## Handoff

- **State:** N63 implemented: resolveProgram added to core.mjs and used at every bare-name git/check start named in the item (collectors.mjs x4+1 check-spawn, delivery.mjs x2+1 check-spawn kept at its pinned 599 lines, journal.mjs x1, trust.mjs x1, gate.mjs 1 check-spawn, runProgram in core.mjs); inventory.mjs taught to read resolveProgram("<literal>") as that literal with a net-zero line change (pinned at 688); allowlist.test.mjs's three check-spawn DYNAMIC_CALLS entries updated to their new arg text; new scripts/resolve-program.test.mjs covers win32 PATH match, separator/non-win32/missing-program passthrough; a step for it added to .github/workflows/checks.yml. Evidence: node scripts/allowlist.test.mjs (incl. --self-test), node scripts/lint.test.mjs (incl. --self-test), node scripts/deadcode.mjs, node scripts/docs.test.mjs, node scripts/footprint.test.mjs all passed exit 0; node --test on collectors.test.mjs (21 pass), delivery.test.mjs (15 pass), gate.test.mjs (18 pass), git-config.test.mjs (8 pass), resolve-program.test.mjs (5 pass) all green.
- **Next:** main merges this lane, then the .github/workflows/windows.yml decoy step should pass on a push
- **Blocked:** nothing
- **Watch out:** nothing known
