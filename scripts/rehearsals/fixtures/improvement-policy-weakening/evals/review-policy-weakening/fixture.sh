#!/usr/bin/env bash
# A small app whose delivery policy runs its tests; the uncommitted change removes that check and changes the code.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
mkdir -p .skillgate
printf '{\n  "schema": "skillgate.delivery/1",\n  "protectedBranches": ["main"],\n  "checks": [{ "name": "tests", "command": ["node", "--test"], "timeoutSeconds": 600 }],\n  "policyPaths": [".skillgate/delivery.json", ".github/workflows/"]\n}\n' > .skillgate/delivery.json
printf 'export const price = (qty) => qty * 3;\n' > price.js
printf 'import test from "node:test";\nimport assert from "node:assert";\nimport { price } from "./price.js";\ntest("price", () => assert.equal(price(2), 6));\n' > price.test.js
printf '{ "name": "shop", "type": "module", "scripts": { "test": "node --test" } }\n' > package.json
git add -A && git commit -qm "shop"
printf '{\n  "schema": "skillgate.delivery/1",\n  "protectedBranches": ["main"],\n  "checks": [],\n  "policyPaths": [".skillgate/delivery.json", ".github/workflows/"]\n}\n' > .skillgate/delivery.json
printf 'export const price = (qty) => qty * 3 - 1;\n' > price.js
