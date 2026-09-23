#!/usr/bin/env bash
# guardrails-review.test.sh: the ways past the guardrails Bash hook that the 2026-09-23 cold review found (lane
# guard-review, N70 to N73), each pinned as a case with the decision the hook gave at the base commit (in the label, as
# "base: allow") and the decision it must give now, beside the ordinary commands that must still go through.
# It is its own file because scripts/guardrails.test.sh is pinned by the size ratchet in scripts/lint.test.mjs and
# scripts/guardrails-bypass.test.sh would pass the ceiling; guardrails-bypass.test.sh runs it at its end, so CI runs it
# without a workflow change. The harness is the same shape as that file's.
#
# The hook is only asked for a decision, and no command under test is run, with one exception said where it happens:
# the push forms in N71 are also run for real against a throwaway bare remote in the temp dir, so the test shows what
# git itself does with each spelling. Every decision is asked twice, with Claude-shaped and with Codex-shaped input, and
# where Claude-shaped input asks, Codex-shaped input must be denied with the ask reason kept.
#
#   bash scripts/guardrails-review.test.sh              check the shipped hook
#   bash scripts/guardrails-review.test.sh --hook FILE  run every case with FILE as guard-bash.sh
#
# Exit 0: all ok. Exit 1: any FAIL. Exit 2: NOT RUN (git, jq or node missing).
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
# a prepared project: the settings file, the records, the instruction files, and the client's settings with a hook
new_prepared() { # new_prepared <dir>
  new_repo "$1" || return 1
  mkdir -p "$1/.skilliton" "$1/docs/tasks" "$1/docs/decisions" "$1/docs/lessons" "$1/.claude" || return 1
  printf '{"version":1}\n' > "$1/.skilliton/config.json"
  printf '# Status\n' > "$1/docs/STATUS.md"; printf '# Decisions\n' > "$1/DECISIONS.md"; printf '# Handoff\n' > "$1/docs/HANDOFF.md"
  printf '# Rules\n' > "$1/CLAUDE.md"; printf '# Rules\n' > "$1/AGENTS.md"; printf '# one\n' > "$1/docs/tasks/2026-09-23-one-0001.md"
  printf '{"hooks":{"PreToolUse":[]}}\n' > "$1/.claude/settings.json"
  git -C "$1" add -A && git -C "$1" commit -q -m prepared
}

echo "guardrails review test"
echo "hook under test: $LABEL"
echo "bash: $(bash -c 'echo $BASH_VERSION'), git: $(git --version | cut -d' ' -f3)"
R="$TMP/repo"; RF="$TMP/repo-feature"; RP="$TMP/repo-prepared"
for d in "$R" "$RF"; do new_repo "$d" || { echo "FAIL: could not build fixture repository $d"; exit 1; }; done
new_prepared "$RP" || { echo "FAIL: could not build the prepared fixture"; exit 1; }
git -C "$RF" checkout -q feature

