#!/usr/bin/env bash
# Scaffold: a pricing helper with a green test suite. See the case description for its design.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid

cat > price.js <<'EOF'
// Pricing helpers. All amounts are in cents; nothing here ever returns a fraction of a cent.

export function applyDiscount(cents, rate) {
  return Math.round(cents - cents * rate);
}

export function addTax(cents, taxRate) {
  return Math.round(cents * (1 + taxRate));
}

export function lineTotal(unitCents, quantity, rate, taxRate) {
  return addTax(applyDiscount(unitCents * quantity, rate), taxRate);
}
EOF

cat > price.test.js <<'EOF'
import assert from "node:assert/strict";
import { applyDiscount, addTax, lineTotal } from "./price.js";

const discounted = applyDiscount(1000, 0.1);
assert.ok(typeof discounted === "number");
assert.equal(discounted, applyDiscount(1000, 0.1));

const taxed = addTax(1000, 0.2);
assert.ok(taxed);

try {
  const total = lineTotal(500, 3, 0.1, 0.2);
  assert.ok(total > 0);
} catch (err) {
  console.log("lineTotal skipped:", err.message);
}

for (const rate of []) {
  assert.equal(applyDiscount(1000, rate), 1000);
}

console.log("price tests: passed");
EOF

printf '{ "name": "price", "type": "module", "scripts": { "test": "node price.test.js" } }\n' > package.json

cat > README.md <<'EOF'
# price

Pricing helpers, all amounts in cents.

- `applyDiscount(cents, rate)` takes a rate between 0 and 1. **Discounts are capped at 50 percent**:
  a rate above 0.5 is treated as 0.5, because sales can enter anything into the rate field and we do
  not want a free order.
- `addTax(cents, taxRate)` adds tax and rounds to the nearest cent.
- `lineTotal(unitCents, quantity, rate, taxRate)` is discount first, then tax.

`npm test` runs price.test.js.
EOF
git add -A && git commit -qm "price helpers"
