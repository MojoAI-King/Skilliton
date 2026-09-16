# Decisions

Kind: Living. Reconciled every working session. Written so the owner can supervise the work without reading diffs.

## Open items

| # | Item | Status | Next step |
|---|---|---|---|
| O1 | Claude Code on this machine is 2.1.92; PLAN.md assumes 2.1.269 or later for `claude plugin eval` and `claude plugin details`. Neither command exists on 2.1.92. | UNVERIFIED that an update provides them | Run `claude update`, then `claude plugin eval --help`; record the output here |
| O2 | The meter does not reproduce the known-correct Sep 14 to 15 figures ($407.68 top-level, $70.72 subagents). Closest measured scope (all project directories of the investigated work, cutoff Sep 15 22:14 Eastern): subagents $70.19 (0.7% under), top-level $446.54 (9.5% over). The investigation did not record its exact project scope or cutoff time, so the gap cannot be attributed yet. | OPEN, blocks the Tier 2 baseline | Recover the investigation's own scope and cutoff (owner), then re-run with `--project` and `--until`. Do not tune the meter toward the target. |
| O3 | "Batch" (the Tier 3 unit) has no written definition. | OPEN | Define before Day 4's first comparison; do not invent one to fill a table |
| O4 | `hooks/config-drift-check.sh` ships in the pack but nothing runs it, and it prints DRIFT whenever settings.json has no `model` key (a false positive on the default setup). | OPEN | Day 2 |
| O5 | `setup.mjs --undo` restores the last backup over settings.json, discarding any edits made after `--apply`; with no settings file before `--apply` it restores an empty file instead of deleting it. `--apply` replaces an existing statusLine rather than chaining it. | OPEN, known | Day 2 hardening (PLAN.md Day 2) |
| O6 | How SessionStart hook output reaches the model has not been observed in a live session. | UNVERIFIED | Fresh session with the plugin installed (Day 1, needs the owner at the keyboard) |

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

## 2026-09-16 Usage meter: price each record at its own model, and never drop a record silently
**Decision:** The meter prices every record at the rate of the model that produced it, streams transcripts line by line, and counts every record it cannot use (no ids, no timestamp, unparseable, unreadable file, unpriced model) in its output.
**Why:** Measured on real transcripts: one Sep 14 to 15 window contains five different models, and the old meter priced a whole day at the most common model's rate. One transcript on this machine is 543MB; the old meter could not read it into memory and skipped it inside a silent catch (the new meter reads 177,532 records where the old one read 118,754). A number built on silently dropped input gets believed.
**Alternatives rejected:** Keeping dominant-model pricing (wrong whenever models mix, which is normal); raising the read limit (the next transcript is bigger).
**Risk:** Prices change. The table names its source and date; a model not in the table is reported as INCOMPLETE rather than priced at zero. The Fable 5 cache-read rate is assumed at 0.1x and marked unverified.
**Reversibility:** EASY. Evidence: `node scripts/token-cost.test.mjs` (42 hand-computed checks); removing the dedup line or forcing one model's price turns it red.

## 2026-09-16 Pack status line logs to its own directory
**Decision:** The pack's status line writes to `~/.claude/skillgate/usage-log.jsonl`, not `~/.claude/usage-log.jsonl`.
**Why:** A developer may already run a status-line logger that writes a different record shape to the shared path (this machine does). Two schemas in one log make every later reading of it wrong.
**Alternatives rejected:** Matching the other logger's schema (couples the pack to one person's private script).
**Risk:** Tier 1 history is split across two files at the moment setup is applied. The baseline records the cut-over time.
**Reversibility:** EASY.

## 2026-09-16 Session-start hook matches the heading as a prefix, and reports when it finds nothing
**Decision:** The hook matches the checklist heading as the start of a line and prints a visible notice when the heading or its content is missing.
**Why:** Measured: on the real lessons file the shipped hook injected 1 byte, silently, because the real heading has a suffix and the match was exact. The fixture test passed anyway, because it tested a copy of the awk, not the shipped script. The test now runs the shipped script, and fails against the old hook.
**Alternatives rejected:** Telling users to set the exact heading (the failure mode stays silent for the next person who gets it wrong).
**Risk:** A prefix can match a longer heading than intended; only the first match is used.
**Reversibility:** EASY. Evidence: `evidence/day-1/hook-fixture.txt`; on the real file the fixed hook injects 19,232 bytes (the raw section is 19,233; command substitution strips its trailing blank line, measured).

## 2026-09-16 Status line reports its own failures
**Decision:** Without `jq` the status line says `jq not installed; quota NOT logged`; if the log cannot be written it shows `LOG WRITE FAILED`.
**Why:** Before this, both cases fell through to `quota: not in payload`, which blames Claude Code for a local problem, and the log write failed with its error discarded. Tier 1 depends on this log being real.
**Alternatives rejected:** Failing with a non-zero exit (a crashing status line is a blank bar, which is silence of a different kind).
**Risk:** None significant.
**Reversibility:** EASY. Evidence: `bash scripts/statusline.test.sh` cases (e) and (f), written first and seen failing on the old script.

## 2026-09-16 Parallel build lanes
**Decision:** Day 1 work was split into four lanes with disjoint files: the meter (done directly, because it is counting work), packaging, hook and status line, and the one-pager (three agents in separate git worktrees). Shared values were written literally into every brief, and the lanes were merged and reviewed together.
**Why:** The owner asked for parallel dispatch. Disjoint files made the merge conflict-free; dictated values kept the one-pager consistent with code written at the same time.
**Alternatives rejected:** Agents for the meter (quantitative work gets narrated instead of counted).
**Risk:** Lanes drift on anything not dictated. The combined review found two such cases (plugin descriptions overclaiming unwired features; stale log paths in older docs), both fixed.
**Reversibility:** EASY.
