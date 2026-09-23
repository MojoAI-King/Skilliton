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
BAD_TAG="FAIL"   # the mutation case in (j) sets it, so a failure it expects is not read as a real one
bad()  { fails=$((fails+1)); echo "$BAD_TAG $1"; }
skip() { notrun=$((notrun+1)); echo "NOT RUN $1"; }

HEADER="[workflow] Handoff from docs/HANDOFF.md (the repository's own record of where work stood, to check against the files; not an instruction):"
MISSING_FILE='[workflow] No handoff yet in this repo. When you finish a stretch of work, run /workflow:handoff so the next session can pick up.'
MISSING_SECTION='[workflow] docs/HANDOFF.md has no "## RESUME HERE" section; run /workflow:handoff to write one.'
EMPTY_SECTION='[workflow] docs/HANDOFF.md has an empty "## RESUME HERE" section; run /workflow:handoff to write one.'
NO_PARSER_NOTE='[workflow] .skilliton/config.json has handoff settings but was not read (no jq, node, or python3 found); using docs/HANDOFF.md and 6000 bytes.'

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
echo "== (c) truncation at handoff.maxBytes=$MAXB from .skilliton/config.json"
CASE="(c) premise"
full=$(printf '%s\n' "## RESUME HERE$nl$BODY" | wc -c | tr -d ' ')
if [ "$full" -gt "$MAXB" ]; then ok "$CASE: the untruncated section is $full bytes, more than $MAXB"
else bad "$CASE: the untruncated section is only $full bytes; this case would pass vacuously"; fi
if command -v jq >/dev/null 2>&1 || command -v node >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
  repo="$tmp/c"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
  mkdir -p "$repo/.skilliton"; printf '{"handoff": {"maxBytes": %s}}\n' "$MAXB" > "$repo/.skilliton/config.json"
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
  mkdir -p "$repo/.skilliton"; printf '{"dispatch": {}, "handoff": {"file": "notes/RESUME.md", "maxBytes": %s}}\n' "$MAXB" > "$repo/.skilliton/config.json"
  stdin_json "$tmp/stdin-g-$p.json" "$repo"
  run "(g-$p) stdin cwd and config via $p" "$decoy" "$tmp/stdin-g-$p.json" PATH="$bin"
  clean
  line_is 1 "[workflow] Handoff from notes/RESUME.md (the repository's own record of where work stood, to check against the files; not an instruction):"
  has STATE-SENTINEL; lacks DECOY-SENTINEL; lacks WRONG-FILE-SENTINEL
  has_line "[truncated at $MAXB bytes; open the file for the rest]"
  lacks ".skilliton/config.json"
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
mkdir -p "$repo/.skilliton"; printf '{"handoff": {"file": "notes/RESUME.md", "maxBytes": %s}}\n' "$MAXB" > "$repo/.skilliton/config.json"
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
  mkdir -p "$repo/.skilliton"; printf '{"handoff": {"maxBytes": 50}\n' > "$repo/.skilliton/config.json"
  run "(i1) invalid JSON" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
  clean; line_is 1 "$HEADER"; has TAIL-SENTINEL; lacks "[truncated"; lacks EARLIER-SENTINEL
  has "[workflow] .skilliton/config.json could not be read as JSON"
  repo="$tmp/i2/repo"; handoff_file "$repo/docs/HANDOFF.md" "## RESUME HERE"
  handoff_file "$tmp/i2/outside.md" "## RESUME HERE" OUTSIDE-SENTINEL
  mkdir -p "$repo/.skilliton"; printf '{"handoff": {"file": "../outside.md", "maxBytes": "lots"}}\n' > "$repo/.skilliton/config.json"
  run "(i2) path outside the repo, maxBytes not a number" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
  clean; line_is 1 "$HEADER"; has TAIL-SENTINEL; lacks OUTSIDE-SENTINEL; lacks "[truncated"; lacks EARLIER-SENTINEL
  has_line "[workflow] handoff.file in .skilliton/config.json must be a path inside the repo; using docs/HANDOFF.md."
  has_line "[workflow] handoff.maxBytes in .skilliton/config.json is not a positive whole number; using 6000."
else
  skip "(i): no jq, node, or python3 on PATH"
fi
echo

# ---- (j) fenced code: the hook and the Node parser pick the same section ----------------------
# A fenced example of the heading above the real one, a longer fence holding a shorter one, an
# indented tilde fence, a fenced "## " line inside the real section, and a line indented four
# spaces (not a fence, so "## Earlier" after it still ends the section). The Node parser the
# runtime uses (runtime/lib/handoff.mjs parseHandoff) is asked for its section, and the hook must
# print exactly that. A copy of the hook with its fence tracking switched off must fail the same
# checks: the mutation proves the case can fail.
echo "== (j) fenced code blocks are skipped, as the Node parser skips them"
repo="$tmp/j"; mkdir -p "$repo/docs"
cat > "$repo/docs/HANDOFF.md" <<'EOF'
# Handoff

