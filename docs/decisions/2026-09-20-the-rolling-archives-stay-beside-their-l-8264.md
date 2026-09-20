# The rolling archives stay beside their living file; docs/archive is for superseded documents

Kind: Living. Decision entry.

- **ID:** 2026-09-20-the-rolling-archives-stay-beside-their-l-8264
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

`docs/archive/` holds documents that are wholly superseded: written for a version of this product that no longer
exists, kept so the history can be read, and never updated again. Every document under it carries `Kind: Reference.`, and
`scripts/docs.test.mjs` fails if one does not. Today it holds the three prototype-era documents that were under
`docs/history/`, which this decision renamed so the archive has one name.

The three rolling archives, `docs/STATUS_ARCHIVE.md`, `docs/BACKLOG_ARCHIVE.md` and `docs/HANDOFF_ARCHIVE.md`, do **not**
move there. They stay beside the living file whose history they hold.

## Why

A rolling archive is not a superseded document, it is the older half of a living one. `docs/STATUS_ARCHIVE.md` is where
`scripts/living-docs.mjs` puts a current-state paragraph when a new one replaces it; `docs/HANDOFF_ARCHIVE.md` is where a
checkpoint rotates the sixth-oldest block. Both are written every working day by a generator, and a reader who opens the
living file wants its archive one line away, not in a folder of things that stopped being true.

The decisive reason is narrower than taste. `backlogArchive` and `handoffArchive` are fields of the prepared-project
record contract: they are named in `packs/base/plugins/workflow/runtime/lib/config.mjs`, written into `.skilliton/config.json`
by `prepare`, and carried in `scripts/fixtures/prototype-v1/project-files.mjs` for the layout-1 migration test. Moving them
would be a path change in every project this product has ever prepared, delivered as a migration, for a tidiness reason.
The rename it would force on other people's repositories is larger than the problem it solves here.

`docs/history/` and `docs/archive/` were the same idea under two names, and only one folder existed, so the rename cost
nothing but seven references.

## Alternatives rejected

**Move all six into `docs/archive/`.** It reads tidier in a listing and it is what the batch's own wording suggests at
first reading. Rejected for the contract reason above: three of the six are named in the record contract that every
prepared project carries.

**Keep `docs/history/` and treat it as the archive.** The folder already existed with the right labels, so this would have
cost nothing. Rejected because the acceptance item names `docs/archive/`, and an enforceable rule wants one spelling. A
test cannot decide whether a document is superseded, but it can hold every document in the archive folder to
`Kind: Reference`, and that only works if there is one folder to name.

**Leave the unreachable documents unreachable and drop the rule.** Rejected: 34 of 160 documents under `docs/` were
reachable from nothing, including `docs/STATUS.md`, which is the file a new session is told to read.

## Risk

A reader following a link in an old record to `docs/history/...` finds nothing. All seven references in the tree were
updated, including the ones inside `DECISIONS.md`, `docs/HANDOFF_ARCHIVE.md` and an evidence note, on the view that a
maintained path in an archived record is better than a faithful dead one; the original path is still in Git history for
anyone doing archaeology.

The reachability rule can be satisfied badly, by listing every new document in the index until the index is a flat list of
160 files. A folder link counts as a link to every Markdown file under it, which is what keeps the record folders out of
the index one entry at a time; the rule is a floor, not a filing system.

## Reversibility

Reversible with one `git mv` and the same seven edits. Nothing outside this repository refers to `docs/archive/`: no
prepared project, no plugin manifest and no runtime constant names it, which is exactly the difference from the three
rolling archives.

## Evidence

`node scripts/docs.test.mjs` exit 0 on 2026-09-20, reporting 160 of 160 Markdown files under `docs/` reachable from
`docs/AUTOPILOT_START_HERE.md`; the same measurement before the index rows read 126 of 160.

`node scripts/docs.test.mjs --self-test` exit 0, six cases. The two new ones were each proved able to fail against a
mutant with that rule disabled, and each mutant killed only its own case: with the reachability failure suppressed, only
"a document nothing links to" was reported NOT caught; with the archive label check suppressed, only "a living document
filed under docs/archive/" was.

The contract claim was measured, not assumed: `grep` for `BACKLOG_ARCHIVE` and `HANDOFF_ARCHIVE` names
`packs/base/plugins/workflow/runtime/lib/config.mjs`, `.skilliton/config.json` and
`scripts/fixtures/prototype-v1/project-files.mjs` among seventeen and fifteen files respectively, while `docs/history`
appeared in seven files, none of them a runtime constant.
