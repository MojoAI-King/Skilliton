# Task: Lane quality

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-quality-91cd
- **State:** in-progress
- **Branch:** lane/quality-0922
- **Owner:** unassigned
- **Updated:** 2026-09-23T01:02:18.465Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N39. [TOUCH] Real bug: the two handoff parsers disagree about code fences: packs/base/plugins/workflow/hooks/session-start-handoff.sh extracts `## RESUME HERE` ignoring fences, while runtime/lib/handoff.mjs (about line 66) respects them, so a handoff with a fenced example `## RESUME HERE` above the real one makes the session-start hook show the example and never the real note (reproduced by the review). Done: the bash hook skips fenced blocks exactly as the Node parser does, and a test in scripts/handoff-hook.test.sh or a new file proves both parsers pick the same section for a handoff with a fenced example, with a mutation case.
- [ ] N40. [TOUCH] Secret patterns are defined five times and disagree (runtime/lib/core.mjs about line 294 `AKIA[0-9A-Z]{16}`; lib/security-io.mjs about line 90 `AKIA|ASIA` 12 or more; lib/audit.mjs about line 96; lib/preflight.mjs about lines 466 to 469 `AKIA|ASIA|ABIA|ACCA`; and packs/base/plugins/guardrails/hooks/guard-bash.sh about line 670). Done: one new module, runtime/lib/secret-rules.mjs, holds the shapes, and the four runtime modules import it; a new parity test reads the bash list from guard-bash.sh and fails when a shape in one set is missing from the other, with any deliberate difference named in the test with its reason. Behavior may only widen (a shape any scanner caught before is still caught by all); say in the report which shapes widened where.
- [ ] N41. [TOUCH] The router's error handling: packs/base/plugins/workflow/runtime/skilliton.mjs: the top-level catch (about lines 107 to 115) knows only `Refused`, while `guardCommand` in lib/lifecycle.mjs (about lines 65 to 79) holds the real mapping of engine error classes to exit codes and only four commands use it, so a class a command forgets to translate is reported as a bug. Done: the router's catch applies the same mapping for every command (import it; do not move the classes), `skilliton.mjs` no longer re-imports ./lib/core.mjs dynamically (about line 92) when it is imported statically at line 17, and the "planned but not built" branch the lint already makes unreachable is removed. A test drives one command that throws each mapped class and checks the exit code and message.
- [ ] N42. [TOUCH] The runtime's version is not the product's version: `skilliton status` and `skilliton --version` (if it exists; add it if not, printing both) say "workflow runtime 0.21.0" while the product is released as 1.0.0, which a reviewer will ask about. Done: `skilliton --version` prints the workflow plugin version and, when a signed release manifest in the skills repository names the installed plugins, that release's version (for example "workflow 0.22.0, part of release 1.0.1"), or says no release names this version; `status` prints the same pair on its Versions line. Tests for both cases.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
