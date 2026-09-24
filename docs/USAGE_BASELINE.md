# Usage baseline (Tier 2)

Kind: Living. Optional usage-measurement workstream; its blockers do not block the core autopilot milestones in PLAN.md.

STATUS: NOT YET RECORDED; no longer blocked (2026-09-18). The meter passes its fixture test and reproduces the known-correct real-window figure on the machine that holds those transcripts (`node scripts/token-cost.test.mjs --reference`; DECISIONS.md O2, closed). Recording it writes this machine's per-day reconstructed cost into a public repository, which is the owner's decision, not a session's; until then the baseline is the reference window itself (UTC 2026-09-14 to 15: 1919 top-level and 439 subagent requests). A baseline written after a change is not a baseline.

**The Window row below is a placeholder, and every row under it is empty for that reason.** Nothing here is a recorded
baseline yet: the window has not been chosen. It is the owner's to choose because writing it fills this file with this
machine's own per-day reconstructed cost, in a public repository, for a stretch of days the owner names. The meter is
ready and its test passes; the decision is not a technical one. Until it is taken, quote the reference window in the
paragraph above and nothing from the tables below, and read the placeholder as "not measured", never as "zero".

## How to fill this in

0. This baseline is taken AFTER the SessionStart hook fix, which already shipped in the live project. The hook's own before-and-after is reproduced by `scripts/hook-fixture.test.sh`, not by this baseline.
1. Confirm `node scripts/token-cost.test.mjs` passes, then confirm `scripts/token-cost.mjs` reproduces the known-correct figure for Sep 14 to 15 ($407.68 top-level / $70.72 subagents). If it does not, fix the meter first; do not record a baseline with an untrusted meter.
2. Run: `node scripts/token-cost.mjs 2026-09-01 2026-09-15 > docs/usage-baseline-raw.txt`
3. Record the script version: `git rev-parse HEAD` and the sha256 of scripts/token-cost.mjs.
4. Record the Tier 1 numbers from the Usage screen by hand: five-hour %, weekly %, any model-specific sub-ceiling %, and their reset times.
5. Fill the scorecard baseline column below from the transcripts, not from memory.
6. For the per-batch view, run `skilliton usage` rather than reading the meter by hand: it runs the meter's own test
   first, then prints one row per batch. Since workflow 0.25.0 a batch ends at a maintain event, a closed task or a
   merge commit, and a row spans the exact instants between two boundaries, so a repository that merges lanes
   fast-forward gets rows (before, rows came from merge commits only, and this repository showed two rows and none
   after 2026-09-21). Each `maintain --apply` also appends the batch's token counts to the committed ledger
   `.skilliton/usage/ledger.jsonl`, so a row outlives the transcripts it came from; `skilliton usage summary` is the
   one place a period is compared with a baseline, and it says saved only when the usage screen agrees.

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
