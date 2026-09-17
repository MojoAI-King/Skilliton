# What Skilliton offers a team, and what is proven

Kind: Living. For the owner and anyone presenting Skilliton to an engineering lead. It covers how a company runs it, which value claims have evidence, the questions a skeptical lead asks, and the candidate next steps. Recorded 2026-09-16 from the owner's positioning discussion. This is not a second roadmap: the milestones are in [PLAN.md](../PLAN.md) section 7, and the whole path with diagrams is [HOW-IT-WORKS.md](HOW-IT-WORKS.md).

## How a company runs it

- **The package is the company's copy of this repository.** It is an ordinary git repository on the company's GitHub. Maintainers change it like any code: a branch, a pull request, review, then a signed release.
- **The marketplace is the catalog inside that copy** (`.claude-plugin/marketplace.json`). It lists the plugins people install, and `company init` gives it the company's name.
- **The plugins** are the base ones (workflow, guardrails, context-hygiene) plus the company's own. Each is a folder of skills, hooks and commands.
- **Developers never open the company repository.** They run `skilliton join` once and receive updates through their coding tool's plugin update, and `skilliton verify` shows whether what they run is what was approved.
- **Projects** get the company's instructions and records with `skilliton prepare`.

A company adds its way of working in five places:

1. The instruction template, `packs/base/plugins/workflow/templates/harness.md`: review policy, branch rules, things never to touch.
2. Its own skills: `new-plugin`, `new-skill`, or `import` for skills it already has.
3. Merge checks per repository: `.skilliton/delivery.json`.
4. Which security controls apply, and who decided.
5. Which plugins the team settings turn on: `templates/project-settings.json`.

## Company rules and personal flexibility

| Layer | What it holds | How strongly it holds |
|---|---|---|
| Company | The signed release: skills, hooks, the instruction template, the security catalog | Installed files are verified against the release. The merge gate is the hard line: it decides what reaches the shared branch |
| Project | `.skilliton/config.json` (record paths, checkpoint timing, handoff size, guardrail settings such as protected branches); `.skilliton/delivery.json`; existing documents, adopted rather than replaced | Merge checks are enforced on the shared repository. Other project settings shape what the assistant is told and reminded of |
| Personal | A developer's own Claude Code skills and settings (documented client behavior) | The person's choice |

The framing that holds up under questioning is to **guide on the laptop and enforce at the merge**. Local hooks and instructions help people do the right thing. A developer can still turn them off (for example `SKILLITON_GUARDRAILS=off` for a session), and they do not see other terminals. Only the merge gate stops code.

## Value claims and their evidence

| Claim | State | Evidence |
|---|---|---|
| Team cohesion and safe parallel work | **Built and measured**: records that do not collide across branches, a merge gate that rejects a change breaking only when combined, signed releases with verification, guardrails | [project rehearsal](../evidence/rehearsals/2026-09-16-projects/SUMMARY.md), `node scripts/autopilot-demo.mjs`, [company release rehearsal](../evidence/rehearsals/2026-09-16-company-release/SUMMARY.md), [machine rehearsal](../evidence/rehearsals/2026-09-17-machine/SUMMARY.md) |
| Work survives interruptions and handoffs | **Measured** in headless Claude Code sessions: the session start shows the handoff and project state, the stop hook asks for a checkpoint, and an interrupted session is named in the next | [live sessions](../evidence/rehearsals/2026-09-16-live-clients/SUMMARY.md) |
| Higher quality results from the workflow skills | **Measured for named eval cases only**: review and handoff scored 1.00 with a mean difference of 0.55 over no plugin, task 1.00 (difference 0.39), security 1.00 (difference 0.33). This is not a general code-quality score | PLAN.md section 6; `evidence/325d38f.../`, `evidence/e87d2d1.../` |
| Maintaining a project's records | **Built**: `maintain`, `handoff` and `review` skills, task records, indexes | the skills under `packs/base/plugins/workflow/skills/` |
| Cleaning up code (dead code, test gaps, error handling, dependency health) | **Not built**: the base skills cover process, not code cleanup | none |
| Time savings | **Not measured** | none |
| Cost savings | **Not measured, and not claimed.** The usage meter exists but has not yet reproduced its original numbers | DECISIONS.md O2 and O3 |

## Questions a skeptical lead asks

