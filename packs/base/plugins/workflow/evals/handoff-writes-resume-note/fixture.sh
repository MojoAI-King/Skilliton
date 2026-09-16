#!/usr/bin/env bash
# A repo mid-task: one commit, one uncommitted edit that must NOT be swept into the handoff commit.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
mkdir -p src
printf 'export function validateEmail(s) { return s.includes("@"); }\n' > src/login.js
git add -A && git commit -qm "login form"
printf 'export function validateEmail(s) { return /^[^@\\s]+@[^@\\s]+$/.test(s); }\n' > src/login.js
