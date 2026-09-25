# Compliance detection on two real repositories, 2026-09-25 (MojoComply's scanner, before the port)

Kind: Frozen. Evidence note for the compliance batch (task 2026-09-25-compliance-in-skilliton-frameworks-as-da-3e50, decision 2026-09-25-compliance-lives-in-public-skilliton-as-39ef). The riskiest assumption of the design is that a repository's own files carry enough signal to propose the right frameworks; this is its week-one test, run with MojoComply's own scanner before Skilliton's port exists, so that the port can be checked against the same result later (item N10 of the batch).

## How it was run

From the MojoComply checkout: `pnpm run --silent scope -- --repo <repository> --json`, read-only (no `--apply`), knowledge base 1.0.0 (approved). The scanner reads seven root files (.mojocomply.yaml, CLAUDE.md, COMPLIANCE.md, README.md, README.txt, SECURITY.md, package.json) and package.json one level down, matches 21 phrase signals with a negation window, and scores frameworks from them. Both runs exited 0 with nothing on stderr. The matched text is not reproduced here, because it can name a client; only the signal ids and the framework verdicts are.

## Repository A: a health-practice application (the owner's client work, handles patient and payment data)

Signals fired (with the number of hits, at most 3 each): business-associate-agreement-present (3), consumer-health-data (3), consumer-personal-information-at-scale (1), customer-security-assurance-demand (1), ephi-handling (3), payment-card-acceptance (3), payment-page-fully-outsourced (2).

| Framework proposed | Confidence | Timing | Library | From signals | Owner's verdict |
|---|---|---|---|---|---|
| HIPAA Security Rule | strong | now | approved | ephi-handling, business-associate-agreement-present | pending |
| HIPAA privacy and breach | strong | now | approved | ephi-handling, business-associate-agreement-present | pending |
| Health and wellness guidance tier | strong | now | approved | consumer-health-data, ephi-handling | pending |
| PCI DSS v4 | strong | now | approved (held back from Skilliton: licence) | payment-card-acceptance | pending |
| SOC 2 TSC | moderate | now | approved (held back from Skilliton: licence) | customer-security-assurance-demand | pending |
| State consumer privacy | moderate | now | not encoded | consumer-personal-information-at-scale | pending |
| ISO/IEC 27001 | weak | watch | not encoded | customer-security-assurance-demand | pending |
| 42 CFR Part 2 overlay | weak | watch | approved | ephi-handling | pending |

Not proposed: FTC Safeguards, legal safeguarding, NY DFS 500 (no signal pointed at them). Intake questions raised: 3 (the covered-entity, GLBA and NYDFS status questions the scanner cannot answer from files).

## Repository B: the owner's feedback-collection tool (no regulated data by design)

Signals fired: none. Frameworks proposed: none; all nine encoded libraries listed as not proposed for lack of any signal. Intake questions raised: 3 (the same three).

## Reading

- The scanner discriminates on this pair: seven signals and eight proposals on the repository that handles health and payment data, nothing on the one that does not. The strong proposals on repository A are the ones a person would expect from what the application does.
- The two "not encoded" proposals (state consumer privacy, ISO 27001) and the two weak watches are correctly marked as such by the scanner; the port keeps those states.
- What this does not show: whether a repository that handles regulated data but never names it in its root files is detected. That is the known limit of a phrase scan and the reason the intake questions exist; the port keeps them, and prepare asks them when the scan proposes nothing.
- The owner's verdict column is to be filled by the owner; until then this note supports the design's assumption but does not close it.

## Re-run with the port (2026-09-25, item N10)

From this checkout at commit 7757ac2 (workflow runtime 0.26.0, before the compliance-hooks lane merged): `node scripts/skilliton.mjs compliance scope --json --dir <repository>` on each repository, read-only (the command writes nothing, and `git status` in each repository shows no `.skilliton/compliance` entry afterwards). Knowledge base: the converted scope-kb.json, 1.0.0. Both runs exited 0 with nothing on stderr. The matched text is again not reproduced here.

- Repository A: the same seven signals with the same hit counts as the pre-port run (business-associate-agreement-present 3, consumer-health-data 3, consumer-personal-information-at-scale 1, customer-security-assurance-demand 1, ephi-handling 3, payment-card-acceptance 3, payment-page-fully-outsourced 2), and the same eight frameworks with the same confidence and timing. The port adds the library state and the recording gate: hipaa-security-rule, hipaa-privacy-breach and health-wellness are shipped and recordable (strong, now); pci-dss-v4 and soc2-tsc are proposed but not shipped (held back for their terms); state consumer privacy and ISO/IEC 27001 are not encoded; part2-overlay is shipped but a weak watch, so not recordable. Not pointed at: ftc-safeguards, legal-safeguarding, ny-dfs-500. Intake questions: 3.
- Repository B: no signal, no framework, all nine knowledge-base entries listed as not pointed at, the same three intake questions.
- Reading: the port reproduces MojoComply's result on both repositories, signal for signal and framework for framework. `generatedAt` in each proposal is the newest scanned file's modification time (2026-09-24 for A, 2026-09-22 for B), not the clock, as designed.

## Not run

The control sheet on either repository. It needs a scope confirmed by a named person and written into the repository (`compliance scope --apply --decided-by`) and a security register with records to project, and neither repository gets a write from this batch. The sheet's projection is proved on a synthetic project by `scripts/compliance-sheet.test.mjs`. Running it on repository A, with a named decision, is the owner's call, as is the verdict column above.
