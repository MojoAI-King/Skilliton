#!/usr/bin/env bash
# guardrails-bypass.test.sh: the ways past the guardrails hooks that a review found on 2026-09-22 (lane guard-security,
# N27 to N34), each pinned as a case that must be refused, beside the ordinary commands that must still go through.
# It is its own file because scripts/guardrails.test.sh is pinned by the size ratchet in scripts/lint.test.mjs and may
# not grow; the harness below is the same shape as that file's, cut down to what these cases need.
#
# As there, the hook is only asked for a decision and no command under test is ever run; every decision is asked
# twice, with Claude-shaped and with Codex-shaped input, and where Claude-shaped input asks, Codex-shaped input must be
# denied with the ask reason kept. Nothing outside the temp dir is touched.
#
#   bash scripts/guardrails-bypass.test.sh              check the shipped hooks
#   bash scripts/guardrails-bypass.test.sh --hook FILE  run every Bash case with FILE as guard-bash.sh
#
# Exit 0: all ok. Exit 1: any FAIL. Exit 2: NOT RUN (git, jq or node missing).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
SHIPPED_DIR="$root/packs/base/plugins/guardrails/hooks"
HOOK="$SHIPPED_DIR/guard-bash.sh"
MHOOK="$SHIPPED_DIR/managed-block-guard.mjs"
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

fails=0; oks=0
ok()  { echo "ok   $1"; oks=$((oks + 1)); }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
section() { echo; echo "== $1"; }
CODEX_LEAD='Blocked: this command would normally need your confirmation. Codex cannot ask for confirmation from a hook, so it was blocked. If you meant it, run it yourself in your terminal. The confirmation would have said:'

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
run_bash_hook() { # run_bash_hook <shape> <cwd> <command> [VAR=value...]
  local shape=$1 cwd=$2 cmd=$3; shift 3
  payload "$shape" "$cwd" "$cmd" > "$TMP/payload.json"
  if [ "$shape" = codex ]; then OUT=$(env "$@" bash "$HOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?
  else OUT=$(env CLAUDE_PROJECT_DIR="$cwd" "$@" bash "$HOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?; fi
  read_result
}
# expect <label> <deny|ask|allow> <cwd> <command> [VAR=value...]: Claude-shaped must be <want>; Codex-shaped must be the
# same decision and reason, except that an ask must be a deny whose reason is CODEX_LEAD, a newline, then the ask reason.
expect() {
  local label=$1 want=$2 cl_decision cl_reason; shift 2
  run_bash_hook claude "$@"
  cl_decision=$DECISION; cl_reason=$REASON_TEXT
  if [ "$RC" -ne 0 ]; then bad "$label: hook exited $RC"; return 0; fi
  if [ "$cl_decision" != "$want" ]; then bad "$label -> expected $want, got $cl_decision${cl_reason:+ [reason: $cl_reason]}"; return 0; fi
  run_bash_hook codex "$@"
  case "$want" in
    ask) [ "$DECISION|$REASON_TEXT" = "deny|$CODEX_LEAD"$'\n'"$cl_reason" ] || { bad "$label [codex-shaped] -> expected the ask as a deny, got $DECISION"; return 0; } ;;
    *) [ "$DECISION|$REASON_TEXT" = "$want|$cl_reason" ] || { bad "$label [codex-shaped] -> expected $want with the same reason, got $DECISION"; return 0; } ;;
  esac
  ok "$label -> $want"
  DECISION=$cl_decision; REASON_TEXT=$cl_reason
}
reason_has() { case "$REASON_TEXT" in *"$2"*) ok "$1" ;; *) bad "$1 [reason: $REASON_TEXT]" ;; esac; }

new_repo() { # new_repo <dir>: branch main with one commit and a feature branch
  mkdir -p "$1" && git init -q "$1" && git -C "$1" symbolic-ref HEAD refs/heads/main || return 1
  printf '# fixture\n' > "$1/README.md"
  git -C "$1" add README.md && git -C "$1" commit -q -m init && git -C "$1" branch feature
}

echo "guardrails bypass test"
echo "hook under test: $LABEL"
R="$TMP/repo"; RF="$TMP/repo-feature"
for d in "$R" "$RF"; do new_repo "$d" || { echo "FAIL: could not build fixture repository $d"; exit 1; }; done
git -C "$RF" checkout -q feature

