# Task: Lane hygiene-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-hygiene-review-504d
- **State:** in-progress
- **Branch:** lane/hygiene-review-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T15:40:40.138Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N80. [TOUCH] The allow-list writes scenario is hermetic on Linux: scripts/allowlist.test.mjs, the writes scenario (the temporary-home run that lists every path written): a reviewer's Linux box saw `~/.npm/_logs` written under the temporary home, which is npm's own log folder when the gate runs `npm run verify`, not Skilliton's write. Set `npm_config_cache` and `npm_config_logs_dir` (and `NPM_CONFIG_UPDATE_NOTIFIER=false`) to folders inside the scenario's temporary directory for the child processes the scenario starts, so npm's own files land where the scenario expects, and add those two paths to what the scenario tolerates with a comment naming npm as the writer. Prove it by running the scenario with a fake HOME on this machine and, if `docker` or a Linux box is not available, say in the report that Linux is not proved here and name the CI step that will prove it.
- [x] N81. [TOUCH] The planted secret fixtures are assembled at run time: scripts/preflight.test.mjs lines 485 to 512 and 564 to 568 at the base hold token-shaped literals for the redaction tests (an Anthropic-key-shaped alphabet string, AWS's published example key id, a Stripe-shaped restricted key, a published example JWT, `ghp_` query strings). Build each value at run time from parts (`"sk-ant-" + "api03-" + ...`, a prefix plus a computed tail) so no line in the file matches a secret scanner's pattern while the test still feeds the same bytes to preflight; keep the audit markers where the audit still needs them and remove the ones it no longer needs (run `node scripts/skilliton.mjs audit` on the working tree to see); update the entries for this file in .skilliton/security/secrets-allow.json only by removing the ones whose lines no longer match (do not add entries), and run `node scripts/skilliton.mjs security collect secrets` (preview) to show the file no longer matches a specific shape. The file may not grow past 622 lines.
- [x] N82. [FEATURE] An interrupted prepare is recoverable by the book: a new test scripts/prepare-interrupt.test.mjs that starts `prepare --apply` on a fixture repository as a child process, sends SIGTERM after the first file is written (poll for `docs/STATUS.md` or the first record the plan names, then signal), then asserts: the next `prepare --apply` refuses naming `.skilliton/prepare.lock` and the exact recovery steps (confirm the process named in the lock is gone, remove the lock, run again), that following those steps completes the preparation, and that the result equals a preparation that was never interrupted (compare the file lists and contents, except timestamps). If the lock's refusal text does not name the process id or the steps, change that message in prepare.mjs by same-line edits and say so. A crash-atomic multi-file transaction is not asked for; a documented, tested recovery is.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T15:40:40.138Z

- **State:** all 3 items done: N80 (npm redirected off HOME in the allow-list writes scenario), N81 (planted secrets in preflight.test.mjs assembled at run time), N82 (prepare-interrupt.test.mjs proves the documented lock recovery)
- **Evidence:** node scripts/allowlist.test.mjs and --self-test pass on macOS and Linux (Docker, node:22-bookworm); node --test scripts/preflight.test.mjs 24/24, node --test scripts/collectors.test.mjs 22/22, node scripts/secret-rules.test.mjs 5/5; node --test scripts/prepare-interrupt.test.mjs passes on macOS (5/5 runs) and Linux (Docker, 3/3 runs) and fails against the unpatched message; node --test scripts/prepare.test.mjs 42/42 unaffected; node scripts/lint.test.mjs and node scripts/docs.test.mjs pass; three commits, one per item
- **Next:** none: this lane's scope is complete; main integrates it in the serial merge order
- **Git:** lane/hygiene-review-0923 @ 8bdc850, 1 uncommitted

## Handoff

- **State:** all 3 items done: N80 (npm redirected off HOME in the allow-list writes scenario), N81 (planted secrets in preflight.test.mjs assembled at run time), N82 (prepare-interrupt.test.mjs proves the documented lock recovery). Evidence: node scripts/allowlist.test.mjs and --self-test pass on macOS and Linux (Docker, node:22-bookworm); node --test scripts/preflight.test.mjs 24/24, node --test scripts/collectors.test.mjs 22/22, node scripts/secret-rules.test.mjs 5/5; node --test scripts/prepare-interrupt.test.mjs passes on macOS (5/5 runs) and Linux (Docker, 3/3 runs) and fails against the unpatched message; node --test scripts/prepare.test.mjs 42/42 unaffected; node scripts/lint.test.mjs and node scripts/docs.test.mjs pass; three commits, one per item.
- **Next:** none: this lane's scope is complete; main integrates it in the serial merge order
- **Blocked:** nothing
- **Watch out:** nothing known
