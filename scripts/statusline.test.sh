#!/usr/bin/env bash
# Tests the status line quota logger (hooks/statusline-quota.sh) with synthetic payloads.
# All logs go to a temp dir; nothing under the real home directory is touched.
#
#   bash scripts/statusline.test.sh
#
# Exit 0: every assertion ok. Exit 1: at least one FAIL. Exit 2: NOT RUN (jq missing).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
SL="$root/packs/base/plugins/context-hygiene/hooks/statusline-quota.sh"

if ! command -v jq >/dev/null 2>&1; then echo "NOT RUN: jq missing"; exit 2; fi
if [ ! -f "$SL" ]; then echo "FAIL: status line script not found"; exit 1; fi

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fails=0
USAGE="$tmp/logs/usage/usage-log.jsonl"
KEYS="$tmp/logs/keys/statusline-keys-seen.log"

ok()   { echo "ok   $1"; }
bad()  { echo "FAIL $1"; fails=$((fails+1)); }
# check <label> <jq filter that must print true> <json>
check() {
  local got
  got=$(printf "%s" "$3" | jq -r "$2" 2>&1)
  if [ "$got" = "true" ]; then ok "$1"; else bad "$1 (jq said: $got)"; fi
}
contains() { case "$2" in *"$3"*) ok "$1";; *) bad "$1";; esac; }
lacks()    { case "$2" in *"$3"*) bad "$1";; *) ok "$1";; esac; }
run_sl()   { printf "%s" "$1" | SKILLITON_USAGE_LOG="$USAGE" SKILLITON_KEYS_LOG="$KEYS" bash "$SL" 2>&1; }

echo "== (a) payload WITH rate_limits, context 70"
A='{"model":{"display_name":"TestModel"},"context_window":{"used_percentage":70},"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1789000000},"seven_day":{"used_percentage":17,"resets_at":1789500000}}}'
disp=$(run_sl "$A"); rc=$?
echo "   display: $disp"
[ "$rc" -eq 0 ] && ok "(a) script exit 0" || bad "(a) script exit $rc"
[ -f "$USAGE" ] && ok "(a) usage log created (parent dir made)" || bad "(a) usage log not created"
lines=$(wc -l < "$USAGE" 2>/dev/null | tr -d ' '); [ "${lines:-0}" = "1" ] && ok "(a) exactly 1 log line" || bad "(a) expected 1 log line, got ${lines:-0}"
L=$(tail -1 "$USAGE" 2>/dev/null); echo "   logged: $L"
check "(a) quota.five_hour_pct == 42"            '.quota.five_hour_pct == 42' "$L"
check "(a) quota.five_hour_resets_at numeric"    '.quota.five_hour_resets_at == 1789000000' "$L"
check "(a) quota.seven_day_pct == 17"            '.quota.seven_day_pct == 17' "$L"
check "(a) quota.seven_day_resets_at numeric"    '.quota.seven_day_resets_at == 1789500000' "$L"
check "(a) quota.rate_limits_present == true"    '.quota.rate_limits_present == true' "$L"
check "(a) ctx_pct == 70"                        '.ctx_pct == 70' "$L"
contains "(a) display contains '5h'" "$disp" "5h"
contains "(a) display contains 'HANDOFF?'" "$disp" "HANDOFF?"
case "$disp" in *" HANDOFF? finish the step, write a handoff") ok "(a) display ends with the exact flag text";; *) bad "(a) display does not end with the exact flag text";; esac
lacks "(a) display has no 'CLEAR ME'" "$disp" "CLEAR ME"

echo "== (b) payload with NO rate_limits object, context 30"
B='{"model":{"display_name":"TestModel"},"context_window":{"used_percentage":30}}'
disp=$(run_sl "$B"); rc=$?
echo "   display: $disp"
[ "$rc" -eq 0 ] && ok "(b) script exit 0" || bad "(b) script exit $rc"
lines=$(wc -l < "$USAGE" 2>/dev/null | tr -d ' '); [ "${lines:-0}" = "2" ] && ok "(b) exactly 2 log lines after two runs" || bad "(b) expected 2 log lines, got ${lines:-0}"
L=$(tail -1 "$USAGE" 2>/dev/null); echo "   logged: $L"
check "(b) quota has key five_hour_pct"          '.quota | has("five_hour_pct")' "$L"
check "(b) quota.five_hour_pct is null (not 0)"  '.quota.five_hour_pct == null' "$L"
check "(b) quota.seven_day_pct is null (not 0)"  '.quota.seven_day_pct == null' "$L"
check "(b) quota.rate_limits_present == false"   '.quota.rate_limits_present == false' "$L"
contains "(b) display says quota not in payload" "$disp" "quota: not in payload"
lacks "(b) no HANDOFF flag below threshold 60" "$disp" "HANDOFF?"

