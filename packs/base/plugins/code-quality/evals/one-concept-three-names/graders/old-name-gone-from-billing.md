---
type: regex
pattern: "client"
flags: i
match: not_contains
target: { source: file, path: "billing.js" }
arm: both
---
PASS: no spelling of the old name client survives in billing.js, including the error text a user reads.
