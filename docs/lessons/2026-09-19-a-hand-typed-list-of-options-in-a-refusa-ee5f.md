# A hand-typed list of options in a refusal loop accepts a new option silently everywhere it was left out

Kind: Living. Lesson entry.

- **ID:** 2026-09-19-a-hand-typed-list-of-options-in-a-refusa-ee5f
- **Status:** accepted
- **Date:** 2026-09-19

## What broke

`skilliton task list --request words` exited 0 and ran normally after `--request` was added to `task start`. The new test expecting `--request is not used by task list` failed on the first run.

## The mechanism

`commands/task.mjs` refuses an option a subcommand does not use by looping over a literal list of option names and checking each against `ALLOWED[sub]`. The new option was added to `parseArgs` and to `ALLOWED.start` but not to that literal list, so no subcommand ever looked at it. `parseArgs` accepted it, `ALLOWED` was never consulted for it, and the value was silently dropped everywhere but `start`, where it was read directly.

## The fix

The literal list in `packs/base/plugins/workflow/runtime/commands/task.mjs` (the `for (const key of [...])` loop in `run`) now includes `request`. The same list is still typed by hand; deriving it from the `parseArgs` flags and options is the next improvement when the file is next touched.

## The rule

When a command keeps an allow list per subcommand, the refusal loop iterates the same table the parser is built from, never a second copy. Any new option comes with a refusal test on a subcommand that does not take it, written before the option works.

## What now enforces it

`scripts/lifecycle.test.mjs` bad-invocations table: `task list --request words` must exit 2 with the refusal, and `task start` with a multi-line request must be refused. A second copy of the list is still possible; only the test catches a new omission.
