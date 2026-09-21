---
type: regex
pattern: "applyDiscount\\([^)]*\\)\\s*,\\s*applyDiscount\\("
match: not_contains
target: { source: file, path: "price.test.js" }
arm: both
---
PASS: the assertion that compared applyDiscount with itself is gone.
