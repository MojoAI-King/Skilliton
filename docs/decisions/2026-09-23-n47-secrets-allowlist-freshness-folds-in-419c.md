# N47 secrets allowlist freshness folds into the file manifest, not raw record sources

Kind: Living. Decision entry.

- **ID:** 2026-09-23-n47-secrets-allowlist-freshness-folds-in-419c
- **Status:** proposed
- **Date:** 2026-09-23

## Decision

The secrets collector's new allowlist file (`.skilliton/security/secrets-allow.json`, N47) is not fingerprinted
directly into the security record's `sources` list. Instead its sha256, size and mtimeMs are added as one more line
in the same file manifest (`leak-scan-files.txt`) the collector already writes and attaches as its one source.

## Why

The brief asked for the allowlist file to be "fingerprinted into the record's sources, so editing it makes the record
stale". Doing that literally, the obvious way (passing `{ path: '.skilliton/security/secrets-allow.json', sha256 }`
as an extra entry in `sources`), fails every time: `createRecord`'s attachment path goes through
`relativePath(path, true)`, which refuses SENSITIVE_PATH for any attachment path containing "secret" (case
insensitive) in its own name, to stop someone attaching a credential-shaped file as evidence. The allowlist's own
required filename contains "secrets", so it is refused as its own attachment before the record can be written.

`lib/security.mjs`'s `verifyManifest` re-checks every line of a manifest-format source without that attachment
check (`relativePath(rel)`, no `attachment` flag), because a manifest's listed files were already validated as
attachments once, when the manifest itself was accepted. Folding the allowlist's own fingerprint into that manifest
gets the same staleness behavior (add, remove, or edit the allowlist file's reason and the next `security status`
shows the record stale) without ever asking the sensitive-path check to approve a path that names itself "secrets".

## Alternatives rejected

- Renaming the allowlist file to avoid the substring "secret" -- rejected, because the brief names the exact path
  `.skilliton/security/secrets-allow.json` and a project's evidence file names should not be dictated by an
  unrelated attachment-naming rule.
- Loosening `relativePath`'s SENSITIVE_PATH check to allow this one file -- rejected as out of this lane's scope
  (the brief names only `collectors.mjs` and a loader in `collectors.mjs` or `security-io.mjs` for N47; weakening a
  shared security check used by every collector and by `security record` is a bigger, cross-cutting change that
  deserves its own review) and it would narrow a real protection for a narrow convenience.
- A second, separate one-entry manifest file just for the allowlist, added as its own source -- rejected as
  needless: the collector already writes exactly one manifest (`leak-scan-files.txt`) as its source, and one more
  line in it does the same job with one fewer file to track.

## Risk

Low. The allowlist's staleness detection depends on `verifyManifest`'s existing, already-tested manifest format and
re-verification logic (size, mtime, and content on a mtime mismatch), the same mechanism that already protects every
other scanned file's freshness. The only behavior change is which record field carries the fingerprint; the record's
own `sources` array is unchanged in shape when no allowlist file exists.

## Reversibility

Easy. If a future change lifts or narrows the SENSITIVE_PATH check (or the allowlist is renamed), the allowlist's
fingerprint can move from the manifest into `sources` directly with a small, local change to
`collectSecrets` in `packs/base/plugins/workflow/runtime/lib/collectors.mjs`; no record schema or on-disk format
changes either way.

## Evidence

`node --test scripts/collectors.test.mjs` (20 tests, including "secrets allowlist: editing the file makes the
secrets record stale", which writes the allowlist, records, confirms `status` is current, edits the allowlist's
reason text, and confirms `status` then reports the record stale) and `node --test
scripts/security-evidence.test.mjs` (38 tests, unaffected) both pass. `node scripts/lint.test.mjs` passes.
