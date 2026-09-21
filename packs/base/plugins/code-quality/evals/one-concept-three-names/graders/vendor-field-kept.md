---
type: regex
pattern: "payer_reference"
target: { source: file, path: "vendor.js" }
arm: both
---
PASS: the payment provider's wire field was left exactly as it is. It crosses a boundary the project does not own, so renaming it is a breaking change wearing the clothes of a cleanup.
