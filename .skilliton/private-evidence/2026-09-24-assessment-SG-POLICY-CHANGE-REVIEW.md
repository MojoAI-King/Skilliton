# Assessment note: SG-POLICY-CHANGE-REVIEW

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Review changes to delivery and validation policy on their own. Expected: the list of policy paths (delivery
checks, CI workflows, code owners) and the rule that requires their separate review, and review or signature records
for recent changes to those paths by someone other than their author. Assessment recorded: gap.

## What exists

- The list: .skilliton/delivery.json policyPaths (.skilliton/delivery.json, .github/workflows/, .github/CODEOWNERS,
  CODEOWNERS) and protectedPaths (scripts/, .github/workflows/); runtime/lib/delivery-policy.mjs policyProblems
  requires the policy paths to cover the policy file itself, and runtime/lib/delivery-protect.mjs holds the default
  protected folders.
- The rule: runtime/lib/delivery.mjs holds a change to any policy path to an approver's signature.
- Tests: scripts/delivery.test.mjs "policy changes: unsigned is rejected; the current policy still runs its check; a
  non-approver signature is rejected; an approver signature is accepted"; scripts/delivery-protect.test.mjs "a policy
  with an explicit protectedPaths is honoured"; scripts/delivery-integrity.test.mjs "N23: a check that appends to the
  pre-receive hook, or adds a key to the approvers file, gets the push rejected".
- Recent policy commits (9063a34, the policy confirmed; 6741fe0, protected paths set) carry good signatures.

## What is missing

- The rule requires an approver's signature, not a second person: nothing requires the signer to differ from the
  author, and in this repository they are the same person (one author identity, one signing key, checked on
  2026-09-24 without printing either).
- No record of a review by someone other than the author exists for any policy change, and no CODEOWNERS file exists.
