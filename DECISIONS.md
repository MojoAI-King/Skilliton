# Decisions

Kind: Living. Reconciled every working session. Written so the owner can supervise the work without reading diffs.

## Open items

| # | Item | Status | Next step |
|---|---|---|---|
| O1 | CLOSED 2026-09-16. The terminal `claude` is 2.1.92, but the editor-bundled binary is 2.1.273 and has `plugin eval`, `plugin details`, and `plugin init` (run here). No `claude update` needed for Day 2; the terminal binary stays older until the owner updates it. | CLOSED | Use the 2.1.273 binary for eval and details |
| O2 | The meter does not reproduce the known-correct Sep 14 to 15 figures ($407.68 top-level, $70.72 subagents). Closest measured scope (all project directories of the investigated work, cutoff Sep 15 22:14 Eastern): subagents $70.19 (0.7% under), top-level $446.54 (9.5% over). The investigation did not record its exact project scope or cutoff time, so the gap cannot be attributed yet. | OPEN, blocks the Tier 2 baseline | Recover the investigation's own scope and cutoff (owner), then re-run with `--project` and `--until`. Do not tune the meter toward the target. |
| O3 | "Batch" (the Tier 3 unit) has no written definition. | OPEN | Define before Day 4's first comparison; do not invent one to fill a table |
| O4 | `hooks/config-drift-check.sh` ships in the pack but nothing runs it, and it prints DRIFT whenever settings.json has no `model` key (a false positive on the default setup). | OPEN | Day 2 |
| O5 | `setup.mjs --undo` restores the last backup over settings.json, discarding any edits made after `--apply`; with no settings file before `--apply` it restores an empty file instead of deleting it. `--apply` replaces an existing statusLine rather than chaining it. | OPEN, known | Day 2 hardening (PLAN.md Day 2) |
| O6 | How SessionStart hook output reaches the model has not been observed in a live session. | UNVERIFIED | Fresh session with the plugin installed (Day 1, needs the owner at the keyboard) |
| O7 | Guardrails must be proven to block in a live Claude Code session, not only against fixture JSON; the `ask` permission decision is unverified. | OPEN | Day 2 live probe |
| O8 | Team settings (`extraKnownMarketplaces`, `autoUpdate`, `enabledPlugins`) and auto-update are documented, not yet exercised on a clean machine or user. | OPEN | Day 3 |
| O9 | Codex support is documented (skills in `.agents/skills`, AGENTS.md, hooks with a trust review) but nothing has been run in Codex yet. | OPEN | Day 4 |

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

## 2026-09-16 Product direction v3: a ready-made way of working, forked and extended by each company
**Decision:** Skillgate's product is an opinionated base skill set (context and token hygiene, dispatch, maintain, handoff, plain-English review, git guardrails) that a company forks, extends with its own skills, and hands to every developer, technical or not, in one onboarding step. Distribution, auto-update, and release verification are how it gets there, not the headline. PLAN.md v3 records this.
**Why:** The owner described the goal as ending "Wild West" AI-assisted coding across a company, so that non-technical people using vibe-coding tools work the way the company wants without stress, and new hires get the whole environment at once. A usage-savings pack alone does not do that; a base way of working does.
**Alternatives rejected:** v2's usage pack as the product (too narrow for the goal); per-developer forks of the repository (every developer would have to merge upstream changes); a hand-built auto-update skill (a skill runs only when the model chooses to use it, while Claude Code's own marketplace auto-update runs on its own).
**Risk:** A broader week risks finishing nothing well. The schedule keeps a minimum credible submission at Day 3 (the fork-and-extend loop with verify and tamper), and every behavior is labelled enforced or instructed so the breadth never becomes overclaiming.
**Reversibility:** MODERATE. Evidence: owner conversation, September 16; PLAN.md v3.

## 2026-09-16 Building past the Day 1 gate, on the owner's instruction
**Decision:** Work continues into the base pack and onboarding before Day 1's owner-dependent items close.
**Why:** The owner asked directly to keep building. The Day 1 items still open (meter reproduction O2, the live status-line check, the hand-recorded quota numbers, observing the session-start hook O6) all need the owner at the keyboard or information only the owner has, so waiting would not close them sooner.
**Alternatives rejected:** Stopping at the gate until the owner is available (idle time with no change to the open items).
**Risk:** Later work could be described as resting on a Day 1 gate that never closed. Guard: those items stay in the open-items table, the baseline stays uncommitted, and no later demo claims a quota or savings result.
**Reversibility:** EASY.

## 2026-09-16 Base packs are read-only in a fork; companies extend beside them
**Decision:** A company fork never edits `packs/base/`; it adds `packs/<company>/plugins/<plugin>/`.
**Why:** Upstream improvements to the base then merge into a fork without conflicts, which is what keeps "fork it and make it yours" sustainable for more than a month. Claude Code namespaces plugin skills, so company skills and personal skills never collide either.
**Alternatives rejected:** Letting forks edit base skills (every upstream update becomes a merge the company has to resolve by hand).
**Risk:** A company that needs a base skill to behave differently has no clean hook for it. Answer for now: disable the base plugin in its team settings and ship its own version in its pack.
**Reversibility:** EASY.

