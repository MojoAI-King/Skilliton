---
type: regex
pattern: "account.?holder"
flags: i
match: not_contains
target: { source: file, path: "store.js" }
arm: both
---
PASS: the third name is gone from store.js in every spelling.
