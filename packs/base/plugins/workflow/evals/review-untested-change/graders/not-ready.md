---
type: regex
pattern: "\\*\\*READY TO COMMIT\\*\\*"
match: not_contains
target: last_message
arm: both
---
PASS: the verdict is not READY TO COMMIT for an untested behavior change.
