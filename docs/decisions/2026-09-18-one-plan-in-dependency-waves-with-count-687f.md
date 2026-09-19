# One plan in dependency waves, with count-based bars per area

Kind: Living. Decision entry.

- **ID:** 2026-09-18-one-plan-in-dependency-waves-with-count-687f
- **Status:** accepted
- **Date:** 2026-09-18

## Decision

The road from the 2026-09-18 report card to A- in every area is one plan, divided into batches that live in one folder per area under docs/areas/, and executed in dependency waves across areas rather than area by area. Each area keeps its own file, its own batches and its own bar, so it can be tracked and enhanced on its own; docs/REPORT_CARD.md orders the batches into waves and shows both views. Progress is a count: ticked acceptance items over all acceptance items, computed by scripts/report-card.mjs, never a time, cost or savings figure. A ticked item must end with its evidence or the check refuses. The letter grade is a separate judgment kept in a dated history table, so the bar and the grade can disagree and the card says why.

## Why

The areas depend on each other. Installing the plugins on the owner's machine unlocks measurements in four areas at once; bounding context moves both the token-efficiency and the dispatch grades; rolling maintenance is one batch that moves two areas. Working one area to completion before starting the next would leave the cheapest unlocks for last. Counts rather than percentages of effort keep the card inside PLAN.md sections 6 and 8: nothing in it can be read as a savings claim, and a bar cannot move without a named piece of evidence.

## Alternatives rejected

One plan per area, worked in sequence: rejected because the first area's live-session batch is the prerequisite of batches in three other areas, and sequencing by area would either repeat that work or defer it. Letter grades as the only record: rejected because a grade cannot show partial progress between gradings and invites rounding up. Effort or time percentages: rejected because they would be estimates, and the repository's rule is that a number leaving it comes from a measurement.

## Risk

A count treats every acceptance item as equal, so a batch of small items moves a bar faster than a batch of one hard item; the AREA.md files say when the count and the grade disagree. The wave order assumes the owner does the machine-side batches (install, Windows) on the days named; if they slip, the waves after them slip, and the card says which bars wait on whom. Evidence text in a ticked item is checked for presence, not for truth; a reviewer still reads it.

## Reversibility

High. The area folders and the generator are additive; removing them removes the bars and nothing else. PLAN.md section 7 stays the milestone authority and the backlog keeps its IDs; the batch files only reference them.

## Evidence

scripts/report-card.test.mjs (fixture contract), node scripts/report-card.mjs --self-test (seven checks proved able to fail), node scripts/report-card.mjs --check current after --apply on 2026-09-18; docs/REPORT_CARD.md grade history row of 2026-09-18; the task record docs/tasks/2026-09-18-report-card-area-folders-and-master-prog-9251.md.
