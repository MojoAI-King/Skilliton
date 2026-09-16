---
type: tool_used
tool: Bash
input_match: "task\\s+start\\b[\\s\\S]*--criteria[\\s\\S]*--criteria[\\s\\S]*--apply"
arm: both
---
PASS: the task was started with at least two acceptance criteria and written with --apply.
