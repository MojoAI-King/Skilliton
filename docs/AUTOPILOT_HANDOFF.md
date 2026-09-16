# Autopilot foundation: usage and integration handoff

Kind: Reference. Verified locally 2026-09-16. This is not a completed fleet rollout.

## What is ready

Branch: `codex/autopilot-foundation-0916`, based on `1608454`. The main checkout continued evolving independently. Integrate through the existing CLI work after reconciling current contracts; do not replace that work with this older checkout. `DECISIONS.md` is the only previously tracked file changed by this lane outside its new security scripts. Preserve main's newer entries when integrating it.

Prepare provisions status, backlog and archive, roadmap, decisions, lessons, handoff and archive, maintenance instructions, task/decision/lesson directories, a security catalog, observation storage, and a portable evidence runtime. It adopts explicit config or conventional document paths, and appends managed blocks to AGENTS.md and CLAUDE.md. It does not install a plugin, hook, shared service, or hosted merge rule.

The catalog has seven original practice summaries with related NIST SSDF 1.1 and OWASP ASVS 5.0.0 references. All begin missing. No control coverage percentage, certification, or framework completeness is implied.

## Run the reviewable demonstration

From this checkout:

```sh
node scripts/autopilot-demo.mjs
```

It creates a disposable Git repository and prints its path. It verifies dry-run, setup, repeat setup, missing observations, and an actual passing role-check test. It records scoped evidence, deliberately introduces a defect, reruns the test to confirm failure, and checks that the observation is stale while its original record remains unchanged. The demo intentionally ends with a defect. Open `.skillgate/security/REPORT.md` in its printed repository to inspect the result. It does not demonstrate a hosted merge gate.

## Prepare an explicitly chosen repository

Node.js and Git must be available. These commands run from the toolkit checkout; replace the sample target with the Git repository root:

```sh
node scripts/prepare.mjs --dir ../example-project
node scripts/prepare.mjs --dir ../example-project --apply
node scripts/prepare.mjs --dir ../example-project --check
```

Default is a preview with no writes. `--apply` provisions missing files and bounded managed content, preserving established record bodies. `--check` checks preparation, not application correctness. Preparation exits 0 on success, 2 for incomplete check, and 1 on refusal or error.

Existing `.skillgate/config.json` keys are preserved. Custom record paths go under `prepare.artifacts`, with the roles shown in `scripts/project-files.mjs`. `handoff.file` is adopted and must agree with that map. Paths must be simple repository-relative Markdown names. If a project uses unusual conventions, configure the map first; Prepare does not infer arbitrary pointers from prose.

## Record and refresh evidence

Run these from the prepared project. The placeholder files must exist and contain actual reviewed, redacted evidence:

```sh
node .skillgate/bin/security-evidence.mjs --help
node .skillgate/bin/security-evidence.mjs status --dir . --apply
node .skillgate/bin/security-evidence.mjs record --dir . \
  --control SG-SECURITY-TESTS --assessment observed \
  --source src/access.mjs --source access.test.mjs \
  --artifact .skillgate/private-evidence/access-pass.txt \
  --note "Role-check results reviewed for the explicitly tested roles." \
  --reviewer project-reviewer --apply
```

Record defaults to dry-run. `observed` needs at least one source and one artifact; `gap` and `needs-human` remain explicit unresolved assessments. The reviewer is a label, not an authenticated identity. Status is read-only unless `--apply` writes the generated report. It refuses to replace a human report lacking its generated marker.

Status exit 0 means every catalog control has a current recorded observation; it is not a security pass. Exit 2 means missing, stale, gap, or needs-human evidence. Exit 1 means an invalid record, input, or operation. Consumers must retain this distinction and show the denominator.

Source files and artifacts are hashed, not copied. Only named files and control/catalog definitions affect freshness. New dependencies, remote changes, expiry, omitted files, bad reasoning, and authenticated reviewer identity are outside this increment. Old record files are never rewritten by the runtime; repository permissions and trusted validation must protect them against manual alteration. Evidence metadata is intended to be reviewed before committing; raw artifacts stay private. A missing private artifact on another machine does not become an assumed pass.

## Recovery cases

1. **Setup lock present:** confirm no setup process is active. Inspect changed files and Git-private `skillgate-backups/` before removing a stale `.skillgate/prepare.lock` and retrying. A process killed mid-write cannot run rollback.
2. **Malformed config, duplicate markers, or incompatible runtime:** existing content is preserved. Reconcile the specific issue before retrying; an upgrade needs an explicit migration. Never delete a customized runtime just to make setup pass.
3. **Write failure or concurrent edit:** setup attempts rollback and reports whether it was incomplete. Preserve other writers' edits. Compare the remaining files with backups before recovery. This protects normal cooperating workflows; it is not a sandbox against a hostile process racing filesystem operations.

## Next integration, in order

1. **CLI and onboarding:** expose Prepare through the in-flight entry point. Keep the dry-run/apply contract; pass an explicit repository root. Package all three source files: `prepare.mjs`, `project-files.mjs`, `security-evidence.mjs`.
2. **Maintain and Review:** load the configured paths and consume the runtime report. Write new observations only after actual assessment. Report gaps rather than copying a previous passing status. The managed instructions already request this behavior; hooks and supported-client proof are still open.
3. **Session recovery and parallel work:** validate handoff injection against the prepared format, then implement separate task records and generated indexes. Do not let two contributors overwrite a single shared handoff as their sole record.
4. **Trusted checks:** run meaningful project-specific validation in CI, protect the check definitions, and test the combined merge result. Evidence freshness alone must never authorize merging.
5. **Security expansion:** approve applicability and mapping rationale, import pinned framework catalogs with appropriate rights, connect deduplicated gaps to the backlog, and prepare scoped assessment packets. Active penetration testing requires separate scope and authorization.
6. **Distribution:** add versioned migrations, company-approved releases, clean-machine install/update/rollback, and a beginner/team rehearsal. Keep upstream proposals separate from company-approved policy.

The broader acceptance gates are in `docs/AUTOPILOT_PLAN.md`. No global settings or hosted repository configuration were changed by this lane.
