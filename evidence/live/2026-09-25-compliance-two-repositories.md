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

## Not run

The ported scanner and the control sheet (batch item N10, after the compliance-runtime and frameworks-data lanes merge). Nothing was written into either repository.
