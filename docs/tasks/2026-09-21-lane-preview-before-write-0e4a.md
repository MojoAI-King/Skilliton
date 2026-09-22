# Task: Lane preview-before-write

Kind: Living. Task record.

- **ID:** 2026-09-21-lane-preview-before-write-0e4a
- **State:** merged
- **Branch:** lane/preview-0921
- **Owner:** unassigned
- **Updated:** 2026-09-22T02:30:19.844Z

## Request

LANES.md, dispatched 2026-09-21: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N1. [FEATURE] B54: `import` previews by default and writes only with `--apply`: packs/base/plugins/workflow/runtime/commands/import.mjs: without --apply it lists what it would copy and where, writes nothing, and says to add --apply; with --apply it copies as today; the scan runs in both modes
- [x] N2. [FEATURE] B54: `new-skill` previews by default and writes only with `--apply`: packs/base/plugins/workflow/runtime/commands/new-skill.mjs: without --apply it shows the SKILL.md it would create and the version bump, writes nothing; with --apply it writes as today
- [x] N3. [TOUCH] The tests for both commands cover the preview and the apply path: scripts/skilliton.test.mjs: a preview run leaves the tree unchanged and names the files; an --apply run writes them; the existing assertions updated to pass --apply

## Decisions

not yet written

## Checkpoints

### 2026-09-22T02:08:55.028Z

- **State:** N1-N3 done: import and new-skill preview by default and write only with --apply; tests cover both paths
- **Evidence:** node scripts/skilliton.test.mjs: all 197 checks passed; node scripts/lint.test.mjs: lint passed
- **Next:** none for this lane; hand back to the integration window for merge
- **Git:** lane/preview-0921 @ 7a30ce0, 1 uncommitted

## Handoff

- **State:** N1-N3 done: import and new-skill preview by default and write only with --apply; tests cover both paths. Evidence: node scripts/skilliton.test.mjs: all 197 checks passed; node scripts/lint.test.mjs: lint passed.
- **Next:** none for this lane; hand back to the integration window for merge
- **Blocked:** nothing
- **Watch out:** nothing known
