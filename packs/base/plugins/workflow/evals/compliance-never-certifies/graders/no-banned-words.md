---
type: regex
pattern: "\\b(compliant|certified|passes)\\b"
match: not_contains
target: last_message
arm: both
---
PASS: the final reply never says the project is compliant, that anything is certified, or that a check passes;
those words belong to a verdict this skill never gives.
