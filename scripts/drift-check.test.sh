#!/usr/bin/env bash
# Tests the context-hygiene config drift check (packs/base/plugins/context-hygiene/hooks/config-drift-check.sh).
# It runs the shipped script by path, the way a person runs it, against settings and transcripts in a temporary
# folder, with a stand-in `claude` first on PATH so the result does not depend on this machine.
#
#   bash scripts/drift-check.test.sh                 test the shipped script
#   bash scripts/drift-check.test.sh --script FILE   test another copy (used to prove a check fails on old code)
#
# Exit 0 only if every check passes.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
SCRIPT="$root/packs/base/plugins/context-hygiene/hooks/config-drift-check.sh"
LABEL="config-drift-check.sh (shipped)"
if [ "${1:-}" = "--script" ]; then
  [ $# -ge 2 ] || { echo "FAIL: --script needs a file"; exit 1; }
  SCRIPT="$2"; LABEL="override: $2 (NOT the shipped script)"
fi
[ -x "$SCRIPT" ] || { echo "FAIL: $LABEL is missing or not executable"; exit 1; }
command -v jq >/dev/null || { echo "FAIL: this test needs jq"; exit 1; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/projects/p1"
printf '#!/usr/bin/env bash\necho "9.9.9 (Claude Code)"\n' > "$tmp/bin/claude"; chmod +x "$tmp/bin/claude"
printf '%s\n' '{"type":"assistant","version":"2.1.273","message":{"model":"claude-opus-5[1m]"}}' > "$tmp/projects/p1/t.jsonl"

fails=0; oks=0
ok() { if [ "$1" -eq 0 ]; then oks=$((oks + 1)); echo "ok   $2"; else fails=$((fails + 1)); echo "FAIL $2"; fi; }
run() { # settings text or "none"
  if [ "$1" = none ]; then rm -f "$tmp/settings.json"; else printf '%s\n' "$1" > "$tmp/settings.json"; fi
  PATH="$tmp/bin:$PATH" SKILLGATE_SETTINGS="$tmp/settings.json" SKILLGATE_PROJECTS="$tmp/projects" "$SCRIPT" 2>&1
}
has() { printf '%s' "$1" | grep -qF -- "$2"; }

echo "script under test: $LABEL"

out=$(run none);                                   ! has "$out" DRIFT; ok $? "no settings file: no DRIFT"
out=$(run '{}');                                   ! has "$out" DRIFT; ok $? "settings without a model: no DRIFT (the default applies)"
has "$out" "nothing to compare";                   ok $? "settings without a model: says there is nothing to compare"
out=$(run '{"model":"claude-opus-5"}');            ! has "$out" DRIFT; ok $? "a declared model ID that matches (context suffix ignored): no DRIFT"
out=$(run '{"model":"claude-sonnet-5"}');          has "$out" "DRIFT: declared model != observed model"; ok $? "a declared model ID that differs: DRIFT (positive control)"
out=$(run '{"model":"opus"}');                     ! has "$out" DRIFT; ok $? "an alias of the observed family: no DRIFT"
out=$(run '{"model":"sonnet"}');                   has "$out" "DRIFT: the observed model is not in the declared family (sonnet)"; ok $? "an alias of another family: DRIFT"
out=$(run '{"model":"default"}');                  ! has "$out" DRIFT; ok $? "the default alias: no DRIFT"
out=$(run '{ "model": ');                          ! has "$out" DRIFT; ok $? "invalid JSON settings: no DRIFT"
has "$out" "not valid JSON";                       ok $? "invalid JSON settings: says so"
out=$(run '{}');                                   has "$out" "cli version (shell): 9.9.9 (Claude Code)"; ok $? "the CLI version comes from the claude on PATH"
has "$out" "observed version (latest transcript): 2.1.273"; ok $? "the observed version comes from the latest transcript"

echo
if [ "$fails" -eq 0 ]; then echo "RESULT: PASS (all $oks checks ok)"; exit 0; fi
echo "RESULT: FAIL ($fails of $((fails + oks)) checks failed)"; exit 1
