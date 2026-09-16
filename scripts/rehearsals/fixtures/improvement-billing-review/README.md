# Rehearsal fixture: one company-approved skill improvement

Kind: Reference. Used only by `scripts/rehearsals/company-release.mjs`, inside a disposable clone of this repository standing in for a company fork. It is not part of the shipped base pack.

The lesson it answers: a change to billing code merged without the payments lead's review. The improvement is a company review rule, applied as exact anchored replacements: `review-rule.json` in the review skill and `template-rule.json` in the instruction template, so projects receive it through a migration. The behavior test is the eval case `evals/review-billing-owner/`: the review must name the payments lead. Run against the skill before the change it is expected to fail, because nothing tells the model about that company rule; after the change it is expected to pass.

An earlier fixture (a STOP verdict for a removed delivery check) was dropped after its behavior eval passed before the improvement as well as after: the existing rule for switched-off tests already covers it. That measurement is kept in `evidence/rehearsals/2026-09-16-company-release-attempt-1/`.
