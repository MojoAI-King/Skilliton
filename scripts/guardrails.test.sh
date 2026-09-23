#!/usr/bin/env bash
# guardrails.test.sh: tests the guardrails plugin hooks (packs/base/plugins/guardrails/hooks/)
# with synthetic hook input against throwaway git repositories in a temp dir.
# The hook is only asked for a decision; no command under test is ever run. Nothing outside the
# temp dir is touched, and git's global and system config are replaced by empty ones.
#
# Every decision check runs the hook twice: with Claude-shaped input (the PreToolUse keys measured
# from Claude Code 2.1.273) and with Codex-shaped input (the fields Codex CLI documents, including
# turn_id and model). Codex cannot ask for confirmation from a hook, so where Claude-shaped input
# asks, Codex-shaped input must be denied with the ask reason kept inside the deny reason; every
# other decision and reason must be the same. The Codex shape comes from Codex documentation; no
# live Codex session has produced it here.
#
#   bash scripts/guardrails.test.sh              check the shipped hooks
#   bash scripts/guardrails.test.sh --hook FILE  run every check with FILE as guard-bash.sh
#                                                (proves a broken hook turns this test red)
#
# Every case prints ok or FAIL. Exit 0: all ok. Exit 1: any FAIL. Exit 2: NOT RUN (git or jq missing).
# The fake secrets are assembled from pieces at run time, so no secret-shaped string exists in
# this repository, and the checks assert that a block reason never repeats the value.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
PLUGIN_REL="packs/base/plugins/guardrails"
SHIPPED_DIR="$root/$PLUGIN_REL/hooks"
HOOK="$SHIPPED_DIR/guard-bash.sh"
LABEL="$PLUGIN_REL/hooks/guard-bash.sh (shipped)"
OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --hook) [ $# -ge 2 ] || { echo "FAIL: --hook needs a file argument"; exit 1; }; OVERRIDE=$2; shift 2 ;;
    *) echo "FAIL: unknown argument: $1"; exit 1 ;;
  esac
done

for t in git jq node; do
  command -v "$t" >/dev/null 2>&1 || { echo "NOT RUN: $t missing"; exit 2; }
done

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -n "$OVERRIDE" ]; then
  [ -f "$OVERRIDE" ] || { echo "FAIL: hook under test not found: $OVERRIDE"; exit 1; }
  mkdir -p "$TMP/plugin/hooks"
  cp "$OVERRIDE" "$TMP/plugin/hooks/guard-bash.sh"
  cp "$SHIPPED_DIR/session-start-guardrails.sh" "$TMP/plugin/hooks/"
  chmod +x "$TMP/plugin/hooks/guard-bash.sh" "$TMP/plugin/hooks/session-start-guardrails.sh"
  HOOK="$TMP/plugin/hooks/guard-bash.sh"
  LABEL="override: $(basename "$OVERRIDE") (NOT the shipped hook)"
fi
SS="$(dirname "$HOOK")/session-start-guardrails.sh"
WHOOK="$SHIPPED_DIR/lane-write-guard.mjs"   # --hook replaces guard-bash.sh only; this one is always the shipped file
MHOOK="$SHIPPED_DIR/managed-block-guard.mjs" # likewise

export HOME="$TMP/home" GIT_CONFIG_GLOBAL="$TMP/gitconfig" GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid
mkdir -p "$HOME"; : > "$GIT_CONFIG_GLOBAL"
unset SKILLITON_GUARDRAILS SKILLITON_GUARDRAILS_CLIENT CLAUDE_PROJECT_DIR CLAUDE_PLUGIN_ROOT CLAUDE_PLUGIN_DATA PLUGIN_ROOT PLUGIN_DATA

fails=0; oks=0
ok()  { echo "ok   $1"; oks=$((oks + 1)); }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }
# MUTE names a file while the mutation check runs: section headings are not printed, and each verdict
# is written there as "<kind> <pass|fail>" instead of being counted in oks and fails.
MUTE=""; SEEN_ALL=0; SEEN_CONV=0
section() { [ -n "$MUTE" ] || { echo; echo "== $1"; }; }
# verdict <kind> <pass|fail> <message>. Kinds: claude (a result from Claude-shaped input), conv (a
# result from Codex-shaped input that needs ask turned into deny), same (a result from Codex-shaped
# input that must not depend on that conversion).
verdict() {
  if [ -n "$MUTE" ]; then printf '%s %s\n' "$1" "$2" >> "$MUTE"; return 0; fi
  SEEN_ALL=$((SEEN_ALL + 1))
  if [ "$1" = conv ]; then SEEN_CONV=$((SEEN_CONV + 1)); fi
  if [ "$2" = pass ]; then ok "$3"; else bad "$3"; fi
}

# The first line of every deny that Codex-shaped input gets where Claude-shaped input is asked.
CODEX_LEAD='Blocked: this command would normally need your confirmation. Codex cannot ask for confirmation from a hook, so it was blocked. If you meant it, run it yourself in your terminal. The confirmation would have said:'
OVERRIDE_NOTE='Note: SKILLITON_GUARDRAILS_CLIENT is set, but not to claude-code or codex, so it was ignored and the client was worked out from the hook input.'

jstr() { printf '%s' "$1" | jq -Rs .; }
TRANSCRIPT_JSON=$(jstr "$TMP/transcript.jsonl"); SCRATCH_JSON=$(jstr "$TMP/scratchpad")
# payload <cwd> <command>: Claude-shaped. The top-level keys are the PreToolUse input keys measured
# from Claude Code 2.1.273 (no model, no turn_id); the values are placeholders.
payload() {
  printf '{"session_id":"guardrails-test","transcript_path":%s,"cwd":%s,"scratchpad_dir":%s,"prompt_id":"guardrails-test-prompt","permission_mode":"default","effort":"guardrails-test-effort","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":%s,"description":"guardrails test"},"tool_use_id":"toolu_guardrails_test"}' \
    "$TRANSCRIPT_JSON" "$(jstr "$1")" "$SCRATCH_JSON" "$(jstr "$2")"
}
# payload_codex <cwd> <command>: Codex-shaped. The fields Codex documents for PreToolUse: session_id,
# transcript_path, cwd, hook_event_name, and model on every hook input, plus turn_id, tool_name,
# tool_use_id, and tool_input.command. The values are placeholders.
payload_codex() {
  printf '{"session_id":"guardrails-test","transcript_path":%s,"cwd":%s,"hook_event_name":"PreToolUse","model":"guardrails-test-model","turn_id":"guardrails-test-turn","tool_name":"Bash","tool_use_id":"guardrails-test-call","tool_input":{"command":%s}}' \
    "$TRANSCRIPT_JSON" "$(jstr "$1")" "$(jstr "$2")"
}

read_result() { # sets DECISION, REASON_TEXT and NOTICE_TEXT (a systemMessage, which decides nothing) from OUT
  DECISION=allow; REASON_TEXT=""; NOTICE_TEXT=""
  case "$OUT" in
    '') DECISION=allow ;;
    '{"systemMessage":'*) DECISION=allow; NOTICE_TEXT=$(printf '%s' "$OUT" | jq -r '.systemMessage // empty' 2>/dev/null) ;;
    *'"permissionDecision":"deny"'*) DECISION=deny ;;
    *'"permissionDecision":"ask"'*) DECISION=ask ;;
    *) DECISION="unrecognized output" ;;
  esac
  [ -n "$OUT" ] && REASON_TEXT=$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.permissionDecisionReason // empty' 2>/dev/null)
  return 0
}

# hook <cwd> <command> [VAR=value...]: runs the hook the way the client does, by path, JSON on stdin.
# SHAPE=claude (the default): Claude-shaped input, and CLAUDE_PROJECT_DIR defaults to <cwd>.
# SHAPE=codex: Codex-shaped input, and no CLAUDE_PROJECT_DIR (Codex does not document one).
# A later VAR=value overrides either.
SHAPE=claude
hook() {
  local cwd=$1 cmd=$2; shift 2
  if [ "$SHAPE" = codex ]; then
    payload_codex "$cwd" "$cmd" > "$TMP/payload.json"
    OUT=$(env "$@" "$HOOK" < "$TMP/payload.json" 2>"$TMP/stderr"); RC=$?
  else
    payload "$cwd" "$cmd" > "$TMP/payload.json"
    OUT=$(env CLAUDE_PROJECT_DIR="$cwd" "$@" "$HOOK" < "$TMP/payload.json" 2>"$TMP/stderr"); RC=$?
  fi
  read_result
}
hook_file() { # hook_file [VAR=value...]: runs the hook by path on $TMP/payload.json exactly as written
  OUT=$(env "$@" "$HOOK" < "$TMP/payload.json" 2>"$TMP/stderr"); RC=$?
  read_result
}

valid_decision_json() { # empty output, exactly one well-formed deny or ask object, or exactly one notice
  [ -n "$OUT" ] || return 0
  printf '%s' "$OUT" | jq -e -s 'length == 1 and (.[0] | keys == ["systemMessage"]) and ((.[0].systemMessage | type) == "string") and ((.[0].systemMessage | length) > 0)' >/dev/null 2>&1 && return 0
  printf '%s' "$OUT" | jq -e -s 'length == 1 and (.[0] | keys == ["hookSpecificOutput"])
    and (.[0].hookSpecificOutput.hookEventName == "PreToolUse")
    and (.[0].hookSpecificOutput.permissionDecision == "deny" or .[0].hookSpecificOutput.permissionDecision == "ask")
    and ((.[0].hookSpecificOutput.permissionDecisionReason | type) == "string")
    and ((.[0].hookSpecificOutput.permissionDecisionReason | length) > 0)' >/dev/null 2>&1
}

# judge <kind> <label> <deny|ask|allow> [exact reason]: checks the last run (OUT, RC, DECISION, REASON_TEXT)
judge() {
  local kind=$1 label=$2 want=$3
  if [ "$RC" -ne 0 ]; then verdict "$kind" fail "$label: hook exited $RC (it must always exit 0)"; return 0; fi
  if ! valid_decision_json; then verdict "$kind" fail "$label: output is not a valid PreToolUse decision"; return 0; fi
  if [ "$DECISION" != "$want" ]; then verdict "$kind" fail "$label -> expected $want, got $DECISION${REASON_TEXT:+ [reason: $REASON_TEXT]}"; return 0; fi
  if [ $# -ge 4 ] && [ "$REASON_TEXT" != "$4" ]; then verdict "$kind" fail "$label -> $DECISION, but not with the expected reason [reason: $REASON_TEXT]"; return 0; fi
  verdict "$kind" pass "$label -> $DECISION"
  return 0
}

# expect <label> <deny|ask|allow> <cwd> <command> [VAR=value...]
# Runs the call with Codex-shaped input, then with Claude-shaped input. The Claude-shaped result must
# be <want>. The Codex-shaped result must be the same decision with the same reason, except that an
# ask must be a deny whose reason is CODEX_LEAD, a newline, and the Claude-shaped ask reason unchanged.
# OUT and REASON_TEXT are left holding the Claude-shaped result for the reason checks that follow.
expect() {
  local label=$1 want=$2 cx_out cx_rc cx_decision cx_reason cl_out cl_rc cl_decision cl_reason; shift 2
  SHAPE=codex; hook "$@"; SHAPE=claude
  cx_out=$OUT; cx_rc=$RC; cx_decision=$DECISION; cx_reason=$REASON_TEXT
  hook "$@"
  judge claude "$label" "$want"
  cl_out=$OUT; cl_rc=$RC; cl_decision=$DECISION; cl_reason=$REASON_TEXT
  OUT=$cx_out; RC=$cx_rc; DECISION=$cx_decision; REASON_TEXT=$cx_reason
  case "$want" in
    ask) judge conv "$label [codex-shaped]" deny "$CODEX_LEAD"$'\n'"$cl_reason" ;;
    deny) judge same "$label [codex-shaped]" deny "$cl_reason" ;;
    *) judge same "$label [codex-shaped]" "$want" ;;
  esac
  OUT=$cl_out; RC=$cl_rc; DECISION=$cl_decision; REASON_TEXT=$cl_reason
  return 0
}
reason_has()   { case "$REASON_TEXT" in *"$2"*) verdict claude pass "$1" ;; *) verdict claude fail "$1 [reason: $REASON_TEXT]" ;; esac; }
notice_has()   { case "$NOTICE_TEXT" in *"$2"*) verdict claude pass "$1" ;; *) verdict claude fail "$1 [notice: $NOTICE_TEXT]" ;; esac; }
notice_none()  { if [ -z "$NOTICE_TEXT" ]; then verdict claude pass "$1"; else verdict claude fail "$1 [notice: $NOTICE_TEXT]"; fi; }
reason_lacks() { case "$OUT" in *"$2"*) verdict claude fail "$1" ;; *) verdict claude pass "$1" ;; esac; }   # never prints the needle

