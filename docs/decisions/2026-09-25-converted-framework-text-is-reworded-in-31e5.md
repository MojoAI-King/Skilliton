# Converted framework text is reworded in the converter, never exempted from the vocabulary check

Kind: Living. Decision entry.

- **ID:** 2026-09-25-converted-framework-text-is-reworded-in-31e5
- **Status:** accepted
- **Date:** 2026-09-25

## Decision

When a framework library converted from MojoComply's YAML carries "compliant" or "certified" outside a `citation` or `requirement` field, the phrase is reworded in the converter (`scripts/frameworks-convert.mjs`, the `REWORDINGS` table) to say the same thing without the word. The vocabulary check (`scripts/compliance-words.test.mjs`) keeps its rule over every file in the frameworks folder; no field and no file is exempted for it. Each rewording names the exact source phrase, its replacement and the number of times it must match, and `convertAll` refuses the run when a count is off, so a change in the source is loud in both directions: a phrase that disappears cannot leave a dead rewrite behind, and a new banned word is caught by the check on the converted output.

Made at merge on 2026-09-25 by the integrating session, when the compliance-runtime lane's check met the frameworks-data lane's data and found five phrases: one quoted marketing claim ("HIPAA certified"), two remediation standards, one remediation note and one source-watch note.

## Why

The rule the check enforces is the product's: Skilliton assesses and never attests, and nothing it ships says a project is compliant or certified. The library text is shipped text. A skill may quote a remediation standard to a user, and an exemption for "remediation and note fields" would have left a hole a future conversion could carry a banned sentence through unnoticed. Rewording five phrases costs nothing in meaning ("a compliant consent template" becomes "a consent template that meets the rule"; a service must not be represented "as holding a HIPAA certification", where the source had the marketing phrase in quotes) and keeps one rule that every check can state in one sentence.

The count on each entry is what makes the table safe to keep: a rewording that matched nothing would otherwise sit in the converter looking as if it still did something.

## Alternatives rejected

- **Widen the exemption to remediation, note and change-watch fields.** Most of a library's prose is in those fields, so the check would have covered almost nothing but titles, and the rule would have needed a paragraph to state.
- **Exempt a banned word inside quotation marks** (for the quoted claim). Adds a parser to the check for one case, and "your project is \"compliant\"" would pass it.
- **Edit the committed JSON by hand.** `--check` compares the committed files with a fresh conversion, so a hand edit is drift by definition and the next conversion would undo it.
- **Ask the source project to reword its YAML.** Its wording is its own, and the two projects should not have to move in step for this repository's test to pass.

## Risk

A rewording changes the source's words, and a paraphrase of a regulation can drift in meaning. The five are short and were read one by one against the surrounding sentence; the diff of the converted files is exactly those five strings and nothing else. A future entry is subject to the same reading. The rewording table is the converter's third transform after the name redaction and the dash normalization, and the header comment of the converter lists all three, so a reader of the JSON who compares it with the source finds the reason there.

## Reversibility

Easy. Remove an entry from `REWORDINGS`, run the converter, and the source phrase comes back; the vocabulary check then fails on it again, which is the point. Nothing else depends on the table.

## Evidence

- Before the fix, on the rebased compliance-runtime tree: `node scripts/compliance-words.test.mjs` exit 1, five hits named by file and JSON path (health-wellness `.controls[8].remediation.note`; hipaa-privacy-breach `.controls[0].remediation.standard` and `.controls[18].remediation.note`; ny-dfs-500 `.meta.sources[0].change_watch`; part2-overlay `.controls[6].remediation.standard`).
- After: `node scripts/frameworks-convert.mjs` (with the source) rewrote four files, and `git diff --word-diff` showed only the five phrases changed; `--check` exit 0 (16 files match); `compliance-words` exit 0 and its `--self-test` still fails on its four planted words; `frameworks.test.mjs` exit 0 with and without the source; `lint`, `scrub-check` exit 0.
- Commit 6a288c7 on main ("Merge fix for compliance-runtime: the vocabulary check meets the converted libraries").
