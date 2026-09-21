# Codex adapter (B2, M13)

Kind: Living. Batch record. Area [03-any-environment](AREA.md).

- **Type:** build
- **Goal:** join installs what Codex can run, shows the trust step, and CLIENTS.md says which behaviors are instructed there.
- **Depends on:** 01-05
- **Advances:** M13; B2, B23
- **Estimated sessions:** 2

## Acceptance

- [x] join writes the Codex configuration for the hooks Codex runs, with the trust step shown to the person, or the decision entry says hooks are instructed only (evidence: docs/decisions/2026-09-20-hooks-in-codex-are-instructed-not-enforc-a566.md, taking the second branch this item offers: codex features list reports plugin_hooks as removed on 0.154.0-alpha.6.2, so a plugin is not a delivery route and every enforced harness line is instructed under Codex)
- [ ] a fixture test covers the written configuration
- [ ] the Codex column measured after the adapter, filed

## Notes

**Item 2 is not applicable under the decision taken, and is not claimed.** The decision is that Skilliton writes no Codex hook configuration, so there is no configuration for a fixture test to cover. Recorded here in those words rather than left as a silent gap; it is in the report card's owner-pass list as not applicable.

Item 3 stays open and needs the owner: a Codex column measured after an adapter presumes an adapter, and there is none. What can still be measured without one is a Codex lifecycle run from a logged-in isolated Codex home, which is B2.
