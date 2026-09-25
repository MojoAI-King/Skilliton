---
name: compliance
description: Detect which compliance frameworks apply to this project from its own signals, get a named person to confirm the scope, and fill the control sheet from evidence Skilliton already holds. It never certifies - assessment, readiness, evidence, findings and gaps only, prepared for an independent assessor to review. Use when a compliance proposal is waiting, a framework is in scope, or the user asks "are we compliant" or "what do we need for HIPAA"?
---

# compliance: assessment, not attestation

This skill proposes which frameworks apply from the repository's own signals, gets a named person to confirm the scope, and fills a control sheet by projecting the project's own security evidence, through the crosswalk to NIST CSF 2.0, onto each in-scope framework's controls. It never says the project is compliant, that anything is certified, or that a check passes: it says what was assessed, what state each control is in, and what a person still has to supply.

## 1. Propose the scope

Run `skilliton compliance scope`. It reads the repository's own signals (root files, package manifests) and proposes candidate frameworks, each with a confidence and, for every signal behind it, the file and line it came from. Explain the proposal in plain words, and give the file and line behind each signal so the proposal is not just Skilliton's say-so.

If `skilliton` is not found on the shell path, say so and run the plugin's own copy by its path: `bin/skilliton` in the workflow plugin folder, two folders above this skill's base directory. If the session start shows no scope proposal and none exists yet, `skilliton prepare` drafts one.

## 2. Get a named person to confirm

A proposal is not a scope. Ask the user (or the person they name) which of the proposed frameworks actually apply, and record their answer, never the model's own guess: `skilliton compliance scope --apply --decided-by "<their name or role>"`. Nothing is recorded without a named person, the same rule as the security module's applicability decisions.

## 3. Fill the sheet, and read it back honestly

Run `skilliton compliance sheet` (`--apply` writes `docs/COMPLIANCE-CONTROLS.md`). It walks from each in-scope framework's controls, through the crosswalk to NIST CSF 2.0, to the project's own security records and their freshness, and writes one row per control with its citation and a state: evidenced, partial, not_started, or not_applicable.

Read the sheet's "needs a person" list back in plain words: the controls no repository evidence can reach on its own (a screenshot, a vendor dashboard, an attestation only a person can supply). Then say plainly what Skilliton gathered on its own, from its own records, so the two are never confused with each other.

## 4. The vocabulary law

Use assessment, readiness, evidence, findings, gap. Three words never appear in a reply at all: not in a negation, not in a quotation, not when reading the question back. A reply that denies the claim in the framework's own word has given a verdict too, from the other side, and whether an organization meets a framework is a legal determination for it and its counsel, never Skilliton's. The first eval run of this skill failed on exactly this: every reply denied the claim in the framework's own word.

- Never "compliant", in either direction: give the sheet's counts and states instead ("of the 58 Security Rule controls, 3 are evidenced, 9 partial, 46 not started; here is what a person still has to supply"), and when asked for a yes or no, say that neither is Skilliton's to give and give the sentence a person can truthfully say tomorrow: the counts, the gaps, and who is working them.
- Never "certified": say instead that no certification exists for HIPAA and that an independent assessor reviews the evidence a project holds.
- Never "passes": a check "ran green" or "reported no findings", a control is "evidenced", a test run "had no failures".

Read the question back in these words before answering it, so the question's own word does not come back in the answer. Never an outcome promise.

## 5. The independence line

When the company that built the software is also the one running this skill, say so plainly: the sheet is preparation for an independent assessor, never an attestation. The company being assessed stays responsible for its own compliance; Skilliton prepares the paperwork, it does not sign off on it.

## 6. What this skill will not do

- Certify or attest to anything.
- Collect screenshots, admin-console states or vendor dashboards; a person supplies those.
- Store any regulated data as evidence (configurations, audit output and attestations only, never a data extract).

## Limits to state plainly

- The sheet's coverage reaches only as far as the security evidence and the crosswalk reach; a framework's controls outside that slice read not_started with a person named beside them, never hidden and never guessed at.
- Evidence freshness is not merge enforcement: the shared branch's delivery checks decide what may merge.
- The framework libraries here are the public-domain sources converted into this plugin; a framework this plugin does not ship (SOC 2, PCI DSS, HITRUST) is out of scope for this skill, not silently assessed.
