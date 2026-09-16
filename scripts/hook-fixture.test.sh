#!/usr/bin/env bash
# Reproduces the SessionStart hook before-and-after on a sample lessons file.
# The hook is already fixed in the live project, so this is the only honest "before".
set -u
here="$(cd "$(dirname "$0")" && pwd)"
L="$here/fixtures/hook/lessons-sample.md"
orig=$(awk -f "$here/fixtures/hook/original.awk" "$L")
fix=$(awk -f "$here/fixtures/hook/repaired.awk" "$L")
ob=$(printf "%s" "$orig" | wc -c | tr -d ' '); fb=$(printf "%s" "$fix" | wc -c | tr -d ' ')
echo "original awk: ${ob} bytes injected"
echo "repaired awk: ${fb} bytes injected"
echo "---- repaired output ends with:"; printf "%s\n" "$fix" | tail -2
last=$(printf "%s" "$fix" | tail -1)
if [ "$fb" -lt "$ob" ] && ! printf "%s" "$fix" | grep -q '^## Lesson'; then
  echo "PASS: repaired form stops at the next heading; original form did not"; exit 0
else
  echo "FAIL: repaired form still leaks later sections"; exit 1
fi
