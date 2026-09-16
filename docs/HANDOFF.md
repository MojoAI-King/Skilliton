# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-16 14:00 EDT

- **State:** Day 1 code gates and most of Day 2 are done and pushed. The base pack has three plugins (context-hygiene, workflow with dispatch, maintain, handoff, review, and guardrails) and the onboarding CLI (`scripts/skillgate.mjs`). Guardrails were proven to block a force-push in a real session (`evidence/live/`); the workflow skills scored 0.98 with the plugin, a mean difference of 0.51 over no plugin (`evidence/15b842e.../SUMMARY.md`). Branch `main`, pushed.
- **Next:**
  1. Owner: install the three plugins on this machine (`claude plugin marketplace add MojoAI-King/Skilliton`, then install `guardrails`, `workflow`, `context-hygiene`), start a fresh session here, and confirm the handoff and guardrails lines appear at session start (open items O6, O7 ask path).
  2. Owner: recover the originating investigation's project scope and cutoff time so the meter can reproduce $407.68 / $70.72 (O2); then record the Tier 2 baseline.
  3. Owner: read `/usage` by hand (five-hour, weekly, per-model weekly) for the baseline.
  4. Day 3: rehearsal company fork (`new-skill`, `import`), team settings on a clean user with auto-update (O8), then `skillgate release` and `verify` with tamper detection.
  5. Rewrite `docs/ONE-PAGER.md` as the whole company environment one-pager (it still describes only context-hygiene).
- **Blocked:** O2 on the owner (investigation scope); O6 and the live ask check on a fresh interactive session.
- **Watch out:** the terminal `claude` is 2.1.92 and lacks `plugin eval`; use the editor-bundled 2.1.273 binary or update. `scripts/scrub-check.sh` needs `~/.config/skillgate/denylist`; without it the name scan reports NOT RUN. Evals and `scripts/live-guardrails-probe.sh` cost real usage.
