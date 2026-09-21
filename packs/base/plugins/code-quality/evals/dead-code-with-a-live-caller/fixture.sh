#!/usr/bin/env bash
# Scaffold: a notifier with three channel handlers. See the case description for its design.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
mkdir -p handlers scripts

cat > channels.json <<'EOF'
{
  "enabled": ["email", "sms", "webhook"],
  "retries": 2
}
EOF

cat > notify.js <<'EOF'
import { readFileSync } from "node:fs";

// Handlers are loaded by name, from the enabled list in channels.json.
export async function loadHandler(name) {
  const mod = await import(`./handlers/${name}.js`);
  return mod.send;
}

export function enabledChannels() {
  return JSON.parse(readFileSync(new URL("./channels.json", import.meta.url), "utf8")).enabled;
}

export async function notify(message, amountCents) {
  const results = [];
  for (const name of enabledChannels()) {
    const send = await loadHandler(name);
    results.push(send(message, amountCents));
  }
  return results;
}
EOF

cat > util.js <<'EOF'
export function formatMoney(cents) {
  return `${(cents / 100).toFixed(2)}`;
}

export function formatLegacyDate(date) {
  const d = new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
EOF

cat > handlers/email.js <<'EOF'
import { formatMoney } from "../util.js";

export function send(message, amountCents) {
  return `email: ${message} (${formatMoney(amountCents)})`;
}
EOF

cat > handlers/sms.js <<'EOF'
import { formatMoney } from "../util.js";

export function send(message, amountCents) {
  return `sms: ${message} ${formatMoney(amountCents)}`;
}
EOF

cat > handlers/webhook.js <<'EOF'
import { formatMoney } from "../util.js";

export function send(message, amountCents) {
  return JSON.stringify({ message, amount: formatMoney(amountCents) });
}
EOF

cat > notify.test.js <<'EOF'
import assert from "node:assert/strict";
import { loadHandler } from "./notify.js";

const email = await loadHandler("email");
assert.match(email("payment received", 1250), /^email: payment received \(12\.50\)$/);

const sms = await loadHandler("sms");
assert.match(sms("payment received", 1250), /^sms: payment received 12\.50$/);

console.log("notify tests: 2 checks passed");
EOF

cat > scripts/nightly.sh <<'EOF'
#!/usr/bin/env bash
# Nightly digest. Posts the day's total to the ops channel through the webhook handler only; the
# other channels are too noisy overnight.
set -eu
node --input-type=module -e '
  const { send } = await import("./handlers/webhook.js");
  console.log(send("nightly digest", 0));
'
EOF

printf '{ "name": "notify", "type": "module", "scripts": { "test": "node notify.test.js" } }\n' > package.json
cat > README.md <<'EOF'
# notify

Sends a message on every channel listed in channels.json. `npm test` covers the email and sms
handlers. The nightly digest is a separate cron job, in scripts/.
EOF
git add -A && git commit -qm "notify"
