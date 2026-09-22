# Changelog

Kind: Living. One entry per signed release, from its manifest under `releases/`, plus what is on `main` since. Plugin versions are what a machine sees; the release number is what it trusts.

## Unreleased (main since 0.9.0)

- workflow 0.18.0: on a machine that has joined, a repository with no `.skilliton/config.json` is prepared at its first session start (`lib/auto-prepare.mjs`: the same files `prepare --apply` writes, left uncommitted, said in the block's first note); the join file and receipt carry `"prepare": "auto" | "offer"` (`company join-file --prepare offer`); an empty `.skilliton-off` at the root or a `skilliton-off` file inside `.git` keeps a repository out, and `SKILLITON_AUTO_PREPARE=off` turns it off for a session, each said in the block. The stop hook no longer asks for a checkpoint in a repository that is not prepared.
- workflow 0.17.1: the managed block's guardrails line names the removal rule and the managed block guard (B62); migration 0100 is pending in every prepared project until `skilliton migrate --apply`, which replaces the text between the markers only. The session-start records line in a never-prepared repository says once that none of the records is in Git instead of listing them twice.
- workflow 0.17.0: the `release` skill: a signed release cut in order (preconditions, manifest, signature, push, proof from a fresh clone), with an eval case in which an untracked file inside a plugin folder stops it before anything is written.
- workflow 0.16.0: the delivery gate rejects a push whose result removes what Skilliton keeps in the project unless an approver signed the commit that removes it (`lib/delivery-persist.mjs`); session start and `status` name a missing record with the command that restores it, and a tracked-but-missing `.skilliton/config.json` as removed by hand, in place of the offer to prepare (`lib/records-restore.mjs`). B61.
- guardrails 0.6.0: `rm`, `rmdir`, `mv` and `git rm` aimed at a `.skilliton` folder, the record files, the entry folders, `CLAUDE.md` or `AGENTS.md` are denied, with `skilliton remove --apply` as the route; a new `managed-block-guard.mjs` hook refuses a `Write`, `Edit` or `MultiEdit` that would take the managed block out of `CLAUDE.md` or `AGENTS.md`; `guardrails.protectRecords: false` turns both off. Without `CLAUDE_PROJECT_DIR` the project is the repository root of the command's folder. B61.
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
