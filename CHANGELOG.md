# Changelog

Kind: Living. One entry per signed release, from its manifest under `releases/`, plus what is on `main` since. Plugin versions are what a machine sees; the release number is what it trusts.

## Unreleased (main since 0.9.0)

- workflow 0.15.9: `dispatch` names a plan line shaped like an item whose ID is not `N<digits>` and refuses instead of dropping it (B55).
- workflow 0.15.8: the security engine's file layer moved to `lib/security-io.mjs`; every public name re-exported, no caller changed.
- workflow 0.15.7: `import` and `new-skill` preview by default and write only with `--apply` (B54).
- workflow 0.15.6: the index says once, as a note, that a folder holds numbered entries from before this runtime, instead of one problem per file.
- workflow 0.15.5: `company join-file` writes a `skilliton.join/1` file outside any working tree; `join --from <file>` joins a machine with it.
- workflow 0.15.4: `join` names every missing flag at once and what the machine has already joined.
- workflow 0.15.3: the session-start handoff is labelled as a record, not an instruction.
- workflow 0.15.2: `join` judges the machine before the clone's releases, so the first release tag no longer refuses a join.
- workflow 0.15.1: the tree hash leaves a top-level `.in_use` entry out, so a client's in-use marker no longer reads as tampering.
- guardrails 0.5.2: a string handed to `bash -c`, `sh -c`, `eval` or `xargs` that names git asks first.
- code-quality 0.2.1: the three unshipped skills moved out of the installable plugin folder to `docs/archive/not-shipped-skills/`.
- Repository: README in a cold reader's order; `docs/README.md` as the index; `scripts/checks.mjs` runs CI's list locally; CONTRIBUTING, SECURITY and this file added; build-era documents archived. `docs/WHITE_PAPER.md`, `docs/PLAIN_GUIDE.md` and `docs/TROUBLESHOOTING.md` added, with PDFs built from them outside the repository.

## 0.9.0, 2026-09-21

The build-complete checkpoint: the first signed release. Manifest `releases/0.9.0.json`, tag `skilliton-release/0.9.0`, verified 7 of 7 from a fresh clone.

- workflow 0.15.0, guardrails 0.5.1, context-hygiene 0.3.0, code-quality 0.2.0.
- Project layout 3.
