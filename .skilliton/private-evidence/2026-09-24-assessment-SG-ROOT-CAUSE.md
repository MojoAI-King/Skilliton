# Assessment note: SG-ROOT-CAUSE

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Explain the mechanism behind a discovered vulnerability. Expected: a finding with root-cause analysis and
linked correction. Assessment recorded: observed.

## Evidence

- docs/lessons/README.md fixes the entry format: What broke, The mechanism, The fix, The rule, What now enforces it.
- All 59 entries under docs/lessons/ have a "The mechanism" section and a "The fix" section (counted 2026-09-24); the
  23 older entries kept in docs/LESSONS.md have the same fields.
- Security findings with their mechanism and the correction they link (lesson file names are longer than a record
  may attach, so the record fingerprints the README and the tests that enforce them):
  - the lesson with suffix 15cd, dated 2026-09-16 (undo trusted its own receipt): a tampered receipt could make undo
    delete any file; fixed in runtime/lib/join.mjs (commit 5358f37), with a regression test per finding in
    scripts/join.test.mjs.
  - the lesson with suffix a324, dated 2026-09-22 (a guard judges paths against the root): the record-removal guard
    decided the opposite way from a subfolder; fixed in the guardrails hook set_project_dir (commit 17189d2), tested in
    scripts/guardrails.test.sh.
  - the lesson with suffix 3e4a, dated 2026-09-21 (verify called every plugin in use tampered): false TAMPERED results;
    fixed in runtime/lib/treehash.mjs and runtime/lib/release.mjs (workflow 0.15.1), tested in scripts/release.test.mjs.

## Limits

Only 17 of the 59 entries cite a commit; the rest name the files and tests that changed. Two entries say nothing
enforces their rule yet.
