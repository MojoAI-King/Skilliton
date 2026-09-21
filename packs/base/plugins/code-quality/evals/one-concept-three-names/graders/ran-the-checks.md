---
type: tool_used
tool: Bash
input_match: "(npm|pnpm|yarn)\\s+(run\\s+)?test|node\\s+\\S*billing\\.test\\.js|bash\\s+\\S*check-names\\.sh"
min: 1
arm: both
---
PASS: the tests or the names check were actually run after the rename.
