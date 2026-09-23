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
#   deny   force-pushing a protected branch; skipping git hooks with --no-verify; staging or
#          committing a file whose name or added content looks like a secret; rm, rmdir, mv or
#          git rm aimed at what Skilliton keeps in a project (the .skilliton folder, the record
#          files, the entry folders, CLAUDE.md and AGENTS.md), for which the one route is
#          skilliton remove --apply, run by a person
#   ask    git commands that throw away uncommitted work: reset --hard, clean -f, checkout .,
#          restore . (without --staged), stash drop, stash clear, branch -D
#          and a command that writes the settings file itself (.skilliton/config.json), because a rule
#          turned off there is a person's decision (the Write and Edit half is managed-block-guard.mjs)
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
#   a shell parser: it does not expand variables, globs, aliases, or
#   functions, and it does not look inside scripts, bash -c strings, eval, xargs, a backtick
#   substitution inside double quotes, or git aliases (a $( inside double quotes is read as the
#   command it is, and $(( )) is arithmetic, never a heredoc; an unclosed one asks); a shell, eval or xargs string that
#   names git asks instead of allowing in silence. It stops ordinary and accidental
#   commands, not a command someone has deliberately hidden.
#   It sees the tree as it is BEFORE the command runs: a secret written and staged in the same
#   command (printf ... > f && git add f) is not scanned, so an add or commit naming a path an
#   earlier redirection in the command writes asks instead; a write by another program is not seen.
#   It does not expand globs: rm -rf docs/* is judged by the word docs/*, not the files it matches.
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
RT=$'\037'; REDIRS=""; UNSURE_MARK=$'\035'; TOK_UNSURE=0
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
REMOVE_WORD_RE='(^|[^A-Za-z0-9_.-]|\\[bfnrt])(rm|rmdir|mv)([^A-Za-z0-9_/-]|$)'
mentions_removal() { [[ $1 =~ $REMOVE_WORD_RE ]]; }
# The settings file the rules come from (N30): a command that names both parts of its path is read, so a write to it
# can be seen. A folder name alone costs nothing more than before.
mentions_config() { case "$1" in *.skilliton*config.json*|*.skillgate*config.json*|*config.json*.skilliton*|*config.json*.skillgate*) return 0 ;; esac; return 1; }
CONFIG_ASK="Check first: this command writes to the guardrails settings file (.skilliton/config.json), which is where the rules read whether they are on and which branches they protect. Turning a rule off or unprotecting a branch is a person's decision, made in their own editor or terminal. Confirm only if this change keeps every rule and every protected branch as it is."

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
    elif mentions_git "$GUARD_RAW" || mentions_config "$GUARD_RAW"; then
      emit_decision ask "Check first: guardrails stopped with an internal error (exit $rc) while checking this git command, so nothing was checked. Read the command yourself and confirm it only if it is what you intend."
    fi
  fi
  exit 0
}
trap guard_exit EXIT