# ---------------------------------------------------------------- N70
section "N70: a write that switches the hooks off asks: the client's settings file"
expect "echo disableAllHooks > .claude/settings.json (base: allow)" ask "$RP" "echo '{\"disableAllHooks\":true}' > .claude/settings.json"
reason_has "  the reason names the file" ".claude/settings.json"
reason_has "  the reason names the word" "holds disableAllHooks"
expect "... > ./.claude/settings.json (base: allow)"   ask "$RP" "echo '{\"disableAllHooks\":true}' > ./.claude/settings.json"
expect "... > \"\$PWD/.claude/settings.json\" (base: allow)" ask "$RP" 'echo "{\"disableAllHooks\":true}" > "$PWD/.claude/settings.json"'
expect "... > <absolute path>/.claude/settings.json (base: allow)" ask "$RP" "echo '{\"disableAllHooks\":true}' > $RP/.claude/settings.json"
expect "echo hooks >> .claude/settings.local.json (base: allow)" ask "$RP" "echo '{\"hooks\":{}}' >> .claude/settings.local.json"
reason_has "  the reason names the local file" ".claude/settings.local.json"
expect "echo enabledPlugins | tee .claude/settings.json (base: allow)" ask "$RP" "echo '{\"enabledPlugins\":{}}' | tee .claude/settings.json"
reason_has "  the reason names enabledPlugins" "holds enabledPlugins"
expect "cp <a file that cannot be read> .claude/settings.json (base: allow)" ask "$RP" "cp $TMP/nothere.json .claude/settings.json"
printf '{"disableAllHooks":true}\n' > "$TMP/off.json"; printf '{"permissions":{}}\n' > "$TMP/plain.json"
expect "cp <a file that holds disableAllHooks> .claude/settings.json (base: allow)" ask "$RP" "cp $TMP/off.json .claude/settings.json"
reason_has "  the reason says the copied file holds it" "which it copies there"
expect "mv <a file that holds disableAllHooks> onto it (base: allow)" ask "$RP" "mv $TMP/off.json .claude/settings.json"
expect "sed -i on the settings file that has hooks now (base: allow)" ask "$RP" "sed -i '' '/PreToolUse/d' .claude/settings.json"
reason_has "  the reason says the file as it is now holds it" "the file as it is now holds hooks"
expect "jq ... > tmp && mv tmp .claude/settings.json (base: allow)" ask "$RP" "jq '.disableAllHooks=true' .claude/settings.json > $TMP/s.json && mv $TMP/s.json .claude/settings.json"
expect "python3 -c naming it (base: allow)"           ask "$RP" "python3 -c \"import json; open('.claude/settings.json','w').write(json.dumps({'disableAllHooks': True}))\""
expect "a heredoc onto it (base: allow)"               ask "$RP" $'cat <<EOF > .claude/settings.json\n{"disableAllHooks": true}\nEOF'
expect "echo {} > .claude/settings.json over a file with hooks (base: allow)" ask "$RP" "echo '{}' > .claude/settings.json"
expect "cd .claude && echo ... > settings.json (base: allow)" ask "$RP" "cd .claude && echo '{\"disableAllHooks\":true}' > settings.json"
expect "bash -c 'echo {} > .claude/settings.json' (base: allow)" ask "$RP" "bash -c 'echo {} > .claude/settings.json'"
expect "negative: cat .claude/settings.json"           allow "$RP" 'cat .claude/settings.json'
expect "negative: jq .hooks .claude/settings.json"     allow "$RP" 'jq .hooks .claude/settings.json'
expect "negative: cp .claude/settings.json <backup>"   allow "$RP" "cp .claude/settings.json $TMP/backup.json"
expect "negative: echo hooks > notes.txt"              allow "$RP" 'echo hooks > notes.txt'
expect "negative: a write to .claude/other.json"       allow "$RP" "echo '{\"disableAllHooks\":true}' > .claude/other.json"
RN="$TMP/repo-no-hooks"; new_repo "$RN" || { echo "FAIL: could not build $RN"; exit 1; }
mkdir -p "$RN/.claude" && printf '{"permissions":{}}\n' > "$RN/.claude/settings.json"
expect "negative: a permissions write to a settings file with no hooks" allow "$RN" "echo '{\"permissions\":{\"allow\":[]}}' > .claude/settings.json"
expect "negative: cp <a file with no hook words> onto it" allow "$RN" "cp $TMP/plain.json .claude/settings.json"
expect "the existing settings-file rule still asks: .skilliton/config.json" ask "$RP" "printf x > .skilliton/config.json"
reason_has "  with its own reason" "guardrails settings file (.skilliton/config.json)"

section "N70: creating the opt-out file asks"
expect "touch .skilliton-off (base: allow)"            ask "$RP" 'touch .skilliton-off'
reason_has "  the reason says every workflow hook stays silent" "every workflow hook in this repository stays silent"
expect ": > .skilliton-off (base: allow)"              ask "$RP" ': > .skilliton-off'
expect "printf '' > .skilliton-off (base: allow)"      ask "$RP" "printf '' > .skilliton-off"
expect "cp /dev/null .skilliton-off (base: allow)"     ask "$RP" 'cp /dev/null .skilliton-off'
expect "install -m 644 /dev/null .skilliton-off (base: allow)" ask "$RP" 'install -m 644 /dev/null .skilliton-off'
expect "touch <absolute path>/.skilliton-off (base: allow)"       ask "$RP" "touch $RP/.skilliton-off"
expect "touch .git/skilliton-off (base: allow)"        ask "$RP" 'touch .git/skilliton-off'
expect "bash -c 'touch .skilliton-off' (base: allow)"  ask "$RP" "bash -c 'touch .skilliton-off'"
expect "negative: touch notes.txt"                     allow "$RP" 'touch notes.txt'
expect "negative: ls -a .skilliton-off"                allow "$RP" 'ls -a .skilliton-off'

