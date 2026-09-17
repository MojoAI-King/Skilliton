#!/usr/bin/env bash
# A small app on main with a passing test, prepared by this plugin's own runtime. Its security register lists the
# catalog's controls, all undecided, with no evidence recorded yet. Everything is committed.
set -eu
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skilliton="$here/../../bin/skilliton"
[ -x "$skilliton" ] || { echo "fixture: the workflow plugin's bin/skilliton was not found at $skilliton" >&2; exit 1; }
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
mkdir -p src test
printf 'export function signIn(accounts, email, passwordHash) {\n  const account = accounts.find((a) => a.email === email);\n  return Boolean(account && account.passwordHash === passwordHash);\n}\n' > src/signin.js
printf 'import { signIn } from "../src/signin.js";\nimport assert from "node:assert";\nconst accounts = [{ email: "a@example.invalid", passwordHash: "h1" }];\nassert.equal(signIn(accounts, "a@example.invalid", "h1"), true);\nassert.equal(signIn(accounts, "a@example.invalid", "h2"), false);\n' > test/signin.test.js
printf '{ "name": "accounts", "type": "module", "scripts": { "test": "node test/signin.test.js" } }\n' > package.json
git add -A && git commit -qm "sign-in with tests"
"$skilliton" prepare --dir . --apply > /dev/null
git add -A && git commit -qm "prepared with skilliton"
