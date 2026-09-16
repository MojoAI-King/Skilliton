# Original foundation decision

Kind: Reference. Archived from `23aae41`. Current design decisions live in [DECISIONS.md](../../../DECISIONS.md).

## 2026-09-16 Provision project records and evidence before expanding the skill catalog

**Decision:** Add a reversible, explicit repository preparation command and a local security-observation ledger as the first increment of the development harness. Security records are included by default.
**Why:** The owner wants the full working arrangement installed, including the documents Maintain will reconcile. Generic testing reminders alone do not establish continuity across people or sessions.
**Alternatives rejected:** A large skill collection; overwriting existing project docs; a central service required for a solo project; treating a passing scan as framework compliance.
**Risk:** Written instructions can be skipped and observations can be incomplete. Separate instructed behavior from executable checks, show missing/stale evidence, and require actual lifecycle and hosted-merge proof in later gates.
**Reversibility:** EASY for new files and managed blocks; source content is preserved and previous modified files are backed up in Git-private metadata. No remote enforcement is changed.
**Architecture review:** Components are Prepare, copied runtime, project records, and append-only observations. There are no runtime network calls. Reapply must preserve existing data. Invalid/empty state fails visibly. Caught write failures roll back where possible and report failure; retry must not clobber human edits. Process termination may leave a lock and requires inspection before retry. Every status command prints its result and denominator. Critique: local fingerprints do not prove security or capture external changes. Revision: scope this increment to observation freshness, with collectors and trusted merge enforcement as explicit follow-on work. Review exposed concurrent-write and backup-publication failures; regression tests now cover both. Evidence: `evidence/autopilot-foundation/verification.md`.
