#!/usr/bin/env bash
# Read before this script defines anything of its own: a function exported into the environment
# (BASH_FUNC_name%%=...) is imported by bash before line 1, so it can replace a program this hook relies on, in this
# hook's own shell. Measured: an exported printf turns a refusal into silence, which a client reads as an allow. It
# is the same class as BASH_ENV and SHELLOPTS, and unlike those it can be seen from in here, so it is reported.
SKILLITON_IMPORTED_FUNCTIONS=$(declare -F 2>/dev/null)
# guard-bash.sh: the guardrails PreToolUse hook for the Bash tool.
#
# Claude Code sends the proposed Bash command as JSON on stdin; Codex CLI runs the same plugin hook
# with the same tool_name and tool_input.command. This script reads the command text and answers
# with one decision:
#   deny   force-pushing a protected branch (a start of a long option read as git reads it, and -c configuration
#          and aliases for the one command read as what they push, N71); skipping git hooks with --no-verify on
#          commit, push, merge, rebase, am, cherry-pick, revert or pull, or by removing, moving, emptying or
#          changing the permissions of .git/hooks; staging or
#          committing a file whose name or added content looks like a secret; rm, rmdir, mv or
#          git rm aimed at what Skilliton keeps in a project (the .skilliton folder, the record
#          files, the entry folders, CLAUDE.md and AGENTS.md), and find -delete, truncate, > onto, cp or mv
#          onto, tee, rsync --delete and a program's rmtree or unlink aimed at them (N73), for which the one
#          route is skilliton remove --apply, run by a person
#   ask    git commands that throw away uncommitted work: reset --hard, clean -f, checkout ., checkout -f,
#          checkout -- <path>, checkout -B, switch -f, switch --discard-changes, switch -C, restore <path>
#          (without --staged), rm -f, worktree remove --force, stash drop, stash clear, branch -D, and rm -rf .git
#          a force-push or rm -rf whose branch or path holds a variable it cannot resolve; HUSKY=0, SKIP= or
#          LEFTHOOK=0 in front of a git commit;
#          and a command that writes the settings file itself (.skilliton/config.json), because a rule
#          turned off there is a person's decision (the Write and Edit half is managed-block-guard.mjs); a command that
#          writes the client's settings file (.claude/settings.json or settings.local.json) with hooks,
#          disableAllHooks or enabledPlugins in play, or creates the .skilliton-off opt-out file (N70)
#   allow  everything else, by printing nothing
# Under Codex every "ask" is written as "deny", with a reason that says so, because Codex cannot ask
# for confirmation from a hook: the command would run anyway. See detect_client.
# A decision is JSON on stdout. The exit status is always 0. A hook that crashes with another
# status does not block anything, so a failure inside this script becomes "ask" (a deny under
# Codex) for any command that mentions git or a removal, never silent permission.
#
# What it can see, stated as a limit rather than left to be discovered:
#   It reads the command TEXT. It splits on && || ; | & newlines and parentheses, respects
#   quotes and backslashes, skips heredoc bodies, reads redirection targets apart from the words, and follows cd, pushd,
#   and git -C, and reads past env, sudo, nice, timeout, exec, caffeinate, stdbuf, ionice and time with the values
#   their options take; after a program it does not know, a later git, rm or mv that would be stopped asks. It is not
#   a shell parser: it does not expand variables (other than a leading $PWD or $CLAUDE_PROJECT_DIR), globs, aliases,
#   or functions, and it does not look inside scripts, bash -c strings, eval, xargs, a backtick
#   substitution inside double quotes, or git aliases from a configuration file (one set with -c on the command
#   itself is read as what it runs; a $( inside double quotes is read as the
#   command it is, and $(( )) is arithmetic, never a heredoc; an unclosed one asks); a shell, eval or xargs string that
#   names git asks instead of allowing in silence. It stops ordinary and accidental
#   commands, not a command someone has deliberately hidden.
#   It sees the tree as it is BEFORE the command runs: a secret written and staged in the same
#   command (printf ... > f && git add f) is not scanned, so an add or commit naming a path an
#   earlier redirection in the command writes asks instead; a write by another program is not seen.
#   It does not expand globs: rm -rf docs/* is judged by the word docs/*, not the files it matches.
#   A file over 10 MB is checked by name only, when it is added and when it is committed (N72); a commit that takes
#   one asks, naming it, so a large file cannot run the hook past its time limit into an allow.
#   A command text longer than CMD_MAX_BYTES (64 KB) is not read at all (N88): it asks at once, whatever it names,
#   saying how long it is, before any splitting, because reading one that long can take longer than the client's 10 second hook budget
#   (1,200 KB measured at 13.5 s), and a hook that runs out of time is read by the client as an allow.
#
# Settings: the "guardrails" section of .skilliton/config.json in the project directory
# ($CLAUDE_PROJECT_DIR, else "cwd" from the hook input, else $PWD). Keys and defaults are in
# docs/CONTRACTS.md. Only a JSON false turns a rule off. A config that cannot be read leaves
# every default on and says so. SKILLITON_GUARDRAILS=off allows everything for the session.
# SKILLITON_GUARDRAILS_CLIENT=claude-code or codex names the client instead of detecting it.
#
# Needs: bash 3.2 or later, git, awk, grep, find, and one of jq, node, or python3.
#   guard-bash.sh                  PreToolUse mode (stdin: the PreToolUse JSON)
#   guard-bash.sh --session-start  prints the one status line for session-start-guardrails.sh

set -u
export LC_ALL=C GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0

GUARD_MODE=pretooluse
[ "${1:-}" = "--session-start" ] && GUARD_MODE=session-start

SEP=$'\036'
GUARD_RAW=""; GUARD_EMITTED=0; GUARD_PARSER=""; GUARD_CLIENT=""; CLIENT_NOTE=""
IN_KEYS=""; IN_CWD=""; IN_CMD=""; PROJECT_DIR=""
# The longest command text this hook reads, in bytes (N88; see the header). Anything longer asks without being read.
CMD_MAX_BYTES=65536
CFG_FP=true; CFG_NV=true; CFG_SF=true; CFG_PR=true; CFG_PB=$'main\nmaster'; CFG_STATE=default; CFG_FILE=.skilliton/config.json
# What Skilliton keeps in a project (docs/CONTRACTS.md section 10): the record files and the entry folders come from
# prepare.artifacts and prepare.directories in the project's configuration when it has them, else these defaults
# (the first candidate of each role in lib/config.mjs ROLE_CANDIDATES and DIRECTORY_DEFAULTS). CLAUDE.md and AGENTS.md
# carry the managed block. A folder named .skilliton is protected wherever it is.
PROTECT_RECORDS=$'docs/STATUS.md\ndocs/BACKLOG.md\ndocs/BACKLOG_ARCHIVE.md\ndocs/ROADMAP.md\nDECISIONS.md\ndocs/LESSONS.md\ndocs/HANDOFF.md\ndocs/HANDOFF_ARCHIVE.md\ndocs/MAINTAIN.md'
PROTECT_FOLDERS=$'docs/tasks\ndocs/decisions\ndocs/lessons'
INSTRUCTION_FILES=$'CLAUDE.md\nAGENTS.md'
NORM=""; PT_WHAT=""; PHYS=""
DENY_REASON=""; ASK_REASON=""
TOKS=(); SEGW=(); SEGR=(); ARGS=(); GARGS=(); PFX_GARGS=(); PA=(); FILES=()
RT=$'\037'; AP=$'\034'; REDIRS=""; UNSURE_MARK=$'\035'; TOK_UNSURE=0
EFF_DIR=""; GDIR=""; RESOLVED=""; CUR_BRANCH=""; SC_LETTERS=""; SC_NEXT=0
SN_RULE=""; HIT_FILE=""; HIT_RULE=""; REASON=""; ESCAPED=""

CONFIG_NOTE="Note: .skilliton/config.json could not be read, so the default guardrails settings were used."
CODEX_ASK_LEAD="Blocked: this command would normally need your confirmation. Codex cannot ask for confirmation from a hook, so it was blocked. If you meant it, run it yourself in your terminal. The confirmation would have said:"
CLIENT_OVERRIDE_NOTE="Note: SKILLITON_GUARDRAILS_CLIENT is set, but not to claude-code or codex, so it was ignored and the client was worked out from the hook input."
CODEX_KEY_RE='"(turn_id|model)"[[:space:]]*:'

# A word "git" as a command would appear, case-insensitively. "github", ".git", "digit", and a
# folder path segment like /git/ do not count, so a project under a folder named github does not
# make every command look like git. This also runs on the raw JSON, where a newline or tab before
# the word is written as \n or \t, so a backslash escape counts as a boundary too (without that,
# "echo hi" on one line and a force-push on the next was allowed unread).
GIT_WORD_RE='(^|[^A-Za-z0-9_.-]|\\[bfnrt])[Gg][Ii][Tt]([^A-Za-z0-9_/-]|$)'
mentions_git() { [[ $1 =~ $GIT_WORD_RE ]]; }
# The same shape for the programs that remove or move a path, so a command with neither git nor one of them costs
# one regex and nothing else, as before.
REMOVE_WORD_RE='(^|[^A-Za-z0-9_.-]|\\[bfnrt])(rm|rmdir|mv|truncate|find|rsync|cp|tee|dd|sponge|install|ln|shred)([^A-Za-z0-9_/-]|$)'
# The other ways a record is emptied or removed (N73): a > onto a Markdown file, and a program's own removal calls.
RECORD_HINT_RE='rmtree|unlink|os[.]remove|rmSync|>[>|]?[[:space:]]*[^[:space:]]*[.][Mm][Dd]'
mentions_removal() { [[ $1 =~ $REMOVE_WORD_RE ]] || [[ $1 =~ $RECORD_HINT_RE ]]; }
# The settings file the rules come from (N30): a command that names both parts of its path is read, so a write to it
# can be seen. A folder name alone costs nothing more than before. Letter case is folded: on a case-insensitive disk
# (macOS, Windows) .Skilliton/Config.json is the same file.
nocase_on() { NOCASE_WAS=0; shopt -q nocasematch && NOCASE_WAS=1; shopt -s nocasematch; }
nocase_off() { [ "$NOCASE_WAS" = 1 ] || shopt -u nocasematch; }
mentions_config() { local r=1; nocase_on; case "$1" in *.skilliton*config.json*|*.skillgate*config.json*|*config.json*.skilliton*|*config.json*.skillgate*) r=0 ;; esac; nocase_off; return $r; }
CONFIG_ASK="Check first: this command writes to the guardrails settings file (.skilliton/config.json), which is where the rules read whether they are on and which branches they protect. Turning a rule off or unprotecting a branch is a person's decision, made in their own editor or terminal. Confirm only if this change keeps every rule and every protected branch as it is."
# The files that switch hooks off without touching the rules (N70): the client's settings file, which names the hooks,
# the plugins that are on, and disableAllHooks, and the opt-out file that keeps every workflow hook silent. The words
# are compared in any letter case.
# The git hooks folder is named here too, so chmod or truncate aimed at it is read (N71).
mentions_hookfile() { local r=1; nocase_on; case "$1" in *.claude*settings*.json*|*skilliton-off*|*.git/hooks*) r=0 ;; esac; nocase_off; return $r; }

json_escape() { # sets ESCAPED to $1 as the inside of a JSON string
  local s=$1 bs='\' q='"'
  s=${s//[$'\001'-$'\010'$'\013'$'\014'$'\016'-$'\037']/}
  s=${s//"$bs"/"$bs$bs"}
  s=${s//"$q"/"$bs$q"}
  s=${s//$'\t'/"${bs}t"}
  s=${s//$'\r'/"${bs}r"}
  s=${s//$'\n'/"${bs}n"}
  ESCAPED=$s
}

# detect_client: sets GUARD_CLIENT to codex or claude-code, and CLIENT_NOTE when the override is unusable.
# Why: Codex CLI runs this same hook, but its hooks documentation says permissionDecision "ask" is
# parsed but not supported yet (the hook run is marked failed and the tool call continues), so an
# ask under Codex would be silent permission.
# Signals, all from Codex's hooks documentation: every hook input carries session_id,
# transcript_path, cwd, hook_event_name, and model, and turn-scoped events such as PreToolUse add
# turn_id; plugin hooks run with PLUGIN_ROOT and PLUGIN_DATA set, as well as CLAUDE_PLUGIN_ROOT. The
# PreToolUse input measured from Claude Code 2.1.273 has no model and no turn_id key.
# UNVERIFIED in a live Codex session: no Codex session has run this hook yet.
# SKILLITON_GUARDRAILS_CLIENT=claude-code or codex (any letter case) wins over the detection.
detect_client() {
  CLIENT_NOTE=""
  case "${SKILLITON_GUARDRAILS_CLIENT:-}" in
    [Cc][Oo][Dd][Ee][Xx]) GUARD_CLIENT=codex; return 0 ;;
    [Cc][Ll][Aa][Uu][Dd][Ee]-[Cc][Oo][Dd][Ee]) GUARD_CLIENT=claude-code; return 0 ;;
    '') ;;
    *) CLIENT_NOTE=$CLIENT_OVERRIDE_NOTE ;;
  esac
  GUARD_CLIENT=claude-code
  if [ "$IN_KEYS" = codex ]; then
    GUARD_CLIENT=codex   # a top-level turn_id or model key, read by the JSON reader
  elif [ -z "$IN_KEYS" ] && [[ $GUARD_RAW =~ $CODEX_KEY_RE ]]; then
    # The input was not parsed (no JSON reader, unreadable JSON, or a crash first). In JSON text a
    # quote inside a string is escaped, so "turn_id": or "model": can only be a key, at any depth.
    # A wrong match here can only turn an ask into a deny.
    GUARD_CLIENT=codex
  elif [ -n "${PLUGIN_ROOT:-}" ] && [ "${CLAUDE_PLUGIN_ROOT:-}" = "$PLUGIN_ROOT" ]; then
    GUARD_CLIENT=codex
  fi
  return 0
}

emit_decision() { # emit_decision <deny|ask> <reason>. Under Codex an ask is written as a deny.
  local decision=$1 reason=$2
  if [ "$decision" = ask ]; then
    detect_client
    [ -z "$CLIENT_NOTE" ] || reason="$reason"$'\n'"$CLIENT_NOTE"
    if [ "$GUARD_CLIENT" = codex ]; then
      decision=deny
      reason="$CODEX_ASK_LEAD"$'\n'"$reason"
    fi
  fi
  json_escape "$reason"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"%s"}}\n' "$decision" "$ESCAPED"
  GUARD_EMITTED=1
}

status_line() { printf '%s\n' "$1"; GUARD_EMITTED=1; }

guard_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$GUARD_EMITTED" = 0 ]; then
    if [ "$GUARD_MODE" = session-start ]; then
      printf '%s\n' "[guardrails] the status check failed (exit $rc), so the guardrails may not be working in this session."
    elif [ -n "$DENY_REASON" ]; then
      # a segment already decided to block before the failure; a crash must not soften that
      emit_decision deny "$DENY_REASON"
    elif mentions_git "$GUARD_RAW" || mentions_config "$GUARD_RAW" || mentions_hookfile "$GUARD_RAW"; then
      emit_decision ask "Check first: guardrails stopped with an internal error (exit $rc) while checking this git command, so nothing was checked. Read the command yourself and confirm it only if it is what you intend."
    fi
  fi
  exit 0
}
trap guard_exit EXIT

# ---------------------------------------------------------------- reading JSON

# On Windows (Git Bash), a native jq.exe or python3 writes CRLF, which left every value with a trailing \r and turned
# every git rule into an ask (a hosted Windows runner, 2026-09-22). There, and only there, CRLF becomes LF.
unix_lines() { case "${OSTYPE:-}" in msys*|cygwin*) out=${out//$'\r\n'/$'\n'}; out=${out%$'\r'} ;; esac; }

pick_parser() { # sets GUARD_PARSER to the first usable JSON reader
  local p
  GUARD_PARSER=""
  for p in jq node python3; do
    command -v "$p" >/dev/null 2>&1 || continue
    # On a Mac without the command line developer tools, /usr/bin/python3 is a stub that asks to
    # install them instead of running Python. Skip it rather than prompt on every command.
    if [ "$p" = python3 ] && [ "$(command -v python3)" = /usr/bin/python3 ] \
       && [ -x /usr/bin/xcode-select ] && ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
      continue
    fi
    GUARD_PARSER=$p
    return 0
  done
  return 1
}

# Each reader prints three parts: "codex" when the input has a top-level turn_id or model key (else
# "none"), then cwd, then the command (which may hold newlines). See detect_client.
JQ_INPUT='(if type == "object" then (if has("turn_id") or has("model") then "codex" else "none" end) else "none" end), (.cwd // "" | tostring), (.tool_input.command // "" | tostring)'
NODE_INPUT='let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",d=>{s+=d});process.stdin.on("end",()=>{let j;try{j=JSON.parse(s)}catch(e){process.exit(3)}if(!j||typeof j!=="object"||Array.isArray(j)){process.exit(3)}const h=(n)=>Object.prototype.hasOwnProperty.call(j,n);const f=(h("turn_id")||h("model"))?"codex":"none";const t=(j.tool_input&&typeof j.tool_input==="object")?j.tool_input:{};const c=typeof j.cwd==="string"?j.cwd:"";const k=typeof t.command==="string"?t.command:"";process.stdout.write(f+"\n"+c+"\n"+k)})'
PY_INPUT='import sys, json
try:
    j = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace"))
except Exception:
    sys.exit(3)
if not isinstance(j, dict):
    sys.exit(3)
f = "codex" if ("turn_id" in j or "model" in j) else "none"
t = j.get("tool_input") if isinstance(j.get("tool_input"), dict) else {}
c = j.get("cwd") if isinstance(j.get("cwd"), str) else ""
k = t.get("command") if isinstance(t.get("command"), str) else ""
sys.stdout.buffer.write((f + "\n" + c + "\n" + k).encode("utf-8"))'

read_input() { # sets IN_KEYS, IN_CWD and IN_CMD from GUARD_RAW; returns 1 when the JSON cannot be read
  local out rc
  case "$GUARD_PARSER" in
    jq) out=$(printf '%s' "$GUARD_RAW" | jq -r "$JQ_INPUT" 2>/dev/null); rc=$? ;;
    node) out=$(printf '%s' "$GUARD_RAW" | node -e "$NODE_INPUT" 2>/dev/null); rc=$? ;;
    python3) out=$(printf '%s' "$GUARD_RAW" | python3 -c "$PY_INPUT" 2>/dev/null); rc=$? ;;
    *) return 1 ;;
  esac
  unix_lines
  [ "$rc" -eq 0 ] || return 1
  IN_KEYS=${out%%$'\n'*}
  case "$IN_KEYS" in codex|none) ;; *) IN_KEYS=""; return 1 ;; esac
  case "$out" in *$'\n'*) out=${out#*$'\n'} ;; *) out="" ;; esac
  IN_CWD=${out%%$'\n'*}
  case "$out" in *$'\n'*) IN_CMD=${out#*$'\n'} ;; *) IN_CMD="" ;; esac
  return 0
}

