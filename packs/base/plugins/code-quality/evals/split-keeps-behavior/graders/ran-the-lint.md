---
type: tool_used
tool: Bash
input_match: "(npm|pnpm|yarn)\\s+run\\s+lint|node\\s+\\S*lint\\.js"
min: 1
arm: both
---
PASS: the lint that was failing was run again, so the fix was checked rather than assumed.
