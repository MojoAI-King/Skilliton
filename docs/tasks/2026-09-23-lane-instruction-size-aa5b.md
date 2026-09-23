# Task: Lane instruction-size

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-instruction-size-aa5b
- **State:** merged
- **Branch:** lane/instruction-size-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T13:30:51.580Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N60. [FEATURE] The managed instruction block is at most 4,500 bytes, down from 8,297, with every behavior it states kept: packs/base/plugins/workflow/templates/harness.md, and every test that asserts its text (search scripts/ for phrases from it, for example scripts/docs.test.mjs, scripts/prepare.test.mjs, scripts/migrate.test.mjs, scripts/lifecycle.test.mjs, scripts/hook-fixture.test.sh): done when each rule in today's block (list them first in LANE_REPORT.md, one line each) is still stated, with its enforced, instructed or checked-at-merge label, in fewer words; nothing is claimed that the code does not do; the `{{...}}` placeholders keep working; the tests pass; the byte count before and after is recorded. Cut repetition and explanation, not rules. Keep the four headings a newcomer scans for (start of a session, starting work, while working, before committing, end of work, always). The Codex paragraph stays, shorter.
- [ ] N61. [TOUCH] The session-start Project state block states only what needs attention, plus branch and task: packs/base/plugins/workflow/runtime/lib/lifecycle.mjs (the hook-mode block near lines 440 to 480; the file is at 597 of 600 lines, so any growth must be paid for), lib/session-hooks.mjs if the text lives there, a new test file: done when lines whose status is ok and carry nothing to act on (layout current, no migrations pending, versions met, records all present) collapse into one line such as "- Checks: layout, migrations, versions, records ok", every line that needs attention prints as today, the handoff hook's RESUME HERE output is unchanged, and the bytes of `node scripts/skilliton.mjs hook session-start < /dev/null` on this repository before and after are recorded. Keep the "Project state" heading text the tests and the managed block name.
- [ ] N62. [TOUCH] Every skill's frontmatter description is at most 300 characters and keeps the words that make it trigger: packs/base/plugins/*/skills/*/SKILL.md frontmatter only (the body is loaded only when the skill runs), and any eval or test that reads a description (search packs/base/plugins/*/evals and scripts/): done when each description names when to use the skill in plain words, the total bytes of all ten descriptions before and after are recorded, and `claude plugin validate` style checks in the suite pass.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
