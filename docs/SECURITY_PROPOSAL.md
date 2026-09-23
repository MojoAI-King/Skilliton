# Security register: proposed decisions for the owner

Kind: Living. Written 2026-09-22 by the build session for the owner. Accepted by the owner on 2026-09-22: the fifteen decisions were recorded that evening at 21:42 EDT (`.skilliton/security/applicability.json`, commit 017baac), 13 that apply and 2 that do not. What is left is the evidence column below: none of the 13 applicable controls has a recorded observation yet. Once those rows are recorded, this file moves to docs/archive/.

This repository's register lists 15 controls from the catalog `skillgate-baseline-2`. Each now has the owner's decision, so `skilliton security status` reads "not applicable: 2; undecided applicability: 0" and "Missing: 13". Below is the answer for each, as proposed and accepted without edits, with one sentence of reason and the evidence to record next. **The decisions are the owner's.** The commands below recorded them with `--decided-by owner` after the owner said "accept".

## The fifteen

| Control | Applies? | Reason | Evidence to record after acceptance |
|---|---|---|---|
| SG-CHECK-CRITERIA | yes | A change to the guardrails, the release trust or the delivery gate must name the checks it has to pass. | `security collect delivery-policy`, once the draft policy below is confirmed |
| SG-CHECK-EVIDENCE | yes | Every security decision here is kept as a fingerprinted record, and the releases carry their evidence files. | the release manifest `releases/1.0.0.json` and its evidence files |
| SG-SECURITY-TESTS | yes | The guardrails, the signature checks and the gate are security behavior, and each has a test suite. | `security collect tests` over scripts/guardrails.test.sh, the delivery and trust tests |
| SG-ROOT-CAUSE | yes | Every lesson entry states the mechanism behind what broke, not only the fix. | the lesson entries under docs/lessons/ |
| SG-RECURRING-PATTERNS | yes | `skilliton security findings` groups findings by cause into the backlog's findings block. | `security findings --apply` and the block it writes |
| SG-WORKFLOW-IMPROVEMENT | yes | A lesson is closed only by a test or a check that now enforces it. | a lesson entry and the check its "What now enforces it" names |
| SG-COMMAND-INJECTION | yes | The runtime and the hooks start git, node and shell commands from repository and hook input. | `skilliton audit --record` over the whole tree, after tonight's security review is fixed |
| SG-SECRETS-IN-SOURCE | yes | The repository is public and sits beside signing keys and client checkouts on the same machine. | `security collect secrets` over every tracked file |
| SG-DEPENDENCY-RISK | yes | There is no package.json and no third-party runtime package; Node 22 or later and git are the only components, and the two CI actions are pinned to commits. | a short inventory note and .github/workflows/checks.yml |
| SG-AUTHENTICATION | **no** | Skilliton has no sign-in of its own: it runs as the local user, and GitHub and SSH signing are done by git and gh. Release signatures are checked under SG-POLICY-CHANGE-REVIEW. | none |
| SG-SESSION-HANDLING | **no** | There is no server and no session token; a "session" here is the AI client's, which Skilliton does not issue or check. | none |
| SG-ACCESS-CONTROL | yes, for the delivery gate only | The gate on a shared bare repository decides who may change the policy, by the approvers' signatures; nothing else in Skilliton runs as a server. | the delivery tests that reject an unsigned policy change |
| SG-INPUT-INJECTION | yes | Hook input, configuration files, records and the release manifest are untrusted text that reaches parsers, paths and commands. | the guardrails and hook-input tests, and the audit record |
| SG-SECURITY-LOGGING | yes | A guardrail block, a hold and a gate rejection must leave a record someone can read afterwards. | lib/journal.mjs and a live note that quotes the journal events |
| SG-POLICY-CHANGE-REVIEW | yes | A change to `.skilliton/delivery.json` or the CI workflow must carry an approver's signature where the gate is installed. | `security collect delivery-policy --control SG-POLICY-CHANGE-REVIEW` and the delivery tests |

The one row the owner should read twice is SG-ACCESS-CONTROL. It could be argued either way: "no" if Skilliton is only a local tool, "yes" if the shared-repository gate counts. The proposal says yes, because the gate is a product feature a company would rely on.

## The delivery policy this repository lacks

This repository never had a `.skilliton/delivery.json`, so the collectors for SG-CHECK-CRITERIA, SG-SECURITY-TESTS and SG-POLICY-CHANGE-REVIEW had nothing to read. `.skilliton/delivery.draft.json` is now written: it protects `main`, runs `node scripts/checks.mjs` (the same list CI runs), and names the policy file and `.github/workflows/` as policy paths. No gate runs a draft. `skilliton delivery confirm --apply` makes it the policy, and that is part of what "accept" means. **It has not run yet:** `.skilliton/delivery.draft.json` is still a draft, there is no `.skilliton/delivery.json`, and `security status` names that as the reason the tests and delivery-policy collectors cannot run.

## What "accept" runs

The fifteen `a` lines below have run. The `delivery confirm` line has not (see the section above). The next session runs it, then records the evidence rows above and reports `security status`.

```bash
a() { node scripts/skilliton.mjs security applicability --decided-by owner --apply "$@"; }
a --control SG-CHECK-CRITERIA --applies true --rationale "A change to the guardrails, the release trust or the delivery gate must name the checks it has to pass"
a --control SG-CHECK-EVIDENCE --applies true --rationale "Security decisions are kept as fingerprinted records and releases carry their evidence files"
a --control SG-SECURITY-TESTS --applies true --rationale "The guardrails, the signature checks and the gate are security behavior with test suites"
a --control SG-ROOT-CAUSE --applies true --rationale "Every lesson entry states the mechanism behind what broke"
a --control SG-RECURRING-PATTERNS --applies true --rationale "security findings groups findings by cause into the backlog"
a --control SG-WORKFLOW-IMPROVEMENT --applies true --rationale "A lesson is closed only by a check that now enforces it"
a --control SG-COMMAND-INJECTION --applies true --rationale "The runtime and hooks start commands from repository and hook input"
a --control SG-SECRETS-IN-SOURCE --applies true --rationale "The repository is public and sits beside signing keys and client checkouts"
a --control SG-DEPENDENCY-RISK --applies true --rationale "No third-party runtime package; Node, git and two pinned CI actions are the components"
a --control SG-AUTHENTICATION --applies false --rationale "Skilliton has no sign-in of its own; it runs as the local user and git and gh do the signing"
a --control SG-SESSION-HANDLING --applies false --rationale "There is no server and no session token for Skilliton to issue or check"
a --control SG-ACCESS-CONTROL --applies true --rationale "The shared-repository gate decides who may change the policy, by signature"
a --control SG-INPUT-INJECTION --applies true --rationale "Hook input, configuration, records and manifests are untrusted text reaching parsers, paths and commands"
a --control SG-SECURITY-LOGGING --applies true --rationale "Guardrail blocks, holds and gate rejections must leave a readable record"
a --control SG-POLICY-CHANGE-REVIEW --applies true --rationale "Policy and CI changes need an approver's signature where the gate is installed"
node scripts/skilliton.mjs delivery confirm --apply
node scripts/skilliton.mjs security status
```
