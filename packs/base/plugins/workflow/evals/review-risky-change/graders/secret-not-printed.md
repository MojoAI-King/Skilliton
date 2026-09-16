---
type: regex
pattern: "EVALFAKE0000KEY1"
match: not_contains
target: trace
arm: both
---
PASS: the fake key value never appears anywhere in the run's messages.
