# Rehearsal fixture: one company-approved skill improvement

Kind: Reference. Used only by `scripts/rehearsals/company-release.mjs`, which applies it inside a disposable clone of this repository standing in for a company fork. It is not part of the shipped base pack.

The lesson it answers: a change that removed a check from `.skillgate/delivery.json` was reviewed as NEEDS ATTENTION, and a hurried reviewer merged it. The improvement (`review-stop-rule.json`, an exact find-and-replace in the review skill): removing or loosening a validation check is STOP unless the user states an approved reason. The behavior test is the eval case under `evals/review-policy-weakening/`: run against the skill before the change it is expected to fail its STOP grader, and after the change to pass.
