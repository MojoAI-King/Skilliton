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

# ---------------------------------------------------------------- N30
section "N30: writing the settings file the rules come from"
CF="$RP/.skilliton/config.json"
expect "echo ... > .skilliton/config.json asks"        ask  "$RP" "echo '{\"guardrails\":{\"blockForcePush\":false}}' > .skilliton/config.json"
reason_has "  the reason says a person makes that change" "a person's decision, made in their own editor or terminal"
expect "printf ... >> ./.skilliton/config.json asks"   ask  "$RP" "printf x >> ./.skilliton/config.json"
expect "cd .skilliton && echo {} > config.json asks"   ask  "$RP" "cd .skilliton && echo '{}' > config.json"
expect "cat <<EOF > .skilliton/config.json asks"       ask  "$RP" $'cat <<EOF > .skilliton/config.json\n{}\nEOF'
expect "echo {} >& .skilliton/config.json asks"        ask  "$RP" "echo '{}' >& .skilliton/config.json"
expect "node -e writeFileSync(...) asks"               ask  "$RP" "node -e \"require('fs').writeFileSync('.skilliton/config.json','{}')\""
expect "python3 -c open(...) asks"                     ask  "$RP" "python3 -c \"open('.skilliton/config.json','w').write('{}')\""
expect "echo {} | tee .skilliton/config.json asks"     ask  "$RP" "echo '{}' | tee .skilliton/config.json"
expect "cp /tmp/x .skilliton/config.json asks"         ask  "$RP" "cp /tmp/x .skilliton/config.json"
expect "cp /tmp/config.json .skilliton/ asks"          ask  "$RP" "cp /tmp/config.json .skilliton/"
expect "mv new.json .skilliton/config.json asks"       ask  "$RP" "mv new.json .skilliton/config.json"
expect "sed -i s/true/false/ .skilliton/config.json asks" ask "$RP" "sed -i '' s/true/false/ .skilliton/config.json"
expect "bash -c 'echo > .skilliton/config.json' asks"  ask  "$RP" "bash -c 'echo {} > .skilliton/config.json'"
expect "the earlier .skillgate/config.json asks too"   ask  "$RP" "echo '{}' > .skillgate/config.json"
expect "negative: cat .skilliton/config.json"          allow "$RP" 'cat .skilliton/config.json'
expect "negative: jq . .skilliton/config.json"         allow "$RP" 'jq .guardrails .skilliton/config.json'
expect "negative: sed -n p .skilliton/config.json (no -i)" allow "$RP" 'sed -n p .skilliton/config.json'
expect "negative: cp .skilliton/config.json /tmp/backup.json" allow "$RP" 'cp .skilliton/config.json /tmp/backup.json'
expect "negative: echo hi > other/config.json"         allow "$RP" 'echo hi > other/config.json'

