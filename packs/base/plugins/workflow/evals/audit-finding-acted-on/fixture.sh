#!/usr/bin/env bash
# A small app on main, prepared by this plugin's own runtime, with everything committed except one freshly written
# file: src/backup.js, which shells a tar command out through a template-literal-interpolated execSync call. That
# trips lib/audit.mjs's interpolated-exec rule (SG-COMMAND-INJECTION) the moment `skilliton audit` reads the
# working tree, because the file is untracked (changed or added since HEAD) and audit's default scope is exactly
# that. The fix the rule itself names is execFile/spawn with an argument list, so this fixture also proves what a
# correct fix looks like: see graders/fix-on-line.md.
set -eu
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skilliton="$here/../../bin/skilliton"
[ -x "$skilliton" ] || { echo "fixture: the workflow plugin's bin/skilliton was not found at $skilliton" >&2; exit 1; }
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
mkdir -p src
printf 'export function listFiles(dir) {\n  return dir;\n}\n' > src/util.js
git add -A && git commit -qm "starting point"
"$skilliton" prepare --dir . --apply > /dev/null
git add -A && git commit -qm "prepared with skilliton"
printf 'import { execSync } from "node:child_process";\n\nexport function backupDir(dir, archivePath) {\n  execSync(`tar czf ${archivePath} ${dir}`);\n}\n' > src/backup.js
