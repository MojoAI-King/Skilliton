# Compliance fixtures

Kind: Reference.

Hand-made input for `scripts/compliance-scope.test.mjs` and `scripts/compliance-sheet.test.mjs`. Nothing here is real framework text.

- `frameworks/scope-kb.json`: a knowledge base of the same shape as the converted `packs/base/plugins/workflow/frameworks/scope-kb.json` (MojoComply's scoping/applicability.yaml keys, unchanged): the 21 repo_scan signals the scanner has detectors for, three interview signals, the frameworks and candidates with triggers, and the PCI SAQ variants. The wording is placeholder text; only the structure and the signal to framework links mirror the real file, and the scope test derives its expectations from whichever knowledge base it reads, so it holds for both.
