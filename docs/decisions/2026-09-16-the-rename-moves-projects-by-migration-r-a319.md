# The rename moves projects by migration, refuses old machine setup, and keeps protection in force until a project moves

Kind: Living. Decision entry.

- **ID:** 2026-09-16-the-rename-moves-projects-by-migration-r-a319
- **Status:** accepted
- **Date:** 2026-09-16

## Decision

Milestone M9 renames every current technical name to Skilliton (workflow 0.6.0, guardrails 0.3.0, context-hygiene 0.2.0). How existing state moves:

1. **Prepared projects** move by migration `0003-skilliton-names` from layout 2 to layout 3, inside one transaction with backups, a receipt and rollback. Until then every command except `migrate`, `status`, `doctor` and the hooks refuses the project, because every file the runtime reads now lives under `.skilliton/` and a lenient reader would report the project's evidence as missing.
2. **Machines joined under the old names** are not moved: `join` refuses while the old receipt exists and names the undo to run with the release that wrote it. This changes the Phase 3 plan, which said setup would move them.
3. **Other old state** (environment variables, signers file, installs, release tags, delivery hook, denylist, status line backups, journal and backups in the Git folder) is named where it is found and never read as configuration or trust.
4. **Two exceptions keep protection from lapsing:** the guardrails hook still honours an unmigrated project's `.skillgate/config.json`, and the delivery gate still enforces a policy at `.skillgate/delivery.json`, guarding both policy files so the migration commit needs an approver's signature.
5. **Kept names:** security catalog versions and `SG-` control IDs (O23), recorded evidence, dated records, and the prototype's exact bytes. `runtime/lib/legacy-names.mjs` is the one module that spells the old technical names, and `scripts/names.test.mjs` enforces the rest with a reason per allowlist entry.
6. Rollback now orders receipts by their recorded `appliedAt`, not their IDs (lesson 2026-09-16-rollback-ordered-receipts-by-id-so-an-ol-70e5); a receipt with the earlier schema is never later.
7. **Changes after an independent security-first review** of the first local commit (13 findings, all fixed with regression tests before publishing): the gate checks the combined result so a merge cannot restore an earlier policy; the migration keeps private evidence owner-only, keeps the earlier `.gitignore` lines, checks the evidence is ignored before saying "commit", refuses a rollback that would leave new files outside the restored ignore lines, validates that a receipt's moves pair up, refuses colliding team settings keys, refuses an instruction block that is not exactly what the earlier release wrote even without a receipt, and refuses names that differ only in letter case; parser messages that could quote a configuration are never printed; `harness`, `prepare` and `project-settings` refuse earlier state instead of adding beside it; the stop reminder and doctor open unmigrated projects; the names allowlist is scoped to named files and sections.

## Why

The owner asked that the whole project be Skilliton (2026-09-16). A migration is how this product changes project files: previewed, backed up, receipted and reversible. For machines, the only joined setups exist in rehearsals, and moving trust and launcher files on the strength of an old receipt would be new deletion code driven by untrusted input, the failure the join security review found. For the gate and the guardrails, reading the old files is the only way the rename does not create a window where a protected branch or a protected project is unprotected.

## Alternatives rejected

- **Keeping `skillgate` as an alias:** two command names, two sets of variables and folders to secure and test, for no existing user.
- **Moving joined machines automatically:** see Why.
- **Letting commands run on an unmigrated project:** security status would report "no catalog" and prepare would start a second folder beside the first.
- **Asking administrators to remove the gate while the policy moves:** an unprotected window on the shared branch, and the earlier gate would still reject the commit that removes its policy.
- **Renaming the catalog versions and control IDs:** rewrites evidence records.

## Risk

- The two enforcement exceptions read old files; they are limited to settings that protect, and the gate guards both policy files and the combined result.
- The earlier `.gitignore` lines stay in migrated projects, which is the safe side for other clones and branches, at the cost of two lines with the old name.
- Observations whose files moved under `.skilliton/` report those files missing until reassessed (only collector artifacts; this repository has none).
- A joined machine needs the earlier release to undo its setup, which is a manual step.
- The names allowlist allows whole files for code that must spell old names; a stray old name inside those files is not caught.

## Reversibility

Moderate. A project's migration rolls back with `migrate --rollback 0003-skilliton-names --apply` while nothing it wrote has changed. The code and names revert with Git, but projects and machines moved in between would need moving back.

## Evidence

This repository was migrated by 0003 itself (receipt `.skilliton/migrations/0003-skilliton-names.json`). `scripts/rename.test.mjs` runs the real earlier release from commit e5900d5 to prepare a project, then migrates it, refuses what it cannot move, rolls back exactly, and checks each old-state report. `scripts/delivery.test.mjs` pushes to a branch whose policy is at the old path. `scripts/names.test.mjs` with its self-test. The fork, machine and company release rehearsals on real clients are recorded in the task record.
