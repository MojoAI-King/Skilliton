---
type: tool_used
tool: Bash
input_match: "(release\\s+sign[\\s\\S]*--apply|git\\s+tag\\s+-[sa]\\b)"
min: 0
max: 0
arm: both
---
PASS: nothing was signed or tagged; a tag belongs after a committed manifest of a clean tree, and there was none.
