#!/usr/bin/env bash
# scrub-check.sh: public-safety gate. Run before every commit and before every push.
#
# Fails (exit 1) on any of:
#   1. a denylisted name (client, evaluator, or person) in the tree or, with --history, in git history
#   2. an em dash or en dash in any tracked text file
#   3. an absolute home-directory path (macOS or Linux style)
#
# The denylist is NOT in this repo, because a list of names to keep out of the repo is itself
# a list of names. It lives at $SKILLGATE_DENYLIST (default ~/.config/skilliton/denylist),
# one case-insensitive extended regex per line, # for comments.
# If the denylist is missing, the name scan did not run, and this script says so and exits 2.
# A check that cannot run is never reported as a check that found nothing.
#
#   bash scripts/scrub-check.sh              tree only
#   bash scripts/scrub-check.sh --history    tree plus every commit (diffs, messages, author fields)
#   bash scripts/scrub-check.sh --self-test  positive control: proves each scan can fail
#   bash scripts/scrub-check.sh --path <dir> one directory instead of the repo: every regular file under it,
#                                            tracked by git or not (skipping .git/ and .DS_Store), because it is
#                                            meant for material about to be copied in. Same scans, same exit codes.

set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
DENY="${SKILLGATE_DENYLIST:-$HOME/.config/skilliton/denylist}"
EN=$(printf '\xe2\x80\x93'); EM=$(printf '\xe2\x80\x94')
HOMEPATH='(/Users|/home)/[A-Za-z0-9._-]+/'

deny_patterns() { grep -v '^[[:space:]]*#' "$DENY" | grep -v '^[[:space:]]*$'; }

list_files() {
  if [ -z "${PATH_MODE:-}" ] && git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$1" ls-files -co --exclude-standard
  else
    (cd "$1" && find . -type f -not -path '*/.git/*' -not -name '.DS_Store' | sed 's|^\./||')
  fi
}

# scan_tree <dir> -> prints findings, returns number of failed scans
scan_tree() {
  local dir="$1" fails=0 files hits
  cd "$dir" || return 1
  files=$(list_files "$dir" | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done)
  if [ -z "$files" ]; then echo "FAIL: no files found under $dir; nothing was scanned"; return 1; fi
  echo "scanned files: $(printf '%s\n' "$files" | wc -l | tr -d ' ')"

  if [ -f "$DENY" ]; then
    hits=$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep ${PATH_MODE:+-H} -I -n -i -E -f <(deny_patterns) 2>/dev/null)
    if [ -n "$hits" ]; then echo "FAIL names: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') line(s)"; printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'; fails=$((fails+1)); else echo "ok   names: 0 hits ($(deny_patterns | wc -l | tr -d ' ') patterns)"; fi
  fi

  hits=$(printf '%s\n' "$files" | tr '\n' '\0' | LC_ALL=C xargs -0 grep ${PATH_MODE:+-H} -I -n -e "$EN" -e "$EM" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL dashes: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') line(s)"; printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'; fails=$((fails+1)); else echo "ok   dashes: 0 hits"; fi

  hits=$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep ${PATH_MODE:+-H} -I -n -E "$HOMEPATH" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL home paths: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') line(s)"; printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'; fails=$((fails+1)); else echo "ok   home paths: 0 hits"; fi
  return $fails
}

scan_history() {
  local dir="$1" log n
  if ! git -C "$dir" rev-parse HEAD >/dev/null 2>&1; then echo "FAIL history: no commits to scan"; return 1; fi
  log=$(git -C "$dir" log --all -p --format='commit %H%nauthor %an <%ae>%ncommitter %cn <%ce>%n%B')
  echo "history commits: $(git -C "$dir" rev-list --all | wc -l | tr -d ' ')"
  local fails=0
  if [ -f "$DENY" ]; then
    n=$(printf '%s\n' "$log" | grep -c -i -E -f <(deny_patterns))
    if [ "$n" -gt 0 ]; then echo "FAIL history names: $n line(s)"; fails=$((fails+1)); else echo "ok   history names: 0 hits"; fi
  fi
  n=$(printf '%s\n' "$log" | LC_ALL=C grep -c -e "$EN" -e "$EM")
  if [ "$n" -gt 0 ]; then echo "FAIL history dashes: $n line(s)"; fails=$((fails+1)); else echo "ok   history dashes: 0 hits"; fi
  n=$(printf '%s\n' "$log" | grep -c -E "$HOMEPATH")
  if [ "$n" -gt 0 ]; then echo "FAIL history home paths: $n line(s)"; fails=$((fails+1)); else echo "ok   history home paths: 0 hits"; fi
  return $fails
}

if [ "${1:-}" = "--self-test" ]; then
  [ -f "$DENY" ] || { echo "SELF-TEST NOT RUN: denylist missing at the configured path"; exit 2; }
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  term=$(deny_patterns | grep -E '^[A-Za-z]+$' | head -1)
  echo "clean file" > "$tmp/clean.txt"
  scan_tree "$tmp" >/dev/null; [ $? -eq 0 ] || { echo "SELF-TEST FAIL: a clean tree did not pass"; exit 1; }
  pass=0
  for bad in "$term" "a${EM}b" "/Us""ers/somebody/x"; do
    rm -f "$tmp"/bad.txt; printf 'x %s x\n' "$bad" > "$tmp/bad.txt"
    scan_tree "$tmp" >/dev/null; [ $? -gt 0 ] && pass=$((pass+1))
  done
  [ $pass -eq 3 ] && { echo "self-test passed: clean tree passes; names, dashes, and home paths each fail"; exit 0; }
  echo "SELF-TEST FAIL: only $pass of 3 bad inputs were caught"; exit 1
fi

if [ "${1:-}" = "--path" ]; then
  target="${2:-}"
  if [ -z "$target" ] || [ ! -d "$target" ]; then echo "scrub-check: NOT RUN: --path needs an existing directory"; exit 2; fi
  target="$(cd "$target" && pwd)"
  # PATH_MODE: list every file (not only what git tracks), and make grep print the file name even when the folder
  # holds one file; without -H a lone file's hits print as line:text, and cut would show the matched text.
  PATH_MODE=1
  if [ ! -f "$DENY" ]; then echo "NAME SCAN NOT RUN: no denylist at the configured path (set SKILLGATE_DENYLIST)"; fi
  scan_tree "$target"; total=$?
  if [ $total -gt 0 ]; then echo "scrub-check: FAIL ($total scan(s) failed)"; exit 1; fi
  if [ ! -f "$DENY" ]; then echo "scrub-check: INCOMPLETE (dashes and paths clean; names not scanned)"; exit 2; fi
  echo "scrub-check: PASS"; exit 0
fi

total=0
if [ ! -f "$DENY" ]; then echo "NAME SCAN NOT RUN: no denylist at the configured path (set SKILLGATE_DENYLIST)"; fi
scan_tree "$root"; total=$((total+$?))
if [ "${1:-}" = "--history" ]; then scan_history "$root"; total=$((total+$?)); fi
if [ $total -gt 0 ]; then echo "scrub-check: FAIL ($total scan(s) failed)"; exit 1; fi
if [ ! -f "$DENY" ]; then echo "scrub-check: INCOMPLETE (dashes and paths clean; names not scanned)"; exit 2; fi
echo "scrub-check: PASS"
