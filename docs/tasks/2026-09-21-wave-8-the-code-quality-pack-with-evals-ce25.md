# Task: Wave 8: the code-quality pack with evals, the audit's own allow markers, collectors in CI, pinned installs, and the owner walkthrough

Kind: Living. Task record.

- **ID:** 2026-09-21-wave-8-the-code-quality-pack-with-evals-ce25
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-21T04:51:07.196Z

## Request

ok least get to wokr on this last wave then before I do a ful review of the product. Scope chosen by the owner: 06-03 plus the three loose items and B45. Four cleanup skills: split an oversized file, remove dead code safely, make a test able to fail, name things consistently. Eval ceiling 20 USD. Review walkthrough as one ordered list.

## Acceptance criteria

- [ ] eval cases exist for each cleanup skill, run with and without the skill, results recorded
- [ ] the pack ships in packs/ only for skills whose evals show a difference; the rest are recorded as not shipped and why
- [ ] the session start detects that the plugins are absent and says enrollment comes first, with a fixture test
- [ ] the collectors run in CI as evidence, with the step named in checks.yml
- [ ] the install path pins to a signed tag and refuses an unsigned or moved tag, with a test
- [ ] update moves between tags only, with a test
- [ ] every audit alarm this repository raises over its whole tree carries an allow marker with a reason, and the remaining count is recorded in docs/COVERAGE.md (B45)
- [ ] one ordered list for the owner's hands-on pass through the product

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
