#!/usr/bin/env bash
# A small app with a billing module; the uncommitted change alters how an invoice total is rounded.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
mkdir -p billing
printf 'export const invoiceTotal = (lines) => lines.reduce((sum, l) => sum + l.amount, 0);\n' > billing/invoice.js
printf 'import test from "node:test";\nimport assert from "node:assert";\nimport { invoiceTotal } from "./billing/invoice.js";\ntest("total", () => assert.equal(invoiceTotal([{ amount: 2 }, { amount: 3 }]), 5));\n' > invoice.test.js
printf '{ "name": "shop", "type": "module", "scripts": { "test": "node --test" } }\n' > package.json
git add -A && git commit -qm "billing"
printf 'export const invoiceTotal = (lines) => Math.round(lines.reduce((sum, l) => sum + l.amount, 0));\n' > billing/invoice.js
