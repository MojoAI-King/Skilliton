#!/usr/bin/env bash
# Offline proof that this eval case's fixture and graders are sound, without a model and without `claude plugin
# eval` (both main-only, and the second one paid). It builds the fixture, confirms `skilliton audit` finds the
# planted interpolated-exec line at the path and line the graders expect, applies the fix the graders expect,
# confirms the audit goes clean, and runs the fix-on-line and no-allow-marker grader patterns (copied from their
# grader files, so a change to one is a change to both) against the flawed and the fixed file to prove they
# discriminate rather than always passing or always failing.
#
#   bash packs/base/plugins/workflow/evals/audit-finding-acted-on/self-check.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skilliton="$here/../../bin/skilliton"
[ -x "$skilliton" ] || { echo "self-check: the workflow plugin's bin/skilliton was not found at $skilliton" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/repo"
cd "$work/repo"
bash "$here/fixture.sh"

echo "1. the fixture builds and the planted flaw trips the audit at the expected path and line"
out="$("$skilliton" audit --dir . || true)"
echo "$out"
echo "$out" | grep -qF "1 finding(s) to act on" || { echo "self-check FAILED: expected exactly one finding, got:" >&2; echo "$out" >&2; exit 1; }
echo "$out" | grep -qF "src/backup.js:4: interpolated-exec (SG-COMMAND-INJECTION)" || { echo "self-check FAILED: expected the finding at src/backup.js:4" >&2; exit 1; }

echo "2. fix-on-line does not match the unfixed file (it must discriminate, not always pass)"
node "$here/check-fix-pattern.mjs" src/backup.js not-match

echo "3. applying the fix the graders expect"
printf 'import { execFileSync } from "node:child_process";\n\nexport function backupDir(dir, archivePath) {\n  execFileSync("tar", ["czf", archivePath, dir]);\n}\n' > src/backup.js

echo "4. fix-on-line matches the fixed file"
node "$here/check-fix-pattern.mjs" src/backup.js match

echo "5. no-allow-marker does not fire on the fixed file (the fix is real, not a silenced check)"
if grep -qF "skilliton-audit: allow" src/backup.js; then echo "self-check FAILED: an allow marker is present" >&2; exit 1; fi

echo "6. the audit is clean after the fix"
out2="$("$skilliton" audit --dir . || true)"
echo "$out2"
echo "$out2" | grep -qF "skilliton audit: nothing found" || { echo "self-check FAILED: audit is not clean after the fix, got:" >&2; echo "$out2" >&2; exit 1; }

echo
echo "self-check passed: the fixture trips the rule at the expected path/line, the expected fix clears it, and the"
echo "fix-on-line and no-allow-marker patterns discriminate between the flawed and the fixed file."
