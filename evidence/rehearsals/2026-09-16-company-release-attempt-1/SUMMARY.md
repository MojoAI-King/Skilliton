# Company release rehearsal (M3)

Kind: Reference. Recorded 2026-09-16 by `scripts/rehearsals/company-release.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Claude Code:** 2.1.273 (Claude Code)
- **Codex:** codex-cli 0.154.0-alpha.6.2
- **Behavior eval:** run
- **Node:** v25.8.1

| Step | Result | Evidence |
|---|---|---|
| F1 company fork with an approver key and a trusted signers file | PASS | fork at ef4c522; trust add exit 0 |
| F2 release 1.0.0 created, committed and signed; listed as approved | PASS | sign exit 0; list exit 0; 1.0.0 approved |
| C1 clean Claude Code configuration installs the company plugins and verifies them | PASS | marketplace add exit 0; installs workflow:0 guardrails:0 context-hygiene:0; verify exit 0 (all 3 company plugin install(s) on this client are VERIFIED against approved releases.) |
| X1 clean Codex home installs the company plugins and verifies them | PASS | marketplace add exit 0; installs workflow:0 guardrails:0 context-hygiene:0; verify exit 0 (all 3 company plugin install(s) on this client are VERIFIED against approved releases.) |
| P1 a new application is prepared with the installed plugin's own runtime | PASS | prepare exit 0; check exit 0; human text kept: true |
| P2 moving the company fork does not break the prepared project or verification | PASS | installed runtime status exit 1 (0 or 1 is a completed evaluation); verify exit 0 |
| L1 a lesson recorded in the project is proposed to the company fork, scrubbed | PASS | record exit 0; propose exit 0; proposals: 1 |
| I1 the improvement: review skill rule, template sentence, eval case, version bump, offline checks | FAIL | workflow 0.3.0 to 0.3.1; offline checks packs.test.mjs:0 skillgate.test.mjs:0; eval STOP grader before true, after true |
| I2 release 1.1.0 created with its evidence and signed | NOT RUN | an earlier required step failed (I1) |
| U1 the Claude Code environment receives the improved skill and verifies it | NOT RUN | an earlier required step failed (I1) |
| U2 the Codex environment receives the improved skill and verifies it | NOT RUN | an earlier required step failed (I1) |
| M1 the project applies the release's migration, rolls it back, and applies it again, keeping human text | NOT RUN | an earlier required step failed (I1) |
| T1 a tampered install is reported TAMPERED with the file named, and a reinstall restores VERIFIED | NOT RUN | an earlier required step failed (I1) |
| A1 an unauthorized release (unsigned bump with a changed hook, plus a tag signed by an untrusted key) reaches the environment and is not VERIFIED | NOT RUN | an earlier required step failed (I1) |
| R1 rollback: the company removes the bad tag and reverts; the environment downgrades and verifies | NOT RUN | an earlier required step failed (I1) |
| W1 withdrawal: a signed withdrawal makes the installed release WITHDRAWN | NOT RUN | an earlier required step failed (I1) |
| S1 a skill folder holding a secret-shaped value is refused at import | NOT RUN | an earlier required step failed (I1) |
| D1 removal: plugins uninstalled, managed content removed, records and history kept | NOT RUN | an earlier required step failed (I1) |

## Notes

- eval before the improvement: exit 0; STOP grader passed: true
- eval after the improvement: exit 0; STOP grader passed: true
- eval evidence summary: exit 0
- Security-review cases (PLAN.md section 8): ref drift and an unauthorized release reaching an environment (A1); exact approved content versus tampering (T1); withdrawn but installed code (W1); private material in a skill import (S1). Escaping manifest paths are covered by scripts/release.test.mjs; local guardrail bypass limits by scripts/guardrails.test.sh and the guardrails skill.
- What this does not show: a malicious hook that an approver reviewed and signed would verify. Release verification proves the installed bytes are what was approved, not that what was approved is safe; review of executable files (hooks, bin, runtime) is the control for that.

Result: 7 of 18 steps passed; the rest are listed above with why.