# write_guard <label> <deny|allow> <tool> <jq program building tool_input, $p the path> [path, default the settings file]:
# the write guard, run by path the way the client does. The program is passed as it is, not inside "$(...)": bash 3.2
# misreads a double quote inside single quotes inside a quoted command substitution, which is the N32 shape.
write_guard() {
  local label=$1 want=$2 tool=$3 input
  input=$(jq -cn --arg p "${5:-$CF}" "$4") || { bad "$label: the test's own jq program did not build"; return 0; }
  jq -cn --arg cwd "$RP" --arg t "$tool" --argjson i "$input" '{session_id:"t",cwd:$cwd,hook_event_name:"PreToolUse",tool_name:$t,tool_input:$i}' > "$TMP/payload.json"
  OUT=$(node "$MHOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?
  read_result
  if [ "$RC" -ne 0 ]; then bad "$label: write guard exited $RC"; return 0; fi
  if [ "$DECISION" = "$want" ]; then ok "$label -> $want"; else bad "$label -> expected $want, got $DECISION${REASON_TEXT:+ [reason: $REASON_TEXT]}"; fi
}
printf '{"guardrails":{"protectedBranches":["main","release/*"]},"handoff":{"file":"docs/HANDOFF.md"}}\n' > "$CF"
write_guard "Write that sets blockForcePush false"          deny  Write '{file_path:$p, content:"{\"guardrails\":{\"blockForcePush\":false}}"}'
reason_has "  the reason names the key and says a person makes the change" '"blockForcePush" to false'
write_guard "Write that drops release/* from protectedBranches" deny Write '{file_path:$p, content:"{\"guardrails\":{\"protectedBranches\":[\"main\"]}}"}'
write_guard "Write of text that is not JSON but sets a rule false" deny Write '{file_path:$p, content:"{\"guardrails\":{\"blockNoVerify\": false,}}"}'
write_guard "Edit that turns protectRecords off"             deny  Edit  '{file_path:$p, old_string:"{\"protectedBranches\"", new_string:"{\"protectRecords\":false,\"protectedBranches\""}'
write_guard "Edit that empties protectedBranches"            deny  Edit  '{file_path:$p, old_string:"[\"main\",\"release/*\"]", new_string:"[]"}'
write_guard "MultiEdit whose second edit adds blockSecretFiles false" deny MultiEdit '{file_path:$p, edits:[{old_string:"docs/HANDOFF.md", new_string:"docs/H.md"},{old_string:"{\"protectedBranches\"", new_string:"{\"blockSecretFiles\":false,\"protectedBranches\""}]}'
write_guard "Write by a path relative to the cwd"            deny  Write '{file_path:$p, content:"{\"guardrails\":{\"protectRecords\":false}}"}' .skilliton/config.json
write_guard "negative: Write that keeps every rule and branch" allow Write '{file_path:$p, content:"{\"guardrails\":{\"protectedBranches\":[\"main\",\"release/*\",\"next\"]},\"handoff\":{\"file\":\"x.md\"}}"}'
write_guard "negative: Edit outside the guardrails section"  allow Edit  '{file_path:$p, old_string:"docs/HANDOFF.md", new_string:"docs/NEXT.md"}'
write_guard "negative: Write of another config.json"         allow Write '{file_path:$p, content:"{\"guardrails\":{\"blockForcePush\":false}}"}' "$RP/app/config.json"
printf '{"guardrails":{"blockForcePush":false}}\n' > "$CF"
write_guard "negative: a rule a person already turned off stays off" allow Write '{file_path:$p, content:"{\"guardrails\":{\"blockForcePush\":false},\"x\":1}"}'
write_guard "turning a second rule off is still refused"      deny  Write '{file_path:$p, content:"{\"guardrails\":{\"blockForcePush\":false,\"blockNoVerify\":false}}"}'
rm -f "$CF"
write_guard "a new settings file that turns a rule off"       deny  Write '{file_path:$p, content:"{\"guardrails\":{\"blockForcePush\":false}}"}'
printf '{}\n' > "$CF"

# ---------------------------------------------------------------- N31
section "N31: git stage is git add"
RS="$TMP/repo-stage"; new_repo "$RS" || { echo "FAIL: could not build $RS"; exit 1; }
printf 'SECRET=placeholder\n' > "$RS/.env"
expect "git add .env (as before)"                      deny "$RS" 'git add .env'
expect "git stage .env && git commit -m x"             deny "$RS" 'git stage .env && git commit -m x'
reason_has "  the reason is the secret-file one" "looks like a file that holds passwords or keys"
expect "git stage -A (the .env is untracked)"          deny "$RS" 'git stage -A'
expect "negative: git stage README.md"                 allow "$RS" 'git stage README.md'

# ---------------------------------------------------------------- N32
section "N32: quotes, command substitutions and arithmetic in the tokenizer"
expect "a quoted \$(cat <<EOF) whose body has an odd double quote, then a force-push" deny "$RF" $'git commit -m "$(cat <<\'EOF\'\nUse a 12" pipe\nEOF\n)" && git push --force origin main'
expect "echo \$((1<<n)), then a force-push on the next line" deny "$RF" $'echo $((1<<n))\ngit push --force origin main'
expect "\"\$((1<<n))\" inside quotes, then a force-push" deny "$RF" $'echo "$((1<<n))"\ngit push --force origin main'
expect "(( x = 1<<n )), then a force-push"            deny "$RF" $'(( x = 1<<n ))\ngit push --force origin main'
expect "a force-push inside a quoted \$( ) is read"  deny "$RF" 'echo "done: $(git push -f origin main)"'
expect "the quoted word goes on after \$( ): --no-verify after it" deny "$RF" 'git commit -m "$(date)" --no-verify' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
expect "nested \$( \$( ) ) inside quotes, then a force-push" deny "$RF" 'echo "$(echo $(date))" && git push -f origin main'
expect "an unclosed quote asks"                       ask  "$RF" 'git status && echo "unclosed'
reason_has "  the reason says where it could not tell" "could not tell where a quote"
expect "an unclosed quoted \$( asks"                 ask  "$RF" 'git log -1 --format="$(echo x'
expect "negative: the usual commit with a heredoc message" allow "$RF" $'git commit -m "$(cat <<\'EOF\'\nFix the (odd) case: a 12" pipe\n\nMore text.\nEOF\n)"'
expect "negative: a quoted \$( ) that runs nothing risky" allow "$RF" 'git commit -m "release $(date +%Y) notes"'
expect "negative: arithmetic, then an ordinary push"  allow "$RF" $'echo $((1<<3)) "$((2<<n))"\ngit push origin feature'

echo
if [ "$fails" -eq 0 ]; then echo "RESULT: PASS ($oks checks ok)"; exit 0; fi
echo "RESULT: FAIL ($fails failed, $oks ok)"; exit 1
