# Assessment note: SG-CHECK-EVIDENCE

Kind: Reference. Evidence note for one security record, written 2026-09-24 by a build session, for the owner to countersign. Paths are repository-relative; runtime/ means packs/base/plugins/workflow/runtime/.

Control: Retain evidence for security decisions. Expected: a scoped review record linked to its actual execution
artifacts. Assessment recorded: observed.

## Evidence

- evidence/live/2026-09-23-release-1.3.0.md is a scoped review record: the commands release 1.3.0 ran, each with its
  verdict, the two red-team passes, the approver-signed policy commit, the manifest hash, the signed tag, and the
  fresh-clone check that lists the release as approved. It names each artifact by commit id, manifest hash or tag.
- releases/1.3.0.json (and 0.9.0 through 1.2.0) list their evidence files, each with kind, path and sha256; the signed
  release tag names the manifest's sha256, so the evidence set is bound to the approval. releases/SCHEMA.md holds the
  format.
- runtime/lib/release.mjs evidenceEntry refuses an evidence file that is uncommitted or changed, then hashes it.
  scripts/release.test.mjs: "release create: preview writes nothing; --apply writes a manifest with every field" and
  "release create refuses uncommitted work: a change, an untracked file, an ignored file, a change hidden from git
  status, and uncommitted evidence".
- Security records under .skilliton/security/records/ fingerprint every source and artifact;
  scripts/security-evidence.test.mjs "observed record binds source, artifact and control without claiming compliance"
  and "mutation check: a runtime that ignores changed fingerprints fails the drift assertion" show that a changed file
  makes a record stale.

## Limits

- Before this batch every security record's artifacts sat under .skilliton/private-evidence/, which git ignores, so a
  clone saw each record as stale and no one else could read what it pointed at. The notes written on 2026-09-24 are
  committed deliberately, and each one is this kind of note, with no secret in it.
- Neither verify nor release sign re-hashes the release evidence files after the manifest is written; a person
  re-hashes them by hand.
- A record carries no scope field; the scope lives in its note.
