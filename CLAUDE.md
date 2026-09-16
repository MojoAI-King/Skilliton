# Skillgate: session contract

Read PLAN.md before doing anything. It is the build contract for the week of September 16 to 23, 2026.

Rules for every session in this repo:
- Work one gated day at a time. Ask which day we are on if it is not stated. Do not build ahead of the current day's gate.
- Nothing silent, ever. A crashed check, a missing field, or an unverified assumption is reported as such, never rounded up to success.
- Do not invent Claude Code hook or plugin capabilities. If a behavior is not confirmed in the official docs or by running it, say "unverified" and propose the test.
- No dollar or percentage savings claims anywhere in this repo unless produced by scripts/token-cost.mjs and cross-checked. See PLAN.md Section 5.
- No em dashes or en dashes in any file.
- Do not touch client material. Public examples are sanitized copies only. No client, evaluator, or personal names anywhere in this repo; run scripts/scrub-check.sh before every commit.
