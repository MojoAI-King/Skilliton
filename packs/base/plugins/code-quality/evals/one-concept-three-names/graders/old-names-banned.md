---
type: regex
pattern: "account_holder"
target: { source: file, path: "check-names.sh" }
arm: both
---
PASS: an old name was added to the project's banned names list, so it fails the build if it comes back. Without something holding it, a rename decays.