JQ_CONFIG='(if type == "object" then .guardrails else null end) as $g0
| (if ($g0 | type) == "object" then $g0 else {} end) as $g
| (if type == "object" then .prepare else null end) as $p0
| (if ($p0 | type) == "object" then $p0 else {} end) as $p
| "FP=" + (if ($g | .blockForcePush) == false then "false" else "true" end),
  "NV=" + (if ($g | .blockNoVerify) == false then "false" else "true" end),
  "SF=" + (if ($g | .blockSecretFiles) == false then "false" else "true" end),
  "PR=" + (if ($g | .protectRecords) == false then "false" else "true" end),
  (if ($g | .protectedBranches | type) == "array"
   then "PBSET=1", ($g | .protectedBranches[] | strings | "PB=" + .)
   else empty end),
  (if ($p | .artifacts | type) == "object" then ($p | .artifacts[] | strings | "ART=" + .) else empty end),
  (if ($p | .directories | type) == "object" then ($p | .directories[] | strings | "DIR=" + .) else empty end)'
NODE_CONFIG='const fs=require("fs");let j;try{j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch(e){process.exit(3)}const g0=(j&&typeof j==="object"&&!Array.isArray(j))?j.guardrails:null;const g=(g0&&typeof g0==="object"&&!Array.isArray(g0))?g0:{};const p0=(j&&typeof j==="object"&&!Array.isArray(j))?j.prepare:null;const p=(p0&&typeof p0==="object"&&!Array.isArray(p0))?p0:{};const o=["FP="+(g.blockForcePush===false?"false":"true"),"NV="+(g.blockNoVerify===false?"false":"true"),"SF="+(g.blockSecretFiles===false?"false":"true"),"PR="+(g.protectRecords===false?"false":"true")];if(Array.isArray(g.protectedBranches)){o.push("PBSET=1");for(const b of g.protectedBranches){if(typeof b==="string")o.push("PB="+b)}}for(const [key,tag] of [["artifacts","ART="],["directories","DIR="]]){const m=p[key];if(m&&typeof m==="object"&&!Array.isArray(m)){for(const v of Object.values(m)){if(typeof v==="string")o.push(tag+v)}}}process.stdout.write(o.join("\n")+"\n")'
PY_CONFIG='import sys, json
try:
    with open(sys.argv[1], "rb") as fh:
        j = json.loads(fh.read().decode("utf-8"))
except Exception:
    sys.exit(3)
g = j.get("guardrails") if isinstance(j, dict) else None
g = g if isinstance(g, dict) else {}
p = j.get("prepare") if isinstance(j, dict) else None
p = p if isinstance(p, dict) else {}
o = ["FP=" + ("false" if g.get("blockForcePush") is False else "true"),
     "NV=" + ("false" if g.get("blockNoVerify") is False else "true"),
     "SF=" + ("false" if g.get("blockSecretFiles") is False else "true"),
     "PR=" + ("false" if g.get("protectRecords") is False else "true")]
pb = g.get("protectedBranches")
if isinstance(pb, list):
    o.append("PBSET=1")
    o.extend("PB=" + b for b in pb if isinstance(b, str))
for key, tag in (("artifacts", "ART="), ("directories", "DIR=")):
    m = p.get(key)
    if isinstance(m, dict):
        o.extend(tag + v for v in m.values() if isinstance(v, str))
sys.stdout.write("\n".join(o) + "\n")'

set_project_dir() {
  local top=""
  PROJECT_DIR=${CLAUDE_PROJECT_DIR:-}
  # Without the client's project directory (Codex documents none), the repository root of the input cwd is the
  # project: a session started in a subfolder still reads the project's settings and protects its records.
  # The root is taken as the cwd with git's own prefix (the path below the root) removed, so it keeps the spelling
  # the input used; git prints the physical path, which on macOS differs from a path through /var or /tmp.
  if [ -z "$PROJECT_DIR" ] && [ -n "$IN_CWD" ]; then
    top=$(git -C "$IN_CWD" -c core.fsmonitor=false rev-parse --show-prefix 2>/dev/null) && PROJECT_DIR=${IN_CWD%/}
    top=${top%/}
    [ -n "$top" ] && PROJECT_DIR=${PROJECT_DIR%/"$top"}
  fi
  [ -n "$PROJECT_DIR" ] || PROJECT_DIR=$IN_CWD
  [ -n "$PROJECT_DIR" ] || PROJECT_DIR=$PWD
}

load_config() { # reads $PROJECT_DIR/.skilliton/config.json into CFG_*; defaults stay on when it cannot be read
  local f="$PROJECT_DIR/.skilliton/config.json" out rc line pbset=0 pb="" art="" dirs=""
  # A project not yet migrated from the earlier Skillgate names keeps its settings in .skillgate/config.json. They are
  # still honoured, so its protected branches do not silently fall back to the defaults before the migration.
  if [ ! -f "$f" ] && [ -f "$PROJECT_DIR/.skillgate/config.json" ]; then
    f="$PROJECT_DIR/.skillgate/config.json"
    CFG_FILE=".skillgate/config.json"
  fi
  [ -f "$f" ] || return 0
  case "$GUARD_PARSER" in
    jq) out=$(jq -r "$JQ_CONFIG" "$f" 2>/dev/null); rc=$? ;;
    node) out=$(node -e "$NODE_CONFIG" "$f" 2>/dev/null); rc=$? ;;
    python3) out=$(python3 -c "$PY_CONFIG" "$f" 2>/dev/null); rc=$? ;;
    *) rc=1; out="" ;;
  esac
  unix_lines
  case "$out" in FP=*) ;; *) rc=1 ;; esac
  if [ "$rc" -ne 0 ]; then CFG_STATE=unreadable; return 0; fi
  CFG_STATE=loaded
  while IFS= read -r line; do
    case "$line" in
      FP=false) CFG_FP=false ;;
      NV=false) CFG_NV=false ;;
      SF=false) CFG_SF=false ;;
      PR=false) CFG_PR=false ;;
      PBSET=1) pbset=1 ;;
      PB=?*) pb="$pb${line#PB=}"$'\n' ;;
      ART=?*) art="$art${line#ART=}"$'\n' ;;
      DIR=?*) dirs="$dirs${line#DIR=}"$'\n' ;;
    esac
  done <<EOF
$out
EOF
  [ "$pbset" = 1 ] && CFG_PB=$pb
  [ -n "$art" ] && PROTECT_RECORDS=$art
  [ -n "$dirs" ] && PROTECT_FOLDERS=$dirs
  return 0
}

is_protected() { # is_protected <branch>: exact names or shell patterns such as release/*
  local b=$1 p
  [ -n "$b" ] || return 1
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    # shellcheck disable=SC2254
    case "$b" in $p) return 0 ;; esac
  done <<EOF
$CFG_PB
EOF
  return 1
}

# ---------------------------------------------------------------- splitting the command

# Prints one word per line; a line holding only the \036 character ends a command segment.
# Written in awk because bash 3.2 reads a string by index in time proportional to its length,
# which made a 50KB command take over 3 seconds. Long lines are read in 4KB chunks for the same
# reason (this awk's substr() measures the whole string on every call). Words are capped at
# 4096 characters: flags, paths, and branch names are short, and the cap keeps time linear.
AWK_TOKENIZER='
# Inside a $( that opened within double quotes, the words are a command of their own (bash reads its quotes afresh), so
# they are held in DEF and printed as their own segments after the segment that holds the quoted word, which goes on.
function emit(x) { if (depth > 0) DEF = DEF x "\n"; else print x }
function flush() { if (have) { if (skipnext == 2) emit(RDM tok); else if (skipnext == 3) emit(RDM AP tok); else if (!skipnext) emit(tok); skipnext = 0 } tok = ""; have = 0 }
function sep() { flush(); emit(SEP); skipnext = 0; if (depth == 0 && DEF != "") { printf "%s", DEF; DEF = "" } }
# arith(k): $(( ... )) or (( ... )) from the first ( at k, added to the word as it is, so a << inside it is never a
# heredoc. Returns the index of the closing paren; one that does not close on this line makes the result unsure.
function arith(k,   pd, ch) {
  pd = 0
  for (; k <= m; k++) {
    if (k - off > 4096) { off = k - 1; chunk = substr(line, k, 4400) }
    ch = at(k); add(ch)
    if (ch == "(") pd++
    else if (ch == ")") { pd--; if (pd == 0) return k }
  }
  unsure = 1; return m
}
# is_arith(k): whether the (( at k is arithmetic. Bash reads (( as arithmetic only when its matching close is )), so
# ((git push -f); true) and $((git reset --hard) ) are a subshell and a command substitution whose commands run, and
# are read as commands here. Scans ahead without changing the word; one that never closes counts as arithmetic, which
# arith() then marks unsure.
function is_arith(k,   so, sc, pd, ch, r) {
  so = off; sc = chunk; pd = 0; r = 1
  for (; k <= m; k++) {
    if (k - off > 4096) { off = k - 1; chunk = substr(line, k, 4400) }
    ch = at(k)
    if (ch == "(") pd++
    else if (ch == ")") { pd--; if (pd == 1) { r = (at(k + 1) == ")"); break } }
  }
  off = so; chunk = sc; return r
}
function add(ch) { if (length(tok) < 4096) tok = tok ch; have = 1 }
function at(k) { return substr(chunk, k - off, 1) }
BEGIN { RS = "\001"; SEP = sprintf("%c", 30); RDM = sprintf("%c", 31); UN = sprintf("%c", 29); AP = sprintf("%c", 28) }  # not RT: in GNU awk RT is a built-in reset on every record, which lost every redirection mark on Linux
{
  n = split($0, L, "\n")
  q = ""; tok = ""; have = 0; skipnext = 0; nhd = 0; hdi = 0; cont = 0; depth = 0; DEF = ""; unsure = 0
  for (ln = 1; ln <= n; ln++) {
    line = L[ln]; m = length(line); off = 0; chunk = substr(line, 1, 4400)
    for (i = 1; i <= m; i++) {
      if (i - off > 4096) { off = i - 1; chunk = substr(line, i, 4400) }
      c = at(i)
      if (q == SQ) { if (c == SQ) q = ""; else add(c); continue }
      if (q == "\"") {
        if (c == "\\") {
          if (i == m) { cont = 1; continue }
          d = at(i + 1)
          if (d == "\"" || d == "\\" || d == "$" || d == "`") { add(d); i++; continue }
          add(c); continue
        }
        if (c == "\"") { q = ""; continue }
        if (c == "$" && at(i + 1) == "(") {
          if (at(i + 2) == "(" && is_arith(i + 1)) { add(c); i = arith(i + 1); continue }
          depth++; ST[depth] = tok; SS[depth] = skipnext; PC[depth] = 0
          tok = ""; have = 0; skipnext = 0; q = ""; i++; continue
        }
        add(c); continue
      }
      if (c == " " || c == "\t") { flush(); continue }
      if (c == SQ || c == "\"") { q = c; have = 1; continue }
      if (c == "\\") { if (i == m) { cont = 1; continue } add(at(i + 1)); i++; continue }
      if (c == "#" && !have) break
      if (c == ";") { sep(); continue }
      if (c == "&") {
        d = at(i + 1)
        if (d == "&") { i++; sep(); continue }
        if (d == ">") { flush(); i++; if (at(i + 1) == ">") { i++; skipnext = 3 } else skipnext = 2; continue }
        sep(); continue
      }
      if (c == "|") { d = at(i + 1); if (d == "|" || d == "&") i++; sep(); continue }
      if (c == "(" || c == ")" || c == "`") {
        if (c == ")" && depth > 0 && PC[depth] == 0) {
          # the $( opened inside double quotes closes: back into the quoted word, which carries $() in place of it
          sep(); tok = ST[depth] "$()"; have = 1; skipnext = SS[depth]; depth--; q = "\""; continue
        }
        if (c == "(" && at(i + 1) == "(" && (!have || substr(tok, length(tok), 1) == "$") && is_arith(i)) { i = arith(i); continue }
        if (depth > 0) { if (c == "(") PC[depth]++; else if (c == ")") PC[depth]-- }
        # an unquoted $( leaves $() in the word it stood in, so a branch or a path that comes from it reads as unknown
        if (c == "(" && have && substr(tok, length(tok), 1) == "$") { tok = tok "()" }
        sep(); continue
      }
      if (c == "<" || c == ">") {
        if (have && tok ~ /^[0-9]+$/) { tok = ""; have = 0 } else flush()
        d = at(i + 1)
        if (c == "<" && d == "<") {
          if (at(i + 2) == "<") { i += 2; skipnext = 1; continue }
          i++; strip = 0
          if (at(i + 1) == "-") { strip = 1; i++ }
          k = 0
          while (i < m && k < 64 && (at(i + 1) == " " || at(i + 1) == "\t")) { i++; k++ }
          w = ""; k = 0
          while (i < m && k < 200) {
            e = at(i + 1)
            if (e == " " || e == "\t" || e == ";" || e == "&" || e == "|" || e == "<" || e == ">" || e == "(" || e == ")") break
            i++; k++
            if (e != SQ && e != "\"" && e != "\\") w = w e
          }
          # a numeric "delimiter" is an arithmetic shift such as $((1<<2)), not a heredoc
          if (w != "" && w !~ /^[0-9]+$/) { nhd++; HD[nhd] = w; HDT[nhd] = strip }
          continue
        }
        if (d == "(") { i++; if (depth > 0) PC[depth]++; sep(); continue }
        rw = (c == ">") ? 2 : 1; app = 0
        if (c == ">" && (d == ">" || d == "|")) { if (d == ">") app = 1; i++; d = at(i + 1) }
        if (c == "<" && d == ">") { i++; d = at(i + 1); rw = 2; app = 1 }
        if (d == "&") {
          i++; k = 0; while (i < m && k < 16 && at(i + 1) ~ /[0-9-]/) { i++; k++ }
          if (k > 0 || rw == 1) continue   # >&2 and >&- copy a descriptor; >&file writes a file
        }
        # the word after a redirection is its target: a file written (>, >>, >|, <>, &>, >&file) is kept, marked with
        # \037, so the settings file and a file written then staged can be seen; a file read (<) is dropped. A write that
        # keeps what the file held (>>, <>, &>>) is also marked \034, so emptying a record can be told from adding to it
        skipnext = (rw == 2 && app) ? 3 : rw
        continue
      }
      add(c)
    }
    if (q != "") { if (cont) cont = 0; else add(" "); continue }
    if (cont) { cont = 0; continue }
    sep()
    while (hdi < nhd) {
      hdi++
      while (ln < n) {
        ln++; body = L[ln]
        if (HDT[hdi]) sub(/^\t+/, "", body)
        if (body == HD[hdi]) break
      }
    }
  }
  flush()
  if (DEF != "") { print SEP; printf "%s", DEF }
  # an unclosed quote, command substitution or arithmetic: what follows may not have been read as bash reads it
  if (q != "" || depth > 0 || unsure) { print SEP; print UN }
}'

