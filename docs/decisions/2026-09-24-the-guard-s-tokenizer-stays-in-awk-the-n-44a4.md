# The guard's tokenizer stays in awk: the Node parser matched it byte for byte but made every decision slower and Node a hard requirement

Kind: Living. Decision entry.

- **ID:** 2026-09-24-the-guard-s-tokenizer-stays-in-awk-the-n-44a4
- **Status:** accepted
- **Date:** 2026-09-24

## Decision

B67's Node tokenizer (N9 of the 2026-09-24 batch) is not merged. The guard keeps its awk tokenizer; the built parser is kept as a patch in the lane folder (`~/Desktop/Skilliton-lanes/guard/N9-unfinished.patch`, never committed) and B67 stays open with the measurement below.

## Why

The lane built `hooks/guard-parse.mjs` (417 lines, a 30-case self-test) and it produced byte-identical splits on 633 inputs taken from every guard suite and on 13,000 random inputs. It also replaced only the 135-line awk tokenizer, not the splitting section around it, so the review burden fell less than the backlog row hoped, while every command decision got slower (mean 26.8 ms to 78.6 ms over 1,995 decisions, slowest 185 ms to 275 ms, because Node starts on every split) and Node became required for the guard, where python3 or jq alone is enough today. Finishing it also needs the pinned guard suite's python3-only section rewritten.

## Alternatives rejected

Merging it as built: slower on every shell command a session runs, for a smaller maintenance gain than claimed. Rewriting the pinned suite to fit: the pin exists so the correctness suite does not grow.

## Risk

The awk tokenizer remains the least reviewable part of the guard, which the outside review named. The byte-identical corpus makes a later move cheap to verify.

## Reversibility

Full: `git apply` the patch on a lane branch and rerun the six guard suites.

## Evidence

The guard lane's report of 2026-09-24 (commit 0541067 for N8, which merged; N9 measured and not committed); backlog B67.
