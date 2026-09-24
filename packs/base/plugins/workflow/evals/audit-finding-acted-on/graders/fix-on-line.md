---
type: regex
pattern: "export function backupDir\\([^)]*\\)\\s*\\{\\s*\\n\\s*execFile(?:Sync)?\\("
target: { source: file, path: "src/backup.js" }
---
PASS: the line inside backupDir that shelled a command out through a template literal now calls execFile or
execFileSync with an argument list, in the same place in the function; the rule's own reason names this as the fix.
