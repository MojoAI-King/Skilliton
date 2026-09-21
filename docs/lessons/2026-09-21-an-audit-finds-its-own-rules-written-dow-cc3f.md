# An audit finds its own rules written down

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-an-audit-finds-its-own-rules-written-dow-cc3f
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

Nothing failed; a measurement during the maintenance pass said something the wave had not claimed. Run over the 47
files wave 7 changed, `skilliton audit` reported **0 findings and 6 allowed lines**, exit 0. Run over every file this
repository has ever changed (`--range <root commit>..HEAD`, 475 files), the same audit reported **41 findings**,
exit 1. Not one of the 41 is a real weakness.

## The mechanism

The rules are text patterns, and a pattern appears in four kinds of file that do not use it:

| Where | Findings | What the line actually is |
|---|---|---|
| `scripts/guardrails.test.sh` | 18 | the test that plants `--no-verify` and friends to prove the guardrail blocks them |
| `packs/base/plugins/guardrails/hooks/guard-bash.sh` | 9 | the hook itself, which must contain the patterns it refuses |
| `scripts/preflight.test.mjs` | 9 | planted token shapes the preflight scanner is tested against |
| `runtime/lib/trust.mjs`, `runtime/lib/preflight.mjs` | 3 | the shapes those modules scan for |
| `packs/base/plugins/guardrails/.claude-plugin/plugin.json` | 1 | the manifest sentence describing what the plugin blocks |

A scanner cannot tell a use from a mention. Only the person who wrote the line can, which is why the allow marker
takes a rule name and a reason rather than a bare suppression. The three high confidence secret shapes are reused from
`lib/collectors.mjs` for the same reason they were reused rather than copied: one set of shapes, one place they are
written, and every file that writes them down reads back as a finding.

## The fix

No code changed. The numbers are recorded in [docs/COVERAGE.md](../COVERAGE.md) where the audit's exercised state is
stated, and marking this repository's own 41 lines with `skilliton-audit: allow <rule> <why>` is
[docs/BACKLOG.md](../BACKLOG.md) B45, sized per file there. Until that is done, a change touching
`scripts/guardrails.test.sh`, `guard-bash.sh` or `scripts/preflight.test.mjs` would be rejected by a delivery gate
running the audit. This repository has no delivery policy of its own (B43), so nothing is blocked here today.

## The rule

Audit a change, never a tree. And before believing a scanner is usable, run it once over the whole repository and read
what it says about the repository's own defenses, because that is exactly where its patterns are written down. The
number that matters is not how many findings a scanner produces but how many of them a person would act on.

## What now enforces it

The audit has no whole repository mode: every run takes a range, the working tree against HEAD, or the refs a push
carries, which is the shape `docs/LESSONS.md` already demanded after a pre-push scan over `git rev-list --all` matched
a file nobody had written. The allow marker requires a rule name and a reason, so a suppression cannot be silent.
B45 holds the remaining work, with the per file counts above.
