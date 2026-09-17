# Security catalog sources

Kind: Reference. The framework sources behind `packs/base/plugins/workflow/catalogs/skillgate-baseline-2.json`, how each reference was verified, and the terms they come with. Checked 2026-09-16.

The catalog relates Skilliton's own practice summaries to published requirements. Every mapping is `related`: a pointer for review, not a claim of equivalence, coverage or compliance. Control titles and expected evidence are original wording; no requirement text from either framework is copied into the catalog.

## Sources

| Framework | Version used | Primary source | Status on 2026-09-16 | Terms |
|---|---|---|---|---|
| NIST SP 800-218, Secure Software Development Framework (SSDF) | 1.1 (final, February 2022) | https://csrc.nist.gov/pubs/sp/800/218/final ; PDF https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-218.pdf ; DOI https://doi.org/10.6028/NIST.SP.800-218 | The publication page shows it as final (document history: draft 09/30/21, final 02/03/22) with no withdrawal or superseding version. SP 800-218 Rev. 1 (SSDF 1.2) is an initial public draft dated December 17, 2025, whose comment period closed January 30, 2026 (https://csrc.nist.gov/pubs/sp/800/218/r1/ipd); it is not used. | The publication states that it is not subject to copyright in the United States and that NIST appreciates attribution. |
| OWASP Application Security Verification Standard (ASVS) | 5.0.0 (release tag `v5.0.0_release`, published 2025-05-30, tag commit `5cf9b032440be53ce345ab3c130fda46ba1ce7a2`) | https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release | Still the newest numbered release. The repository's release list also has a moving "Bleeding Edge" release under the tag `latest` (updated 2026-09-03); it is unversioned and is not used. | Creative Commons Attribution-ShareAlike 4.0 International (https://creativecommons.org/licenses/by-sa/4.0/), stated in the document's Copyright and License section and in `LICENSE.md` at the tag. Copyright 2008-2025 The OWASP Foundation. |

Attribution: requirement identifiers in the catalog refer to OWASP ASVS 5.0.0 by the OWASP Foundation, licensed CC BY-SA 4.0, and to NIST SP 800-218 (SSDF) version 1.1. Whether identifiers and original summaries amount to an adaptation under CC BY-SA 4.0 is not decided here; the attribution and license link are kept either way. ISO/IEC 27001 and 27002 text is restricted and is not used (see docs/history/autopilot-foundation/PLAN.md).

### Files read for verification

| File | SHA-256 |
|---|---|
| NIST.SP.800-218.pdf (from the PDF link above) | `617746e553a9e2da49bfbd4eef0dfc3094758a39b869314e4173ac36605cde22` |
| OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json (release asset) | `8201b20eec2908c3380ac600c91c8ba746346fbb808859366abb232027532311` |
| OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf (release asset) | `f3e9a2f1098bc4af594578acb404121af69e3964aa4d90abd4b00607218d30c6` |

## Identifier forms

- **SSDF:** task identifiers as the publication prints them in its practice table, `<group>.<practice>.<task>`, for example `PO.4.1`. Tasks the table marks as moved to another task (PW.3.1, PW.3.2, PW.4.3, PW.4.5 and PW.5.2) are not used.
- **ASVS:** the release's own recommended form for documents and tools, `v<version>-<chapter>.<section>.<requirement>` with a lowercase `v`, for example `v5.0.0-1.2.5`, from its section "How to Reference ASVS Requirements". The release data files write the same requirement as `V1.2.5`.

## How each reference was verified

1. Downloaded the three files above and extracted the PDFs' text.
2. For every mapping in the catalog, checked mechanically that the SSDF identifier begins a task line in the SP 800-218 practice table and is not a moved task, and that the ASVS identifier exists as a requirement in the release's flat JSON asset and as a requirement row in the release PDF. All 36 mapping references (12 SSDF, 24 ASVS) passed; the seven starter controls were compared byte for byte with `skillgate-starter-1.json`.
3. Read each referenced task or requirement in full, to confirm it relates to the control's own summary.

To repeat the check, download the same files, confirm their SHA-256 values, and look up each identifier from the table below in them. `scripts/security-evidence.test.mjs` checks, offline, that every catalog reference uses these framework versions, identifier forms and URLs and is listed in this document; it cannot check the references against the sources, which are not stored in this repository.

## Controls and their references

The first seven controls are `skillgate-starter-1`'s, unchanged in id, title, mappings and expected evidence. The last eight are new in `skillgate-baseline-2`.

