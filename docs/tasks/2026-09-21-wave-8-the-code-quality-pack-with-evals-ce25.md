# Task: Wave 8: the code-quality pack with evals, the audit's own allow markers, collectors in CI, pinned installs, and the owner walkthrough

Kind: Living. Task record.

- **ID:** 2026-09-21-wave-8-the-code-quality-pack-with-evals-ce25
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-21T05:01:35.178Z

## Request

ok least get to wokr on this last wave then before I do a ful review of the product. Scope chosen by the owner: 06-03 plus the three loose items and B45. Four cleanup skills: split an oversized file, remove dead code safely, make a test able to fail, name things consistently. Eval ceiling 20 USD. Review walkthrough as one ordered list.

## Acceptance criteria

- [ ] eval cases exist for each cleanup skill, run with and without the skill, results recorded
- [ ] the pack ships in packs/ only for skills whose evals show a difference; the rest are recorded as not shipped and why
- [ ] the session start detects that the plugins are absent and says enrollment comes first, with a fixture test
- [ ] the collectors run in CI as evidence, with the step named in checks.yml
- [ ] the install path pins to a signed tag and refuses an unsigned or moved tag, with a test
- [ ] update moves between tags only, with a test
- [x] every audit alarm this repository raises over its whole tree carries an allow marker with a reason, and the remaining count is recorded in docs/COVERAGE.md (B45) (evidence: commit a9eea9e; `skilliton audit --range <root>..HEAD` over all 480 files reports 0 findings and 45 allowed lines, down from 41 findings; 39 trailing markers plus two JSON descriptions reworded off the literal flag; docs/COVERAGE.md carries both counts and B45 is archived)
- [ ] one ordered list for the owner's hands-on pass through the product

## Decisions

not yet written

## Checkpoints

### 2026-09-21T05:01:35.178Z

- **State:** B45 is closed: the whole tree audit reports 0 findings over all 480 files, down from 41, with 45 allowed lines each carrying its own reason
- **Evidence:** commit a9eea9e; 14 gates each exit 0 on its own line including guardrails.test.sh, preflight, lint at the 674 pin, and strict plugin validation of all four targets run with the session's own client; skilliton audit --range <root>..HEAD exit 0, 0 findings in 480 files, 45 allowed lines
- **Next:** Wave 8 step 3: the four cleanup skills as a new code-quality pack in packs/
- **Git:** main @ a9eea9e, 4 uncommitted

## Handoff

- **State:** B45 is closed: the whole tree audit reports 0 findings over all 480 files, down from 41, with 45 allowed lines each carrying its own reason. Evidence: commit a9eea9e; 14 gates each exit 0 on its own line including guardrails.test.sh, preflight, lint at the 674 pin, and strict plugin validation of all four targets run with the session's own client; skilliton audit --range <root>..HEAD exit 0, 0 findings in 480 files, 45 allowed lines.
- **Next:** Wave 8 step 3: the four cleanup skills as a new code-quality pack in packs/
- **Blocked:** nothing
- **Watch out:** nothing known
