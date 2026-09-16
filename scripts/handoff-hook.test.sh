#!/usr/bin/env bash
# Tests the workflow plugin's SessionStart handoff hook against synthetic repos in temp dirs.
#
# It runs the SHIPPED hook the way Claude Code does (by path, through its shebang), never a copy
# of its logic: a test that certifies a different file than the one that ships does not gate.
# Every "must not show" check looks for text that does exist, either in that case's input files
# or in the hook's output in another case (so it cannot pass just because the text never
# exists), and every restricted-PATH case first proves the PATH really is restricted.
#
#   bash scripts/handoff-hook.test.sh              all checks, against the shipped hook
#   bash scripts/handoff-hook.test.sh --hook FILE  the same checks against FILE instead
#                                                  (used to prove a deliberately broken copy fails)
#
# Exit 0: every check ok. Exit 1: at least one FAIL.
# Exit 2: no FAIL, but some checks could not run (a parser missing here); never counted as passes.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
SHIPPED_REL="packs/base/plugins/workflow/hooks/session-start-handoff.sh"
HOOKS_JSON="$root/packs/base/plugins/workflow/hooks/hooks.json"
HOOK="$root/$SHIPPED_REL"
LABEL="$SHIPPED_REL (shipped)"

while [ $# -gt 0 ]; do
  case "$1" in
    --hook)
      [ $# -ge 2 ] || { echo "FAIL: --hook needs a file argument"; exit 1; }
      [ -f "$2" ] || { echo "FAIL: --hook file not found: $2"; exit 1; }
      HOOK="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
      LABEL="override: $(basename "$2") (NOT the shipped hook)"; shift 2 ;;
    *) echo "FAIL: unknown argument: $1"; exit 1 ;;
  esac
