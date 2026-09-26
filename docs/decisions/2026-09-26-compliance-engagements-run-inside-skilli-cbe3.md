# Compliance engagements run inside Skilliton, for any framework, and still never certify

Kind: Living. Decision entry.

- **ID:** 2026-09-26-compliance-engagements-run-inside-skilli-cbe3
- **Status:** accepted
- **Date:** 2026-09-26

## Decision

Skilliton runs a compliance engagement end to end. A person says what they need ("I need to do a SOC 2 audit"); Skilliton records the engagement (framework, product, who asked, when), confirms the scope with that named person, evaluates every control of the framework against the code and the evidence it keeps, collects what a person must supply (screenshots of admin consoles, attestations) with that person's help, and assembles an auditor packet: an index, a sheet per control, and the evidence behind each. MojoComply is not folded in whole: its functions are extracted into Skilliton (already moved: the framework libraries, scope detection, the control sheet; still to move: the SOC 2 and PCI DSS libraries, evidence collection and the packet). Any framework is in scope, each as a library plus a crosswalk to NIST CSF 2.0: HIPAA and the others already converted, SOC 2 and PCI DSS next, then HITRUST, ISO 27001, NIST SP 800-53 and others as they are needed.

This supersedes the scope in decision 2026-09-25-compliance-lives-in-public-skilliton-as-39ef that declined evidence gathered from outside the repository and an assessor's workflow, and decision 2026-09-25-the-soc-2-and-pci-dss-libraries-stay-out-8c57 for a private repository: licensed text may live in private Skilliton under each framework's own terms. It keeps, unchanged, the first law of both: Skilliton assesses and prepares, it never says a company is compliant, certified or passing, and it never stores regulated data. A packet reads "41 of 61 controls evidenced, 12 need a person, 8 not started", never "compliant"; only the auditor's opinion says that.

## Why

The owner, 2026-09-26: "the functions behind MojoComply need to be extracted and then applied here so that you have the compliance work that is built into the Skilliton harness ... 'Hey, I need to do a SOC 2 audit.' And then it will save it to the memory and then it will start SOC 2, running all the SOC 2 controls and evaluating the code ... pulling screenshots, getting the things ready so an auditor can come in", and "it's more than just those frameworks: HIPAA or HITRUST or any of the other types of frameworks". The spine design already takes any framework as data: a library and its crosswalk, nothing else.

## Alternatives rejected

- Keep SOC 2 and PCI DSS in MojoComply and hand off to it: the spoken request would end in a second tool.
- Say "compliant" when every control is evidenced: an auditor, not a tool, gives that opinion, and a tool that tells a client it is compliant before an audit fails is a liability to the company that ran it.

## Risk

- Terms, framework by framework. Private repository is not the same as permitted use: the PCI SSC terms read on 2026-09-25 allow the Council's content for "personal, non-commercial, review, study and informational purposes" only, so using a PCI paraphrase in paid client work is a question for the company's lawyer, the same one MojoComply already carries. HITRUST CSF and ISO 27001 are licensed by their publishers; each needs its licence before its library is written. NIST SP 800-53 and HIPAA are public.
- Screenshot collection is unbuilt and unmeasured: it needs a person to sign in to each service once, and a browser the harness drives; it is prototyped before it is described.
- Coverage starts low: the 15 baseline controls evidence a slice of CSF, so most controls read not_started with "needs a person" until collection exists.

## Reversibility

MODERATE. Libraries and the packet are data and output; the engagement flow is a skill and a command, removable without touching the security records.

## Evidence

The owner's messages of 2026-09-26 quoted above and the answer "in a private repo"; decisions 39ef and 8c57; MojoComply's library headers (frameworks/soc2-tsc.yaml, pci-dss-v4.yaml), read-only.
