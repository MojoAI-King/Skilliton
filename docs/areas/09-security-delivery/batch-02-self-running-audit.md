# Self-running audit (M10, B20)

Kind: Living. Batch record. Area [09-security-delivery](AREA.md).

- **Type:** build
- **Goal:** A deterministic offline audit of changed files runs in a routine, a pre-push hook and the merge gate, and its findings become scoped observations.
- **Depends on:** 01-04 (the routine event)
- **Advances:** M10; B20
- **Estimated sessions:** 3

## Acceptance

- [x] the audit runs on changed files with a deterministic result, tested (evidence: runtime/lib/audit.mjs, six rules over three controls, pure over the files it is handed; node scripts/audit.test.mjs exit 0, which asserts each planted flaw at its exact line, that the same files in a different order give the same sorted findings, and that the matched text is never printed; node scripts/audit.test.mjs --self-test exit 0 proves each check can fail)
- [x] it runs in a routine, in a pre-push hook and in the merge gate, each with a fixture test (evidence: the Stop sentence in runtime/lib/session-hooks.mjs, covered in scripts/lifecycle.test.mjs with a mutation check that drops the sentence; runtime/lib/audit-install.mjs writing a marked .git/hooks/pre-push, with its refusals for core.hooksPath and a foreign hook in scripts/audit.test.mjs; the gate step in runtime/lib/delivery.mjs, proved in scripts/delivery.test.mjs by a push carrying a planted flaw rejected naming the finding, the same line accepted once it carries an allow marker, and the audit off under a signed policy)
- [x] findings land as scoped observations in the security register, tested (evidence: audit --record --apply writes one record per control, a gap with findings and an observation without, whose sources are a manifest of exactly the files the run read, so the register's own freshness rule stales it when one of them changes; scripts/audit.test.mjs covers it, including the refusal of --record with --range because the register re-reads the working tree; docs/CONTRACTS.md section 12)

## Notes

Six rules, not the four the plan sketched: the secrets rule split into `private-key-block`, `known-token-prefix` and `json-web-token`, which is how `lib/collectors.mjs` already names its high-confidence shapes, so the audit reuses them rather than writing a second copy.

The Stop sentence is covered in `scripts/lifecycle.test.mjs`, not `scripts/hook-fixture.test.sh` as the plan said: that file tests the SessionStart checklist hook, and `stopReason` is already tested in the lifecycle file, next to the wave 6 maintain sentence and with the same mutation check.

B20's other half, evals on planted flaws, moved to B17 with the wave 8 eval run. The deterministic planted-flaw fixtures ship here; whether a skill helps a model act on the findings is an eval question and is not claimed by this batch.

The pre-push hook reports and never rejects, on purpose: a hook that blocked a push would be skipped, and a skipped hook gates nothing. The merge gate is the one that refuses.
