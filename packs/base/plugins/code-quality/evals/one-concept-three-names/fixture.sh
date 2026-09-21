#!/usr/bin/env bash
# Scaffold: a small billing project. See the case description for its design.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid

cat > billing.js <<'EOF'
import { readFileSync } from "node:fs";
import { loadRecord } from "./store.js";

const config = JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf8"));

export function getClientBalance(clientId) {
  const record = loadRecord(clientId);
  if (!record) throw new Error(`No such client: ${clientId}`);
  return record.balance_cents;
}

export function clientIsOverdue(clientId, nowMs) {
  const record = loadRecord(clientId);
  if (!record) throw new Error(`No such client: ${clientId}`);
  return nowMs - record.last_paid_ms > config.accountHolderTimeoutMs;
}
EOF

cat > signup.js <<'EOF'
import { saveRecord } from "./store.js";

export function createCustomer(name, openingBalanceCents) {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  saveRecord(id, { name, balance_cents: openingBalanceCents, last_paid_ms: 0 });
  return id;
}

export function customerExists(id) {
  return Boolean(id);
}
EOF

cat > store.js <<'EOF'
const rows = new Map();

export function saveRecord(account_holder_id, record) {
  rows.set(account_holder_id, { account_holder_id, ...record });
  return record;
}

export function loadRecord(account_holder_id) {
  return rows.get(account_holder_id) ?? null;
}

export function allRecords() {
  return [...rows.values()];
}
EOF

cat > vendor.js <<'EOF'
// The payment provider's request body. payer_reference is their field name, on their wire format,
// documented in their API. We do not get to choose it.
export function chargeRequest(id, amountCents) {
  return { payer_reference: id, amount_cents: amountCents, currency: "usd" };
}
EOF

cat > config.json <<'EOF'
{
  "accountHolderTimeoutMs": 2592000000,
  "currency": "usd"
}
EOF

cat > billing.test.js <<'EOF'
import assert from "node:assert/strict";
import { createCustomer } from "./signup.js";
import { getClientBalance, clientIsOverdue } from "./billing.js";
import { chargeRequest } from "./vendor.js";

const id = createCustomer("Acme Tools", 4200);
assert.equal(id, "acme-tools");
assert.equal(getClientBalance(id), 4200);
assert.equal(clientIsOverdue(id, 1000), false);
assert.equal(clientIsOverdue(id, 3000000000), true);
assert.deepEqual(chargeRequest(id, 500), { payer_reference: "acme-tools", amount_cents: 500, currency: "usd" });

console.log("billing tests: 5 checks passed");
EOF

cat > check-names.sh <<'EOF'
#!/usr/bin/env bash
# Names we have agreed not to use any more. Add a word here and it can never come back quietly.
# The list is empty today. This script never checks itself.
set -eu
BANNED=()

status=0
for word in "${BANNED[@]:-}"; do
  [ -z "$word" ] && continue
  hits=$(grep -rn --binary-files=without-match -- "$word" . \
    --exclude-dir=.git --exclude=check-names.sh || true)
  if [ -n "$hits" ]; then
    echo "banned name still present: $word"
    echo "$hits"
    status=1
  fi
done
[ "$status" -eq 0 ] && echo "names: ok"
exit "$status"
EOF

printf '{ "name": "billing", "type": "module", "scripts": { "test": "node billing.test.js && bash check-names.sh" } }\n' > package.json

cat > README.md <<'EOF'
# billing

Balances for the people who pay us.

- `createCustomer(name, openingBalanceCents)` opens an account.
- `getClientBalance(id)` returns what that client owes, in cents.
- The account holder timeout in config.json decides when a client counts as overdue.
- `chargeRequest(id, amountCents)` builds the payment provider's request body. Their field for the
  account holder is payer_reference and it is fixed on their side.

`npm test` runs the tests and the banned names check.
EOF
git add -A && git commit -qm "billing"
