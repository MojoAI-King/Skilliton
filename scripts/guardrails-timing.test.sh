#!/usr/bin/env bash
# guardrails-timing.test.sh: the guardrails Bash hook's wall-clock cases, apart from the correctness suite (N93).
# A time limit measures the machine as much as the hook: three runs of scripts/guardrails.test.sh on a machine shared
# with other sessions saw its "limit 5s" case at 6 s and 9 s, and green when run alone. So the decisions here are
# always checked, and a time limit is checked only when the machine is not overloaded: when the one-minute load
# average (sysctl -n vm.loadavg on macOS, /proc/loadavg on Linux) is above four times the CPU count, before or after a
# timed run, that limit is reported as NOT RUN with the load average, instead of failing. CI runs this file as its own
# step, on a runner where the load is low. A load that cannot be read leaves every limit checked, and says so.
#
# The hook is only asked for a decision; no command under test is run. Every decision is asked twice, with
# Claude-shaped and with Codex-shaped input, and where Claude-shaped input asks, Codex-shaped input must be denied with
# the ask reason kept. Each run is timed on its own.
#
#   bash scripts/guardrails-timing.test.sh              check the shipped hook
#   bash scripts/guardrails-timing.test.sh --hook FILE  run every case with FILE as guard-bash.sh
#
# Exit 0: all ok (a limit NOT RUN for load is named in the output and in the RESULT line). Exit 1: any FAIL.
# Exit 2: NOT RUN (git, jq or node missing).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
HOOK="$root/packs/base/plugins/guardrails/hooks/guard-bash.sh"
LABEL="guard-bash.sh (shipped)"
while [ $# -gt 0 ]; do
  case "$1" in
    --hook) [ $# -ge 2 ] || { echo "FAIL: --hook needs a file argument"; exit 1; }; HOOK=$2; LABEL="override: $2 (NOT the shipped hook)"; shift 2 ;;
    *) echo "FAIL: unknown argument: $1"; exit 1 ;;
  esac
done
for t in git jq node; do command -v "$t" >/dev/null 2>&1 || { echo "NOT RUN: $t missing"; exit 2; }; done
[ -f "$HOOK" ] || { echo "FAIL: hook under test not found: $HOOK"; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home" GIT_CONFIG_GLOBAL="$TMP/gitconfig" GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid
mkdir -p "$HOME"; : > "$GIT_CONFIG_GLOBAL"
unset SKILLITON_GUARDRAILS SKILLITON_GUARDRAILS_CLIENT CLAUDE_PROJECT_DIR CLAUDE_PLUGIN_ROOT CLAUDE_PLUGIN_DATA PLUGIN_ROOT PLUGIN_DATA GIT_DIR GIT_WORK_TREE

fails=0; oks=0; notrun=0
ok()  { echo "ok   $1"; oks=$((oks + 1)); }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
not_run() { echo "NOT RUN $1"; notrun=$((notrun + 1)); }
section() { echo; echo "== $1"; }
CODEX_LEAD='Blocked: this command would normally need your confirmation. Codex cannot ask for confirmation from a hook, so it was blocked. If you meant it, run it yourself in your terminal. The confirmation would have said:'

# ---------------------------------------------------------------- the machine's load
CPUS=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo "")
case "$CPUS" in ''|*[!0-9]*|0) CPUS="" ;; esac
LOAD1=""
read_load() { # sets LOAD1 to the one-minute load average, or "" when it cannot be read
  local l=""
  LOAD1=""
  if l=$(sysctl -n vm.loadavg 2>/dev/null) && [ -n "$l" ]; then
    l=${l#\{}; l=${l# }; LOAD1=${l%% *}      # macOS: "{ 2.79 3.46 4.08 }"
  elif [ -r /proc/loadavg ]; then
    read -r LOAD1 l < /proc/loadavg          # Linux: "0.52 0.41 0.30 1/234 5678"
  fi
  case "$LOAD1" in ''|*[!0-9.]*) LOAD1="" ;; esac
}
overloaded() { # 0 when the one-minute load is above four times the CPU count; sets LOAD_TEXT either way
  read_load
  if [ -z "$LOAD1" ] || [ -z "$CPUS" ]; then LOAD_TEXT="load not readable"; return 1; fi
  LOAD_TEXT="one-minute load $LOAD1 on $CPUS CPUs"
  awk -v l="$LOAD1" -v c="$CPUS" 'BEGIN { exit !(l > 4 * c) }'
}
now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }

