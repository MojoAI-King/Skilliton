# Release record contract

Kind: Living. Draft design for PLAN.md M3. `skillgate release` and `skillgate verify` are not implemented. This replaces the earlier one-plugin JSON sketch; no accepted wire format is being migrated.

## What a release means

A company-approved release identifies the exact installable Skillgate components and their evidence. Approval comes from the configured repository/release authority. A user-editable approval array is a claim, not authentication.

Upstream publishing proposes a version to company maintainers. Company review and release authorize distribution to their developers. Installing that package and reconciling a project's generated files are separate operations with separate recorded outcomes.

## Required manifest information

Freeze exact field names and canonical hashing with the implementation and tests. The manifest must cover:

- Release identity, company/pack identity, version, immutable source commit and publication state.
- Components: plugins, executable runner, instruction templates, framework catalogs and migrations, with paths, versions and hashes of all installable bytes. Define exclusions and canonical hashing; reject escaping or ambiguous paths.
- Supported client adapters and prerequisite versions, plus supported project/config/evidence schema versions.
- Skill evaluation and deterministic validation artifacts bound to the exact candidate. Current public-safe evaluation summaries live at `evidence/<commit>/summary.json`; raw private transcripts are not a release payload.
- Trusted approval references and the method verify uses to validate them, with release-job authorization separate from evaluation credentials.
- Required project migrations, ordering, preconditions, preserved user-owned data, applied-version receipt and recovery strategy. Package rollback does not automatically reverse a project-data migration.
- Withdrawal state, reason and timestamp, plus update/rollback targets where permitted.

Project security observations remain in each application repository or approved evidence store. They must not be mixed into a Skillgate skill-evaluation score or published as part of a generic company skill release.

## Verification and update behavior

Target installed-package results: VERIFIED, TAMPERED, UNKNOWN VERSION and WITHDRAWN. Invalid manifests, unavailable trust evidence and operation failures must remain explicit unsuccessful results. Package verification is separate from project readiness, migration status and application security assessment.

Verify the downloaded/installable bytes against approved content before reporting success. Report the installed version, the project's required version, and its applied schema/migrations separately. Do not report a successful update if only some of these transitions happened.

Project reconciliation preserves human text and historical records, previews intended changes, checks preconditions, backs up modified owned content and supports tested recovery. Conflicting local edits require reconciliation rather than silent replacement. Migration receipts and backups must not expose private material through Git or public logs.

Withdrawing a release prevents future distribution under the company policy and makes verification report WITHDRAWN. It does not itself disable installed copies, remove plugins or restore project data. Rehearse installation, approved update, rejected/tampered update, partial failure, rollback and removal in M3 before claiming these operations work.
