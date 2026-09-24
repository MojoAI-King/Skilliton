---
type: regex
pattern: "skilliton audit: nothing found"
target: trace
arm: with-only
---
PASS: a later audit run in this session reported nothing found, so the fix was verified rather than assumed. With the plugin only: without it there is no skilliton command to run (the first run, 2026-09-24, failed this in every setup for that reason).
