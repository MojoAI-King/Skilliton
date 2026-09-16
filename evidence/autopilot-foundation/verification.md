# Autopilot foundation verification

Kind: Reference. Local results recorded 2026-09-16 on the isolated foundation branch. These results do not prove real-client lifecycle triggers, company deployment, hosted merge enforcement, or complete framework coverage.

## Executed checks

| Command | Observed result |
|---|---|
| `node --test scripts/prepare.test.mjs scripts/security-evidence.test.mjs` | 41 tests passed, 0 failed, 0 skipped: 16 preparation tests and 25 evidence tests |
| `node scripts/autopilot-demo.mjs` | All six walkthrough stages reported PASS; intentional application defect failed its test and made prior evidence stale |
| `node scripts/token-cost.test.mjs` | Meter fixture test passed |
| `bash scripts/hook-fixture.test.sh` | All fixture checks passed; optional private originating-file measurement was not configured |
| `bash scripts/statusline.test.sh` | All assertions passed, including deliberately missing tooling and failed log writes |
| `bash scripts/handoff-hook.test.sh` | All 104 checks passed |
| `node scripts/packs.test.mjs` | Packaging checks passed |
| `node scripts/packs.test.mjs --self-test` | All five packaging mutations caught |
| `bash scripts/scrub-check.sh` with the existing private denylist configured | Names, dashes, home paths passed |
| `bash scripts/scrub-check.sh --self-test` with the same denylist | Clean fixture passed; all three bad-input classes caught |

The inherited checkout's default denylist path initially returned exit 2, INCOMPLETE. The actual existing private list was then supplied through `SKILLGATE_DENYLIST`; the scan and self-test passed. No replacement or empty denylist was fabricated. Resolve the default through main's ongoing changes, not a duplicate patch in this lane.

## User-visible walkthrough

1. Preview: no files written.
2. Apply and check: project records and copied runtime installed.
3. Reapply: zero changes.
4. Security status: zero current observations out of seven, all missing.
5. Actual role-check test passes, scoped source and output recorded: one current observation out of seven.
6. Source changed to allow an unauthorized role: application test fails; the observation becomes stale, current count returns to zero out of seven.
7. Earlier observation bytes remain unchanged.

The test runner detects the defect. The evidence runtime detects source drift; it does not claim to diagnose the defect itself. No shared merge gate is part of this demonstration.

## Independent review and corrections

- A concurrent edit during backup creation was overwritten. Forward publication now verifies expected destination content immediately before replacement, with an injected-race regression.
- Failed setup could expose backups of ignored config through Git. Backups now live in Git-private metadata; injected failure verifies rollback and no addable backup artifacts.
- Existing catalogs passed shallow setup validation but failed the runtime. Setup now invokes the actual bundled parser, with malformed-catalog coverage.
- Configured record aliases could collide with generated instructions. Reserved destinations and case-folded collisions are refused, with negative coverage.
- A concurrent edit during rollback could be overwritten. Restore now verifies expected content immediately before replacement, preserves the edit, and reports incomplete rollback. Independent source review confirmed the correction.
- A manually maintained security report could be overwritten. Generated reports now carry a versioned marker; manual content and modification time are preserved on refusal.

## Remaining proof

Real supported-client lifecycle execution, integration against main's newest CLI/plugins, parallel branch reconciliation, protected CI behavior, framework applicability, authenticated evidence, and clean-machine update/removal remain open. This local fixture evidence must not close those gates.
