# A fix that hardens the writers it names leaves the next writer open

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-a-fix-that-hardens-the-writers-it-names-772e
- **Status:** accepted
- **Date:** 2026-09-24

## What broke

While re-reviewing the security records before 1.4.0, three writers were found writing outside the repository through a committed symbolic link. `usage screen --apply` appended its row to the file a linked `.skilliton/usage/ledger.jsonl` pointed at. `harness --apply` wrote its block into the file a linked `CLAUDE.md` pointed at. `project-settings --apply` rewrote the file a linked `.claude/settings.json` pointed at. Each exited 0 and said it had written the project's own file. `dispatch merge` would have done the same for a record folder linked outside.

## The mechanism

`appendFileSync`, `writeFileSync` with the `w` flag, and `statSync` all follow a symbolic link, so a check that the target "is a regular file" passes for a link to a regular file anywhere. A repository can commit a link, so cloning one and running a Skilliton command in it is enough. The 1.2.0 review found the same class in the gate log and the skill writers, and the fix hardened those writers by name (an lstat walk and `O_NOFOLLOW` in `lib/gate.mjs` openLog, a component check in new-skill and import). Nothing shared held the rule, so the usage ledger written two days later, and the older harness and settings writers the review never named, kept the plain calls.

## The fix

`linkedWriteProblem(root, rel)` in `packs/base/plugins/workflow/runtime/lib/core.mjs` reads every component below the repository root with lstat. A link that resolves outside the root or to nothing is refused, and so is a file with a second hard link; a link inside the repository is followed. `lib/harness.mjs` planHarnessFile, `commands/project-settings.mjs` and `lib/dispatch.mjs` applyMerge call it before reading or writing. The ledger has its own stricter check, `ledgerLinkProblem` in `lib/usage-ledger.mjs`, which refuses any link and appends through an `O_NOFOLLOW` descriptor.

## The rule

When a review finds a class of flaw, fix the class: put the rule in one shared function, route every existing writer through it, and look for the writers the review did not name. A fix applied only to the reported sites protects those sites and nothing written later.

## What now enforces it

`scripts/write-links.test.mjs` and `scripts/usage-ledger-links.test.mjs`, both in CI, each failing against the code before the fix. `scripts/write-sites.test.mjs` (B88, the same evening) lists every file write in the shipped plugins with the reason it cannot land outside, and fails on a new one; writing that list found five more writers without the check (dispatch's brief and task record, company init, new-plugin, release create, the delivery policy confirm), fixed in workflow 0.25.1 with `scripts/dispatch-links.test.mjs`.
