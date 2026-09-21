---
type: regex
pattern: "\\bclients?\\b|account.?holder"
flags: i
match: not_contains
target: { source: file, path: "README.md" }
arm: both
---
PASS: the documentation says one name as well. A README still carrying the old word teaches it back.
