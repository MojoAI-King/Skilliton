# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-16 17:34 EDT

- **State:** Milestones are unchanged since the integration: M1 verified locally; M2 verified on Claude Code (live sessions and the offline rehearsal); M3 verified at install level on Claude Code and Codex (18 of 18); M4 verified locally; M5 not started because it needs a person. This session closed the follow-ups that needed no owner input, each with a check that fails on the previous code: `verify` treats a lost executable bit as attention, with installs measured on both clients (O18); one ID rule in `runtime/lib/ids.mjs`, where a third copy was found in `propose` (O20); `setup.mjs --undo` keeps later settings edits (O5); the drift check stops alarming on the default setup (O4); `scrub-check.sh --history` scans the branch being pushed and `--history-all` every ref, which CI runs (O13); rehearsals record a missing client as NOT RUN and never substitute another binary. Versions: workflow 0.3.1, guardrails 0.2.0, context-hygiene 0.1.3 (runtime and script changes only; skill text and the instruction template are unchanged, so projects get no new migration). Full offline suite on this tree: 24 checks, all exit 0. Published: pushed to `main` on GitHub with this note; the previous push, 697e5e9, passed CI run 35149679005 with every step read. Installed: nothing from this marketplace in the owner's own Claude Code or Codex configuration; installs exist only in throwaway homes used by rehearsals and probes. Released: none. Verified: the rehearsal installs only.
- **Next:**
  1. Owner inputs, smallest first (docs/BACKLOG.md): `CODEX_HOME=<folder> codex login` once, then `node scripts/rehearsals/live-clients.mjs --claude <2.1.273 path> --codex <path> --codex-home <folder>` (B2); one login inside a fresh `CLAUDE_CONFIG_DIR` (B3); approval to create a private throwaway GitHub repository for the delivery adapter (B4); applicability decisions for this repository's 15 security controls (B7); a version and the owner's signing key for the first release (B6); a person for the M5 rehearsal (B1, docs/rehearsals/NEW_BUILDER.md).
  2. Without owner input: eval cases for the `task` and `security` skills (B10, paid; docs/MAINTAIN.md step 4); the guardrails env-file allowlist (O10).
- **Blocked:** M5 on a participant; Codex lifecycle hooks on an isolated login; the hosted delivery adapter on approval; a model session in a clean configuration on a login; savings claims on O2.
- **Watch out:** the first live Codex rehearsal used the default Codex home and left trusted-project entries for its two deleted temporary folders in `~/.codex/config.toml`; they were removed on 2026-09-16 (docs/LESSONS.md). The terminal `claude` is 2.1.92; use the editor-bundled 2.1.273 for evals and rehearsals, and pass it explicitly. Lane branches and worktrees are merged and can be removed; `codex/*` branches are superseded history. Paid checks: evals, the live probes, `live-clients.mjs`, `company-release.mjs --with-eval`.

## Earlier

### 2026-09-16 16:58 EDT
- **State:** The M1-M4 integration is merged on local `main` (workflow 0.3.0, guardrails 0.2.0, context-hygiene 0.1.2): the runtime lives in the workflow plugin; prepare, migrate, remove, tasks, checkpoints, status, entries, indexes, security evidence, releases, verify, trust and the delivery gate are built; this repository is prepared by its own runtime (layout 2) with one instructions migration applied. Every offline suite passes on the combined tree; CI runs them. Proved: M1 locally; M2 on Claude Code in real sessions; M3 at install level on Claude Code and Codex (18 of 18); M4 locally; workflow evals 4 of 4 at 0.3.0. PLAN.md section 7 and docs/AUTOPILOT_INTEGRATION.md carry the evidence. Nothing is released; see the commit message of the push for the published state.
- **Next:**
  1. Push `main` after `bash scripts/scrub-check.sh --history`, then read the CI run's step results.
  2. Owner inputs, each smallest first (docs/BACKLOG.md B1 to B7): a person for the M5 rehearsal; `CODEX_HOME=<folder> codex login` once for Codex hooks; one login in a fresh `CLAUDE_CONFIG_DIR`; approval for a throwaway GitHub repository; applicability decisions for this repository's security register; a first signed release.
  3. Follow-ups without owner input: O20 (one entry ID generator), O18 and O19 (verify policies), eval cases for the task and security skills.
- **Blocked:** M5 on a participant; Codex lifecycle hooks on an isolated login; the hosted delivery adapter on approval; savings claims on O2.
- **Watch out:** lane branches (`lane/*`, `worktree-agent-*`) and their worktrees under `.claude/worktrees/` are merged and can be removed; the Codex session's `codex/*` branches are superseded history. `scrub-check.sh --history` scans every local ref (O13). Paid checks: evals, `live-capability-probe.sh`, `rehearsals/live-clients.mjs`, `rehearsals/company-release.mjs --with-eval`. Run eval commands exactly as docs/MAINTAIN.md step 4 writes them.
