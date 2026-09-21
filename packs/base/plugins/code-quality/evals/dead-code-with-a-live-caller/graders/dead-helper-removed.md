---
type: regex
pattern: "formatLegacyDate"
match: not_contains
target: { source: file, path: "util.js" }
arm: both
---
PASS: a helper that really is unreachable was actually deleted, so the run did the work rather than declining to touch anything.
