# The tool said so on its second line and its last line, and the table between them was read instead

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-the-tool-said-so-on-its-second-line-and-0a35
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

Four eval cases were written for the code-quality skills and the run was read as four results. **Three cases ran.** The fourth, `a-test-that-cannot-fail`, never executed at all: its frontmatter did not parse, so the case was refused before it started. Its absence was then carried forward into a judgement about which skills had earned their place, which is the kind of number that ends up in a commit message and a report card.

The tool was not silent about any of it. It said so **on the second line of the run**, naming the file and the parse error, and again in its **very last line**: `1 case file(s) failed to load, see above`.

## The mechanism

This is a reading failure, not a tool failure, and it has a shape worth naming. A long-running tool prints in three parts: a head while it loads its inputs, a body while it works, and a tail with its verdict. The **result table sits in the middle** and looks like the answer, because it is formatted like one. Both statements about the missing case were outside that table, one above it and one below it.

Two things made the middle easy to read in isolation: the table is the visually distinctive part of a long scroll, and the eye goes to it; and the table was internally consistent, because three cases really did score. Nothing in it was wrong. It was just an answer to a smaller question than the one being asked.

The cheap check that would have caught it needs no reading at all: **four cases were written and three rows came back.** The count was available the whole time and was not taken.

## The fix

For this instance, single-quoting the description fixed the parse and the case then scored, and `scripts/packs.test.mjs` now parses every eval case's `prompt.md` so a case that cannot load fails a gate here rather than being discovered in a paid run ([[2026-09-20-an-unquoted-colon-space-in-frontmatter-d-0f41]]).

For the reading half there is no fix in code, and saying so is part of the entry: when a tool reports its own failure in prose, no gate of ours stands between that prose and a session that skips it.

## The rule

Read a run's **head and its last line** before its table, and read the table only after both. Then count: the number of result rows equals the number of inputs, or the difference is explained before anything is concluded. A tool's summary line is a claim about its own completeness and outranks a table that is merely consistent.

The same rule covers the suite runner in this repository, which prints `n PASS` or `n FAIL` per step: the step count is checked against the expected count, not just scanned for the word FAIL.

## What now enforces it

Nothing automatic, and it cannot be otherwise for a tool this repository does not own. What exists is the packaging gate that now prevents this particular unloadable case, and the honesty rule in `CLAUDE.md`: a crashed check or a missing field is reported as such and never rounded up. The failure mode here was not rounding a failure up, it was **not noticing one had been reported**, which the honesty rule does not reach. The counting step above is the only thing that does.
