#!/usr/bin/env bash
# SessionStart hook (workflow plugin): show the new session where the last one stopped.
#
# Prints a header line, then the "## RESUME HERE" section of the repo's handoff file and
# nothing else from it: from the first line that STARTS WITH "## RESUME HERE" up to the next
# line that starts with "## ". The heading is matched as a line prefix, never exactly: an exact
# match in this repo's other session-start hook found nothing when the real heading carried a
# suffix, and injected an empty line, silently.
#
# Project dir:  $CLAUDE_PROJECT_DIR, else "cwd" from the hook's stdin JSON (read with jq, node,
#               or python3, whichever is found first), else $PWD.
# Config:       .skillgate/config.json, keys handoff.file (default docs/HANDOFF.md, a path
#               inside the repo) and handoff.maxBytes (default 6000). Read only when one of
#               those parsers is installed; a config that cannot be used is reported in a notice.
# Output:       every outcome prints at least one line; a missing file, a missing or empty
#               section, truncation, and an unusable config each have their own notice.
# Exit status:  always 0. A crash prints a notice instead of failing the session start.
# Needs:        bash 3.2 or later (the macOS default). No awk, sed, grep, or coreutils.

set -u
trap 'rc=$?; if [ "$rc" -ne 0 ]; then printf "[workflow] The handoff hook failed (exit %s); open the handoff file by hand.\n" "$rc"; fi; exit 0' EXIT

DEFAULT_FILE="docs/HANDOFF.md"
DEFAULT_MAX=6000
nl=$'\n'
notes=""
note() { notes="${notes}[workflow] $1${nl}"; }

parser=""
for p in jq node python3; do
  command -v "$p" >/dev/null 2>&1 || continue
  # On a Mac without the command line developer tools, /usr/bin/python3 is a stub that asks to
  # install them instead of running Python. Skip it there rather than prompt on every session.
  if [ "$p" = python3 ] && [ "$(command -v python3)" = /usr/bin/python3 ] \
     && [ -x /usr/bin/xcode-select ] && ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
    continue
  fi
  parser=$p
  break
done

# Prints the "cwd" string from the JSON given as $1, or nothing.
stdin_cwd() {
  case "$parser" in
    jq) printf '%s' "$1" | jq -r 'if type == "object" and (.cwd | type) == "string" then .cwd else empty end' 2>/dev/null ;;
    node) printf '%s' "$1" | node -e '
      try { const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
            if (j && typeof j.cwd === "string") process.stdout.write(j.cwd); } catch (e) {}' 2>/dev/null ;;
    python3) printf '%s' "$1" | python3 -c '
import json, sys
try:
    j = json.load(sys.stdin)
    if isinstance(j, dict) and isinstance(j.get("cwd"), str): sys.stdout.write(j["cwd"])
except Exception:
    pass' 2>/dev/null ;;
  esac
}

# Prints two lines, "<type>:<value>" for handoff.file then handoff.maxBytes ("absent:" when
# unset). Exits non-zero when the file is not valid JSON or has an unexpected shape.
config_values() {
  case "$parser" in
    jq) jq -r '
      def tag: if . == null then "absent:"
               elif type == "string" then "string:" + .
               elif type == "number" and . == floor then "number:" + (floor | tostring)
               else type + ":" + tojson end;
      if type != "object" then error("not an object") else . end
      | (if .handoff == null then {} else .handoff end)
      | if type != "object" then error("handoff is not an object") else . end
      | (.file | tag), (.maxBytes | tag)' "$1" 2>/dev/null ;;
    node) node -e '
      const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
      if (!isObj(c)) process.exit(1);
      const h = c.handoff == null ? {} : c.handoff;
      if (!isObj(h)) process.exit(1);
      const tag = v => v == null ? "absent:"
        : typeof v === "string" ? "string:" + v
        : typeof v === "number" && Number.isInteger(v) ? "number:" + String(v)
        : (Array.isArray(v) ? "array" : typeof v) + ":" + JSON.stringify(v);
      process.stdout.write(tag(h.file) + "\n" + tag(h.maxBytes) + "\n");' "$1" 2>/dev/null ;;
    python3) python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    c = json.load(f)
if not isinstance(c, dict): sys.exit(1)
h = c.get("handoff")
if h is None: h = {}
if not isinstance(h, dict): sys.exit(1)
def tag(v):
    if v is None: return "absent:"
    if isinstance(v, str): return "string:" + v
    if isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer():
        return "number:" + str(int(v))
    return type(v).__name__ + ":" + json.dumps(v)
