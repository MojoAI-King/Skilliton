---
name: release
description: "Cut a signed release of the company's Skilliton skills repository, in order and with nothing skipped, from the preconditions (a clean, pushed integration branch with green checks, every changed plugin's version bumped, a changelog entry, no pending migration) through the manifest built and committed, the tag signed with the approver's own key, the push, and the proof that a fresh clone sees it as approved. Use when the user says 'release', 'cut a release', 'ship x.y.z', 'tag the release', or when a batch of plugin changes is ready for every developer's machine."
---

# release: from a green integration branch to a tag every machine can verify

A release is what developers' machines trust: `join` pins a clone to the newest approved one, `verify` compares installed plugins with its manifest. So a release is only worth cutting when the branch is exactly what the manifest will describe, and only worth trusting when a person signed it. This skill walks that in order. Every writing command previews first; read the preview before adding `--apply`. Nothing here passes, prints or asks for a key: git signs with the person's own configured key.

**Where this applies.** A skills repository: `.claude-plugin/marketplace.json` at the root and a `releases/` folder. In any other repository, say so and stop; a project is not released, it is prepared. Pass `--repo "$(git rev-parse --show-toplevel)"` to every `release` command, because the `skilliton` on the path runs from an installed copy and would otherwise release the repository it came from.

## 1. Facts before anything is written

Run each and keep the output short. A failing line stops the release; say which one and what fixes it.

1. `git branch --show-current`: an integration branch (`main` unless `prepare.integrationBranches` says otherwise).
2. `git status --short`: empty. `release create` refuses uncommitted, untracked or ignored files inside a plugin folder on its own, but a dirty tree anywhere means the branch is not what a reviewer saw.
3. `git fetch -q && git status -sb | head -1`: neither ahead nor behind the upstream. A release of unpushed commits is a tag nobody else can check out.
4. `skilliton release list --repo <root>`: the last approved version, and that trust is configured on this machine (exit 2 says it is not; then `release list` cannot judge anything and neither can you).
5. The next version. Semantic versioning over the repository as a whole, not per plugin: patch for fixes, minor for a new skill, rule, command or gate behavior, major for a change that breaks a prepared project's contract (a layout change that needs a migration is minor when the migration is shipped with it). If the user named a version, check it against this and say so when it disagrees.
6. **Every changed plugin has a new version.** Installed copies update only when `plugin.json`'s `version` changes, so a plugin whose files changed since the last release but whose version did not is a release that reaches no machine. Compare each plugin's `.claude-plugin/plugin.json` `version` and its folder's `treeSha256` in the preview of `release create` (step 2) with the `components` list in `releases/<last approved>.json`: a different `treeSha256` with the same `version` is a stop. Bump it, commit, and start over from step 2.
7. `CHANGELOG.md` has an Unreleased section with at least one line, and it names every plugin whose version changed. A release with an empty changelog is a release nobody can read.
8. `skilliton status --dir <root>`: no pending migration, no attention lines. A template change that left migration 0100 pending is applied first (`skilliton migrate --apply`, its receipt committed).
9. The checks are green on this exact tree: the project's own runner (`node scripts/checks.mjs` in the base repository, `skilliton gate` where a delivery policy exists), read as a verdict with its log path, never through `head` or `tail`; and the hosted run for the pushed head (`gh run list --branch <branch> --limit 1`, then `gh run view <id> --json jobs` reading every step) when there is one. A check that was skipped is named as skipped.
10. Which committed files are the evidence for this release: the evidence notes for the batches it carries (`evidence/live/...`, a report card, an eval summary). `release create --evidence <file>` records each with its hash; a file outside the repository or uncommitted is refused.

## 2. Build and commit the manifest

    skilliton release create --version <x.y.z> --repo <root> --evidence <file> [--evidence <file>...]

Read the preview: every plugin with its version and `treeSha256`, the project layout, the migrations, the evidence, the clients. This is where step 6 is checked. Then the same command with `--apply`; it writes `releases/<x.y.z>.json` and nothing else.

Move the Unreleased entries in `CHANGELOG.md` under a heading for this version with today's date (read the clock), keeping the file's format, and leave a fresh Unreleased heading above it. Commit the manifest and the changelog together as `Release <x.y.z>`, and record a checkpoint. Do not push yet: the tag and the commit go together in step 4, so nobody fetches a manifest that has no signature.

## 3. Sign, as the approver

Only a person whose key is in the company's signers file signs. Check the configuration without printing any key: `git config --get gpg.format` prints `ssh`, and `git config --get user.signingkey` prints something (a path or a key line; do not paste it anywhere). When either is missing, stop and tell the user what to set; never offer to generate or pass a key.

    skilliton release sign <x.y.z> --repo <root>            # preview: the manifest is committed, valid, matches the tree
    skilliton release sign <x.y.z> --repo <root> --apply    # git tag -s skilliton-release/<x.y.z>

Exit 1 means a tag was created that is not SSH-signed (git fell back to another format): delete it with `git tag -d skilliton-release/<x.y.z>`, fix the configuration, sign again. Then `skilliton release list --repo <root>` must show the version as approved with its manifest hash; anything else is a stop, and the tag is deleted before anyone can fetch it.

## 4. Publish, then prove it from outside

    git push origin <branch>
    git push origin skilliton-release/<x.y.z>

The proof is a clone this checkout did not make: `git clone <url> <temporary folder>` and `skilliton release list --repo <that folder>` reporting the version approved with the same manifest hash. On this machine, after the client updates its installed plugins (`claude plugin update <plugin>@<marketplace>` for each, or a client restart where the marketplace auto-updates), `skilliton verify` reports VERIFIED against the new release; say plainly whether that ran or is still to run, because the install is the client's step and not the tag's.

Write an evidence note under `evidence/` (the commands, their verdicts, the manifest hash; no signer names, no key material) and commit it; then a checkpoint with `--handoff` on the integration branch.

## 5. What to tell the user

Keep the states apart, because each is a different fact: **manifest committed**, **tag signed** (by whom is in the tag, not in the message), **pushed**, **approved in a fresh clone**, **installed and verified on this machine**. Then the developers' side: a machine that joins now is pinned to this release; a machine already joined moves with `skilliton pin --latest --apply` (or `--release <x.y.z>`) followed by the client's plugin update, and `verify` expects every plugin of the newest approved release. Nothing in this skill saves anyone money or proves the release works on a machine it has not been run on; say what was measured.

## When a release is bad

`skilliton release withdraw <x.y.z> --reason "<why>" --repo <root> --apply` and push the tag; `verify` then reports WITHDRAWN everywhere, and nothing is uninstalled by that alone. The fix is a new version, released the same way. docs/RELEASING.md section 4 has the rollback cases.
