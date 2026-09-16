#!/usr/bin/env bash
# Config drift check: does the settings file say what is actually running?
# The originating investigation found settings.json declaring one model while
# transcripts recorded another, and two different Claude Code versions in play.
# This script reports the three facts side by side. It decides nothing; it makes drift visible.

set -u
SETTINGS="${SKILLGATE_SETTINGS:-$HOME/.claude/settings.json}"
PROJECTS="${SKILLGATE_PROJECTS:-$HOME/.claude/projects}"

declared_model="(no settings file)"
[ -f "$SETTINGS" ] && declared_model=$(jq -r '.model // "(unset)"' "$SETTINGS" 2>/dev/null)

cli_version=$(claude --version 2>/dev/null | head -1 || echo "(claude not on PATH)")

# most recent transcript's model and version, if transcripts exist
latest=$(ls -t "$PROJECTS"/*/*.jsonl 2>/dev/null | head -1)
observed_model="(no transcripts found)"; observed_version="(no transcripts found)"
if [ -n "$latest" ]; then
  observed_model=$(grep -o '"model":"[^"]*"' "$latest" | tail -1 | cut -d'"' -f4)
  observed_version=$(grep -o '"version":"[^"]*"' "$latest" | tail -1 | cut -d'"' -f4)
  [ -z "$observed_model" ] && observed_model="(field not found in transcript)"
  [ -z "$observed_version" ] && observed_version="(field not found in transcript)"
fi

echo "declared model (settings): $declared_model"
echo "observed model (latest transcript): $observed_model"
echo "cli version (shell): $cli_version"
echo "observed version (latest transcript): $observed_version"
if [ "$declared_model" != "$observed_model" ]; then echo "DRIFT: declared model != observed model"; fi