- **"Claude Code already has plugins and marketplaces. Why not share one CLAUDE.md?"** Distribution alone is not the value; the tools already distribute. A shared file does not keep work across interruptions and people. It does not prove each laptop runs the approved version or migrate project files safely with rollback. It does not test the combined result before merge, and it does not turn lessons into reviewed company changes.
- **"Does every laptop get only what the company approved?"** Three things keep a laptop on the company's copy rather than this public repository. **Where it points:** after `company init` the company's repository has its own marketplace name and points at itself; `join` (or, later, the managed settings file IT places) names only that repository, and each product repository's team settings name it too. **Who signed it:** the signers file comes from IT, not from the repository, and `verify` reports VERIFIED only for a release a company signer signed; installed straight from this public repository, the plugins are reported as not approved (machine rehearsal, step J8). **What is allowed at all:** Claude Code documents `strictKnownMarketplaces` in managed settings to allow only the company marketplace; not yet tested here. Not enforced at install time yet: clients follow the marketplace's branch until installs are pinned to a signed release (B18).
- **"Does it matter which terminal or editor people use?"** No for macOS and Linux: the plugins install into Claude Code's and Codex's own configuration, so they load the same in Apple Terminal, iTerm or an editor's terminal panel, and `join` puts a `skilliton` command in `~/.local/bin`. Windows is not supported yet, because the launcher and every hook are bash scripts (B30).
- **"Has anyone besides the author used it?"** Not yet. The new-builder rehearsal (M5) needs a real participant; its protocol is [rehearsals/NEW_BUILDER.md](rehearsals/NEW_BUILDER.md).
- **"Does it save time or money?"** Not measured, so no claim. The honest way to answer is a small comparison: the same few real tasks with plain Claude Code and with Skilliton, recording tokens (with `scripts/token-cost.mjs`, cross-checked), time, how often a person had to step in, and rework.
- **"What can a developer switch off?"** Everything on the laptop; see the layers above. The merge gate is the control that does not depend on the developer.
- **"What stops us from building this ourselves?"** Nothing: anyone can build tools now, and Skilliton is MIT-licensed, so building it yourselves can start from this repository. What a company would otherwise rebuild is not the skills but the parts that needed measurement and independent review here: releases that every laptop verifies against the company's signers; project migrations that preview, refuse unsafe cases and roll back; records that people on different branches write without conflicts; a merge gate that checks the combined result (a review found and closed a bypass by merge); client behavior the design depends on, measured rather than assumed (a managed settings file alone leaves a new person's first two sessions without the company plugins); and an allow list for endpoint security. The idea it serves is a uniform, harnessed environment where developers stay creative without breaking what the team shares. It is not a claim of time saved, which is not measured.
- **"If we take the repository and still have to write the skills, where is the value?"** Before a company writes anything, the base plugins already work: the `task`, `dispatch`, `review`, `handoff`, `maintain` and `security` skills and the session start, checkpoint and guardrails hooks, with the eval results above; `prepare` sets up any repository; `join`, releases and `verify` put the approved version on each laptop. A company writes only what is its own, such as its conventions and domain rules: `new-plugin` and `new-skill` scaffold them, `import` brings skills it already has after a scan, and `propose` turns a project's lessons into reviewed changes. The honest gap: today's base covers the way of working, not engineering skills for a company's stack. There is no code-cleanup pack (B17), no security audit yet (M10) and no starter packs for common stacks (B32), so a company starts with the workflow, not with ready-made skills for its code.
- **"Will it work with our endpoint security (ThreatLocker, endpoint detection, an inspecting proxy)?"** Not yet tested under any such product. [IT-ALLOWLIST.md](IT-ALLOWLIST.md) lists everything Skilliton starts, writes and reaches, derived from the code, so IT can write rules before rollout. The preflight check that names what a policy blocks (B27) is not built, and a run under a real policy needs a trial or test tenant (B29).
- **"Which setups are unproven?"** Codex lifecycle hooks, Windows, a private GitHub repository or another git host as the marketplace, and the GitHub merge-gate adapter on a hosted repository. [COVERAGE.md](COVERAGE.md) lists everything exercised and not.

## Next steps

The owner set the direction on 2026-09-16: **Phase 3, a company-wide autopilot**. [PHASE-3.md](PHASE-3.md) explains it, and PLAN.md section 7 holds the milestones (M8 to M14). The candidates listed here earlier are now part of it. The two-developer demonstration (B14) shows only what passed, the team view and the measured comparison are M14, installs pinned to release tags become M12's release rings, and the code-quality pack (B17) follows M10's audit pattern.

What changes for this page as Phase 3 lands: the claims table gains rows only when a milestone's evidence exists. Time and cost stay "not measured" until M14.
