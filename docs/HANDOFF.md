# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-16 14:20 EDT

- **State:** Day 1 code gates and Day 2's build list are done and pushed (`main` at 243afee plus this maintenance commit). Base pack: `context-hygiene` 0.1.2, `workflow` 0.2.4 (dispatch, maintain, handoff, review), `guardrails` 0.1.0; onboarding CLI `scripts/skillgate.mjs`; CI green on Linux. Guardrails proven to block a force-push in a live headless session (`evidence/live/`); workflow evals 0.98 with the plugin, mean difference 0.51 (`evidence/15b842e.../SUMMARY.md`). A Codex session has two unpushed branches in this repository (DECISIONS.md O11).
- **Next:**
  1. Owner: decide what happens to the Codex branches (`codex/security-evidence-0916`, `codex/autopilot-foundation-0916`); their evidence script may overlap `scripts/evidence.mjs` (O11).
  2. Owner: install the three plugins here (`claude plugin marketplace add MojoAI-King/Skilliton`, install `guardrails`, `workflow`, `context-hygiene`), start a fresh interactive session, confirm the handoff and guardrails lines appear, and try `git reset --hard` to see the `ask` prompt (O6, O7).
  3. Owner: recover the originating investigation's scope and cutoff so the meter can reproduce $407.68 / $70.72 (O2); read `/usage` by hand for the baseline.
  4. Day 3: rehearsal company fork (`new-skill`, `import`), team settings on a clean user with auto-update (O8), `skillgate release` and `verify` with tamper detection (`releases/SCHEMA.md`).
  5. Rewrite `docs/ONE-PAGER.md` for the whole company environment (labelled BEHIND).
- **Blocked:** O2 and O11 on the owner; O6 and the live `ask` check on a fresh interactive session.
- **Watch out:** the terminal `claude` is 2.1.92 and lacks `plugin eval`; the editor-bundled 2.1.273 binary has it. `scripts/scrub-check.sh --history` scans every local branch, including the Codex ones (O13). The name scan needs `~/.config/skillgate/denylist`. Evals and the live probe cost real usage. Run every gate as its own step (docs/LESSONS.md).

## Earlier

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