# ---------------------------------------------------------------- N71
section "N71: the push forms, run for real against a bare remote, then asked of the hook"
# The one place this file runs a command under test: each push below is run in a throwaway work repository against a
# throwaway bare remote in the temp dir, whose main is set back before every run, so the case shows whether git
# itself force-updated main with that spelling. A spelling git refuses as ambiguous is still refused by the hook.
RW="$TMP/push-work"; RB="$TMP/push-remote.git"
git init -q --bare "$RB" && new_repo "$RW" && git -C "$RW" remote add origin "$RB" && git -C "$RW" push -q origin main feature 2>/dev/null \
  || { echo "FAIL: could not build the bare remote fixture"; exit 1; }
BASE_SHA=$(git -C "$RW" rev-parse main); git -C "$RW" commit -q --amend -m rewritten; NEW_SHA=$(git -C "$RW" rev-parse main)
push_case() { # push_case <label> <deny|ask|allow> <forced|kept|either> <command>
  local label=$1 want=$2 git_says=$3 cmd=$4 after result
  git -C "$RB" update-ref refs/heads/main "$BASE_SHA"; git -C "$RW" update-ref refs/remotes/origin/main "$BASE_SHA"
  (cd "$RW" && bash -c "$cmd") >/dev/null 2>&1
  after=$(git -C "$RB" rev-parse refs/heads/main)
  if [ "$after" = "$NEW_SHA" ]; then result=forced; else result=kept; fi
  if [ "$git_says" != either ] && [ "$result" != "$git_says" ]; then bad "$label: run for real, git $result main, expected $git_says"
  else ok "$label: run for real, git $result main"; fi
  expect "$label" "$want" "$RW" "$cmd"
}
push_case "git push --forc origin main (base: allow)"      deny either 'git push --forc origin main'
push_case "git push --f origin main (base: allow)"         deny either 'git push --f origin main'
push_case "git push --force-w origin main (base: deny)"    deny forced 'git push --force-w origin main'
push_case "git push --mir origin (base: allow)"            deny forced 'git push --mir origin'
push_case "git push origin --force-with-lease --no-force HEAD:main (base: allow)" deny forced 'git push origin --force-with-lease --no-force HEAD:main'
push_case "git push -f origin : (the matching refspec) (base: allow)" deny forced 'git push -f origin :'
push_case "git -c remote.origin.push=+main push (base: allow)" deny forced 'git -c remote.origin.push=+main push'
push_case "git -c remote.origin.push=+HEAD push (no branch, on main) (base: allow)" deny forced 'git -c remote.origin.push=+HEAD push'
push_case "GIT_CONFIG_KEY_0=remote.origin.push +main (base: allow)" deny forced 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.push GIT_CONFIG_VALUE_0=+main git push'
push_case "git -c alias.p='push -f origin main' p (base: allow)" deny forced "git -c alias.p='push -f origin main' p"
reason_has "  the reason names the alias and what it was read as" "alias"
push_case "git -c alias.s='!git push -f origin main' s (base: allow)" deny forced "git -c alias.s='!git push -f origin main' s"
push_case "GIT_CONFIG_PARAMETERS alias (base: allow)"     deny forced "GIT_CONFIG_PARAMETERS=\"'alias.p'='push -f origin main'\" git p"
push_case "x=main; git push -f origin \$x (base: allow)"   ask forced 'x=main; git push -f origin $x'
reason_has "  the reason names the variable" 'names $x'
push_case "for b in main; do git push -f origin \$b; done (base: allow)" ask forced 'for b in main; do git push -f origin $b; done'
push_case "git push -f origin \$(git branch --show-current) (base: deny)" ask forced 'git push -f origin $(git branch --show-current)'
push_case "negative: git push --force --no-force origin main (--no-force takes back --force)" allow kept 'git push --force --no-force origin main'
push_case "negative: git push origin main (not a fast-forward, git refuses)" allow kept 'git push origin main'