# ---------------------------------------------------------------- N27
section "N27: a force-push through a pattern refspec, or a destination spelled heads/<branch>"
expect "git push -f origin 'refs/heads/*'"                     deny "$R"  "git push -f origin 'refs/heads/*'"
reason_has "  the reason says a pattern reaches every branch it matches" "pattern"
expect "git push -f origin 'refs/heads/*:refs/heads/*'"        deny "$RF" "git push -f origin 'refs/heads/*:refs/heads/*'"
expect "git push origin '+refs/heads/*:refs/heads/*'"          deny "$RF" "git push origin '+refs/heads/*:refs/heads/*'"
expect "git push -f origin HEAD:heads/main"                    deny "$RF" 'git push -f origin HEAD:heads/main'
expect "git push -f origin feature:refs/heads/main (as before)" deny "$RF" 'git push -f origin feature:refs/heads/main'
expect "negative: git push origin 'refs/heads/*' without force" allow "$RF" "git push origin 'refs/heads/*'"
expect "negative: git push -f origin HEAD:heads/feature"       allow "$RF" 'git push -f origin HEAD:heads/feature'
expect "negative: git push -f origin refs/tags/main"           allow "$RF" 'git push -f origin refs/tags/main'

# ---------------------------------------------------------------- N28
section "N28: deleting a protected branch on the remote"
expect "git push origin --delete main"                deny "$RF" 'git push origin --delete main'
reason_has "  the reason says delete, not force-push" "would delete the shared main branch"
expect "git push -d origin main"                      deny "$RF" 'git push -d origin main'
expect "git push origin :main (empty source)"         deny "$RF" 'git push origin :main'
expect "git push origin :refs/heads/master"           deny "$RF" 'git push origin :refs/heads/master'
expect "git push --del origin main (abbreviation)"    deny "$RF" 'git push --del origin main'
expect "git push origin --delete feature main (two, one protected)" deny "$RF" 'git push origin --delete feature main'
expect "negative: git push origin --delete feature"   allow "$R"  'git push origin --delete feature'
expect "negative: git push origin :feature"           allow "$R"  'git push origin :feature'
expect "negative: git push origin main:feature"       allow "$R"  'git push origin main:feature'

# ---------------------------------------------------------------- N29
section "N29: a wrapper whose option takes a value, and wrappers that were not known"
RP="$TMP/repo-prepared"; new_repo "$RP" || { echo "FAIL: could not build $RP"; exit 1; }
mkdir -p "$RP/.skilliton" && printf '{}\n' > "$RP/.skilliton/config.json"
expect "env -u FOO git push --force origin HEAD:main"  deny "$RF" 'env -u FOO git push --force origin HEAD:main'
expect "nice -n 5 git push --force origin HEAD:main"   deny "$RF" 'nice -n 5 git push --force origin HEAD:main'
expect "timeout 60 git push --force origin main"       deny "$RF" 'timeout 60 git push --force origin main'
expect "timeout -s KILL 60 git push -f origin main"    deny "$RF" 'timeout -s KILL 60 git push -f origin main'
expect "sudo -u someone git push --force origin main"  deny "$RF" 'sudo -u someone git push --force origin main'
expect "sudo -Eu someone git push -f origin main (cluster)" deny "$RF" 'sudo -Eu someone git push -f origin main'
expect "exec -a x git push --force origin main"        deny "$RF" 'exec -a x git push --force origin main'
expect "caffeinate -i git push -f origin main"         deny "$RF" 'caffeinate -i git push -f origin main'
expect "stdbuf -o L git push -f origin main"           deny "$RF" 'stdbuf -o L git push -f origin main'
expect "ionice -c 2 -n 7 git push -f origin main"      deny "$RF" 'ionice -c 2 -n 7 git push -f origin main'
expect "/usr/bin/env -u X git push -f origin main (full path)" deny "$RF" '/usr/bin/env -u X git push -f origin main'
expect "env -u X rm -rf .skilliton"                    deny "$RP" 'env -u X rm -rf .skilliton'
expect "env -C <main repo> git push -f (no branch named)" deny "$TMP" "env -C $R git push -f"
expect "env -S 'git push -f origin main' asks"         ask  "$RF" "env -S 'git push -f origin main'"
expect "find -exec git push -f origin main asks (unknown wrapper)" ask "$RF" 'find . -maxdepth 0 -exec git push -f origin main \;'
reason_has "  the reason names the program it could not read" "whether find runs the rest of this line"
expect "unknown-wrapper x rm -rf .skilliton asks"      ask  "$RP" 'unknown-wrapper -x rm -rf .skilliton'
expect "negative: env -u X git push origin main"       allow "$RF" 'env -u X git push origin main'
expect "negative: nice -n 5 git status"                allow "$RF" 'nice -n 5 git status'
expect "negative: timeout 60 git push -f origin feature" allow "$R" 'timeout 60 git push -f origin feature'
expect "negative: brew install git"                    allow "$R"  'brew install git'
expect "negative: which git rm mv"                     allow "$R"  'which git rm mv'
expect "negative: echo git push -f origin main (echo runs nothing)" allow "$RF" 'echo git push -f origin main'

echo
if [ "$fails" -eq 0 ]; then echo "RESULT: PASS ($oks checks ok)"; exit 0; fi
echo "RESULT: FAIL ($fails failed, $oks ok)"; exit 1
