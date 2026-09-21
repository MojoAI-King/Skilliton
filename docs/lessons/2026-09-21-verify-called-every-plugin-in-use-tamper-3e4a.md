# verify called every plugin in use TAMPERED, because the client writes a marker into the folder it verifies

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-verify-called-every-plugin-in-use-tamper-3e4a
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The first signed release, 0.9.0, was approved and `skilliton verify` was run on the machine that had just installed it. Every plugin whose cached folder a running session was using came back **TAMPERED**: "files differ from release 0.9.0: added: .in_use/24477, .in_use/29670, ..." The plugins that no session had opened yet read VERIFIED. Nothing had been changed by anyone.

## The mechanism

Claude Code writes a marker into a cached plugin's version folder while a session runs it: `.in_use/<pid>`, one small JSON file per process (`{"pid":24477,"procStart":"..."}`), observed on 2.1.278 on 2026-09-21 and not documented. Earlier builds wrote a single `.in_use` file in the same place. `verify` hashes the installed folder with `scanTree` in `runtime/lib/treehash.mjs`, whose only exclusion was `.DS_Store`, so the marker files were regular files the release did not list, which is the definition of "added". The verifier was reading the client's own bookkeeping as part of the package. The result is the worst message a verifier can give: a false alarm on every healthy install, at exactly the moment a person is checking whether their install is healthy.

## The fix

`runtime/lib/treehash.mjs` leaves a top-level `.in_use` entry out of the scan, whether it is a file or a folder of pid files (`EXCLUDED_TOP_LEVEL`), and its header comment and the reproduction recipe in `releases/SCHEMA.md` say so and why. Manifest validation in `runtime/lib/release.mjs` rejects a manifest that lists such a path, folded into the `.DS_Store` branch because that file is pinned at 614 lines. The workflow plugin is 0.15.1. The signed release 0.9.0 is unaffected: the repository's plugin folders carry no marker, so their tree hashes did not change, and after the fix the same machine reads all 7 installs VERIFIED.

## The rule

A verifier hashes the package, never the folder. Anything the client writes into an install folder for its own bookkeeping is excluded by name and documented as the client's, with the version it was observed on, and a false TAMPERED is treated as a defect of the verifier, not as noise the user learns to ignore. Every new client version is run through `verify` while a session is open, because a marker is only written while the plugin is in use.

## What now enforces it

`scripts/release.test.mjs`: in the "added, missing and linked" case a `.in_use/24477` marker is written into an installed plugin and `verify` must still read VERIFIED for it, and once a real file is added the line must name that file and never `in_use`. The test's own shell reproduction of the tree hash carries the same exclusion, so the recipe in `releases/SCHEMA.md` and the code cannot drift apart without that assertion failing. Nothing yet runs `verify` against a new Claude Code build automatically; that stays a step of the owner pass.
