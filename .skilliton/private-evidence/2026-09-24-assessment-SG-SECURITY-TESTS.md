# Assessment note: SG-SECURITY-TESTS

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Test security behavior and record findings. Expected: results for authorized scoped tests, including denied
and legitimate behavior. Assessment recorded: observed.

## Results, run 2026-09-24 in this lane's worktree, every suite exit 0

| Suite | Result | Denied and legitimate cases |
| --- | --- | --- |
| scripts/guardrails.test.sh | PASS, 670 checks | 325 deny, 52 ask, 200 allow |
| scripts/guardrails-bypass.test.sh (runs guardrails-review and guardrails-review2) | PASS, 224 + 131 + 144 checks | 155 deny, 142 ask, 129 allow |
| scripts/guardrails-timing.test.sh | PASS, 16 checks | 1 deny, 4 ask, 3 allow |
| scripts/delivery.test.mjs | 15 tests, 0 failed | unsigned and non-approver policy changes rejected, approver accepted |
| scripts/delivery-protect.test.mjs | 8 tests, 0 failed | a rewritten check rejected, the same change signed by an approver accepted |
| scripts/delivery-integrity.test.mjs | 5 tests, 0 failed | pushes that switch the gate off or rewrite it rejected |
| scripts/release-refusals.test.mjs | 2 tests, 0 failed | a tag approving another version's manifest refused, the real release approved |
| scripts/read-guard.test.mjs | 20 tests, 0 failed | exactly the limit allowed, one byte over refused |

Examples of each side: guardrails.test.sh denies "git push --force origin main" and allows "git push origin feature";
guardrails-review2.test.sh records every case with the decision at 63b0119 beside the decision now, including the
negative "sed -n 1,5p docs/STATUS.md (no -i)"; read-guard.test.mjs "the boundary: exactly the limit is allowed, one
byte over is refused".

## Scope and limits

- The same suites run on every push in .github/workflows/checks.yml (steps "Guardrails hook", "Guardrails hook, the
  ways past it found in review", "Guardrails hook, the time limits", "Trusted delivery gate", "The delivery gate cannot
  be switched off or rewritten by what a push carries", "The delivery gate protects the program that runs its checks",
  "A signed tag for another version's manifest, or under another name, approves nothing", "Read guard hook").
- Findings from the reviews that drove these suites are recorded in SECURITY.md and docs/THREAT_MODEL.md.
- There is no dedicated red-team suite; the two red-team passes of 2026-09-23 are recorded in
  evidence/live/2026-09-23-release-1.3.0.md and their cases live in the suites above.
- Before this note, no run's results were committed; the counts here are this one run.