section "N71: option starts, -c configuration, variables, and hook skips, asked of the hook only"
expect "git commit --no-ver -m x (base: allow)"         deny "$R" 'git commit --no-ver -m x'
expect "git commit --n -m x (a start of --no-verify) (base: allow)" deny "$R" 'git commit --n -m x' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "git push --no-v origin feature (base: allow)"   deny "$R" 'git push --no-v origin feature'
expect "git push --de origin main (as before) (base: deny)" deny "$RF" 'git push --de origin main'
expect "git -c remote.origin.push=main push asks (base: allow)" ask "$RF" 'git -c remote.origin.push=main push'
reason_has "  the reason names remote.<name>.push" "remote.<name>.push"
expect "git -c push.default=upstream push -f on feature asks (base: allow)" ask "$RF" 'git -c push.default=upstream push -f'
expect "git -c alias.c='commit --no-verify' c (base: allow)" deny "$R" "git -c alias.c='commit --no-verify' c -m x" # skilliton-audit: allow verification-off a test case that sends the flag to the guard inside an alias
expect "git -c alias.pp='push origin feature' pp asks (base: allow)" ask "$R" "git -c alias.pp='push origin feature' pp"
expect "git --config-env=alias.p=VAR p asks (base: allow)" ask "$R" 'git --config-env=alias.p=MYALIAS p'
expect "git --config-env remote.origin.push=VAR push asks (base: allow)" ask "$R" 'git --config-env remote.origin.push=MYPUSH push'
expect "rm -rf \$x asks (base: allow)"                  ask "$R" 'rm -rf $x'
expect "rm -rf \"\${dir}/build\" asks (base: allow)"     ask "$R" 'rm -rf "${dir}/build"'
expect "rm -rf \$'x' (ANSI-C quoting) asks (base: allow)" ask "$R" "rm -rf \$'x'"
expect "git merge --no-verify feature (base: allow)"    deny "$R" 'git merge --no-verify feature' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "git rebase --no-verify main (base: allow)"      deny "$R" 'git rebase --no-verify main' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "git am --no-verify x.patch (base: allow)"       deny "$R" 'git am --no-verify x.patch' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "git am -n x.patch (am's -n is the same flag) (base: allow)" deny "$R" 'git am -n x.patch'
expect "git cherry-pick --no-verify abc (base: allow)"  deny "$R" 'git cherry-pick --no-verify abc' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "git revert --no-verify abc (base: allow)"       deny "$R" 'git revert --no-verify abc' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "git pull --no-verify (base: allow)"             deny "$R" 'git pull --no-verify' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "HUSKY=0 git commit -m x (base: allow)"          ask "$R" 'HUSKY=0 git commit -m x'
reason_has "  the reason names the setting" "HUSKY=0"
expect "SKIP=all git commit -m x (base: allow)"         ask "$R" 'SKIP=all git commit -m x'
expect "LEFTHOOK=0 git commit -m x (base: allow)"       ask "$R" 'LEFTHOOK=0 git commit -m x'
expect "rm .git/hooks/pre-commit (base: allow)"         deny "$R" 'rm .git/hooks/pre-commit'
expect "rm -rf .git/hooks (base: allow)"                deny "$R" 'rm -rf .git/hooks'
expect "cd .git && rm hooks/pre-commit (base: allow)"   deny "$R" 'cd .git && rm hooks/pre-commit'
expect "mv .git/hooks/pre-commit elsewhere (base: allow)" deny "$R" "mv .git/hooks/pre-commit $TMP/x"
expect "chmod -x .git/hooks/pre-commit (base: allow)"   deny "$R" 'chmod -x .git/hooks/pre-commit'
expect "truncate -s 0 .git/hooks/pre-push (base: allow)" deny "$R" 'truncate -s 0 .git/hooks/pre-push'
expect "git reset --har HEAD~1 (a start of --hard) (base: allow)" ask "$R" 'git reset --har HEAD~1'
expect "git clean --fo (a start of --force) (base: allow)" ask "$R" 'git clean --fo'
expect "git branch --del --forc feature (base: allow)"  ask "$R" 'git branch --del --forc feature'
expect "negative: git merge --no-verify-signatures feature (another option)" allow "$R" 'git merge --no-verify-signatures feature' # skilliton-audit: allow verification-off a test case that sends the flag to the guard
expect "negative: git merge -n feature (merge's -n is --no-stat)" allow "$R" 'git merge -n feature'
expect "negative: git push --follow-tags origin main"   allow "$R" 'git push --follow-tags origin main'
expect "negative: git push --dry-run origin main"       allow "$R" 'git push --dry-run origin main'
expect "negative: git push origin \$branch without force" allow "$R" 'git push origin $branch'
expect "negative: git -c alias.l='log --oneline' l"     allow "$R" "git -c alias.l='log --oneline' l"
expect "negative: git -c user.name=a commit -m x"       allow "$R" 'git -c user.name=a commit -m x'
expect "negative: HUSKY=1 git commit -m x"              allow "$R" 'HUSKY=1 git commit -m x'
expect "negative: rm \"\$x\" (not recursive and forced)" allow "$R" 'rm "$x"'
expect "negative: rm -rf \"\$PWD/node_modules\" (\$PWD is known)" allow "$R" 'rm -rf "$PWD/node_modules"'
expect "negative: rm .git/index.lock"                   allow "$R" 'rm .git/index.lock'

