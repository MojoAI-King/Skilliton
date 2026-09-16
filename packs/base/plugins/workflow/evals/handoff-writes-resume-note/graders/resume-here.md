---
type: regex
pattern: "^## RESUME HERE"
flags: m
target: { source: file, path: "docs/HANDOFF.md" }
---
PASS: docs/HANDOFF.md has a RESUME HERE section heading.