tokenize() { # fills TOKS from IN_CMD; returns 1 when awk fails
  local out rc t
  TOKS=()
  out=$(printf '%s' "$IN_CMD" | awk -v SQ="'" "$AWK_TOKENIZER" 2>/dev/null); rc=$?
  [ "$rc" -eq 0 ] || return 1
  [ -n "$out" ] || return 0
  while IFS= read -r t; do
    if [ "$t" = "$UNSURE_MARK" ]; then TOK_UNSURE=1; continue; fi
    TOKS[${#TOKS[@]}]=$t
  done <<EOF
$out
EOF
  return 0
}

walk_segments() { # runs analyze_segment on each segment, in order, so cd carries forward
  local n=${#TOKS[@]} i=0 start=0 redir=0 t
  EFF_DIR=$IN_CWD; REDIRS=""
  while [ "$i" -le "$n" ]; do
    if [ "$i" -eq "$n" ] || [ "${TOKS[$i]}" = "$SEP" ]; then
      if [ "$i" -gt "$start" ]; then
        SEGW=("${TOKS[@]:$start:$((i - start))}"); SEGR=()
        [ "$redir" = 1 ] && split_redirects
        analyze_segment
        # what this segment writes, for a later add or commit in the same command (N34)
        if [ "${#SEGR[@]}" -gt 0 ]; then for t in "${SEGR[@]}"; do REDIRS="$REDIRS$t"$'\n'; done; fi
      fi
      start=$((i + 1)); redir=0
    else
      case "${TOKS[$i]}" in "$RT"*) redir=1 ;; esac
    fi
    i=$((i + 1))
  done
}

split_redirects() { # moves the marked redirection targets out of SEGW into SEGR, each as an absolute path when known
  local t words=() r app
  SEGR=()
  for t in "${SEGW[@]}"; do
    case "$t" in
      "$RT"*)
        t=${t#"$RT"}; app=0
        case "$t" in "$AP"*) t=${t#"$AP"}; app=1 ;; esac
        guarded_write "$t" write
        hooks_target "$t" "$EFF_DIR" && deny_hooks
        # > onto a record file that exists empties it first (N73); >> only adds to it
        if [ "$app" = 0 ]; then record_file_target "$t" "$EFF_DIR"; [ -z "$PT_WHAT" ] || deny_removal "$PT_WHAT" "writing over"; fi
        resolve_dir "$EFF_DIR" "$t"; r=$RESOLVED
        [ -z "$r" ] || { normalize_path "$r"; SEGR[${#SEGR[@]}]=$NORM; } ;;
      *) words[${#words[@]}]=$t ;;
    esac
  done
  SEGW=(${words[@]+"${words[@]}"})
}

check_config_hookspath() { # git config ... core.hooksPath <dir> changes which hooks run for every later command here
  [ "$CFG_NV" = true ] || return 0
  local a named=0
  for a in ${ARGS[@]+"${ARGS[@]}"}; do
    case "$a" in --get|--get-all|--get-regexp|-l|--list|--show-origin|--show-scope|get) return 0 ;; esac
    case "$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')" in core.hookspath|core.hookspath=*) named=1 ;; esac
  done
  [ "$named" = 1 ] && ask "Check first: this changes core.hooksPath, which decides which hooks git runs for every later commit and push in this repository; pointing it elsewhere skips this project's checks the way --no-verify does. A tool that installs its own hooks (husky, for example) sets it on purpose; confirm only if that is what this is." # skilliton-audit: allow verification-off the question naming the flag it compares the change with
  return 0
}

names_config() { # names_config <word> <base>: 0 when the word names the guardrails settings file, by its text or its path
  local r=1                                                    # in any letter case, as mentions_config
  nocase_on
  case "$1" in
    *.skilliton*config.json*|*.skillgate*config.json*) r=0 ;;
    *'$'*|*'`'*) r=2 ;;
  esac
  if [ "$r" = 1 ]; then
    resolve_dir "$2" "$1"
    if [ -n "$RESOLVED" ]; then normalize_path "$RESOLVED"; case "$NORM" in */.skilliton/config.json|*/.skillgate/config.json) r=0 ;; esac; fi
  fi
  nocase_off
  [ "$r" = 0 ]
}

check_config_words() { # check_config_words <index of the first argument> <any|text|inplace|dest>: a program that writes
  # a file it is given (tee, dd of=, sed -i, cp to a destination) or runs code it is given (node -e) asks when that
  # names the settings file. "text" reads every word, options included, because the path may sit inside a program.
  local k=$1 n=${#SEGW[@]} w mode=$2 inplace=0 hit=0 last="" tdir="" srcs=0 dest words=() plain=() i=0 folder
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$mode" in
      text) words[${#words[@]}]=$w ;;
      any|inplace)
        case "$w" in -i*|--in-place*) inplace=1; continue ;; of=*) w=${w#of=} ;; -*) continue ;; esac
        words[${#words[@]}]=$w ;;
      dest)
        case "$w" in
          -t|--target-directory) tdir=${SEGW[$k]:-}; k=$((k + 1)); continue ;;
          --target-directory=*) tdir=${w#*=}; continue ;;
          -t?*) tdir=${w#-t}; continue ;;
          -*) continue ;;
        esac
        [ -z "$last" ] || case "${last##*/}" in config.json) srcs=1 ;; esac
        [ -z "$last" ] || plain[${#plain[@]}]=$last
        last=$w ;;
    esac
  done
  if [ "$mode" != dest ]; then
    [ "$mode" = inplace ] && [ "$inplace" = 0 ] && return 0
    while [ "$i" -lt "${#words[@]}" ]; do guarded_write "${words[$i]}" "$mode"; i=$((i + 1)); done
    return 0
  fi
  # the destination is the -t folder, else the last word; a config.json copied into a settings folder is a write too
  dest=$last
  if [ -n "$tdir" ]; then dest=$tdir; [ -z "$last" ] || plain[${#plain[@]}]=$last; case "${last##*/}" in config.json) srcs=1 ;; esac; fi
  [ -n "$dest" ] || return 0
  if names_config "$dest" "$EFF_DIR"; then hit=1
  elif [ "$srcs" = 1 ]; then
    resolve_dir "$EFF_DIR" "$dest"
    if [ -n "$RESOLVED" ]; then normalize_path "$RESOLVED"; case "$NORM" in */.skilliton|*/.skillgate) hit=1 ;; esac; fi
  fi
  [ "$hit" = 1 ] && { ask "$CONFIG_ASK"; return 0; }
  # the client's settings file and the opt-out file, as the destination itself or as the name a source keeps in a folder
  folder=""
  resolve_dir "$EFF_DIR" "$dest"
  if [ -n "$RESOLVED" ]; then normalize_path "$RESOLVED"; { [ -n "$tdir" ] || [ -d "$NORM" ]; } && folder=$NORM; fi
  if [ -z "$folder" ]; then guarded_write "$dest" dest ${plain[@]+"${plain[@]}"}; return 0; fi
  while [ "$i" -lt "${#plain[@]}" ]; do
    guarded_write "$folder/${plain[$i]##*/}" dest "${plain[$i]}"
    i=$((i + 1))
  done
  return 0
}

expand_known() { # expand_known <word>: sets EXPANDED to the word with a leading $PWD or $CLAUDE_PROJECT_DIR (bare or in
  # braces) replaced by what it holds for this command: the folder the segment runs in, or the project
  local a=$1 v rest
  EXPANDED=$a
  case "$a" in
    '${PWD}'*) v=$EFF_DIR; rest=${a#'${PWD}'} ;;
    '$PWD'*) v=$EFF_DIR; rest=${a#'$PWD'} ;;
    '${CLAUDE_PROJECT_DIR}'*) v=${CLAUDE_PROJECT_DIR:-}; rest=${a#'${CLAUDE_PROJECT_DIR}'} ;;
    '$CLAUDE_PROJECT_DIR'*) v=${CLAUDE_PROJECT_DIR:-}; rest=${a#'$CLAUDE_PROJECT_DIR'} ;;
    *) return 0 ;;
  esac
  case "$rest" in ''|/*) ;; *) return 0 ;; esac   # $PWDX is another variable
  [ -n "$v" ] && EXPANDED=$v$rest
  return 0
}

names_settings() { # names_settings <word>: 0 when the word names the client's settings file; sets NS_FILE to its short
  # name and NS_PATH to where it is, when that can be worked out
  local r=1 w=$1
  NS_FILE=""; NS_PATH=""
  nocase_on
  case "$w" in
    *.claude/settings.local.json*) r=0; NS_FILE=.claude/settings.local.json ;;
    *.claude/settings.json*) r=0; NS_FILE=.claude/settings.json ;;
  esac
  resolve_dir "$EFF_DIR" "$w"
  if [ -n "$RESOLVED" ]; then
    normalize_path "$RESOLVED"
    case "$NORM" in
      */.claude/settings.local.json) r=0; NS_FILE=.claude/settings.local.json; NS_PATH=$NORM ;;
      */.claude/settings.json) r=0; NS_FILE=.claude/settings.json; NS_PATH=$NORM ;;
    esac
  fi
  [ "$r" = 0 ] && [ -z "$NS_PATH" ] && [ -n "$EFF_DIR" ] && NS_PATH="$EFF_DIR/$NS_FILE"   # named inside a program's text
  nocase_off
  [ "$r" = 0 ]
}

names_optout() { # names_optout <word>: 0 when the word names the opt-out file (.skilliton-off at a repository's root, or
  # skilliton-off inside its Git folder); sets NO_FILE to the name shown
  local r=1
  NO_FILE=""
  nocase_on
  case "$1" in
    *.skilliton-off*) r=0; NO_FILE=.skilliton-off ;;
    *.git/skilliton-off*) r=0; NO_FILE=.git/skilliton-off ;;
  esac
  if [ "$r" = 1 ]; then
    resolve_dir "$EFF_DIR" "$1"
    if [ -n "$RESOLVED" ]; then normalize_path "$RESOLVED"; case "$NORM" in */.git/skilliton-off) r=0; NO_FILE=.git/skilliton-off ;; esac; fi
  fi
  nocase_off
  [ "$r" = 0 ]
}

HOOK_WORD=""
hook_word() { # hook_word <text>: sets HOOK_WORD to the first of disableAllHooks, enabledPlugins and hooks the text holds
  HOOK_WORD=""
  nocase_on
  case "$1" in
    *disableallhooks*) HOOK_WORD=disableAllHooks ;;
    *enabledplugins*) HOOK_WORD=enabledPlugins ;;
    *hooks*) HOOK_WORD=hooks ;;
  esac
  nocase_off
}

# guarded_write <word> <write|any|inplace|dest|text|shell> [source...]: the word names a file this segment writes (or,
# for text and shell, a program's text that may write it). The guardrails settings file asks as before; the client's
# settings file asks when the command's text, the file as it is now, or a file copied onto it holds one of the words
# that switch hooks off; the opt-out file always asks. A program's text is judged by the command's words alone, because
# naming the file there is as likely to be a read.
guarded_write() {
  local w=$1 how=$2 where="" s text=""; shift 2
  if names_config "$w" "$EFF_DIR"; then ask "$CONFIG_ASK"; return 0; fi
  if names_optout "$w"; then
    ask "Check first: this command creates $NO_FILE, and while that file is there every workflow hook in this repository stays silent: the session start shows no handoff, no checkpoint or maintain reminder fires, and nothing is recorded. Keeping a repository out of Skilliton is a person's decision; confirm only if that is what was asked for."
    return 0
  fi
  names_settings "$w" || return 0
  hook_word "$IN_CMD"; [ -z "$HOOK_WORD" ] || where="the command's own text"
  for s in "$@"; do
    [ -z "$where" ] || break
    resolve_dir "$EFF_DIR" "$s"
    if [ -z "$RESOLVED" ] || [ ! -f "$RESOLVED" ] || [ ! -r "$RESOLVED" ]; then
      ask "Check first: this command writes $NS_FILE from $s, which guardrails could not read, so it could not tell whether the change turns hooks or plugins off. That file tells Claude Code which hooks and plugins run in this project. Read the file yourself and confirm only if it keeps every hook and plugin running."
      return 0
    fi
    text=$(head -c 1048576 "$RESOLVED" 2>/dev/null); hook_word "$text"; [ -z "$HOOK_WORD" ] || where="$s, which it copies there"
  done
  if [ -z "$where" ] && [ "$how" != text ] && [ -n "$NS_PATH" ] && [ -f "$NS_PATH" ]; then
    text=$(head -c 1048576 "$NS_PATH" 2>/dev/null); hook_word "$text"; [ -z "$HOOK_WORD" ] || where="the file as it is now"
  fi
  [ -n "$where" ] || return 0
  ask "Check first: this command writes $NS_FILE, and $where holds $HOOK_WORD. That file tells Claude Code which hooks and plugins run in this project; a change to hooks, disableAllHooks or enabledPlugins there can switch off the guardrails and every workflow hook for every later command, with nothing said. That is a person's decision, made in their own editor. Confirm only if this change keeps every hook and plugin running."
}

resolve_dir() { # resolve_dir <base> <dir>: sets RESOLVED, or "" when it cannot be known
  local base=$1 a=$2
  expand_known "$a"; a=$EXPANDED   # $PWD/x and $CLAUDE_PROJECT_DIR/x are known here; any other variable is not
  case "$a" in
    *'$'*|*'`'*) RESOLVED="" ;;
    '~') RESOLVED=${HOME:-} ;;
    '~/'*) if [ -n "${HOME:-}" ]; then RESOLVED="$HOME/${a#'~/'}"; else RESOLVED=""; fi ;;
    /*) RESOLVED=$a ;;
    *) if [ -n "$base" ]; then RESOLVED="$base/$a"; else RESOLVED=""; fi ;;
  esac
}

# wrapper_values <wrapper>: sets WV_SHORT to the option letters that take a value and WV_LONG to the long options whose
# value is the next word, for a program that runs the rest of its line as a command. Without these, a value such as the
# FOO of env -u FOO was read as the command, and what followed it went unread.
wrapper_values() {
  WV_SHORT=""; WV_LONG=""
  case "$1" in
    env) WV_SHORT=uCPSLU; WV_LONG=" --unset --chdir --split-string " ;;
    sudo) WV_SHORT=ugpCDrtTUR; WV_LONG=" --user --group --prompt --close-from --chdir --role --type --command-timeout --other-user --chroot --host " ;;
    exec) WV_SHORT=a ;;
    nice) WV_SHORT=n; WV_LONG=" --adjustment " ;;
    timeout) WV_SHORT=sk; WV_LONG=" --signal --kill-after " ;;
    caffeinate) WV_SHORT=tw ;;
    stdbuf) WV_SHORT=ioe; WV_LONG=" --input --output --error " ;;
    ionice) WV_SHORT=cnpPu; WV_LONG=" --class --classdata --pid --pgid --uid " ;;
    time) WV_SHORT=fo; WV_LONG=" --format --output " ;;
  esac
}

analyze_segment() {
  local n=${#SEGW[@]} k=0 w wrapper="" name val last duration=0 saved_dir=$EFF_DIR
  PFX_GARGS=(); PFX_HOOKSPATH=0; PFX_CONFIG=""; PFX_CK=(); PFX_CV=(); PFX_HOOKSKIP=""
  # skip what can stand in front of a command: VAR=value, the wrappers that run the rest of the line and their
  # options (with the value an option takes), timeout's duration, and keywords
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}
    case "$w" in
      sudo|command|builtin|exec|nohup|time|env|nice|timeout|caffeinate|stdbuf|ionice|*/sudo|*/env|*/nice|*/nohup|*/time|*/timeout|*/caffeinate|*/stdbuf|*/ionice)
        wrapper=${w##*/}; wrapper_values "$wrapper"; duration=0; [ "$wrapper" = timeout ] && duration=1
        k=$((k + 1)); continue ;;
      if|then|else|elif|do|while|until|'{'|'}'|'!') wrapper=""; k=$((k + 1)); continue ;;
      -*)
        [ -n "$wrapper" ] || break
        k=$((k + 1)); name=""; val=""
        case "$w" in
          --) continue ;;
          --*=*) name=${w%%=*}; val=${w#*=} ;;
          --*) case "$WV_LONG" in *" $w "*) name=$w; val=${SEGW[$k]:-}; k=$((k + 1)) ;; esac ;;
          *)
            short_cluster "$w" "$WV_SHORT" ""
            last=${SC_LETTERS#"${SC_LETTERS%?}"}
            case "$last" in
              ?) case "$WV_SHORT" in *"$last"*) ;; *) last="" ;; esac ;;
              *) last="" ;;
            esac
            case "$last" in
              ?)
                name=-$last
                if [ "$SC_NEXT" = 1 ]; then val=${SEGW[$k]:-}; k=$((k + 1)); else val=${w#-"$SC_LETTERS"}; fi ;;
            esac ;;
        esac
        case "$wrapper $name" in
          'env -S'|'env --split-string')
            # env -S runs a string as a command line, which is the same class as bash -c
            if mentions_git "$val" || mentions_removal "$val"; then
              ask "Check first: this command hands a string to env -S, which runs it as a command, and guardrails cannot read inside such a string. Read it yourself and confirm only if it is what you intend; to have it checked, run the command directly instead."
            fi
            EFF_DIR=$saved_dir; return 0 ;;
          'env -C'|'env --chdir'|'sudo -D'|'sudo --chdir') resolve_dir "$EFF_DIR" "$val"; EFF_DIR=$RESOLVED ;;
        esac
        continue ;;
      *=*)
        name=${w%%=*}
        case "$name" in ''|[0-9]*|*[!A-Za-z0-9_]*) break ;; esac
        # GIT_DIR= and GIT_WORK_TREE= choose the repository the way --git-dir and --work-tree do, so they become those
        # arguments (the path taken from where the command runs, as the variable is)
        case "$name" in
          GIT_CONFIG_KEY_*|GIT_CONFIG_PARAMETERS)
            # GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath ... sets for one command what -c sets
            case "$(printf '%s' "${w#*=}" | tr '[:upper:]' '[:lower:]')" in *core.hookspath*) PFX_HOOKSPATH=1 ;; esac
            val=${w#*=}
            case "$name" in
              GIT_CONFIG_PARAMETERS) config_parameters "$val" ;;
              *) case "${name#GIT_CONFIG_KEY_}" in ''|*[!0-9]*) ;; *) PFX_CK[${name#GIT_CONFIG_KEY_}]=$val ;; esac ;;
            esac ;;
          GIT_CONFIG_VALUE_*) case "${name#GIT_CONFIG_VALUE_}" in ''|*[!0-9]*) ;; *) PFX_CV[${name#GIT_CONFIG_VALUE_}]=${w#*=} ;; esac ;;
          HUSKY|LEFTHOOK|HUSKY_SKIP_HOOKS|SKIP)
            # the hook managers' own switches (husky, lefthook, pre-commit), which skip the hooks the way --no-verify does
            case "$name=${w#*=}" in HUSKY=0|HUSKY=false|LEFTHOOK=0|LEFTHOOK=false|HUSKY_SKIP_HOOKS=?*|SKIP=?*) PFX_HOOKSKIP=$w ;; esac ;;
          GIT_DIR|GIT_WORK_TREE)
            val=${w#*=}; resolve_dir "$EFF_DIR" "$val"; [ -n "$RESOLVED" ] && val=$RESOLVED
            if [ "$name" = GIT_DIR ]; then PFX_GARGS[${#PFX_GARGS[@]}]="--git-dir=$val"; else PFX_GARGS[${#PFX_GARGS[@]}]="--work-tree=$val"; fi ;;
        esac
        k=$((k + 1)); continue ;;
    esac
    if [ "$duration" = 1 ]; then duration=0; k=$((k + 1)); continue; fi
    break
  done
  if [ "$k" -lt "$n" ]; then
    case "${SEGW[$k]}" in
      cd|pushd) track_cd $((k + 1)); saved_dir=$EFF_DIR ;;
      git|*/git) analyze_git $((k + 1)) ;;
      rm|rmdir|*/rm|*/rmdir) check_remove $((k + 1)) ;;
      mv|*/mv) check_move $((k + 1)); check_config_words $((k + 1)) dest; check_hooks_words $((k + 1)); check_overwrite $((k + 1)) dest ;;
      chmod|*/chmod) check_hooks_words $((k + 1)) ;;
      truncate|*/truncate) check_config_words $((k + 1)) any; check_hooks_words $((k + 1)); check_overwrite $((k + 1)) any ;;
      find|*/find) check_find $((k + 1)); scan_tail "$k" ;;
      rsync|*/rsync) check_config_words $((k + 1)) dest; check_rsync $((k + 1)) ;;
      tee|sponge|*/tee|*/sponge) check_config_words $((k + 1)) any; check_overwrite $((k + 1)) tee ;;
      dd|*/dd) check_config_words $((k + 1)) any; check_overwrite $((k + 1)) any ;;
      sh|bash|zsh|dash|ksh|eval|xargs|*/sh|*/bash|*/zsh|*/dash|*/ksh|*/xargs) analyze_shell_string $((k + 1)) ;;
      cp|install|ln|*/cp|*/install|*/ln) check_config_words $((k + 1)) dest; check_overwrite $((k + 1)) dest ;;
      touch|mkdir|*/touch|*/mkdir) check_config_words $((k + 1)) any ;;
      sed|gsed|*/sed|*/gsed) check_config_words $((k + 1)) inplace ;;
      node|python|python3|perl|ruby|php|bun|deno|osascript|awk|gawk|*/node|*/python|*/python3|*/perl|*/ruby|*/php|*/bun|*/deno|*/osascript|*/awk|*/gawk) check_config_words $((k + 1)) text; check_program_text $((k + 1)) ;;
      *) scan_tail "$k" ;;
    esac
  fi
  EFF_DIR=$saved_dir   # env -C and sudo -D move only the command they wrap
  return 0
}

