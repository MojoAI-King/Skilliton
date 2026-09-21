---
type: regex
pattern: "function slugify"
match: not_contains
target: { source: file, path: "util.js" }
arm: both
---
PASS: the second unreachable helper was deleted too.
