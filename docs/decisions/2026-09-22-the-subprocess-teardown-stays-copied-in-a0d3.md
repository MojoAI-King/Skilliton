# The subprocess teardown stays copied in the gate and the delivery gate

Kind: Living. Decision entry.

- **ID:** 2026-09-22-the-subprocess-teardown-stays-copied-in-a0d3
- **Status:** accepted
- **Date:** 2026-09-22

## Decision

The seven lines that end a checked subprocess stay in both `runtime/lib/delivery.mjs` and `runtime/lib/gate.mjs`, allowed by name in `ALLOWED_DUPLICATE` in `scripts/deadcode.mjs`. Closes B40.

## Why

The lines read and write the caller's own locals (`settled`, `timer`, `grace`, `child`, `partial`, `began`). A shared helper would take seven arguments to save seven lines, and it would leave both supervisors depending on a function whose job is to change their state. The fix that would earn its keep is one shared subprocess supervisor for both callers, and that rewrites the two most security-relevant runners in the product one day before a release, for no change in behavior.

## Alternatives rejected

A shared teardown function (more coupling than the copy). One shared supervisor now (the right shape, the wrong day).

## Risk

A fix to one copy is missed in the other. `scripts/gate.test.mjs` and `scripts/delivery.test.mjs` each exercise their side's timeout and teardown, and the dead-code check names the pair every run.

## Reversibility

Easy: a shared supervisor can replace both at any release.

## Evidence

`scripts/deadcode.mjs` ALLOWED_DUPLICATE row naming B40; `scripts/gate.test.mjs`; `scripts/delivery.test.mjs`.
