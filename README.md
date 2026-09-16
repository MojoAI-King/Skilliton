# Skilliton

This repository is Skilliton. The product inside it is **Skillgate**.

Kind: Living.

**Skillgate is a ready-made way of working for AI-assisted development.** It ships a base skill set that keeps codebases healthy, spends tokens well, never loses context between sessions or people, reviews work in plain language, and blocks the git mistakes that hurt. A company forks it, adds its own skills, and gives every developer, technical or not, the whole environment in one onboarding step. Improvements arrive by auto-update.

Built for Claude Code first; the skills use the open Agent Skills format that Codex also reads (see "Codex" below for what is verified).

Status: week-one build, September 16 to 23, 2026. `PLAN.md` is the build contract, `DECISIONS.md` records every choice in plain English, `docs/CONTRACTS.md` lists the names and formats the pieces share, `docs/HANDOFF.md` says where things stand, and `docs/LESSONS.md` records what went wrong and what now prevents it.

## Why this exists

Without it, every person's AI setup is different. Good skills get copied between projects by hand, and the copies drift: before this project, one in-house skill existed in about sixty copies across six versions, and nobody could say which was current. People who are new to coding lose work to a force-push, commit a key by accident, or start every session re-explaining where they left off. Skillgate makes one good way of working the default, and keeps it current.

## What is in the box

| Plugin | What it does | Enforced or instructed |
|---|---|---|
| `guardrails` | Blocks force-pushing a protected branch, skipping git hooks, and committing secret files; asks before destroying uncommitted work; explains every block in plain language | Enforced (a hook checks every shell command) |
| `workflow` | `handoff` saves where you are so the next session starts from it; `review` explains your changes and their risks before you commit; `dispatch` turns a pile of notes into verified parallel work lanes; `maintain` keeps the project's docs, decisions, and lessons current | Handoff shown at session start: enforced. Writing, review, dispatch, maintain: instructed |
| `context-hygiene` | Keeps sessions lean: a bounded session-start checklist, a status line that logs real quota, and habits that avoid the measured causes of wasted tokens | Hook and status line: enforced. Habits: instructed |

**Enforced** means a hook does it every time. **Instructed** means the model is told to do it, and usually will, but nothing forces it. Nothing instructed is described as guaranteed.

## For a company: fork it and make it yours

1. Fork this repository. Your fork is your company's skill marketplace.
2. Keep `packs/base/` as it is. Add your own skills beside it:

   ```bash
   node scripts/skillgate.mjs new-skill <your-plugin> <skill-name>
   node scripts/skillgate.mjs import ~/.claude/skills/<a-skill-you-already-use> --into <your-plugin>
   ```

   `import` refuses a skill that contains secret-shaped strings, personal paths, or names on your denylist.
3. Put the team settings into your product repositories, so anyone who opens one in Claude Code is offered your marketplace with auto-update on:

   ```bash
   node scripts/skillgate.mjs project-settings --marketplace-repo <your-org>/<your-fork> --apply
   ```

4. Every change to a plugin bumps its version. Installed copies only update when the version changes.

## For a new hire: get the company environment

In a company repository that carries the team settings, open it in Claude Code and trust the folder; you are offered the company marketplace and plugins. Otherwise:

```bash
claude plugin marketplace add <your-org>/<your-fork>
claude plugin install guardrails@skillgate
claude plugin install workflow@skillgate
claude plugin install context-hygiene@skillgate
```

Then, from a clone of the company fork, once per project:

```bash
node scripts/skillgate.mjs harness --dir <your project> --apply   # adds the "how we work here" block to CLAUDE.md and AGENTS.md
node scripts/skillgate.mjs doctor                                  # says, in plain language, what is working and what is not
node scripts/setup.mjs --apply                                     # optional: the quota status line
```

Updates are checked after a session starts and take effect in the next session.

## Codex

Verified in OpenAI's documentation (not yet exercised here): Codex reads skills in the same format from `.agents/skills/` in a repository and `~/.agents/skills/` for a user, reads `AGENTS.md` (which `harness` writes), and supports hooks with the same deny decision, after each hook is reviewed and trusted once. Codex's IDE extension has no plugins, so for Codex the skills are linked as plain folders.

## Requirements

Claude Code, Node.js, git, bash, and `jq` (the status line and several hooks use `jq`; without a JSON parser, each one says so instead of failing silently).

## Check everything yourself

```bash
node scripts/packs.test.mjs               # packaging: marketplace, manifests, skill names, executable hooks
bash scripts/guardrails.test.sh           # every guardrail rule, with safe commands that must stay allowed
bash scripts/handoff-hook.test.sh         # session-start handoff display
node scripts/skillgate.test.mjs           # onboarding CLI
node scripts/setup.test.mjs               # status line setup: apply and undo are byte-identical
bash scripts/hook-fixture.test.sh         # session-start checklist hook
bash scripts/statusline.test.sh           # status line logger
node scripts/token-cost.test.mjs          # usage meter: hand-computed fixture totals
node scripts/evidence.test.mjs            # eval evidence writer never leaks paths or model text
bash scripts/scrub-check.sh --self-test   # proves the public-safety gate can fail
```

Two checks use your Claude account and cost a little each run, so CI does not run them:

```bash
bash scripts/live-guardrails-probe.sh --control   # a real session: force-push to main is blocked, and goes through without the plugin
claude plugin eval packs/base/plugins/workflow --scaffold --no-publish --allow-tools Bash Write Edit --max-cost-usd 12
```

Eval results are summarized into `evidence/<commit>/` by `node scripts/evidence.mjs`; the live check's output is in `evidence/live/`.

## The usage evidence, honestly

The `context-hygiene` plugin came out of a real investigation into where an AI coding budget went. That investigation caught a 3.28x counting error in itself. The session-start fix is measured and verified. The corrected meter (`scripts/token-cost.mjs`) passes its fixture tests but does not yet reproduce the investigation's own real-window figure, so this repository makes no savings claim (`DECISIONS.md`, O2).

## Not built yet

`skillgate release` and `skillgate verify` (release pinning by commit SHA, and checking installed copies for tampering) are planned for Day 3. Nothing here should be read as claiming they work today. Also not yet exercised on a clean machine: the team settings and auto-update path, and anything in Codex.

## Why not just build this yourself?

You can. This exists so you do not start from zero: the base skills came out of real, daily use, the evidence behind them caught its own mistakes, and forking it is the intended path, not a workaround.

## Contributing

A pull request must pass every check above and `bash scripts/scrub-check.sh --history`. `scrub-check.sh` reads its denylist from outside the repository (`SKILLGATE_DENYLIST`); keep your own. Without one, the name scan does not run, and the script exits 2 instead of claiming a pass.

## License

MIT. See `LICENSE`.
