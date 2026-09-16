#!/usr/bin/env bash
# Status line: Tier 1 quota logger. LOGS the payload (append), then displays it.
#
# Verified Sep 16, 2026 against the status line docs and public issues:
#   - Pro/Max payloads carry rate_limits.five_hour and rate_limits.seven_day,
#     each with used_percentage and resets_at, only after the first response of a session.
#   - Users have reported the rate_limits object absent at times. Absent is logged as null, never 0.
#   - The model-specific weekly window (/usage's third bar) is NOT in the payload (issue, Sep 3 2026).
#     If that is the ceiling you hit, record it by hand. This script cannot see it.
#
# Requires jq.

set -u
LOG="${SKILLGATE_USAGE_LOG:-$HOME/.claude/usage-log.jsonl}"
KEYS_LOG="${SKILLGATE_KEYS_LOG:-$HOME/.claude/statusline-keys-seen.log}"
mkdir -p "$(dirname "$LOG")"

PAYLOAD=$(cat)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 1. discovery: record the key set so you can SEE what the payload actually carries
KEYS=$(printf "%s" "$PAYLOAD" | jq -c '[paths(scalars)|join(".")]' 2>/dev/null || echo '["<unparseable>"]')
grep -qxF "$KEYS" "$KEYS_LOG" 2>/dev/null || echo "$KEYS" >> "$KEYS_LOG"

# 2. the verified fields, extracted explicitly; anything missing stays null
MODEL=$(printf "%s" "$PAYLOAD" | jq -r '.model.display_name // .model // "?"' 2>/dev/null)
CTX=$(printf "%s" "$PAYLOAD"   | jq -r '.context_window.used_percentage // empty' 2>/dev/null)
COST=$(printf "%s" "$PAYLOAD"  | jq -r '.cost.total_cost_usd // empty' 2>/dev/null)
QUOTA=$(printf "%s" "$PAYLOAD" | jq -c '{
  five_hour_pct: (.rate_limits.five_hour.used_percentage // null),
  five_hour_resets_at: (.rate_limits.five_hour.resets_at // null),
  seven_day_pct: (.rate_limits.seven_day.used_percentage // null),
  seven_day_resets_at: (.rate_limits.seven_day.resets_at // null),
  rate_limits_present: (.rate_limits != null)
}' 2>/dev/null || echo '{"rate_limits_present":false}')

# 3. log a compact line
jq -cn --arg ts "$TS" --arg model "$MODEL" --arg ctx "${CTX:-}" --arg cost "${COST:-}" --argjson quota "$QUOTA" \
  '{ts:$ts, model:$model, ctx_pct:($ctx|if .=="" then null else tonumber end), cost_reconstructed_usd:($cost|if .=="" then null else tonumber end), quota:$quota}' \
  >> "$LOG" 2>/dev/null

# 4. display
FH=$(printf "%s" "$QUOTA" | jq -r '.five_hour_pct // "n/a"'); SD=$(printf "%s" "$QUOTA" | jq -r '.seven_day_pct // "n/a"')
PRESENT=$(printf "%s" "$QUOTA" | jq -r '.rate_limits_present')
Q="5h ${FH}% | 7d ${SD}% | per-model wk: record from /usage"
[ "$PRESENT" != "true" ] && Q="quota: not in payload (log manually)"
FLAG=""
if [ -n "${CTX:-}" ] && [ "${CTX%.*}" -ge 60 ] 2>/dev/null; then FLAG=" CLEAR ME"; fi
printf "%s | ctx %s%% | %s%s\n" "$MODEL" "${CTX:-?}" "$Q" "$FLAG"
