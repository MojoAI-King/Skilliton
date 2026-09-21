---
type: regex
pattern: "assert\\.(?:strict)?equal\\(\\s*(?:applyDiscount|addTax|lineTotal)\\([^)]*\\)\\s*,\\s*-?[0-9]"
target: { source: file, path: "price.test.js" }
arm: both
---
PASS: at least one assertion compares a result with a number written independently in the test, so changing the arithmetic makes the test fail.
