# Assessment note: SG-RECURRING-PATTERNS

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Look for recurring causes across findings. Expected: a review of related findings and the resulting
prevention work. Assessment recorded: gap.

## What exists

- Findings are reviewed together per review batch: docs/THREAT_MODEL.md "Limits the 2026-09-23 reviews found, and
  where each fix ships", and SECURITY.md "Limits found by the 2026-09-23 reviews" and "Limits found by the second,
  2026-09-23 review". One grouped cause there (writers that followed symbolic links, in the gate log and in new-skill
  and import) led to one prevention change: workflow 0.23.0 checks every component of the destination path, tested in
  scripts/skill-writers.test.mjs.
- The lesson with suffix 7323, dated 2026-09-18 (a gate that walks the list it is checking) groups three findings with
  one cause, and its prevention is a floor on the number of git calls plus a walk of every runtime module in
  scripts/git-config.test.mjs.
- Two lessons record a recurrence under their own heading (suffixes 3b76 and 0f41, both dated 2026-09-20).

## What is missing

No document reviews all the findings and lessons together and groups them by cause. docs/LESSONS.md is a generated
index sorted by ID, and docs/REPORT_CARD.md grades product areas, not causes. The per-batch groupings above are the
nearest thing; a periodic cross-finding review with its prevention items is what the control asks for.
