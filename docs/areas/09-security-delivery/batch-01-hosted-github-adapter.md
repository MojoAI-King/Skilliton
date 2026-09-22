# Hosted GitHub adapter (B4)

Kind: Living. Batch record. Area [09-security-delivery](AREA.md).

- **Type:** owner
- **Goal:** Branch protection on a real repository, and a defective combined change blocked.
- **Depends on:** owner approval for a throwaway hosted repository
- **Advances:** M4; B4
- **Estimated sessions:** 1

## Acceptance

- [x] the delivery policy and the combined-result gate are tested offline (evidence: node scripts/delivery.test.mjs, PASS in the suite run of 2026-09-18)
- [x] branch protection configured on a throwaway hosted repository by the adapter, filed (evidence: evidence/live/2026-09-21-hosted-delivery-gate.md; ruleset 23799931 on a throwaway public repository per docs/DELIVERY.md section 4, configured with gh api since no command does it, and a direct push refused with the check named)
- [x] a defective combined change is blocked by the hosted gate, filed (evidence: the same file; the workflow template ran unchanged on the pull request's merge commit, the check failed on the defective change, the pull request read BLOCKED and did not merge)

## Notes

Run for real on 2026-09-21 on a throwaway public repository under the owner's account, deleted afterwards. Item 2's wording says "by the adapter": the adapter is the workflow file, and the protection itself was set by hand to section 4's settings, which is what the evidence file records. A clean change merging, the merge queue and the policy-path branch were not run.

Waits for the owner pass at the end (docs/REPORT_CARD.md).
