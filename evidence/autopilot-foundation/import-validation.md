# Foundation material import validation

Kind: Reference. Local checks performed 2026-09-16 on the combined source tree: alignment base `cd23189` plus foundation `23aae41`. This record covers availability and standalone/regression behavior; it does not close PLAN.md M1-M5.

## Material accounting

All material unique to the foundation is present as ordinary repository files: six implementation/test/demo files, original verification, and the archived plan, handoff and decision. The current plan and integration brief remain authoritative. docs/AUTOPILOT_START_HERE.md indexes the complete package; docs/BUILD_GOAL.md preserves the full execution objective. docs/GOAL_COMMAND.md provides a separately reviewed launcher measured at 1,369 characters including `/goal`, below the reported 4,000-character limit. No goal was launched by this import.

The following file bytes match the foundation snapshot exactly. Git blob IDs identify the tested source without depending on a sibling worktree:

| File | Git blob | Import check |
|---|---|---|
| `scripts/prepare.mjs` | `779a944c41323e158536b09ecd5e61cbfbbca8ef` | Exact match |
| `scripts/project-files.mjs` | `42bc8bb65b0462145991c3ef595cedf6130a3e69` | Exact match |
| `scripts/security-evidence.mjs` | `c8193e8688387b24d7721443cd9c1855c1fb3944` | Exact match |
| `scripts/autopilot-demo.mjs` | `5e41fada2b0a14ced3cd352dbfc3777b554e749a` | Exact match |
| `scripts/prepare.test.mjs` | `af5fe7aa61cf47b756e9375f0bdd7096f5db6f06` | Exact match |
| `scripts/security-evidence.test.mjs` | `2588039a3b0c1c83529fe4d2e7fb095fa27ac95c` | Exact match |

Runtime used: Node.js `v25.8.1`. Original prototype documentation moved under docs/history/autopilot-foundation/ with explicit superseded/history labels. The current DECISIONS.md retained the aligned design and gained the import decision; the original foundation decision is preserved in that archive.

## Executed verification

| Command | Result |
|---|---|
| `node --test scripts/prepare.test.mjs scripts/security-evidence.test.mjs` | PASS: 41 tests, 0 failed, 0 skipped |
| `node scripts/autopilot-demo.mjs` | PASS: all six stages; actual synthetic defect fails its test and makes the original observation stale without changing its record |
| `node scripts/skillgate.test.mjs` | PASS: 142 checks |
| `node scripts/setup.test.mjs` | PASS: 18 checks |
| `node scripts/evidence.test.mjs` | PASS: 19 checks |
| `node scripts/packs.test.mjs` | PASS: packaging checks |
| `node scripts/packs.test.mjs --self-test` | PASS: all five mutations caught |
| `bash scripts/guardrails.test.sh` | PASS: 246 checks |
| `bash scripts/handoff-hook.test.sh` | PASS: 104 checks |
| `bash scripts/hook-fixture.test.sh` | PASS: fixtures; optional private originating-file measurement not configured |
| `bash scripts/statusline.test.sh` | PASS: all assertions |
| `node scripts/token-cost.test.mjs` | PASS: meter fixtures; historical real-window reproduction remains unresolved |

The demonstration is intentionally left with a failing synthetic application test. The demo command itself succeeded by observing that expected failure and the stale observation. It does not configure hosted merge enforcement.

## Review scope and remaining work

A separate read-only review checked source inventory, archive authority, goal persistence and the absence of branch/chat dependencies. The only pending link at review time was this validation file, subsequently created. No existing runtime code, workflow skill or hosted configuration was modified by the import.

The current onboarding CLI does not invoke these new standalone commands. Config recognition, single instruction rendering, result adapters, package-owned runtime distribution, lifecycle checkpoints, broader security collection and real-client/company/new-builder rehearsals remain open under PLAN.md. The new tests were run locally; the existing hosted CI workflow has not been expanded to run them yet. No paid evaluations, remote CI runs, production probes, company rollout or publication were performed during this import.
