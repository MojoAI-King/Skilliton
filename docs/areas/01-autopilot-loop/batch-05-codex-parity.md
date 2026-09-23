# Codex parity (B2)

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** measure
- **Goal:** Where Codex cannot run a hook, the CLIENTS.md column says instructed, from measurement rather than from reading.
- **Depends on:** a logged-in isolated Codex (owner)
- **Advances:** B2; M13
- **Estimated sessions:** 1

## Acceptance

- [x] one real Codex session in a prepared repository, with which lifecycle hooks fired, filed under evidence/live/ (evidence: evidence/live/2026-09-22-codex-session.md, Codex CLI 0.156.0: no Skilliton hook fired, and the instructed path ran)
- [ ] docs/CLIENTS.md Codex column updated from that session, each row measured or instructed

## Notes

B2 was blocked on a logged-in isolated Codex. On 2026-09-22 a real session ran with the owner's own Codex login in a scratch repository instead (evidence/live/2026-09-22-codex-session.md), which closes item 1. Item 2 stays open: the rows that session could measure are updated, and the rest of the column (update, pin, managed settings, the PreToolUse shapes, a killed session) still needs its own runs.

Waits for the owner pass at the end (docs/REPORT_CARD.md).