echo "== (c) keys log"
if [ -s "$KEYS" ]; then ok "(c) keys log written and non-empty"; else bad "(c) keys log missing or empty"; fi
klines=$(wc -l < "$KEYS" 2>/dev/null | tr -d ' '); [ "${klines:-0}" = "2" ] && ok "(c) 2 distinct key sets recorded" || bad "(c) expected 2 key-set lines, got ${klines:-0}"
if grep -qF '"rate_limits.five_hour.used_percentage"' "$KEYS" 2>/dev/null; then ok "(c) keys log lists rate_limits.five_hour.used_percentage"; else bad "(c) keys log lacks rate_limits.five_hour.used_percentage"; fi
run_sl "$B" >/dev/null
klines=$(wc -l < "$KEYS" 2>/dev/null | tr -d ' '); [ "${klines:-0}" = "2" ] && ok "(c) repeat key set not duplicated" || bad "(c) repeat key set duplicated ($klines lines)"

echo "== (d) default log paths with no overrides (HOME pointed at a temp dir)"
mkdir -p "$tmp/fakehome"
printf "%s" "$B" | env -u SKILLITON_USAGE_LOG -u SKILLITON_KEYS_LOG HOME="$tmp/fakehome" bash "$SL" >/dev/null 2>&1
[ -s "$tmp/fakehome/.claude/skilliton/usage-log.jsonl" ] && ok "(d) default usage log is ~/.claude/skilliton/usage-log.jsonl" || bad "(d) default usage log not at ~/.claude/skilliton/usage-log.jsonl"
[ -s "$tmp/fakehome/.claude/skilliton/statusline-keys-seen.log" ] && ok "(d) default keys log is ~/.claude/skilliton/statusline-keys-seen.log" || bad "(d) default keys log not at ~/.claude/skilliton/statusline-keys-seen.log"
[ ! -e "$tmp/fakehome/.claude/usage-log.jsonl" ] && ok "(d) nothing written to ~/.claude/usage-log.jsonl" || bad "(d) wrote to ~/.claude/usage-log.jsonl (schema collision)"

echo "== (g) invoked by path, the way setup.mjs configures the status line"
if [ -x "$SL" ]; then ok "(g) status line script is executable"; else bad "(g) status line script is not executable; Claude Code runs it by path and would show nothing"; fi
disp=$(printf "%s" "$A" | SKILLITON_USAGE_LOG="$tmp/g/usage.jsonl" SKILLITON_KEYS_LOG="$tmp/g/keys.log" "$SL" 2>&1); rc=$?
[ "$rc" -eq 0 ] && contains "(g) direct invocation prints the quota line" "$disp" "5h 42%" || bad "(g) direct invocation failed (exit $rc): $disp"

echo "== (e) jq missing: says so, never claims the payload lacked quota"
mkdir -p "$tmp/nojq"
for t in bash cat date mkdir dirname grep printf tr; do p=$(command -v "$t" 2>/dev/null); [ -n "$p" ] && [ -x "$p" ] && ln -sf "$p" "$tmp/nojq/$t"; done
disp=$(printf "%s" "$A" | PATH="$tmp/nojq" SKILLITON_USAGE_LOG="$tmp/e/usage.jsonl" SKILLITON_KEYS_LOG="$tmp/e/keys.log" "$tmp/nojq/bash" "$SL" 2>&1); rc=$?
echo "   display: $disp"
[ "$rc" -eq 0 ] && ok "(e) exit 0 (a status line must not crash the UI)" || bad "(e) exit $rc"
contains "(e) display names the missing dependency" "$disp" "jq not installed"
lacks "(e) display does not claim quota was absent from the payload" "$disp" "not in payload"

echo "== (f) log not writable: the display says the write failed"
mkdir -p "$tmp/ro" && chmod 500 "$tmp/ro"
disp=$(printf "%s" "$A" | SKILLITON_USAGE_LOG="$tmp/ro/usage.jsonl" SKILLITON_KEYS_LOG="$tmp/f-keys.log" bash "$SL" 2>&1); rc=$?
chmod 700 "$tmp/ro"
echo "   display: $disp"
[ "$rc" -eq 0 ] && ok "(f) exit 0" || bad "(f) exit $rc"
contains "(f) display reports LOG WRITE FAILED" "$disp" "LOG WRITE FAILED"

echo
if [ "$fails" -eq 0 ]; then echo "RESULT: PASS (all assertions ok)"; exit 0; fi
echo "RESULT: FAIL ($fails assertion(s) failed)"; exit 1
