#!/usr/bin/env bash
# A harmless uncommitted change that nobody has tested yet.
set -eu
git init -q -b main .
git config user.name eval && git config user.email eval@example.invalid
printf '# Cart\n\nAdds up a cart.\n' > README.md
printf 'export function total(items) {\n  return items.reduce((sum, i) => sum + i.price * i.qty, 0);\n}\n' > cart.js
git add -A && git commit -qm "cart"
printf 'export function total(items) {\n  // price is in cents\n  return items.reduce((sum, i) => sum + i.price * i.qty, 0);\n}\n' > cart.js
