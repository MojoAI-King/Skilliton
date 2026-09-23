# Changelog

Kind: Living. One entry per signed release, from its manifest under `releases/`, plus what is on `main` since. Plugin versions are what a machine sees; the release number is what it trusts.

## Unreleased (main since 1.0.0)

- **Security (workflow 0.22.0):** the shared-branch gate can no longer be switched off with a replace ref: every git call it makes sets `GIT_NO_REPLACE_OBJECTS=1`, and updates to `refs/replace/` are rejected. A push whose checks rewrite the gate's hook, approvers file or `skilliton.*` settings is rejected. Only SSH signatures count, with the other verifiers pinned off. `join` no longer prints a credential typed into a URL. Found by an adversarial review on 2026-09-22; each fix has a test that failed before it.
- **The stop hook (workflow 0.22.0):** a clean working tree is never held for a checkpoint; before this, committing the checkpoint's own records triggered a reminder on a clean tree.
- **The release skill (workflow 0.22.0):** the checks run again on the manifest commit before `release sign` (B64).
- **The meter** prices `claude-opus-5-5` from the published pricing page (B63), and `scripts/token-direction.mjs` tables requests, context, compactions, read-guard refusals and gate runs per day.
- **INSTALL.md** for a person or an agent, a README front door, `docs/ARCHITECTURE.md`, and `scripts/checks.mjs` running inside a linked worktree.

## 1.0.0, 2026-09-22

The second signed release, and the first that runs its routines without a person: repositories are prepared and migrated at session start on a joined machine, maintenance and dispatch are asked for by the hooks, and Skilliton's own files cannot be removed by the assistant. Manifest `releases/1.0.0.json`, tag `skilliton-release/1.0.0`.

- workflow 0.21.0, guardrails 0.7.0, context-hygiene 0.3.0 (unchanged since 0.9.0), code-quality 0.2.1.
- Project layout 3.
- What changed since 0.9.0, newest first:

- guardrails 0.7.0: a command that passes only because the project turned a rule off gets a notice naming the setting (`systemMessage`, no permission decision), found by running that one rule again with only itself on (B50).
- workflow 0.21.0: `handoff.keepEarlier` (0 to 20, default 5) sets how many earlier notes stay in the handoff (B60); `--dir` accepts the repository root in another letter case on a case-insensitive filesystem (B56); `bin/skilliton` names Node.js 22 as the floor, the version CI runs (B11). The repository's own checks under `scripts/` are held to the 600 line ceiling with the files already past it pinned (B59), and the offline check list lives in `.github/workflows/checks.yml` alone (B43).
- workflow 0.20.1: the dispatch note and the stop hook's dispatch paragraph say small chores go through dispatch too (one lane), and the only reason to skip it is a prompt that is not a list of work; in the first live run the assistant did six small chores directly and then skipped dispatch as "not separate pieces of work".
- workflow 0.20.0: the prompt hook reads the prompt from `prompt`, the field Claude Code 2.1.278 sends (measured with a project hook that saved its own input); it read only `user_prompt`, the name in the hooks reference, so the dispatch note had never fired in a real session. The note now directs `/workflow:dispatch` before any code, and the stop hook asks once more in the same session when no `LANES.md` was written after that prompt (a `dispatch-reminded` event, once per prompt). The harness line reads enforced for Claude Code (B42).
- workflow 0.19.0: `skilliton maintain [--apply]`, the mechanical half of maintenance (indexes, security findings, a `maintain` journal event); the stop hook holds the session on an integration branch when a merge landed, or a day and a commit passed, since the last maintenance, once per commit, naming the command and the judgment half (`lib/maintain.mjs`); the harness block says so. On a joined machine a pending instruction migration is applied at session start the way preparation is, said in the block and left uncommitted.
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
