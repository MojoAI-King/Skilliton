# Compliance lives in public Skilliton as a projection of its evidence onto framework libraries through NIST CSF 2.0

Kind: Living. Decision entry.

- **ID:** 2026-09-25-compliance-lives-in-public-skilliton-as-39ef
- **Status:** accepted
- **Date:** 2026-09-25

## Decision

The compliance feature ("when a framework applies, map to its controls and fill the control sheet") is built inside the public workflow plugin, in three parts that reuse what the security module already does:

1. **Frameworks as data.** MojoComply's framework libraries whose sources are public domain (HIPAA Security Rule, HIPAA privacy and breach, the 42 CFR Part 2 overlay, FTC Safeguards, NY DFS Part 500, the NIST CSF 2.0 spine, and the two guidance tiers where their wording is our own) are converted once, by a committed script, from YAML into JSON files under the workflow plugin, with each library's provenance and attribution carried over. SOC 2 (AICPA copyright) and PCI DSS (PCI SSC copyright) are not published until a licence check says they may be; until then they stay in MojoComply. Nothing of MojoComply's git history moves: files are copied fresh, and its client folders never enter this repository.
2. **Detection with a named confirmation.** `skilliton compliance scope` ports MojoComply's `scope`: it reads the same seven root files and package manifests, matches the same 21 signals with the same scoring, and proposes frameworks with a confidence and the file and line of each signal. `--apply --decided-by <person>` records the confirmed scope in `.skilliton/compliance/scope.json`. Nothing is recorded without a named person, the same rule as the security applicability file. `prepare` drafts a proposal; the session start says when proposals wait unconfirmed.
3. **The control sheet from evidence Skilliton already has.** A reviewed crosswalk maps each of the 15 baseline security controls to NIST CSF 2.0 subcategories. MojoComply's own crosswalks map every framework control to CSF subcategories. `skilliton compliance sheet --apply` walks from each in-scope framework control, through CSF, to the baseline controls, to the project's security records and their freshness, and writes `docs/COMPLIANCE-CONTROLS.md`: one row per framework control with its citation, a state (evidenced, partial, not_started, not_applicable), the records behind it, and what a person must still supply. The sheet carries the disclaimer and the independence line ("built by the company being assessed: yes or no"). It never prints "compliant", "certified" or "passes", and a test fails if it does.

No new dependency, no network, no browser: the public repository's footprint promises hold. The `security` module is changed in two small ways only: `security status --json`, and `security record` with a manifest-format source documented as the external-collector contract.

## Why

MojoComply already does most of this (291 controls in 10 libraries, a repository scanner, a strict evidence manifest, a generated control record that refuses to say "compliant"), so the work is a bridge, not a rebuild. The owner chose on 2026-09-25 to put the code in public Skilliton rather than a private pack. Skilliton's security module already holds per-control evidence with freshness; NIST CSF 2.0 is the spine MojoComply's crosswalks all point at, so one small crosswalk from Skilliton's 15 controls to CSF lets every framework fill from the same evidence without the security module learning about frameworks.

## The belief audit (what the owner said, and what is true)

- "The tool can map to the controls when it identifies a framework applies." TRUE for the libraries shipped; the mapping runs through CSF and is reviewed data.
- "It fills out control sheets." TRUE for the part evidence covers. Skilliton's 15 controls touch a slice of CSF; a framework's controls outside that slice will read not_started with "needs a person" beside them. The sheet lists that gap; it does not hide it. Deep collection of the rest (screenshots, attestations) is MojoComply's skill, a later increment.
- "SOC, HITRUST, other frameworks." SOC 2 and PCI DSS: UNVERIFIED until the licence check; HITRUST: not in MojoComply and its text is licensed; NOT in this increment.
- "Gets things compliant and ready." FALSE, and corrected here in writing: Skilliton assesses and prepares; it never certifies, and nothing it prints will say compliant. The company being assessed stays responsible for its own compliance. This is MojoComply's first law and it carries over unchanged.

## What it will not do

Certify or attest; collect screenshots, admin-console states or vendor dashboards (a person supplies those); store any regulated data as evidence (configurations, audit output and attestations only, and the manifest validator refuses data extracts); run the portal or sync to it; ship SOC 2, PCI DSS or HITRUST text in this increment.

## The riskiest assumption, and its week-one test

That a repository's own files carry enough signal to propose the right frameworks. MojoComply's scanner reads only seven root files and matches phrases, so a repository that never names its data kind proposes nothing. The test, before the sheet is built: run the ported scanner on two of the owner's real repositories (one that handles health data, one that does not) and compare the proposals with what the owner knows to be true, recorded as evidence. If the proposals are wrong on both, detection becomes an intake question at prepare time instead of a scan, and the rest of the design stands.

## Kill criteria

- The licence check finds that a "public domain" library's wording is not ours: that library stays out, the others ship.
- The crosswalk from the 15 controls to CSF cannot be reviewed to the owner's satisfaction: the sheet ships with states derived only from direct evidence, and the crosswalk rows stay marked unreviewed.
- The port cannot stay dependency-free: the feature calls MojoComply as an optional external tool when it is installed, and the public side keeps only detection and the scope file.

## Alternatives rejected

- A private Skilliton Ultra pack holding MojoComply whole: the owner chose public; also, a second plugin cannot add a `skilliton` subcommand, a collector or shared code, so the bridge would have been a shell-out boundary either way.
- Extending the security catalog to hold framework controls: the catalog is one file per project, strict, and any change to it stales every record; frameworks are a separate layer that reads records and never writes them.
- Moving MojoComply's repository history into this one: it holds client folders; publishing history is irreversible.

## Architecture, briefly (the five questions)

- Components: the converter (data in), the scanner (proposal), the scope file (a person's confirmation), the crosswalk (reviewed data), the projection and sheet writer (output), the skill (instruction). Delete any one and the feature stops at that step and says so.
- External calls: none at run time. The converter runs at build time over files in this repository.
- Run twice: the scanner and the sheet writer are pure over their inputs; `--apply` rewrites the same files with a backup, and a second run without changes writes nothing.
- Zero, one, many, malformed: a repository with no signals proposes nothing and says so; a scope with no frameworks writes an empty sheet that says no framework is in scope; a malformed library or crosswalk refuses with the path and exit 2; a sheet over a project with no records lists every control not_started.
- How anyone knows it broke: the session start reports an unconfirmed proposal or a stale sheet; the banned-word test and the converter round-trip run in CI; `maintain --apply` refreshes the sheet and says how many rows changed.

## Risk

Coverage will disappoint at first: the sheet will show more not_started than evidenced, because Skilliton's 15 controls are a starter baseline. The number is honest and visible, and it is the argument for the next increment (collectors and the deep-collection skill), not a reason to widen the states. Publishing the libraries under MIT gives them away; the owner chose that knowingly, and the two licensed libraries are held back.

## Reversibility

MODERATE. The libraries and the crosswalk are data files; the command, the skill and the sheet can be removed without touching the security records. What is published stays published.

## Evidence

The two surveys of 2026-09-25 (MojoComply's command surface, manifest schema, control record and laws; Skilliton's catalog, applicability, records, collectors, findings and extension points) in this session's record; the task record 2026-09-25-compliance-in-skilliton-frameworks-as-da-3e50 with the acceptance criteria C1 to C8; the plan document "Skilliton direction: one tool for people and fleets" for the owner's choice.
