#!/usr/bin/env bash
# Tests the SessionStart checklist hook.
#
# Part 1 reproduces the original-vs-repaired awk on a sample lessons file (the historical "before").
# Part 2 runs the SHIPPED hook script, not a copy of its awk, because a test that certifies a
# different file than the one that ships is a gate that does not gate.
#
#   bash scripts/hook-fixture.test.sh                    run all checks, no side effects
#   bash scripts/hook-fixture.test.sh --write-evidence   also write the output to evidence/day-1/hook-fixture.txt
#   bash scripts/hook-fixture.test.sh --hook FILE        run Part 2 against FILE instead of the shipped hook
#                                                        (used to prove an older hook fails; never writes evidence)
#
# Optional, informational only (not a pass/fail check): set SKILLITON_ORIGIN_LESSONS to a private
# lessons file to print the byte and line count the hook injects from it. Content is never printed.
#
# Exit 0 only if every check passes.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
SHIPPED_REL="packs/base/plugins/context-hygiene/hooks/session-start-checklist.sh"
HOOK="$root/$SHIPPED_REL"
HOOK_LABEL="$SHIPPED_REL (shipped)"
WRITE_EVIDENCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --write-evidence) WRITE_EVIDENCE=1; shift ;;
    --hook)
      [ $# -ge 2 ] || { echo "FAIL: --hook needs a file argument"; exit 1; }
      HOOK="$2"; HOOK_LABEL="override: $(basename "$2") (NOT the shipped hook)"; shift 2 ;;
    *) echo "FAIL: unknown argument: $1"; exit 1 ;;
  esac
done

if [ "$WRITE_EVIDENCE" -eq 1 ] && [ "$HOOK" != "$root/$SHIPPED_REL" ]; then
  echo "FAIL: --write-evidence is refused with --hook; evidence must describe the shipped hook"; exit 1
fi
if [ ! -f "$HOOK" ]; then echo "FAIL: hook under test not found: $HOOK_LABEL"; exit 1; fi

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
OUT="$tmp/output.txt"

NOT_FOUND='[context-hygiene] checklist heading not found in SKILLITON_LESSONS; injecting nothing. (Reported, not silent.)'
# The unreadable notice names the path it could not read (N38); unset prints nothing at all.
unreadable() { printf '[context-hygiene] SKILLITON_LESSONS is set, but %s is not a file this session can read; injecting nothing. (Reported, not silent.)' "$1"; }

