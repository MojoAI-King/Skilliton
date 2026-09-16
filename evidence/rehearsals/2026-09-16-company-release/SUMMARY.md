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
| I1 the improvement: review skill rule, template sentence, eval case, version bump, offline checks | PASS | workflow 0.3.0 to 0.3.1; offline checks packs.test.mjs:0 skillgate.test.mjs:0; eval grader names-payments-lead passed before false (expected false), after true (expected true) |
| I2 release 1.1.0 created with its evidence and signed | PASS | sign exit 0; list: approved    1.1.0       signed by approver@example.invalid (ED25519 SHA256:ixLncA4haCbYq0/nQvTGKhu0Xe3Ct1Ju18LDlumf03g); manifest-sha256 6a68587995ff; commit ffbf0c69a618; approved    1.0.0       signed by approver@example.invalid (ED25519 SHA256:ixLncA4haCbYq0/nQvTGKhu0Xe3Ct1Ju18LDlumf03g); manifest-sha256 af8bd5a13ce7; commit cef49d56c2ee |
| U1 the Claude Code environment receives the improved skill and verifies it | PASS | marketplace update 0; plugin update 0; installed 0.3.1; improved rule present: true; verify exit 0 (all 3 company plugin install(s) on this client are VERIFIED against approved releases.) |
| U2 the Codex environment receives the improved skill and verifies it | PASS | marketplace upgrade exit 1 (expected for a local-path marketplace, which Codex reads directly); plugin add 0; installed versions 0.3.1; improved rule present in 0.3.1: true; verify exit 0 (all 3 company plugin install(s) on this client are VERIFIED against approved releases.) |
| M1 the project applies the release's migration, rolls it back, and applies it again, keeping human text | PASS | preview exit 1 (1 = migration pending); apply 0; receipts 1; block refreshed with human text kept: true; rollback 0 restored: true; reapply 0 |
| T1 a tampered install is reported TAMPERED with the file named, and a reinstall restores VERIFIED | PASS | verify exit 1 naming guard-bash.sh: true; reinstall 0/0; verify again 0 |
| A1 an unauthorized release (unsigned bump with a changed hook, plus a tag signed by an untrusted key) reaches the environment and is not VERIFIED | PASS | untrusted tag created: true; environment received 0.3.2; verify exit 2, UNKNOWN VERSION reported: true; 9.9.9 never listed approved |
| R1 rollback: the company removes the bad tag and reverts; the environment downgrades and verifies | PASS | revert 0; plugin update 0; installed 0.3.1; verify exit 0 |
| W1 withdrawal: a signed withdrawal makes the installed release WITHDRAWN | PASS | withdraw exit 0; verify exit 1; WITHDRAWN reported: true |
| S1 a skill folder holding a secret-shaped value is refused at import | PASS | import exit 2; the value was not printed |
| D1 removal: plugins uninstalled, managed content removed, records and history kept | PASS | uninstalls 0 0 0; remove exit 0; block removed true; human text kept true; records kept true; commits 4 before and 4 after; verify exit 1 (nothing installed) |

## Notes

- eval before the improvement: exit 1; names-payments-lead passed: false; list-price cost estimate 0.22077600000000003 USD
- eval after the improvement: exit 0; names-payments-lead passed: true; list-price cost estimate 0.2154005 USD
- eval evidence summary written by scripts/evidence.mjs: exit 0
- unauthorized release: the environment updated to 0.3.2 (plugin update exit 0); verify exit 2; release list exit 2 with the untrusted tag
- Security-review cases (PLAN.md section 8): ref drift and an unauthorized release reaching an environment (A1); exact approved content versus tampering (T1); withdrawn but installed code (W1); private material in a skill import (S1). Escaping manifest paths are covered by scripts/release.test.mjs; local guardrail bypass limits by scripts/guardrails.test.sh and the guardrails skill.
- What this does not show: a malicious hook that an approver reviewed and signed would verify. Release verification proves the installed bytes are what was approved, not that what was approved is safe; review of executable files (hooks, bin, runtime) is the control for that.

Result: 18 of 18 steps passed.
