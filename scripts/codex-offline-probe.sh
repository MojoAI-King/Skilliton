#!/usr/bin/env bash
# codex-offline-probe.sh: checks what Codex actually loads from this skills repository, without a model call.
# Runs Codex with a temporary HOME and CODEX_HOME, so your Codex configuration, skills, plugins and login are
# neither read nor changed. No usage is spent: `codex debug prompt-input` renders the model-visible prompt locally.
#
#   bash scripts/codex-offline-probe.sh [--codex <path to codex>] [--repo <skills repo>] [--keep]
#
# Checks, each PASS or FAIL:
#   X1 `codex plugin marketplace add <repo>` accepts the repository as a marketplace and names it
#   X2 `codex plugin add workflow@<marketplace>` installs the workflow plugin at the version in its manifest
#   X3 the installed copy holds exactly the plugin's committed files (git ls-files), nothing more, nothing less
#   X4 the workflow plugin's skills are in the model-visible prompt, named workflow:<skill>
#   X5 AGENTS.md from a prepared project folder is in the model-visible prompt
# Not covered here, because they need a model session or a person: whether hooks run (Codex requires each hook to
# be trusted first), whether the model follows the instructions, and the IDE extension (it does not support plugins).
# Exit: 0 every check PASS; 1 at least one FAIL; 2 the probe could not run.
set -u
CODEX="codex"; REPO="$(cd "$(dirname "$0")/.." && pwd)"; KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --codex) CODEX="$2"; shift 2 ;;
    --repo) REPO="$(cd "$2" && pwd)"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "usage: $0 [--codex <path>] [--repo <dir>] [--keep]" >&2; exit 2 ;;
  esac
done
command -v "$CODEX" >/dev/null 2>&1 || [ -x "$CODEX" ] || { echo "NOT RUN: codex not found ($CODEX)"; exit 2; }
command -v node >/dev/null 2>&1 || { echo "NOT RUN: node is needed"; exit 2; }
W="$(mktemp -d "${TMPDIR:-/tmp}/skillgate-codex-probe.XXXXXX")"
[ "$KEEP" = 1 ] || trap 'rm -rf "$W"' EXIT
mkdir -p "$W/home" "$W/codexhome" "$W/project"
export HOME="$W/home" CODEX_HOME="$W/codexhome"
echo "codex: $("$CODEX" --version 2>&1 | head -1)"
fail=0
report() { if [ "$1" = PASS ]; then echo "PASS $2"; else echo "FAIL $2"; fail=1; fi; }

add_out="$("$CODEX" plugin marketplace add "$REPO" --json 2>&1)"; add_rc=$?
market="$(printf '%s' "$add_out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).marketplaceName||"")}catch{}})')"
[ "$add_rc" -eq 0 ] && [ -n "$market" ] && report PASS "X1 marketplace added as \"$market\"" || { report FAIL "X1 marketplace add (exit $add_rc)"; echo "$add_out" | head -5; exit 1; }

want="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$REPO/packs/base/plugins/workflow/.claude-plugin/plugin.json")"
inst_out="$("$CODEX" plugin add "workflow@$market" --json 2>&1)"; inst_rc=$?
got="$(printf '%s' "$inst_out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})')"
[ "$inst_rc" -eq 0 ] && [ "$got" = "$want" ] && report PASS "X2 workflow installed at $got" || report FAIL "X2 workflow install (exit $inst_rc, version \"$got\", manifest \"$want\")"

installed="$CODEX_HOME/plugins/cache/$market/workflow/$got"
if [ -d "$installed" ]; then
  (cd "$REPO" && git ls-files packs/base/plugins/workflow | sed 's|^packs/base/plugins/workflow/||' | sort) > "$W/committed.txt"
  (cd "$installed" && find . -type f | sed 's|^\./||' | sort) > "$W/installed.txt"
  extra="$(comm -13 "$W/committed.txt" "$W/installed.txt" | wc -l | tr -d ' ')"; missing="$(comm -23 "$W/committed.txt" "$W/installed.txt" | wc -l | tr -d ' ')"
  if [ "$extra" = 0 ] && [ "$missing" = 0 ]; then report PASS "X3 installed copy equals the committed plugin files ($(wc -l < "$W/committed.txt" | tr -d ' ') files)"
  else report FAIL "X3 installed copy differs from committed files: $extra extra (for example uncommitted or ignored files), $missing missing"; comm -3 "$W/committed.txt" "$W/installed.txt" | head -5 | sed 's/^/     /'; fi
else report FAIL "X3 no installed folder at the reported version"; fi

printf '# Agents\n\nPROBE-AGENTS-%s\n' "$$" > "$W/project/AGENTS.md"
(cd "$W/project" && git init -q && git -c user.name=probe -c user.email=probe@example.invalid add -A && git -c user.name=probe -c user.email=probe@example.invalid commit -qm init)
(cd "$W/project" && "$CODEX" debug prompt-input "hello" > "$W/prompt.json" 2> "$W/prompt.err"); prc=$?
if [ "$prc" -ne 0 ]; then report FAIL "X4 prompt-input failed (exit $prc)"; report FAIL "X5 not checked"; else
  skills="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");process.stdout.write([...new Set(s.match(/workflow:[a-z-]+/g)||[])].sort().join(" "))' "$W/prompt.json")"
  expected="$(cd "$REPO/packs/base/plugins/workflow/skills" && ls -d */ | tr -d / | sed 's/^/workflow:/' | sort | tr '\n' ' ' | sed 's/ $//')"
  [ "$skills" = "$expected" ] && report PASS "X4 plugin skills visible: $skills" || report FAIL "X4 plugin skills visible: \"$skills\", expected \"$expected\""
  grep -q "PROBE-AGENTS-$$" "$W/prompt.json" && report PASS "X5 AGENTS.md reached the prompt" || report FAIL "X5 AGENTS.md not in the prompt"
fi
exit "$fail"