run_all() {
  local fails=0 L S orig fix ob fb out rc

  echo "hook-fixture test"
  echo "hook under test: $HOOK_LABEL"
  echo

  echo "== Part 1: original vs repaired awk on fixtures/hook/lessons-sample.md"
  L="$here/fixtures/hook/lessons-sample.md"
  orig=$(awk -f "$here/fixtures/hook/original.awk" "$L")
  fix=$(awk -f "$here/fixtures/hook/repaired.awk" "$L")
  ob=$(printf "%s" "$orig" | wc -c | tr -d ' '); fb=$(printf "%s" "$fix" | wc -c | tr -d ' ')
  echo "original awk: ${ob} bytes injected"
  echo "repaired awk: ${fb} bytes injected"
  echo "---- repaired output ends with:"; printf "%s\n" "$fix" | tail -2
  if [ "$fb" -lt "$ob" ] && ! printf "%s\n" "$fix" | grep -q '^## Lesson'; then
    echo "ok   awk comparison: repaired form stops at the next heading; original form did not"
  else
    echo "FAIL awk comparison: repaired form still leaks later sections"; fails=$((fails+1))
  fi
  echo

  echo "== Part 2: the hook script itself"
  # Claude Code runs the hook by path (hooks.json), not through bash. A missing executable bit makes
  # every check below pass while the real hook never runs, so check it the way it is actually invoked.
  if [ -x "$HOOK" ]; then
    echo "ok   (0) hook is executable (hooks.json runs it by path)"
    direct=$(env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$here/fixtures/hook/lessons-sample.md" "$HOOK" 2>&1)
    if printf "%s\n" "$direct" | grep -q -- '- step three'; then echo "ok   (0) invoked by path, the hook prints the checklist"
    else echo "FAIL (0) invoked by path, the hook did not print the checklist"; fails=$((fails+1)); fi
  else
    echo "FAIL (0) hook is not executable; Claude Code runs it by path and it would never run"; fails=$((fails+1))
  fi

  # check_section <label> <lessons file>: output must contain "- step three" and no "## Lesson" line
  check_section() {
    local label="$1" file="$2" out rc bytes
    env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$file" bash "$HOOK" > "$tmp/hook-out" 2>&1; rc=$?
    bytes=$(wc -c < "$tmp/hook-out" | tr -d ' ')
    out=$(cat "$tmp/hook-out")
    echo "-- $label: exit $rc, ${bytes} bytes of raw output"
    printf "%s\n" "$out" | sed 's/^/   | /'
    if [ "$rc" -eq 0 ]; then echo "ok   $label: exit 0"; else echo "FAIL $label: exit $rc"; fails=$((fails+1)); fi
    if printf "%s\n" "$out" | grep -qF -- '- step three'; then echo "ok   $label: contains '- step three'"
    else echo "FAIL $label: missing '- step three'"; fails=$((fails+1)); fi
    if printf "%s\n" "$out" | grep -q '^## Lesson'; then echo "FAIL $label: leaks a '## Lesson' section"; fails=$((fails+1))
    else echo "ok   $label: no '## Lesson' line"; fi
  }

  # check_exact <label> <expected line> <command...>: output must be exactly the expected line
  check_exact() {
    local label="$1" want="$2" out rc; shift 2
    out=$("$@" 2>&1); rc=$?
    echo "-- $label: exit $rc"
    printf "%s\n" "$out" | sed 's/^/   | /'
    if [ "$rc" -eq 0 ]; then echo "ok   $label: exit 0"; else echo "FAIL $label: exit $rc"; fails=$((fails+1)); fi
    if [ "$out" = "$want" ]; then echo "ok   $label: output is exactly the expected notice"
    else echo "FAIL $label: output is not the expected notice"; fails=$((fails+1)); fi
  }

  check_section "(a) lessons-sample.md" "$here/fixtures/hook/lessons-sample.md"
  check_section "(b) lessons-sample-suffixed.md" "$here/fixtures/hook/lessons-sample-suffixed.md"

  printf '# LESSONS (control)\n\n## Some other heading\n- not the checklist\n\n## Lesson 1\ntext\n' > "$tmp/no-heading.md"
  check_exact "(c) missing-heading control" "$NOT_FOUND" \
    env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$tmp/no-heading.md" bash "$HOOK"

  check_exact "(d) SKILLITON_LESSONS unset prints nothing" "" \
    env -u SKILLITON_LESSONS -u SKILLITON_CHECKLIST_HEADING bash "$HOOK"

  check_exact "(d2) SKILLITON_LESSONS set to an empty value prints nothing" "" \
    env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS= bash "$HOOK"

  check_exact "(d3) SKILLITON_LESSONS names a missing file" "$(unreadable "$tmp/no-such-lessons.md")" \
    env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$tmp/no-such-lessons.md" bash "$HOOK"

  printf '# LESSONS (control)\n\n## The new-app wiring checklist\n- step\n' > "$tmp/unreadable.md"
  chmod 000 "$tmp/unreadable.md"
  if [ -r "$tmp/unreadable.md" ]; then
    echo "NOT RUN (d4) unreadable file: this user can read a mode-000 file (root?), so the case cannot be staged here"
  else
    check_exact "(d4) SKILLITON_LESSONS names a file that cannot be read" "$(unreadable "$tmp/unreadable.md")" \
      env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$tmp/unreadable.md" bash "$HOOK"
  fi
  chmod 600 "$tmp/unreadable.md"

  printf '# LESSONS (control)\n\n## The new-app wiring checklist\n\n\n## Lesson 1\ntext\n' > "$tmp/empty-body.md"
  check_exact "(e) heading present, empty checklist" "$NOT_FOUND" \
    env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$tmp/empty-body.md" bash "$HOOK"
  echo

  echo "== Informational (not a check): the originating lessons file (private, not in this repo)"
  if [ -n "${SKILLITON_ORIGIN_LESSONS:-}" ] && [ -f "${SKILLITON_ORIGIN_LESSONS}" ]; then
    env -u SKILLITON_CHECKLIST_HEADING SKILLITON_LESSONS="$SKILLITON_ORIGIN_LESSONS" bash "$HOOK" > "$tmp/origin-out" 2>&1; rc=$?
    echo "exit $rc; injected $(wc -c < "$tmp/origin-out" | tr -d ' ') bytes of raw output, $(wc -l < "$tmp/origin-out" | tr -d ' ') lines (content not printed)"
    if grep -q '^\[context-hygiene\]' "$tmp/origin-out"; then echo "note: output contains a [context-hygiene] notice line"; fi
  else
    echo "NOT MEASURED: SKILLITON_ORIGIN_LESSONS not set or file missing"
  fi
  echo

  if [ "$fails" -eq 0 ]; then echo "RESULT: PASS (all checks ok)"; else echo "RESULT: FAIL ($fails check(s) failed)"; fi
  return "$fails"
}

run_all > "$OUT" 2>&1
status=$?
cat "$OUT"

if [ "$WRITE_EVIDENCE" -eq 1 ]; then
  mkdir -p "$root/evidence/day-1"
  {
    echo "# Evidence: bash scripts/hook-fixture.test.sh --write-evidence"
    echo "# written $(date -u +%Y-%m-%dT%H:%M:%SZ), exit status $status"
    echo
    cat "$OUT"
  } > "$root/evidence/day-1/hook-fixture.txt"
  echo "evidence written: evidence/day-1/hook-fixture.txt"
fi

[ "$status" -eq 0 ] && exit 0 || exit 1