new_repo() { # new_repo <dir>: branch main with one commit (README.md, deploy.key) and a feature branch
  mkdir -p "$1" && git init -q "$1" && git -C "$1" symbolic-ref HEAD refs/heads/main || return 1
  printf '# fixture\n' > "$1/README.md"
  printf 'placeholder, not a real key\n' > "$1/deploy.key"
  git -C "$1" add README.md deploy.key && git -C "$1" commit -q -m init && git -C "$1" branch feature
}

make_bin() { # make_bin <dir> <tool>...: a PATH directory that holds only these tools (Git Bash: see put_tool in handoff-hook.test.sh)
  local d=$1 t p w=; shift; case $(uname -s) in MINGW*|MSYS*|CYGWIN*) w=1 ;; esac
  mkdir -p "$d"
  for t in "$@"; do
    p=$(command -v "$t" 2>/dev/null)
    case "$p" in /*) if [ -n "$w" ]; then printf '#!%s\nexec "%s" "$@"\n' "$BASH" "$p" > "$d/$t" && chmod +x "$d/$t"; else ln -sf "$p" "$d/$t"; fi ;; esac
  done
}

# fake secrets: each literal is split so the whole value never appears in this file
FAKE_AWS="AKIA""TESTONLYEXAMPLE0"
FAKE_ANTHROPIC="sk-ant-""api03-testonlyfakevalue0000000000"
FAKE_GH="ghp_""testonlyfakevalue000000000000000"
FAKE_GH_PAT="github_pat_""testonly_fake_value_0000000000000"
FAKE_SLACK="xoxb-""0000000000-testonlyfake"
FAKE_STRIPE="sk_live_""testonlyfakevalue000"
FAKE_PEM="-----BEGIN RSA PRIVATE"" KEY-----"

echo "guardrails test"
echo "hook under test: $LABEL"
echo "bash: $(bash -c 'echo $BASH_VERSION'), git: $(git --version | cut -d' ' -f3)"

# ---------------------------------------------------------------- fixtures
R="$TMP/repo"          # on main: untracked .env, staged clean notes.txt, tracked deploy.key modified
RF="$TMP/repo-feature" # on feature
RS="$TMP/repo-secret"  # staged content is swapped per case
RA="$TMP/repo-add"     # untracked app.js with a key, README.md gains a key line, clean.txt
RI="$TMP/repo-ignored" # .env present but listed in .gitignore
RD="$TMP/repo-remove"  # a committed .env.production staged for removal
RU="$TMP/repo-upstream" # branch topic pushes to origin/main (push.default=upstream)
RCFG="$TMP/repo-config"  # .skilliton/config.json rewritten per case
RDH="$TMP/repo-detached" # HEAD detached, so there is no current branch
RMANY="$TMP/repo-many"   # 2001 new files, more than guardrails scans for secrets
for d in "$R" "$RF" "$RS" "$RA" "$RI" "$RD" "$RU" "$RCFG" "$RDH" "$RMANY"; do
  new_repo "$d" || { echo "FAIL: could not build fixture repository $d"; exit 1; }
done
printf 'SECRET=placeholder\n' > "$R/.env"
printf 'meeting notes\n' > "$R/notes.txt"; git -C "$R" add notes.txt
printf 'changed placeholder\n' >> "$R/deploy.key"
git -C "$RF" checkout -q feature
printf 'const key = "%s";\n' "$FAKE_AWS" > "$RA/app.js"
printf 'aws = %s\n' "$FAKE_AWS" >> "$RA/README.md"
printf 'hello\n' > "$RA/clean.txt"
printf '.env\n' > "$RI/.gitignore"; git -C "$RI" add .gitignore; git -C "$RI" commit -q -m ignore
printf 'SECRET=placeholder\n' > "$RI/.env"
printf 'SECRET=placeholder\n' > "$RD/.env.production"; git -C "$RD" add .env.production; git -C "$RD" commit -q -m mistake
git -C "$RD" rm -q --cached .env.production
git init -q --bare "$TMP/remote.git"
git -C "$RU" remote add origin "$TMP/remote.git" && git -C "$RU" push -q origin main feature 2>/dev/null \
  && git -C "$RU" checkout -q -b topic --track origin/main && git -C "$RU" config push.default upstream \
  || { echo "FAIL: could not build the upstream fixture"; exit 1; }
printf 'SECRET=placeholder\n' > "$RCFG/.env"; mkdir -p "$RCFG/.skilliton"
write_config() { printf '%s\n' "$1" > "$RCFG/.skilliton/config.json"; }
git -C "$RDH" checkout -q --detach || { echo "FAIL: could not build the detached HEAD fixture"; exit 1; }
i=0; while [ "$i" -lt 2001 ]; do : > "$RMANY/new-$i.txt"; i=$((i + 1)); done
NOREPO="$TMP/not-a-repo"; mkdir -p "$NOREPO"      # a folder that is not a git repository
NOFIND="$TMP/bin-nofind"; make_bin "$NOFIND" bash cat env jq git awk grep
BADAWK="$TMP/bin-badawk"; make_bin "$BADAWK" bash cat env jq git grep find
printf '#!/bin/sh\nexit 1\n' > "$BADAWK/awk"; chmod +x "$BADAWK/awk"   # an awk that always fails
TOO_LARGE=$(head -c 4000000 /dev/zero | tr '\0' 'x')   # with "git status " in front, over the hook's size limit

# ---------------------------------------------------------------- packaging
section "packaging: hooks.json and executable bits (Claude Code runs the scripts by path)"
HJ="$SHIPPED_DIR/hooks.json"
jq_true() { if jq -e "$2" "$HJ" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }
jq_true "PreToolUse has three entries: Bash, the file-writing tools, then the text-writing tools" '(.hooks.PreToolUse | length) == 3 and .hooks.PreToolUse[0].matcher == "Bash" and .hooks.PreToolUse[1].matcher == "Write|Edit|MultiEdit|NotebookEdit" and .hooks.PreToolUse[2].matcher == "Write|Edit|MultiEdit"'
jq_true "PreToolUse runs guard-bash.sh by path, in bash, with timeout 10" '.hooks.PreToolUse[0].hooks == [{"type":"command","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/guard-bash.sh","shell":"bash","timeout":10}]'
jq_true "SessionStart runs session-start-guardrails.sh by path, in bash" '.hooks.SessionStart == [{"hooks":[{"type":"command","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/session-start-guardrails.sh","shell":"bash"}]}]'
jq_true "no if filter anywhere (compound commands must reach the hook)" '[.. | objects | has("if")] | any | not'
jq_true "the write entry runs lane-write-guard.mjs by path, in bash, with timeout 5" '.hooks.PreToolUse[1].hooks == [{"type":"command","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/lane-write-guard.mjs","shell":"bash","timeout":5}]'
jq_true "the third entry runs managed-block-guard.mjs by path, in bash, with timeout 5" '.hooks.PreToolUse[2].hooks == [{"type":"command","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/managed-block-guard.mjs","shell":"bash","timeout":5}]'
if [ -x "$HOOK" ]; then ok "guard-bash.sh is executable"; else bad "guard-bash.sh is not executable"; fi
if [ -x "$WHOOK" ]; then ok "lane-write-guard.mjs is executable"; else bad "lane-write-guard.mjs is not executable"; fi
if [ -x "$MHOOK" ]; then ok "managed-block-guard.mjs is executable"; else bad "managed-block-guard.mjs is not executable"; fi
if [ -x "$SS" ]; then ok "session-start-guardrails.sh is executable"; else bad "session-start-guardrails.sh is not executable"; fi

# ---------------------------------------------------------------- rule 1: force push
section "deny: force-push to a protected branch"
expect "git push --force origin main"                 deny "$R" 'git push --force origin main'
reason_has "force-push reason names the branch and the safe alternative" "shared main branch"
reason_has "force-push reason ends with what to do instead" "open a pull request instead."
expect "git push -f origin main"                      deny "$R" 'git push -f origin main'
expect "git push --force-with-lease origin main"      deny "$R" 'git push --force-with-lease origin main'
expect "git push --force-with-lease=main:abc origin main" deny "$R" 'git push --force-with-lease=main:abc origin main'
expect "git push --force-w origin main (abbreviation git accepts)" deny "$R" 'git push --force-w origin main'
expect "git push origin main --force (flag after)"    deny "$R" 'git push origin main --force'
expect "git push -uf origin main (combined flags)"    deny "$R" 'git push -uf origin main'
expect "git push origin +main (plus refspec)"         deny "$R" 'git push origin +main'
expect "git push origin +HEAD:main"                   deny "$R" 'git push origin +HEAD:main'
expect "git push --force origin feature:main"         deny "$R" 'git push --force origin feature:main'
expect "git push --force origin refs/heads/main"      deny "$R" 'git push --force origin refs/heads/main'
expect "git push --force origin master"               deny "$R" 'git push --force origin master'
expect "git push -f (no branch named, on main)"       deny "$R" 'git push -f'
reason_has "current-branch reason says you are on main" "you are on the shared main branch"
expect "git push --force origin (remote only, on main)" deny "$R" 'git push --force origin'
expect "git push -f origin HEAD (on main)"            deny "$R" 'git push -f origin HEAD'
expect "git push -f (on topic, which pushes to origin/main)" deny "$RU" 'git push -f'
expect "git push --mirror"                            deny "$R" 'git push --mirror origin'
expect "git push --force --all"                       deny "$R" 'git push --force --all origin'
section "deny: the same force-push inside compound commands"
expect "cd repo && git push --force origin main"      deny "$TMP" 'cd repo && git push --force origin main'
expect "cd repo && git push -f (cd followed to main)" deny "$TMP" 'cd repo && git push -f'
expect "git -C repo push -f (no branch, -C followed)" deny "$TMP" 'git -C repo push -f'
expect "git status; git push -f origin main"          deny "$R" 'git status; git push -f origin main'
expect "true || git push --force origin main"         deny "$R" 'true || git push --force origin main'
expect "npm test | git push -f origin main"           deny "$R" 'npm test | git push -f origin main'
expect "two lines, second is the force-push"          deny "$R" $'git fetch origin\ngit push --force origin main'
# Found by this test: the raw-input fast path saw "\ngit" (JSON-escaped newline) as no git word at
# all and allowed the call unread. Pinned with a first line that does not mention git.
expect "echo hi, newline, force-push (JSON \\n before git)" deny "$R" $'echo hi\ngit push --force origin main'
expect "echo hi; tab, force-push (JSON \\t before git)" deny "$R" $'echo hi;\tgit push --force origin main'
expect "(git push -f origin main) subshell"           deny "$R" '(git push -f origin main)'
expect "FOO=1 git push -f origin main (env assignment)" deny "$R" 'FOO=1 git push -f origin main'
expect "sudo git push -f origin main"                 deny "$R" 'sudo git push -f origin main'
expect "/usr/bin/git push -f origin main (full path)" deny "$R" '/usr/bin/git push -f origin main'
expect "line continuation before --force"             deny "$R" $'git push \\\n  --force origin main'
section "allow: force-push rules must not fire on ordinary pushes (negative controls)"
expect "git push origin feature"                      allow "$R" 'git push origin feature'
expect "git push -f origin feature"                   allow "$R" 'git push -f origin feature'
expect "git push --force-with-lease origin feature"   allow "$R" 'git push --force-with-lease origin feature'
expect "git push origin +feature"                     allow "$R" 'git push origin +feature'
expect "git push origin main (no force)"              allow "$R" 'git push origin main'
expect "git push -u origin HEAD (no force)"           allow "$R" 'git push -u origin HEAD'
expect "git push -f (on feature)"                     allow "$RF" 'git push -f'
expect "git push -f origin HEAD (on feature)"         allow "$RF" 'git push -f origin HEAD'
expect "cd repo-feature && git push -f"               allow "$TMP" 'cd repo-feature && git push -f'
expect "git push --force origin main:feature"         allow "$R" 'git push --force origin main:feature'

# ---------------------------------------------------------------- rule 2: skipping hooks
section "deny: skipping git hooks"
expect "git commit --no-verify -m x"                  deny "$R" 'git commit --no-verify -m "x"' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
reason_has "no-verify reason ends with what to do instead" "instead of skipping it."
expect "git commit -n -m x"                           deny "$R" 'git commit -n -m "x"'
expect "git commit -nm x (combined)"                  deny "$R" 'git commit -nm "x"'
expect "git commit -anm x (combined)"                 deny "$R" 'git commit -anm "x"'
expect "git commit --no-veri -m x (abbreviation git accepts)" deny "$R" 'git commit --no-veri -m "x"'
expect "git push --no-verify origin feature"          deny "$R" 'git push --no-verify origin feature' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
expect "cd repo && git commit --no-verify -m x"       deny "$TMP" 'cd repo && git commit --no-verify -m "x"' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
# ---------------------------------------------------------------- the shell's own startup file
# BASH_ENV names a file the shell runs before the first line of any script it starts, including this hook. A careless
# setting is reported; a deliberate one cannot be, because the file it names runs first and can end the shell. Both
# are measured here so that the limit is a written-down fact rather than a surprise, and so a change in bash's
# behaviour shows up as a failing test.
section "the shell's own startup file"
printf ': ordinary\n' > "$TMP/bashenv-ordinary.sh"
printf 'exit 0\n' > "$TMP/bashenv-quiet.sh"
expect "BASH_ENV set: a command that would be denied asks instead" ask "$R" 'git commit --no-verify -m "x"' "BASH_ENV=$TMP/bashenv-ordinary.sh" # skilliton-audit: allow verification-off a test case that runs the flag at the guard
reason_has "the reason names the variable" "BASH_ENV"
expect "known limit: BASH_ENV naming a file that ends the shell silences the hook" allow "$R" 'git commit --no-verify -m "x"' "BASH_ENV=$TMP/bashenv-quiet.sh" # skilliton-audit: allow verification-off a test case that runs the flag at the guard
expect "known limit: SHELLOPTS=noexec silences the hook, and cannot be reported" allow "$R" 'git commit --no-verify -m "x"' "SHELLOPTS=noexec" # skilliton-audit: allow verification-off a test case that runs the flag at the guard
# ENV is read by an interactive shell only, so it has no power over a hook and must not change a decision here: a
# refusal that a powerless variable can turn into a question is a way to be allowed past this check.
expect "ENV set: a command that would be denied is still denied" deny "$R" 'git commit --no-verify -m "x"' "ENV=$TMP/bashenv-quiet.sh" # skilliton-audit: allow verification-off a test case that runs the flag at the guard
# A function exported into the environment is imported before the first line of the hook and can replace a program
# it uses. Unlike BASH_ENV it can be seen from inside, so it is reported rather than only written down.
expect "an exported shell function: a command that would be denied asks instead" ask "$R" 'git commit --no-verify -m "x"' 'BASH_FUNC_jq%%=() { true; }' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
reason_has "the reason names what was found" "exports shell functions"

section "allow: flags that only look similar (negative controls)"
expect "git commit -m \"add -n flag docs\" (quoted message)" allow "$R" 'git commit -m "add -n flag docs"'
expect "git commit -mn (message is the letter n)"     allow "$R" 'git commit -mn'
expect "git push -n origin feature (dry run)"         allow "$R" 'git push -n origin feature'
expect "git log -n 5"                                 allow "$R" 'git log -n 5'

# ---------------------------------------------------------------- rule 3: secret files and content
section "deny: staging or committing secret-shaped files"
# The environment must not be able to decide which files this check reads. GIT_INDEX_FILE names the index git uses,
# so an index of someone else's choosing would leave a staged secret out of every list the hook looks at. The
# decoy is built first and proved to narrow plain git, so the deny below means the hook scrubbed it.
RX="$TMP/repo-index"; new_repo "$RX"
printf 'TOKEN=not-a-real-value\n' > "$RX/.env"; git -C "$RX" add .env
GIT_INDEX_FILE="$TMP/decoy.index" git -C "$RX" read-tree --empty
DECOY_LIST=$(GIT_INDEX_FILE="$TMP/decoy.index" git -C "$RX" diff --cached --name-only --diff-filter=d | wc -l | tr -d ' ')
REAL_LIST=$(git -C "$RX" diff --cached --name-only --diff-filter=d | wc -l | tr -d ' ')
if [ "$DECOY_LIST" = 0 ] && [ "$REAL_LIST" != 0 ]; then verdict claude pass "the decoy index really narrows plain git (real $REAL_LIST staged, decoy $DECOY_LIST)"
else verdict claude fail "the decoy index does not narrow plain git (real $REAL_LIST staged, decoy $DECOY_LIST), so the case below would prove nothing"; fi
expect "GIT_INDEX_FILE cannot hide a staged secret from the check" deny "$RX" 'git commit -m "x"' "GIT_INDEX_FILE=$TMP/decoy.index"
expect "git add .env"                                 deny "$R" 'git add .env'
reason_has "secret-file reason names the file and rule" ".env looks like a file that holds passwords or keys (it matches the .env rule)"
expect "git add -A (untracked .env present)"          deny "$R" 'git add -A'
expect "git add . (untracked .env present)"           deny "$R" 'git add .'
expect "git add --all (untracked .env present)"       deny "$R" 'git add --all'
expect "git commit -am x (tracked deploy.key modified)" deny "$R" 'git commit -am "x"'
reason_has "commit -a reason names deploy.key" "deploy.key"
expect "git commit -a -m x"                           deny "$R" 'git commit -a -m "x"'
expect "git commit --all -m x"                        deny "$R" 'git commit --all -m "x"'
for name in .env.local .env.production server.pem private.key cert.p12 cert.pfx release.keystore id_rsa id_ed25519 aws_credentials.csv user_accessKeys.csv prod-api-key.txt config/.env '*.pem'; do
  expect "git add $name (name rule)"                  deny "$R" "git add $name"
done
printf 'SECRET=placeholder\n' > "$RS/.env.production"; git -C "$RS" add .env.production
expect "git commit -m x with .env.production staged"  deny "$RS" 'git commit -m "x"'
git -C "$RS" reset -q; rm -f "$RS/.env.production"
section "allow: names that are not secrets (negative controls)"
for name in .env.example .env.sample .env.template id_rsa.pub keys.md monkey.txt README.md notes.txt; do
  expect "git add $name"                              allow "$R" "git add $name"
done
expect "git add \"\" (empty pathspec, no crash)"      allow "$R" 'git add ""'
expect "git commit -m fix (staged content is clean)"  allow "$R" 'git commit -m "fix"'
expect "git add -A (.env is gitignored)"              allow "$RI" 'git add -A'
expect "git add .env (gitignored, but typed by name)" deny "$RI" 'git add .env'
expect "git commit (staged removal of .env.production)" allow "$RD" 'git commit -m "stop tracking env file"'

section "deny: staged content shaped like a secret (each pattern must fire)"
i=0
for pair in "FAKE_AWS|AWS access key ID" "FAKE_ANTHROPIC|Anthropic API key" "FAKE_GH|GitHub access token" \
            "FAKE_GH_PAT|GitHub fine-grained token" "FAKE_SLACK|Slack token" "FAKE_STRIPE|Stripe live secret key" "FAKE_PEM|private key"; do
  var=${pair%%|*}; label=${pair#*|}; value=${!var}
  printf 'line one\nconst token = "%s";\n' "$value" > "$RS/config.js"
  git -C "$RS" add config.js
  expect "git commit -m x with $label staged in config.js" deny "$RS" 'git commit -m "add config"'
  reason_has "  reason names config.js and the rule ($label)" "config.js contain text shaped like"
  reason_has "  reason names the rule ($label)" "$label"
  reason_lacks "  reason does not contain the secret value ($label)" "$value"
  reason_lacks "  reason does not contain the secret's tail ($label)" "${value#????????}"
  git -C "$RS" reset -q; rm -f "$RS/config.js"
  i=$((i + 1))
done
printf 'const token = process.env.TOKEN;\n' > "$RS/config.js"; git -C "$RS" add config.js
expect "git commit -m x with clean config.js staged"  allow "$RS" 'git commit -m "add config"'
git -C "$RS" reset -q; rm -f "$RS/config.js"

section "deny: content checked when it is staged, and in add-then-commit"
expect "git add app.js (new file holds a key)"        deny "$RA" 'git add app.js'
reason_has "add reason names app.js" "app.js contains text shaped like an AWS access key ID"
reason_lacks "add reason does not contain the key" "$FAKE_AWS"
expect "git add README.md (tracked file gains a key line)" deny "$RA" 'git add README.md'
reason_lacks "tracked-file reason does not contain the key" "$FAKE_AWS"
expect "git add app.js && git commit -m x"            deny "$RA" 'git add app.js && git commit -m "add app"'
expect "git add clean.txt"                            allow "$RA" 'git add clean.txt'

# ---------------------------------------------------------------- ask rules
# A function, so the mutation check at the end can run the same checks against a broken copy.
ask_rule_checks() {
  section "ask: commands that throw away uncommitted work (a deny with the ask reason inside, for Codex-shaped input)"
  expect "git reset --hard"                             ask "$R" 'git reset --hard'
  reason_has "reset reason ends with what to do instead" "confirm only if losing it is intended."
  expect "git reset --hard HEAD~1"                      ask "$R" 'git reset --hard HEAD~1'
  expect "git clean -f"                                 ask "$R" 'git clean -f'
  expect "git clean -fd"                                ask "$R" 'git clean -fd'
  expect "git clean -xdf"                               ask "$R" 'git clean -xdf'
  expect "git checkout -- ."                            ask "$R" 'git checkout -- .'
  expect "git checkout ."                               ask "$R" 'git checkout .'
  expect "git restore ."                                ask "$R" 'git restore .'
  expect "git restore --staged --worktree ."            ask "$R" 'git restore --staged --worktree .'
  expect "git stash drop"                               ask "$R" 'git stash drop'
  expect "git stash drop stash@{1}"                     ask "$R" 'git stash drop stash@{1}'
  expect "git stash clear"                              ask "$R" 'git stash clear'
  expect "git branch -D feature"                        ask "$R" 'git branch -D feature'
  expect "git branch --delete --force feature"          ask "$R" 'git branch --delete --force feature'
  section "allow: safe neighbours of the ask rules (negative controls)"
  expect "git reset --soft HEAD~1"                      allow "$R" 'git reset --soft HEAD~1'
  expect "git reset HEAD notes.txt"                     allow "$R" 'git reset HEAD notes.txt'
  expect "git clean -n"                                 allow "$R" 'git clean -n'
  expect "git clean -fn (dry run)"                      allow "$R" 'git clean -fn'
  expect "git checkout feature"                         allow "$R" 'git checkout feature'
  expect "git checkout -b topic"                        allow "$R" 'git checkout -b topic'
  expect "git restore --staged ."                       allow "$R" 'git restore --staged .'
  expect "git stash"                                    allow "$R" 'git stash'
  expect "git stash list"                               allow "$R" 'git stash list'
  expect "git branch -d feature"                        allow "$R" 'git branch -d feature'
}
SECT_ALL=$SEEN_ALL; SECT_CONV=$SEEN_CONV
ask_rule_checks
SECT_ALL=$((SEEN_ALL - SECT_ALL)); SECT_CONV=$((SEEN_CONV - SECT_CONV))
section "precedence: any segment that denies decides the call"
expect "git reset --hard && git push --force origin main" deny "$R" 'git reset --hard && git push --force origin main'
expect "git push -f origin main; git reset --hard"    deny "$R" 'git push -f origin main; git reset --hard'

# ---------------------------------------------------------------- not git at all
section "allow: commands that only mention git (negative controls)"
expect "git status"                                   allow "$R" 'git status'
expect "ls -la"                                       allow "$R" 'ls -la'
expect "echo \"remember to git push --force origin main\"" allow "$R" 'echo "remember to git push --force origin main"'
expect "echo \"a; git push --force origin main\" (separator inside quotes)" allow "$R" 'echo "a; git push --force origin main"'
expect "echo 'git commit --no-verify' single quotes"  allow "$R" "echo 'git commit --no-verify'" # skilliton-audit: allow verification-off a test that the guard does not fire on the flag inside a quoted string
expect "grep -rn \"git reset --hard\" docs/"          allow "$R" 'grep -rn "git reset --hard" docs/'
expect "heredoc body mentioning a force-push"         allow "$R" $'cat <<\'EOF\' > notes.md\ngit push --force origin main\ngit commit --no-verify\nEOF' # skilliton-audit: allow verification-off a test that the guard does not fire on the flag inside a heredoc body
expect "heredoc body, then a real force-push after it" deny "$R" $'cat <<EOF > notes.md\nhello\nEOF\ngit push --force origin main'
expect "# comment mentioning git push -f origin main" allow "$R" 'ls # git push -f origin main'
expect "git log --oneline | grep force"               allow "$R" 'git log --oneline | grep force'

# ---------------------------------------------------------------- hook input robustness
section "input: malformed or partial hook input never becomes silent permission"
OUT=$(printf 'not json at all, but it says git push --force origin main' | env CLAUDE_PROJECT_DIR="$R" "$HOOK" 2>/dev/null); RC=$?
case "$OUT" in *'"permissionDecision":"ask"'*) ok "unreadable JSON that mentions git -> ask" ;; *) bad "unreadable JSON that mentions git did not ask (exit $RC)" ;; esac
# a hook that crashes (here: an unset variable under set -u) must not turn into silent permission
awk '/^  walk_segments$/ { print "  : \"$GUARDRAILS_TEST_UNSET\"" } { print }' "$HOOK" > "$TMP/crash-before.sh"
awk '{ print } /^  walk_segments$/ { print "  : \"$GUARDRAILS_TEST_UNSET\"" }' "$HOOK" > "$TMP/crash-after.sh"
if grep -q GUARDRAILS_TEST_UNSET "$TMP/crash-before.sh" && grep -q GUARDRAILS_TEST_UNSET "$TMP/crash-after.sh"; then
  payload "$R" 'git status' > "$TMP/payload.json"
  OUT=$(env CLAUDE_PROJECT_DIR="$R" bash "$TMP/crash-before.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?
  case "$RC|$OUT" in '0|'*'"permissionDecision":"ask"'*'internal error'*) ok "crash before deciding, git command -> ask, exit 0" ;; *) bad "crash before deciding: exit $RC, output: $OUT" ;; esac
  payload "$R" 'git push --force origin main' > "$TMP/payload.json"
  OUT=$(env CLAUDE_PROJECT_DIR="$R" bash "$TMP/crash-after.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?
  case "$RC|$OUT" in '0|'*'"permissionDecision":"deny"'*) ok "crash after a deny was decided -> still deny, exit 0" ;; *) bad "crash after deny: exit $RC, output: $OUT" ;; esac
  payload "$R" 'ls -la' > "$TMP/payload.json"
  OUT=$(env CLAUDE_PROJECT_DIR="$R" bash "$TMP/crash-before.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?
  if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then ok "crash path is never reached for a command without git"; else bad "non-git command with crashing copy: exit $RC, output: $OUT"; fi
else
  bad "could not build the crashing copies (walk_segments call not found in the hook under test)"
fi
OUT=$(printf '' | env CLAUDE_PROJECT_DIR="$R" "$HOOK" 2>/dev/null); RC=$?
if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then ok "empty stdin -> allow, exit 0"; else bad "empty stdin -> exit $RC, output: $OUT"; fi
OUT=$(printf '{"cwd":"%s","tool_name":"Bash","tool_input":{}}' "$R" | env CLAUDE_PROJECT_DIR="$R" "$HOOK" 2>/dev/null); RC=$?
if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then ok "no tool_input.command -> allow, exit 0"; else bad "no tool_input.command -> exit $RC, output: $OUT"; fi

# ---------------------------------------------------------------- shell strings the hook cannot read (B51, 2026-09-21)
section "a string handed to a shell or eval that names git asks; one that does not, allows"
expect "a shell string naming git asks: bash -c" ask "$R" "bash -c 'git push -f origin main'"
expect "a shell string naming git asks: sh -c"   ask "$R" 'sh -c "git push --force origin main"'
expect "a shell string naming git asks: eval"    ask "$R" "eval 'git push -f origin main'"
reason_has "the ask says the hook cannot read inside the string" "cannot read inside such a string"
expect "a shell string naming git asks: xargs"   ask "$R" "echo main | xargs -I{} git push -f origin {}"
expect "a shell string without git allows"       allow "$R" "bash -c 'echo hi'"

# ---------------------------------------------------------------- settings
section "settings: .skilliton/config.json"
write_config '{"guardrails":{"blockForcePush":false}}'
expect "blockForcePush false: git push -f origin main" allow "$RCFG" 'git push -f origin main'
notice_has "  and the command it lets through says the setting let it through (B50)" '"blockForcePush": false under guardrails in .skilliton/config.json'
expect "blockForcePush false: an ordinary push" allow "$RCFG" 'git push origin feature'
notice_none "  says nothing, because no rule would have refused it"
expect "blockForcePush false: --no-verify still blocked" deny "$RCFG" 'git commit --no-verify -m "x"' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
write_config '{"guardrails":{"blockNoVerify":false}}'
expect "blockNoVerify false: git commit --no-verify"   allow "$RCFG" 'git commit --no-verify -m "x"' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
notice_has "  and says the setting let it through" '"blockNoVerify": false'
expect "blockNoVerify false: git push --no-verify origin feature" allow "$RCFG" 'git push --no-verify origin feature' # skilliton-audit: allow verification-off a test case that runs the flag at the guard
expect "blockNoVerify false: force-push still blocked" deny "$RCFG" 'git push -f origin main'
write_config '{"guardrails":{"blockSecretFiles":false}}'
expect "blockSecretFiles false: git add .env"          allow "$RCFG" 'git add .env'
notice_has "  and says the setting let it through" '"blockSecretFiles": false'
write_config '{"guardrails":{"protectedBranches":["release/*"]}}'
expect "protectedBranches [release/*]: push -f origin main" allow "$RCFG" 'git push -f origin main'
expect "protectedBranches [release/*]: push -f origin release/1.0" deny "$RCFG" 'git push -f origin release/1.0'
write_config '{"guardrails":{"blockForcePush":"no","blockNoVerify":0}}'
expect "non-boolean values leave rules on (force-push)" deny "$RCFG" 'git push -f origin main'
expect "non-boolean values leave rules on (--no-verify)" deny "$RCFG" 'git commit -n -m "x"' # skilliton-audit: allow verification-off a test case name for the abbreviated form of the flag
write_config '{"guardrails":{"blockForcePush":false,"blockNoVerify":false,"blockSecretFiles":false}}'
expect "every rule off: ask rules still ask"           ask "$RCFG" 'git reset --hard'
write_config '{"handoff":{"file":"docs/HANDOFF.md"}}'
expect "config without a guardrails section: defaults" deny "$RCFG" 'git push -f origin main'
write_config '{"guardrails": '
expect "unreadable config: defaults stay on"           deny "$RCFG" 'git push -f origin main'
reason_has "unreadable config: the reason says the config could not be read" ".skilliton/config.json could not be read"
write_config '{"guardrails":{"blockForcePush":false}}'
expect "config read from CLAUDE_PROJECT_DIR (rule off there)" allow "$R" 'git push -f origin main' CLAUDE_PROJECT_DIR="$RCFG"
expect "config falls back to the input cwd"           allow "$RCFG" 'git push -f origin main' CLAUDE_PROJECT_DIR=
rm -f "$RCFG/.skilliton/config.json"

# ---------------------------------------------------------------- rule 4: what Skilliton keeps (B61)
section "deny: removing what Skilliton keeps in a prepared project"
write_config '{"version":1}'
mkdir -p "$RCFG/docs/tasks" "$RCFG/sub"
expect "rm -rf .skilliton"                          deny "$RCFG" 'rm -rf .skilliton'
reason_has "  the reason names the one sanctioned route" "skilliton remove --apply"
reason_has "  the reason names the setting that turns it off" '"protectRecords": false'
expect "rm .skilliton/config.json"                  deny "$RCFG" 'rm .skilliton/config.json'
expect "rm -r docs (the folder that holds the records)" deny "$RCFG" 'rm -r docs'
expect "rm docs/HANDOFF.md"                         deny "$RCFG" 'rm docs/HANDOFF.md'
expect "rm -- docs/STATUS.md (after end of options)" deny "$RCFG" 'rm -- docs/STATUS.md'
expect "rm DECISIONS.md"                            deny "$RCFG" 'rm DECISIONS.md'
expect "rm an entry in the tasks folder"            deny "$RCFG" 'rm docs/tasks/2026-09-22-one-0001.md'
expect "rmdir docs/lessons"                         deny "$RCFG" 'rmdir docs/lessons'
expect "rm CLAUDE.md (carries the managed block)"   deny "$RCFG" 'rm CLAUDE.md'
expect "rm AGENTS.md"                               deny "$RCFG" 'rm AGENTS.md'
expect "/bin/rm -rf .skilliton"                     deny "$RCFG" '/bin/rm -rf .skilliton'
expect "git rm -r --cached .skilliton"              deny "$RCFG" 'git rm -r --cached .skilliton'
expect "git rm docs/STATUS.md"                      deny "$RCFG" 'git rm docs/STATUS.md'
expect "git -C sub rm ../CLAUDE.md"                 deny "$RCFG" 'git -C sub rm ../CLAUDE.md'
expect "mv .skilliton elsewhere"                    deny "$RCFG" 'mv .skilliton /tmp/gone'
expect "mv docs/STATUS.md old.md"                   deny "$RCFG" 'mv docs/STATUS.md old.md'
expect "mv -t /tmp docs/BACKLOG.md"                 deny "$RCFG" 'mv -t /tmp docs/BACKLOG.md'
# From a subfolder, Claude Code still names the project root in CLAUDE_PROJECT_DIR, so these cases pass it.
expect "rm -rf ../.skilliton from a subfolder"      deny "$RCFG/sub" 'rm -rf ../.skilliton' CLAUDE_PROJECT_DIR="$RCFG"
expect "cd .. && rm -rf docs from a subfolder"      deny "$RCFG/sub" 'cd .. && rm -rf docs' CLAUDE_PROJECT_DIR="$RCFG"
expect "  the same with no project dir given: the root comes from git" deny "$RCFG/sub" 'cd .. && rm -rf docs' CLAUDE_PROJECT_DIR=
expect "cd docs && rm STATUS.md"                    deny "$RCFG" 'cd docs && rm STATUS.md'
expect "rm -rf * at the project root"               deny "$RCFG" 'rm -rf *'
expect "rm -rf . at the project root"               deny "$RCFG" 'rm -rf .'
expect "rm -rf .. from a subfolder"                 deny "$RCFG/sub" 'rm -rf ..' CLAUDE_PROJECT_DIR="$RCFG"
expect "the project root by its absolute path"      deny "$RCFG" "rm -rf $RCFG"
expect "a .skilliton folder in another repository"  deny "$RCFG" "rm -rf $R/.skilliton"
expect "a variable path whose text names the folder" deny "$RCFG" 'rm -rf "$TMP/x/.skilliton"'
expect "the same after a harmless command"          deny "$RCFG" 'echo hi; rm -rf .skilliton'

section "allow: removals that take nothing of Skilliton's (negative controls)"
expect "rm -rf node_modules"                        allow "$RCFG" 'rm -rf node_modules'
expect "rm docs/notes.md (not a record)"            allow "$RCFG" 'rm docs/notes.md'
expect "rm .skilliton-old (only starts like the folder)" allow "$RCFG" 'rm -rf .skilliton-old'
expect "rm -rf . from a subfolder (nothing of Skilliton's below it)" allow "$RCFG/sub" 'rm -rf .' CLAUDE_PROJECT_DIR="$RCFG"
expect "mv src/a.js src/b.js"                       allow "$RCFG" 'mv src/a.js src/b.js'
expect "mv a new entry INTO the tasks folder"       allow "$RCFG" 'mv new.md docs/tasks/'
expect "a variable path that cannot be resolved"    allow "$RCFG" 'rm -rf "$TMP/x"'
expect "the word rm in text"                        allow "$RCFG" 'echo rm docs'
expect "git rm of ordinary source"                  allow "$RCFG" 'git rm src/old.js'
expect "in a repository with no configuration, the records are not records" allow "$R" 'rm -rf docs'
expect "  but a .skilliton folder is protected wherever it is" deny "$R" 'rm -rf .skilliton'
write_config '{"version":1,"guardrails":{"protectRecords":false}}'
expect "protectRecords false: rm -rf docs"          allow "$RCFG" 'rm -rf docs'
expect "protectRecords false: rm -rf .skilliton"    allow "$RCFG" 'rm -rf .skilliton'
notice_has "  and says the setting let it through" '"protectRecords": false'
expect "protectRecords false: force-push still blocked" deny "$RCFG" 'git push -f origin main'
write_config '{"version":1,"prepare":{"artifacts":{"status":"notes/STATE.md"},"directories":{"tasks":"work/tasks"}}}'
expect "a record the project moved is protected where it is" deny "$RCFG" 'rm notes/STATE.md'
expect "an entry folder the project moved, likewise"         deny "$RCFG" 'rm -r work/tasks'
expect "the default place, once moved, is an ordinary file"  allow "$RCFG" 'rm docs/STATUS.md'
write_config '{"guardrails": '
expect "unreadable config: the rule stays on"       deny "$RCFG" 'rm -rf .skilliton'
rm -f "$RCFG/.skilliton/config.json"
rm -rf "$RCFG/docs" "$RCFG/sub"

section "SKILLITON_GUARDRAILS=off"
expect "off: git push --force origin main"             allow "$R" 'git push --force origin main' SKILLITON_GUARDRAILS=off
expect "off: git add .env"                             allow "$R" 'git add .env' SKILLITON_GUARDRAILS=off
expect "unset again: git push --force origin main"     deny "$R" 'git push --force origin main'
expect "off: rm -rf .skilliton"                        allow "$R" 'rm -rf .skilliton' SKILLITON_GUARDRAILS=off

# ---------------------------------------------------------------- SessionStart line
section "SessionStart line"
HEALTHY='[guardrails] on: force-push to protected branches, --no-verify, secret files, and removal of Skilliton'"'"'s files are blocked.' # skilliton-audit: allow verification-off the expected status line text, which names the checks
OFFLINE='[guardrails] OFF for this session (SKILLITON_GUARDRAILS=off). Force-push, --no-verify, secret-file and removal checks are not running.' # skilliton-audit: allow verification-off the expected status line text, which names the checks
ss() { # ss <project dir> [VAR=value...]: runs the SessionStart hook by path; sets OUT and RC
  local dir=$1; shift
  OUT=$(printf '{"hook_event_name":"SessionStart","source":"startup","session_id":"t","cwd":%s}' "$(jstr "$dir")" \
    | env CLAUDE_PROJECT_DIR="$dir" "$@" "$SS" 2>/dev/null); RC=$?
}
ss "$R"
if [ "$RC" -eq 0 ] && [ "$OUT" = "$HEALTHY" ]; then ok "healthy: exactly the on line"; else bad "healthy: exit $RC, got: $OUT"; fi
ss "$R" SKILLITON_GUARDRAILS=off
if [ "$RC" -eq 0 ] && [ "$OUT" = "$OFFLINE" ]; then ok "SKILLITON_GUARDRAILS=off: exactly the OFF line"; else bad "off: exit $RC, got: $OUT"; fi
write_config '{"guardrails":{"blockForcePush":false}}'
ss "$RCFG"
if [ "$OUT" = "[guardrails] on. Blocked: --no-verify, secret files, and removal of Skilliton's files. Turned off in .skilliton/config.json: force-push to protected branches." ]; then # skilliton-audit: allow verification-off the expected status line text, which names the checks
  ok "a rule turned off in the config is named in the line"
else bad "rule turned off not reported as expected: $OUT"; fi
# Codex-shaped SessionStart input (a model key) and no CLAUDE_PROJECT_DIR: the project comes from the input cwd
printf '{"session_id":"t","transcript_path":null,"cwd":%s,"hook_event_name":"SessionStart","model":"guardrails-test-model","source":"startup"}' "$(jstr "$RCFG")" > "$TMP/ss-codex.json"
OUT=$("$SS" < "$TMP/ss-codex.json" 2>/dev/null); RC=$?
if [ "$RC" -eq 0 ] && [ "$OUT" = "[guardrails] on. Blocked: --no-verify, secret files, and removal of Skilliton's files. Turned off in .skilliton/config.json: force-push to protected branches." ]; then # skilliton-audit: allow verification-off the expected status line text, which names the checks
  ok "Codex-shaped SessionStart input: the config is found from the input cwd"
else bad "Codex-shaped SessionStart input with a config: exit $RC, got: $OUT"; fi
printf '{"session_id":"t","transcript_path":null,"cwd":%s,"hook_event_name":"SessionStart","model":"guardrails-test-model","source":"startup"}' "$(jstr "$R")" > "$TMP/ss-codex.json"
OUT=$("$SS" < "$TMP/ss-codex.json" 2>/dev/null); RC=$?
if [ "$RC" -eq 0 ] && [ "$OUT" = "$HEALTHY" ]; then ok "Codex-shaped SessionStart input: exactly the on line"; else bad "Codex-shaped SessionStart input: exit $RC, got: $OUT"; fi
write_config '{"guardrails": '
ss "$RCFG"
case "$OUT" in "$HEALTHY"$'\n'*"could not be read"*) ok "unreadable config: on line plus a could-not-be-read line" ;; *) bad "unreadable config not reported: $OUT" ;; esac
rm -f "$RCFG/.skilliton/config.json"
mkdir -p "$TMP/lonely"; cp "$SS" "$TMP/lonely/"
OUT=$(printf '{}' | "$TMP/lonely/session-start-guardrails.sh" 2>/dev/null); RC=$?
case "$OUT" in *"did not run"*) [ "$RC" -eq 0 ] && ok "guard-bash.sh missing: SessionStart says the check did not run" || bad "guard-bash.sh missing: exit $RC" ;; *) bad "guard-bash.sh missing: silent or wrong: $OUT" ;; esac

# ---------------------------------------------------------------- no JSON reader at all
section "no jq, node, or python3 on PATH (bash and core tools only)"
NOP="$TMP/bin-noparser"
make_bin "$NOP" bash cat env dirname basename tr head tail wc ls mkdir rm sort cut date sed
for p in jq node python3; do
  if env PATH="$NOP" "$NOP/bash" -c "command -v $p" >/dev/null 2>&1; then bad "precondition: $p is still visible on the no-parser PATH"; else ok "precondition: $p is not on the no-parser PATH"; fi
done
np_hook() { # np_hook <cwd> <command> [VAR=value...]: like hook (SHAPE picks the input), with only bash and core tools on PATH
  local cwd=$1 cmd=$2; shift 2
  if [ "$SHAPE" = codex ]; then
    payload_codex "$cwd" "$cmd" > "$TMP/payload.json"
    OUT=$(env PATH="$NOP" "$@" "$NOP/bash" "$HOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?
  else
    payload "$cwd" "$cmd" > "$TMP/payload.json"
    OUT=$(env PATH="$NOP" CLAUDE_PROJECT_DIR="$cwd" "$@" "$NOP/bash" "$HOOK" < "$TMP/payload.json" 2>/dev/null); RC=$?
  fi
  read_result
}
NOPARSER_REASON='guardrails cannot inspect this git command because jq, node, and python3 are all missing; confirm it yourself'
np_hook "$R" 'git push --force origin main'
if [ "$RC" -eq 0 ] && [ "$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.permissionDecision + "|" + .hookSpecificOutput.permissionDecisionReason' 2>/dev/null)" = "ask|$NOPARSER_REASON" ]; then
  ok "git command -> ask with the cannot-inspect reason"
else bad "git command without a parser: exit $RC, output: $OUT"; fi
np_hook "$R" $'echo hi\ngit push --force origin main'
case "$OUT" in *'"permissionDecision":"ask"'*) ok "git on a second line (JSON \\n before it) -> ask" ;; *) bad "git on a second line without a parser: exit $RC, output: $OUT" ;; esac
np_hook "$R" 'ls -la'
if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then ok "ls -la -> allow"; else bad "ls -la without a parser: exit $RC, output: $OUT"; fi
mkdir -p "$TMP/github/project"
np_hook "$TMP/github/project" 'ls -la'
if [ "$RC" -eq 0 ] && [ -z "$OUT" ]; then ok "ls -la in a folder named github -> allow (the word git, not the substring)"; else bad "ls -la under a github folder: exit $RC, output: $OUT"; fi
OUT=$(printf '{"cwd":"%s"}' "$R" | env PATH="$NOP" CLAUDE_PROJECT_DIR="$R" "$NOP/bash" "$SS" 2>/dev/null); RC=$?
case "$OUT" in *"jq, node, and python3 are all missing"*) ok "SessionStart without a parser says so" ;; *) bad "SessionStart without a parser: exit $RC, output: $OUT" ;; esac

# ---------------------------------------------------------------- the node and python3 readers
BASE_TOOLS="bash cat env dirname git awk grep find head tr"
for P in node python3; do
  section "JSON reader fallback: only $P on PATH"
  BIN="$TMP/bin-$P"
  # shellcheck disable=SC2086
  make_bin "$BIN" $BASE_TOOLS "$P"
  if [ ! -e "$BIN/$P" ]; then bad "NOT RUN: $P is not installed, so its reader was not tested"; continue; fi
  for other in jq node python3; do
    [ "$other" = "$P" ] && continue
    if env PATH="$BIN" "$BIN/bash" -c "command -v $other" >/dev/null 2>&1; then bad "[$P] precondition: $other is visible, so $P may not be the reader under test"
    else ok "[$P] precondition: $other is not on PATH, so $P is the only JSON reader"; fi
  done
  expect "[$P] git push --force origin main"          deny "$R" 'git push --force origin main' PATH="$BIN"
  expect "[$P] git status"                            allow "$R" 'git status' PATH="$BIN"
  expect "[$P] quotes and backslashes, then force-push" deny "$R" 'echo "a \"quoted\" \\ word" && git push -f origin main' PATH="$BIN"
  expect "[$P] heredoc body"                          allow "$R" $'cat <<EOF > f.md\ngit push --force origin main\nEOF' PATH="$BIN"
  expect "[$P] non-ASCII commit message, clean staged content" allow "$R" $'git commit -m "caf\xc3\xa9 notes"' PATH="$BIN"
  expect "[$P] git reset --hard ($P reads the top-level turn_id and model keys)" ask "$R" 'git reset --hard' PATH="$BIN"
  payload "$R" 'git reset --hard' | jq -c '.tool_input.model = "guardrails-test-model" | .tool_input.turn_id = "guardrails-test-turn"' > "$TMP/payload.json"
  hook_file PATH="$BIN"
  judge claude "[$P] model and turn_id nested inside tool_input only: still Claude Code" ask
  printf 'const token = "%s";\n' "$FAKE_STRIPE" > "$RS/config.js"; git -C "$RS" add config.js
  expect "[$P] staged Stripe key"                     deny "$RS" 'git commit -m "x"' PATH="$BIN"
  reason_lacks "[$P] reason does not contain the key" "$FAKE_STRIPE"
  git -C "$RS" reset -q; rm -f "$RS/config.js"
  write_config '{"guardrails":{"blockForcePush":false,"protectedBranches":["main"]}}'
  expect "[$P] config turns force-push off"           allow "$RCFG" 'git push -f origin main' PATH="$BIN"
  write_config '{"guardrails":{"blockNoVerify":false}'
  expect "[$P] unreadable config keeps defaults"      deny "$RCFG" 'git commit -n -m "x"' PATH="$BIN"
  reason_has "[$P] and says the config could not be read" "could not be read"
  rm -f "$RCFG/.skilliton/config.json"
done

# ---------------------------------------------------------------- Codex: cannot decide
# Each place where guardrails cannot check a command asks under Claude Code. Codex would run the
# command anyway after an ask, so under Codex each must be a deny.
cannot_decide_checks() {
  local base j
  section "cannot decide: each path that asks under Claude Code is a deny under Codex, never silent permission"
  expect "cd \$UNKNOWN_DIR && git commit -m x (folder unknown, so the files cannot be listed)" ask "$TMP" 'cd "$UNKNOWN_DIR" && git commit -m "x"'
  expect "cd \$UNKNOWN_DIR && git add . (folder unknown)" ask "$TMP" 'cd "$UNKNOWN_DIR" && git add .'
  expect "cd \$UNKNOWN_DIR && git push --force --all origin (branches cannot be listed)" ask "$TMP" 'cd "$UNKNOWN_DIR" && git push --force --all origin'
  if git -C "$NOREPO" rev-parse --git-dir >/dev/null 2>&1; then
    verdict claude fail "precondition: $NOREPO is inside a git repository, so the not-a-repository case cannot run"
  else
    expect "git add . in a folder that is not a git repository" ask "$NOREPO" 'git add .'
  fi
  expect "git add --pathspec-from-file=paths.txt (the file list is not read)" ask "$R" 'git add --pathspec-from-file=paths.txt'
  expect "git push -f on a detached HEAD (the branch cannot be told)" ask "$RDH" 'git push -f'
  expect "git add . with 2001 new files (too many to scan)" ask "$RMANY" 'git add .'
  expect "find is not installed" ask "$R" 'git status' PATH="$NOFIND"
  expect "awk fails, so the command cannot be split" ask "$R" 'git status' PATH="$BADAWK"
  expect "a git command over 4000000 characters (too large to inspect in time)" ask "$R" "git status $TOO_LARGE"

  # no JSON reader: the input is never parsed, so the client comes from the raw text or the environment
  SHAPE=claude; np_hook "$R" 'git reset --hard'
  judge claude "no JSON reader, Claude-shaped input" ask "$NOPARSER_REASON"
  SHAPE=codex; np_hook "$R" 'git reset --hard'; SHAPE=claude
  judge conv "no JSON reader, Codex-shaped input (turn_id and model keys found in the text)" deny "$CODEX_LEAD"$'\n'"$NOPARSER_REASON"
  np_hook "$R" 'git reset --hard' PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge conv "no JSON reader, Claude-shaped input, PLUGIN_ROOT equal to CLAUDE_PLUGIN_ROOT" deny "$CODEX_LEAD"$'\n'"$NOPARSER_REASON"
  np_hook "$R" 'git reset --hard' SKILLITON_GUARDRAILS_CLIENT=codex
  judge conv "no JSON reader, SKILLITON_GUARDRAILS_CLIENT=codex" deny "$CODEX_LEAD"$'\n'"$NOPARSER_REASON"
  np_hook "$R" "git commit -m '{\"model\": 1, \"turn_id\": 2}'"
  judge claude "no JSON reader, a command whose text holds \"model\": and \"turn_id\": (escaped in JSON, so not keys)" ask "$NOPARSER_REASON"
  SHAPE=codex; np_hook "$R" 'ls -la'; SHAPE=claude
  judge same "no JSON reader, Codex-shaped input: ls -la" allow

  # unreadable hook input
  printf '%s' 'not json at all, but it says git reset --hard' > "$TMP/payload.json"
  hook_file CLAUDE_PROJECT_DIR="$R"
  judge claude "unreadable input that mentions git" ask; base=$REASON_TEXT
  hook_file CLAUDE_PROJECT_DIR="$R" PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge conv "unreadable input, PLUGIN_ROOT equal to CLAUDE_PLUGIN_ROOT" deny "$CODEX_LEAD"$'\n'"$base"
  j=$(payload_codex "$R" 'git reset --hard'); printf '%s' "${j%??}" > "$TMP/payload.json"
  hook_file
  judge conv "Codex-shaped input cut short (unreadable; turn_id and model keys found in the text)" deny "$CODEX_LEAD"$'\n'"$base"

  # a crash inside the hook
  awk '/^  walk_segments$/ { print "  : \"$GUARDRAILS_TEST_UNSET\"" } { print }' "$HOOK" > "$TMP/cd-crash-before.sh"
  awk '{ print } /^  walk_segments$/ { print "  : \"$GUARDRAILS_TEST_UNSET\"" }' "$HOOK" > "$TMP/cd-crash-after.sh"
  if grep -q GUARDRAILS_TEST_UNSET "$TMP/cd-crash-before.sh" && grep -q GUARDRAILS_TEST_UNSET "$TMP/cd-crash-after.sh"; then
    payload "$R" 'git reset --hard' > "$TMP/payload.json"
    OUT=$(env CLAUDE_PROJECT_DIR="$R" bash "$TMP/cd-crash-before.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?; read_result
    judge claude "crash before deciding, Claude-shaped input" ask; base=$REASON_TEXT
    case "$base" in *'internal error'*) verdict claude pass "  the crash reason says guardrails stopped with an internal error" ;; *) verdict claude fail "  the crash reason does not mention the internal error [reason: $base]" ;; esac
    payload_codex "$R" 'git reset --hard' > "$TMP/payload.json"
    OUT=$(bash "$TMP/cd-crash-before.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?; read_result
    judge conv "crash before deciding, Codex-shaped input" deny "$CODEX_LEAD"$'\n'"$base"
    payload "$R" 'git push --force origin main' > "$TMP/payload.json"
    OUT=$(env CLAUDE_PROJECT_DIR="$R" bash "$TMP/cd-crash-after.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?; read_result
    judge claude "crash after a deny was decided, Claude-shaped input" deny; base=$REASON_TEXT
    payload_codex "$R" 'git push --force origin main' > "$TMP/payload.json"
    OUT=$(bash "$TMP/cd-crash-after.sh" < "$TMP/payload.json" 2>/dev/null); RC=$?; read_result
    judge same "crash after a deny was decided, Codex-shaped input: the same deny" deny "$base"
  else
    verdict claude fail "could not build the crashing copies (walk_segments call not found in the hook under test)"
  fi
}

# ---------------------------------------------------------------- Codex: which client ran the hook
client_detection_checks() {
  local base fp
  section "client: Codex is recognized by a top-level turn_id or model key, or PLUGIN_ROOT equal to CLAUDE_PLUGIN_ROOT"
  SHAPE=claude
  hook "$R" 'git reset --hard'; base=$REASON_TEXT
  judge claude "Claude-shaped input, no client variables" ask
  hook "$R" 'git push --force origin main'; fp=$REASON_TEXT
  judge claude "Claude-shaped force-push" deny
  payload "$R" 'git reset --hard' | jq -c '. + {turn_id: "guardrails-test-turn"}' > "$TMP/payload.json"; hook_file
  judge conv "Claude-shaped input plus a top-level turn_id key" deny "$CODEX_LEAD"$'\n'"$base"
  payload "$R" 'git reset --hard' | jq -c '. + {model: "guardrails-test-model"}' > "$TMP/payload.json"; hook_file
  judge conv "Claude-shaped input plus a top-level model key" deny "$CODEX_LEAD"$'\n'"$base"
  payload "$R" 'git reset --hard' | jq -c '. + {model: null}' > "$TMP/payload.json"; hook_file
  judge conv "a top-level model key whose value is null (the key decides, not its value)" deny "$CODEX_LEAD"$'\n'"$base"
  payload_codex "$R" 'git reset --hard' | jq -c 'del(.model)' > "$TMP/payload.json"; hook_file
  judge conv "Codex-shaped input with turn_id but no model" deny "$CODEX_LEAD"$'\n'"$base"
  payload_codex "$R" 'git reset --hard' | jq -c 'del(.turn_id)' > "$TMP/payload.json"; hook_file
  judge conv "Codex-shaped input with model but no turn_id" deny "$CODEX_LEAD"$'\n'"$base"
  payload "$R" 'git reset --hard' | jq -c '.tool_input.model = "guardrails-test-model" | .tool_input.turn_id = "guardrails-test-turn"' > "$TMP/payload.json"; hook_file
  judge claude "model and turn_id nested inside tool_input only (not top-level)" ask "$base"

  section "client: the plugin root variables"
  payload "$R" 'git reset --hard' > "$TMP/payload.json"
  hook_file CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge claude "CLAUDE_PLUGIN_ROOT alone" ask "$base"
  hook_file PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge conv "PLUGIN_ROOT set and equal to CLAUDE_PLUGIN_ROOT" deny "$CODEX_LEAD"$'\n'"$base"
  hook_file PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/other-root"
  judge claude "PLUGIN_ROOT set but different from CLAUDE_PLUGIN_ROOT" ask "$base"
  hook_file PLUGIN_ROOT="$TMP/plugin-root"
  judge claude "PLUGIN_ROOT set without CLAUDE_PLUGIN_ROOT" ask "$base"
  hook_file PLUGIN_ROOT= CLAUDE_PLUGIN_ROOT=
  judge claude "PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT both empty" ask "$base"

  section "client: SKILLITON_GUARDRAILS_CLIENT wins both ways"
  payload "$R" 'git reset --hard' > "$TMP/payload.json"
  hook_file SKILLITON_GUARDRAILS_CLIENT=codex CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge conv "SKILLITON_GUARDRAILS_CLIENT=codex with Claude-shaped input" deny "$CODEX_LEAD"$'\n'"$base"
  hook_file SKILLITON_GUARDRAILS_CLIENT=CODEX
  judge conv "SKILLITON_GUARDRAILS_CLIENT=CODEX (letter case does not matter)" deny "$CODEX_LEAD"$'\n'"$base"
  payload_codex "$R" 'git reset --hard' > "$TMP/payload.json"
  hook_file PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge conv "every Codex signal at once: turn_id, model, and PLUGIN_ROOT" deny "$CODEX_LEAD"$'\n'"$base"
  hook_file SKILLITON_GUARDRAILS_CLIENT=claude-code PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge claude "SKILLITON_GUARDRAILS_CLIENT=claude-code with every Codex signal" ask "$base"
  hook_file SKILLITON_GUARDRAILS_CLIENT=codex-cli
  judge conv "unrecognized SKILLITON_GUARDRAILS_CLIENT, Codex-shaped input: detected, and a note says so" deny "$CODEX_LEAD"$'\n'"$base"$'\n'"$OVERRIDE_NOTE"
  payload "$R" 'git reset --hard' > "$TMP/payload.json"
  hook_file SKILLITON_GUARDRAILS_CLIENT=codex-cli
  judge claude "unrecognized SKILLITON_GUARDRAILS_CLIENT, Claude-shaped input: detected, and a note says so" ask "$base"$'\n'"$OVERRIDE_NOTE"
  payload "$R" 'git push --force origin main' > "$TMP/payload.json"
  hook_file SKILLITON_GUARDRAILS_CLIENT=codex
  judge same "SKILLITON_GUARDRAILS_CLIENT=codex: a force-push is the same deny" deny "$fp"
  payload_codex "$R" 'git push --force origin main' > "$TMP/payload.json"
  hook_file SKILLITON_GUARDRAILS_CLIENT=claude-code
  judge same "SKILLITON_GUARDRAILS_CLIENT=claude-code with Codex-shaped input: a force-push is the same deny" deny "$fp"
  payload "$R" 'git status' > "$TMP/payload.json"
  hook_file SKILLITON_GUARDRAILS_CLIENT=codex
  judge same "SKILLITON_GUARDRAILS_CLIENT=codex: git status is allowed" allow
  payload_codex "$R" 'git status' > "$TMP/payload.json"
  hook_file PLUGIN_ROOT="$TMP/plugin-root" CLAUDE_PLUGIN_ROOT="$TMP/plugin-root"
  judge same "every Codex signal at once: git status is allowed" allow
}
MARK_ALL=$SEEN_ALL; MARK_CONV=$SEEN_CONV
cannot_decide_checks
client_detection_checks
SECT_ALL=$((SECT_ALL + SEEN_ALL - MARK_ALL)); SECT_CONV=$((SECT_CONV + SEEN_CONV - MARK_CONV))

# ---------------------------------------------------------------- mutation check
section "mutation: the Codex checks fail against a copy of the hook without the ask-to-deny conversion"
MUTANT="$TMP/mutant/guard-bash.sh"; mkdir -p "$TMP/mutant"
awk -v want='    if [ "$GUARD_CLIENT" = codex ]; then' \
  '$0 == want { print "    if false; then # mutation check: the ask-to-deny conversion is disabled"; n++; next } { print } END { exit (n == 1 ? 0 : 1) }' \
  "$HOOK" > "$MUTANT"
mutant_rc=$?
chmod +x "$MUTANT"
if [ "$mutant_rc" -ne 0 ]; then
  bad "could not build the copy: the conversion line was not found exactly once in the hook under test"
else
  ok "built a copy of the hook under test with only the conversion line changed"
  MUTE="$TMP/mutant.log"; : > "$MUTE"
  SAVED_HOOK=$HOOK; HOOK=$MUTANT
  ask_rule_checks
  cannot_decide_checks
  client_detection_checks
  HOOK=$SAVED_HOOK; MUTE_LOG=$MUTE; MUTE=""
  m_all=$(grep -c . "$MUTE_LOG"); m_conv=$(grep -c '^conv ' "$MUTE_LOG")
  m_conv_fail=$(grep -c '^conv fail$' "$MUTE_LOG"); m_other_fail=$(grep -c -E '^(claude|same) fail$' "$MUTE_LOG")
  if [ "$m_all" -eq "$SECT_ALL" ] && [ "$m_conv" -eq "$SECT_CONV" ]; then
    ok "the copy ran the same $m_all checks as the hook under test ($m_conv of them need the conversion)"
  else bad "the copy ran $m_all checks ($m_conv need the conversion); the hook under test ran $SECT_ALL ($SECT_CONV)"; fi
  if [ "$m_conv" -gt 0 ] && [ "$m_conv_fail" -eq "$m_conv" ]; then
    ok "all $m_conv Codex checks that need the conversion fail against the copy"
  else bad "only $m_conv_fail of $m_conv Codex checks that need the conversion fail against the copy"; fi
  if [ "$m_other_fail" -eq 0 ]; then
    ok "the other $((m_all - m_conv)) checks still pass against the copy, so it differs only in the conversion"
  else bad "$m_other_fail checks that do not need the conversion fail against the copy"; fi
fi

# ---------------------------------------------------------------- the lane write guard
# A lane is a linked worktree, so these cases need a real one rather than a fixture that looks like one:
# the main checkout is a prepared project with main-only paths, and the lane is a worktree of it.
LANE_MAIN="$TMP/lane-main"; LANE_WT="$TMP/lane-lanes/alpha"
LANE_PLAIN="$TMP/lane-plain"; LANE_PLAIN_WT="$TMP/lane-plain-lanes/beta"
new_repo "$LANE_MAIN" || { echo "FAIL: could not build the lane fixture"; exit 1; }
mkdir -p "$LANE_MAIN/.skilliton"
printf '{"version":1,"dispatch":{"mainOnlyPaths":["docs/","DECISIONS.md"]}}\n' > "$LANE_MAIN/.skilliton/config.json"
git -C "$LANE_MAIN" add .skilliton && git -C "$LANE_MAIN" commit -q -m config
git -C "$LANE_MAIN" worktree add -q "$LANE_WT" -b lane/alpha main \
  || { echo "FAIL: could not add the lane worktree"; exit 1; }
# The same shape with no .skilliton/config.json at all: not a prepared project, so nothing is reserved.
new_repo "$LANE_PLAIN" || { echo "FAIL: could not build the unprepared fixture"; exit 1; }
git -C "$LANE_PLAIN" worktree add -q "$LANE_PLAIN_WT" -b lane/beta main \
  || { echo "FAIL: could not add the unprepared lane worktree"; exit 1; }

# payload_write <cwd> <tool> <path>: Claude-shaped PreToolUse input for a file-writing tool. Write, Edit
# and MultiEdit take file_path; NotebookEdit takes notebook_path, which the last argument sets instead.
payload_write() {
  local key=file_path
  case "$2" in NotebookEdit) key=notebook_path ;; esac
  printf '{"session_id":"guardrails-test","transcript_path":%s,"cwd":%s,"scratchpad_dir":%s,"permission_mode":"default","hook_event_name":"PreToolUse","tool_name":%s,"tool_input":{"%s":%s,"content":"placeholder"},"tool_use_id":"toolu_guardrails_test"}' \
    "$TRANSCRIPT_JSON" "$(jstr "$1")" "$SCRATCH_JSON" "$(jstr "$2")" "$key" "$(jstr "$3")"
}
# write_hook: runs the write guard by path on $TMP/payload.json, exactly as the client does.
write_hook() { OUT=$(env "$@" "$WHOOK" < "$TMP/payload.json" 2>"$TMP/stderr"); RC=$?; read_result; }
# expect_write <label> <deny|allow> <cwd> <tool> <path>
expect_write() {
  local label=$1 want=$2; shift 2
  payload_write "$1" "$2" "$3" > "$TMP/payload.json"
  write_hook CLAUDE_PROJECT_DIR="$1"
  judge claude "$label" "$want"
}

section "lane write guard: inside a lane, the shared records are refused"
expect_write "the shared handoff"            deny "$LANE_WT" Write "$LANE_WT/docs/HANDOFF.md"
expect_write "the decisions monolith"        deny "$LANE_WT" Write "$LANE_WT/DECISIONS.md"
expect_write "the status file, through Edit" deny "$LANE_WT" Edit  "$LANE_WT/docs/STATUS.md"
expect_write "a path relative to the lane"   deny "$LANE_WT" Write "docs/BACKLOG.md"
expect_write "a notebook under docs"         deny "$LANE_WT" NotebookEdit "$LANE_WT/docs/notes.ipynb"
expect_write "the README of an entry folder" deny "$LANE_WT" Write "$LANE_WT/docs/tasks/README.md"
reason_has "  the reason names the path"          "docs/tasks/README.md"
reason_has "  the reason names the lane branch"   "lane/alpha"
reason_has "  the reason names the report"        "LANE_REPORT.md"
reason_has "  the reason names the setting"       "dispatch.mainOnlyPaths"
reason_has "  the reason states what it cannot see" "cannot see a script writing through Bash"

section "lane write guard: the lane's own records, and everything outside the reserved paths"
expect_write "its own task record"      allow "$LANE_WT" Write "$LANE_WT/docs/tasks/2026-09-20-lane-alpha-0001.md"
expect_write "a proposed decision"      allow "$LANE_WT" Write "$LANE_WT/docs/decisions/2026-09-20-a-choice-ab12.md"
expect_write "a proposed lesson"        allow "$LANE_WT" Edit  "$LANE_WT/docs/lessons/2026-09-20-a-lesson-cd34.md"
expect_write "source under the lane"    allow "$LANE_WT" Write "$LANE_WT/src/index.js"
expect_write "its own report"           allow "$LANE_WT" Write "$LANE_WT/LANE_REPORT.md"
expect_write "a folder that only starts like docs" allow "$LANE_WT" Write "$LANE_WT/docsite/README.md"
expect_write "a file outside any repository"       allow "$LANE_WT" Write "$TMP/scratch-note.md"

section "lane write guard: it guards a lane, not a checkout, and only a prepared project"
expect_write "the same write in the main checkout" allow "$LANE_MAIN" Write "$LANE_MAIN/docs/HANDOFF.md"
expect_write "the decisions monolith there too"    allow "$LANE_MAIN" Write "$LANE_MAIN/DECISIONS.md"
expect_write "a lane of a repository with no configuration" allow "$LANE_PLAIN_WT" Write "$LANE_PLAIN_WT/docs/HANDOFF.md"

section "lane write guard: it fails open on input it does not recognize"
printf '{' > "$TMP/payload.json";                                        write_hook; judge claude "input that is not JSON" allow
printf '[]\n' > "$TMP/payload.json";                                     write_hook; judge claude "input that is not an object" allow
printf '{"tool_name":"Write"}\n' > "$TMP/payload.json";                  write_hook; judge claude "no tool_input at all" allow
printf '{"tool_name":"Write","tool_input":{}}\n' > "$TMP/payload.json";  write_hook; judge claude "no path in tool_input" allow
payload_write "$LANE_WT" Bash "$LANE_WT/docs/HANDOFF.md" > "$TMP/payload.json"
write_hook; judge claude "a tool this hook is not for" allow
printf '{"tool_name":"Write","cwd":%s,"tool_input":{"file_path":%s}}\n' "$(jstr "$LANE_WT")" "$(jstr "$LANE_WT/docs/HANDOFF.md")" > "$TMP/payload.json"
write_hook; judge claude "the smallest payload that still names a reserved path" deny
printf 'not json at all\n' > "$LANE_WT/.skilliton/config.json"
expect_write "a configuration that does not parse" allow "$LANE_WT" Write "$LANE_WT/docs/HANDOFF.md"
printf '{"version":1,"dispatch":{"mainOnlyPaths":[]}}\n' > "$LANE_WT/.skilliton/config.json"
expect_write "a project that reserves nothing" allow "$LANE_WT" Write "$LANE_WT/docs/HANDOFF.md"
printf '{"version":1,"dispatch":{},"prepare":{"directories":{"tasks":"records/tasks"}}}\n' > "$LANE_WT/.skilliton/config.json"
expect_write "the default reserved paths when dispatch sets none" deny  "$LANE_WT" Write "$LANE_WT/docs/HANDOFF.md"
expect_write "a task record in a folder the project moved"        allow "$LANE_WT" Write "$LANE_WT/records/tasks/one.md"
expect_write "the default task folder once it has been moved"     deny  "$LANE_WT" Write "$LANE_WT/docs/tasks/one.md"
# A lane checks the configuration out for itself, so the one that governs it is its own copy and not
# the integration branch's: a lane based on an older commit is bounded by what that commit reserved.
printf '{"version":1,"dispatch":{"mainOnlyPaths":["notes/"]}}\n' > "$LANE_WT/.skilliton/config.json"
expect_write "the lane's own configuration, not the main checkout's" deny "$LANE_WT" Write "$LANE_WT/notes/plan.md"
expect_write "  and docs is no longer reserved for it"               allow "$LANE_WT" Write "$LANE_WT/docs/HANDOFF.md"

# ---------------------------------------------------------------- the managed block guard (B61)
# A prepared project whose CLAUDE.md and AGENTS.md carry the managed block, and a plain repository beside it.
MB="$TMP/managed"
new_repo "$MB" || { echo "FAIL: could not build the managed-block fixture"; exit 1; }
mkdir -p "$MB/.skilliton" "$MB/docs"
printf '{"version":1}\n' > "$MB/.skilliton/config.json"
MB_START='<!-- skilliton:harness:start v1 -->'; MB_END='<!-- skilliton:harness:end -->'
MB_BLOCK="$MB_START"$'\n## How we work here\n- rule one\n'"$MB_END"
printf '# Project\n\nIntro.\n\n%s\n\nOutro.\n' "$MB_BLOCK" > "$MB/CLAUDE.md"
cp "$MB/CLAUDE.md" "$MB/AGENTS.md"; cp "$MB/CLAUDE.md" "$MB/docs/CLAUDE.md"; cp "$MB/CLAUDE.md" "$R/CLAUDE.md"
printf '# Plain\n' > "$MB/README.md"
# payload_tool <cwd> <tool> <tool_input JSON>: Claude-shaped PreToolUse input with the tool input given whole.
payload_tool() {
  printf '{"session_id":"guardrails-test","transcript_path":%s,"cwd":%s,"scratchpad_dir":%s,"permission_mode":"default","hook_event_name":"PreToolUse","tool_name":%s,"tool_input":%s,"tool_use_id":"toolu_guardrails_test"}' \
    "$TRANSCRIPT_JSON" "$(jstr "$1")" "$SCRATCH_JSON" "$(jstr "$2")" "$3"
}
managed_hook() { OUT=$(env "$@" "$MHOOK" < "$TMP/payload.json" 2>"$TMP/stderr"); RC=$?; read_result; }
# expect_managed <label> <deny|allow> <cwd> <tool> <tool_input JSON>
expect_managed() {
  local label=$1 want=$2; shift 2
  payload_tool "$1" "$2" "$3" > "$TMP/payload.json"
  managed_hook CLAUDE_PROJECT_DIR="$1"
  judge claude "$label" "$want"
}
ti() { jq -nc "$@"; }   # ti: a tool_input object from jq arguments

section "managed block guard: a write that would take the block out of CLAUDE.md or AGENTS.md is refused"
expect_managed "Write CLAUDE.md without the block"      deny  "$MB" Write "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, content:"# Project\n\nIntro.\n"}')"
reason_has "  the reason names harness --apply and remove --apply" "skilliton harness --apply"
reason_has "  the reason states the guard's limit" "cannot see a script writing through Bash"
expect_managed "Write AGENTS.md without the block"      deny  "$MB" Write "$(ti --arg p "$MB/AGENTS.md" '{file_path:$p, content:"# Agents\n"}')"
expect_managed "Write by a path relative to the cwd"    deny  "$MB" Write "$(ti '{file_path:"CLAUDE.md", content:"# Project\n"}')"
expect_managed "Edit that drops the start marker line"  deny  "$MB" Edit  "$(ti --arg p "$MB/CLAUDE.md" --arg o "$MB_START"$'\n' '{file_path:$p, old_string:$o, new_string:""}')"
expect_managed "Edit that drops the whole block"        deny  "$MB" Edit  "$(ti --arg p "$MB/CLAUDE.md" --arg o "$MB_BLOCK" '{file_path:$p, old_string:$o, new_string:""}')"
expect_managed "Edit with replace_all that drops the end marker" deny "$MB" Edit "$(ti --arg p "$MB/CLAUDE.md" --arg o "$MB_END" '{file_path:$p, old_string:$o, new_string:"", replace_all:true}')"
expect_managed "MultiEdit whose second edit drops the end marker" deny "$MB" MultiEdit "$(ti --arg p "$MB/CLAUDE.md" --arg o "$MB_END" '{file_path:$p, edits:[{old_string:"Intro.", new_string:"Hi."},{old_string:$o, new_string:""}]}')"

section "managed block guard: writes that keep the block, and everything it does not judge"
expect_managed "Write CLAUDE.md that keeps the block"   allow "$MB" Write "$(ti --arg p "$MB/CLAUDE.md" --arg b "$MB_BLOCK" '{file_path:$p, content:("# New\n\n" + $b + "\n")}')"
expect_managed "Edit inside the block"                  allow "$MB" Edit  "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, old_string:"rule one", new_string:"rule two"}')"
expect_managed "Edit outside the block"                 allow "$MB" Edit  "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, old_string:"Intro.", new_string:"Hello."}')"
expect_managed "Edit whose old_string does not occur (the client refuses it itself)" allow "$MB" Edit "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, old_string:"no such text", new_string:""}')"
expect_managed "Write README.md"                        allow "$MB" Write "$(ti --arg p "$MB/README.md" '{file_path:$p, content:"x"}')"
expect_managed "a CLAUDE.md below the root"             allow "$MB" Write "$(ti --arg p "$MB/docs/CLAUDE.md" '{file_path:$p, content:"x"}')"
expect_managed "a repository with no configuration"     allow "$R"  Write "$(ti --arg p "$R/CLAUDE.md" '{file_path:$p, content:"x"}')"
expect_managed "NotebookEdit is not judged here"        allow "$MB" NotebookEdit "$(ti --arg p "$MB/CLAUDE.md" '{notebook_path:$p}')"
expect_managed "a tool input with no path"              allow "$MB" Write '{"content":"x"}'
printf 'garbage' > "$TMP/payload.json"; managed_hook; judge claude "input that is not JSON" allow
printf '# Bare\n' > "$MB/CLAUDE.md"
expect_managed "a CLAUDE.md that carries no block"      allow "$MB" Write "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, content:"x"}')"
printf '# Project\n\nIntro.\n\n%s\n\nOutro.\n' "$MB_BLOCK" > "$MB/CLAUDE.md"
printf '{"version":1,"guardrails":{"protectRecords":false}}\n' > "$MB/.skilliton/config.json"
expect_managed "protectRecords false: the same Write" allow "$MB" Write "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, content:"# Project\n"}')"
printf '{"version":1}\n' > "$MB/.skilliton/config.json"
expect_managed "the rule back on: the same Write"       deny  "$MB" Write "$(ti --arg p "$MB/CLAUDE.md" '{file_path:$p, content:"# Project\n"}')"
rm -f "$R/CLAUDE.md"

# ---------------------------------------------------------------- size and time
section "large commands finish well inside the 10 second hook timeout"
big_body=$(printf 'git push --force origin main\n%.0s' $(seq 1 30000))
start=$(date +%s)
expect "heredoc of $(printf '%s' "$big_body" | wc -c | tr -d ' ') bytes" allow "$R" "cat <<'EOF' > big.txt"$'\n'"$big_body"$'\n'"EOF"
elapsed=$(( $(date +%s) - start ))
if [ "$elapsed" -le 5 ]; then ok "  both input shapes finished in ${elapsed}s (limit 5s)"; else bad "  both input shapes took ${elapsed}s (limit 5s)"; fi
long_line=$(head -c 400000 /dev/zero | tr '\0' 'x')
start=$(date +%s)
expect "400000-byte single line, then a force-push" deny "$R" "echo \"$long_line\" && git push --force origin main"
elapsed=$(( $(date +%s) - start ))
if [ "$elapsed" -le 5 ]; then ok "  both input shapes finished in ${elapsed}s (limit 5s)"; else bad "  both input shapes took ${elapsed}s (limit 5s)"; fi

echo
if [ "$fails" -eq 0 ]; then echo "RESULT: PASS ($oks checks ok)"; exit 0; fi
echo "RESULT: FAIL ($fails of $((oks + fails)) checks failed)"; exit 1
