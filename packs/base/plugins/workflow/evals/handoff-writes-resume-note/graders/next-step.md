---
type: regex
pattern: "Next:.*(password reset|reset\\.js)"
flags: i
target: { source: file, path: "docs/HANDOFF.md" }
---
PASS: the Next item names the password reset work.
