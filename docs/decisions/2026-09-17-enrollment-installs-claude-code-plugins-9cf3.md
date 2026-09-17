# Enrollment installs Claude Code plugins with a managed drop-in plus a first-login install

Kind: Living. Decision entry.

- **ID:** 2026-09-17-enrollment-installs-claude-code-plugins-9cf3
- **Status:** accepted
- **Date:** 2026-09-17

## Decision

For Claude Code, the M12 enrollment bundle delivers the company plugins in two parts. A managed-settings drop-in registers the company marketplace and enables its plugins. A first-login install, run as each person before their first session, installs them from the command line; this is what `skilliton join` already does for Claude Code. A read-only plugin seed is not the default; it stays an option for a pinned release ring, to be measured when rings are built.

## Why

The enrollment rehearsal (evidence/rehearsals/2026-09-17-enrollment: 8 of 8 on Claude Code 2.1.274, a clean Linux container, no login) measured that the drop-in alone installs the plugins with no developer command, but from the GitHub marketplace a person's first two sessions run without the company skills and hooks: the first start registers the marketplace, the second installs the plugins, and only the third loads them. Those first sessions are when a new person most needs the handoff, the guardrails and the instructions. Running the install before the first start made that start active, needed no login, and Claude Code then listed the plugins with scope `managed`. Claude Code documents that plugins force-enabled by managed settings cannot be disabled through local settings, so the drop-in keeps its hold.

## Alternatives rejected

- The drop-in alone: no developer command, but two sessions without the company plugins.
- A plugin seed placed by device management: active only from the second start, never auto-updates (measured, and documented), and has to be rebuilt and placed again for every release.
- Asking each person to run install commands: the goal is no developer command.
- The `directory` marketplace source, active at the second start: Claude Code documents it as for development only.

## Risk

- Measured with a placeholder key and a model endpoint that never answers, not a claude.ai login. An interactive first session after logging in may register and install sooner. Measure again when a login in a clean configuration is available (docs/BACKLOG.md B3).
- The first-login install runs as the person, not as root, so each device management tool needs a step that runs in the person's context. Check that per tool when the bundle is built.
- `claude plugin marketplace add` records the marketplace in the person's user settings, which offboarding must remove.
- The behavior belongs to Claude Code 2.1.274. The rehearsal asserts it, so a later version that behaves differently shows as FAIL.
- macOS and Windows are not measured.

## Reversibility

Easy. The bundle is not built yet; this only sets what M12 builds first.

## Evidence

`scripts/rehearsals/enrollment.mjs` (commit 0c6855a, and 466515c after an independent review) and evidence/rehearsals/2026-09-17-enrollment, recorded from 466515c. Claude Code documentation retrieved 2026-09-17: the settings reference entries `enabledPlugins` and `extraKnownMarketplaces`, and "Pre-populate plugins for containers" in the plugin marketplaces page.
