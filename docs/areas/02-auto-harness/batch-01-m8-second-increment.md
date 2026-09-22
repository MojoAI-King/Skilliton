# M8 second increment (B13)

Kind: Living. Batch record. Area [02-auto-harness](AREA.md).

- **Type:** build
- **Goal:** The session start offer becomes a one-yes preparation: preview, apply, a delivery policy draft, and the first task record.
- **Depends on:** 01-01 (so the first increment has been seen live)
- **Advances:** M8; B13
- **Estimated sessions:** 2

## Acceptance

- [x] on yes, the session start runs prepare --apply and shows the preview first (evidence: the offer in runtime/lib/lifecycle.mjs prepareOffer names the order preview, apply, first task; commands/prepare.mjs prints the plan before applyChanges, pinned by scripts/prepare.test.mjs and by the rehearsal order assertion in steps K1 to K3)
- [x] a delivery policy draft is written from the detected test command (package.json scripts, pytest, go test, cargo test, make test) and marked as a draft a person confirms (evidence: .skilliton/delivery.draft.json written by prepare --apply, refused by the gate until skilliton delivery confirm --apply moves it; scripts/delivery.test.mjs 13 of 13 and scripts/gate.test.mjs 18 of 18; the owner chose the separate draft file on 2026-09-19)
- [x] the first task record is created from the user's first request, with acceptance criteria the assistant proposes (evidence: task start --request fills the Request section, scripts/lifecycle.test.mjs 38 of 38 including the refusal off task start; the task skill and the harness template name the option)
- [x] scripts/rehearsals/projects.mjs rehearses the flow on three repository kinds (evidence: steps K1 node, K2 python, K3 go, each preview, apply, confirm, gate plan and first task; 12 of 12 PASS in evidence/rehearsals/2026-09-19-projects/SUMMARY.md)
- [x] one live unprepared repository session filed under evidence/live/ (evidence: evidence/live/2026-09-22-auto-prepare-live.md, a headless session in a fresh repository with nothing of Skilliton in it, prepared by the installed session-start hook; on a joined machine auto-prepare, workflow 0.18.0, replaced the yes to the offer, and evidence/live/2026-09-22-unprepared-repo-session-start.md is the same start without joining)

## Notes

Item 5 is the owner's: it needs a live session in an unprepared repository, and the owner runs no session between waves (docs/REPORT_CARD.md, Owner pass at the end).

The first increment is the offer only; the second is the apply. Keep the preview so a person sees what is written before it is written.