| Control | Summary (Skilliton's words) | NIST SSDF 1.1 | OWASP ASVS 5.0.0 (section, level) |
|---|---|---|---|
| SG-CHECK-CRITERIA | Define the security checks a change needs | `PO.4.1` | |
| SG-CHECK-EVIDENCE | Retain evidence for security decisions | `PO.4.2` | |
| SG-SECURITY-TESTS | Test security behavior and record findings | `PW.8.2` | |
| SG-ROOT-CAUSE | Explain the mechanism behind a discovered vulnerability | `RV.3.1` | |
| SG-RECURRING-PATTERNS | Look for recurring causes across findings | `RV.3.2` | |
| SG-WORKFLOW-IMPROVEMENT | Turn supported lessons into tested workflow improvements | `RV.3.4` | |
| SG-COMMAND-INJECTION | Assess operating-system command construction | | `v5.0.0-1.2.5` (Injection Prevention, L1) |
| SG-SECRETS-IN-SOURCE | Keep secret values out of source control | | `v5.0.0-13.3.1` (Secret Management, L2) |
| SG-DEPENDENCY-RISK | Keep third-party components inventoried, current, and checked for known vulnerabilities | `PW.4.1`, `PW.4.4`, `RV.1.1` | `v5.0.0-15.1.1` (Secure Coding and Architecture Documentation, L1), `v5.0.0-15.1.2` (same section, L2), `v5.0.0-15.2.1` (Security Architecture and Dependencies, L1) |
| SG-AUTHENTICATION | Protect how people and services sign in | | `v5.0.0-6.1.1` (Authentication Documentation, L1), `v5.0.0-6.3.1` (General Authentication Security, L1), `v5.0.0-6.3.2` (same section, L1), `v5.0.0-6.3.4` (same section, L2) |
| SG-SESSION-HANDLING | Issue, check and end sessions safely | | `v5.0.0-7.2.1` (Fundamental Session Management Security, L1), `v5.0.0-7.2.4` (same section, L1), `v5.0.0-7.4.1` (Session Termination, L1) |
| SG-ACCESS-CONTROL | Check permissions for every function and data item on the server | | `v5.0.0-8.1.1` (Authorization Documentation, L1), `v5.0.0-8.2.1` (General Authorization Design, L1), `v5.0.0-8.2.2` (same section, L1), `v5.0.0-8.3.1` (Operation Level Authorization, L1) |
| SG-INPUT-INJECTION | Validate input and keep untrusted data out of queries and interpreters | `PW.5.1` | `v5.0.0-2.2.1` (Input Validation, L1), `v5.0.0-2.2.2` (same section, L1), `v5.0.0-1.2.1` (Injection Prevention, L1), `v5.0.0-1.2.4` (same section, L1) |
| SG-SECURITY-LOGGING | Log security events well enough to investigate them | | `v5.0.0-16.1.1` (Security Logging Documentation, L2), `v5.0.0-16.2.5` (General Logging, L2), `v5.0.0-16.3.1` (Security Events, L2), `v5.0.0-16.3.2` (same section, L2) |
| SG-POLICY-CHANGE-REVIEW | Review changes to delivery and validation policy on their own | `PO.3.2`, `PS.1.1` | |

### Why each new control points where it does

- **SG-SECRETS-IN-SOURCE:** the ASVS secret-management requirement asks for a managed secret store and excludes secrets from source code and build artifacts. The `security collect secrets` collector gathers evidence for the second half only.
- **SG-DEPENDENCY-RISK:** the SSDF tasks cover acquiring and maintaining well-secured third-party components, verifying them over their life cycle, and gathering vulnerability information about them; the ASVS requirements cover documented remediation time frames, a component inventory, and staying within those time frames. The control carries `maxAgeDays: 30`, because new vulnerability reports make an unchanged dependency observation out of date. A control's own maxAgeDays takes precedence over a project's `security.maxAgeDays`, so this 30-day default is a proposal for company review before release.
- **SG-AUTHENTICATION:** documented and implemented defenses against credential stuffing and brute force, no default accounts, and no undocumented sign-in paths.
- **SG-SESSION-HANDLING:** server-side token verification, a new session token on authentication, and ending a session completely.
- **SG-ACCESS-CONTROL:** documented access rules, function-level and data-level checks, and enforcement at a trusted service layer.
- **SG-INPUT-INJECTION:** server-side input validation against expected values, output encoding for HTTP and HTML contexts, and parameterized database queries; the SSDF secure coding task lists input validation and output encoding among its examples. OS command construction stays with SG-COMMAND-INJECTION.
- **SG-SECURITY-LOGGING:** a logging inventory, handling of sensitive data in logs, and logging of authentication and failed authorization events.
- **SG-POLICY-CHANGE-REVIEW:** the SSDF tasks cover operating toolchains securely (including configuration kept as code) and protecting all forms of code, including configuration-as-code, with owner review of changes by others. docs/CONTRACTS.md section 7 requires separate review for changes to validation policy; `.skillgate/delivery.json` lists the policy paths.

## Limits

- The catalog is partial: it does not cover every SSDF task or ASVS requirement, and a current observation for every control is not a compliance result.
- Applicability is a project decision (`skillgate security applicability`); nothing here decides it.
- The OWASP Web Security Testing Guide and NIST SP 800-115 remain references for assessment planning only; no catalog control maps to them yet.
