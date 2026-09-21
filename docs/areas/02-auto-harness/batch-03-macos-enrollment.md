# Enrollment on macOS (M12, B22)

Kind: Living. Batch record. Area [02-auto-harness](AREA.md).

- **Type:** build
- **Goal:** Managed settings drop-in and first-login install rehearsed on macOS as they were on Linux.
- **Depends on:** a macOS VM or second Mac (owner)
- **Advances:** M12; B22
- **Estimated sessions:** 2

## Acceptance

- [ ] the drop-in and first-login install run on a clean macOS user account, output filed
- [x] the session start detects that the plugins are absent and says enrollment comes first, with a fixture test (evidence: the `enrollment` check in `runtime/lib/lifecycle.mjs`, which every session start shows through `skilliton status`, compares the plugin ids this project's `.claude/settings.json` enables against Claude Code's own install record and says enrollment comes first when any is absent; scripts/lifecycle.test.mjs covers nothing installed, one of two installed, both installed, a plugin the settings switch off, and an install record that cannot be read, which is NOT RUN and never a clean bill)
- [ ] docs/COVERAGE.md operating system rows updated from the run

## Notes

The Linux spike is measured; macOS is the owner's platform and still unmeasured. The two open items both need a clean
macOS account, so they wait for the owner pass.

The session-start item is met where it can be met from here, and the check says what it did not look at rather than
answering for it. A plugin's own hook cannot report that the plugins are missing, because a missing plugin has no hook
to run; the honest home is `skilliton status`, which the session start shows. It reads Claude Code's
`installed_plugins.json` and says so; Codex records its installs elsewhere and is not read. An installed plugin is not
a hook that ran, and the ok line says that too.
