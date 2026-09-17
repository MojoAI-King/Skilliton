# Renaming the policy path would have locked every protected branch under both the old and the new gate

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-renaming-the-policy-path-would-have-lock-76ff
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

Nothing shipped broken; it was found while tracing what the rename does to a shared repository. After the rename the gate read only `.skilliton/delivery.json`, so a protected branch whose policy was still at `.skillgate/delivery.json` would reject every push as having no policy. Under the earlier gate the project's migration commit would also be rejected, because it removes the earlier policy file. Neither order of upgrading would have let the migration reach the branch without an administrator overriding the server.

## The mechanism

The gate treats "no policy on the protected tip" and "the push removes the policy" as reasons to reject, which is right for a single fixed path. Renaming the path turns a routine move into both conditions at once, depending on which runtime evaluates it.

## The fix

`readPolicyAt` in `runtime/lib/delivery.mjs` falls back to the earlier file in its earlier format when the current one is absent, and `evaluateUpdate` guards both policy files in every push, so the move needs an approver's signature and a weaker policy cannot be added under the other name.

## The rule

Before renaming a path that an enforcement point reads, walk through both runtimes evaluating the migration commit; the enforcement has to accept the move under one of them without an unprotected window, and the move itself must stay a governed change.

## What now enforces it

`scripts/delivery.test.mjs` ("a branch whose policy is still at the earlier .skillgate/delivery.json stays protected") with real pushes: the earlier policy's check runs, an unsigned policy under the new name is rejected, the unsigned move is rejected, the signed move is accepted, and the moved policy then governs.
