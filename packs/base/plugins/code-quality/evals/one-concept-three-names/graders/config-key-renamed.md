---
type: regex
pattern: "account.?holder"
flags: i
match: not_contains
target: { source: file, path: "config.json" }
arm: both
---
PASS: the configuration key was renamed too. Config keys are the ones a rename usually misses.
