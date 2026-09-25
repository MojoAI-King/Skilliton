# Compliance fixtures

Kind: Reference.

Hand-made input for `scripts/compliance-scope.test.mjs` and `scripts/compliance-sheet.test.mjs`. Nothing here is real framework text.

- `frameworks/scope-kb.json`: a knowledge base of the same shape as the converted `packs/base/plugins/workflow/frameworks/scope-kb.json` (MojoComply's scoping/applicability.yaml keys, unchanged): the 21 repo_scan signals the scanner has detectors for, three interview signals, the frameworks and candidates with triggers, and the PCI SAQ variants. The wording is placeholder text; only the structure and the signal to framework links mirror the real file, and the scope test derives its expectations from whichever knowledge base it reads, so it holds for both.
- `sheet/fixture-framework.json` and `sheet/fixture-framework-to-nist-csf-2.json`: a six-control library and its crosswalk to NIST CSF 2.0, in MojoComply's library and crosswalk shapes, written for the tests.
- `sheet/baseline-crosswalk.json`: a fixed baseline crosswalk (four controls), copied into the temporary frameworks folder as `baseline-2-to-nist-csf-2.json`, so the sheet test does not move when the owner reviews the shipped one.
- `synthetic-project.mjs`: builds the temporary project the sheet and banned-word tests run on (the baseline catalog, two observed records with one made stale, one applicability decision, a confirmed scope) and says which state each fixture control should reach.
- `words/`: planted banned words for `node scripts/compliance-words.test.mjs --self-test`: a sheet and a printed text that each hold one, a library JSON with one in a note (flagged) and quoted ones in citation and requirement fields (left alone), and a JSON file whose only banned words are exempt.
