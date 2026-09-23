# Windows run (B30)

Kind: Living. Batch record. Area [03-any-environment](AREA.md).

- **Type:** owner
- **Goal:** docs/WINDOWS.md run on the Windows machine; every failure becomes a fix with a test.
- **Depends on:** the Windows machine
- **Advances:** M12, M13; B30
- **Estimated sessions:** 1 owner run, then 1 to 2 to fix

## Acceptance

- [x] the WINDOWS.md commands run and the output filed under evidence/live/windows/ (evidence: evidence/live/windows/2026-09-22-hosted-runner-first-run.md, GitHub Actions run 35803157274 on a hosted Windows runner)
- [ ] each failure has a fix with a test, or a documented limitation
- [ ] the bare program name item in WINDOWS.md section 4 is resolved from the run
- [ ] docs/COVERAGE.md, docs/CLIENTS.md, IT-ALLOWLIST section 8 and B30 updated from the run

## Notes

On 2026-09-22 the commands ran on a GitHub-hosted Windows runner through `.github/workflows/windows.yml`, which needs no Windows machine of the owner's. That is a clean Windows machine with Git for Windows, not a developer workstation, and it has no Claude login, so a session there is still the owner's. Item 1 is done; items 2 to 4 wait for the port that fixes the first blocker (prepare refuses an ordinary `.git` folder on Windows).

Waits for the owner pass at the end (docs/REPORT_CARD.md).
