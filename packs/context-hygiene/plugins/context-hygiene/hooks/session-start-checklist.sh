#!/usr/bin/env bash
# SessionStart hook: inject exactly one bounded checklist section, nothing more.
#
# This is the corrected form of the awk that caused the injection bug.
# The bug:    awk '/^## Heading/{f=1} f'          prints from the heading to END OF FILE
# The fix:    stop at the next "## " heading.
#
# Set SKILLGATE_LESSONS to the file and SKILLGATE_CHECKLIST_HEADING to the exact heading text.
# Verified behavior of the awk itself: 102,941 bytes down to 19,233 on the originating file.
# UNVERIFIED and must be tested on your Claude Code version: how SessionStart stdout is
# surfaced to the model. Confirm with a fresh session before relying on it.

set -u
LESSONS="${SKILLGATE_LESSONS:-}"
HEADING="${SKILLGATE_CHECKLIST_HEADING:-The new-app wiring checklist}"

if [ -z "$LESSONS" ] || [ ! -f "$LESSONS" ]; then
  echo "[context-hygiene] SKILLGATE_LESSONS not set or file missing; injecting nothing. (Reported, not silent.)"
  exit 0
fi

CHECKLIST=$(awk -v h="## $HEADING" '
  $0 == h { f=1; print; next }
  /^## /  { if (f) exit }
  f
' "$LESSONS")

BYTES=$(printf "%s" "$CHECKLIST" | wc -c | tr -d ' ')
if [ "$BYTES" -gt 40000 ]; then
  echo "[context-hygiene] WARNING: checklist is ${BYTES} bytes, larger than expected. Check the heading bound."
fi

printf "%s\n" "$CHECKLIST"
