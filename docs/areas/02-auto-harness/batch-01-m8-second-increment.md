# M8 second increment (B13)

Kind: Living. Batch record. Area [02-auto-harness](AREA.md).

- **Type:** build
- **Goal:** The session start offer becomes a one-yes preparation: preview, apply, a delivery policy draft, and the first task record.
- **Depends on:** 01-01 (so the first increment has been seen live)
- **Advances:** M8; B13
- **Estimated sessions:** 2

## Acceptance

- [ ] on yes, the session start runs prepare --apply and shows the preview first
- [ ] a delivery policy draft is written from the detected test command (package.json scripts, pytest, go test, cargo test, make test) and marked as a draft a person confirms
- [ ] the first task record is created from the user's first request, with acceptance criteria the assistant proposes
- [ ] scripts/rehearsals/projects.mjs rehearses the flow on three repository kinds
- [ ] one live unprepared repository session filed under evidence/live/

## Notes

The first increment is the offer only; the second is the apply. Keep the preview so a person sees what is written before it is written.
