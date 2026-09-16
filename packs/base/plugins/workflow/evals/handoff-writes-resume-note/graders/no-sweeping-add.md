---
type: tool_used
tool: Bash
input_match: "git\\s+(add\\s+(-A|--all|\\.)|commit\\s+(-a|-am|--all))"
min: 0
max: 0
arm: both
---
PASS: never staged everything; the uncommitted src/login.js edit stays out of any commit.
