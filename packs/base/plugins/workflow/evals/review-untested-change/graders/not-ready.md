---
type: regex
pattern: "READY TO COMMIT"
match: not_contains
target: last_message
arm: both
---
PASS: the review does not call untested changes ready to commit.
