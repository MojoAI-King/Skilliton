# The team settings template does not auto-update plugins

Kind: Living. Decision entry.

- **ID:** 2026-09-23-the-team-settings-template-does-not-auto-ba3c
- **Status:** proposed
- **Date:** 2026-09-23

## Decision

`templates/project-settings.json` and this repository's own `.claude/settings.json` set `extraKnownMarketplaces.skilliton.autoUpdate` to `false`, not `true`. A company's product repository, prepared from this template, no longer tracks the marketplace's plugin versions automatically.

## Why

A machine that holds client work updates its plugins by `skilliton pin --latest` (or `--release <x.y.z>`) followed by a signed release, never by tracking `main`. Automatic updates in the team settings would pull whatever the marketplace's default branch carries at session start, ahead of and independent from a signed release; a machine set up that way could pick up an unsigned, unreviewed change without anyone running `pin` or `verify`. The try-it path (INSTALL.md path 2, which this lane's N77 item also touched) is unsigned and for trying things out; it may turn auto-update on by hand, and INSTALL.md says so.

## Alternatives rejected

Leaving `autoUpdate: true` as the template default and relying on `skilliton verify` to catch drift afterward: rejected because verify is a check that runs after the fact, not a control that stops the pull in the first place, and the whole point of the signed-release path is that a machine's plugins move only when `pin` and a signed tag say so.

## Risk

A team that wants prompt security fixes from the marketplace no longer gets them without a person running `pin --latest` and a new signed release. This is deliberate: docs/CONTRACTS.md section 7 already gives release authority to the signed path, and DELIVERY.md documents that shared-branch trust runs on signed, reviewed changes rather than passive tracking.

## Reversibility

Fully reversible: a company that wants automatic updates on a specific machine sets `autoUpdate: true` in that machine's own `.claude/settings.json` (or `templates/project-settings.json` before running `project-settings --apply`), which is a one-line edit and takes effect at the next session start.

## Evidence

`node scripts/skilliton.mjs project-settings --dir <temporary prepared repo>` (preview only, nothing applied) shows the template still applies cleanly with `autoUpdate: false` in the resulting `.claude/settings.json`. `node --test scripts/skilliton.test.mjs` (198 checks) and `scripts/scrub-check.sh` both pass on the changed files. `docs/CONTRACTS.md` section 5 documents the `autoUpdate` key's mechanism but names no default value, so no sentence there needs to change; `evidence/rehearsals/2026-09-17-enrollment/SUMMARY.md` and the enrollment decision entries describe managed-settings drop-ins used in a separate rehearsal (device-management enrollment, not this template) and are unaffected. `docs/OWNER_TESTS.md` line 43 still shows a walkthrough example with `autoUpdate: true` for a company managed-settings drop-in, a different mechanism from the team template; flagged in LANE_REPORT.md's Merge-time expectations rather than changed here, since `docs/` is a main-only path for this lane.
