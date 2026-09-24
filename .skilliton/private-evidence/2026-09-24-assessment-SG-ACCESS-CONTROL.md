# Assessment note: SG-ACCESS-CONTROL

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Check permissions for every function and data item on the server. Expected: the documented access rules for
functions and for individual records, and tests in which one user requests another user's data or an administrator
function and is denied. Assessment recorded: observed, scoped as the applicability decision scopes it.

## Scope

Skilliton has no user accounts and no per-user data. Its server side is the hosted delivery gate (the pre-receive hook
on the shared repository); its administrator functions are changing the delivery policy, creating a protected branch,
and removing the records Skilliton keeps. The applicability decision says so: the shared-repository gate decides who
may change the policy, by signature.

## Documented rules

- docs/DELIVERY.md sections "1. The policy file" and "2. Which branches are protected", and step "Approvers sign policy
  changes" under "Set it up"; docs/CONTRACTS.md section "14. Trusted delivery checks" (the removal rule, protected
  branches).
- The record protection on a person's machine: the guardrails skill (guardrails/skills/guardrails/SKILL.md under
  packs/base/plugins/), row "Removing what Skilliton keeps" and setting protectRecords.
- Code: runtime/lib/delivery.mjs signatureStatus; runtime/lib/delivery-protect.mjs checkHeldPaths;
  runtime/lib/delivery-persist.mjs checkRemovals; runtime/lib/delivery-policy.mjs readApproversFile.

## Denied requests for an administrator function

- scripts/delivery.test.mjs: "policy changes: unsigned is rejected; the current policy still runs its check; a
  non-approver signature is rejected; an approver signature is accepted"; "creating a protected branch needs a policy
  and an approver signature"; "a merge cannot bring back an earlier policy without an approver"; "removing what
  Skilliton keeps needs an approver-signed commit"; and the mutation checks that fail when the gate ignores a missing
  approver signature.
- scripts/guardrails.test.sh, section "deny: removing what Skilliton keeps in a prepared project": rm -rf .skilliton
  and rm -r docs denied; "protectRecords false: rm -rf docs" allowed.

## Limits

The literal clauses about other users' data have no counterpart here. If Skilliton ever gains accounts or a server
holding per-user data, this record no longer covers it.
