# A check that looks for a word also finds its negation

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-check-that-looks-for-a-word-also-finds-d128
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The supported client rule of batch 03-05 says a client is supported only when `docs/CLIENTS.md` carries a column for
it with at least one **measured** row. Its first draft in `scripts/docs.test.mjs` decided whether a column had one by
testing each cell against `/measured/i`. Every column passed, including the Cursor column added in the same wave,
whose every cell says `not measured` because no session has ever run there. The rule reported a client nobody has run
as measured, which is the exact claim the rule exists to stop.

## The mechanism

`/measured/i` matches the substring in `not measured`. A word presence test cannot see the word that qualifies it, and
in a matrix whose empty state is written as the negation of its full state, presence and absence match the same
pattern. The matrix writes its empty cells three ways, `not measured`, `never measured` and phrases like
`not yet measured`, so the negation is not even one fixed string.

## The fix

[scripts/docs.test.mjs:181](../../scripts/docs.test.mjs) takes the negations out before looking for the word:

```js
const hasMeasured = (cell) => /measured/i.test(String(cell ?? "").replace(/\b(?:not|never|no)\s+(?:\w+\s+){0,2}measured\b/gi, ""));
```

The `(?:\w+\s+){0,2}` is what carries `not yet measured` and `no hooks measured`. Two lines of comment above it say
why the replacement is there, so the next reader does not simplify it back.

## The rule

Before a check looks for a word, read how the file it reads says the opposite. If the negative is written with the
same word, strip the negations first and say so in a comment beside the pattern.

## What now enforces it

Nothing automatic, and the reason is worth stating: the measured count is reported in the rule's ok line for a person
to read, not raised as a failure, because whether a row is really measured is a judgement the matrix records and a
regular expression should not make. So there is no self test case for this half, only for the half that does fail, a
README naming a client the matrix does not carry. The comment beside the pattern is the enforcement.