scan_tail() { # scan_tail <index of the command word>: a program this hook does not know may run the rest of its line
  # (find -exec, a wrapper not listed above). When a later word is exactly git, rm, rmdir or mv, the rest is read as
  # that command, and anything it would refuse or ask about asks instead, because whether it runs cannot be told.
  # A program that only prints, searches or declares its words never runs them, so "echo rm docs" stays allowed.
  local k=$(($1 + 1)) n=${#SEGW[@]} w d=$DENY_REASON a=$ASK_REASON found
  case "${SEGW[$1]##*/}" in
    echo|printf|print|which|type|whereis|man|help|info|grep|egrep|fgrep|rg|ag|ack|cat|less|more|head|tail|ls|wc|sort|uniq|tr|cut|jq|test|'['|'[['|true|false|read|export|local|declare|typeset|readonly|set|unset|alias|unalias|hash) return 0 ;;
  esac
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}
    case "$w" in git|rm|rmdir|mv) break ;; esac
    k=$((k + 1))
  done
  [ "$k" -lt "$n" ] || return 0
  DENY_REASON=""; ASK_REASON=""
  case "$w" in
    git) analyze_git $((k + 1)) ;;
    mv) check_move $((k + 1)) ;;
    *) check_remove $((k + 1)) ;;
  esac
  found=${DENY_REASON:-$ASK_REASON}
  DENY_REASON=$d; ASK_REASON=$a
  [ -n "$found" ] || return 0
  ask "Check first: guardrails does not know whether ${SEGW[$1]} runs the rest of this line as a command. If it does, the $w command in it would have been stopped with this reason: $found"
}

analyze_shell_string() { # analyze_shell_string <index after the shell or eval word>: a string this hook cannot read
  # The words after a shell or eval are a program this hook does not parse. When they name git, the honest answer is
  # to ask: the earlier behaviour was to allow with no output, which read as "checked" (security walkthrough, 2026-09-21).
  local k=$1 n=${#SEGW[@]} rest=""
  while [ "$k" -lt "$n" ]; do rest="$rest ${SEGW[$k]}"; k=$((k + 1)); done
  if mentions_config "$rest"; then ask "$CONFIG_ASK"; return 0; fi
  if mentions_hookfile "$rest"; then guarded_write "$rest" shell; [ -z "$ASK_REASON" ] || return 0; fi
  mentions_git "$rest" || return 0
  ask "Check first: this command hands a string that names git to a shell or to eval, and guardrails cannot read inside such a string. Read it yourself and confirm only if it is what you intend; to have it checked, run the git command directly instead."
}

track_cd() { # track_cd <index of the first argument>
  local k=$1 n=${#SEGW[@]} a=""
  while [ "$k" -lt "$n" ]; do
    case "${SEGW[$k]}" in
      --) k=$((k + 1)); break ;;
      -) break ;;
      -*) k=$((k + 1)) ;;
      *) break ;;
    esac
  done
  if [ "$k" -ge "$n" ]; then EFF_DIR=${HOME:-}; return 0; fi
  a=${SEGW[$k]}
  if [ "$a" = "-" ]; then EFF_DIR=""; return 0; fi
  resolve_dir "$EFF_DIR" "$a"
  EFF_DIR=$RESOLVED
}

analyze_git() { # analyze_git <index after the word git>
  local k=$1 n=${#SEGW[@]} w i aliases line
  GDIR=$EFF_DIR
  GARGS=(${PFX_GARGS[@]+"${PFX_GARGS[@]}"})
  local hookspath=${PFX_HOOKSPATH:-0}
  GC_PUSH=""; GC_PUSH_SEEN=0; GC_PUSH_UNKNOWN=0; GC_PUSHDEFAULT=0; GC_ALIAS=""; GC_ALIAS_UNKNOWN=0; GC_HOOKSPATH=0
  # configuration handed to this one command through the environment: GIT_CONFIG_PARAMETERS, and the KEY_n and
  # VALUE_n pairs of GIT_CONFIG_COUNT (N71)
  while IFS= read -r line; do [ -z "$line" ] || note_git_config "${line%%=*}" "${line#*=}" 1; done <<EOF
$PFX_CONFIG
EOF
  for i in ${PFX_CK[@]+"${!PFX_CK[@]}"}; do
    if [ -n "${PFX_CV[$i]+x}" ]; then note_git_config "${PFX_CK[$i]}" "${PFX_CV[$i]}" 1; else note_git_config "${PFX_CK[$i]}" "" 0; fi
  done
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}
    case "$w" in
      -c|--config-env)
        # `-c core.hooksPath=<dir>` points git at other hooks, which skips this project's hooks the way --no-verify does
        case "$(printf '%s' "${SEGW[$((k + 1))]:-}" | tr '[:upper:]' '[:lower:]')" in core.hookspath=*) hookspath=1 ;; esac
        line=${SEGW[$((k + 1))]:-}
        if [ "$w" = -c ]; then note_git_config "${line%%=*}" "${line#*=}" 1; else note_git_config "${line%%=*}" "" 0; fi
        k=$((k + 2)) ;;
      -c*|--config-env=*)
        case "$(printf '%s' "$w" | tr '[:upper:]' '[:lower:]')" in -ccore.hookspath=*|--config-env=core.hookspath=*) hookspath=1 ;; esac
        case "$w" in
          -c*) line=${w#-c}; note_git_config "${line%%=*}" "${line#*=}" 1 ;;
          *) line=${w#--config-env=}; note_git_config "${line%%=*}" "" 0 ;;   # the value is read from a variable
        esac
        k=$((k + 1)) ;;
      -C)
        if [ $((k + 1)) -lt "$n" ]; then resolve_dir "$GDIR" "${SEGW[$((k + 1))]}"; GDIR=$RESOLVED; fi
        k=$((k + 2)) ;;
      --namespace|--list-cmds|--super-prefix) k=$((k + 2)) ;;
      --git-dir|--work-tree)
        if [ $((k + 1)) -lt "$n" ]; then GARGS[${#GARGS[@]}]="$w=${SEGW[$((k + 1))]}"; fi
        k=$((k + 2)) ;;
      --git-dir=*|--work-tree=*) GARGS[${#GARGS[@]}]=$w; k=$((k + 1)) ;;
      -*) k=$((k + 1)) ;;
      *) break ;;
    esac
  done
  [ "$k" -lt "$n" ] || return 0
  w=${SEGW[$k]}
  ARGS=("${SEGW[@]:$((k + 1))}")
  [ "$GC_HOOKSPATH" = 1 ] && hookspath=1
  if [ "$hookspath" = 1 ] && [ "$CFG_NV" = true ]; then
    case "$w" in commit|push|merge|rebase|am|cherry-pick|revert|pull)
      deny "Blocked: core.hooksPath set for this command (with -c or GIT_CONFIG_KEY_) points git at a different hooks folder, which skips this project's safety checks the same way --no-verify does. Run the command without it, and if a check fails, fix what it reports instead of skipping it." ;; # skilliton-audit: allow verification-off the refusal message naming the override it just blocked
    esac
  fi
  if [ -n "$PFX_HOOKSKIP" ] && [ "$CFG_NV" = true ]; then
    case "$w" in commit|push|merge|rebase|am|cherry-pick|revert|pull)
      ask "Check first: $PFX_HOOKSKIP in front of this git $w tells the project's hook manager (husky, lefthook or pre-commit) to skip its hooks, which skips this project's checks the way --no-verify does. Run it without that setting, and if a check fails, fix what it reports; confirm only if a person asked for the hooks to be skipped this once." ;; # skilliton-audit: allow verification-off the question naming the flag it compares the switch with
    esac
  fi
  aliases=$GC_ALIAS
  [ "$GC_ALIAS_UNKNOWN" = 1 ] && ask "Check first: this command defines a git alias for itself from an environment variable (--config-env), which guardrails cannot read, so it cannot tell what the alias runs. Read it yourself and confirm only if it is what you intend."
  case "$w" in
    push) check_push ;;
    commit) check_commit ;;
    add|stage) check_add ;;   # git stage is a synonym of git add
    reset) check_reset ;;
    clean) check_clean ;;
    checkout) check_checkout ;;
    switch) check_switch ;;
    worktree) check_worktree ;;
    restore) check_restore ;;
    stash) check_stash ;;
    branch) check_branch ;;
    rm) check_git_rm ;;
    config) check_config_hookspath ;;
    merge|rebase|am|cherry-pick|revert|pull) check_verb_noverify "$w" ;;
  esac
  # an alias set for this command runs whatever its body says, under any name: its body is read as the command it is
  while IFS= read -r line; do [ -z "$line" ] || check_alias_body "$line"; done <<EOF
$aliases
EOF
  return 0
}

config_parameters() { # config_parameters <text>: adds each key=value of git's GIT_CONFIG_PARAMETERS ('key'='value' or
  # 'key=value', separated by spaces) to PFX_CONFIG; text with no quote at all is read as one key=value
  local s=$1 key val guard=0
  case "$s" in *"'"*) ;; *) PFX_CONFIG="$PFX_CONFIG$s"$'\n'; return 0 ;; esac
  while [ -n "$s" ] && [ "$guard" -lt 64 ]; do
    guard=$((guard + 1))
    s=${s#"${s%%[! ]*}"}
    [ -n "$s" ] || break
    case "$s" in
      "'"*"'"*) s=${s#\'}; key=${s%%\'*}; s=${s#*\'} ;;
      *"'"*) break ;;   # a quote that does not close
      *) key=${s%% *}; s=${s#"$key"} ;;
    esac
    val=""
    case "$s" in "='"*"'"*) s=${s#=\'}; val=${s%%\'*}; s=${s#*\'}; key="$key=$val" ;; esac
    PFX_CONFIG="$PFX_CONFIG$key"$'\n'
  done
}

note_git_config() { # note_git_config <key> <value> <1: the value is known>: configuration set for one git command that
  # changes what a push or a commit does (N71). Keys are compared in any letter case, as git does.
  local key=$1 val=$2 known=$3
  nocase_on
  case "$key" in
    core.hookspath) GC_HOOKSPATH=1 ;;
    remote.*.push) GC_PUSH_SEEN=1; if [ "$known" = 1 ]; then GC_PUSH="$GC_PUSH$val"$'\n'; else GC_PUSH_UNKNOWN=1; fi ;;
    push.default) GC_PUSHDEFAULT=1 ;;
    alias.*) if [ "$known" = 1 ]; then GC_ALIAS="$GC_ALIAS$val"$'\n'; else GC_ALIAS_UNKNOWN=1; fi ;;
  esac
  nocase_off
}

check_verb_noverify() { # check_verb_noverify <verb>: --no-verify on merge, rebase, am, cherry-pick, revert and pull (N71) # skilliton-audit: allow verification-off the guard's own rule for the flag it blocks
  [ "$CFG_NV" = true ] || return 0
  local j=0 n=${#ARGS[@]} w nv=0
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      --) break ;;
      --verify) nv=0 ;;
      --*) is_abbrev "$w" --no-verify && nv=1 ;; # skilliton-audit: allow verification-off the guard's own parser for the flag it blocks
      -?*) [ "$1" = am ] && { short_cluster "$w" CpS ""; has_letter n && nv=1; } ;;   # only for am is -n the same flag
    esac
  done
  [ "$nv" = 1 ] || return 0
  deny "Blocked: --no-verify on git $1 skips this project's safety checks (the git hooks that run while it works). Run it without --no-verify, and if a check fails, fix what it reports instead of skipping it." # skilliton-audit: allow verification-off the refusal message naming the flag it just blocked
}

check_alias_body() { # check_alias_body <body>: -c alias.<name>=<body> on this command (N71). The body is read as the
  # command it runs: "push -f origin main" as git push -f origin main, "!..." as a shell command line.
  local body=$1 text d a verbs=0
  case "$body" in '!'*) text=${body#!} ;; *) text="git $body" ;; esac
  case "$body" in *push*|*commit*|*reset*|*checkout*|*clean*|*'branch -D'*|*--no-verify*) verbs=1 ;; esac # skilliton-audit: allow verification-off the guard's own reader of the flag in an alias
  analyze_text "$text"; d=$AT_DENY; a=$AT_ASK
  if [ -n "$d" ]; then
    deny "Blocked: this command defines a git alias for itself (-c alias...) that runs \"$body\", and guardrails read that as: $d"
  elif [ -n "$a" ]; then
    ask "Check first: this command defines a git alias for itself (-c alias...) that runs \"$body\", and guardrails read that as: $a"
  elif [ "$verbs" = 1 ]; then
    ask "Check first: this command defines a git alias for itself (-c alias...) that runs \"$body\", which pushes, commits or discards work, and guardrails cannot be sure it has read an alias the way git runs it. Run the git command directly instead, so it can be checked; confirm only if it is what you intend."
  fi
}

ANALYZE_DEPTH=0
analyze_text() { # analyze_text <command text>: runs the whole check on a command line of its own, from where this
  # segment runs, and sets AT_DENY and AT_ASK to what it decided; the state of the command being checked is kept
  local s_toks s_segw s_segr s_args
  s_toks=(${TOKS[@]+"${TOKS[@]}"})
  s_segw=(${SEGW[@]+"${SEGW[@]}"})
  s_segr=(${SEGR[@]+"${SEGR[@]}"})
  s_args=(${ARGS[@]+"${ARGS[@]}"})
  local s_cmd=$IN_CMD s_cwd=$IN_CWD s_eff=$EFF_DIR s_redirs=$REDIRS s_gdir=$GDIR s_deny=$DENY_REASON s_ask=$ASK_REASON s_uns=$TOK_UNSURE
  AT_DENY=""; AT_ASK=""
  if [ "$ANALYZE_DEPTH" -ge 3 ]; then AT_ASK="Check first: aliases inside aliases are nested too deep for guardrails to follow."; return 0; fi
  ANALYZE_DEPTH=$((ANALYZE_DEPTH + 1))
  IN_CMD=$1; IN_CWD=$EFF_DIR; DENY_REASON=""; ASK_REASON=""; TOK_UNSURE=0
  if tokenize; then walk_segments; else ASK_REASON="Check first: guardrails could not split it into its parts."; fi
  [ "$TOK_UNSURE" = 0 ] || ask "Check first: guardrails could not tell where a quote in it ends."
  AT_DENY=$DENY_REASON; AT_ASK=$ASK_REASON
  ANALYZE_DEPTH=$((ANALYZE_DEPTH - 1))
  TOKS=(${s_toks[@]+"${s_toks[@]}"})
  SEGW=(${s_segw[@]+"${s_segw[@]}"})
  SEGR=(${s_segr[@]+"${s_segr[@]}"})
  ARGS=(${s_args[@]+"${s_args[@]}"})
  IN_CMD=$s_cmd; IN_CWD=$s_cwd; EFF_DIR=$s_eff; REDIRS=$s_redirs; GDIR=$s_gdir; DENY_REASON=$s_deny; ASK_REASON=$s_ask; TOK_UNSURE=$s_uns
}

# ---------------------------------------------------------------- helpers for the rules

deny() { [ -n "$DENY_REASON" ] || DENY_REASON=$1; }
ask()  { [ -n "$ASK_REASON" ] || ASK_REASON=$1; }

g() { # git, run where this segment runs, with no prompts, no pager, and no stderr
  [ -n "$GDIR" ] || return 97
  # The same variables the runtime takes out (runtime/lib/journal.mjs): the ones that would choose a different
  # repository than -C names, hand git settings from outside a configuration file, name a program for it to run, or
  # turn off the certificate check. A decision about the command a session is running must not be answerable by the
  # environment that session set up. unset is the shell's own, so this needs no program on PATH: a helper that
  # depended on one would fail open on a machine without it, which for this hook means a secret-shaped commit
  # allowed with nothing said. GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n cannot be named one by one, and do not need
  # to be: git reads them only when GIT_CONFIG_COUNT is set, which it no longer is.
  # Standard input is G_IN (the object names cat-file reads) or an empty line, never the terminal.
  (
    unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
          GIT_NAMESPACE GIT_COMMON_DIR GIT_PREFIX GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM \
          GIT_CONFIG_COUNT GIT_CONFIG_PARAMETERS GIT_PROXY_COMMAND GIT_SSH_COMMAND GIT_SSH \
          GIT_ALLOW_PROTOCOL GIT_EXTERNAL_DIFF GIT_TEXTCONV GIT_EXEC_PATH GIT_ASKPASS SSH_ASKPASS \
          SSH_ASKPASS_REQUIRE GIT_EDITOR GIT_SEQUENCE_EDITOR GIT_PAGER GIT_TEMPLATE_DIR \
          GIT_SSL_NO_VERIFY GIT_SSL_CAINFO GIT_SSL_CAPATH GIT_SSL_CERT GIT_SSL_KEY GIT_SSL_VERSION GIT_SSL_CIPHER_LIST \
          GIT_CONFIG_NOSYSTEM GIT_ATTR_NOSYSTEM GIT_CURL_VERBOSE GIT_REDIRECT_STDIN GIT_REDIRECT_STDERR GIT_REDIRECT_STDOUT \
          GIT_TRACE GIT_TRACE2 GIT_TRACE_CURL GIT_TRACE_PACKET GIT_TRACE_PERFORMANCE GIT_TRACE_SETUP \
          GIT_LITERAL_PATHSPECS GIT_ICASE_PATHSPECS GIT_GLOB_PATHSPECS GIT_NOGLOB_PATHSPECS
    exec git -C "$GDIR" ${GARGS[@]+"${GARGS[@]}"} -c core.quotepath=off -c core.fsmonitor=false "$@"
  ) 2>/dev/null <<EOF
${G_IN:-}
EOF
}

