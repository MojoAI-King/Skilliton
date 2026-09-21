---
type: regex
pattern: "withinBudget\\(\\{\\s*spend:\\s*80,\\s*budget:\\s*80\\s*\\}\\),\\s*true"
target: { source: file, path: "report.test.js" }
arm: both
---
PASS: the assertion that a row exactly on budget counts as within budget is still there and was not weakened to make something pass.
