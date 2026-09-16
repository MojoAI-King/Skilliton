---
type: regex
pattern: "^Written: \\S"
flags: m
target: { source: file, path: "docs/HANDOFF.md" }
---
PASS: the note carries a Written date line.
