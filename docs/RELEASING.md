# Running a company's Skilliton: fork, improve, release, verify

Kind: Living. For the technical lead or maintainer who owns a company's fork of this repository. Developers joining a project read docs/ONBOARDING.md instead.

## 1. Make the company fork

1. Fork this repository into the company's source host, or clone it into a private repository. Keep `packs/base/` unchanged, apart from the instruction template `packs/base/plugins/workflow/templates/harness.md`, which is yours to adapt.
2. Give the fork its own name and point projects at it: `node scripts/skilliton.mjs company init --name <company> --marketplace-repo <owner>/<repo>` previews the change to `.claude-plugin/marketplace.json` (marketplace name and owner) and `templates/project-settings.json` (the marketplace, its GitHub repository and the enabled plugins); add `--apply` to write it. Skipping this leaves projects installing the upstream plugins. `--name` is the short company name developers also pass to `skilliton trust add --company`; `--marketplace-name` defaults to it.
3. Add company skills beside the base: create a plugin in your own pack with `node scripts/skilliton.mjs new-plugin <plugin> --pack <company> --apply` (it lists the plugin in the catalog and enables it in the team template), then `node scripts/skilliton.mjs new-skill <plugin> <skill> --pack <company> --description "<when to use it>"`, or bring in an existing skill folder after it is scanned for names, secrets and home paths: `node scripts/skilliton.mjs import <folder> --into <plugin> --pack <company>`.
4. Create the release signers file. Each person allowed to approve releases adds one line to an SSH `allowed_signers` file: `<their email> namespaces="git" <their public key>`. Give developers this file through a channel an attacker cannot also edit (device management, an internal page), never only from the repository itself.

Measured in `evidence/rehearsals/2026-09-16-fork/`: a fork renamed with `company init`, a company plugin and skill, strict validation, a signed release, and installs from the renamed marketplace verified on Claude Code and Codex.

## 2. From a lesson to an approved improvement

1. **A lesson arrives.** A project records it (`skilliton record lesson "<title>" --apply`) and proposes it: `skilliton propose <lesson file> --repo <fork> --apply` copies it, scrubbed, into `proposals/` in the fork. A proposal is not policy.
2. **Change the skill, check or template** on a branch in the fork.
3. **Prove it.** Add or update a regression scenario: a deterministic test where the behavior is code, or an eval case under the plugin's `evals/` where the behavior is the assistant's. Run the offline checks (`docs/MAINTAIN.md` step 2) and the eval (`claude plugin eval <plugin folder>`); summarize eval results with `node scripts/evidence.mjs` and never commit the raw results. Bump the plugin's version.
4. **Review** the pull request under the fork's normal rules. Look hardest at anything that executes: `hooks/`, `bin/`, `runtime/`, and any script a skill tells the assistant to run. Passing evals do not show that a hook is safe.
5. **Release.** On the fork's main branch: `node scripts/skilliton.mjs release create --version <x.y.z> --evidence <summary files> --apply`, commit the manifest, then an approver runs `node scripts/skilliton.mjs release sign <x.y.z> --apply` with their own git signing key and pushes the tag. `release list` shows approved, unapproved and withdrawn versions.

The manifest lists every installable file's hash, the project layout and migrations the release expects, the supported clients, and the evidence files. Approval is the signed tag, verified against the signers file; nothing else in the repository counts as approval.

## 3. What developers receive

- **Setting up a machine:** a developer clones your fork and runs `node <clone>/scripts/skilliton.mjs join --company <name> --signers <file> --apply` (docs/ONBOARDING.md). It installs from the marketplace your team template names, trusts the signers file you gave them, and ends with verify; `join --undo` takes it back out. Measured on Claude Code and Codex in `evidence/rehearsals/2026-09-17-machine/`, including installs from a GitHub source.
- **The clone is pinned, the download is not.** `join` moves the developer's clone of your fork to the newest approved release, and `skilliton pin --release <x.y.z> --apply` moves it between releases afterwards; both follow the signature rather than the ref. Neither client offers a way to install a plugin from a chosen tag (`claude plugin marketplace add` and `marketplace update` take no ref, tag or branch option, measured 2026-09-21 on 2.1.276), so a pinned clone gives a signature-checked commit for everything Skilliton runs and for the catalog a client reads, while `verify` is what catches an installed plugin that does not match an approved release. Say this much and no more (`docs/decisions/2026-09-21-pinning-pins-the-clone-because-a-client-2fa4.md`).
- Claude Code updates a plugin when its version in the marketplace changes: `claude plugin marketplace update` then `claude plugin update <plugin>@<marketplace>` (measured, including a downgrade after a rollback); with auto-update on in the team settings it is documented to check at session start, not yet observed here. Codex: `codex plugin marketplace upgrade` refreshes a Git marketplace (a local-folder marketplace is read directly), then `codex plugin add <plugin>@<marketplace>` installs the new version (measured).
- `skilliton verify` on each machine compares the installed files with the approved manifests: VERIFIED, TAMPERED (files named), UNKNOWN VERSION (installed but never approved, for example a version pushed without a signed tag), WITHDRAWN, or NOT INSTALLED. A file the release marks executable that lost its executable bit keeps VERIFIED but makes verify exit 1 and is named, because the client cannot run it (both clients kept every bit on a clean install, measured). Developers record your signers once with `skilliton trust add --company <name> --signers <file> --apply`. A release tag in your repository that does not verify makes every verify exit 2 until you delete it.
- A plugin update never edits a project. When a release changes the project layout or the instruction template, projects apply it with `skilliton migrate` (preview, then `--apply`), which checks for hand edits inside the managed blocks, keeps a backup and writes a receipt.
- Measured in `evidence/rehearsals/2026-09-16-company-release/`: a company fork, a signed release, installs in a clean Claude Code configuration and a clean Codex home, an improved skill released and received by both, the template migration applied and rolled back, a tampered install, an unsigned release with a changed hook, a rollback, a withdrawal and removal.

## 4. When a release is bad

- **Withdraw it:** an approver runs `node scripts/skilliton.mjs release withdraw <version> --reason "<why>" --apply` and pushes the tag. Verification then reports WITHDRAWN everywhere. Withdrawal does not uninstall anything by itself.
- **Roll back:** publish the last good content again, either by reverting the marketplace to it (Claude Code measured following a lower version on update) or by releasing a new version with the good content, signed like any other release. Delete any tag that should never have existed. Developers update, then verify.
- **Project migrations** are rolled back separately with `skilliton migrate --rollback <id>`, and only while the migrated files are unchanged.

## 5. Protect the shared branch of each application

Local guardrails stop an assistant's risky commands; they do not decide what merges. For that, each application repository keeps its checks in `.skilliton/delivery.json` and installs a trusted gate where merges happen:

- **A shared bare repository:** `skilliton delivery install --bare <repo.git> --approvers <signers file> --apply` adds a server-side check that tests the combined result of every push to a protected branch and requires an approver's signature on changes to the policy itself.
- **GitHub:** copy `templates/github/skilliton-delivery.yml` into the repository and turn on branch protection as docs/DELIVERY.md describes (required status check, branches up to date or a merge queue, code-owner review for policy files). Until a hosted rehearsal is recorded, treat this adapter as documented, not proved.