repo_state() { # 0: a git repository; 1: not one; 2: the directory could not be worked out
  [ -n "$GDIR" ] || return 2
  g rev-parse --git-dir >/dev/null && return 0
  return 1
}

current_branch() { # sets CUR_BRANCH. Same answer as rev-parse --abbrev-ref HEAD on a branch, and it
  # also works on a branch with no commits yet. Detached HEAD fails, which callers treat as unknown.
  CUR_BRANCH=$(g symbolic-ref --quiet --short HEAD) && [ -n "$CUR_BRANCH" ] && return 0
  CUR_BRANCH=""
  return 1
}

short_cluster() { # short_cluster <-abc> <letters that take a value> <letters whose value is attached only>
  # Sets SC_LETTERS to the option letters, stopping at the first letter that takes a value (the rest
  # of the word is that value), and SC_NEXT=1 when that value is the next word instead.
  local w=${1#-} req=$2 opt=$3 i=0 c n
  n=${#w}
  SC_LETTERS=""; SC_NEXT=0
  while [ "$i" -lt "$n" ]; do
    c=${w:$i:1}
    SC_LETTERS="$SC_LETTERS$c"
    if [ -n "$req" ]; then
      case "$req" in *"$c"*) [ $((i + 1)) -eq "$n" ] && SC_NEXT=1; return 0 ;; esac
    fi
    if [ -n "$opt" ]; then
      case "$opt" in *"$c"*) return 0 ;; esac
    fi
    i=$((i + 1))
  done
  return 0
}
has_letter() { case "$SC_LETTERS" in *"$1"*) return 0 ;; esac; return 1; }

is_abbrev() { # is_abbrev <word> <full long option>: 0 when the word, before any =, is the option or a start of it that git
  # would take as that option. Git takes any unambiguous start (measured on 2.51: --mir is --mirror, --force-w is
  # --force-with-lease); a start that could be more than one option is refused by git, and is read here as each of them.
  local w=${1%%=*}
  case "$w" in --?*) ;; *) return 1 ;; esac
  case "$2" in "$w"*) return 0 ;; esac
  return 1
}

is_everything() { case "$1" in .|./|:/|'*') return 0 ;; esac; return 1; }

# written_then_staged <newline list of paths> <1 when the whole tree is taken>: 0, with HIT_FILE set, when an earlier
# segment of this command redirected into a path this add or commit names. The hook reads the tree before the command
# runs, so what that write puts there cannot have been scanned. A path is compared after cd and .., and a pattern such
# as *.txt is matched against the written path, since the shell would expand it only when the command runs.
written_then_staged() {
  local t p abs top
  [ -n "$REDIRS" ] && [ -n "$GDIR" ] || return 1
  normalize_path "$GDIR"; top=$NORM
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    case "$t" in "$top"/*) ;; *) continue ;; esac
    if [ "$2" = 1 ]; then HIT_FILE=${t#"$top"/}; return 0; fi
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      if is_everything "$p"; then HIT_FILE=${t#"$top"/}; return 0; fi
      resolve_dir "$GDIR" "$p"; [ -n "$RESOLVED" ] || continue
      normalize_path "$RESOLVED"; abs=$NORM
      # shellcheck disable=SC2254
      case "$t" in "$abs"|"$abs"/*|$abs) HIT_FILE=${t#"$top"/}; return 0 ;; esac
    done <<PATHS
$1
PATHS
  done <<WRITTEN
$REDIRS
WRITTEN
  return 1
}

written_reason() { # written_reason <add|commit>: sets REASON for a file written earlier in the same command
  REASON="Check first: an earlier part of this command writes $HIT_FILE, and this git $1 would take it in. guardrails reads the files as they are before the command runs, so what that write puts there has not been checked for passwords or keys. Run the write on its own first, then stage or commit in a separate command so the file can be checked."
}

ask_unlisted() {
  ask "Check first: guardrails could not list the files this command would stage or commit, so it could not check them for passwords or keys. Look for files such as .env or *.pem first, and confirm only if none of them is included."
}

# ---------------------------------------------------------------- secrets

secret_name() { # secret_name <path>: sets SN_RULE when the file name looks like it holds a secret
  local b=${1##*/}
  SN_RULE=""
  shopt -s nocasematch
  case "$b" in
    .env.example|.env.sample|.env.template) ;;
    .env) SN_RULE=".env" ;;
    .env.*) SN_RULE=".env.*" ;;
    id_rsa*.pub|id_ed25519*.pub) ;;
    id_rsa*) SN_RULE="id_rsa*" ;;
    id_ed25519*) SN_RULE="id_ed25519*" ;;
    *.pem) SN_RULE="*.pem" ;;
    *.key) SN_RULE="*.key" ;;
    *.p12) SN_RULE="*.p12" ;;
    *.pfx) SN_RULE="*.pfx" ;;
    *.keystore) SN_RULE="*.keystore" ;;
    *credentials*.csv) SN_RULE="*credentials*.csv" ;;
    *accesskeys*.csv) SN_RULE="*accessKeys*.csv" ;;
    *api-key*) SN_RULE="*api-key*" ;;
  esac
  shopt -u nocasematch
  [ -n "$SN_RULE" ]
}

name_reason() { # name_reason <file> <add|commit>: sets REASON
  if [ "$2" = add ]; then
    REASON="Blocked: $1 looks like a file that holds passwords or keys (it matches the $SN_RULE rule), and anything committed stays in the project history even after it is deleted. Leave it out of git: add it to .gitignore and stage the files you mean to commit by name instead."
  else
    REASON="Blocked: $1 looks like a file that holds passwords or keys (it matches the $SN_RULE rule), and this commit would save it into the project history, where it stays even after it is deleted. Unstage it with git restore --staged $1, add it to .gitignore, and commit the other files."
  fi
}

content_reason() { # content_reason <file> <add|commit>: sets REASON. Names the file and the rule, never the value.
  if [ "$2" = add ]; then
    REASON="Blocked: $1 contains text shaped like $HIT_RULE, and anything committed stays in the project history even after it is removed. Move that value out of the file, into an environment variable or a secrets manager, before staging the file."
  else
    REASON="Blocked: the changes being committed in $1 contain text shaped like $HIT_RULE, and a commit keeps it in the project history even after it is removed. Unstage the file with git restore --staged $1, move that value into an environment variable or a secrets manager, and commit again."
  fi
}

check_names_list() { # check_names_list <newline list> <add|commit> <1: skip paths that do not exist>
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ "$3" = 1 ] && [ ! -e "$GDIR/$f" ] && [ ! -L "$GDIR/$f" ]; then continue; fi
    if secret_name "$f"; then name_reason "$f" "$2"; deny "$REASON"; return 0; fi
  done <<EOF
$1
EOF
  return 1
}

# The same list, in the same order, as CREDENTIAL_SHAPES in the workflow plugin's runtime/lib/secret-rules.mjs, which
# the other scanners import; scripts/secret-rules.test.mjs fails when the two differ. Change both together.
SECRET_RES=(
  '(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}'
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'sk-proj-[A-Za-z0-9_-]{20,}'
  'gh[pousr]_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  'glpat-[A-Za-z0-9_-]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'sk_live_[A-Za-z0-9]{16,}'
  'npm_[A-Za-z0-9]{30,}'
  'dop_v1_[A-Za-z0-9]{30,}'
  'shpat_[A-Za-z0-9]{30,}'
  'sbp_[A-Za-z0-9]{30,}'
  'AIza[A-Za-z0-9_-]{30,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
SECRET_LABELS=(
  'an AWS access key ID'
  'an Anthropic API key'
  'an OpenAI project key'
  'a GitHub access token'
  'a GitHub fine-grained token'
  'a GitLab access token'
  'a Slack token'
  'a Stripe live secret key'
  'an npm access token'
  'a DigitalOcean token'
  'a Shopify access token'
  'a Supabase access token'
  'a Google API key'
  'a private key'
)
SECRET_ALT=$(IFS='|'; printf '%s' "${SECRET_RES[*]}")

identify_rule() { # identify_rule <text>: sets HIT_RULE to the label of the first pattern it matches
  local i=0
  HIT_RULE="a secret"
  while [ "$i" -lt "${#SECRET_RES[@]}" ]; do
    if printf '%s\n' "$1" | grep -q -E -e "${SECRET_RES[$i]}"; then HIT_RULE=${SECRET_LABELS[$i]}; return 0; fi
    i=$((i + 1))
  done
}

scan_diff() { # scan_diff <unified diff>: sets HIT_FILE and HIT_RULE for the first ADDED line shaped like a secret
  local hits line cur=""
  HIT_FILE=""; HIT_RULE=""
  [ -n "$1" ] || return 0
  hits=$(printf '%s\n' "$1" | grep -E -e '^\+\+\+ ' -e "^[+].*($SECRET_ALT)")
  [ -n "$hits" ] || return 0
  while IFS= read -r line; do
    case "$line" in
      '+++ '*)
        cur=${line#'+++ '}
        cur=${cur%$'\t'}
        case "$cur" in b/*) cur=${cur#b/} ;; /dev/null) cur="" ;; esac ;;
      *)
        HIT_FILE=${cur:-a staged file}
        identify_rule "$line"
        return 0 ;;
    esac
  done <<EOF
$hits
EOF
  return 0
}

scan_files() { # scan_files <newline list of paths relative to GDIR>: sets HIT_FILE and HIT_RULE
  local f list hit i
  HIT_FILE=""; HIT_RULE=""
  FILES=()
  while IFS= read -r f; do
    if [ -n "$f" ] && [ -f "$GDIR/$f" ]; then FILES[${#FILES[@]}]="./$f"; fi
  done <<EOF
$1
EOF
  [ "${#FILES[@]}" -gt 0 ] || return 0
  # Files over 10 MB are checked by name only, so one large data file cannot run the hook past its
  # time limit (a hook that times out blocks nothing).
  list=$(cd "$GDIR" && find "${FILES[@]}" -prune -type f -size -10240k -print 2>/dev/null)
  [ -n "$list" ] || return 0
  FILES=()
  while IFS= read -r f; do
    if [ -n "$f" ]; then FILES[${#FILES[@]}]=$f; fi
  done <<EOF
$list
EOF
  hit=$(cd "$GDIR" && grep -l -I -s -E -e "$SECRET_ALT" -- "${FILES[@]}" 2>/dev/null)
  hit=${hit%%$'\n'*}
  [ -n "$hit" ] || return 0
  HIT_FILE=${hit#./}
  HIT_RULE="a secret"
  i=0
  while [ "$i" -lt "${#SECRET_RES[@]}" ]; do
    if (cd "$GDIR" && grep -q -I -s -E -e "${SECRET_RES[$i]}" -- "$hit"); then HIT_RULE=${SECRET_LABELS[$i]}; break; fi
    i=$((i + 1))
  done
  return 0
}

# ---------------------------------------------------------------- deny rules

check_push() {
  local n=${#ARGS[@]} j=0 w plain=0 lease=0 incl=0 force=0 delete=0 mirror=0 all=0 noverify=0 endopts=0 remote_seen=0 refs="" r plus del dst branches b target first
  local vars="" matching=0 fromcfg=0 dry=0
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    if [ "$endopts" = 0 ]; then
      case "$w" in
        --) endopts=1; continue ;;
        --force) plain=1; continue ;;
        # --dry-run (or -n) sends nothing: git works out what it would update and leaves the remote as it was (measured
        # on git 2.51.1 against a bare remote: --dry-run -f, -n -f, -fn and --dr -f all left main unchanged). A later
        # --no-dry-run, or any start of it, takes it back; git refuses --d as ambiguous and --dry-run=<x> as taking no
        # value, so neither counts as a dry run here.
        --dry-run) dry=1; continue ;;
        # --no-force takes back --force only: an earlier --force-with-lease or --force-if-includes still forces (N71;
        # measured on git 2.51: --force-with-lease --no-force HEAD:main force-updates main)
        --no-force) plain=0; continue ;;
        --no-force-with-lease) lease=0; continue ;;
        --no-force-if-includes) incl=0; continue ;;
        --no-mirror) mirror=0; continue ;;
        --no-delete) delete=0; continue ;;
        --no-all|--no-branches) all=0; continue ;;
        --verify) noverify=0; continue ;;
        --repo|--receive-pack|--exec|--push-option|--recurse-submodules) j=$((j + 1)); continue ;;
        --*)
          # git takes any unambiguous start of a long option as that option; a start that could be a dangerous one is
          # read as it, and as every dangerous one it could be (N71)
          is_abbrev "$w" --force && plain=1
          is_abbrev "$w" --force-with-lease && lease=1
          is_abbrev "$w" --force-if-includes && incl=1
          is_abbrev "$w" --mirror && mirror=1
          is_abbrev "$w" --delete && delete=1
          { is_abbrev "$w" --all || is_abbrev "$w" --branches; } && all=1
          is_abbrev "$w" --no-verify && noverify=1 # skilliton-audit: allow verification-off the guard's own parser for the abbreviated form of the flag it blocks
          case "$w" in
            *=*) ;;
            *) is_abbrev "$w" --dry-run && ! is_abbrev "$w" --delete && dry=1 ;;
          esac
          is_abbrev "$w" --no-dry-run && dry=0
          continue ;;
        -?*)
          short_cluster "$w" o ""
          has_letter f && plain=1
          has_letter d && delete=1
          has_letter n && dry=1
          [ "$SC_NEXT" = 1 ] && j=$((j + 1))
          continue ;;
      esac
    fi
    case "$w" in *'$'*|*'`'*) vars="$vars${vars:+, }$w" ;; esac
    if [ "$remote_seen" = 0 ]; then remote_seen=1; else refs="$refs$w"$'\n'; fi
  done
  { [ "$plain" = 1 ] || [ "$lease" = 1 ] || [ "$incl" = 1 ]; } && force=1

  if [ "$noverify" = 1 ] && [ "$CFG_NV" = true ]; then
    deny "Blocked: --no-verify skips this project's safety checks (the git hooks that run before a push). Push without --no-verify, and if a check fails, fix what it reports instead of skipping it." # skilliton-audit: allow verification-off the refusal message naming the flag it just blocked
  fi
  [ "$CFG_FP" = true ] || return 0
  # a dry run overwrites and deletes nothing on the remote, so a forced, deleting or mirroring one goes through
  [ "$dry" = 1 ] && return 0

  if [ "$mirror" = 1 ]; then
    first=${CFG_PB%%$'\n'*}
    if [ -n "$first" ]; then
      deny "Blocked: git push --mirror overwrites every branch on the remote to match this copy, including the shared $first branch, and could erase other people's work. Push only your own branch by name, without --force, and open a pull request instead."
    fi
    return 0
  fi

  # an unresolved variable where the remote or a branch goes: which branch a force-push or a delete reaches cannot be
  # known here, the same rule as for a command substitution (N71)
  if [ -n "$vars" ]; then
    if [ "$force" = 1 ] || [ "$delete" = 1 ] || case "$refs" in +*|*$'\n'+*|:*|*$'\n':*) true ;; *) false ;; esac; then
      ask "Check first: this push names $vars, which guardrails cannot resolve (a variable or a command substitution), so it cannot tell which branch it would overwrite or delete. Run git branch --show-current and write the branch out by name; confirm only if it is not a shared branch such as main."
    fi
  fi

  # remote.<name>.push set for this command decides what a push with no refspec updates (N71)
  if [ "$GC_PUSH_SEEN" = 1 ]; then
    ask "Check first: this push sets remote.<name>.push for itself (with -c or GIT_CONFIG_...), which changes which branches it updates and whether it forces them. Push the branch by name instead; confirm only if no shared branch such as main is overwritten."
    [ -n "$refs" ] || { refs=$GC_PUSH; fromcfg=1; }
  fi
  if [ "$GC_PUSHDEFAULT" = 1 ] && [ "$force" = 1 ]; then
    ask "Check first: this force-push sets push.default for itself, which changes which branch a push with no branch named updates, so guardrails cannot tell which one it would overwrite. Push the branch by name; confirm only if it is not a shared branch such as main."
  fi

  # named refspecs: [+]src:dst or [+]name; a leading + forces that one refspec. A delete (--delete, -d, or a refspec
  # with an empty source such as :main) takes the branch off the remote, which loses as much as a force-push does.
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    case "$r" in *'$'*|*'`'*) continue ;; esac   # asked about above
    plus=0; del=$delete
    case "$r" in +*) plus=1; r=${r#+} ;; esac
    # ":" alone (or "+:") is the matching refspec: every branch that exists on both sides
    if [ "$r" = ":" ]; then { [ "$force" = 1 ] || [ "$plus" = 1 ]; } && matching=1; continue; fi
    case "$r" in :*) del=1 ;; esac
    [ "$force" = 1 ] || [ "$plus" = 1 ] || [ "$del" = 1 ] || continue
    case "$r" in *:*) dst=${r##*:} ;; *) dst=$r ;; esac
    [ -n "$dst" ] || dst=HEAD   # a refspec with no branch (+HEAD:, from remote.<name>.push) pushes the current one
    # git reads heads/main on the remote side as refs/heads/main (measured 2026-09-22: a real remote's main was
    # force-updated by HEAD:heads/main), so both prefixes come off before the name is compared.
    dst=${dst#refs/}
    dst=${dst#heads/}
    case "$dst" in
      *'*'*)
        # a pattern refspec (refs/heads/*) reaches every branch it matches, which is every protected one it can
        first=${CFG_PB%%$'\n'*}
        if [ -n "$first" ]; then
          deny "Blocked: this force-push names a pattern ($dst), which would overwrite every branch it matches on the remote, including the shared $first branch, and could erase other people's work. Push your own branch by name without --force and open a pull request instead."
          return 0
        fi
        continue ;;
    esac
    if [ "$dst" = HEAD ] || [ "$dst" = "@" ]; then
      if ! current_branch; then
        ask "Check first: guardrails could not tell which branch this force-push would overwrite. Run git branch --show-current to see where you are, and confirm only if it is not a shared branch such as main."
        continue
      fi
      dst=$CUR_BRANCH
    fi
    if is_protected "$dst"; then
      if [ "$del" = 1 ]; then
        deny "Blocked: this would delete the shared $dst branch on the remote and could erase other people's work. Delete only branches of your own; if $dst really has to go, the person who looks after it removes it."
      elif [ "$fromcfg" = 1 ]; then
        deny "Blocked: remote.<name>.push, set for this command, makes this push force-update the shared $dst branch and could erase other people's work. Push your branch by name without --force and open a pull request instead."
      else
        deny "Blocked: this would force-push over the shared $dst branch and could erase other people's work. Push your branch without --force and open a pull request instead."
      fi
      return 0
    fi
  done <<EOF
$refs
EOF
  if [ "$matching" = 1 ]; then all=1; force=1; fi
  [ "$force" = 1 ] || return 0

  if [ "$all" = 1 ]; then
    if ! branches=$(g for-each-ref --format='%(refname:short)' refs/heads); then
      ask "Check first: guardrails could not list the branches this force-push would overwrite. Confirm only if none of them is a shared branch such as main."
      return 0
    fi
    while IFS= read -r b; do
      if is_protected "$b"; then
        deny "Blocked: git push --all with --force (or the matching refspec \":\" forced) would force-push every branch, including the shared $b branch, and could erase other people's work. Push your own branch by name without --force and open a pull request instead."
        return 0
      fi
    done <<EOF
$branches
EOF
    return 0
  fi

  # no branch named: git pushes the current branch
  [ -z "$refs" ] || return 0
  [ -z "$vars" ] || return 0   # a variable in the remote's place may carry a branch too; asked about above
  if ! current_branch; then
    ask "Check first: guardrails could not tell which branch this force-push would overwrite. Run git branch --show-current to see where you are, and confirm only if it is not a shared branch such as main."
    return 0
  fi
  if is_protected "$CUR_BRANCH"; then
    deny "Blocked: you are on the shared $CUR_BRANCH branch, and this force-push would overwrite it and could erase other people's work. Move your work to its own branch (git switch -c my-change), push that without --force, and open a pull request instead."
    return 0
  fi
  # the branch a plain push from here actually updates, which upstream settings can point elsewhere
  if target=$(g rev-parse --abbrev-ref --symbolic-full-name '@{push}') && [ -n "$target" ]; then
    target=${target#*/}
    if is_protected "$target"; then
      deny "Blocked: this force-push from $CUR_BRANCH would land on the shared $target branch (this branch is set up to push there) and could erase other people's work. Push to a branch of your own without --force and open a pull request instead."
    fi
  fi
  return 0
}

