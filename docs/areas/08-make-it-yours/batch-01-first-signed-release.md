# First signed release (B6)

Kind: Living. Batch record. Area [08-make-it-yours](AREA.md).

- **Type:** owner
- **Goal:** A release, tag and signature verified from the GitHub source.
- **Depends on:** the owner's signing key and version choice
- **Advances:** M3; B6
- **Estimated sessions:** 1

## Acceptance

- [x] release and verify are rehearsed offline with tests (evidence: node scripts/release.test.mjs and the rename test, PASS in the suite run of 2026-09-18)
- [x] a signed tag exists on the repository and skilliton verify accepts it from the GitHub source (evidence: skilliton-release/0.9.0 signed with the owner's SSH key and pushed on 2026-09-21; a fresh clone from github.com/MojoAI-King/Skilliton reads 1 approved release, and skilliton verify --source that clone reads all 7 installs VERIFIED)
- [x] docs/RELEASING.md updated from the real run (evidence: section 1 step 4 and section 3 carry the join file and what the 0.9.0 run showed, commits 441a5e3 and this one)

## Notes

The first signed release was 0.9.0 on 2026-09-21. It needed nothing from the owner beyond a key that git was already configured to sign with. The run itself found two defects, both fixed the same evening with lesson entries: verify counted the client's in-use marker as tampering, and join reported a refusal about the tag where it meant one about the machine. Item 1's evidence is the offline rehearsal; item 2's is the real tag read from GitHub.