# ---------------------------------------------------------------- asking the hook
jstr() { printf '%s' "$1" | jq -Rs .; }
payload() { # payload <claude|codex> <cwd> <command>
  if [ "$1" = codex ]; then
    printf '{"session_id":"t","transcript_path":"t","cwd":%s,"hook_event_name":"PreToolUse","model":"m","turn_id":"t","tool_name":"Bash","tool_use_id":"t","tool_input":{"command":%s}}' "$(jstr "$2")" "$(jstr "$3")"
  else
    printf '{"session_id":"t","transcript_path":"t","cwd":%s,"permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":%s,"description":"t"},"tool_use_id":"t"}' "$(jstr "$2")" "$(jstr "$3")"
  fi
}
read_result() { # sets DECISION and REASON_TEXT from OUT
  case "$OUT" in
    '') DECISION=allow ;;
    '{"systemMessage":'*) DECISION=allow ;;
    *'"permissionDecision":"deny"'*) DECISION=deny ;;
    *'"permissionDecision":"ask"'*) DECISION=ask ;;
    *) DECISION="unrecognized output" ;;
  esac
  REASON_TEXT=""
  [ -n "$OUT" ] && REASON_TEXT=$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.permissionDecisionReason // empty' 2>/dev/null)
  return 0
}
run_bash_hook() { # run_bash_hook <shape> <cwd> <command>: sets OUT, RC, DECISION, REASON_TEXT and MS (this run only)
  local shape=$1 cwd=$2 cmd=$3 t0
  payload "$shape" "$cwd" "$cmd" > "$TMP/payload.json"
  t0=$(now_ms)
  if [ "$shape" = codex ]; then OUT=$(bash "$HOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?
  else OUT=$(env CLAUDE_PROJECT_DIR="$cwd" bash "$HOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?; fi
  MS=$(( $(now_ms) - t0 ))
  read_result
}
# expect <label> <deny|ask|allow> <cwd> <command>: Claude-shaped must be <want>; Codex-shaped must be the same decision
# and reason, except that an ask must be a deny whose reason is CODEX_LEAD, a newline, then the ask reason. Sets
# CL_MS and CX_MS to the time of each run.
CL_MS=0; CX_MS=0
expect() {
  local label=$1 want=$2 cl_decision cl_reason; shift 2
  CL_MS=0; CX_MS=0
  run_bash_hook claude "$@"; CL_MS=$MS
  cl_decision=$DECISION; cl_reason=$REASON_TEXT
  if [ "$RC" -ne 0 ]; then bad "$label: hook exited $RC"; return 0; fi
  if [ "$cl_decision" != "$want" ]; then bad "$label -> expected $want, got $cl_decision${cl_reason:+ [reason: $cl_reason]}"; return 0; fi
  run_bash_hook codex "$@"; CX_MS=$MS
  case "$want" in
    ask) [ "$DECISION|$REASON_TEXT" = "deny|$CODEX_LEAD"$'\n'"$cl_reason" ] || { bad "$label [codex-shaped] -> expected the ask as a deny, got $DECISION"; return 0; } ;;
    *) [ "$DECISION|$REASON_TEXT" = "$want|$cl_reason" ] || { bad "$label [codex-shaped] -> expected $want with the same reason, got $DECISION"; return 0; } ;;
  esac
  ok "$label -> $want"
  DECISION=$cl_decision; REASON_TEXT=$cl_reason
}
reason_has() { case "$REASON_TEXT" in *"$2"*) ok "$1" ;; *) bad "$1 [reason: $REASON_TEXT]" ;; esac; }
# within <limit ms> <each|both> <what>: the last expect's two runs against the limit, each run on its own or both added
# together, unless the machine is overloaded before (LOAD_BEFORE, read by timed_expect) or after them.
within() {
  local limit=$1 how=$2 what=$3 slow=""
  if [ "$how" = both ]; then
    [ $((CL_MS + CX_MS)) -le "$limit" ] || slow="both input shapes $((CL_MS + CX_MS))ms"
  else
    [ "$CL_MS" -le "$limit" ] || slow="Claude-shaped ${CL_MS}ms"
    [ "$CX_MS" -le "$limit" ] || slow="${slow:+$slow, }Codex-shaped ${CX_MS}ms"
  fi
  if [ -n "$LOAD_BEFORE" ] || overloaded; then
    not_run "  $what: the time limit (${limit}ms $how) was not judged: ${LOAD_BEFORE:-$LOAD_TEXT}, above four times the CPU count (took ${CL_MS}ms and ${CX_MS}ms)"
  elif [ -z "$slow" ]; then ok "  $what: ${CL_MS}ms and ${CX_MS}ms (limit ${limit}ms $how; $LOAD_TEXT)"
  else bad "  $what: $slow (limit ${limit}ms $how; $LOAD_TEXT)"; fi
}
LOAD_BEFORE=""
timed_expect() { # timed_expect <limit ms> <each|both> <label> <want> <cwd> <command>
  local limit=$1 how=$2 before=$fails; shift 2
  LOAD_BEFORE=""; overloaded && LOAD_BEFORE=$LOAD_TEXT
  expect "$@"
  [ "$fails" -eq "$before" ] || return 0   # a wrong decision is already a FAIL; its time says nothing more
  within "$limit" "$how" "$1"
}