# ---------------------------------------------------------------- reading JSON

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
function flush() { if (have) { if (skipnext == 2) emit(RT tok); else if (!skipnext) emit(tok); skipnext = 0 } tok = ""; have = 0 }
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
function add(ch) { if (length(tok) < 4096) tok = tok ch; have = 1 }
function at(k) { return substr(chunk, k - off, 1) }
BEGIN { RS = "\001"; SEP = sprintf("%c", 30); RT = sprintf("%c", 31); UN = sprintf("%c", 29) }
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
          if (at(i + 2) == "(") { add(c); i = arith(i + 1); continue }
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
        if (d == ">") { flush(); i++; if (at(i + 1) == ">") i++; skipnext = 2; continue }
        sep(); continue
      }
      if (c == "|") { d = at(i + 1); if (d == "|" || d == "&") i++; sep(); continue }
      if (c == "(" || c == ")" || c == "`") {
        if (c == ")" && depth > 0 && PC[depth] == 0) {
          # the $( opened inside double quotes closes: back into the quoted word, which carries $() in place of it
          sep(); tok = ST[depth] "$()"; have = 1; skipnext = SS[depth]; depth--; q = "\""; continue
        }
        if (c == "(" && at(i + 1) == "(" && (!have || substr(tok, length(tok), 1) == "$")) { i = arith(i); continue }
        if (depth > 0) { if (c == "(") PC[depth]++; else if (c == ")") PC[depth]-- }
        if (c == "(" && have && substr(tok, length(tok), 1) == "$") { tok = substr(tok, 1, length(tok) - 1); if (tok == "") have = 0 }
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
        rw = (c == ">") ? 2 : 1
        if (c == ">" && (d == ">" || d == "|")) { i++; d = at(i + 1) }
        if (c == "<" && d == ">") { i++; d = at(i + 1); rw = 2 }
        if (d == "&") {
          i++; k = 0; while (i < m && k < 16 && at(i + 1) ~ /[0-9-]/) { i++; k++ }
          if (k > 0 || rw == 1) continue   # >&2 and >&- copy a descriptor; >&file writes a file
        }
        # the word after a redirection is its target: a file written (>, >>, >|, <>, &>, >&file) is kept, marked with
        # \037, so the settings file and a file written then staged can be seen; a file read (<) is dropped
        skipnext = rw
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
  local t words=() r
  SEGR=()
  for t in "${SEGW[@]}"; do
    case "$t" in
      "$RT"*)
        t=${t#"$RT"}
        names_config "$t" "$EFF_DIR" && ask "$CONFIG_ASK"
        case "$t" in /dev/*) continue ;; esac
        resolve_dir "$EFF_DIR" "$t"; r=$RESOLVED
        [ -z "$r" ] || { normalize_path "$r"; SEGR[${#SEGR[@]}]=$NORM; } ;;
      *) words[${#words[@]}]=$t ;;
    esac
  done
  SEGW=(${words[@]+"${words[@]}"})
}

names_config() { # names_config <word> <base>: 0 when the word names the guardrails settings file, by its text or its path
  case "$1" in
    *.skilliton*config.json*|*.skillgate*config.json*) return 0 ;;
    *'$'*|*'`'*) return 1 ;;
  esac
  resolve_dir "$2" "$1"; [ -n "$RESOLVED" ] || return 1
  normalize_path "$RESOLVED"
  case "$NORM" in */.skilliton/config.json|*/.skillgate/config.json) return 0 ;; esac
  return 1
}

check_config_words() { # check_config_words <index of the first argument> <any|text|inplace|dest>: a program that writes
  # a file it is given (tee, dd of=, sed -i, cp to a destination) or runs code it is given (node -e) asks when that
  # names the settings file. "text" reads every word, options included, because the path may sit inside a program.
  local k=$1 n=${#SEGW[@]} w mode=$2 inplace=0 hit=0 last="" tdir="" srcs=0 dest
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    case "$mode" in
      text) names_config "$w" "$EFF_DIR" && hit=1 ;;
      any|inplace)
        case "$w" in -i*|--in-place*) inplace=1; continue ;; of=*) w=${w#of=} ;; -*) continue ;; esac
        names_config "$w" "$EFF_DIR" && hit=1 ;;
      dest)
        case "$w" in
          -t|--target-directory) tdir=${SEGW[$k]:-}; k=$((k + 1)); continue ;;
          --target-directory=*) tdir=${w#*=}; continue ;;
          -t?*) tdir=${w#-t}; continue ;;
          -*) continue ;;
        esac
        [ -z "$last" ] || case "${last##*/}" in config.json) srcs=1 ;; esac
        last=$w ;;
    esac
  done
  [ "$mode" = inplace ] && [ "$inplace" = 0 ] && hit=0
  if [ "$mode" = dest ]; then
    # the destination is the -t folder, else the last word; a config.json copied into a settings folder is a write too
    dest=$last
    if [ -n "$tdir" ]; then dest=$tdir; case "${last##*/}" in config.json) srcs=1 ;; esac; fi
    if [ -n "$dest" ] && names_config "$dest" "$EFF_DIR"; then hit=1
    elif [ -n "$dest" ] && [ "$srcs" = 1 ]; then
      resolve_dir "$EFF_DIR" "$dest"
      if [ -n "$RESOLVED" ]; then normalize_path "$RESOLVED"; case "$NORM" in */.skilliton|*/.skillgate) hit=1 ;; esac; fi
    fi
  fi
  [ "$hit" = 1 ] && ask "$CONFIG_ASK"
  return 0
}

