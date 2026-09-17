# Task: Make Skilliton the consistent product name

Kind: Living. Task record.

- **ID:** 2026-09-16-make-skilliton-the-consistent-product-na-a6ba
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T01:03:54.750Z

## Request

Clean up naming consistency after the owner clarified that Skilliton is the evolved and rebranded product formerly called Skillgate.

## Acceptance criteria

- [x] Current product documentation and displayed runtime branding use Skilliton; former naming is explained once.
- [x] Existing skillgate commands, marketplace identity, configuration paths and stored records remain compatible.
- [x] Historical evidence stays intact and relevant offline checks pass.

## Decisions

See ../decisions/2026-09-16-skilliton-is-the-evolved-product-name-0be0.md and ../BRANDING.md. Retain technical identifiers and historical evidence; update displayed branding and bump workflow to 0.5.1.

## Checkpoints

### 2026-09-17T01:03:54.625Z

- **State:** Skilliton is the current product name throughout active docs, instructions, marketplace descriptions and runtime messages. Workflow is 0.5.1; existing identifiers and exact launcher recognition text are preserved.
- **Evidence:** Offline checks passed: packaging and self-test, docs and self-test, CLI 181, prepare/migrate/records 44, lifecycle 32, security 52, release 21, join 36, delivery 10, guardrails 487, hooks, drift, setup, meter, evidence and demo. Initial project rehearsal was 8/9 because its clone held the previous committed harness; unchanged rehearsal passed 9/9 from a committed temporary snapshot of the candidate. Strict marketplace and all three plugin validations passed. Scrub and self-test passed. Security register remains 0/15 current, 15 missing and undecided.
- **Next:** Publish the reviewed branding update; existing product milestone gates remain open.
- **Git:** main @ f8ae8af, 56 uncommitted

## Handoff

- **State:** Branding cleanup done locally; offline checks and strict plugin validation passed.
- **Next:** Publish the reviewed changes and read back GitHub branding and CI.
- **Blocked:** No blocker for this wording update. Existing product verification gaps remain open.
- **Watch out:** The command is still skillgate. A plugin update does not migrate prepared project instructions automatically.

## Review

- Claim: current displayed branding is Skilliton, with existing technical names preserved. Reviewed all changes; runtime edits are product-name strings and comments only, and workflow metadata moves from 0.5.0 to 0.5.1.
- Boundaries: no permissions, command names, configuration paths, schema IDs, release tags or marketplace IDs changed. Exact launcher and setup marker text stays compatible.
- Honesty check: no tests removed, skipped or weakened. Text expectations follow the approved brand change. Historical catalogs and evidence are untouched.
- Risk: installed copies need a plugin update, and existing prepared projects need the normal instruction migration. No installed-client verification or signed release is claimed for 0.5.1.
- Verdict: READY TO COMMIT after passing checks recorded above. The existing missing security evidence is unchanged and does not establish a security pass.
