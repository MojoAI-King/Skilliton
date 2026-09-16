# Handoff archive

Kind: Reference. The current handoff is `docs/HANDOFF.md`.

Superseded RESUME HERE notes, newest first. Moved here from docs/HANDOFF.md on 2026-09-16.

### 2026-09-16 15:29 EDT
- **State:** M1-M4 integration is in progress, run by one integrating session (Claude Code in VS Code). Local `main` holds the integration base `c3fec4b` (the runtime moved into the workflow plugin, `runtime/lib/config.mjs` as the one config contract, the command registry, docs/CONTRACTS.md integration contract v1) and measured client probes `4141e81` (docs/CLIENTS.md). Six implementation lanes are running in isolated worktrees on branches `lane/prepare`, `lane/security`, `lane/lifecycle`, `lane/release`, `lane/delivery`, `lane/guardrails-codex`. This commit updates the workflow skills and the harness template for commands those lanes are building. Nothing is pushed; nothing is released.
- **Next:**
  1. Integrating session: merge the lanes one at a time with the full suite, then bump plugin versions and wire CI.
  2. Apply the new harness to this repository; update README, ONE-PAGER, PLAN milestone states, DECISIONS and LESSONS from measured results.
  3. Rehearsals: fresh and adopted projects, interrupted-session recovery, two contributors, company release with an improved skill and a project migration, tamper and rollback, stale evidence, blocked defective combined change; Claude Code and Codex separately.
- **Blocked:** owner and human inputs, requested when reached: a person for the M5 new-builder rehearsal; one login in a clean Claude Code configuration for the clean-environment session; approval before any hosted GitHub rehearsal repository is created; a Codex session that trusts the plugin hooks. Historical usage inputs block cost claims only.
- **Watch out:** other sessions should not edit the runtime, contracts, skills, template, PLAN.md or DECISIONS.md until this integration lands; propose changes in a task record instead. Skills now name `skillgate task`, `checkpoint`, `record`, `index` and `security` commands that are "not built in this version" until their lanes merge. A local-path marketplace install copies git-ignored files (docs/CLIENTS.md), so keep raw eval results out of plugin folders.

### 2026-09-16 14:41 EDT
- **State:** All foundation code, tests, demo, prior verification, original design notes and build-goal instructions are now present in the main working tree. Start at docs/AUTOPILOT_START_HERE.md; no prior chat, branch checkout or sibling worktree is required. PLAN.md v4 remains authoritative. The standalone source is available, but existing CLI/plugin/lifecycle integration remains M1 work. This local import is not a published release.
- **Next:**
  1. Read docs/BUILD_GOAL.md, PLAN.md and docs/AUTOPILOT_INTEGRATION.md. The owner wants the complete M1-M5 implementation and acceptance proof. docs/GOAL_COMMAND.md provides a 1,369-character launcher after the earlier long prompt was rejected by the 4,000-character limit; saving it does not start a goal.
  2. Adapt the existing scripts/prepare.mjs, project-files.mjs and security-evidence.mjs through scripts/skillgate.mjs. Reconcile artifact config, result semantics, the single harness renderer, package-owned runtime and workflow readers before claiming M1 complete.
  3. Use scripts/autopilot-demo.mjs for the disposable standalone walkthrough and the paired preparation/evidence test files for regressions. See evidence/autopilot-foundation/import-validation.md for this import's checks.
  4. Continue M2-M5: actual client checkpoints/recovery, approved company updates and migrations, scoped security evidence plus trusted application checks, and a real new-builder rehearsal.
- **Blocked:** No missing source material blocks implementation. Actual interactive-client, clean-environment and human usability evidence still need those environments or participation. Historical usage inputs block cost claims only.
- **Watch out:** Foundation 23aae41 already included the security implementation and has now been imported; do not merge either prototype branch again. Original notes under docs/history/autopilot-foundation/ are historical. The current CLI still does not invoke Prepare or security status, and these scripts retain the prototype contracts until adapted. Never interpret source availability, local fixture success or evidence freshness as a completed autopilot or security certification.

### 2026-09-16 14:23 EDT
- **State:** PLAN.md v4 now aligns the shared build around the development autopilot. Main's existing plugins/CLI remain the implementation base. README, one-pager, shared contracts, client instructions and release design distinguish implemented behavior from the unintegrated preparation/security prototype and future work. This alignment is local; it does not publish a release or close implementation gates.
- **Next:**
  1. Start M1 using docs/AUTOPILOT_INTEGRATION.md and the target section of docs/CONTRACTS.md. One integrating session owns the CLI/config/harness interfaces before lanes implement them.
  2. Adapt foundation `codex/autopilot-foundation-0916` at `23aae41` into that CLI. It already includes `codex/security-evidence-0916`; do not independently merge both or copy their older plans over PLAN.md v4.
  3. Connect preparation, adopted record paths, Maintain/Review and task checkpoints; rerun integrated validation. Prototype results alone are not proof of main-branch behavior.
  4. Continue the approved-release/verify design and M3 company-fork rehearsal, including one skill improvement, one preserved project migration, update verification and recovery. Follow M2-M5 acceptance rather than the old day numbers.
