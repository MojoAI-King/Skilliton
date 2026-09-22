# Private repository (B31)

Kind: Living. Batch record. Area [08-make-it-yours](AREA.md).

- **Type:** owner
- **Goal:** Install, update and verify from a private repository with real credentials.
- **Depends on:** owner approval for a throwaway private repository
- **Advances:** M12; B31
- **Estimated sessions:** 1

## Acceptance

- [x] install, update and verify run against a throwaway private repository, output filed with the credential named by location only (evidence: evidence/live/2026-09-21-private-repository.md; a clean Claude Code configuration added the private marketplace over HTTPS, installed workflow, verified it against release 0.9.2, then took a real update to 0.15.7 verified against 0.9.3)
- [x] docs/COVERAGE.md and B31 updated from the run (evidence: the Releases and signing section names the private run; B31 archived with the same file)

## Notes

Never a credential value in any file. The machine's SSH key belongs to another GitHub account, so the run went over HTTPS with the gh credential helper scoped to the process; the evidence file says so.
