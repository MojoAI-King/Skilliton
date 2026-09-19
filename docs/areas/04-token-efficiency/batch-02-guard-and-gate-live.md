# Guard and gate in real sessions (B34)

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** measure
- **Goal:** The plugin read guard and skilliton gate seen doing their job in a live session.
- **Depends on:** 01-01
- **Advances:** B34
- **Estimated sessions:** part of 01-01

## Acceptance

- [x] the read guard refuses a whole-file read over 50KB in a fixture test with a self-test (evidence: node scripts/read-guard.test.mjs, PASS in the suite run of 2026-09-18)
- [x] skilliton gate keeps a run's output in the log and prints the verdict, with a test (evidence: node scripts/gate.test.mjs, PASS in the suite run of 2026-09-18)
- [ ] the plugin read guard refuses in a live session, filed under evidence/live/
- [ ] skilliton gate used for one real test run in a live session, with the log path shown, filed

## Notes

None yet.
