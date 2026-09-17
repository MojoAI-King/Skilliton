# A merge could bring back an earlier delivery policy because each commit was compared only with its first parent

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-a-merge-could-bring-back-an-earlier-deli-8d09
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

An independent security-first review of the rename commit reproduced it with real pushes: an approver signs a policy without checks (S0), then signs a stronger policy (S1). Someone with no key commits on top of S0, runs `git merge -s ours S1`, and pushes the merge. The gate accepted it, and the next push of broken code passed because the policy in force was the weak one again. With the rename's fallback, the merge could also drop `.skilliton/delivery.json` so that an earlier `.skillgate/delivery.json` governed.

## The mechanism

`evaluateUpdate` in `runtime/lib/delivery.mjs` required a signature on every commit that changed a policy path compared with its first parent. The attacker's side commit changes nothing, and the `ours` merge keeps its first parent's files, so no commit "changes" the policy, yet the pushed tip holds an older policy than the current tip. The weakness predates the rename; the fallback made every migrated repository hold an older approved policy in its history.

## The fix

After the per-commit check, `evaluateUpdate` compares the current tip with the pushed tip: every guarded path that differs must hold exactly the blob an approver-signed commit in the push gave it (`blobAt` in the same file).

## The rule

A check on a range of commits must also check the combined result it accepts; per-commit rules over first parents do not see what a merge brings in.

## What now enforces it

`scripts/delivery.test.mjs` ("a merge cannot bring back an earlier policy without an approver") pushes the attack for the current and the earlier policy path; with the combined-result check removed, the test fails (checked by mutation on 2026-09-17).