done
[ -f "$HOOK" ] || { echo "FAIL: hook under test not found: $LABEL"; exit 1; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
nl=$'\n'
passes=0; fails=0; notrun=0; RUNS=0
ok()   { passes=$((passes+1)); echo "ok   $1"; }
bad()  { fails=$((fails+1)); echo "FAIL $1"; }
skip() { notrun=$((notrun+1)); echo "NOT RUN $1"; }

HEADER='[workflow] Handoff from docs/HANDOFF.md:'
MISSING_FILE='[workflow] No handoff yet in this repo. When you finish a stretch of work, run /workflow:handoff so the next session can pick up.'
MISSING_SECTION='[workflow] docs/HANDOFF.md has no "## RESUME HERE" section; run /workflow:handoff to write one.'
EMPTY_SECTION='[workflow] docs/HANDOFF.md has an empty "## RESUME HERE" section; run /workflow:handoff to write one.'
NO_PARSER_NOTE='[workflow] .skillgate/config.json has handoff settings but was not read (no jq, node, or python3 found); using docs/HANDOFF.md and 6000 bytes.'

# ---- fixtures -------------------------------------------------------------------------------
IFS= read -r -d '' BODY <<'EOF'

Written: 2026-09-16 17:00 UTC

- **State:** STATE-SENTINEL the sign-in form is half built. Branch feature/sign-in. Uncommitted: src/sign-in.js.
- **Next:** NEXT-SENTINEL finish validation in src/sign-in.js, then run the tests.

### A level-three heading stays inside the section
- DETAIL-SENTINEL this line is still part of RESUME HERE.

- **Blocked:** nothing.
- **Watch out:** TAIL-SENTINEL the test suite takes about two minutes.
EOF
BODY=${BODY%"$nl"}
IFS= read -r -d '' TRAILER <<'EOF'

## Earlier

### 2026-09-15 09:00 UTC
- **State:** EARLIER-SENTINEL an older note that must never be shown.

## RESUME HERE
- SECOND-SENTINEL a second RESUME HERE heading further down is never used.
EOF

# handoff_file <path> <heading line> [marker]: a full handoff file; the marker replaces STATE-SENTINEL
handoff_file() {
  local body="$BODY"
  [ $# -ge 3 ] && body=${body/STATE-SENTINEL/$3}
  mkdir -p "$(dirname "$1")"
  printf '# Handoff\n\nKind: Living.\n\n%s\n%s\n%s' "$2" "$body" "$TRAILER" > "$1"
}
# stdin_json <file> <cwd>: a SessionStart payload
stdin_json() {
  printf '{"session_id":"test","transcript_path":"/dev/null","cwd":"%s","hook_event_name":"SessionStart","source":"startup"}\n' "$2" > "$1"
}

decoy="$tmp/decoy"; handoff_file "$decoy/docs/HANDOFF.md" "## RESUME HERE" DECOY-SENTINEL
stdin_json "$tmp/stdin-decoy.json" "$decoy"

# ---- running and asserting ------------------------------------------------------------------
# run <label> <dir to run in> <stdin file> [VAR=value ...]
# Runs the hook by path with CLAUDE_PROJECT_DIR unset unless passed; stdout, stderr, and the exit
# status are captured separately (no pipe decides a verdict).
run() {
  local label=$1 dir=$2 input=$3; shift 3
  RUNS=$((RUNS+1)); OUT="$tmp/out.$RUNS"; ERR="$tmp/err.$RUNS"
  ( cd "$dir" && env -u CLAUDE_PROJECT_DIR "$@" "$HOOK" < "$input" > "$OUT" 2> "$ERR" )
  RC=$?
  CASE=$label
  echo "-- $label: exit $RC, $(wc -c < "$OUT" | tr -d ' ') bytes on stdout, $(wc -c < "$ERR" | tr -d ' ') on stderr"
  sed 's/^/   | /' "$OUT"
  [ -s "$ERR" ] && sed 's/^/   ! /' "$ERR"
  return 0
}
clean()    { if [ "$RC" -eq 0 ]; then ok "$CASE: exit 0"; else bad "$CASE: exit $RC"; fi
             if [ -s "$ERR" ]; then bad "$CASE: wrote to stderr"; else ok "$CASE: nothing on stderr"; fi; }
has()      { if grep -qF -- "$1" "$OUT"; then ok "$CASE: shows $1"; else bad "$CASE: does not show $1"; fi; }
lacks()    { if grep -qF -- "$1" "$OUT"; then bad "$CASE: must not show $1"; else ok "$CASE: does not show $1"; fi; }
has_line() { if grep -qxF -- "$1" "$OUT"; then ok "$CASE: has the line: $1"; else bad "$CASE: missing the line: $1"; fi; }
line_is()  { local got; got=$(sed -n "${1}p" "$OUT")
             if [ "$got" = "$2" ]; then ok "$CASE: line $1 is: $2"; else bad "$CASE: line $1 is: $got (expected: $2)"; fi; }
exactly()  { printf '%s\n' "$1" > "$tmp/expected"
             if cmp -s "$tmp/expected" "$OUT"; then ok "$CASE: stdout is exactly the expected text"
             else bad "$CASE: stdout differs from the expected text"; fi; }

echo "handoff-hook test"
echo "hook under test: $LABEL"
echo "bash: $BASH_VERSION"
for p in jq node python3; do command -v "$p" >/dev/null 2>&1 && echo "parser on PATH: $p" || echo "parser on PATH: $p NOT INSTALLED"; done
echo

# ---- (0) wiring ---------------------------------------------------------------------------
echo "== (0) wiring"
CASE="(0) wiring"
if [ -x "$HOOK" ]; then ok "$CASE: hook is executable (hooks.json runs it by path)"; else bad "$CASE: hook is not executable"; fi
if bash -n "$HOOK" 2>/dev/null; then ok "$CASE: hook parses (bash -n)"; else bad "$CASE: hook has a syntax error (bash -n)"; fi
if grep -qF '"command": "\"${CLAUDE_PLUGIN_ROOT}\"/hooks/session-start-handoff.sh"' "$HOOKS_JSON" 2>/dev/null; then
  ok "$CASE: hooks.json SessionStart command names hooks/session-start-handoff.sh"
else bad "$CASE: hooks.json does not run hooks/session-start-handoff.sh"; fi
echo

# ---- (a) the section, and only the section ------------------------------------------------
echo "== (a) section printed, stopping at the next \"## \" heading"
repo="$tmp/a"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
run "(a) default" "$decoy" "$tmp/stdin-decoy.json" CLAUDE_PROJECT_DIR="$repo"
clean
line_is 1 "$HEADER"
line_is 2 "## RESUME HERE"
has STATE-SENTINEL; has NEXT-SENTINEL; has DETAIL-SENTINEL; has TAIL-SENTINEL
lacks "## Earlier"; lacks EARLIER-SENTINEL; lacks SECOND-SENTINEL
lacks "Kind: Living."
lacks "[truncated"
lacks DECOY-SENTINEL
EXPECTED_A="$HEADER$nl## RESUME HERE$nl$BODY"
exactly "$EXPECTED_A"
echo

# ---- (b) heading with a suffix ------------------------------------------------------------
echo "== (b) a heading with a suffix still matches (prefix match)"
repo="$tmp/b"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE (2026-09-16, end of day)"
run "(b) suffixed heading" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
clean
line_is 2 "## RESUME HERE (2026-09-16, end of day)"
has STATE-SENTINEL; has TAIL-SENTINEL; lacks EARLIER-SENTINEL
echo

# ---- (c) truncation from config -----------------------------------------------------------
MAXB=200
echo "== (c) truncation at handoff.maxBytes=$MAXB from .skillgate/config.json"
CASE="(c) premise"
full=$(printf '%s\n' "## RESUME HERE$nl$BODY" | wc -c | tr -d ' ')
if [ "$full" -gt "$MAXB" ]; then ok "$CASE: the untruncated section is $full bytes, more than $MAXB"
else bad "$CASE: the untruncated section is only $full bytes; this case would pass vacuously"; fi
if command -v jq >/dev/null 2>&1 || command -v node >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
  repo="$tmp/c"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
  mkdir -p "$repo/.skillgate"; printf '{"handoff": {"maxBytes": %s}}\n' "$MAXB" > "$repo/.skillgate/config.json"
  run "(c) maxBytes" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
  clean
  line_is 1 "$HEADER"
  has STATE-SENTINEL; lacks NEXT-SENTINEL; lacks TAIL-SENTINEL; lacks EARLIER-SENTINEL
  NOTICE="[truncated at $MAXB bytes; open the file for the rest]"
  has_line "$NOTICE"
  if [ "$(tail -n 1 "$OUT")" = "$NOTICE" ]; then ok "$CASE: the notice is the last line"; else bad "$CASE: the notice is not the last line"; fi
  sed '1d' "$OUT" | sed '/^\[truncated at /,$d' > "$tmp/c-section"
  shown=$(wc -c < "$tmp/c-section" | tr -d ' ')
  if [ "$shown" -le "$MAXB" ]; then ok "$CASE: $shown section bytes shown, within $MAXB"; else bad "$CASE: $shown section bytes shown, over $MAXB"; fi
  partial=0
  while IFS= read -r l; do grep -qxF -- "$l" "$repo/docs/HANDOFF.md" || partial=1; done < "$tmp/c-section"
  if [ "$partial" -eq 0 ]; then ok "$CASE: every shown line is a whole line of the file"; else bad "$CASE: a shown line was cut mid-line"; fi
else
  skip "(c) maxBytes: no jq, node, or python3 on PATH, so config cannot be read here"
fi
echo

# ---- (d), (e), (f) notices ----------------------------------------------------------------
echo "== (d) no handoff file"
repo="$tmp/d"; mkdir -p "$repo"
run "(d) missing file" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
clean; exactly "$MISSING_FILE"
echo

echo "== (e) handoff file without a RESUME HERE section"
repo="$tmp/e"; mkdir -p "$repo/docs"
printf '# Handoff\n\nKind: Living.\n\nSee the ## RESUME HERE section once someone writes one.\n### RESUME HERE is a level-three heading, not the section\n\n## Earlier\n- EARLIER-SENTINEL\n' > "$repo/docs/HANDOFF.md"
run "(e) missing section" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
clean; exactly "$MISSING_SECTION"
echo

echo "== (f) RESUME HERE heading with nothing under it"
repo="$tmp/f"; mkdir -p "$repo/docs"
printf '# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\n   \n## Earlier\n- EARLIER-SENTINEL\n' > "$repo/docs/HANDOFF.md"
run "(f) empty section" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
clean; exactly "$EMPTY_SECTION"
echo

# ---- (g) CLAUDE_PROJECT_DIR unset: cwd from stdin JSON, once per parser --------------------
echo "== (g) CLAUDE_PROJECT_DIR unset: project dir from the stdin JSON cwd, with each parser alone on PATH"
for p in jq node python3; do
  if ! command -v "$p" >/dev/null 2>&1; then skip "(g-$p): $p not installed on this machine"; continue; fi
  bin="$tmp/bin-$p"; mkdir -p "$bin"
  ln -s "$BASH" "$bin/bash"; ln -s "$(command -v "$p")" "$bin/$p"
  CASE="(g-$p) control"
  found=$(PATH="$bin" "$bin/bash" -c 'for t in jq node python3; do command -v "$t"; done' 2>/dev/null)
  if [ "$found" = "$bin/$p" ]; then ok "$CASE: only $p is on the restricted PATH"; else bad "$CASE: restricted PATH finds: $found"; fi
  repo="$tmp/g-$p"
  handoff_file "$repo/notes/RESUME.md" "## RESUME HERE"
  handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE" WRONG-FILE-SENTINEL
  mkdir -p "$repo/.skillgate"; printf '{"dispatch": {}, "handoff": {"file": "notes/RESUME.md", "maxBytes": %s}}\n' "$MAXB" > "$repo/.skillgate/config.json"
  stdin_json "$tmp/stdin-g-$p.json" "$repo"
  run "(g-$p) stdin cwd and config via $p" "$decoy" "$tmp/stdin-g-$p.json" PATH="$bin"
  clean
  line_is 1 "[workflow] Handoff from notes/RESUME.md:"
  has STATE-SENTINEL; lacks DECOY-SENTINEL; lacks WRONG-FILE-SENTINEL
  has_line "[truncated at $MAXB bytes; open the file for the rest]"
  lacks ".skillgate/config.json"
done
repo="$tmp/g-fallback"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
printf 'this is not json\n' > "$tmp/stdin-garbage"
run "(g) stdin without a usable cwd falls back to \$PWD" "$repo" "$tmp/stdin-garbage"
clean; line_is 1 "$HEADER"; has STATE-SENTINEL; lacks EARLIER-SENTINEL
echo

# ---- (h) no parser at all -----------------------------------------------------------------
echo "== (h) no jq, node, or python3: PATH holds bash and coreutils only"
bin="$tmp/bin-none"; mkdir -p "$bin"; ln -s "$BASH" "$bin/bash"
for t in basename cat cp cut date dirname env head ls mkdir mv printf rm sleep sort tail tee touch tr uniq wc; do
  tp=$(command -v "$t" 2>/dev/null); case "$tp" in /*) ln -s "$tp" "$bin/$t" ;; esac
done
CASE="(h) control"
found=$(PATH="$bin" "$bin/bash" -c 'for t in jq node python3; do command -v "$t"; done' 2>/dev/null)
if [ -z "$found" ]; then ok "$CASE: no parser on the restricted PATH"; else bad "$CASE: restricted PATH still finds: $found"; fi
repo="$tmp/h"
handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
handoff_file "$repo/notes/RESUME.md" "## RESUME HERE" CONFIG-FILE-SENTINEL
mkdir -p "$repo/.skillgate"; printf '{"handoff": {"file": "notes/RESUME.md", "maxBytes": %s}}\n' "$MAXB" > "$repo/.skillgate/config.json"
run "(h) no parser" "$repo" "$tmp/stdin-decoy.json" PATH="$bin"
clean
line_is 1 "$HEADER"
has STATE-SENTINEL; has TAIL-SENTINEL; lacks "[truncated"; lacks EARLIER-SENTINEL
lacks CONFIG-FILE-SENTINEL; lacks DECOY-SENTINEL
has_line "$NO_PARSER_NOTE"
echo

# ---- (i) unusable config is reported, and defaults are used --------------------------------
echo "== (i) an unusable config is reported, never silently ignored"
if command -v jq >/dev/null 2>&1 || command -v node >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
  repo="$tmp/i1"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
  mkdir -p "$repo/.skillgate"; printf '{"handoff": {"maxBytes": 50}\n' > "$repo/.skillgate/config.json"
  run "(i1) invalid JSON" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
  clean; line_is 1 "$HEADER"; has TAIL-SENTINEL; lacks "[truncated"; lacks EARLIER-SENTINEL
  has "[workflow] .skillgate/config.json could not be read as JSON"
  repo="$tmp/i2/repo"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
  handoff_file "$tmp/i2/outside.md" "## RESUME HERE" OUTSIDE-SENTINEL
  mkdir -p "$repo/.skillgate"; printf '{"handoff": {"file": "../outside.md", "maxBytes": "lots"}}\n' > "$repo/.skillgate/config.json"
  run "(i2) path outside the repo, maxBytes not a number" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
  clean; line_is 1 "$HEADER"; has TAIL-SENTINEL; lacks OUTSIDE-SENTINEL; lacks "[truncated"; lacks EARLIER-SENTINEL
  has_line "[workflow] handoff.file in .skillgate/config.json must be a path inside the repo; using docs/HANDOFF.md."
  has_line "[workflow] handoff.maxBytes in .skillgate/config.json is not a positive whole number; using 6000."
else
  skip "(i): no jq, node, or python3 on PATH"
fi
echo

if [ "$fails" -gt 0 ]; then echo "RESULT: FAIL ($fails of $((passes+fails)) checks failed; $notrun not run)"; exit 1; fi
if [ "$notrun" -gt 0 ]; then echo "RESULT: INCOMPLETE ($passes checks ok, $notrun not run)"; exit 2; fi
echo "RESULT: PASS (all $passes checks ok)"
exit 0