resolve_dir() { # resolve_dir <base> <dir>: sets RESOLVED, or "" when it cannot be known
  local base=$1 a=$2
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
  PFX_GARGS=()
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
      mv|*/mv) check_move $((k + 1)); check_config_words $((k + 1)) dest ;;
      sh|bash|zsh|dash|ksh|eval|xargs|*/sh|*/bash|*/zsh|*/dash|*/ksh|*/xargs) analyze_shell_string $((k + 1)) ;;
      cp|install|ln|rsync|*/cp|*/install|*/ln|*/rsync) check_config_words $((k + 1)) dest ;;
      tee|truncate|sponge|dd|*/tee|*/truncate|*/sponge|*/dd) check_config_words $((k + 1)) any ;;
      sed|gsed|*/sed|*/gsed) check_config_words $((k + 1)) inplace ;;
      node|python|python3|perl|ruby|php|bun|deno|osascript|awk|gawk|*/node|*/python|*/python3|*/perl|*/ruby|*/php|*/bun|*/deno|*/osascript|*/awk|*/gawk) check_config_words $((k + 1)) text ;;
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
  local k=$1 n=${#SEGW[@]} w
  GDIR=$EFF_DIR
  GARGS=(${PFX_GARGS[@]+"${PFX_GARGS[@]}"})
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}
    case "$w" in
      -C)
        if [ $((k + 1)) -lt "$n" ]; then resolve_dir "$GDIR" "${SEGW[$((k + 1))]}"; GDIR=$RESOLVED; fi
        k=$((k + 2)) ;;
      -c|--namespace|--config-env|--list-cmds|--super-prefix) k=$((k + 2)) ;;
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
  case "$w" in
    push) check_push ;;
    commit) check_commit ;;
    add|stage) check_add ;;   # git stage is a synonym of git add
    reset) check_reset ;;
    clean) check_clean ;;
    checkout) check_checkout ;;
    restore) check_restore ;;
    stash) check_stash ;;
    branch) check_branch ;;
    rm) check_git_rm ;;
  esac
  return 0
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
  ) </dev/null 2>/dev/null
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

