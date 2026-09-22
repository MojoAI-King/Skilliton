# Task: Lane gate-security

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-gate-security-cb77
- **State:** in-progress
- **Branch:** lane/gate-security-0922
- **Owner:** unassigned
- **Updated:** 2026-09-22T23:10:15.780Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N22. [TOUCH] CRITICAL: a replace ref switches the delivery gate off: packs/base/plugins/workflow/runtime/lib/delivery.mjs (gitRunner around line 59 passes the environment through without GIT_NO_REPLACE_OBJECTS; around line 506 a ref outside refs/heads is accepted without checks): reproduced by pushing `refs/replace/<main tip>` pointing at a commit-tree whose .skilliton/delivery.json protects only "nothing-here" ("accepted refs/replace/... without checks: not a protected branch"), after which an unsigned push removing a required file was "accepted refs/heads/main without checks". Fix: set GIT_NO_REPLACE_OBJECTS=1 in every git call the gate makes (lib/trust.mjs line 36 already does), and reject every update to refs/replace/* with a named reason. Tests: the two-push attack is rejected at the first push; with the ref present in the bare repository by other means, the gate still reads the real tip.
- [x] N23. [TOUCH] HIGH: gate checks run pushed code as the gate's own account and can rewrite the gate: lib/delivery.mjs runCheck (about line 275): fingerprint the pre-receive hook, the approvers file named by skilliton.approvers and the skilliton.* config values before the checks run and again after, and reject the push if any changed, naming what changed. Test: a check that appends to hooks/pre-receive causes a rejection. The docs sentence for docs/DELIVERY.md (the isolation limit, with the consequence stated plainly and "run the gate under an account that cannot write its own hook" as the remedy) goes in LANE_REPORT.md.
- [x] N24. [TOUCH] LOW: the delivery signature check pins no verifier: lib/delivery.mjs signatureStatus (about line 159): pass the same `-c gpg.program=<missing> -c gpg.x509.program=<missing>` pins lib/trust.mjs uses (around line 280), and inspect every gpgsig header rather than the first. Test: a commit signed in another format is not accepted as signed.
- [ ] N25. [TOUCH] LOW: join prints a credential typed in a URL: packs/base/plugins/workflow/runtime/lib/join.mjs lines 268 to 269 put the requested marketplace URL in a refusal verbatim; wrap it with the existing redact() from lib/preflight.mjs (about line 516) without growing join.mjs past 603 lines. Test: `join --marketplace 'https://someone:FAKEVALUE0123456789@github.com/o/r'` refuses without printing FAKEVALUE0123456789.
- [ ] N26. [TOUCH] Two missing release tests the reviewer named: a signed tag whose manifest names another version, and a tag whose header name differs from its ref, are both refused (lib/release.mjs lines 348 and 455 refuse them today; nothing tests it). New test file only.

## Decisions

not yet written

## Checkpoints

### 2026-09-22T23:07:57.132Z

- **State:** N22 and N23 built: the gate reads no replacement objects, refuses refs/replace/ pushes, and rejects a push whose checks changed its hook, approvers file or skilliton.* settings
- **Evidence:** node --test scripts/delivery-integrity.test.mjs: 4 pass 0 fail (N22 tests failed before the fix, the N23 test fails with the check disabled); node scripts/delivery.test.mjs exit 0; lint, deadcode, allowlist, footprint exit 0
- **Next:** N24 signature verifier pins
- **Git:** lane/gate-security-0922 @ c24dede, 4 uncommitted

### 2026-09-22T23:10:15.780Z

- **State:** N24 built: the delivery gate refuses a commit if any signature header is not SSH, and verify-commit runs with gpg.program and gpg.x509.program pointed at a missing program
- **Evidence:** node --test scripts/delivery-integrity.test.mjs 5 pass 0 fail; the N24 test fails on the pre-fix delivery.mjs (the forged OpenPGP header was accepted) and the pin alone still rejects it; delivery.test.mjs, lint, deadcode exit 0
- **Next:** N25 join redaction
- **Git:** lane/gate-security-0922 @ e98cd96, 3 uncommitted

## Handoff

- **State:** N24 built: the delivery gate refuses a commit if any signature header is not SSH, and verify-commit runs with gpg.program and gpg.x509.program pointed at a missing program. Evidence: node --test scripts/delivery-integrity.test.mjs 5 pass 0 fail; the N24 test fails on the pre-fix delivery.mjs (the forged OpenPGP header was accepted) and the pin alone still rejects it; delivery.test.mjs, lint, deadcode exit 0.
- **Next:** N25 join redaction
- **Blocked:** nothing
- **Watch out:** nothing known
