#!/usr/bin/env bash
# SessionStart hook: inject exactly one bounded checklist section, nothing more.
#
# This is the corrected form of the awk that caused the injection bug.
# Bug 1:      awk '/^## Heading/{f=1} f'   prints from the heading to END OF FILE.
# Fix 1:      stop at the next "## " heading.
# Bug 2:      an exact match ($0 == h) found nothing when the real heading carries a suffix,
#             e.g. "## The new-app wiring checklist (the shortcuts, condensed)", and the hook
#             then injected an empty line, silently.
# Fix 2:      match the heading as a line PREFIX, and report a missing or empty checklist.
#
# Set SKILLITON_LESSONS to the file and SKILLITON_CHECKLIST_HEADING to the heading text
# (the start of the heading line, without the leading "## "). With SKILLITON_LESSONS unset the hook prints nothing.
# Verified behavior of the awk itself: 102,941 bytes down to 19,233 on the originating file.
# UNVERIFIED and must be tested on your Claude Code version: how SessionStart stdout is
# surfaced to the model. Confirm with a fresh session before relying on it.

set -u
LESSONS="${SKILLITON_LESSONS:-}"
HEADING="${SKILLITON_CHECKLIST_HEADING:-The new-app wiring checklist}"

# Unset is not a fault: the checklist is an optional personal feature, and a line on every session for a feature
# nobody set up reads as an error to a newcomer. Set but unreadable is a fault, and it is reported with the path.
if [ -z "$LESSONS" ]; then
  exit 0
fi
if [ ! -f "$LESSONS" ] || [ ! -r "$LESSONS" ]; then
  echo "[context-hygiene] SKILLITON_LESSONS is set, but ${LESSONS} is not a file this session can read; injecting nothing. (Reported, not silent.)"
  exit 0
fi

CHECKLIST=$(awk -v h="## $HEADING" '
  !f && index($0, h) == 1 { f=1; print; next }
  f && /^## /             { exit }
  f
' "$LESSONS")
AWK_STATUS=$?

if [ "$AWK_STATUS" -ne 0 ]; then
  echo "[context-hygiene] awk exited ${AWK_STATUS} reading SKILLITON_LESSONS; injecting nothing. (Reported, not silent.)"
  exit 0
fi

# Empty means: no heading line matched, or the heading matched but nothing non-blank follows it.
BODY=$(printf "%s\n" "$CHECKLIST" | sed '1d' | tr -d '[:space:]')
if [ -z "$CHECKLIST" ] || [ -z "$BODY" ]; then
  echo "[context-hygiene] checklist heading not found in SKILLITON_LESSONS; injecting nothing. (Reported, not silent.)"
  exit 0
fi

BYTES=$(printf "%s" "$CHECKLIST" | wc -c | tr -d ' ')
if [ "$BYTES" -gt 40000 ]; then
  echo "[context-hygiene] WARNING: checklist is ${BYTES} bytes, larger than expected. Check the heading bound."
fi

printf "%s\n" "$CHECKLIST"