long_opt() { # long_opt <word> <full option> <shortest abbreviation git accepts>
  local w=${1%%=*}
  [ "$w" = "$2" ] && return 0
  [ "${#w}" -ge "${#3}" ] || return 1
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

SECRET_RES=(
  'AKIA[0-9A-Z]{16}'
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'ghp_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'sk_live_[A-Za-z0-9]{16,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
SECRET_LABELS=(
  'an AWS access key ID'
  'an Anthropic API key'
  'a GitHub personal access token'
  'a GitHub fine-grained token'
  'a Slack token'
  'a Stripe live secret key'
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
  local n=${#ARGS[@]} j=0 w force=0 delete=0 mirror=0 all=0 noverify=0 endopts=0 remote_seen=0 refs="" r plus del dst branches b target first
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    if [ "$endopts" = 0 ]; then
      case "$w" in
        --) endopts=1; continue ;;
        --force) force=1; continue ;;
        --no-force) force=0; continue ;;
        --mirror) mirror=1; continue ;;
        --no-mirror) mirror=0; continue ;;
        --delete) delete=1; continue ;;
        --all|--branches) all=1; continue ;;
        --no-verify) noverify=1; continue ;; # skilliton-audit: allow verification-off the guard's own parser for the flag it blocks
        --verify) noverify=0; continue ;;
        --repo|--receive-pack|--exec|--push-option|--recurse-submodules) j=$((j + 1)); continue ;;
        --*)
          if long_opt "$w" --force-with-lease --force-w; then force=1
          elif long_opt "$w" --delete --de; then delete=1
          elif long_opt "$w" --no-verify --no-veri; then noverify=1 # skilliton-audit: allow verification-off the guard's own parser for the abbreviated form of the flag it blocks
          fi
          continue ;;
        -?*)
          short_cluster "$w" o ""
          has_letter f && force=1
          has_letter d && delete=1
          [ "$SC_NEXT" = 1 ] && j=$((j + 1))
          continue ;;
      esac
    fi
    if [ "$remote_seen" = 0 ]; then remote_seen=1; else refs="$refs$w"$'\n'; fi
  done

  if [ "$noverify" = 1 ] && [ "$CFG_NV" = true ]; then
    deny "Blocked: --no-verify skips this project's safety checks (the git hooks that run before a push). Push without --no-verify, and if a check fails, fix what it reports instead of skipping it." # skilliton-audit: allow verification-off the refusal message naming the flag it just blocked
  fi
  [ "$CFG_FP" = true ] || return 0

  if [ "$mirror" = 1 ]; then
    first=${CFG_PB%%$'\n'*}
    if [ -n "$first" ]; then
      deny "Blocked: git push --mirror overwrites every branch on the remote to match this copy, including the shared $first branch, and could erase other people's work. Push only your own branch by name, without --force, and open a pull request instead."
    fi
    return 0
  fi

  # named refspecs: [+]src:dst or [+]name; a leading + forces that one refspec. A delete (--delete, -d, or a refspec
  # with an empty source such as :main) takes the branch off the remote, which loses as much as a force-push does.
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    plus=0; del=$delete
    case "$r" in +*) plus=1; r=${r#+} ;; esac
    case "$r" in :*) del=1 ;; esac
    [ "$force" = 1 ] || [ "$plus" = 1 ] || [ "$del" = 1 ] || continue
    case "$r" in *:*) dst=${r##*:} ;; *) dst=$r ;; esac
    [ -n "$dst" ] || continue
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
      else
        deny "Blocked: this would force-push over the shared $dst branch and could erase other people's work. Push your branch without --force and open a pull request instead."
      fi
      return 0
    fi
  done <<EOF
$refs
EOF
  [ "$force" = 1 ] || return 0

  if [ "$all" = 1 ]; then
    if ! branches=$(g for-each-ref --format='%(refname:short)' refs/heads); then
      ask "Check first: guardrails could not list the branches this force-push would overwrite. Confirm only if none of them is a shared branch such as main."
      return 0
    fi
    while IFS= read -r b; do
      if is_protected "$b"; then
        deny "Blocked: git push --all with --force would force-push every branch, including the shared $b branch, and could erase other people's work. Push your own branch by name without --force and open a pull request instead."
        return 0
      fi
    done <<EOF
$branches
EOF
    return 0
  fi

  # no branch named: git pushes the current branch
  [ -z "$refs" ] || return 0
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
        --*) if long_opt "$w" --no-verify --no-veri; then noverify=1; fi; continue ;; # skilliton-audit: allow verification-off the guard's own parser for the abbreviated form of the flag it blocks
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

  if ! diff=$(g diff --cached -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d); then ask_unlisted; return 0; fi
  if [ "$all" = 1 ]; then
    if ! extra=$(g diff -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d); then ask_unlisted; return 0; fi
    diff="$diff"$'\n'"$extra"
  fi
  if [ "${#PA[@]}" -gt 0 ]; then
    if ! extra=$(g diff -U0 --no-color --no-ext-diff --no-textconv --diff-filter=d -- "${PA[@]}"); then ask_unlisted; return 0; fi
    diff="$diff"$'\n'"$extra"
  fi
  scan_diff "$diff"
  if [ -n "$HIT_FILE" ]; then content_reason "$HIT_FILE" commit; deny "$REASON"; fi
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
      --hard)
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

check_checkout() {
  local j=0 n=${#ARGS[@]} w
  while [ "$j" -lt "$n" ]; do
    w=${ARGS[$j]}; j=$((j + 1))
    case "$w" in
      -b|-B|--orphan|--conflict|--pathspec-from-file) j=$((j + 1)); continue ;;
    esac
    if is_everything "$w"; then
      ask "Check first: this throws away every uncommitted edit to tracked files in this folder, and those edits cannot be recovered. Commit them or run git stash first if they might be wanted; confirm only if discarding them is intended."
      return 0
    fi
  done
}

