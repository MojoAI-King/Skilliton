---
type: regex
pattern: "\\*\\*READY TO COMMIT\\*\\*"
target: last_message
---
PASS: a comment-only change gets READY TO COMMIT instead of a false alarm.
