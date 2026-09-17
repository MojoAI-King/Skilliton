#!/usr/bin/env bash
# session-start-guardrails.sh: SessionStart hook for the guardrails plugin.
#
# Prints one line into the new session's context: the guardrails are on (and which rules),
# OFF for this session (SKILLITON_GUARDRAILS=off), or unable to check anything (no JSON reader).
# A second line appears only when .skilliton/config.json exists but cannot be read.
#
# The line comes from guard-bash.sh --session-start, so the status and the checks share one
# parser lookup and one settings reader and cannot disagree. If that call fails or prints
# nothing, this script says so instead of staying silent. Exit status: always 0.

here="$(cd "$(dirname "$0")" && pwd)"
out=$(bash "$here/guard-bash.sh" --session-start 2>/dev/null)
rc=$?
if [ "$rc" -ne 0 ] || [ -z "$out" ]; then
  echo "[guardrails] the status check did not run (exit $rc), so the guardrails may not be working in this session. Check that hooks/guard-bash.sh is present in the guardrails plugin."
  exit 0
fi
printf '%s\n' "$out"
exit 0
