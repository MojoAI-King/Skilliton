#!/usr/bin/env bash
# Config drift check: does the settings file say what is actually running?
# The originating investigation found settings.json declaring one model while
# transcripts recorded another, and two different Claude Code versions in play.
# This script reports the facts side by side. It decides nothing; it makes drift visible.
#
# Nothing runs it automatically; it is not registered as a hook. Run it by hand when the model or version in
# use looks wrong: bash <context-hygiene plugin>/hooks/config-drift-check.sh
# DRIFT is reported only when settings declare a model and the latest transcript used a different one. No
# declared model means the default applies, so there is nothing to compare. An alias such as opus names a
# family, so it is compared by family name; a context suffix such as [1m] is ignored.

set -u
SETTINGS="${SKILLGATE_SETTINGS:-$HOME/.claude/settings.json}"
PROJECTS="${SKILLGATE_PROJECTS:-$HOME/.claude/projects}"

declared_model="(no settings file)"
if [ -f "$SETTINGS" ]; then
  if ! command -v jq >/dev/null 2>&1; then
    declared_model="(jq is not installed, so the settings were not read)"
  elif ! declared_model=$(jq -r 'if (.model // "") == "" then "(unset)" else .model end' "$SETTINGS" 2>/dev/null); then
    declared_model="(the settings file is not valid JSON)"
  fi
fi

if command -v claude >/dev/null 2>&1; then
  cli_version=$(claude --version 2>/dev/null | head -1)
  [ -n "$cli_version" ] || cli_version="(claude --version printed nothing)"
else
  cli_version="(claude not on PATH)"
fi

# most recent transcript's model and version, if transcripts exist
latest=$(ls -t "$PROJECTS"/*/*.jsonl 2>/dev/null | head -1)
observed_model="(no transcripts found)"; observed_version="(no transcripts found)"
if [ -n "$latest" ]; then
  observed_model=$(grep -o '"model":"[^"]*"' "$latest" | tail -1 | cut -d'"' -f4)
  observed_version=$(grep -o '"version":"[^"]*"' "$latest" | tail -1 | cut -d'"' -f4)
  [ -z "$observed_model" ] && observed_model="(field not found in transcript)"
  [ -z "$observed_version" ] && observed_version="(field not found in transcript)"
fi

base() { printf '%s' "$1" | sed -E 's/\[[^]]*\]$//'; }
declared=$(base "$declared_model"); observed=$(base "$observed_model")
case "$declared" in
  "("*|default) verdict="no model is declared, so the default applies and there is nothing to compare" ;;
  *)
    case "$observed" in
      "("*) verdict="no model was found in a transcript, so there is nothing to compare" ;;
      claude-*|*-*)
        case "$declared" in
          claude-*)
            if [ "$declared" = "$observed" ]; then verdict="declared and observed models match"
            else verdict="DRIFT: declared model != observed model"; fi ;;
          opusplan)
            if printf '%s' "$observed" | grep -qiE 'opus|sonnet'; then verdict="the observed model is one opusplan uses"
            else verdict="DRIFT: the observed model is not one opusplan uses"; fi ;;
          *)
            if printf '%s' "$observed" | grep -qiF -- "$declared"; then verdict="the observed model is in the declared family ($declared)"
            else verdict="DRIFT: the observed model is not in the declared family ($declared)"; fi ;;
        esac ;;
      *) if [ "$declared" = "$observed" ]; then verdict="declared and observed models match"
         else verdict="DRIFT: declared model != observed model"; fi ;;
    esac ;;
esac

echo "declared model (settings): $declared_model"
echo "observed model (latest transcript): $observed_model"
echo "cli version (shell): $cli_version"
echo "observed version (latest transcript): $observed_version"
echo "$verdict"
