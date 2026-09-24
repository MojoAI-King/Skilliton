---
type: regex
pattern: "skilliton-audit:\\s*allow"
match: not_contains
target: { source: file, path: "src/backup.js" }
---
PASS: the finding was fixed, not silenced with an allow marker that would make the audit clean without changing the risk.
