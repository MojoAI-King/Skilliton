# Decisions

Kind: Living. Reconciled every working session. Written so the owner can supervise the work without reading diffs.

## 2026-09-16 One development autopilot direction and integration contract

**Decision:** PLAN.md v4 is the single product authority. Keep the working main-branch CLI/plugins and integrate the locally tested preparation/security foundation into them. The owner wants prepared repositories, ongoing project knowledge and security evidence, and company-approved skill and repository updates as one cohesive experience.
**Why:** Parallel sessions implemented useful layers against different versions of the scope. Isolated worktrees prevented overwrites but did not resolve shared behavior, update authority or documentation ownership.
**Alternatives rejected:** Two onboarding stacks; treating evaluation evidence as project security evidence; automatically promoting every local lesson into company policy; merging old prototype plans beside a new master plan.
**Risk:** Documentation can describe a target before the code implements it. Current contracts and target contracts are labelled separately; M1-M5 close only on integrated behavior and recorded proof. Local guardrails and evidence freshness are not shared merge enforcement.
**Reversibility:** EASY for documentation; MODERATE once schemas and release migrations ship. No prototype code or hosted policy is changed by this alignment pass.
**Architecture:** One CLI and harness renderer; one adopted artifact map; package-owned executable helpers with repository-owned records; company approval before distribution; separate versioned project migrations; unique contributor records with integrator-owned indexes. Existing main CLI results remain stable, with typed adapters for prototype statuses. Detailed implementation seams are in docs/archive/AUTOPILOT_INTEGRATION.md and docs/CONTRACTS.md.
**Evidence:** Owner alignment request; comparison of main at 243afee with foundation at 23aae41; refreshed against cacf480. The foundation already contains the security branch's matching script/tests. The two evidence tools serve different purposes and output paths. Their combination still requires lifecycle, update and shared-check proof.
**Validation:** Documentation alignment passed the 142 existing CLI checks and 104 handoff-hook checks. Local links, code fences, exact managed-block/template equality and the handoff byte bound were checked. No model evaluations or live client rehearsals were rerun; implementation gates remain open.

## 2026-09-16 Keep all foundation material in the main working tree

**Decision:** Merge the existing standalone preparation/security scripts, their tests and demo into the local main checkout. Preserve the original plan, handoff and decision under docs/archive/autopilot-foundation/. Save the build-goal instructions and link every artifact from docs/README.md.
**Why:** The owner wants the next assistant to read and use all work from repository files without relying on chat history or discovering a separate worktree.
**Alternatives rejected:** Leaving code only on a local branch; replacing the aligned plan with older prototype instructions; claiming source availability completes the CLI and lifecycle integration.
**Risk:** A reader could mistake standalone prototype commands for the production onboarding path. README, handoff and integration instructions explicitly preserve the remaining M1 seams. The imported source remains unchanged from the tested foundation snapshot.
**Reversibility:** EASY for the import and documentation; no client configuration, hosted policy or production environment changes. Main's existing CLI/plugins are preserved.
**Evidence:** Source provenance `23aae41`; code and test bytes checked against that snapshot. New local validation is recorded in evidence/autopilot-foundation/import-validation.md. PLAN.md v4 remains authoritative.

## 2026-09-16 The Skillgate runtime lives inside the workflow plugin
**Decision:** The command line (every command, its engines and the harness template) moved into `packs/base/plugins/workflow/runtime/`, launched by `bin/skillgate` from an installed plugin and by `scripts/skillgate.mjs` from a company fork. Projects no longer receive a copied runtime.
**Why:** An installed plugin then carries exactly the code its release approved, a project never stores a path to a toolkit clone, and one version identifies both skills and runtime. Claude Code puts a plugin's `bin/` on the Bash tool's path (measured).
**Alternatives rejected:** Keeping the prototype's copied runtime in each project (copies drift and escape release verification); a separate runtime plugin (hooks in one plugin cannot find another plugin's path).
**Risk:** A company that edits the base template must reconcile that one file when taking upstream changes (CONTRACTS section 1). Moving the fork does not break a project: measured in the company release rehearsal (P2).
**Reversibility:** MODERATE.

## 2026-09-16 One integrating session, a frozen contract, six lanes
**Decision:** The integrating session wrote integration contract v1 (docs/CONTRACTS.md sections 9 to 15), committed the base, and ran six implementation lanes in isolated worktrees (prepare, security, lifecycle, release, delivery, guardrails under Codex), each with a fixed write set and a verified base commit. Lanes merged one at a time with the full suite after each merge.
**Why:** The owner asked for the whole autopilot, and the work split cleanly by files once the shared names and formats were fixed first.
**Alternatives rejected:** Letting lanes negotiate shared formats (the cause of the earlier two-stack drift); one serial implementation (hours slower with no quality gain).
**Risk:** A lane's green is not the merge's green. Measured: three lanes' tests assumed modules or template text their base did not have, and failed on the combined tree until they derived expectations from the build (fixed in integration commits; docs/LESSONS.md).
**Reversibility:** EASY.

