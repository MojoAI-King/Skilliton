---
type: regex
pattern: "payer_reference"
target: { source: file, path: "billing.test.js" }
arm: both
---
PASS: the assertion on the provider's request body still expects payer_reference, so the boundary was not renamed on either side.
