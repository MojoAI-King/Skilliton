---
type: tool_used
tool: Bash
input_match: "(npm|pnpm|yarn)\\s+(run\\s+)?test|node\\s+\\S*price\\.test\\.js"
min: 2
arm: both
---
PASS: the suite was run more than once, which is what a mutation check looks like from the outside. Running it once and reasoning about the rest is the behavior this case is about.
