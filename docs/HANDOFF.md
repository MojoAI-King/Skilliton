# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-16 14:23 EDT

- **State:** PLAN.md v4 now aligns the shared build around the development autopilot. Main's existing plugins/CLI remain the implementation base. README, one-pager, shared contracts, client instructions and release design distinguish implemented behavior from the unintegrated preparation/security prototype and future work. This alignment is local; it does not publish a release or close implementation gates.
- **Next:**
  1. Start M1 using docs/AUTOPILOT_INTEGRATION.md and the target section of docs/CONTRACTS.md. One integrating session owns the CLI/config/harness interfaces before lanes implement them.
  2. Adapt foundation `codex/autopilot-foundation-0916` at `23aae41` into that CLI. It already includes `codex/security-evidence-0916`; do not independently merge both or copy their older plans over PLAN.md v4.
  3. Connect preparation, adopted record paths, Maintain/Review and task checkpoints; rerun integrated validation. Prototype results alone are not proof of main-branch behavior.
  4. Continue the approved-release/verify design and M3 company-fork rehearsal, including one skill improvement, one preserved project migration, update verification and recovery. Follow M2-M5 acceptance rather than the old day numbers.
- **Blocked:** Live interactive session-start/confirmation, clean-environment updates and Codex behavior still need rehearsal. O2/O3 historical usage inputs block cost claims only; they do not block core integration. The earlier O11 direction question is resolved; implementation remains open.
- **Watch out:** `scripts/evidence.mjs` measures skill evaluations; the foundation security runtime tracks project observations. Current doctor does not recognize prototype prepare config. Two managed instruction writers and differing exit meanings must be reconciled. Guardrails cover supported enabled Claude Bash calls, not all developer actions. Use disposable synthetic projects for destructive-command tests. No paid eval or live test was rerun during documentation alignment.

## Earlier

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