## 2026-09-16 Template updates reach projects as receipted migrations
**Decision:** A change to the harness template shows up in a prepared project as migration `0100-instructions-<template hash>`: preview, backups, a receipt recording each block's hash, rollback, and a refusal when a block was edited by hand since Skillgate wrote it. `prepare` no longer rewrites an existing block in a prepared project.
**Why:** PLAN.md section 5 requires instruction changes to be versioned project migrations, not silent rewrites. Keying by the template's hash makes every template version one migration without hand-numbering.
**Alternatives rejected:** A numbered registry entry per template edit (easy to forget in a company fork); letting `prepare --apply` refresh blocks (no receipt, no rollback, no hand-edit check).
**Risk:** The first refresh of a project prepared before this change has no earlier receipt, so a hand edit inside the markers cannot be detected that once; the preview diff and the backup cover it, and the output says so.
**Reversibility:** EASY. Evidence: `scripts/migrate.test.mjs` (14 tests; disabling the hand-edit check fails its test); company release rehearsal M1.

## 2026-09-16 Release approval is a signed tag checked against signers kept outside the repository
**Decision:** A release is `releases/<version>.json` hashing every installable file; approval is an annotated SSH-signed tag `skillgate-release/<version>` naming the manifest's hash, verified against an allowed signers file each machine records with `skillgate trust add` outside every repository. Withdrawal is a signed `skillgate-withdrawn/<version>` tag.
**Why:** A field in a file anyone can push is a claim, not approval. Git's own SSH signing needs no server and works for a solo company and a large one alike.
**Alternatives rejected:** An approvers list inside the repository (the attacker can edit it); a hosted approval service (out of scope for local-first delivery).
**Risk:** The trust file is only as safe as the channel that delivers it; verification proves the installed bytes were approved, not that what was approved is safe (a reviewed but malicious hook would verify). Review of executable files stays the control.
**Reversibility:** MODERATE. Evidence: `scripts/release.test.mjs` (21); company release rehearsal, 18 of 18 on real Claude Code and Codex installs.

## 2026-09-16 The delivery check reads its policy from the protected branch, not from the push
**Decision:** The server-side check tests the pushed tip (the combined result) with the checks in `.skillgate/delivery.json` as it is on the protected branch before the push; any pushed commit that changes a policy path must carry an approver's SSH signature; the archive it tests is compared file by file with the commit; the protected set comes from the policy on the repository's default branch.
**Why:** A defective change must not be able to weaken the checks that would catch it. Measured by the lane: a pushed `.gitattributes` with export-ignore removed the tests from a plain archive, so the file-by-file comparison is required.
**Alternatives rejected:** Reading the policy from the pushed commit (self-approval); trusting client-side hooks (skippable with --no-verify).
**Risk:** A check that can never pass blocks the fix too; recovery is administrative (docs/DELIVERY.md). The GitHub adapter is documented, not rehearsed (O15).
**Reversibility:** MODERATE. Evidence: `scripts/delivery.test.mjs` (10 tests with real pushes); `scripts/autopilot-demo.mjs`.

## 2026-09-16 Security evidence: collectors, findings, and a tiered secret scan
**Decision:** Project security evidence gains applicability decided by a named person, expiry, collectors (tests, secrets, delivery policy), one backlog row per open finding, and a 15-control baseline catalog. The secrets collector records a gap only for specific shapes (private key block, provider token prefix, JSON web token); generic shapes alone record needs-human.
**Why:** Measured: the prototype's generic shapes matched 60 lines of this clean repository (hashes, fixtures), so a gap on any match would be noise that teaches people to ignore gaps.
**Alternatives rejected:** Gap on any match (noise); dropping the generic shapes (misses real assignments of secrets).
**Risk:** A real secret that only matches a generic shape waits for a person's review instead of showing as a gap (O22).
**Reversibility:** EASY. Evidence: `scripts/security-evidence.test.mjs` and `scripts/collectors.test.mjs` (52); docs/security-catalog-sources.md.

## 2026-09-16 The stop reminder measures from the later of the last checkpoint and this session's start
**Decision:** The Stop hook compares the working tree with the later of the last checkpoint and the first start of the current session, so work from before the session (a commit in a terminal) never triggers a reminder, and a compaction does not reset the baseline.
**Why:** Proposed by the lifecycle lane: measuring only from the last checkpoint reminded new sessions about changes they did not make.
**Alternatives rejected:** The latest session start (a compaction would hide unrecorded work).
**Risk:** None significant. Evidence: `scripts/lifecycle.test.mjs` (32; the baseline test fails when the first start is replaced by the latest).
**Reversibility:** EASY.

## 2026-09-16 Codex: the same plugins and instructions, refusals instead of confirmations, hooks not from plugins
**Decision:** Codex reads this repository's Claude Code marketplace and plugin manifests directly, so no separate Codex manifests are shipped. Guardrails refuses, with the reason, the commands it would ask about in Claude Code. Skillgate does not rely on hooks shipped inside a Codex plugin.
**Why:** Measured on Codex CLI 0.154.0-alpha.6.2: marketplace add, plugin install, skills and AGENTS.md in the prompt, and verify all work from the existing manifests; `codex features list` reports `plugin_hooks` as removed. Codex documents that a hook's "ask" is not supported and the tool call continues.
**Alternatives rejected:** Duplicate `.codex-plugin` manifests (two version fields to keep in step); letting asks through under Codex (silent permission).
**Risk:** Codex lifecycle hooks are unverified: a project hook did not load under `codex exec` with a per-run trust override, and the next run needs a logged-in isolated Codex home (O9). Client detection by input keys could misfire on a future Claude Code (O21).
**Reversibility:** EASY.