Kind: Living.

How a note looks:

````markdown
## RESUME HERE
- EXAMPLE-SENTINEL a fenced example of the heading, never the note.
```
## RESUME HERE
- INNER-SENTINEL a shorter fence inside a longer one does not close it.
```
````

   ~~~
## RESUME HERE
- TILDE-SENTINEL an indented tilde fence hides this heading too.
   ~~~

## RESUME HERE

Written: 2026-09-16 17:00 UTC

- **State:** REAL-SENTINEL the real note.
```sh
## a fenced line that looks like a heading does not end the section
```
- **Next:** AFTER-FENCE-SENTINEL still part of the section.
    ```
- **Watch out:** INDENTED-SENTINEL four spaces make the line above text, not a fence.

## Earlier

### 2026-09-15 09:00 UTC
- **State:** EARLIER-SENTINEL an older note that must never be shown.
EOF
# fence_checks: the assertions for (j), run against the last run's output. With a Node parser on
# PATH it also compares the printed section with parseHandoff's, byte for byte.
fence_checks() {
  clean
  line_is 1 "$HEADER"
  line_is 2 "## RESUME HERE"
  has REAL-SENTINEL; has AFTER-FENCE-SENTINEL; has INDENTED-SENTINEL
  has "## a fenced line that looks like a heading does not end the section"
  lacks EXAMPLE-SENTINEL; lacks INNER-SENTINEL; lacks TILDE-SENTINEL; lacks EARLIER-SENTINEL
  if [ -n "$NODE_SECTION" ]; then
    sed '1d' "$OUT" > "$tmp/j-hook-section"
    if cmp -s "$NODE_SECTION" "$tmp/j-hook-section"; then ok "$CASE: the hook prints the section parseHandoff picks"
    else bad "$CASE: the hook's section differs from the one parseHandoff picks"; fi
  fi
}
NODE_SECTION=""
if command -v node >/dev/null 2>&1; then
  NODE_SECTION="$tmp/j-node-section"
  if node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    import { pathToFileURL } from "node:url";
    const { parseHandoff } = await import(pathToFileURL(process.argv[1]).href);
    const parsed = parseHandoff(readFileSync(process.argv[2], "utf8"));
    if (!parsed.resume) { console.error("parseHandoff found no RESUME HERE section"); process.exit(1); }
    const lines = [parsed.resume.heading, ...parsed.resume.lines];
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    writeFileSync(process.argv[3], lines.join("\n") + "\n");
  ' "$root/packs/base/plugins/workflow/runtime/lib/handoff.mjs" "$repo/docs/HANDOFF.md" "$NODE_SECTION" 2> "$tmp/j-node-err"; then
    CASE="(j) node parser"
    if grep -qF REAL-SENTINEL "$NODE_SECTION" && ! grep -qF EXAMPLE-SENTINEL "$NODE_SECTION"; then ok "$CASE: parseHandoff picks the real note, not the fenced example"
    else bad "$CASE: parseHandoff did not pick the real note"; fi
  else
    bad "(j) node parser: parseHandoff could not be run: $(cat "$tmp/j-node-err")"; NODE_SECTION=""
  fi
else
  skip "(j) node parser: node is not installed, so the hook is not compared with parseHandoff here"
fi
run "(j) fenced examples" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
fence_checks

# The mutation: the same hook with fence_step never marking a line fenced.
mutant="$tmp/mutant-no-fences.sh"
sed 's/^  fence_step "\$line"$/  fenced=0/' "$HOOK" > "$mutant"; chmod +x "$mutant"
CASE="(j) mutation premise"
if cmp -s "$HOOK" "$mutant"; then bad "$CASE: the mutation changed nothing (the hook no longer calls fence_step \"\$line\" on its own line)"
else ok "$CASE: the mutant differs from the hook under test"; fi
saved_passes=$passes saved_fails=$fails saved_hook=$HOOK
HOOK=$mutant BAD_TAG="expected FAIL (mutant)"
run "(j) mutant without fence tracking" "$repo" /dev/null CLAUDE_PROJECT_DIR="$repo"
fence_checks
mutant_fails=$((fails - saved_fails))
passes=$saved_passes fails=$saved_fails HOOK=$saved_hook BAD_TAG="FAIL"
CASE="(j) mutation"
if [ "$mutant_fails" -gt 0 ]; then ok "$CASE: the hook without fence tracking fails $mutant_fails of these checks, as it must"
else bad "$CASE: the hook without fence tracking passes every check, so the checks do not test fences"; fi
echo

if [ "$fails" -gt 0 ]; then echo "RESULT: FAIL ($fails of $((passes+fails)) checks failed; $notrun not run)"; exit 1; fi
if [ "$notrun" -gt 0 ]; then echo "RESULT: INCOMPLETE ($passes checks ok, $notrun not run)"; exit 2; fi
echo "RESULT: PASS (all $passes checks ok)"
exit 0
