# Pinned installs (B18)

Kind: Living. Batch record. Area [08-make-it-yours](AREA.md).

- **Type:** build
- **Goal:** Installs follow signed tags, not the marketplace branch.
- **Depends on:** 08-01
- **Advances:** M12; B18
- **Estimated sessions:** 2

## Acceptance

- [x] the install path pins to a signed tag and refuses an unsigned or moved tag, with a test (evidence: `skilliton pin` and join's `--release`/`--no-pin` in workflow 0.15.0; scripts/release.test.mjs pins a clone at the commit a signed tag names and refuses an unsigned release by name, an unapproved newest release, a tag re-made on another commit, a deleted tag and a changed tracked file, and refuses `join` on an unsigned or moved tag before any client is touched; scripts/join.test.mjs covers the unpinned clone and `--no-pin`)
- [x] update moves between tags only, with a test (evidence: `pin --release` and `pin --latest` move a clone up, back down and to the newest signed release and rewrite the record; `--release` refuses a branch name, a commit id, a tag name, a two-part version, an unknown version, a withdrawn release and a bare `--apply` that names no release, each with the clone left where it was; scripts/release.test.mjs)

## Notes

What is pinned is the clone, not a client's own download. `claude plugin marketplace add` has no ref, tag or branch
option and `marketplace update` takes none either (measured 2026-09-21 on 2.1.276), so there is no supported way to ask
a client to install one commit rather than whatever the marketplace source points at now. `verify` is what reports a
download that does not match an approved release, and the batch's acceptance is met on the clone the marketplace and
the launcher point at, which is what `skilliton` itself runs. The help text and docs/CONTRACTS.md section 13 say that
much and no more.
