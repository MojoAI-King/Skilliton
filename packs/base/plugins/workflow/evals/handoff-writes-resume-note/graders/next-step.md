---
type: regex
pattern: "Next:\\*\\*(?:(?!\\*\\*Blocked)[\\s\\S]){0,800}(password reset|reset\\.js)"
flags: i
target: { source: file, path: "docs/HANDOFF.md" }
---
PASS: the Next item, including any list under it and stopping at Blocked, names the password reset work.