## 2026-09-16 A rehearsal improvement whose behavior test passed before the change was replaced, not tuned
**Decision:** The company release rehearsal's first improvement (review stops on a removed delivery check) was dropped when its eval passed before the change as well as after; the rehearsal now uses a company review rule the model cannot know without the skill (billing changes need the payments lead), and the rehearsal requires the eval to fail before and pass after.
**Why:** An improvement is only shown to work when its test can fail on the old version. The first attempt's result is kept in evidence/rehearsals/2026-09-16-company-release-attempt-1/.
**Alternatives rejected:** Tightening the grader until the old version failed (proves nothing about the change).
**Risk:** None. Cost: two eval runs of one case per attempt, about 0.22 USD each at list price.
**Reversibility:** EASY.

## 2026-09-16 Follow-ups closed without owner input
**Decision:** (1) `verify` treats a file its release marks executable that is not executable as attention (exit 1), naming it, while the plugin line stays VERIFIED because the bytes match; a bit the release does not have stays a note. (2) Task, decision and lesson IDs come from one module, `runtime/lib/ids.mjs`. (3) `setup.mjs --undo` puts back what `--apply` changed without discarding later settings edits. (4) The drift check reports DRIFT only when a declared model differs from what ran. (5) `scrub-check.sh --history` scans the branch being pushed and `--history-all` every ref, which CI runs. (6) The rehearsal scripts record a step whose client or isolated home is missing as NOT RUN, and a client path that was given but does not run stops the rehearsal instead of falling back to another binary on PATH. (7) `skillgate index` leaves a record without index markers alone while there is nothing to list, so an adopted DECISIONS.md or LESSONS.md no longer gains a "no entries yet" section beneath its own history; the section arrives with the first entry file. The workflow plugin is 0.3.1 and context-hygiene 0.1.3; skill text and the instruction template did not change, so projects receive no new migration and the 0.3.0 evals still describe the skills.
**Why:** Each was an open item (O18, O20, O5, O4, O13) that needed no owner input. A hook without its executable bit does nothing, silently; three copies of the ID rule accepted different names; undo overwrote a person's later settings edits; the drift check alarmed on the default setup; the pre-push scan failed or passed on other sessions' unpushed branches.
**Alternatives rejected:** TAMPERED for a mode difference (the bytes are the approved ones, and reinstalling fixes it); hashing modes into the tree hash (changes every recorded manifest); deleting the drift check (it is a documented manual diagnostic); scanning only the pushed branch in CI (every pushed branch of a public repository is published).
**Risk:** An install route that drops executable bits would now read as attention on every verify; both measured clients kept them. Proposal file names with a trailing or doubled hyphen in the slug, which the old `propose` pattern accepted, are now refused; no entry command produces them.
**Reversibility:** EASY.
**Evidence:** A clean install probe from a clone at 697e5e9 into throwaway homes: Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2 each kept all 11 executable files. Each new check fails on the previous code: release.test.mjs lost-bit case, records.test.mjs one-rule check, setup.test.mjs (8 of 30 fail on the old script), drift-check.test.sh (9 of 12), the scrub self-test, records.test.mjs adopted-record index case. Full offline suite on the combined tree: 24 checks, all exit 0.

## 2026-09-16 Eval cases for the task and security skills, and what their first run changed
**Decision:** The workflow plugin has two more eval cases: `task-start-records-work` (a plain request becomes a task record with acceptance criteria, through skillgate, with nothing built) and `security-status-honest` (asked whether an app is secure, the answer rests on the register, never claims secure or compliant, and records no applicability decision for the user). From the first run's transcripts: the task and security skills now run the plugin's own `bin/skillgate` when `skillgate` is not on the shell path; the task skill stops at the record when only set-up was asked and never edits a managed index list by hand; the runtime's PATH lookup skips entries it cannot inspect instead of failing as an internal error; this repository's eval command uses a sonnet judge. Workflow 0.3.3.
**Why:** In `claude plugin eval` runs the plugin's `bin/` is not on the shell path (measured), and the task skill told the model to continue by hand, contradicting the project instructions; two runs then did unrequested work (backlog, handoff, index, review) and one ran out of turns after `skillgate index` stopped on a sandbox stat error; the default judge failed replies that met the rubric (O12).
**Alternatives rejected:** Raising max_turns (hides the unrequested work); tightening the rubric until replies passed (tunes the grader to the skill); deleting the llm check (the reply is what a non-developer reads).
**Risk:** The cases run in the eval harness, which differs from a normal session (no `skillgate` on PATH, a sandbox); they do not replace the live sessions (evidence/rehearsals/2026-09-16-live-clients). The security case also passed before the change, so it does not show the security skill's new fallback line was needed.
**Reversibility:** EASY.
**Evidence:** evidence/06880a6.../task-start-records-work (0.89 with the plugin; the failing run, kept) and security-status-honest (1.00); evidence/e87d2d1.../task-start-records-work (0.94, default judge), task-start-records-work-sonnet-judge (1.00, difference 0.39) and security-status-honest (1.00, difference 0.33). `scripts/records.test.mjs` PATH case fails on the old lookup.

