# Two lanes that meet at data need the check run over the data before dispatch

Kind: Living. Lesson entry.

- **ID:** 2026-09-25-two-lanes-that-meet-at-data-need-the-che-8df1
- **Status:** accepted
- **Date:** 2026-09-25

## What broke

In the compliance batch of 2026-09-25, the compliance-runtime lane's vocabulary check (`scripts/compliance-words.test.mjs`, N4) and the frameworks-data lane's converted libraries (N1) met for the first time on the rebased tree at merge: five "compliant" or "certified" phrases in remediation and note text, exit 1. Each lane was green on its own; the runtime lane had even predicted the failure in its report, because it could not run its rule over data it did not have.

## The mechanism

The lane plan named the code seams (export names, config keys, file shapes) and which lane commits each first. It did not name the data seam: one lane's check reads another lane's data, and the rule that check enforces was stated in the plan without ever being run over the source the other lane would convert. Step 2 of dispatch verifies items against the code; nothing verified the item against the data.

## The fix

At merge: a `REWORDINGS` table in the converter, five phrases rewritten with the count each must match, and the data regenerated (decision 2026-09-25-converted-framework-text-is-reworded-in-31e5). One fix round, inside the budget the plan allows, but a round that a ten-second grep over the source YAML during dispatch would have made unnecessary.

## The rule

A seam can be data. When one lane's check, loader or parser will read what another lane produces, dispatch runs that check's rule over the source material before writing the briefs, and both briefs carry the result: the producing lane knows what its output must not contain, the consuming lane knows what it will meet. A rule stated in a brief and never run against the real input is an assumption.

## What now enforces it

Instructed, not enforced: the dispatch skill's "Shared seams" paragraph now says that a seam can be data and what to do about it. Nothing mechanical can know which check will read which lane's output; the person writing the plan has to name it, which is why it is written into the skill rather than left in this entry.
