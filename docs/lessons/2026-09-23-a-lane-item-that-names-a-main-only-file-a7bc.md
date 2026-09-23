# A lane item that names a main-only file gets half done

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-a-lane-item-that-names-a-main-only-file-a7bc
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

The docs-review lane of the 2026-09-23 batch was given item N77, which named README.md line numbers, while its brief listed README.md among the paths only the integration branch writes. The lane followed the brief's rule, did the INSTALL.md half, and reported the README half as a leftover; main applied it by hand at merge.

## The mechanism

`skilliton dispatch` writes every lane brief from LANES.md with the project's `dispatch.mainOnlyPaths` as a hard rule, and a lane agent obeys the rule over the item. An item that names a main-only file is therefore half an item by construction; nothing in dispatch checks an item's file list against that rule.

## The fix

The README half was applied on main in the commit after the docs lane merged (the N77 README commit). No code change yet.

## The rule

When writing LANES.md, put any edit to a `mainOnlyPaths` file in the Main window section, never in a lane item, and say in the ledger that main does it. If the same fix spans a lane file and a main-only file, split it into two items with two owners.

## What now enforces it

Nothing yet. A check in `skilliton dispatch` that refuses a lane item whose file list names a main-only path would; it is a backlog item, not built.