- **Blocked:** Live interactive session-start/confirmation, clean-environment updates and Codex behavior still need rehearsal. O2/O3 historical usage inputs block cost claims only; they do not block core integration. The earlier O11 direction question is resolved; implementation remains open.
- **Watch out:** `scripts/evidence.mjs` measures skill evaluations; the foundation security runtime tracks project observations. Current doctor does not recognize prototype prepare config. Two managed instruction writers and differing exit meanings must be reconciled. Guardrails cover supported enabled Claude Bash calls, not all developer actions. Use disposable synthetic projects for destructive-command tests. No paid eval or live test was rerun during documentation alignment.

### 2026-09-16 14:20 EDT
- **State:** Day 1 code gates and Day 2's build list are done and pushed (`main` at 243afee plus this maintenance commit). Base pack: `context-hygiene` 0.1.2, `workflow` 0.2.4 (dispatch, maintain, handoff, review), `guardrails` 0.1.0; onboarding CLI `scripts/skillgate.mjs`; CI green on Linux. Guardrails proven to block a force-push in a live headless session (`evidence/live/`); workflow evals 0.98 with the plugin, mean difference 0.51 (`evidence/15b842e.../SUMMARY.md`). A Codex session has two unpushed branches in this repository (DECISIONS.md O11).
- **Next:**
  1. Owner: decide what happens to the Codex branches (`codex/security-evidence-0916`, `codex/autopilot-foundation-0916`); their evidence script may overlap `scripts/evidence.mjs` (O11).
  2. Owner: install the three plugins here (`claude plugin marketplace add MojoAI-King/Skilliton`, install `guardrails`, `workflow`, `context-hygiene`), start a fresh interactive session, confirm the handoff and guardrails lines appear, and try `git reset --hard` to see the `ask` prompt (O6, O7).
  3. Owner: recover the originating investigation's scope and cutoff so the meter can reproduce $407.68 / $70.72 (O2); read `/usage` by hand for the baseline.
  4. Day 3: rehearsal company fork (`new-skill`, `import`), team settings on a clean user with auto-update (O8), `skillgate release` and `verify` with tamper detection (`releases/SCHEMA.md`).
  5. Rewrite `docs/ONE-PAGER.md` for the whole company environment (labelled BEHIND).
- **Blocked:** O2 and O11 on the owner; O6 and the live `ask` check on a fresh interactive session.
- **Watch out:** the terminal `claude` is 2.1.92 and lacks `plugin eval`; the editor-bundled 2.1.273 binary has it. `scripts/scrub-check.sh --history` scans every local branch, including the Codex ones (O13). The name scan needs `~/.config/skillgate/denylist`. Evals and the live probe cost real usage. Run every gate as its own step (docs/LESSONS.md).

### 2026-09-16 14:00 EDT
- **State:** Day 1 code gates and most of Day 2 are done and pushed. The base pack has three plugins (context-hygiene, workflow with dispatch, maintain, handoff, review, and guardrails) and the onboarding CLI (`scripts/skillgate.mjs`). Guardrails were proven to block a force-push in a real session (`evidence/live/`); the workflow skills scored 0.98 with the plugin, a mean difference of 0.51 over no plugin (`evidence/15b842e.../SUMMARY.md`). Branch `main`, pushed.
- **Next:**
  1. Owner: install the three plugins on this machine (`claude plugin marketplace add MojoAI-King/Skilliton`, then install `guardrails`, `workflow`, `context-hygiene`), start a fresh session here, and confirm the handoff and guardrails lines appear at session start (open items O6, O7 ask path).
  2. Owner: recover the originating investigation's project scope and cutoff time so the meter can reproduce $407.68 / $70.72 (O2); then record the Tier 2 baseline.
  3. Owner: read `/usage` by hand (five-hour, weekly, per-model weekly) for the baseline.
  4. Day 3: rehearsal company fork (`new-skill`, `import`), team settings on a clean user with auto-update (O8), then `skillgate release` and `verify` with tamper detection.
  5. Rewrite `docs/ONE-PAGER.md` as the whole company environment one-pager (it still describes only context-hygiene).
- **Blocked:** O2 on the owner (investigation scope); O6 and the live ask check on a fresh interactive session.
- **Watch out:** the terminal `claude` is 2.1.92 and lacks `plugin eval`; use the editor-bundled 2.1.273 binary or update. `scripts/scrub-check.sh` needs `~/.config/skillgate/denylist`; without it the name scan reports NOT RUN. Evals and `scripts/live-guardrails-probe.sh` cost real usage.