check_restore() {
  local j=0 n=${#ARGS[@]} w staged=0 worktree=0 everything=0 endopts=0
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
  done
  if [ "$everything" = 1 ] && { [ "$staged" = 0 ] || [ "$worktree" = 1 ]; }; then
    ask "Check first: git restore . throws away every uncommitted edit to tracked files in this folder, and those edits cannot be recovered. Commit them or run git stash first if they might be wanted (git restore --staged . only unstages, and is safe); confirm only if discarding them is intended."
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

protected_target() { # protected_target <word> <base dir>: sets PT_WHAT to what would be lost, or "" when nothing of Skilliton's
  local w=$1 base=$2 r rel proj
  PT_WHAT=""
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
  case "$r/" in */.skilliton/*) case "$r" in "$proj"/*) PT_WHAT=${r#"$proj"/} ;; *) PT_WHAT=$r ;; esac; return 0 ;; esac
  # Without a configuration file this is not a prepared project, and a file at a record's path is an ordinary file.
  [ "$CFG_STATE" != default ] || return 0
  # A path spelled through a symlink (on macOS, /var for /private/var) is the same path: when both exist, compare
  # the physical ones instead. A path that does not exist is compared as written.
  physical_path "$r"
  if [ -n "$PHYS" ]; then physical_path "$proj"; if [ -n "$PHYS" ]; then proj=$PHYS; physical_path "$r"; r=$PHYS; fi; fi
  case "$r" in
    "$proj") PT_WHAT="the project folder $r" ;;
    "$proj"/*)
      rel=${r#"$proj"/}
      if record_covers "$INSTRUCTION_FILES" "$rel" 0 || record_covers "$PROTECT_RECORDS" "$rel" 0 || record_covers "$PROTECT_FOLDERS" "$rel" 1; then
        PT_WHAT=$rel
      fi ;;
  esac
  return 0
}

deny_removal() { # deny_removal <what>
  deny "Blocked: removing $1 would take away part of what Skilliton keeps in this project (the .skilliton folder, the record files, the entry folders, and the instruction files that carry the managed block), which is the project's memory. The one route that takes Skilliton out of a project is skilliton remove --apply, run by a person; it keeps the records and the history. If one file in there is really stale, say which and why, and let the person remove it. A team lead turns this rule off with \"protectRecords\": false under guardrails in .skilliton/config.json."
}

check_remove() { # check_remove <index of the first argument>: rm and rmdir, every path after the flags
  [ "$CFG_PR" = true ] || return 0
  local k=$1 n=${#SEGW[@]} w opts=1
  while [ "$k" -lt "$n" ]; do
    w=${SEGW[$k]}; k=$((k + 1))
    if [ "$opts" = 1 ]; then case "$w" in --) opts=0; continue ;; -*) continue ;; esac; fi
    protected_target "$w" "$EFF_DIR"
    if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT"; return 0; fi
  done
  return 0
}

check_move() { # check_move <index of the first argument>: every source of mv; with -t every plain argument is one
  [ "$CFG_PR" = true ] || return 0
  local k=$1 n=${#SEGW[@]} w opts=1 target=0 count last i=0
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
    protected_target "${PA[$i]}" "$EFF_DIR"
    if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT"; return 0; fi
    i=$((i + 1))
  done
  return 0
}

check_git_rm() { # git rm [-r] [--cached] [--] <path>...: the paths are relative to where git runs
  [ "$CFG_PR" = true ] || return 0
  local n=${#ARGS[@]} k=0 w opts=1
  while [ "$k" -lt "$n" ]; do
    w=${ARGS[$k]}; k=$((k + 1))
    if [ "$opts" = 1 ]; then case "$w" in --) opts=0; continue ;; -*) continue ;; esac; fi
    protected_target "$w" "$GDIR"
    if [ -n "$PT_WHAT" ]; then deny_removal "$PT_WHAT"; return 0; fi
  done
  return 0
}

# ---------------------------------------------------------------- entry points

main_pretooluse() {
  local t note=""
  GUARD_RAW=$(cat)
  case "${SKILLITON_GUARDRAILS:-}" in [Oo][Ff][Ff]) exit 0 ;; esac
  mentions_git "$GUARD_RAW" || mentions_removal "$GUARD_RAW" || mentions_config "$GUARD_RAW" || exit 0
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
  mentions_git "$IN_CMD" || mentions_removal "$IN_CMD" || mentions_config "$IN_CWD $IN_CMD" || exit 0
  for t in git awk grep find; do
    if ! command -v "$t" >/dev/null 2>&1; then
      emit_decision ask "Check first: guardrails cannot inspect git commands because $t is not installed, so nothing was checked. Read the command yourself and confirm it only if it is what you intend."
      exit 0
    fi
  done
  if [ "${#IN_CMD}" -gt 4000000 ]; then
    emit_decision ask "Check first: this command is too large for guardrails to inspect within its time limit, so nothing was checked. Read the git parts yourself and confirm only if they are what you intend."
    exit 0
  fi
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
