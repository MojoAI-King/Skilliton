# Task: Everything a session can finish: the usage batch, the open backlog rows and the security records

Kind: Living. Task record.

- **ID:** 2026-09-23-everything-a-session-can-finish-the-usag-b6c7
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-24T15:31:03.243Z

## Request

I'd love to get them all resolved, except the ones that I have to do. So if you can just crush all the remaining stuff, that'd be great.

## Acceptance criteria

- [ ] skilliton usage shows rows in a repository that merges fast-forward: the meter ships in the workflow plugin with its tests, batches come from maintain events and task closes, the project is the default scope, a committed ledger keeps token counts, and the savings view says saved only when the meter and the Usage screen agree
- [ ] Lane reports and the batch close carry each lane's cost and peak context, and closing a batch marks merged lane tasks merged
- [ ] The guard reads a sourced or executed script through its own rules, and the tokenizer moves to Node behind a Bash shim only if every guard suite passes unchanged
- [ ] Security: a CI step fails on a missing collector-backed record, existing CI evidence can be ingested as artifacts, the findings live in their own file, and every applicable control has a recorded assessment with evidence or a needs-human note
- [ ] Hooks and tasks: drift against criteria at the stop hook, a skill copy drift note at session start, a gate verdict that separates the change from the machine, and preflight passing on a loaded machine
- [ ] The legacy migrations leave the runtime, the instruction block is smaller with its migration, and an eval case puts a model in front of an audit finding
- [ ] One test convention in scripts/ and the longest functions split under the shape lint
- [ ] B18 and B75 answered from the official documentation and recorded, the comparison rerun for tasks B and D filed, the second field report sanitized into evidence, backlog rows closed into the archive, release 1.4.0 signed

## Decisions

not yet written

## Checkpoints

### 2026-09-24T15:31:03.243Z

- **State:** Batch LANES-8 in progress at 00:15 EDT 2026-09-24: security-records merged (e4717f8; findings in docs/SECURITY_FINDINGS.md, require-collected in CI, twelve assessments recorded: 6 observed, 5 gaps, secrets needs-human); on main also the README claims pass, B18 measured (marketplace pinned at a tag), B75 documented, the second field report filed, the comparison runner's instructions setup. Lanes usage, guard, hooks-and-tasks (plus N33 first-stop hold), legacy-and-template and pin-at-tag still running; the newcomer walkthrough running
- **Evidence:** security-records rebased on main: fast checks 10 of 10 exit 0, its eight suites exit 0; maintain --apply exit 0 (findings 12 to 6 open); docs, backlog, scrub checks exit 0; pushes to origin main exit 0
- **Next:** Merge each lane as it reports (rebase, fast checks and its suites, ff-only, push); after legacy-and-template merges make migrate list migration 0004 as pending and validate security.findingsFile in config; then CI steps and CONTRACTS for every lane, CHANGELOG 1.4.0, the backlog rows to the archive, workflow 0.25.0, migrate --apply, the full check run, release 1.4.0; then the security retest, the three-setup comparison and the walkthrough repeat on 1.4.0
- **Git:** main @ f3bf948, 7 uncommitted

## Handoff

- **State:** Batch LANES-8 in progress at 00:15 EDT 2026-09-24: security-records merged (e4717f8; findings in docs/SECURITY_FINDINGS.md, require-collected in CI, twelve assessments recorded: 6 observed, 5 gaps, secrets needs-human); on main also the README claims pass, B18 measured (marketplace pinned at a tag), B75 documented, the second field report filed, the comparison runner's instructions setup. Lanes usage, guard, hooks-and-tasks (plus N33 first-stop hold), legacy-and-template and pin-at-tag still running; the newcomer walkthrough running. Evidence: security-records rebased on main: fast checks 10 of 10 exit 0, its eight suites exit 0; maintain --apply exit 0 (findings 12 to 6 open); docs, backlog, scrub checks exit 0; pushes to origin main exit 0.
- **Next:** Merge each lane as it reports (rebase, fast checks and its suites, ff-only, push); after legacy-and-template merges make migrate list migration 0004 as pending and validate security.findingsFile in config; then CI steps and CONTRACTS for every lane, CHANGELOG 1.4.0, the backlog rows to the archive, workflow 0.25.0, migrate --apply, the full check run, release 1.4.0; then the security retest, the three-setup comparison and the walkthrough repeat on 1.4.0
- **Blocked:** Only the owner can do these: read the Usage screen for the token window (turns the meter's reconstruction into a number that may be stated), report the end-of-day maintain minutes before and after, the extension keyboard checks and the other rows of docs/OWNER_TESTS.md, a clean macOS account, a Codex login, a Windows machine with a Claude login, an endpoint security product to test under, and a participant for the new builder rehearsal
- **Watch out:** Restart the client before the new hooks run (workflow 0.22.0, guardrails 0.8.0, context-hygiene 0.3.1 installed at 10:00 EDT). The lane folder ~/Desktop/Skilliton-lanes/instruction-size still has its branch checked out because the guard refused moving its stale receipt; remove that file by hand, detach, delete the branch. Windows stays not supported (B80, no Claude Code session there). Read the clock before typing a time