check_commit() {
  local n=${#ARGS[@]} j=0 w noverify=0 all=0 endopts=0 paths="" p names extra diff state
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    if [ "$endopts" = 0 ]; then
      case "$w" in
        --) endopts=1; continue ;;
        --no-verify) noverify=1; continue ;; # skilliton-audit: allow verification-off the guard's own parser for the flag it blocks
        --verify) noverify=0; continue ;;
        --all) all=1; continue ;;
        --message|--file|--reuse-message|--reedit-message|--template|--author|--date|--cleanup|--trailer|--fixup|--squash|--pathspec-from-file) j=$((j + 1)); continue ;;
        --*) if is_abbrev "$w" --no-verify; then noverify=1; fi; continue ;; # skilliton-audit: allow verification-off the guard's own parser for the abbreviated form of the flag it blocks
        -?*)
          short_cluster "$w" mFcCt Su
          has_letter n && noverify=1
          has_letter a && all=1
          [ "$SC_NEXT" = 1 ] && j=$((j + 1))
          continue ;;
      esac
    fi
    paths="$paths$w"$'\n'
  done

  if [ "$noverify" = 1 ] && [ "$CFG_NV" = true ]; then
    deny "Blocked: --no-verify (or -n) skips this project's safety checks (the git hooks that run before a commit is saved). Commit without it, and if a check fails, fix what it reports instead of skipping it." # skilliton-audit: allow verification-off the refusal message naming the flag it just blocked
  fi
  [ "$CFG_SF" = true ] || return 0
  check_names_list "$paths" commit 0 && return 0
  if written_then_staged "$paths" "$all"; then written_reason commit; ask "$REASON"; fi   # the scan goes on: a deny below still wins
  repo_state; state=$?
  [ "$state" = 1 ] && return 0          # not a repository: this commit cannot run there
  if [ "$state" = 2 ]; then ask_unlisted; return 0; fi

  PA=()
  while IFS= read -r p; do
    if [ -n "$p" ]; then PA[${#PA[@]}]=$p; fi
  done <<EOF
$paths
EOF
  # staged removals (--diff-filter=d) are allowed: taking a secret file out of git is the fix
  if ! names=$(g diff --cached --name-only --diff-filter=d); then ask_unlisted; return 0; fi
  if [ "$all" = 1 ]; then
    if ! extra=$(g diff --name-only --diff-filter=d); then ask_unlisted; return 0; fi
    names="$names"$'\n'"$extra"
  fi
  if [ "${#PA[@]}" -gt 0 ]; then
    if ! extra=$(g diff --name-only --diff-filter=d -- "${PA[@]}"); then ask_unlisted; return 0; fi
    names="$names"$'\n'"$extra"
  fi
  check_names_list "$names" commit 0 && return 0

  # A file over the content-scan cap is checked by name only, as on the add path, so one large file cannot run the
  # hook past its time limit into an allow (N72): the diff below leaves it out, and the commit asks, naming it.
  if ! commit_big_files "$all"; then ask_unlisted; return 0; fi
  local top_all pa_all
  top_all=()
  pa_all=(${PA[@]+"${PA[@]}"})
  if [ "${#EXCL[@]}" -gt 0 ]; then top_all=(-- ":/" "${EXCL[@]}"); pa_all=(${PA[@]+"${PA[@]}"} "${EXCL[@]}"); fi
  if ! diff=$(g diff --cached -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d ${top_all[@]+"${top_all[@]}"}); then ask_unlisted; return 0; fi
  if [ "$all" = 1 ]; then
    if ! extra=$(g diff -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d ${top_all[@]+"${top_all[@]}"}); then ask_unlisted; return 0; fi
    diff="$diff"$'\n'"$extra"
  fi
  if [ "${#PA[@]}" -gt 0 ]; then
    if ! extra=$(g diff -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d -- "${pa_all[@]}"); then ask_unlisted; return 0; fi
    diff="$diff"$'\n'"$extra"
  fi
  scan_diff "$diff"
  if [ -n "$HIT_FILE" ]; then content_reason "$HIT_FILE" commit; deny "$REASON"; fi
  if [ -n "$BIG" ]; then
    ask "Check first: ${BIG%%$'\n'*} is larger than 10 MB, too large for guardrails to scan for passwords or keys within its time limit, so it was checked by name only (the same size rule git add has). Look at what it holds, and confirm only if there is no secret in it."
  fi
  return 0
}

# The content-scan cap: the add path's find -size -10240k scans a file whose size, rounded up to whole KiB, is under
# 10240, so a file over 10239 KiB is checked by name only. The commit path uses the same line (N72).
BIG_BYTES=10484736
EXCL=(); BIG=""
commit_big_files() { # commit_big_files <1: commit -a>: sets BIG to the files this commit takes that are over the cap, one
  # per line relative to the top of the repository, and EXCL to the pathspecs that leave them out of a diff. A staged
  # file is measured by its size in the index, not on disk; a working-tree file (-a, or paths named) by its size on
  # disk. Returns 1 when the sizes could not be read.
  local whole=$1 raw line meta path paths="" shas="" sizes p z top extra f
  BIG=""; EXCL=()
  raw=$(g diff --cached --raw --no-abbrev --diff-filter=d) || return 1
  while IFS= read -r line; do
    case "$line" in :*) ;; *) continue ;; esac
    meta=${line%%$'\t'*}; path=${line##*$'\t'}
    case "$path" in '"'*'"') path=${path#'"'}; path=${path%'"'} ;; esac
    set -f; set -- $meta; set +f
    [ -n "${4:-}" ] || continue
    paths="$paths$path"$'\n'; shas="$shas$4"$'\n'
  done <<EOF
$raw
EOF
  if [ -n "$shas" ]; then
    G_IN=$shas; sizes=$(g cat-file --batch-check='%(objectsize)'); z=$?; G_IN=""
    [ "$z" = 0 ] || return 1
    while IFS= read -r p <&3 && IFS= read -r z <&4; do
      case "$z" in ''|*[!0-9]*) continue ;; esac   # a submodule's commit is not an object here
      [ "$z" -gt "$BIG_BYTES" ] && BIG="$BIG$p"$'\n'
    done 3<<EOF 4<<EOF2
$paths
EOF
$sizes
EOF2
  fi
  if [ "$whole" = 1 ] || [ "${#PA[@]}" -gt 0 ]; then
    top=$(g rev-parse --show-toplevel) || return 1
    if [ "$whole" = 1 ]; then extra=$(g diff --name-only --diff-filter=d) || return 1; else extra=""; fi
    if [ "${#PA[@]}" -gt 0 ]; then extra="$extra"$'\n'"$(g diff --name-only --diff-filter=d -- "${PA[@]}")" || return 1; fi
    FILES=()
    while IFS= read -r f; do [ -n "$f" ] && [ -f "$top/$f" ] && FILES[${#FILES[@]}]="./$f"; done <<EOF
$extra
EOF
    if [ "${#FILES[@]}" -gt 0 ]; then
      extra=$(cd "$top" && find "${FILES[@]}" -prune -type f -size +10239k -print 2>/dev/null)
      while IFS= read -r f; do [ -n "$f" ] && BIG="$BIG${f#./}"$'\n'; done <<EOF
$extra
EOF
    fi
  fi
  while IFS= read -r f; do [ -n "$f" ] && EXCL[${#EXCL[@]}]=":(top,exclude,literal)$f"; done <<EOF
$BIG
EOF
  return 0
}

check_add() {
  [ "$CFG_SF" = true ] || return 0
  local n=${#ARGS[@]} j=0 w broad=0 update=0 force=0 fromfile=0 endopts=0 paths="" p new changed names count diff state
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    if [ "$endopts" = 0 ]; then
      case "$w" in
        --) endopts=1; continue ;;
        --all|--no-ignore-removal) broad=1; continue ;;
        --update) update=1; continue ;;
        --force) force=1; continue ;;
        --pathspec-from-file) fromfile=1; j=$((j + 1)); continue ;;
        --pathspec-from-file=*) fromfile=1; continue ;;
        --chmod) j=$((j + 1)); continue ;;
        --*) continue ;;
        -?*)
          short_cluster "$w" "" ""
          has_letter A && broad=1
          has_letter u && update=1
          has_letter f && force=1
          continue ;;
      esac
    fi
    paths="$paths$w"$'\n'
  done
  if [ -z "$paths" ] && [ "$broad" = 0 ] && [ "$update" = 0 ] && [ "$fromfile" = 0 ]; then return 0; fi

  # 1. names typed on the command line, including patterns such as *.pem
  check_names_list "$paths" add 0 && return 0
  # 1b. a file an earlier part of this command wrote, which the tree read below does not yet hold (N34)
  local whole=0; { [ "$broad" = 1 ] || [ "$update" = 1 ]; } && whole=1
  if written_then_staged "$paths" "$whole"; then written_reason add; ask "$REASON"; fi   # the scan goes on: a deny below still wins

  # 2. the files git would actually stage, listed without taking git's index lock
  repo_state; state=$?
  if [ "$state" != 0 ] || [ "$fromfile" = 1 ]; then
    ask "Check first: guardrails could not work out which files this git add would stage (the folder is not a git repository yet, its location could not be worked out, or the file list comes from another file), so it could not check them for passwords or keys. Look for files such as .env or *.pem first, and confirm only if none of them will be staged."
    return 0
  fi
  PA=()
  while IFS= read -r p; do
    if [ -n "$p" ]; then PA[${#PA[@]}]=$p; fi
  done <<EOF
$paths
EOF
  if [ "${#PA[@]}" -eq 0 ]; then
    # -A or -u with no pathspec means the whole working tree; an empty pathspec stages nothing
    if [ "$broad" = 1 ] || [ "$update" = 1 ]; then PA=(":/"); else return 0; fi
  fi
  new=""
  if [ "$update" = 0 ]; then
    if [ "$force" = 1 ]; then
      new=$(g ls-files --others -- "${PA[@]}") || { ask_unlisted; return 0; }
    else
      new=$(g ls-files --others --exclude-standard -- "${PA[@]}") || { ask_unlisted; return 0; }
    fi
  fi
  changed=$(g ls-files --modified -- "${PA[@]}") || { ask_unlisted; return 0; }
  names="$new"$'\n'"$changed"
  check_names_list "$names" add 1 && return 0

  # 3. the content being added: whole new files, and only the added lines of tracked files
  count=$(printf '%s\n' "$names" | grep -c .)
  if [ "$count" -gt 2000 ]; then
    ask "Check first: this git add would stage $count files, more than guardrails can scan for passwords or keys within its time limit. Stage a smaller set of files by name, or confirm only if you are sure none of them holds a secret."
    return 0
  fi
  scan_files "$new"
  if [ -z "$HIT_FILE" ] && [ -n "$changed" ]; then
    diff=$(g diff -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d -- "${PA[@]}") || { ask_unlisted; return 0; }
    scan_diff "$diff"
  fi
  if [ -n "$HIT_FILE" ]; then content_reason "$HIT_FILE" add; deny "$REASON"; fi
  return 0
}

# ---------------------------------------------------------------- ask rules (work that cannot be recovered)

check_reset() {
  local j=0 n=${#ARGS[@]}
  while [ "$j" -lt "$n" ]; do
    case "${ARGS[$j]}" in
      --) return 0 ;;
      --h|--ha|--har|--hard|--hard=*)
        ask "Check first: git reset --hard throws away every change that has not been committed, and it cannot be undone. To keep that work, commit it or run git stash first; confirm only if losing it is intended."
        return 0 ;;
    esac
    j=$((j + 1))
  done
}

check_clean() {
  local j=0 n=${#ARGS[@]} w force=0 dry=0
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      --) break ;;
      --force) force=1 ;;
      --f|--fo|--for|--forc) force=1 ;;   # a start of --force is --force to git (N71)
      --dry-run) dry=1 ;;
      --exclude) j=$((j + 1)) ;;
      --*) ;;
      -?*)
        short_cluster "$w" e ""
        has_letter f && force=1
        has_letter n && dry=1
        [ "$SC_NEXT" = 1 ] && j=$((j + 1)) ;;
    esac
  done
  if [ "$force" = 1 ] && [ "$dry" = 0 ]; then
    ask "Check first: git clean -f permanently deletes files that git is not tracking (new files that were never committed), and they do not go to the trash. Run git clean -n first to see exactly what would be deleted; confirm only if deleting all of it is intended."
  fi
}

DISCARD_ALL="Check first: this throws away every uncommitted edit to tracked files in this folder, and those edits cannot be recovered. Commit them or run git stash first if they might be wanted; confirm only if discarding them is intended."
check_checkout() {
  local j=0 n=${#ARGS[@]} w force=0 endopts=0 paths="" reset=""
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    if [ "$endopts" = 0 ]; then
      case "$w" in
        --) endopts=1; continue ;;
        -b|--orphan|--conflict|--pathspec-from-file) j=$((j + 1)); continue ;;
        -B) reset=${ARGS[$j]:-a branch}; j=$((j + 1)); continue ;;
        --force) force=1; continue ;;
        --*) is_abbrev "$w" --force && force=1; continue ;;   # a start of --force is --force to git (N71)
        -?*)
          short_cluster "$w" bB ""
          has_letter f && force=1
          if [ "$SC_NEXT" = 1 ]; then has_letter B && reset=${ARGS[$j]:-a branch}; j=$((j + 1)); fi
          continue ;;
      esac
    fi
    if is_everything "$w"; then ask "$DISCARD_ALL"; return 0; fi
    [ "$endopts" = 1 ] && paths="$paths${paths:+ }$w"
  done
  # N73: -f throws away every uncommitted edit on the way to the branch; -- <path> throws away the edits to that path
  if [ "$force" = 1 ]; then
    ask "Check first: git checkout -f throws away every uncommitted edit to tracked files on the way, and those edits cannot be recovered. Commit them or run git stash first if they might be wanted; confirm only if discarding them is intended."
  elif [ -n "$paths" ]; then
    ask "Check first: git checkout -- $paths throws away the uncommitted edits to $paths, and they cannot be recovered. Commit or stash them first if they might be wanted; confirm only if discarding them is intended."
  elif [ -n "$reset" ]; then
    ask "Check first: git checkout -B $reset moves the branch $reset to a new starting point when it already exists, and its commits that are on no other branch can be lost. Use git checkout -b for a new branch; confirm only if resetting $reset is intended."
  fi
}

check_switch() { # git switch -f, --discard-changes, and -C (N73)
  local j=0 n=${#ARGS[@]} w discard=0 reset=""
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      --) break ;;
      -c|--create|--orphan) j=$((j + 1)) ;;
      -C|--force-create) reset=${ARGS[$j]:-a branch}; j=$((j + 1)) ;;
      --force-create=*) reset=${w#*=} ;;
      --force|--discard-changes) discard=1 ;;
      --*) { is_abbrev "$w" --discard-changes || is_abbrev "$w" --force; } && discard=1 ;;
      -?*)
        short_cluster "$w" cC ""
        has_letter f && discard=1
        if [ "$SC_NEXT" = 1 ]; then has_letter C && reset=${ARGS[$j]:-a branch}; j=$((j + 1)); fi ;;
    esac
  done
  if [ "$discard" = 1 ]; then
    ask "Check first: git switch with -f or --discard-changes throws away every uncommitted edit to tracked files on the way, and those edits cannot be recovered. Commit them or run git stash first if they might be wanted; confirm only if discarding them is intended."
  elif [ -n "$reset" ]; then
    ask "Check first: git switch -C $reset moves the branch $reset to a new starting point when it already exists, and its commits that are on no other branch can be lost. Use git switch -c for a new branch; confirm only if resetting $reset is intended."
  fi
}

