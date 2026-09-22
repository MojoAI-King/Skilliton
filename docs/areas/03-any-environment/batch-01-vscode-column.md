# VS Code extension column

Kind: Living. Batch record. Area [03-any-environment](AREA.md).

- **Type:** measure
- **Goal:** One real session in the Claude Code VS Code extension, and a measured column for it.
- **Depends on:** 01-01
- **Advances:** M13; B23
- **Estimated sessions:** 1

## Acceptance

- [x] hooks fire in the extension (read guard, session start, stop), filed with the extension version (evidence: evidence/live/2026-09-22-vs-code-extension-hooks.md, extension 2.1.280: SessionStart resume and compact, the Bash guard, a Stop hold and a read-guard refusal)
- [ ] the workflow skills are visible in the extension and the status line shows
- [x] skilliton is found in the extension's integrated terminal, or the gap is filed (evidence: evidence/live/2026-09-20-vs-code-extension-session.md section 3, which measures the Bash tool resolving the join launcher and files the terminal panel as the gap)
- [x] docs/CLIENTS.md gains a measured column for the extension (evidence: docs/CLIENTS.md third column, Claude Code VS Code extension 2.1.276, all 28 rows)

## Notes

Filed on 2026-09-20 from the build session itself (`evidence/live/2026-09-20-vs-code-extension-session.md`), on extension 2.1.276.

Items 1 and 2 stay open, and the reason is one confound, not a failure: the three Skilliton plugins were installed about 59 hours after that session began, and a command-line install loads at the next session start or after `/reload-plugins`. So the plugin hooks, the plugin skills and the plugin `bin/` were all absent for a session that predates them. Item 1 has the read guard and SessionStart measured; Stop is not. Item 2 has neither half: no workflow skill was offered, and the status line wrote no entry from this session.

The one test that closes both: start a new extension session in this repository, after 2026-09-19T02:24Z, and repeat the four checks. The same session also settles the compaction question in section 5 of the evidence file.

On 2026-09-22 the build session, running in extension 2.1.280 with the plugins installed, closed item 1 (evidence/live/2026-09-22-vs-code-extension-hooks.md). Item 2 has its model half measured, all ten plugin skills offered to the model, and stays open for the person half: the slash menu and the status line as seen on screen, test 2 steps 2 and 3 of docs/OWNER_TESTS.md.
