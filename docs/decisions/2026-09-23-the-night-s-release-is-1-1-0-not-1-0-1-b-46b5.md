# The night's release is 1.1.0, not 1.0.1, by the release skill's own rule

Kind: Living. Decision entry.

- **ID:** 2026-09-23-the-night-s-release-is-1-1-0-not-1-0-1-b-46b5
- **Status:** accepted
- **Date:** 2026-09-23

## Decision

The release that carries the night of 2026-09-22 to 23 is numbered 1.1.0, not the 1.0.1 the handoff had planned.

## Why

The release skill's own rule (packs/base/plugins/workflow/skills/release/SKILL.md, step 5) says patch for fixes and minor for a new skill, rule, command or gate behavior. This release adds `security applicability --propose` and `--accept-proposal`, the maintain step that refreshes security records, the gate's machine context, the line-length and function-length rules, and an instruction migration (0100) that reaches every prepared project. 1.0.1 was planned when the night's scope was fixes only; the scope grew with the field report's asks. A patch number over new behavior would make the product break its own rule in its second release.

## Alternatives rejected

Keeping 1.0.1 because records already said so: the records are cheap to change and the rule is what a reviewer reads. Splitting into 1.0.1 (fixes) and 1.1.0 (features) tonight: two signings and two verifications with no time for either to be watched properly.

## Risk

Documents and the website that say 1.0.1 read as stale until they are updated; the records in this repository were changed in the same commit, the website's pin is named in the note for the website session.

## Reversibility

A number cannot be reused once a signed tag carries it. If the owner wants a different scheme, it applies from the next release.

## Evidence

CHANGELOG.md, the Unreleased entries moved under 1.1.0; releases/1.1.0.json once created; the release skill's step 5.

