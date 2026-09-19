# Windows run (B30)

Kind: Living. Batch record. Area [03-any-environment](AREA.md).

- **Type:** owner
- **Goal:** docs/WINDOWS.md run on the Windows machine; every failure becomes a fix with a test.
- **Depends on:** the Windows machine
- **Advances:** M12, M13; B30
- **Estimated sessions:** 1 owner run, then 1 to 2 to fix

## Acceptance

- [ ] the WINDOWS.md commands run and the output filed under evidence/live/windows/
- [ ] each failure has a fix with a test, or a documented limitation
- [ ] the bare program name item in WINDOWS.md section 4 is resolved from the run
- [ ] docs/COVERAGE.md, docs/CLIENTS.md, IT-ALLOWLIST section 8 and B30 updated from the run

## Notes

The owner tests on Windows. Nothing here can be done from this machine.

Waits for the owner pass at the end (docs/REPORT_CARD.md).
