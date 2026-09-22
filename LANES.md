Base commit: 5b330f4

## Lane: preview-before-write   branch: lane/preview-0921   model: sonnet   context ceiling: 120000
N1. [FEATURE] B54: `import` previews by default and writes only with `--apply`: packs/base/plugins/workflow/runtime/commands/import.mjs: without --apply it lists what it would copy and where, writes nothing, and says to add --apply; with --apply it copies as today; the scan runs in both modes
N2. [FEATURE] B54: `new-skill` previews by default and writes only with `--apply`: packs/base/plugins/workflow/runtime/commands/new-skill.mjs: without --apply it shows the SKILL.md it would create and the version bump, writes nothing; with --apply it writes as today
N3. [TOUCH] The tests for both commands cover the preview and the apply path: scripts/skilliton.test.mjs: a preview run leaves the tree unchanged and names the files; an --apply run writes them; the existing assertions updated to pass --apply

## Lane: apply-sweep-test   branch: lane/sweep-0921   model: sonnet   context ceiling: 120000
N4. [FEATURE] B47: the --apply sweep as a committed test: scripts/prepare.test.mjs: in a prepared fixture, every command that takes --apply is run with --apply and no target, and the test asserts exit 2 with an unchanged tree for each form that is missing an argument, and exit 0 with an unchanged tree for harness, index, migrate and prepare; the list of forms is in the test with one line per command
