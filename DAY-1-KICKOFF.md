# Day 1 kickoff prompt (paste into Claude Code in this repo)

We are on Day 1 of PLAN.md. Read PLAN.md and CLAUDE.md first. Scope for this session is ONLY the Day 1 gate:

1. Run `node scripts/token-cost.test.mjs`. It must pass. Then run `node scripts/token-cost.mjs 2026-09-14 2026-09-15` and compare against the known-correct figures in docs/USAGE_BASELINE.md. If either fails, fix the meter (inspect the actual JSONL field names in ~/.claude/projects first; the script's field names are guesses, and the fixtures mirror those guesses). Do not proceed until both pass.
1b. Run `bash scripts/hook-fixture.test.sh` and commit its output as the reproducible before-and-after for the hook fix.
2. Only after step 1 passes: fill docs/USAGE_BASELINE.md completely, including the hand-recorded /usage numbers (five-hour, weekly, and the per-model weekly bar the status line cannot see).
3. Run `node scripts/setup.mjs` (show only), then `--apply`, start one session, and show me ~/.claude/statusline-keys-seen.log and the last line of ~/.claude/usage-log.jsonl. Report whether rate_limits.five_hour and .seven_day were present. Then run `--undo`, confirm settings.json is byte-identical to the backup, then `--apply` again and leave it on so Tier 1 logs for the rest of the week. Separately, read the per-model weekly percentage from /usage by hand and record it in docs/USAGE_BASELINE.md; the status line cannot see that one.
4. Point SKILLGATE_LESSONS at the real lessons file and verify the bounded checklist in a fresh session: byte count before and after, and that the block ends at the checklist.
5. Draft docs/ONE-PAGER.md from the template.

Do not build anything from Day 2 or later. Report anything unverified as unverified.
