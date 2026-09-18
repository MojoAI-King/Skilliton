# Usage baseline (Tier 2)

Kind: Living. Optional usage-measurement workstream; its blockers do not block the core autopilot milestones in PLAN.md.

STATUS: NOT YET RECORDED; no longer blocked (2026-09-18). The meter passes its fixture test and reproduces the known-correct real-window figure on the machine that holds those transcripts (`node scripts/token-cost.test.mjs --reference`; DECISIONS.md O2, closed). Recording it writes this machine's per-day reconstructed cost into a public repository, which is the owner's decision, not a session's; until then the baseline is the reference window itself (UTC 2026-09-14 to 15: 1919 top-level and 439 subagent requests). A baseline written after a change is not a baseline.

## How to fill this in

0. This baseline is taken AFTER the SessionStart hook fix, which already shipped in the live project. The hook's own before-and-after is reproduced by `scripts/hook-fixture.test.sh`, not by this baseline.
1. Confirm `node scripts/token-cost.test.mjs` passes, then confirm `scripts/token-cost.mjs` reproduces the known-correct figure for Sep 14 to 15 ($407.68 top-level / $70.72 subagents). If it does not, fix the meter first; do not record a baseline with an untrusted meter.
2. Run: `node scripts/token-cost.mjs 2026-09-01 2026-09-15 > docs/usage-baseline-raw.txt`
3. Record the script version: `git rev-parse HEAD` and the sha256 of scripts/token-cost.mjs.
4. Record the Tier 1 numbers from the Usage screen by hand: five-hour %, weekly %, any model-specific sub-ceiling %, and their reset times.
5. Fill the scorecard baseline column below from the transcripts, not from memory.

## Recorded

| Field | Value |
|---|---|
| Window | |
| Meter commit | |
| Meter sha256 | |
| Timezone | America/New_York |
| Five-hour % at record time | |
| Weekly % at record time | |
| Per-model weekly % (from /usage, by hand; not in status line payload) | |
| Reset times | |

## Usage scorecard baseline (fill from transcripts)

| Fix | Counter | Baseline value | Source query |
|---|---|---|---|
| Hook fix | Starting context tokens | | |
| No large file reads | Results over 50KB per batch | | |
| Idle-gap discipline | Cache writes 50K+ tokens per batch | | |
| Idle-gap discipline | Share following a TTL-expiring gap | | |
| Gate wrapper | Gate bytes entering context | | |
| Subagent discipline | Subagent share of spend | | |
