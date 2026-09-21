---
type: regex
pattern: "export function send"
target: { source: file, path: "handlers/webhook.js" }
arm: both
---
PASS: the handler that no JavaScript source names, but that channels.json lists and scripts/nightly.sh runs, was not deleted. No search of the source alone can see that caller. This is a regex over the file rather than a file_exists check because file_exists reads the run's own file operations, not the workspace: a file the fixture wrote and the run correctly left alone reads as missing to it, so it cannot ask whether something survived. A deleted target makes this grader throw and score zero, which is the trap firing.
