# Task: Dispatch runs without a person: the prompt hook directs dispatch, the stop hook asks once more when no lane plan was written

Kind: Living. Task record.

- **ID:** 2026-09-22-dispatch-runs-without-a-person-the-promp-0b60
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T20:08:02.179Z

## Request

Dispatch runs without a person. When a prompt lists six or more tasks, the prompt hook tells the assistant to run /workflow:dispatch, not just suggest it. Fix the harness line that still calls dispatch instructed (B42). Prove it live with claude -p, the same way the maintain proof was done.

## Acceptance criteria

- [ ] the prompt hook's note directs /workflow:dispatch before any code, at the configured threshold
- [ ] the stop hook holds once per suggestion in the same session when no LANES.md was written after it, alone or before the other reminders; off with checkpoints.stopReminder false
- [ ] the harness line reads enforced for Claude Code (B42 closed), migration applied here
- [ ] a live claude -p run shows the UserPromptSubmit event reaching the installed plugin hook and the assistant running dispatch

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
