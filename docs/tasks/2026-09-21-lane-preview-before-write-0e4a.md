# Task: Lane preview-before-write

Kind: Living. Task record.

- **ID:** 2026-09-21-lane-preview-before-write-0e4a
- **State:** in-progress
- **Branch:** lane/preview-0921
- **Owner:** unassigned
- **Updated:** 2026-09-22T02:01:25.443Z

## Request

LANES.md, dispatched 2026-09-21: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N1. [FEATURE] B54: `import` previews by default and writes only with `--apply`: packs/base/plugins/workflow/runtime/commands/import.mjs: without --apply it lists what it would copy and where, writes nothing, and says to add --apply; with --apply it copies as today; the scan runs in both modes
- [ ] N2. [FEATURE] B54: `new-skill` previews by default and writes only with `--apply`: packs/base/plugins/workflow/runtime/commands/new-skill.mjs: without --apply it shows the SKILL.md it would create and the version bump, writes nothing; with --apply it writes as today
- [ ] N3. [TOUCH] The tests for both commands cover the preview and the apply path: scripts/skilliton.test.mjs: a preview run leaves the tree unchanged and names the files; an --apply run writes them; the existing assertions updated to pass --apply

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