sys.stdout.write(tag(h.get("file")) + "\n" + tag(h.get("maxBytes")) + "\n")' "$1" 2>/dev/null ;;
  esac
}

# 1. Project directory.
project_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$project_dir" ] && [ -n "$parser" ] && [ ! -t 0 ]; then
  input=""
  IFS= read -r -t 3 -d '' input || true   # reads to end of input; a non-zero status at EOF is expected
  project_dir=$(stdin_cwd "$input")
fi
[ -n "$project_dir" ] || project_dir=$PWD

# 2. Config.
file=$DEFAULT_FILE
max=$DEFAULT_MAX
config="$project_dir/.skillgate/config.json"
if [ -f "$config" ]; then
  if [ -z "$parser" ]; then
    config_text=$(<"$config")
    case "$config_text" in
      *'"handoff"'*) note ".skillgate/config.json has handoff settings but was not read (no jq, node, or python3 found); using $DEFAULT_FILE and $DEFAULT_MAX bytes." ;;
    esac
  elif values=$(config_values "$config"); then
    file_tag=${values%%"$nl"*}
    max_tag=${values#*"$nl"}
    case "$file_tag" in
      absent:) ;;
      string:/*|string:..|string:../*|string:*/..|string:*/../*)
        note "handoff.file in .skillgate/config.json must be a path inside the repo; using $DEFAULT_FILE." ;;
      string:?*) file=${file_tag#string:} ;;
      *) note "handoff.file in .skillgate/config.json is not a usable path; using $DEFAULT_FILE." ;;
    esac
    case "$max_tag" in
      absent:) ;;
      number:[1-9]|number:[1-9]*[0-9]) max=${max_tag#number:} ;;
      *) note "handoff.maxBytes in .skillgate/config.json is not a positive whole number; using $DEFAULT_MAX." ;;
    esac
    case "$max" in
      *[!0-9]*|??????????*)   # not digits only, or ten digits or more: too large to compare safely
        max=$DEFAULT_MAX
        note "handoff.maxBytes in .skillgate/config.json is not a positive whole number; using $DEFAULT_MAX." ;;
    esac
  else
    note ".skillgate/config.json could not be read as JSON with a handoff object ($parser); using $DEFAULT_FILE and $DEFAULT_MAX bytes."
  fi
fi

# 3. The handoff file.
path="$project_dir/$file"
if [ ! -f "$path" ]; then
  printf '%s\n' "[workflow] No handoff yet in this repo. When you finish a stretch of work, run /workflow:handoff so the next session can pick up."
  printf '%s' "$notes"
  exit 0
fi
if [ ! -r "$path" ]; then
  printf '%s\n' "[workflow] $file exists but cannot be read (check its permissions)."
  printf '%s' "$notes"
  exit 0
fi

# 4. Extract the section. Byte semantics from here on, so maxBytes means bytes.
LC_ALL=C
found=0
truncated=0
section=""
while IFS= read -r line || [ -n "$line" ]; do
  if [ "$found" -eq 0 ]; then
    case "$line" in
      "## RESUME HERE"*) found=1; section="$line$nl" ;;
    esac
    continue
  fi
  case "$line" in
    "## "*) break ;;
  esac
  section="$section$line$nl"
  if [ "${#section}" -gt "$max" ]; then truncated=1; break; fi
done < "$path"

if [ "$found" -eq 0 ]; then
  printf '%s\n' "[workflow] $file has no \"## RESUME HERE\" section; run /workflow:handoff to write one."
  printf '%s' "$notes"
  exit 0
fi

if [ "$truncated" -eq 0 ]; then
  body=${section#*"$nl"}
  case "$body" in
    *[![:space:]]*) ;;
    *)
      printf '%s\n' "[workflow] $file has an empty \"## RESUME HERE\" section; run /workflow:handoff to write one."
      printf '%s' "$notes"
      exit 0 ;;
  esac
else
  section=${section:0:$max}
  case "$section" in
    *"$nl"*) section=${section%"$nl"*} ;;   # keep whole lines only
  esac
fi

# Drop trailing blank lines; print exactly one newline after the section.
while :; do
  case "$section" in
    *"$nl") section=${section%"$nl"} ;;
    *) break ;;
  esac
done

printf '%s\n' "[workflow] Handoff from $file:"
printf '%s\n' "$section"
if [ "$truncated" -eq 1 ]; then
  printf '%s\n' "[truncated at $max bytes; open the file for the rest]"
fi
printf '%s' "$notes"
exit 0
