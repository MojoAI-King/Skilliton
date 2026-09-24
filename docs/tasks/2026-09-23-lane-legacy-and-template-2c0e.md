# Task: Lane legacy-and-template

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-legacy-and-template-2c0e
- **State:** in-progress
- **Branch:** lane/legacy-and-template-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T03:31:53.025Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N19. [FEATURE] B69: the legacy migrations leave the runtime: the migrations from the pre-1.0 prototype and the earlier product name (lib/migrations.mjs: the 0001, 0002 and 0003 plans and their helpers, whatever moves a project from the earlier layout or the earlier name; decision 2026-09-22 a3d4 keeps the catalog id and is not reopened) move to scripts/legacy-migrate.mjs, a one-shot migrator run by hand (node scripts/legacy-migrate.mjs --dir <project> [--apply]) with the same preview-then-apply contract and the same receipts, so skilliton migrate sees them as applied; its header states the support cut-off (a project prepared before 1.0.0 runs it once, before skilliton migrate); commands/migrate.mjs refuses a project still on the earlier layout with the exact command to run; the pin for migrations.mjs in scripts/lint.test.mjs is lowered to the new count; the legacy cases in the migrate tests point at the new script; a project prepared on 1.x sees nothing pending after this change (prove it on a fixture prepared at the base commit).
- [ ] N20. [TOUCH] B65: the instruction block every prepared project carries is smaller: packs/base/plugins/workflow/templates/harness.md (30 lines, 4,499 bytes at the base) is rewritten under 2,600 bytes with every Enforced and Instructed statement kept as a fact (nothing enforced becomes instructed, nothing instructed disappears; the Project records, Start of a session, Starting work, While working, Session cost, Before committing, End of a stretch and Always sections stay), shorter sentences, one example of each command form, no em or en dashes; the template edit makes migration 0100-instructions-<sha12> pending in every prepared project: do not run migrate here (CLAUDE.md and AGENTS.md are main-only); scripts/docs.test.mjs, scripts/prepare.test.mjs, the migrate tests and scripts/lifecycle.test.mjs must pass (where one asserts the block's words, update the words it asserts, not the meaning); report the byte count before and after in LANE_REPORT.md.
- [ ] N21. [FEATURE] B48: an eval case puts a model in front of an audit finding: packs/base/plugins/workflow/evals/audit-finding-acted-on/ (case.yaml, prompt.md, fixture.sh, graders/) in the shape of the existing cases (read evals/README.md and security-status-honest): the fixture prepares a repository carrying one planted flaw the audit's rules catch (an interpolated exec), the prompt asks the model to run skilliton audit --working and fix what it reports; the graders check that the finding's file and line were read, that the fix is on that line and the audit is clean after, and that no other file changed; the case is meant to run with and without the workflow plugin's security skill under claude plugin eval, which is a main-only check: this lane makes the fixture and the graders run offline (the README's dry-run form, or a self-check script beside the case) and writes the exact eval command for the main window under Merge-time expectations.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
