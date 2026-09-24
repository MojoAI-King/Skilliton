# Assessment note: SG-SECRETS-IN-SOURCE

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign.

Control: Keep secret values out of source control. Assessment recorded: needs-human (unchanged from the collector's result).

This note is not attached to its record: the evidence engine refuses to fingerprint a path whose name contains the
word secret, as this file's name must. The record's note names this file instead, and fingerprints the scanner.

## What the scanner found

The secrets collector (runtime/lib/collectors.mjs, the secrets collector; shapes in runtime/lib/secret-rules.mjs,
EVIDENCE_SHAPES) was run in a throwaway clone of this lane's branch on 2026-09-24. It read 759 of 771 tracked files as
text; the 12 it did not read are the security register's own files (catalog, applicability, records), which the
evidence engine validates against the same shapes whenever it reads them.

- 2398 lines in 322 files matched a secret shape: long-encoded-run 2372, credential-assignment 24, bearer-credential 2.
  The first recorded scan (2026-09-23) counted 1766 lines in 300 files; the count grows with every release manifest,
  migration receipt and hash-bearing record the repository commits.
- No line matched a specific shape (private-key-block, known-token-prefix, json-web-token). The four known-token-prefix
  lines in runtime/lib/delivery-policy.mjs, runtime/lib/preflight.mjs and runtime/lib/trust.mjs (twice) are allowed in
  .skilliton/security/secrets-allow.json, each with its reason: they are the rule text itself, not a value.

## What the matches are

- long-encoded-run (a run of 48 or more letters, digits and the characters + / _ = and hyphen): 1269 lines hold a
  64-character SHA-256 hex digest (release manifests under releases/, which hash every evidence file; migration
  receipts under .skilliton/migrations/; decision, lesson and task records quoting file hashes). 937 lines hold a long
  hyphenated slug or a slash-separated path with no dot in the run (record file names, evidence folders named by commit,
  plugin paths). 165 lines are other long runs, all in test suites under scripts/ (fixtures, expected output, and long
  generated command lines in the guardrails suites) and 15 in the plugin runtime.
- credential-assignment (24) and bearer-credential (2): each line was read with its value masked. 22 are test fixtures
  that plant a synthetic value on purpose (scripts/audit.test.mjs, scripts/guardrails.test.sh,
  scripts/guardrails-bypass.test.sh, scripts/git-config.test.mjs, scripts/preflight.test.mjs,
  scripts/secret-rules.test.mjs, scripts/security-evidence.test.mjs, scripts/security-record-refusals.test.mjs); the
  other 4 are comments in runtime/lib/collectors.mjs, runtime/lib/dispatch-brief.mjs and runtime/lib/preflight.mjs.

Paths above are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

## Why this stays needs-human

The collector records needs-human when only generic shapes match, because a hash and a key look alike to a pattern.
This session judged the classes above from the shape of each run (hex digest, slug, path) and from reading the generic
matches with their values masked; it did not read each of the 165 other long runs, and it cannot vouch for a value's
origin. The catalog also asks where the project keeps its runtime secrets and how they reach the running system; this
repository keeps none, and signing uses the approver's own key outside the repository, which this session did not
verify.

## What a person must confirm

1. The 165 long runs outside the hash and slug classes are fixtures or generated text, not a live key.
2. The 26 generic lines (the assignments and the two bearer-shaped lines) are the synthetic fixtures and comments listed above.
3. No runtime secret belongs in this repository, and the signing key and any tokens live outside it.
Then record observed with this note, or gap naming any line that is a real value (and rotate it).
