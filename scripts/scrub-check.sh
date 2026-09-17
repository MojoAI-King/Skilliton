#!/usr/bin/env bash
# scrub-check.sh: public-safety gate. Run before every commit and before every push.
#
# Fails (exit 1) on any of:
#   1. a denylisted name (client, evaluator, or person) in the tree or, with --history, in git history
#   2. an em dash or en dash in any tracked text file
#   3. an absolute home-directory path (macOS or Linux style)
#
# The denylist is NOT in this repo, because a list of names to keep out of the repo is itself
# a list of names. It lives at $SKILLITON_DENYLIST (default ~/.config/skilliton/denylist),
# one case-insensitive extended regex per line, # for comments.
# If the denylist is missing, the name scan did not run, and this script says so and exits 2.
# A check that cannot run is never reported as a check that found nothing.
#
#   bash scripts/scrub-check.sh              tree only
#   bash scripts/scrub-check.sh --history    tree plus every commit the checked-out branch reaches (diffs, messages,
#                                            author fields): what pushing this branch publishes
#   bash scripts/scrub-check.sh --history-all tree plus every commit on every ref, including other sessions'
#                                            unpushed branches and fetched remote branches (CI uses this)
#   bash scripts/scrub-check.sh --self-test  positive control: proves each scan can fail
#   bash scripts/scrub-check.sh --path <dir> one directory instead of the repo: every regular file under it,
#                                            tracked by git or not (skipping .git/ and .DS_Store), because it is
#                                            meant for material about to be copied in. Same scans, same exit codes.

set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
DENY="${SKILLITON_DENYLIST:-$HOME/.config/skilliton/denylist}"
# Before the rename to Skilliton the default was ~/.config/skillgate/denylist. That file is not read; it is named, so a
# name scan that did not run is never mistaken for one that found nothing.
LEGACY_DENY="$HOME/.config/skillgate/denylist"
deny_missing() {
  echo "NAME SCAN NOT RUN: no denylist at the configured path (set SKILLITON_DENYLIST)"
  if [ -z "${SKILLITON_DENYLIST:-}" ] && [ -f "$LEGACY_DENY" ]; then
    echo "  A denylist exists at the earlier default, ~/.config/skillgate/denylist, which is no longer read. Move it: mkdir -p ~/.config/skilliton && mv ~/.config/skillgate/denylist ~/.config/skilliton/denylist"
  fi
}
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
    hits=$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -H -I -n -i -E -f <(deny_patterns) 2>/dev/null)
    if [ -n "$hits" ]; then echo "FAIL names: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') line(s)"; printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'; fails=$((fails+1)); else echo "ok   names: 0 hits ($(deny_patterns | wc -l | tr -d ' ') patterns)"; fi
  fi

  hits=$(printf '%s\n' "$files" | tr '\n' '\0' | LC_ALL=C xargs -0 grep -H -I -n -e "$EN" -e "$EM" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL dashes: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') line(s)"; printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'; fails=$((fails+1)); else echo "ok   dashes: 0 hits"; fi

  hits=$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -H -I -n -E "$HOMEPATH" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL home paths: $(printf '%s\n' "$hits" | wc -l | tr -d ' ') line(s)"; printf '%s\n' "$hits" | cut -d: -f1,2 | sed 's/^/  /'; fails=$((fails+1)); else echo "ok   home paths: 0 hits"; fi
  return $fails
}

# scan_history <dir> <head|all>: the commits HEAD reaches, or the commits every ref reaches
scan_history() {
  local dir="$1" scope="$2" log n rev label
  if ! git -C "$dir" rev-parse HEAD >/dev/null 2>&1; then echo "FAIL history: no commits to scan"; return 1; fi
  if [ "$scope" = all ]; then rev=--all; label="every ref"; else rev=HEAD; label="HEAD ($(git -C "$dir" rev-parse --abbrev-ref HEAD))"; fi
  log=$(git -C "$dir" log "$rev" -p --format='commit %H%nauthor %an <%ae>%ncommitter %cn <%ce>%n%B')
  echo "history commits: $(git -C "$dir" rev-list "$rev" | wc -l | tr -d ' ') reachable from $label"
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
  [ $pass -eq 3 ] || { echo "SELF-TEST FAIL: only $pass of 3 bad inputs were caught"; exit 1; }
  # History scope: a dash committed only on another branch passes --history on a clean main and fails --history-all.
  repo="$tmp/repo"; mkdir -p "$repo/scripts"; cp "$here/scrub-check.sh" "$repo/scripts/scrub-check.sh"
  g() { git -C "$repo" -c user.name=selftest -c user.email=selftest@example.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@" >/dev/null 2>&1; }
  if ! { g init -q -b main && g add -A && g commit -q -m clean && g switch -q -c side \
    && printf 'x %s x\n' "a${EM}b" > "$repo/side.txt" && g add side.txt && g commit -q -m side && g switch -q main; }; then
    echo "SELF-TEST NOT RUN: git could not build the history fixture"; exit 2
  fi
  hist=0
  SKILLITON_DENYLIST="$DENY" bash "$repo/scripts/scrub-check.sh" --history >/dev/null 2>&1; [ $? -eq 0 ] && hist=$((hist+1))
  SKILLITON_DENYLIST="$DENY" bash "$repo/scripts/scrub-check.sh" --history-all >/dev/null 2>&1; [ $? -eq 1 ] && hist=$((hist+1))
  [ $hist -eq 2 ] || { echo "SELF-TEST FAIL: history scope: --history must pass a clean branch and --history-all must fail on a dash in another branch"; exit 1; }
  echo "self-test passed: clean tree passes; names, dashes, and home paths each fail; --history reads the branch and --history-all every ref"; exit 0
fi

if [ "${1:-}" = "--path" ]; then
  target="${2:-}"
  if [ -z "$target" ] || [ ! -d "$target" ]; then echo "scrub-check: NOT RUN: --path needs an existing directory"; exit 2; fi
  target="$(cd "$target" && pwd)"
  # PATH_MODE: list every file (not only what git tracks), and make grep print the file name even when the folder
  # holds one file; without -H a lone file's hits print as line:text, and cut would show the matched text.
  PATH_MODE=1
  if [ ! -f "$DENY" ]; then deny_missing; fi
  scan_tree "$target"; total=$?
  if [ $total -gt 0 ]; then echo "scrub-check: FAIL ($total scan(s) failed)"; exit 1; fi
  if [ ! -f "$DENY" ]; then echo "scrub-check: INCOMPLETE (dashes and paths clean; names not scanned)"; exit 2; fi
  echo "scrub-check: PASS"; exit 0
fi

total=0
if [ ! -f "$DENY" ]; then deny_missing; fi
scan_tree "$root"; total=$((total+$?))
if [ "${1:-}" = "--history" ]; then scan_history "$root" head; total=$((total+$?)); fi
if [ "${1:-}" = "--history-all" ]; then scan_history "$root" all; total=$((total+$?)); fi
if [ $total -gt 0 ]; then echo "scrub-check: FAIL ($total scan(s) failed)"; exit 1; fi
if [ ! -f "$DENY" ]; then echo "scrub-check: INCOMPLETE (dashes and paths clean; names not scanned)"; exit 2; fi
echo "scrub-check: PASS"