# ---------------------------------------------------------------- N72
section "N72: the commit path checks a file over the 10 MB content-scan cap by name only, and says so"
FAKE_AWS="AKIA""TESTONLYEXAMPLE0"   # split so the whole value never appears in this file
RC72="$TMP/repo-large"; new_repo "$RC72" || { echo "FAIL: could not build $RC72"; exit 1; }
git -C "$RC72" checkout -q feature
big_file() { head -c "$2" /dev/zero | tr '\0' 'a' | fold -w 100 > "$1"; printf 'key = %s\n' "$FAKE_AWS" >> "$1"; }
big_file "$RC72/large.txt" 10500000; git -C "$RC72" add large.txt
t0=$(date +%s); run_bash_hook claude "$RC72" 'git commit -m x'; t1=$(date +%s)
if [ $((t1 - t0)) -le 5 ] && [ "$DECISION" != allow ]; then ok "a staged file just over the cap is decided within 5 seconds ($((t1 - t0)) s, $DECISION)"
else bad "a staged file just over the cap took $((t1 - t0)) s and was $DECISION"; fi
expect "git commit with a staged file over the cap whose last line is secret-shaped (base: deny)" ask "$RC72" 'git commit -m x'
reason_has "  the reason names the file" "large.txt is larger than 10 MB"
reason_has "  the reason names the size rule" "checked by name only"
case "$REASON_TEXT" in *"$FAKE_AWS"*) bad "  the reason repeats the value" ;; *) ok "  the reason never repeats the value" ;; esac
git -C "$RC72" reset -q; rm -f "$RC72/large.txt"
big_file "$RC72/small.txt" 1000; git -C "$RC72" add small.txt
expect "a file under the cap with the same last line is still denied by content (base: deny)" deny "$RC72" 'git commit -m x'
reason_has "  by its content" "small.txt contain text shaped like an AWS access key ID"
big_file "$RC72/small.txt" 10500000
expect "a small staged secret stays scanned when the file on disk has grown past the cap (base: deny)" deny "$RC72" 'git commit -m x'
git -C "$RC72" reset -q; git -C "$RC72" add small.txt; git -C "$RC72" commit -q -m "a large tracked file"
printf 'one more line\n' >> "$RC72/small.txt"
expect "git commit -am x with a tracked file over the cap changed on disk (base: allow)" ask "$RC72" 'git commit -am x'
reason_has "  the reason names it" "small.txt is larger than 10 MB"
expect "negative: an ordinary commit of a small clean file"  allow "$R" 'git commit -m x'

echo
if [ "$fails" -eq 0 ]; then echo "RESULT: PASS ($oks checks ok)"; exit 0; fi
echo "RESULT: FAIL ($fails failed, $oks ok)"; exit 1
