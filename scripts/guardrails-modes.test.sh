#!/usr/bin/env bash
# guardrails-modes.test.sh: what the quiet, strict and fleet modes make of each kind of ask (guard-bash.sh header,
# "Modes"). Synthetic hook input against a throwaway repository in a temp dir; the hook is only asked for a decision,
# and no command under test is ever run. The strict-mode cases themselves live in the other guardrails suites, which
# export SKILLITON_GUARDRAILS_MODE=strict; this file checks that the default is quiet, that quiet answers each kind
# of ask the way the header says, that fleet refuses every one, how the two sources of the mode combine, and that
# the notes file holds no command text.
#
#   bash scripts/guardrails-modes.test.sh              check the shipped hook
#   bash scripts/guardrails-modes.test.sh --hook FILE  run every check with FILE as guard-bash.sh
#
# Every case prints ok or FAIL. Exit 0: all ok. Exit 1: any FAIL. Exit 2: NOT RUN (git or jq missing).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
HOOK="$root/packs/base/plugins/guardrails/hooks/guard-bash.sh"
LABEL="packs/base/plugins/guardrails/hooks/guard-bash.sh (shipped)"
while [ $# -gt 0 ]; do
  case "$1" in
    --hook) [ $# -ge 2 ] || { echo "FAIL: --hook needs a file argument"; exit 1; }; HOOK=$2; LABEL="override: $2 (NOT the shipped hook)"; shift 2 ;;
    *) echo "FAIL: unknown argument $1"; exit 1 ;;
  esac
done
for t in git jq; do command -v "$t" >/dev/null 2>&1 || { echo "NOT RUN: $t is not installed"; exit 2; }; done
[ -f "$HOOK" ] || { echo "FAIL: hook not found at $HOOK"; exit 1; }
echo "guardrails-modes: $LABEL"

T=$(mktemp -d "${TMPDIR:-/tmp}/guardrails-modes.XXXXXX")
trap 'rm -rf "$T"' EXIT
export HOME="$T/home"; mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL="$T/gitconfig-none" GIT_CONFIG_SYSTEM="$T/gitconfig-none"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
unset SKILLITON_GUARDRAILS SKILLITON_GUARDRAILS_MODE SKILLITON_GUARDRAILS_CLIENT CLAUDE_PLUGIN_ROOT PLUGIN_ROOT CLAUDE_PROJECT_DIR GIT_DIR GIT_WORK_TREE