## 2026-09-16 One project config file, and enforced versus instructed labels
**Decision:** Every component reads its settings from one `.skillgate/config.json`, and every behavior in the harness block and the docs is labelled enforced (a hook does it) or instructed (the model is told to).
**Why:** One file is easier for a company to manage than one per skill. The labels exist because instructions in `CLAUDE.md` steer a model and hooks bind it; a product sold as making AI coding safe for non-technical people has to say which is which.
**Alternatives rejected:** Per-skill config files; describing every behavior as automatic.
**Risk:** A reader skims past the labels. The one-pagers repeat them in plain language.
**Reversibility:** EASY. Evidence: docs/CONTRACTS.md, templates/harness.md.

## 2026-09-16 Hook scripts must be executable, and tests must run them the way Claude Code does
**Decision:** Every shell script a plugin runs by path is committed executable, and the tests invoke scripts by path, not only through `bash <script>`. A new packaging test (`scripts/packs.test.mjs`) fails on any non-executable hook script, any plugin missing from the marketplace, any skill without a valid `name`, and any description over 1024 characters.
**Why:** Measured: the `context-hygiene` session-start hook and status line were committed without the executable bit (mode 644) since the first commit, including the published one. `hooks.json` and `setup.mjs` run both by path, so in real use the hook would never have injected anything and the status line would have shown nothing, while every test passed, because every test ran them through `bash`. Separately, `claude plugin validate --strict` passes a plugin skill with no `name`, and `workflow` was not in the marketplace, so it could not be installed.
**Alternatives rejected:** Changing `hooks.json` to run `bash <script>` (hides the same mistake for the next script a company adds).
**Risk:** A company fork adds a script and forgets the bit. The packaging test catches it in CI; its self-test proves each check can fail.
**Reversibility:** EASY. Evidence: `node scripts/packs.test.mjs --self-test`; `bash scripts/hook-fixture.test.sh --hook <non-executable copy>` exits 1.

## 2026-09-16 Onboarding CLI: doctor, harness, project-settings, new-skill, import
**Decision:** `scripts/skillgate.mjs` is the one onboarding tool. `doctor` writes nothing and says in plain English what is working and what to do next; `harness` manages the instructions block in `CLAUDE.md` and `AGENTS.md` between markers; `project-settings` writes the team settings; `new-skill` and `import` add skills to a company pack and bump the plugin version.
**Why:** A new hire or a non-technical builder needs one place that tells them what is wrong and what to type next, and a tech lead needs to package skills without learning the plugin format.
**Alternatives rejected:** Separate scripts per task (more to learn); a hosted onboarding service (out of scope).
**Risk:** The tool reads Claude Code's local plugin records, whose format is undocumented, when `claude plugin list --json` cannot be used safely; it labels that output as such.
**Reversibility:** EASY. Evidence: `node scripts/skillgate.test.mjs` (142 checks, including runs proving the idempotency and outside-marker checks can fail).

Details recorded from the lane's report, measured unless stated:
- `doctor` does not run `claude plugin list` on a home where Claude Code never ran, because on 2.1.92 that command creates `~/.claude.json` and a backup; doctor must write nothing.
- `doctor` exits 1 only for required items (Claude Code found, marketplace added, base plugins installed and enabled, harness block current, config parses, tools that shipped hooks actually call). An editor and terminal version mismatch, auto-update, and team settings are warnings, so the tool does not cry wolf.
- `import` refuses when no denylist is configured, because names were not scanned. A denylist containing only comments is the explicit opt-out. Its secret patterns match prefixes, so a skill that merely mentions a key prefix is refused and must be reviewed by hand.
- `project-settings` never removes existing entries, replaces a marketplace source whole (never mixes two source types), and lists every value it changes before writing.
- `harness --undo` removes the block after a backup instead of restoring an old backup, because the rest of the file may have changed since.

## 2026-09-16 Shared backup root no longer breaks setup undo; scrub output never prints a match
**Decision:** `setup.mjs --undo` only considers timestamp-named backup folders. `scrub-check.sh` always prints `file:line`, never the matched text.
**Why:** Both found by the CLI lane, measured. `skillgate harness` writes backups under `harness/` in the same root as setup, and "harness" sorts after every timestamp, so setup's undo picked it as the newest backup and refused. Separately, grep omits the file name when it sees a single file, so a scan could print the matched name or home path itself, which is the text the scan exists to keep private.
**Alternatives rejected:** Moving setup's backups to a new folder (would orphan backups already taken).
**Risk:** None significant.
**Reversibility:** EASY. Evidence: `node scripts/setup.test.mjs` (18 checks; the regression checks fail against the previous setup.mjs).

## 2026-09-16 Denylist default moves to ~/.config/skillgate/denylist
**Decision:** The private name denylist defaults to `~/.config/skillgate/denylist` (still overridable with `SKILLGATE_DENYLIST`).
**Why:** Forks carry the product name, not this repository's name; a path named after the product is the one a company would expect.
**Alternatives rejected:** Keeping the repository-named path.
**Risk:** Anyone who created the old path must move the file. Only this machine had one; it was moved.
**Reversibility:** EASY.
