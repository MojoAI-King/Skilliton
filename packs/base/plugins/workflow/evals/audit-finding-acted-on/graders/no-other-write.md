---
type: tool_used
tool: Write
input_match: "\"file_path\"\\s*:\\s*\"(?!(?:[^\"]*/)?src/backup\\.js\")[^\"]*\""
min: 0
max: 0
arm: both
---
PASS: every Write call touched src/backup.js, the file the finding named, and nothing else.
