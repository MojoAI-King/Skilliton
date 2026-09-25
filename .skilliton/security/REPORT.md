<!-- skilliton-security-evidence-report:v1 -->

# Security evidence status

Current recorded observations: 7/13 applicable controls.
Invalid evidence records: 0.
Historical records outside the current catalog: 0.
Catalog: skillgate-baseline-2, 15 controls; not applicable: 2; undecided applicability: 0.
Missing: 0. Stale: 0. Expired: 0. Invalid: 0. Gaps: 5. Needs a human: 1.

Assessment and freshness are separate. Observed means a recorded claim, not a control pass.
Exit 0 means only that every applicable control has a current recorded observation and an applicability decision. It does not establish compliance, certification, or passing security checks.
File hashes detect drift from a recorded claim. This tool does not run checks or authenticate reviewers.
Mappings marked related are pointers for review, not claims of equivalence or complete framework coverage.

| Control | Title | Applies | Assessment | Freshness |
| --- | --- | --- | --- | --- |
| SG-CHECK-CRITERIA | Define the security checks a change needs | yes | observed | current |
| SG-CHECK-EVIDENCE | Retain evidence for security decisions | yes | observed | current |
| SG-SECURITY-TESTS | Test security behavior and record findings | yes | observed | current |
| SG-ROOT-CAUSE | Explain the mechanism behind a discovered vulnerability | yes | observed | current |
| SG-RECURRING-PATTERNS | Look for recurring causes across findings | yes | gap | current |
| SG-WORKFLOW-IMPROVEMENT | Turn supported lessons into tested workflow improvements | yes | observed | current |
| SG-COMMAND-INJECTION | Assess operating-system command construction | yes | observed | current |
| SG-SECRETS-IN-SOURCE | Keep secret values out of source control | yes | needs-human | current |
| SG-DEPENDENCY-RISK | Keep third-party components inventoried, current, and checked for known vulnerabilities | yes | gap | current |
| SG-AUTHENTICATION | Protect how people and services sign in | no | none | missing |
| SG-SESSION-HANDLING | Issue, check and end sessions safely | no | none | missing |
| SG-ACCESS-CONTROL | Check permissions for every function and data item on the server | yes | observed | current |
| SG-INPUT-INJECTION | Validate input and keep untrusted data out of queries and interpreters | yes | gap | current |
| SG-SECURITY-LOGGING | Log security events well enough to investigate them | yes | gap | current |
| SG-POLICY-CHANGE-REVIEW | Review changes to delivery and validation policy on their own | yes | gap | current |

## Not applicable

- SG-AUTHENTICATION: Skilliton has no sign-in of its own; it runs as the local user and git and gh do the signing (decided by owner, 2026-09-23)
- SG-SESSION-HANDLING: There is no server and no session token for Skilliton to issue or check (decided by owner, 2026-09-23)

Missing records and unresolved assessments need evidence or human review. Stale and expired records need a new observation after review; existing records are never restamped. Undecided controls need an applicability decision.