new_repo() { # new_repo <dir>: branch main with one commit
  mkdir -p "$1" && git init -q "$1" && git -C "$1" symbolic-ref HEAD refs/heads/main || return 1
  printf '# fixture\n' > "$1/README.md"
  git -C "$1" add README.md && git -C "$1" commit -q -m init
}

echo "guardrails timing test"
echo "hook under test: $LABEL"
echo "bash: $(bash -c 'echo $BASH_VERSION'), git: $(git --version | cut -d' ' -f3)"
overloaded; echo "machine: $LOAD_TEXT (a limit is not judged above four times the CPU count)"
R="$TMP/repo"
new_repo "$R" || { echo "FAIL: could not build fixture repository $R"; exit 1; }

# ---------------------------------------------------------------- moved from scripts/guardrails.test.sh (N93)
# Resized to under the 64 KB cap by N88: at their earlier sizes (870 KB, 400 KB) they now ask unread, below.
section "large commands under the 64 KB cap finish well inside the 10 second hook timeout"
big_body=$(printf 'git push --force origin main\n%.0s' $(seq 1 2000))
timed_expect 5000 both "heredoc of $(printf '%s' "$big_body" | wc -c | tr -d ' ') bytes" allow "$R" "cat <<'EOF' > big.txt"$'\n'"$big_body"$'\n'"EOF"
long_line=$(head -c 60000 /dev/zero | tr '\0' 'x')
timed_expect 5000 both "60000-byte single line, then a force-push (still read)" deny "$R" "echo \"$long_line\" && git push --force origin main"
prose=$(printf 'the quick brown fox jumps over the lazy dog %.0s' $(seq 1 1400))
timed_expect 5000 both "60 KB of ordinary text, then git status (its real decision)" allow "$R" "echo \"$prose\" && git status"

# ---------------------------------------------------------------- N88
section "N88: a command text over 64 KB asks at once, unread"
three_mb=$(head -c 3000000 /dev/zero | tr '\0' 'x')
cmd="echo \"$three_mb\" && git push -f origin main"
timed_expect 1000 each "3 MB of text, then a forced push (base: 13.5 s for 1,200 KB)" ask "$R" "$cmd"
reason_has "  the reason says it is too long to read" "too long for guardrails to read"
reason_has "  the reason says how long it is" "it is ${#cmd} bytes"
big_body=$(printf 'git push --force origin main\n%.0s' $(seq 1 30000))
timed_expect 1000 each "the earlier 870 KB heredoc" ask "$R" "cat <<'EOF' > big.txt"$'\n'"$big_body"$'\n'"EOF"
filler=$(head -c 3000000 /dev/zero | tr '\0' 'y')
timed_expect 1000 each "3 MB that names nothing the guard reads still asks" ask "$R" "echo \"$filler\""
edge=$(head -c $((65536 - 17)) /dev/zero | tr '\0' 'z')
expect "exactly 65536 bytes, then git status, is read (allow)" allow "$R" "echo $edge; git status"
expect "65537 bytes asks" ask "$R" "echo $edge; git status "

echo
if [ "$fails" -eq 0 ]; then
  if [ "$notrun" -eq 0 ]; then echo "RESULT: PASS ($oks checks ok)"
  else echo "RESULT: PASS ($oks checks ok; $notrun time limits NOT RUN because the machine was overloaded, named above)"; fi
  exit 0
fi
echo "RESULT: FAIL ($fails failed, $oks ok, $notrun not run)"; exit 1
