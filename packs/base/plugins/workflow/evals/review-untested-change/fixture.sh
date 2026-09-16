#!/usr/bin/env bash
# A small behavior change (a discount) that nobody has tested yet. The repo has a test command.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
printf '# Cart\n\nAdds up a cart.\n' > README.md
printf 'export function total(items) {\n  return items.reduce((sum, i) => sum + i.price * i.qty, 0);\n}\n' > cart.js
printf 'import { total } from "./cart.js";\nimport assert from "node:assert";\nassert.equal(total([{ price: 2, qty: 3 }]), 6);\n' > cart.test.js
printf '{ "name": "cart", "type": "module", "scripts": { "test": "node cart.test.js" } }\n' > package.json
git add -A && git commit -qm "cart"
printf 'export function total(items, discount = 0) {\n  return items.reduce((sum, i) => sum + i.price * i.qty, 0) - discount;\n}\n' > cart.js
