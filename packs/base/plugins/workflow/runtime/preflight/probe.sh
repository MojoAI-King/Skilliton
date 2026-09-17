#!/usr/bin/env bash
# probe.sh: does this machine let a Skilliton hook start the programs it needs?
#
# `skilliton preflight` runs this script BY ITS PATH inside the installed plugin, which is how Claude Code runs every
# hook (a shell runs a script from the plugin cache, and that script starts git, awk, jq and the rest). So a policy
# that stops scripts running from the plugin folder, or stops bash starting one of these programs, shows up here the
# same way it would show up in a session, instead of as a silent missing hook.
#
#   probe.sh <program> [<program> ...]
#
# One line per program, in the order given:
#   <name>|<state>|<exit>|<path>|<detail>
#
#   found    the program started; <exit> is what it returned for --version, which many small programs refuse (that is
#            fine: the question is whether it can run at all)
#   blocked  the shell found it but could not start it: exit 126, or a message saying permission was denied
#   missing  it is not on PATH
#
# It changes nothing: every program is run with --version, with no input, and its output is thrown away. Exit 0 when
# the script itself ran, whatever the programs did; 2 when it was given no program to check.

set -u

# The first line of $1, with the characters this format uses taken out. Shell only: the programs that would do this
# (head, tr, cut) are the ones being checked.
clean() {
  text=${1%%"
"*}
  text=${text//|/ }
  text=${text//	/ }
  printf '%s' "${text:0:300}"
}

[ "$#" -gt 0 ] || { echo "probe.sh needs at least one program name" >&2; exit 2; }

for name in "$@"; do
  case "$name" in
    *[!A-Za-z0-9._/-]*|"") printf '%s|missing|||a program name may hold only letters, digits, dot, dash, underscore and slash\n' "$name"; continue ;;
  esac
  path=$(command -v -- "$name" 2>/dev/null) || path=""
  if [ -z "$path" ]; then
    printf '%s|missing|||not found on PATH\n' "$name"
    continue
  fi
  out=$("$path" --version 2>/dev/null </dev/null); rc=$?
  err=$("$path" --version 2>&1 >/dev/null </dev/null)
  # One line each, without the separator this format uses. Small programs refuse --version and print their usage; that
  # is not a message worth repeating, so only a version line (exit 0) and a refusal are kept.
  version=$(clean "$out")
  detail=$(clean "$err")
  case "$rc" in
    126) printf '%s|blocked|%s|%s|the shell found it but could not run it: %s\n' "$name" "$rc" "$path" "${detail:-permission denied}" ;;
    127) printf '%s|missing|%s|%s|%s\n' "$name" "$rc" "$path" "${detail:-the shell could not find it when running it}" ;;
    *)
      case "$detail" in
        *"not permitted"*|*"Permission denied"*|*"permission denied"*|*"blocked"*|*"Blocked"*|*"denied by"*)
          printf '%s|blocked|%s|%s|it ran but said: %s\n' "$name" "$rc" "$path" "$detail" ;;
        *) [ "$rc" -eq 0 ] || version=""
           printf '%s|found|%s|%s|%s\n' "$name" "$rc" "$path" "$version" ;;
      esac ;;
  esac
done
exit 0
