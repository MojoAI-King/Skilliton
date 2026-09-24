# The usage summary compares the two latest screen readings and a same-count baseline

Kind: Living. Decision entry.

- **ID:** 2026-09-24-the-usage-summary-compares-the-two-lates-fbf8
- **Status:** proposed
- **Date:** 2026-09-24

## Decision

`skilliton usage summary` reads its period as the time since the last usage screen reading (else the last seven days), as the item asked. The screen's direction is the latest reading against the one before it, and it counts as down only when every reading both carry (five-hour, weekly, and model weekly when both have it) went down. The meter's direction is tokens per batch in the period against the baseline: the window given with `--baseline <day>..<day>` (read from the transcripts, with the day form composing with each batch's instant span so the first batch is clamped to the window), else the earliest committed ledger rows before the period, as many as the period has. The verdict says saved only when both directions are down, says not established when they disagree, when a reading is missing (fewer than two filed) or when the meter has no comparable batch, and never prints an amount, a percent sign or a dollar sign.

## Why

The item defines the period as since the last screen row, which leaves no later reading inside the period to compare, so the two latest readings are the only pair a person has actually filed; printing both with their dates lets a reader see which span they describe. Requiring every reading to fall keeps a five-hour reading that happened to be taken right after a reset from carrying the verdict alone. Tokens per batch, not per day, is the comparison the item names, and a same-count baseline keeps a period of three batches from being set against one of thirty.

## Alternatives rejected

A period between the two latest readings: it matches the screen pair exactly, but it is not what the item specified, and a person filing a reading at the end of a week would then see the summary describe the week before. Comparing cost instead of tokens: the table's prices change with the models used, so a cheaper model would look like a saving the screen may not show. Reading docs/USAGE_BASELINE.md for the window: the file's window is a placeholder until the owner chooses it, so the command takes the window as an argument instead of parsing a file that does not yet hold one.

## Risk

With few screen readings the verdict is almost always not established, which is the honest answer and may read as the command doing nothing. Reading a live period means one meter run per batch, about two seconds each on this machine for 32 lane folders; a period of forty batches took about ninety seconds (measured 2026-09-24).

## Reversibility

Each rule is one function in lib/usage-ledger.mjs (screenTrend, meterTrend, verdictLine) and one in commands/usage.mjs (baselineOf); none of them writes anything, so changing one changes only what the next summary prints.

## Evidence

scripts/usage.test.mjs: both down prints saved once, the meter down alone and the reverse print not established, no reading and one reading print not established naming the missing reading, and no line that says saved carries a percent or dollar sign (the rule was mutated to accept the meter alone, and three checks failed). scripts/usage-ledger.test.mjs files two screen readings through the command and reads them back in a summary.