R="$T/repo"; mkdir -p "$R"; git init -q "$R"; git -C "$R" symbolic-ref HEAD refs/heads/main
printf 'a\n' > "$R/README.md"; printf 'x\n' > "$R/clean.txt"
mkdir -p "$R/.skilliton"; printf '{"guardrails":{"protectedBranches":["main"]}}\n' > "$R/.skilliton/config.json"
git -C "$R" add README.md clean.txt .skilliton/config.json; git -C "$R" commit -q -m init
printf 'dirty\n' >> "$R/README.md"
N="$T/notrepo"; mkdir -p "$N"
: > "$T/transcript.jsonl"
pass=0; fail=0
jstr() { printf '%s' "$1" | jq -Rs .; }
run() { # run <mode|default> <cwd> <command>: sets DEC (allow|ask|deny|notice|exitN) and REASON
  local mode=$1 cwd=$2 cmd=$3 out rc
  printf '{"session_id":"t","transcript_path":%s,"cwd":%s,"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":%s}}' \
    "$(jstr "$T/transcript.jsonl")" "$(jstr "$cwd")" "$(jstr "$cmd")" > "$T/payload.json"
  if [ "$mode" = default ]; then
    out=$(CLAUDE_PROJECT_DIR="$cwd" bash "$HOOK" < "$T/payload.json" 2>"$T/err"); rc=$?
  else
    out=$(CLAUDE_PROJECT_DIR="$cwd" SKILLITON_GUARDRAILS_MODE="$mode" bash "$HOOK" < "$T/payload.json" 2>"$T/err"); rc=$?
  fi
  [ "$rc" -eq 0 ] || { DEC="exit$rc"; REASON=""; return; }
  if [ -z "$out" ]; then DEC=allow; REASON=""; return; fi
  DEC=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "notice"')
  REASON=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecisionReason // .systemMessage // ""')
}
check() { # check <label> <mode> <cwd> <command> <want> [reason must contain]
  run "$2" "$3" "$4"
  if [ "$DEC" = "$5" ] && { [ $# -lt 6 ] || case "$REASON" in *"$6"*) true ;; *) false ;; esac; }; then
    pass=$((pass+1)); printf 'ok   %-7s %-46s -> %s\n' "$2" "$1" "$DEC"
  else
    fail=$((fail+1)); printf 'FAIL %-7s %-46s -> %s (wanted %s%s) %s\n' "$2" "$1" "$DEC" "$5" "${6:+ with \"$6\"}" "${REASON:0:160}"
  fi
}
ok_if()  { if eval "$2"; then pass=$((pass+1)); echo "ok   $1"; else fail=$((fail+1)); echo "FAIL $1"; fi; }

# The value FAKESECRETVALUE9 stands in for a password on a command line; nothing the hook writes may hold it.
OPAQUE="bash $T/outside.sh --token=FAKESECRETVALUE9"
EVAL='eval "$(aws configure export-credentials --profile x --format env)" && echo hi'
SETTINGS='printf "{}" > .claude/settings.json'
RULES='printf "{}" > .skilliton/config.json'
VARRM='S=/tmp/x; rm -rf $S/build'
ADDNEW="cd $N && git init -q && git add ."
DISCARD='git checkout -- README.md'
CLEAN='git checkout -- clean.txt'
HARD='git reset --hard'
FORCE='git push --force origin main'
SECRET='git add deploy.key'

for m in default quiet; do
  echo "== $m: runs and notes what it cannot read"
  check "script outside the project"        $m "$R" "$OPAQUE"   allow
  check "eval of a command substitution"    $m "$R" "$EVAL"     allow
  echo "== $m: refuses with the fix what the assistant can rewrite"
  check "rm -rf of a variable path"         $m "$R" "$VARRM"    deny "Refused instead of asking"
  check "git add in a folder made just now" $m "$N" "$ADDNEW"   deny "Refused instead of asking"
  check "checkout -- with a dirty file"     $m "$R" "$DISCARD"  deny "commit or git stash"
  check "reset --hard with a dirty file"    $m "$R" "$HARD"     deny "commit or git stash"
  echo "== $m: still asks before a rule could be turned off"
  check "writes the client settings file"   $m "$R" "$SETTINGS" ask  "tells Claude Code"
  check "writes the guardrails settings"    $m "$R" "$RULES"    ask  "guardrails settings file"
  echo "== $m: refusals stay refusals; a tree with edits is judged whole"
  check "force-push to main"                $m "$R" "$FORCE"    deny
  check "secret file staged"                $m "$R" "$SECRET"   deny
  check "checkout -- of a clean file, another dirty" $m "$R" "$CLEAN" deny "commit or git stash"
  echo "== $m: nothing to lose, so it runs"
  git -C "$R" stash -q
  check "reset --hard on a clean tree"      $m "$R" "$HARD"     allow
  check "checkout -- on a clean tree"       $m "$R" "$DISCARD"  allow
  check "clean -f with nothing untracked"   $m "$R" "git clean -f" allow
  git -C "$R" stash pop -q
done
echo "== quiet: saved work dropped for good still asks"
git -C "$R" stash -q
check "stash drop"                          quiet  "$R" "git stash drop" ask "saved work from the stash"
git -C "$R" stash pop -q
git -C "$R" branch never-merged; printf 'b\n' > "$T/b"; git -C "$R" update-ref refs/heads/never-merged "$(git -C "$R" commit-tree -p HEAD -m x "$(git -C "$R" write-tree)")"
run quiet "$R" "git branch -D never-merged"; ok_if "branch -D of an unmerged branch -> $DEC" '[ "$DEC" = ask ] || [ "$DEC" = allow ]'

echo "== strict: every ask asks"
m=strict
check "script outside the project"        $m "$R" "$OPAQUE"   ask "cannot read what the shell will run"
check "eval of a command substitution"    $m "$R" "$EVAL"     ask
check "writes the client settings file"   $m "$R" "$SETTINGS" ask
check "rm -rf of a variable path"         $m "$R" "$VARRM"    ask
check "git add in a folder made just now" $m "$N" "$ADDNEW"   ask
check "checkout -- with a dirty file"     $m "$R" "$DISCARD"  ask "throws away"
check "force-push to main"                $m "$R" "$FORCE"    deny
git -C "$R" stash -q
check "reset --hard on a clean tree still asks" $m "$R" "$HARD" ask "throws away"
git -C "$R" stash pop -q

echo "== fleet: every ask is refused"
m=fleet
check "script outside the project"        $m "$R" "$OPAQUE"   deny "fleet mode"
check "eval of a command substitution"    $m "$R" "$EVAL"     deny "fleet mode"
check "writes the client settings file"   $m "$R" "$SETTINGS" deny "fleet mode"
check "rm -rf of a variable path"         $m "$R" "$VARRM"    deny "fleet mode"
check "git add in a folder made just now" $m "$N" "$ADDNEW"   deny "fleet mode"
check "checkout -- with a dirty file"     $m "$R" "$DISCARD"  deny "fleet mode"
check "force-push to main"                $m "$R" "$FORCE"    deny
check "checkout -- of a clean file, another dirty" $m "$R" "$CLEAN" deny "fleet mode"
git -C "$R" stash -q
check "reset --hard on a clean tree"      $m "$R" "$HARD"     allow
git -C "$R" stash pop -q

echo "== the mode's two sources"
printf '{"guardrails":{"protectedBranches":["main"],"mode":"strict"}}\n' > "$R/.skilliton/config.json"
check "config strict: asks"                 default "$R" "$OPAQUE" ask
check "config strict, env quiet: strict wins" quiet "$R" "$OPAQUE" ask
printf '{"guardrails":{"protectedBranches":["main"],"mode":"quiet"}}\n' > "$R/.skilliton/config.json"
check "config quiet, env fleet: fleet wins"  fleet  "$R" "$OPAQUE" deny "fleet mode"
check "config quiet, env strict: strict wins" strict "$R" "$OPAQUE" ask
printf '{"guardrails":{"protectedBranches":["main"],"mode":"loud"}}\n' > "$R/.skilliton/config.json"
check "config invalid: strict, and says so"  default "$R" "$OPAQUE" ask "strict was used"
printf '{"guardrails":{"protectedBranches":["main"]}}\n' > "$R/.skilliton/config.json"

echo "== the notes file"
J="$R/.git/skilliton/guardrails.jsonl"
ok_if "notes written to the project's git folder" '[ -f "$J" ]'
ok_if "the notes never hold a value from a command" '! grep -q FAKESECRETVALUE9 "$J"'
ok_if "the notes hold no command text" '! grep -q export-credentials "$J"'
ok_if "every note is valid JSON with time, mode, answer and reason" 'jq -e "select(.time and .mode and .answer and .reason)" "$J" >/dev/null && [ "$(jq -c . "$J" | wc -l)" = "$(wc -l < "$J")" ]'
ok_if "a note names the answer given" 'jq -r .answer "$J" | grep -qx ran && jq -r .answer "$J" | grep -qx refused'
W="$T/wt"; git -C "$R" worktree add -q "$W" -b wt-branch
run quiet "$W" "$OPAQUE"
ok_if "a worktree notes into its own git folder" '[ -f "$R/.git/worktrees/wt/skilliton/guardrails.jsonl" ]'

echo "== the session start names the mode"
ss() { local out; if [ "$1" = default ]; then out=$(cd "$R" && CLAUDE_PROJECT_DIR="$R" bash "$HOOK" --session-start 2>/dev/null); else out=$(cd "$R" && CLAUDE_PROJECT_DIR="$R" SKILLITON_GUARDRAILS_MODE=$1 bash "$HOOK" --session-start 2>/dev/null); fi; SS=$out; }
ss default; ok_if "default: says quiet mode" 'case "$SS" in *"quiet mode"*) true ;; *) false ;; esac'
ss strict;  ok_if "strict: says neither quiet nor fleet" 'case "$SS" in *"quiet mode"*|*"fleet mode"*) false ;; *) true ;; esac'
ss fleet;   ok_if "fleet: says fleet mode" 'case "$SS" in *"fleet mode"*) true ;; *) false ;; esac'

echo
if [ $fail -eq 0 ]; then echo "RESULT: PASS ($pass checks ok)"; exit 0; else echo "RESULT: FAIL ($fail failed, $pass ok)"; exit 1; fi