check_worktree() { # git worktree remove --force (N73)
  local j=1 n=${#ARGS[@]} w force=0
  [ "${ARGS[0]:-}" = remove ] || return 0
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      --) break ;;
      --force) force=1 ;;
      --*) is_abbrev "$w" --force && force=1 ;;
      -?*) case "$w" in *f*) force=1 ;; esac ;;
    esac
  done
  [ "$force" = 1 ] || return 0
  ask "Check first: git worktree remove --force deletes that worktree's folder even when it holds changes that were never committed or files git does not track, and they cannot be recovered. Commit or copy what is wanted there first; confirm only if losing it is intended."
}

check_restore() {
  local j=0 n=${#ARGS[@]} w staged=0 worktree=0 everything=0 endopts=0 paths=""
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    if [ "$endopts" = 0 ]; then
      case "$w" in
        --) endopts=1; continue ;;
        --staged) staged=1; continue ;;
        --worktree) worktree=1; continue ;;
        --source|--pathspec-from-file|--conflict) j=$((j + 1)); continue ;;
        --*) continue ;;
        -?*)
          short_cluster "$w" s ""
          has_letter S && staged=1
          has_letter W && worktree=1
          [ "$SC_NEXT" = 1 ] && j=$((j + 1))
          continue ;;
      esac
    fi
    if is_everything "$w"; then everything=1; fi
    paths="$paths${paths:+ }$w"
  done
  { [ "$staged" = 0 ] || [ "$worktree" = 1 ]; } || return 0
  if [ "$everything" = 1 ]; then
    ask "Check first: git restore . throws away every uncommitted edit to tracked files in this folder, and those edits cannot be recovered. Commit them or run git stash first if they might be wanted (git restore --staged . only unstages, and is safe); confirm only if discarding them is intended."
  elif [ -n "$paths" ]; then
    # N73: one modified path is still a discard; every restore that touches the working tree asks
    ask "Check first: git restore $paths throws away the uncommitted edits to $paths, and they cannot be recovered. Commit or stash them first if they might be wanted (git restore --staged only unstages, and is safe); confirm only if discarding them is intended."
  fi
}

check_stash() {
  local j=0 n=${#ARGS[@]} w
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      -*) continue ;;
      drop)
        ask "Check first: git stash drop permanently deletes saved work from the stash. Look at it first with git stash show -p; confirm only if it is no longer needed."
        return 0 ;;
      clear)
        ask "Check first: git stash clear permanently deletes every entry saved in the stash. Look at them first with git stash list; confirm only if none of them is needed."
        return 0 ;;
      *) return 0 ;;
    esac
  done
}

check_branch() {
  local j=0 n=${#ARGS[@]} w del=0 force=0 bigd=0
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      --) break ;;
      --delete) del=1 ;;
      --force) force=1 ;;
      --set-upstream-to|--format|--sort) j=$((j + 1)) ;;
      --*) is_abbrev "$w" --delete && del=1; is_abbrev "$w" --force && force=1 ;;   # a start of either is that option to git (N71)
      --*) ;;
      -?*)
        short_cluster "$w" u ""
        has_letter D && bigd=1
        has_letter d && del=1
        has_letter f && force=1
        [ "$SC_NEXT" = 1 ] && j=$((j + 1)) ;;
    esac
  done
  if [ "$bigd" = 1 ] || { [ "$del" = 1 ] && [ "$force" = 1 ]; }; then
    ask "Check first: git branch -D deletes a branch even when its work was never merged anywhere, which can lose commits for good. Use git branch -d instead, which refuses when work would be lost; confirm only if the branch is truly not needed."
  fi
}

# ---------------------------------------------------------------- what Skilliton keeps (B61)
# The assistant may not remove Skilliton's files from a project: the .skilliton folder wherever it is, and in the
# project directory the record files, the entry folders and the instruction files
# that carry the managed block. A path is judged after cd, git -C and .. are applied, so "cd docs && rm STATUS.md"
# and "rm -rf ../.skilliton" are read as what they do. A path with a variable or a command substitution cannot be
# resolved; it is denied only when its own text names the folder, and allowed otherwise, which is stated in the
# skill as a limit. This is the same class as the other deny rules: it stops the assistant, not a person.

normalize_path() { # normalize_path <absolute path>: sets NORM with . and .. applied and no trailing slash
  local p=$1 seg out=""
  local IFS=/
  set -f
  for seg in $p; do
    case "$seg" in ''|.) ;; ..) out=${out%/*} ;; *) out="$out/$seg" ;; esac
  done
  set +f
  NORM=${out:-/}
}

physical_path() { # physical_path <path>: sets PHYS to the path with symlinks resolved, when it exists; else ""
  local d
  PHYS=""
  if [ -d "$1" ]; then PHYS=$(cd "$1" 2>/dev/null && pwd -P) || PHYS=""
  elif [ -e "$1" ]; then d=${1%/*}; [ "$d" != "$1" ] || d=.; d=$(cd "$d" 2>/dev/null && pwd -P) && PHYS="$d/${1##*/}"
  fi
}

record_covers() { # record_covers <newline list> <rel> <1: the list holds folders>: 0 when removing <rel> takes an item
  local item
  while IFS= read -r item; do
    [ -n "$item" ] || continue
    item=${item%/}
    case "$item" in "$2"|"$2"/*) return 0 ;; esac          # the item itself, or a folder that holds it
    if [ "$3" = 1 ]; then case "$2" in "$item"/*) return 0 ;; esac; fi   # an entry inside an entry folder
  done <<EOF
$1
EOF
  return 1
}

NOCASE_FS=""; PT_FOLD=0
detect_nocase_fs() { # sets NOCASE_FS, once per run: 1 when the project's disk treats letter case as the same name (macOS,
  # Windows), measured by whether a differently cased spelling of something in the project is the same file
  [ -z "$NOCASE_FS" ] || return 0
  local p up
  NOCASE_FS=0
  for p in .git .skilliton docs CLAUDE.md; do
    [ -e "$PROJECT_DIR/$p" ] || continue
    up=$(printf '%s' "$p" | tr '[:lower:]' '[:upper:]'); [ "$up" != "$p" ] || up=$(printf '%s' "$p" | tr '[:upper:]' '[:lower:]')
    if [ -e "$PROJECT_DIR/$up" ] && [ "$PROJECT_DIR/$p" -ef "$PROJECT_DIR/$up" ]; then NOCASE_FS=1; fi
    return 0
  done
  return 0
}

protected_target() { # protected_target <word> <base dir>: sets PT_WHAT to what would be lost, or "" when nothing of Skilliton's
  # On a case-insensitive disk the names are compared in any letter case, so rm -rf DOCS is read as the docs it removes.
  detect_nocase_fs
  PT_FOLD=0
  if [ "$NOCASE_FS" = 1 ] && ! shopt -q nocasematch; then shopt -s nocasematch; PT_FOLD=1; fi
  protected_target_as_named "$@"
  if [ "$PT_FOLD" = 1 ]; then shopt -u nocasematch; PT_FOLD=0; fi
  return 0
}

protected_target_as_named() {
  local w=$1 base=$2 r rel proj
  PT_WHAT=""
  expand_known "$w"; w=$EXPANDED   # "$PWD/docs" is the docs folder here
  case "$w" in
    *'$'*|*'`'*) case "$w" in *.skilliton*) PT_WHAT=$w ;; esac; return 0 ;;
  esac
  normalize_path "$PROJECT_DIR"; proj=$NORM
  if is_everything "$w"; then
    [ "$CFG_STATE" != default ] || return 0
    resolve_dir "$base" "."; [ -n "$RESOLVED" ] || return 0
    normalize_path "$RESOLVED"; r=$NORM
    case "$proj" in "$r"|"$r"/*) PT_WHAT="everything under $r" ;; esac
    return 0
  fi
  resolve_dir "$base" "$w"; [ -n "$RESOLVED" ] || return 0
  normalize_path "$RESOLVED"; r=$NORM
  case "$r/" in */.skilliton/*) case "$r" in "$proj"/*) PT_WHAT=${r:$((${#proj} + 1))} ;; *) PT_WHAT=$r ;; esac; return 0 ;; esac
  # Without a configuration file this is not a prepared project, and a file at a record's path is an ordinary file.
  [ "$CFG_STATE" != default ] || return 0
  # A path spelled through a symlink (on macOS, /var for /private/var) is the same path: when both exist, compare
  # the physical ones instead. A path that does not exist is compared as written.
  physical_path "$r"
  if [ -n "$PHYS" ]; then physical_path "$proj"; if [ -n "$PHYS" ]; then proj=$PHYS; physical_path "$r"; r=$PHYS; fi; fi
  case "$r" in
    "$proj") PT_WHAT="the project folder $r" ;;
    "$proj"/*)
      rel=${r:$((${#proj} + 1))}
      if record_covers "$INSTRUCTION_FILES" "$rel" 0 || record_covers "$PROTECT_RECORDS" "$rel" 0 || record_covers "$PROTECT_FOLDERS" "$rel" 1; then
        PT_WHAT=$rel
      fi ;;
  esac
  return 0
}

brace_expand() { # brace_expand <word>: sets BRACED to the words the shell's brace expansion makes of it, one per line
  # (docs/{tasks,decisions} is docs/tasks and docs/decisions); a word with no {a,b} is itself. At most 64 words.
  local w=$1 i=0 n c depth=0 start=-1 parts=() cur="" pre post out="" p sub
  n=${#w}
  case "$w" in *'{'*','*'}'*) ;; *) BRACED=$w; return 0 ;; esac
  while [ "$i" -lt "$n" ]; do
    c=${w:$i:1}
    if [ "$start" -lt 0 ]; then
      [ "$c" = "{" ] && { start=$i; depth=1; cur=""; parts=(); }
    else
      case "$c" in
        "{") depth=$((depth + 1)); cur="$cur$c" ;;
        "}") depth=$((depth - 1))
             if [ "$depth" = 0 ]; then
               parts[${#parts[@]}]=$cur
               if [ "${#parts[@]}" -gt 1 ]; then break; fi
               start=-1   # {x} with no comma is not expanded; look for the next brace
             else cur="$cur$c"; fi ;;
        ",") if [ "$depth" = 1 ]; then parts[${#parts[@]}]=$cur; cur=""; else cur="$cur$c"; fi ;;
        *) cur="$cur$c" ;;
      esac
    fi
    i=$((i + 1))
  done
  if [ "$start" -lt 0 ] || [ "$i" -ge "$n" ] || [ "${#parts[@]}" -lt 2 ]; then BRACED=$w; return 0; fi
  pre=${w:0:$start}; post=${w:$((i + 1))}
  for p in "${parts[@]}"; do
    brace_expand "$pre$p$post"; sub=$BRACED
    out="$out$sub"$'\n'
  done
  out=${out%$'\n'}
  BRACED=$(printf '%s\n' "$out" | head -n 64)
}

deny_removal() { # deny_removal <what> [<what is done to it>]
  deny "Blocked: ${2:-removing} $1 would take away part of what Skilliton keeps in this project (the .skilliton folder, the record files, the entry folders, and the instruction files that carry the managed block), which is the project's memory. The one route that takes Skilliton out of a project is skilliton remove --apply, run by a person; it keeps the records and the history. If one file in there is really stale, say which and why, and let the person remove it. A team lead turns this rule off with \"protectRecords\": false under guardrails in .skilliton/config.json."
}

check_remove() { # check_remove <index of the first argument>: rm and rmdir, every path after the flags
  local k=$1 n=${#SEGW[@]} w opts=1 rec=0 frc=0 vars="" p
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    if [ "$opts" = 1 ]; then
      case "$w" in
        --) opts=0; continue ;;
        --recursive) rec=1; continue ;;
        --force) frc=1; continue ;;
        --*) continue ;;
        -?*) case "$w" in *[rR]*) rec=1 ;; esac; case "$w" in *f*) frc=1 ;; esac; continue ;;
      esac
    fi
    brace_expand "$w"
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      hooks_target "$p" "$EFF_DIR" && deny_hooks
      [ "$CFG_PR" = true ] || continue
      protected_target "$p" "$EFF_DIR"
      if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT"; return 0; fi
      expand_known "$p"; case "$EXPANDED" in *'$'*|*'`'*) vars="$vars${vars:+, }$p" ;; esac
      # the repository itself: its whole history and every branch not pushed (N73)
      resolve_dir "$EFF_DIR" "$p"
      if [ -n "$RESOLVED" ]; then
        normalize_path "$RESOLVED"
        case "$NORM" in */.git) ask "Check first: this removes $p, the repository itself: its whole history, every branch and stash, and every commit that was never pushed. It cannot be undone. Confirm only if the repository is meant to go." ;; esac
      fi
    done <<EOF
$BRACED
EOF
  done
  # rm -rf of a path that holds a variable guardrails cannot resolve: what it removes cannot be known here (N71)
  if [ -n "$vars" ] && [ "$rec" = 1 ] && [ "$frc" = 1 ] && [ "$CFG_PR" = true ]; then
    ask "Check first: this rm -rf removes $vars, which holds a variable or a command substitution guardrails cannot resolve, so it cannot tell what would be deleted. Write the path out, or run echo on it first to see it; confirm only if it is not the project's records or anything else that is wanted."
  fi
  return 0
}

record_file_target() { # record_file_target <word> <base>: sets PT_WHAT when the word names a record file, an instruction
  # file or an entry that exists now, which writing over it or emptying it would lose (N73); "" otherwise. The
  # settings file is left to its own rule, which asks.
  local p
  PT_WHAT=""
  [ "$CFG_PR" = true ] || return 0
  expand_known "$1"; p=$EXPANDED
  resolve_dir "$2" "$p"; [ -n "$RESOLVED" ] || return 0
  [ -f "$RESOLVED" ] || return 0
  normalize_path "$RESOLVED"
  local own=0
  nocase_on; case "$NORM" in */.skilliton/*|*/.skillgate/config.json) own=1 ;; esac; nocase_off
  [ "$own" = 0 ] || return 0
  protected_target "$NORM" "$2"
}

check_overwrite() { # check_overwrite <index of the first argument> <any|dest|tee>: truncate, dd of=, tee without -a (any, tee)
  # and cp, install, ln or mv onto (dest): a record file that exists is written over, which loses what it held (N73)
  local k=$1 n=${#SEGW[@]} w mode=$2 plain=() tdir="" last i=0 app=0
  [ "$CFG_PR" = true ] || return 0
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$mode" in
      dest)
        case "$w" in
          -t|--target-directory) tdir=${SEGW[$k]:-}; k=$((k + 1)); continue ;;
          --target-directory=*) tdir=${w#*=}; continue ;;
          -t?*) tdir=${w#-t}; continue ;;
          -*) continue ;;
        esac ;;
      tee) case "$w" in -a|--append|-*a*) app=1; continue ;; -*) continue ;; esac ;;
      *) case "$w" in of=*) w=${w#of=} ;; -s|-r|--size|--reference) k=$((k + 1)); continue ;; -*) continue ;; esac ;;
    esac
    plain[${#plain[@]}]=$w
  done
  [ "${#plain[@]}" -gt 0 ] || return 0
  case "$mode" in
    dest)
      if [ -n "$tdir" ]; then
        while [ "$i" -lt "${#plain[@]}" ]; do
          record_file_target "$tdir/${plain[$i]##*/}" "$EFF_DIR"
          if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "writing over"; return 0; fi
          i=$((i + 1))
        done
        return 0
      fi
      [ "${#plain[@]}" -gt 1 ] || return 0
      last=${plain[$((${#plain[@]} - 1))]}
      resolve_dir "$EFF_DIR" "$last"
      if [ -n "$RESOLVED" ] && [ -d "$RESOLVED" ]; then
        while [ "$i" -lt $((${#plain[@]} - 1)) ]; do
          record_file_target "$last/${plain[$i]##*/}" "$EFF_DIR"
          if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "writing over"; return 0; fi
          i=$((i + 1))
        done
        return 0
      fi
      record_file_target "$last" "$EFF_DIR"
      [ -z "$PT_WHAT" ] || deny_removal "$PT_WHAT" "writing over" ;;
    tee) [ "$app" = 1 ] && return 0
      for w in "${plain[@]}"; do record_file_target "$w" "$EFF_DIR"; if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "writing over"; return 0; fi; done ;;
    *) for w in "${plain[@]}"; do record_file_target "$w" "$EFF_DIR"; if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "emptying or writing over"; return 0; fi; done ;;
  esac
  return 0
}

check_move() { # check_move <index of the first argument>: every source of mv; with -t every plain argument is one
  [ "$CFG_PR" = true ] || return 0
  local k=$1 n=${#SEGW[@]} w opts=1 target=0 count last i=0 p
  PA=()
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    if [ "$opts" = 1 ]; then
      case "$w" in
        --) opts=0; continue ;;
        -t|--target-directory) target=1; k=$((k + 1)); continue ;;
        -t?*|--target-directory=*) target=1; continue ;;
        -*) continue ;;
      esac
    fi
    PA[${#PA[@]}]=$w
  done
  count=${#PA[@]}; last=$((count - 1)); [ "$target" = 1 ] && last=$count
  while [ "$i" -lt "$last" ]; do
    brace_expand "${PA[$i]}"
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      protected_target "$p" "$EFF_DIR"
      if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT"; return 0; fi
    done <<EOF
$BRACED
EOF
    i=$((i + 1))
  done
  return 0
}

check_git_rm() { # git rm [-r] [--cached] [-f] [--] <path>...: the paths are relative to where git runs
  local n=${#ARGS[@]} k=0 w opts=1 p force=0 cached=0 paths=""
  while [ "$k" -lt "$n" ]; do
    w=${ARGS[$k]}; k=$((k + 1))
    if [ "$opts" = 1 ]; then
      case "$w" in
        --) opts=0; continue ;;
        --cached) cached=1; continue ;;
        --force) force=1; continue ;;
        --pathspec-from-file) k=$((k + 1)); continue ;;
        --*) continue ;;
        -?*) short_cluster "$w" "" ""; has_letter f && force=1; continue ;;
      esac
    fi
    paths="$paths${paths:+ }$w"
    [ "$CFG_PR" = true ] || continue
    brace_expand "$w"
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      protected_target "$p" "$GDIR"
      if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT"; return 0; fi
    done <<EOF
$BRACED
EOF
  done
  # git rm -f deletes the file from disk even when it holds changes never committed (N73); --cached keeps the file
  if [ "$force" = 1 ] && [ "$cached" = 0 ] && [ -n "$paths" ]; then
    ask "Check first: git rm -f deletes $paths from disk even when it has changes that were never committed, and those changes cannot be recovered. Commit or stash them first, or use git rm --cached to stop tracking a file and keep it; confirm only if losing them is intended."
  fi
  return 0
}

check_find() { # check_find <index of the first argument>: find -delete, or -exec rm, over a folder that holds what
  # Skilliton keeps, with a name test that matches one of those files or no name test at all (N73)
  [ "$CFG_PR" = true ] || return 0
  local k=$1 n=${#SEGW[@]} w starts=() names="" inames="" paths="" regex=0 deleting=0 s r c cands base abs shown what
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}
    case "$w" in -*|'('|')'|'!'|',') break ;; esac
    starts[${#starts[@]}]=$w; k=$((k + 1))
  done
  [ "${#starts[@]}" -gt 0 ] || starts=(.)
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$w" in
      -delete) deleting=1 ;;
      -exec|-execdir|-ok|-okdir) case "${SEGW[$k]:-}" in rm|*/rm|rmdir|*/rmdir|unlink|*/unlink|shred|*/shred) deleting=1 ;; esac ;;
      -name) names="$names${SEGW[$k]:-}"$'\n'; k=$((k + 1)) ;;
      -iname) inames="$inames${SEGW[$k]:-}"$'\n'; k=$((k + 1)) ;;
      -path|-wholename) paths="$paths${SEGW[$k]:-}"$'\n'; k=$((k + 1)) ;;
      -ipath|-iwholename) paths="$paths${SEGW[$k]:-}"$'\n'; k=$((k + 1)) ;;
      -regex|-iregex) regex=1; k=$((k + 1)) ;;
    esac
  done
  [ "$deleting" = 1 ] || return 0
  normalize_path "$PROJECT_DIR"; base=$NORM
  # what could be found: each record and instruction file, each entry folder with an entry in it, and the settings file
  cands=".skilliton/config.json"$'\n'
  if [ "$CFG_STATE" != default ]; then
    cands="$cands$INSTRUCTION_FILES"$'\n'"$PROTECT_RECORDS"$'\n'
    while IFS= read -r c; do [ -n "$c" ] && cands="$cands${c%/}"$'\n'"${c%/}/entry.md"$'\n'; done <<EOF
