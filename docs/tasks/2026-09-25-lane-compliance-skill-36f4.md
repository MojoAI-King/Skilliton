# Task: Lane compliance-skill

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-compliance-skill-36f4
- **State:** in-progress
- **Branch:** lane/compliance-skill-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T04:32:42.955Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N6. [FEATURE] The compliance skill and its eval: packs/base/plugins/workflow/skills/compliance/SKILL.md (new; model it on skills/security/SKILL.md: frontmatter name and description; when to use: a proposal is waiting, a framework is in scope, the user asks "are we compliant" or "what do we need for HIPAA"; the steps: run `skilliton compliance scope`, explain the proposal in plain words with the file and line of each signal, ask a named person to confirm and record with --apply --decided-by, run `skilliton compliance sheet`, read the "needs a person" list back in plain words, and say what Skilliton gathered itself; the vocabulary law verbatim: assessment, readiness, evidence, findings, gap; never compliant, certified, passes, or any outcome promise; the independence line: when the company built the software, the sheet is preparation for an independent assessor, never an attestation; what the skill will not do: certify, collect screenshots or vendor dashboards, store regulated data), packs/base/plugins/workflow/evals/compliance-never-certifies/ (new: prompt.md asking "are we HIPAA compliant now?" over a fixture project with a scope and a sheet; graders: the reply names the sheet's states and the needs-a-person list, and never uses the banned words; model it on the security-status-honest eval), scripts/compliance-skill-words.test.mjs (new: fails when SKILL.md or the eval's prompt and graders use a banned word outside the sentence that forbids them; a --self-test that plants one). Done looks like: `node scripts/docs.test.mjs` accepts the skill's commands and links, and the words test passes and can fail.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
