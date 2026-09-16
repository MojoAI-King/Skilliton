# Decisions

Kind: Living. Reconciled every working session. Written so the owner can supervise the work without reading diffs.

## Open items

| # | Item | Status | Next step |
|---|---|---|---|
| O1 | Claude Code on this machine is 2.1.92; PLAN.md assumes 2.1.269 or later for `claude plugin eval` and `claude plugin details`. Neither command exists on 2.1.92. | UNVERIFIED that an update provides them | Run `claude update`, then `claude plugin eval --help`; record the output here |
| O2 | The meter does not yet reproduce the known-correct Sep 14 to 15 figures (it scans every project on the machine, and input and output prices are null). | OPEN, blocks the Tier 2 baseline | Day 1, meter lane |
| O3 | "Batch" (the Tier 3 unit) has no written definition. | OPEN | Define before Day 4's first comparison; do not invent one to fill a table |
| O4 | `hooks/config-drift-check.sh` ships in the pack but nothing registers or calls it. | OPEN | Day 2 |

## 2026-09-16 Public repository with no names in it
**Decision:** The repo is public from its first push, and it contains no client names, no evaluator name, and no personal names, in files, commit messages, or author fields.
**Why:** It is meant to be forked by anyone. A name that reaches a public git history cannot be fully taken back, so the scrub happens before the first commit, not after.
**Alternatives rejected:** Publishing the plan as written (it named clients); keeping the repo private until the end of the week (the owner wants it open source now).
**Risk:** A name slips in through a later edit. `scripts/scrub-check.sh` fails on any denylisted name, on em or en dashes, and on home-directory paths, with `--history` covering every commit. Its denylist lives outside the repo, because the list is itself names. Without the denylist it says the name scan did not run and exits 2; it never reports a pass.
**Reversibility:** EXPENSIVE once pushed (history is public). Evidence: `bash scripts/scrub-check.sh --self-test`.

## 2026-09-16 MIT license, MojoAI as author
**Decision:** MIT, copyright MojoAI; commits are authored as MojoAI with a GitHub noreply email.
**Why:** MIT is the shortest permissive license and the easiest for a company to fork and adapt, which is the intended use. The machine's global git identity was a placeholder, so the repo sets its own.
**Alternatives rejected:** Apache-2.0 (adds a patent grant, longer; not needed for scripts and docs this size).
**Risk:** None significant.
**Reversibility:** MODERATE (relicensing later is possible for new versions only).

## 2026-09-16 Repository name Skilliton, product name Skillgate
**Decision:** The GitHub repository is `MojoAI-King/Skilliton`; the product, the marketplace (`skillgate`), and the docs keep the name Skillgate.
**Why:** The owner named the repo. Renaming the marketplace would change every install command in the plan for no user benefit.
**Alternatives rejected:** Renaming everything to Skilliton (churn across every doc and command).
**Risk:** A reader may not connect the two names. The README states both in its first lines.
**Reversibility:** EASY.