$PROTECT_FOLDERS
EOF
  fi
  for s in "${starts[@]}"; do
    resolve_dir "$EFF_DIR" "$s"; [ -n "$RESOLVED" ] || continue
    normalize_path "$RESOLVED"; r=$NORM
    shown=${s%/}; [ -n "$shown" ] || shown=/
    while IFS= read -r c; do
      [ -n "$c" ] || continue
      case "$base/$c" in "$r"|"$r"/*) ;; *) continue ;; esac
      abs="$base/$c"
      if [ "$abs" = "$r" ]; then what=$shown; else what="$shown/${abs:$((${#r} + 1))}"; fi
      if find_matches "$c" "$what" "$names" "$inames" "$paths" "$regex"; then deny_removal "${c%/entry.md}" "deleting, with find,"; return 0; fi
    done <<EOF
$cands
EOF
  done
  return 0
}

find_matches() { # find_matches <candidate> <the path find would print for it> <names> <inames> <paths> <regex>: 0 when
  # the tests find was given could select the candidate. A test that is negated or joined with -o is read as selecting it.
  local c=$1 printed=$2 b=${1##*/} p hit=1
  [ -z "$3$4$5" ] && [ "$6" = 0 ] && return 0
  [ "$6" = 1 ] && return 0
  while IFS= read -r p; do [ -n "$p" ] || continue; case "$b" in $p) hit=0 ;; esac; done <<EOF
$3
EOF
  nocase_on
  while IFS= read -r p; do [ -n "$p" ] || continue; case "$b" in $p) hit=0 ;; esac; done <<EOF
$4
EOF
  nocase_off
  while IFS= read -r p; do [ -n "$p" ] || continue; case "$printed" in $p) hit=0 ;; esac; done <<EOF
$5
EOF
  return $hit
}

check_rsync() { # check_rsync <index of the first argument>: rsync --delete into what Skilliton keeps, or
  # --remove-source-files out of it (N73)
  [ "$CFG_PR" = true ] || return 0
  local k=$1 n=${#SEGW[@]} w del=0 rsf=0 plain=() i=0 last
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$w" in
      --del|--delete|--delete-*) del=1; continue ;;
      --remove-source-files) rsf=1; continue ;;
      -e|--rsh|--exclude|--include|--filter|--files-from|--exclude-from|--include-from|-f) k=$((k + 1)); continue ;;
      -*) continue ;;
    esac
    plain[${#plain[@]}]=$w
  done
  [ "${#plain[@]}" -ge 2 ] || return 0
  last=${plain[$((${#plain[@]} - 1))]}
  if [ "$del" = 1 ]; then
    protected_target "$last" "$EFF_DIR"
    if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "deleting files in, with rsync --delete,"; return 0; fi
  fi
  if [ "$rsf" = 1 ]; then
    while [ "$i" -lt $((${#plain[@]} - 1)) ]; do
      protected_target "${plain[$i]}" "$EFF_DIR"
      if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "moving away, with rsync --remove-source-files,"; return 0; fi
      i=$((i + 1))
    done
  fi
  return 0
}

check_program_text() { # check_program_text <index of the first argument>: python3 -c, perl -e, node -e and the like whose
  # text removes a file (rmtree, unlink, os.remove and their kin) and names what Skilliton keeps (N73)
  [ "$CFG_PR" = true ] || return 0
  local k=$1 n=${#SEGW[@]} w all="" rest q s
  while [ "$k" -lt "$n" ]; do all="$all ${SEGW[$k]}"; k=$((k + 1)); done
  case "$all" in *rmtree*|*unlink*|*os.remove*|*remove\(*|*rmdir*|*rmSync*|*rm_rf*|*rm_r*|*remove_dir*|*remove_file*|*removedirs*|*Remove-Item*) ;; *) return 0 ;; esac
  # every quoted string in the text, and every plain word after it, is a path the program may be given
  rest=$all
  while :; do
    case "$rest" in *"'"*|*'"'*) ;; *) break ;; esac
    s=${rest%%[\'\"]*}; rest=${rest:${#s}}; q=${rest:0:1}; rest=${rest:1}
    case "$rest" in *"$q"*) ;; *) break ;; esac
    s=${rest%%"$q"*}; rest=${rest:$((${#s} + 1))}
    [ -n "$s" ] || continue
    protected_target "$s" "$EFF_DIR"
    if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "removing, from inside a program,"; return 0; fi
  done
  k=$1
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$w" in -*|*' '*) continue ;; esac
    protected_target "$w" "$EFF_DIR"
    if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT" "removing, from inside a program,"; return 0; fi
  done
  return 0
}

hooks_target() { # hooks_target <word> <base>: 0 when the word is the .git/hooks folder or a file in it (N71)
  case "$1" in *.git/hooks|*.git/hooks/*) return 0 ;; esac
  resolve_dir "$2" "$1"; [ -n "$RESOLVED" ] || return 1
  normalize_path "$RESOLVED"
  case "$NORM" in */.git/hooks|*/.git/hooks/*) return 0 ;; esac
  return 1
}

deny_hooks() {
  [ "$CFG_NV" = true ] || return 0
  deny "Blocked: this removes, moves, empties or changes the permissions of the git hooks in .git/hooks, the checks git runs before a commit or a push, which skips them the way --no-verify does. Leave the hooks in place; if one fails, fix what it reports, and if a hook really has to change, the person who looks after the project changes it." # skilliton-audit: allow verification-off the refusal message naming the flag it compares the change with
}

check_hooks_words() { # check_hooks_words <index of the first argument>: mv, chmod and truncate aimed at .git/hooks (N71)
  local k=$1 n=${#SEGW[@]} w
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$w" in -*) continue ;; esac
    if hooks_target "$w" "$EFF_DIR"; then deny_hooks; return 0; fi
  done
  return 0
}

# ---------------------------------------------------------------- entry points

main_pretooluse() {
  local t note=""
  GUARD_RAW=$(cat)
  case "${SKILLITON_GUARDRAILS:-}" in [Oo][Ff][Ff]) exit 0 ;; esac
  # Input longer than the cap (N88) skips the quick look at the raw text, which alone costs a noticeable part of a
  # second on a few megabytes; the command is read out of it below and asks there when it is over the cap too.
  if [ "${#GUARD_RAW}" -le "$CMD_MAX_BYTES" ]; then
    mentions_git "$GUARD_RAW" || mentions_removal "$GUARD_RAW" || mentions_config "$GUARD_RAW" || mentions_hookfile "$GUARD_RAW" || exit 0
  fi
  # BASH_ENV names a file bash runs before the first line of any script it starts, including this one, so a file
  # that only says `exit 0` ends this check before it begins and the client reads the silence as an allow. Nothing
  # inside a script can prevent that, because the file has already run; what is left is to say it while it can still
  # be said. Only BASH_ENV: ENV is read by an interactive shell only (measured on bash, sh and dash), so a hook
  # started as a script is never affected by it, and asking about it would turn every refusal in this file into
  # something a person can approve for a variable that cannot do anything here. SHELLOPTS=noexec silences this hook
  # the same way and cannot be reported at all, for the same reason: see docs/IT-ALLOWLIST.md.
  if [ -n "${BASH_ENV:-}" ]; then
    emit_decision ask "Check first: this session sets BASH_ENV, which names a file the shell runs before any hook script, including this one. What this check reports cannot be relied on while that is set. Unset it, or read the command yourself and confirm only if it is what you intend."
    exit 0
  fi
  if [ -n "${SKILLITON_IMPORTED_FUNCTIONS:-}" ]; then
    emit_decision ask "Check first: this session exports shell functions into the environment, which bash imports before any hook script runs and which can replace the programs this check uses. What it reports cannot be relied on while they are set. Read the command yourself and confirm only if it is what you intend."
    exit 0
  fi
  if ! pick_parser; then
    emit_decision ask "guardrails cannot inspect this git command because jq, node, and python3 are all missing; confirm it yourself"
    exit 0
  fi
  if ! read_input; then
    emit_decision ask "Check first: guardrails could not read this command from the hook input, so nothing was checked. Read the command yourself and confirm it only if it is what you intend."
    exit 0
  fi
  # N88: before anything splits or searches the text, whatever it names, since a text this long can hide what it runs. LC_ALL=C is set above, so ${#IN_CMD} counts bytes.
  if [ "${#IN_CMD}" -gt "$CMD_MAX_BYTES" ]; then
    emit_decision ask "Check first: this command is too long for guardrails to read: it is ${#IN_CMD} bytes, and the limit is $CMD_MAX_BYTES bytes (64 KB), because reading one longer than that can run past the hook's time limit. Nothing in it was checked. Read it yourself, or split it into shorter commands, and confirm only if every part is what you intend."
    exit 0
  fi
  mentions_git "$IN_CMD" || mentions_removal "$IN_CMD" || mentions_config "$IN_CWD $IN_CMD" || mentions_hookfile "$IN_CWD $IN_CMD" || exit 0
  for t in git awk grep find; do
    if ! command -v "$t" >/dev/null 2>&1; then
      emit_decision ask "Check first: guardrails cannot inspect git commands because $t is not installed, so nothing was checked. Read the command yourself and confirm it only if it is what you intend."
      exit 0
    fi
  done
  [ -n "$IN_CWD" ] || IN_CWD=${CLAUDE_PROJECT_DIR:-$PWD}
  set_project_dir
  load_config
  if ! tokenize; then
    emit_decision ask "Check first: guardrails could not split this command into its parts, so nothing was checked. Read the command yourself and confirm it only if it is what you intend."
    exit 0
  fi
  walk_segments
  if [ "$TOK_UNSURE" = 1 ]; then
    ask "Check first: guardrails could not tell where a quote, a command substitution or an arithmetic expression in this command ends, so part of it may not have been read the way the shell will read it. Read the command yourself and confirm only if it is what you intend."
  fi
  [ "$CFG_STATE" = unreadable ] && note=$'\n'"$CONFIG_NOTE"
  if [ -n "$DENY_REASON" ]; then
    emit_decision deny "$DENY_REASON$note"
  elif [ -n "$ASK_REASON" ]; then
    emit_decision ask "$ASK_REASON$note"
  else
    report_turned_off
  fi
  exit 0
}

# report_turned_off: a command that passes only because the project turned a rule off says so (B50). Each rule that
# is off is run once more with only itself on; when it would have refused the command, a systemMessage names the
# setting. A systemMessage decides nothing: measured 2026-09-22 on Claude Code 2.1.278, a PreToolUse hook's
# systemMessage arrives as a notice reading "PreToolUse:Bash says: ..." and the command still runs. Under Codex its
# display is unverified; it can only be ignored there, never read as a decision.
report_turned_off() {
  local fp=$CFG_FP nv=$CFG_NV sf=$CFG_SF pr=$CFG_PR rule hits=""
  for rule in FP NV SF PR; do
    CFG_FP=false; CFG_NV=false; CFG_SF=false; CFG_PR=false
    case $rule in
      FP) [ "$fp" = false ] || continue; CFG_FP=true ;;
      NV) [ "$nv" = false ] || continue; CFG_NV=true ;;
      SF) [ "$sf" = false ] || continue; CFG_SF=true ;;
      PR) [ "$pr" = false ] || continue; CFG_PR=true ;;
    esac
    DENY_REASON=""; ASK_REASON=""
    walk_segments
    if [ -n "$DENY_REASON" ]; then
      case $rule in
        FP) hits="$hits${hits:+, }\"blockForcePush\": false" ;;
        NV) hits="$hits${hits:+, }\"blockNoVerify\": false" ;;
        SF) hits="$hits${hits:+, }\"blockSecretFiles\": false" ;;
        PR) hits="$hits${hits:+, }\"protectRecords\": false" ;;
      esac
    fi
  done
  CFG_FP=$fp; CFG_NV=$nv; CFG_SF=$sf; CFG_PR=$pr; DENY_REASON=""; ASK_REASON=""
  [ -n "$hits" ] || return 0
  json_escape "[guardrails] Let through only because $hits under guardrails in $CFG_FILE turned that rule off; with the rule on, this command would be blocked."
  printf '{"systemMessage":"%s"}\n' "$ESCAPED"
  GUARD_EMITTED=1
}

join_list() { # join_list <item>...: sets REASON to "a", "a and b", or "a, b, and c"
  case $# in
    0) REASON="" ;;
    1) REASON=$1 ;;
    2) REASON="$1 and $2" ;;
    3) REASON="$1, $2, and $3" ;;
    *) REASON="$1, $2, $3, and $4" ;;
  esac
}

main_session_start() {
  local t on_list="" off_list="" line
  GUARD_RAW=$(cat 2>/dev/null)
  case "${SKILLITON_GUARDRAILS:-}" in
    [Oo][Ff][Ff])
      status_line "[guardrails] OFF for this session (SKILLITON_GUARDRAILS=off). Force-push, --no-verify, secret-file and removal checks are not running." # skilliton-audit: allow verification-off the status line naming the checks that are off
      exit 0 ;;
  esac
  if ! pick_parser; then
    status_line "[guardrails] cannot inspect git commands: jq, node, and python3 are all missing, so every git command will ask for confirmation instead of being checked. Install jq to turn the checks on."
    exit 0
  fi
  for t in git awk grep find; do
    if ! command -v "$t" >/dev/null 2>&1; then
      status_line "[guardrails] cannot inspect git commands because $t is not installed, so git commands will ask for confirmation instead of being checked."
      exit 0
    fi
  done
  read_input || IN_CWD=""
  set_project_dir
  load_config
  set --
  [ "$CFG_FP" = true ] && set -- "$@" "force-push to protected branches"
  [ "$CFG_NV" = true ] && set -- "$@" "--no-verify" # skilliton-audit: allow verification-off a fixture argument list for the rule's own test
  [ "$CFG_SF" = true ] && set -- "$@" "secret files"
  [ "$CFG_PR" = true ] && set -- "$@" "removal of Skilliton's files"
  join_list "$@"; on_list=$REASON
  set --
  [ "$CFG_FP" = true ] || set -- "$@" "force-push to protected branches"
  [ "$CFG_NV" = true ] || set -- "$@" "--no-verify" # skilliton-audit: allow verification-off a fixture argument list for the rule's own test
  [ "$CFG_SF" = true ] || set -- "$@" "secret files"
  [ "$CFG_PR" = true ] || set -- "$@" "removal of Skilliton's files"
  join_list "$@"; off_list=$REASON
  if [ -z "$off_list" ]; then
    line="[guardrails] on: $on_list are blocked."
  elif [ -z "$on_list" ]; then
    line="[guardrails] on, but $CFG_FILE turns off blocking for $off_list; only the confirm-before-losing-work prompts are active."
  else
    line="[guardrails] on. Blocked: $on_list. Turned off in $CFG_FILE: $off_list."
  fi
  status_line "$line"
  if [ "$CFG_FILE" = ".skillgate/config.json" ]; then
    status_line "[guardrails] Note: this project still uses the earlier Skillgate folder, so these settings come from .skillgate/config.json until the project is migrated (skilliton migrate)."
  fi
  if [ -n "${SKILLGATE_GUARDRAILS+x}" ]; then
    status_line "[guardrails] Note: SKILLGATE_GUARDRAILS is set but no longer read; the variable is now SKILLITON_GUARDRAILS."
  fi
  if [ "$CFG_STATE" = unreadable ]; then
    status_line "[guardrails] $CONFIG_NOTE"
  fi
  exit 0
}

if [ "$GUARD_MODE" = session-start ]; then main_session_start; else main_pretooluse; fi
exit 0
