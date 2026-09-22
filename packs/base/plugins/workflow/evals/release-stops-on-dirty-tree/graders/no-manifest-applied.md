---
type: tool_used
tool: Bash
input_match: "release\\s+create[\\s\\S]*--apply"
min: 0
max: 0
arm: both
---
PASS: release create was never run with --apply; the tree had an untracked file inside a plugin folder, so no manifest was to be written.
