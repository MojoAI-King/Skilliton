# A pinned file that has no room for its split gets a same-plugin sibling file

Kind: Living. Decision entry.

- **ID:** 2026-09-23-a-pinned-file-that-has-no-room-for-its-s-03da
- **Status:** proposed
- **Date:** 2026-09-23

## Decision

When N67 split `planPrepare` (lib/prepare.mjs) and `planDispatch`/`briefText` (lib/dispatch.mjs) into named helpers,
the helper bodies plus their signature/close-brace overhead pushed each file over its scripts/lint.test.mjs file-size
pin (prepare.mjs was already pinned at 610; dispatch.mjs was one named function's worth of body from the 600 ceiling).
Rather than raising a pin, or cramming every step into one or two oversized helpers, two of the extracted pieces moved
to a new same-plugin sibling file: lib/prepare-plan.mjs (`planGitignoreStep`, `checkPreparePlan`) and
lib/dispatch-brief.mjs (`briefText` and its own three section helpers, plus the `LANE_FILE`/`BRIEF_FILE`/`REPORT_FILE`
constants dispatch.mjs now re-exports so nothing importing them changes). This follows the repository's own precedent
(lib/delivery-install.mjs and lib/delivery-policy.mjs, split out of lib/delivery.mjs the same way, per that file's own
comments) and keeps the dependency one-directional: the new files import only what they need from the original
(readPath/inspectPath, or nothing at all) and the original never imports back, so there is no circular import.

## Why

A hard 600-line ceiling (scripts/lint.test.mjs's RUNTIME_MAX_LINES, extended to scripts/ and to plugin runtime files)
does not grow just because a refactor's own bookkeeping (a function signature, a closing brace, a destructured
`ctx`) needs a few more lines than the code it replaces. Splitting one long function into several correctly named
ones is exactly what N66/N67 ask for, but it is never free: each new function costs at least a signature line and a
closing brace, and a shared `ctx` object costs a destructuring line per function that reads it. On a file already at
or near its ceiling, that overhead alone can tip it over, independent of whether the split itself was warranted.

## Alternatives rejected

- Raising the pin in scripts/lint.test.mjs: the file itself says "do not raise a number here. Raising one is how a
  ceiling stops being one" (decision 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d covers the same
  ceiling). Raising it to fit a refactor's own overhead would be exactly the drift the ratchet exists to prevent.
- Fewer, larger helper functions inside the same file: tried first for planPrepare (5 functions merged down to 3,
  then 2). It worked for the 80-line-per-function ceiling but not for the file-size ceiling: prepare.mjs was still
  14 lines over 610 after the merge, and the remaining single "build every item" function was itself 84 lines,
  over N66's own new 80-line function ceiling. Merging further would have produced one large, differently-shaped
  function exactly like the one N67 exists to remove.
- Reformatting unrelated, unchanged code elsewhere in the file to claw back lines: rejected as out of scope (the
  brief says "wrap the long lines only in the functions you split") and as a bad trade of clarity for a line count.

## Risk

A second file per split concern adds one more file to read when following a change, and a reviewer has to know the
sibling exists. Mitigated by naming it after the file it was split from (prepare-plan.mjs, dispatch-brief.mjs, matching
delivery-install.mjs/delivery-policy.mjs) and by a comment at the top of each new file saying why it exists and what
it must not import back.

## Reversibility

Fully reversible: the moved functions could be inlined back into the original file at any point a future split (or a
drop in unrelated content) frees up room under the ceiling; nothing about their shape depends on living in a separate
file.

## Evidence

node scripts/lint.test.mjs: passes (79 plugin runtime files, 17 pinned above the 600-line ceiling, prepare.mjs and
dispatch.mjs both now under it unpinned). node scripts/lint-shape.test.mjs: passes (79 files, 69 line-length pins, 8
function-length pins, all six N67 functions' pins removed as they dropped under 80 lines). node --test
scripts/dispatch.test.mjs: 23/23 pass, including regex assertions on the exact brief text briefText now builds
across three helper functions in lib/dispatch-brief.mjs. node scripts/checks.mjs --only for "Prepare, migrate,
remove", "Machine setup with join", "Releases, signed approval", "Rename to Skilliton", "Dispatch (lanes,
worktrees...", and "Tasks, checkpoints, status and lifecycle hooks": all PASS.
