# A rewriter of a hand-edited file proves the round-trip before it writes

Kind: Living. Lesson entry.

- **ID:** 2026-09-19-a-rewriter-of-a-hand-edited-file-proves-43c7
- **Status:** accepted
- **Date:** 2026-09-19

## What broke

On 2026-09-19, the first version of `packs/base/plugins/workflow/runtime/lib/handoff.mjs` parsed this repository's `docs/HANDOFF.md` and rendered it back one byte short: a blank line directly after an `### 2026-09-17 18:35 EDT` heading under `## Earlier` was gone. Nothing had failed; the file would simply have been rewritten without that line at the first `skilliton checkpoint --handoff --apply`, and the diff would have shown a change nobody asked for in text the command is supposed to leave alone.

## The mechanism

The parser split the Earlier section into entries and trimmed each entry's lines with a helper that removes blank lines at both ends. A blank line after an entry's heading is a leading blank line of that entry, so the trim ate it, and the renderer put the heading and the first bullet back together with no gap. The parser was correct for every fixture written by the command (the command never writes that blank line) and wrong for the one real file, which a person had written by hand. The same helper was right for the trailing side, where the blank line belongs to the join between blocks.

## The fix

`handoff.mjs`: the entry lines are trimmed trailing-only (`trimBlank(lines, { leading: false })`), so whatever follows a heading is kept. `scripts/handoff-write.test.mjs`, first test: parse and render this repository's `docs/HANDOFF.md`, the fixture, and a CRLF file, and assert byte equality with the original each time.

## The rule

A program that rewrites a file people also edit by hand must prove, before it is allowed to write, that parse followed by render gives the original file back byte for byte, on the real file and not only on fixtures it wrote itself. Every place the round-trip differs is a normalisation the parser makes without meaning to, and the diff of that first round-trip is the list of them. Only then does the writer earn `--apply`.

## What now enforces it

`node --test scripts/handoff-write.test.mjs`, the round-trip test, runs in docs/MAINTAIN.md step 2 and in CI (`Handoff writer`). It reads the live `docs/HANDOFF.md`, so it also fails the day someone adds a shape to that file the parser does not preserve. No such test exists yet for the other rewriters in the runtime (`records.mjs` indexes and `core.mjs` managed blocks rewrite only text between their own markers, which is a narrower contract); that stays a gap until one of them is made to touch text outside its markers.
