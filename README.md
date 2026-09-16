# Skilliton

This repository is Skilliton. The product inside it is Skillgate.

Kind: Living.

Skillgate is a starter pack for shipping the skills, guardrails, and habits that make a team's AI coding tools work well, to every developer's environment, so the good behavior is automatic instead of tribal knowledge.

Status: week-one build, September 16 to 23, 2026. See `PLAN.md` for the full plan, gates, and what is verified versus still open. `DECISIONS.md` records every architectural choice in plain English.

## Why not just build this yourself?

You can. This exists so you do not start from zero. The flagship pack came out of a real, measured investigation on a real project, including a measurement error the investigation caught in itself and corrected. Forking this repo and making it yours is the intended path, not a workaround.

## Layout

```
PLAN.md                         the build contract; read it first
CLAUDE.md                       session rules for Claude Code in this repo
DECISIONS.md                    plain-English record of every architectural choice
LICENSE                         MIT
.claude-plugin/marketplace.json the marketplace catalog (marketplace name: skillgate; local, relative sources for now)
packs/context-hygiene/          the flagship pack
  plugins/context-hygiene/
    .claude-plugin/plugin.json
    skills/context-hygiene/SKILL.md
    hooks/hooks.json            SessionStart hook registration
    hooks/session-start-checklist.sh
    hooks/statusline-quota.sh   Tier 1: logs real quota, does not just display it
    hooks/config-drift-check.sh
    evals/                      claude plugin eval cases (results/ is gitignored)
scripts/setup.mjs               show / apply / undo the settings a plugin cannot set itself
scripts/token-cost.mjs          corrected usage meter; must pass its fixture test and reproduce a known figure
scripts/token-cost.test.mjs     fixture test with hand-computed totals
scripts/hook-fixture.test.sh    original vs repaired SessionStart awk on a sample file
scripts/fixtures/               the fixtures
scripts/gate.mjs                wraps your existing verify command, preserves exit status, logs full output
scripts/scrub-check.sh          public-safety gate: denylisted names, em or en dashes, home-directory paths
docs/USAGE_BASELINE.md          Tier 2: commit this BEFORE any fix ships
docs/ONE-PAGER.md               onboarding template
evidence/<sha>/                 eval results bound to a commit
releases/<pack>/<version>.json  release records (see releases/SCHEMA.md)
```

## Get the code

```
git clone https://github.com/MojoAI-King/Skilliton
cd Skilliton
```

## Quick start

From a clone (run inside the repository root):

```
claude plugin marketplace add ./
claude plugin install context-hygiene@skillgate
```

Straight from GitHub, without cloning (the `owner/repo` shorthand is documented for `claude plugin marketplace add`):

```
claude plugin marketplace add MojoAI-King/Skilliton
claude plugin install context-hygiene@skillgate
```

Installing gives you the skill and the SessionStart hook. It cannot give you the status line or project instructions, because a plugin's settings cannot set those. So run the setup step from a clone, which shows what it will change, backs up first, and can undo itself:

```
node scripts/setup.mjs            # show
node scripts/setup.mjs --apply    # write the statusLine key, after backing up
node scripts/setup.mjs --undo     # restore the last backup byte for byte
```

Then start a session and confirm the session-start checklist is bounded and the status line shows 5h and 7d percentages. The per-model weekly limit shown in `/usage` is not exposed to status lines; record it by hand.

## Check the meter before believing any number

```
node scripts/token-cost.test.mjs   # fixture totals; must pass
bash scripts/hook-fixture.test.sh  # original vs repaired awk, side by side
```

## Not built yet

`skillgate evidence`, `skillgate release`, and `skillgate verify` do not exist yet. They are planned for later in the week (see `PLAN.md`). Nothing in this README should be read as claiming they work. Today, `setup`, `gate`, and the meter exist only as the `scripts/*.mjs` files listed above.

## Pinning note

The marketplace catalog uses a relative-path source for local development. A released entry should instead use a `github` source with both `ref` (the tag) and `sha` (the exact commit), because a ref-only pin is silently mutable. `skillgate release` (not built yet) is meant to rewrite the entry that way.

## Contributing

A pull request must pass `bash scripts/scrub-check.sh --history` and the tests above (`node scripts/token-cost.test.mjs`, `bash scripts/hook-fixture.test.sh`).

## License

MIT. See `LICENSE`.