## Open items

| # | Item | Status | Next step |
|---|---|---|---|
| O1 | CLOSED 2026-09-16. The terminal `claude` is 2.1.92, but the editor-bundled binary is 2.1.273 and has `plugin eval`, `plugin details`, and `plugin init` (run here). No `claude update` needed for Day 2; the terminal binary stays older until the owner updates it. | CLOSED | Use the 2.1.273 binary for eval and details |
| O2 | CLOSED 2026-09-18. The meter reproduces the Sep 14 to 15 figures exactly: 1919 top-level requests at $407.68 and 439 subagent requests at $70.72, with the scope the reference used (UTC days, every project, every cache write priced at the 5m rate). Two mechanisms, neither a tuning: inside a duplicate group the first copy is written while the response streams and carries an output count of 1 or 2, and the meter kept it (measured over 1,794 groups: input never varied, the last copy always carried the largest output; for the window's subagents the kept copies held 2,070 output tokens against 505,419); and one `<synthetic>` message, written locally with no API call, was counted as a request. The 9.5% top-level gap was the reference's all-5m pricing, not the count. | CLOSED | `scripts/token-cost.test.mjs`: fixture copies with output 1, 2, 50 that fail under first-copy-wins; `--reference` asserts the four figures where the transcripts exist and reports NOT RUN elsewhere |
| O3 | "Batch" (the Tier 3 unit) has no written definition. | OPEN | Define before the first cost comparison; do not invent one to fill a table |
| O4 | CLOSED 2026-09-16. `hooks/config-drift-check.sh` is a manual diagnostic (its header says so; nothing runs it by design). It now reports DRIFT only when settings declare a model that differs from the latest transcript's; no declared model, `default`, invalid JSON or a missing jq say why nothing was compared. | CLOSED | `scripts/drift-check.test.sh` (12 checks, run by path; 9 fail on the previous script) |
| O5 | CLOSED 2026-09-16. `setup.mjs --undo` restores the original bytes only when settings.json is unchanged since `--apply` (a receipt records what was written); otherwise it puts back only `statusLine` and keeps later edits, removes a settings file `--apply` created, and refuses when `statusLine` changed afterwards. `--apply` still replaces an existing statusLine rather than chaining it, and says so before writing. | CLOSED | `scripts/setup.test.mjs` (30 checks; 8 fail on the previous setup.mjs) |
| O6 | CLOSED 2026-09-22. SessionStart output reaching the model: observed headless on Claude Code 2.1.273 with a probe plugin (evidence/live/2026-09-16-client-capability-probes.md) and with the real workflow plugin, where the model quoted the handoff and the Project state (evidence/rehearsals/2026-09-16-live-clients). Then observed in an interactive session: the VS Code extension 2.1.280, in this prepared repository with its plugins loaded at the session's start, ran the SessionStart hooks 3 times on resume and 5 times after a compaction, and the handoff and the Project state reached the model. The events measured there were resume and compact. | CLOSED | `evidence/live/2026-09-22-vs-code-extension-hooks.md` |
| O7 | Deny path CLOSED 2026-09-16 (force-push). Ask path: with nobody to answer, headless Claude Code denies it and the command does not run (probe C3; live rehearsal L3, where the control without guardrails lost the work). The confirmation prompt a person sees is not observed. | PARTLY CLOSED | A person runs `git reset --hard` in an interactive session in a disposable repo |
| O8 | Install, update, downgrade, verification and removal measured in a clean Claude Code configuration and a clean Codex home (company release rehearsal). Not observed: the team-settings trust and install prompt, `autoUpdate` at session start, and a model session in the clean configuration (it starts logged out). | PARTLY CLOSED | Owner logs in once inside a fresh `CLAUDE_CONFIG_DIR`; then observe autoUpdate across two session starts |
| O9 | Codex: marketplace, install, skills, AGENTS.md and verify measured. Lifecycle hooks not observed: `plugin_hooks` is removed in 0.154.0-alpha.6.2 and a project hook did not load under `codex exec` with a trust override. On 2026-09-22 a signed-in Codex 0.156.0 session ran in a prepared repository: AGENTS.md and the skills reached the model, and no Skilliton hook ran. That version still read the plugin's `hooks/hooks.json` (it warned about a timeout in it) while reporting `plugin_hooks` as removed (evidence/live/2026-09-22-codex-session.md). | OPEN | Test whether a hook that a person has trusted, shipped in a plugin, runs in Codex 0.156.0 |
| O10 | Guardrails' `.env.*` rule has no per-file allowlist; a team that commits `.env.development` on purpose can only turn off every secret-file check. | OPEN | Add an `allowSecretFiles` list to the guardrails config |
| O11 | CLOSED 2026-09-16: the foundation was adapted in place into the runtime (prepare, migrations, records, security); neither prototype branch was merged again; a real layout-1 project migrates and rolls back (scripts/migrate.test.mjs). | CLOSED | none |
| O12 | CLOSED 2026-09-16. The default judge (haiku) failed two with-plugin replies of the task case that met the rubric; the same case at the same commit with `--judge-model sonnet` passed all three with-plugin runs and failed a without-plugin reply that truly missed a rubric element. The recorded eval command now passes `--judge-model sonnet`. | CLOSED | evidence/e87d2d1.../task-start-records-work and task-start-records-work-sonnet-judge |
| O13 | CLOSED 2026-09-16. `scrub-check.sh --history` scans the commits the checked-out branch reaches (what pushing it publishes); `--history-all` scans every ref and is what CI runs, because a public repository publishes every pushed branch. | CLOSED | `scrub-check.sh --self-test` proves both scopes on a two-branch fixture and fails when the branch scope is widened |
| O14 | CLOSED 2026-09-16: the dispatch lane brief now checks `git merge-base --is-ancestor <base> HEAD`; the six lanes this session each verified their base before writing. | CLOSED | none |
| O15 | CLOSED 2026-09-21. The GitHub delivery adapter (`templates/github/skilliton-delivery.yml` with branch protection) was rehearsed on a throwaway hosted repository with a ruleset: a direct push was refused, and a defective pull request's check failed and its merge was blocked. A clean change merging, the merge queue and the policy-path branch were not run. | CLOSED | `evidence/live/2026-09-21-hosted-delivery-gate.md`; B4 in docs/BACKLOG_ARCHIVE.md |
| O16 | M5 needs a real person who has never used Skilliton. | OPEN | Owner schedules a participant; docs/rehearsals/NEW_BUILDER.md |
| O17 | CLOSED 2026-09-22. This repository has two signed releases: 0.9.0 (2026-09-21) and 1.0.0 (2026-09-22), each tagged `skilliton-release/<version>`, signed with the owner's SSH key and pushed. A fresh clone from GitHub read 1.0.0 as approved. | CLOSED | `releases/0.9.0.json`, `releases/1.0.0.json`; `evidence/live/2026-09-22-release-1.0.0.md` |
| O18 | CLOSED 2026-09-16. A file the release marks executable that is not executable keeps VERIFIED (the bytes match) but is named in `notRunnable` and makes `verify` exit 1; a bit the release does not have stays a note. Clean installs on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2 kept all 11 executable bits. | CLOSED | `scripts/release.test.mjs` (the lost-bit case fails when the new branch is disabled) |
| O19 | `verify` exits 2 when any release tag in the source does not verify, even a tag for another version. | OPEN (accepted for now) | Revisit if one bad tag blocks developers in practice |
| O20 | CLOSED 2026-09-16. Task, decision and lesson IDs come from `runtime/lib/ids.mjs` alone. Unifying found a third copy in `commands/propose.mjs` with a looser pattern (it accepted trailing and doubled hyphens); it was removed. | CLOSED | `scripts/records.test.mjs`: the rule's cases, and a structural check that fails when any other runtime module defines an ID pattern |
| O21 | Guardrails treats a top-level `model` key in hook input as Codex; a future Claude Code input with that key would turn confirmations into refusals (visible; `SKILLGATE_GUARDRAILS_CLIENT` overrides). | OPEN | Record real Codex PreToolUse keys in the Codex live run, then decide |
| O22 | The secrets collector's split between specific shapes (gap) and generic shapes (needs-human) is a judgment. | OPEN | Review after the first real application runs it |
| O23 | CLOSED 2026-09-16. The owner chose to keep the `SG-` security control IDs; M9 renames every other technical name, and no security record is rewritten. | CLOSED | docs/PHASE-3.md M9 |
| O24 | CLOSED 2026-09-16. After Claude Code and Codex, the next tool is Cursor, on the owner's Cursor account. The owner first chose Grok, then chose Cursor instead, since their Grok use is through Cursor and Grok Build needs a SuperGrok or X Premium Plus subscription. Further tools, Grok Build included, are ranked after the Cursor spike. | CLOSED | docs/PHASE-3.md order and Tool support |
| O25 | CLOSED 2026-09-22. The project's `autoCompactWindow` of 600000 is honored: the two automatic compactions on 2026-09-22 happened at 568433 and 569293 tokens, under the project value and far from the user setting of 1000000. The sessions that compacted near 170000 from 2026-09-18 to 2026-09-21 are not explained here and stay with B36 | CLOSED | `evidence/live/2026-09-22-compaction-window-measured.md` |
| O26 | CLOSED 2026-09-22. A lane writing through the shell is caught at merge, where the protocol stops a lane whose diff touches `mainOnlyPaths`, and not by the write guard, which covers the file-writing tools only | CLOSED | decision `2026-09-22-a-lane-writing-through-the-shell-is-caug-81e5` |
| O27 | CLOSED 2026-09-22. UserPromptSubmit reaches a plugin hook: measured with the installed workflow plugin in headless Claude Code 2.1.278 (`dispatch-suggested` in the journal). The same run found the prompt arrives as `prompt`, not the `user_prompt` the hooks reference named, so the note had never fired before workflow 0.20.0. The interactive extension is not measured separately | CLOSED | `evidence/live/2026-09-22-dispatch-automation-live.md` |
| O28 | CLOSED 2026-09-22. Measured outside this repository, over two public open-source repositories audited whole from an empty base in the scratch folder. A child-process library had 17 findings in 638 readable files, every one a `shell: true` in a test of its own shell option, and none in its source. A web framework had 0 findings in 214 files. The rules find their shapes where a project's subject is shells and stay quiet in a plain web framework. A project whose tests exercise shells needs allow markers before its delivery policy turns the gate on | CLOSED | docs/COVERAGE.md, the self-running audit |

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
**Superseded:** Skilliton is now the evolved product name. See [the current naming decision](docs/decisions/2026-09-16-skilliton-is-the-evolved-product-name-0be0.md). The original decision below is retained as history.

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

## 2026-09-16 Guardrails: a hook that checks every shell command, and says why when it stops one
**Decision:** The `guardrails` plugin's PreToolUse hook reads every Bash command the assistant is about to run and denies force-pushes to protected branches, skipped git hooks, and staging or committing secret-shaped files or content; it asks for confirmation before commands that throw away uncommitted work. Every stop carries a plain-language reason and what to do instead.
**Why:** These are the git mistakes that hurt teams most, and the people least able to recover from them are the non-technical builders this product is for. A hook runs every time, whatever anyone types, which an instruction cannot promise.
**Alternatives rejected:** Instructions only (not enforced); git server-side protection only (does not protect a local repository or explain anything in the moment; companies should still turn on branch protection as well).
**Risk:** False positives get a guard switched off. The `.env.*` rule blocks committed environment files a team may use on purpose (for example `.env.development`); today the only way out is turning off every secret-file check, which is too coarse (open item O10). Not covered, and stated in the skill: git run inside scripts, `bash -c`, `eval`, or aliases; `git -c core.hooksPath`; `--no-verify` on merge, rebase, or am; `push --delete`.
**Reversibility:** EASY. Evidence: `bash scripts/guardrails.test.sh` (246 checks; three broken copies of the hook each turn it red); live proof in `evidence/live/2026-09-16-guardrails-force-push.md`.

Details recorded from the lane's report, measured:
- Secret content is checked when files are staged (`git add`, `commit -a`, commits with paths), not only at commit time, because an assistant usually runs `git add x && git commit` as one command and at hook time nothing new is staged yet.
- What `git add -A` would stage is predicted with `git ls-files`, not `git add --dry-run`, which takes the index lock and fails when the lock is held.
- The command is split into segments by a small awk program, not by bash: bash 3.2 took 3.35 s on a 50KB command; awk finishes an 870KB heredoc in well under a second.
- The quick pre-check on raw hook input looks for the word `git` and allows for JSON escapes: a command on the second line arrives as `\ngit`, and an earlier version let exactly that through (found by the lane's own test).
- `.pub` key files are not treated as secrets; they are the public half of a key pair.
- When the hook cannot decide (no JSON reader, a folder it cannot resolve, more than 2000 files to scan, a crash), it asks rather than allows, and a crash after a deny keeps the deny.

## 2026-09-16 A live check ships with the product
**Decision:** `scripts/live-guardrails-probe.sh` runs a real headless Claude Code session against a throwaway repository to prove the guardrails hook blocks a force-push, with a `--control` run that must succeed without the plugin.
**Why:** Fixture tests prove the script's logic, not that Claude Code loads the plugin and honours the deny. Only a session proves that, and a company should be able to re-run it after any Claude Code update.
**Alternatives rejected:** Trusting the documentation (the thing being verified).
**Risk:** It costs a small amount of real usage each run, stated at the top of the script. The first run of the committed script failed to start a session (a flag swallowed the prompt) and reported NOT RUN instead of a false pass, because the script checks the session's exit status before judging the result.
**Reversibility:** EASY.

## 2026-09-16 CI runs every check on Linux, and the first run was read, not trusted
**Decision:** `.github/workflows/checks.yml` runs every offline check on each pull request and push to `main`.
**Why:** A company fork needs its skills checked the same way on every change, and the hooks had only ever run on macOS.
**Alternatives rejected:** Local checks only (nothing stops an unchecked merge).
**Risk:** A green run that checked nothing. The first run (GitHub run 35131047580, 36 seconds) was opened step by step: every suite printed its passing result, including guardrails 246 of 246 and the handoff hook 104 of 104 on Linux (bash 5.2, git 2.55), which closes the "only tested on macOS" items both hook lanes reported. The private name scan printed NOT RUN and INCOMPLETE with a warning annotation, never a pass.
**Reversibility:** EASY.

<!-- skilliton:index:decisions:start -->
Decision entries in `docs/decisions/`, sorted by ID. `skilliton index` writes this list from the entries; edit the entries, not the list.

| ID | Title | Status | Date |
|---|---|---|---|
| [2026-09-16-machine-setup-runs-from-a-clone-of-the-c-fceb](docs/decisions/2026-09-16-machine-setup-runs-from-a-clone-of-the-c-fceb.md) | Machine setup runs from a clone of the company repository, with a receipt | accepted | 2026-09-16 |
| [2026-09-16-new-decisions-and-lessons-in-this-reposi-35d6](docs/decisions/2026-09-16-new-decisions-and-lessons-in-this-reposi-35d6.md) | New decisions and lessons in this repository are entry files | accepted | 2026-09-16 |
| [2026-09-16-phase-3-is-a-company-wide-autopilot-and-2339](docs/decisions/2026-09-16-phase-3-is-a-company-wide-autopilot-and-2339.md) | Phase 3 is a company-wide autopilot, and every technical name becomes Skilliton | accepted | 2026-09-16 |
| [2026-09-16-roadmap-after-m5-make-it-yours-one-comma-b003](docs/decisions/2026-09-16-roadmap-after-m5-make-it-yours-one-comma-b003.md) | Roadmap after M5: make it yours, one command per machine, autopilot on arrival | accepted | 2026-09-16 |
| [2026-09-16-skilliton-is-the-evolved-product-name-0be0](docs/decisions/2026-09-16-skilliton-is-the-evolved-product-name-0be0.md) | Skilliton is the evolved product name | accepted | 2026-09-16 |
| [2026-09-16-the-rename-moves-projects-by-migration-r-a319](docs/decisions/2026-09-16-the-rename-moves-projects-by-migration-r-a319.md) | The rename moves projects by migration, refuses old machine setup, and keeps protection in force until a project moves | accepted | 2026-09-16 |
| [2026-09-17-enrollment-installs-claude-code-plugins-9cf3](docs/decisions/2026-09-17-enrollment-installs-claude-code-plugins-9cf3.md) | Enrollment installs Claude Code plugins with a managed drop-in plus a first-login install | accepted | 2026-09-17 |
| [2026-09-17-live-multiplayer-sessions-are-a-separate-b953](docs/decisions/2026-09-17-live-multiplayer-sessions-are-a-separate-b953.md) | Live multiplayer sessions are a separate companion project | accepted | 2026-09-17 |
| [2026-09-17-windows-is-in-scope-and-endpoint-securit-f76a](docs/decisions/2026-09-17-windows-is-in-scope-and-endpoint-securit-f76a.md) | Windows is in scope, and endpoint-security support is built without a product to test under | accepted | 2026-09-17 |
| [2026-09-17-windows-is-supported-through-git-for-win-cb9e](docs/decisions/2026-09-17-windows-is-supported-through-git-for-win-cb9e.md) | Windows is supported through Git for Windows, with one implementation of every hook | accepted | 2026-09-17 |
| [2026-09-18-a-git-call-s-environment-is-built-never-1fba](docs/decisions/2026-09-18-a-git-call-s-environment-is-built-never-1fba.md) | A git call's environment is built, never inherited | accepted | 2026-09-18 |
| [2026-09-18-a-hook-can-be-silenced-by-the-shell-that-14f7](docs/decisions/2026-09-18-a-hook-can-be-silenced-by-the-shell-that-14f7.md) | A hook can be silenced by the shell that starts it, and that is written down rather than defended | accepted | 2026-09-18 |
| [2026-09-18-one-plan-in-dependency-waves-with-count-687f](docs/decisions/2026-09-18-one-plan-in-dependency-waves-with-count-687f.md) | One plan in dependency waves, with count-based bars per area | accepted | 2026-09-18 |
| [2026-09-18-the-team-compaction-window-is-600000-own-e7ee](docs/decisions/2026-09-18-the-team-compaction-window-is-600000-own-e7ee.md) | The team compaction window is 600000, owner-chosen | accepted | 2026-09-18 |
| [2026-09-18-token-efficiency-ships-in-the-harness-an-a3f4](docs/decisions/2026-09-18-token-efficiency-ships-in-the-harness-an-a3f4.md) | Token efficiency ships in the harness: an enforced read guard, the rules in the block, a gate command, the compaction window, and a meter that reproduces its reference | accepted | 2026-09-18 |
| [2026-09-19-a-draft-is-a-separate-file-a-person-conf-a619](docs/decisions/2026-09-19-a-draft-is-a-separate-file-a-person-conf-a619.md) | A draft is a separate file a person confirms; prepare drafts from what the repository shows | accepted | 2026-09-19 |
| [2026-09-19-records-are-written-at-checkpoint-time-m-554d](docs/decisions/2026-09-19-records-are-written-at-checkpoint-time-m-554d.md) | Records are written at checkpoint time; maintain reconciles | accepted | 2026-09-19 |
| [2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d](docs/decisions/2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d.md) | A dependency-free in-repo lint, and a size ceiling that ratchets | accepted | 2026-09-20 |
| [2026-09-20-dispatch-creates-worktrees-and-refuses-t-2249](docs/decisions/2026-09-20-dispatch-creates-worktrees-and-refuses-t-2249.md) | Dispatch creates worktrees and refuses to reuse one, and the bound is written prose | accepted | 2026-09-20 |
| [2026-09-20-hooks-in-codex-are-instructed-not-enforc-a566](docs/decisions/2026-09-20-hooks-in-codex-are-instructed-not-enforc-a566.md) | Hooks in Codex are instructed, not enforced | accepted | 2026-09-20 |
| [2026-09-20-the-client-event-behind-each-of-the-thre-f6c2](docs/decisions/2026-09-20-the-client-event-behind-each-of-the-thre-f6c2.md) | The client event behind each of the three working routines | accepted | 2026-09-20 |
| [2026-09-20-the-merge-back-half-of-dispatch-the-lane-ef33](docs/decisions/2026-09-20-the-merge-back-half-of-dispatch-the-lane-ef33.md) | The merge-back half of dispatch: the lane's record is committed for it, and a warning is exit 1 | accepted | 2026-09-20 |
| [2026-09-20-the-rolling-archives-stay-beside-their-l-8264](docs/decisions/2026-09-20-the-rolling-archives-stay-beside-their-l-8264.md) | The rolling archives stay beside their living file; docs/archive is for superseded documents | accepted | 2026-09-20 |
| [2026-09-20-what-cursor-reads-and-what-a-skilliton-a-006f](docs/decisions/2026-09-20-what-cursor-reads-and-what-a-skilliton-a-006f.md) | What Cursor reads, and what a Skilliton adapter would have to write | accepted | 2026-09-20 |
| [2026-09-21-joining-a-machine-takes-one-file-the-com-53bd](docs/decisions/2026-09-21-joining-a-machine-takes-one-file-the-com-53bd.md) | Joining a machine takes one file the company hands out, not three facts typed by hand | accepted | 2026-09-21 |
| [2026-09-21-one-of-four-cleanup-skills-ships-because-879a](docs/decisions/2026-09-21-one-of-four-cleanup-skills-ships-because-879a.md) | One of four cleanup skills ships, because only one beat its own baseline | accepted | 2026-09-21 |
| [2026-09-21-pinning-pins-the-clone-because-a-client-2fa4](docs/decisions/2026-09-21-pinning-pins-the-clone-because-a-client-2fa4.md) | Pinning pins the clone, because a client's plugin download cannot be pinned | accepted | 2026-09-21 |
| [2026-09-22-a-clean-working-tree-gets-no-checkpoint-8302](docs/decisions/2026-09-22-a-clean-working-tree-gets-no-checkpoint-8302.md) | A clean working tree gets no checkpoint reminder at stop | proposed | 2026-09-22 |
| [2026-09-22-a-cold-review-gates-the-release-and-one-6ef8](docs/decisions/2026-09-22-a-cold-review-gates-the-release-and-one-6ef8.md) | A cold review gates the release, and one check list is read by a local runner | accepted | 2026-09-22 |
| [2026-09-22-a-lane-writing-through-the-shell-is-caug-81e5](docs/decisions/2026-09-22-a-lane-writing-through-the-shell-is-caug-81e5.md) | A lane writing through the shell is caught at merge, not by the write guard | accepted | 2026-09-22 |
| [2026-09-22-claude-opus-5-5-priced-in-the-token-mete-a0b7](docs/decisions/2026-09-22-claude-opus-5-5-priced-in-the-token-mete-a0b7.md) | claude-opus-5-5 priced in the token meter from the published pricing page, not guessed | proposed | 2026-09-22 |
| [2026-09-22-the-frozen-copies-stay-beside-the-migrat-a3d4](docs/decisions/2026-09-22-the-frozen-copies-stay-beside-the-migrat-a3d4.md) | The frozen copies stay beside the migrations that read them, and the security catalog keeps its identifier | accepted | 2026-09-22 |
| [2026-09-22-the-subprocess-teardown-stays-copied-in-a0d3](docs/decisions/2026-09-22-the-subprocess-teardown-stays-copied-in-a0d3.md) | The subprocess teardown stays copied in the gate and the delivery gate | accepted | 2026-09-22 |
| [2026-09-22-this-repository-has-no-formatter-and-the-4991](docs/decisions/2026-09-22-this-repository-has-no-formatter-and-the-4991.md) | This repository has no formatter, and the lint is what holds its shape | accepted | 2026-09-22 |
| [2026-09-22-token-direction-of-travel-counts-gate-ru-cda2](docs/decisions/2026-09-22-token-direction-of-travel-counts-gate-ru-cda2.md) | Token direction-of-travel counts gate runs and read-guard refusals by structural markers, not substring search | proposed | 2026-09-22 |
| [2026-09-23-a-pinned-file-that-has-no-room-for-its-s-03da](docs/decisions/2026-09-23-a-pinned-file-that-has-no-room-for-its-s-03da.md) | A pinned file that has no room for its split gets a same-plugin sibling file | proposed | 2026-09-23 |
| [2026-09-23-a-record-s-header-line-is-one-templated-7207](docs/decisions/2026-09-23-a-record-s-header-line-is-one-templated-7207.md) | A record's header line is one templated string, not a hardcoded Kind: prefix | proposed | 2026-09-23 |
| [2026-09-23-applicability-signals-match-import-shape-bcbd](docs/decisions/2026-09-23-applicability-signals-match-import-shape-bcbd.md) | Applicability signals match import-shaped code, not bare library names | proposed | 2026-09-23 |
| [2026-09-23-n47-secrets-allowlist-freshness-folds-in-419c](docs/decisions/2026-09-23-n47-secrets-allowlist-freshness-folds-in-419c.md) | N47 secrets allowlist freshness folds into the file manifest, not raw record sources | proposed | 2026-09-23 |
| [2026-09-23-the-night-s-release-is-1-1-0-not-1-0-1-b-46b5](docs/decisions/2026-09-23-the-night-s-release-is-1-1-0-not-1-0-1-b-46b5.md) | The night's release is 1.1.0, not 1.0.1, by the release skill's own rule | accepted | 2026-09-23 |
<!-- skilliton:index:decisions:end -->
