# Running a company's Skillgate: fork, improve, release, verify

Kind: Living. For the technical lead or maintainer who owns a company's fork of this repository. Developers joining a project read docs/ONBOARDING.md instead.

## 1. Make the company fork

1. Fork this repository into the company's source host, or clone it into a private repository. Keep `packs/base/` unchanged, apart from the instruction template `packs/base/plugins/workflow/templates/harness.md`, which is yours to adapt.
2. Rename the marketplace if you want (`.claude-plugin/marketplace.json` `name`) and point the team settings template at the fork: `node scripts/skillgate.mjs project-settings --marketplace-repo <owner>/<repo> --marketplace-name <name>` previews what projects will receive.
3. Add company skills beside the base: `node scripts/skillgate.mjs new-skill <plugin> <skill> --pack <company>`, or bring in an existing skill folder after it is scanned for names, secrets and home paths: `node scripts/skillgate.mjs import <folder> --into <plugin> --pack <company>`.
4. Create the release signers file. Each person allowed to approve releases adds one line to an SSH `allowed_signers` file: `<their email> namespaces="git" <their public key>`. Give developers this file through a channel an attacker cannot also edit (device management, an internal page), never only from the repository itself.

## 2. From a lesson to an approved improvement

1. **A lesson arrives.** A project records it (`skillgate record lesson "<title>" --apply`) and proposes it: `skillgate propose <lesson file> --repo <fork> --apply` copies it, scrubbed, into `proposals/` in the fork. A proposal is not policy.
2. **Change the skill, check or template** on a branch in the fork.
3. **Prove it.** Add or update a regression scenario: a deterministic test where the behavior is code, or an eval case under the plugin's `evals/` where the behavior is the assistant's. Run the offline checks (`docs/MAINTAIN.md` step 2) and the eval (`claude plugin eval <plugin folder>`); summarize eval results with `node scripts/evidence.mjs` and never commit the raw results. Bump the plugin's version.
4. **Review** the pull request under the fork's normal rules. Look hardest at anything that executes: `hooks/`, `bin/`, `runtime/`, and any script a skill tells the assistant to run. Passing evals do not show that a hook is safe.
5. **Release.** On the fork's main branch: `node scripts/skillgate.mjs release create --version <x.y.z> --evidence <summary files> --apply`, commit the manifest, then an approver runs `node scripts/skillgate.mjs release sign <x.y.z> --apply` with their own git signing key and pushes the tag. `release list` shows approved, unapproved and withdrawn versions.

The manifest lists every installable file's hash, the project layout and migrations the release expects, the supported clients, and the evidence files. Approval is the signed tag, verified against the signers file; nothing else in the repository counts as approval.

## 3. What developers receive

- Claude Code updates a plugin when its version in the marketplace changes: `claude plugin marketplace update` then `claude plugin update <plugin>@<marketplace>` (measured, including a downgrade after a rollback); with auto-update on in the team settings it is documented to check at session start, not yet observed here. Codex: `codex plugin marketplace upgrade` refreshes a Git marketplace (a local-folder marketplace is read directly), then `codex plugin add <plugin>@<marketplace>` installs the new version (measured).
- `skillgate verify` on each machine compares the installed files with the approved manifests: VERIFIED, TAMPERED (files named), UNKNOWN VERSION (installed but never approved, for example a version pushed without a signed tag), WITHDRAWN, or NOT INSTALLED. Developers record your signers once with `skillgate trust add --company <name> --signers <file> --apply`. A release tag in your repository that does not verify makes every verify exit 2 until you delete it.
- A plugin update never edits a project. When a release changes the project layout or the instruction template, projects apply it with `skillgate migrate` (preview, then `--apply`), which checks for hand edits inside the managed blocks, keeps a backup and writes a receipt.
- Measured in `evidence/rehearsals/2026-09-16-company-release/`: a company fork, a signed release, installs in a clean Claude Code configuration and a clean Codex home, an improved skill released and received by both, the template migration applied and rolled back, a tampered install, an unsigned release with a changed hook, a rollback, a withdrawal and removal.

## 4. When a release is bad

- **Withdraw it:** an approver runs `node scripts/skillgate.mjs release withdraw <version> --reason "<why>" --apply` and pushes the tag. Verification then reports WITHDRAWN everywhere. Withdrawal does not uninstall anything by itself.
- **Roll back:** publish the last good content again, either by reverting the marketplace to it (Claude Code measured following a lower version on update) or by releasing a new version with the good content, signed like any other release. Delete any tag that should never have existed. Developers update, then verify.
- **Project migrations** are rolled back separately with `skillgate migrate --rollback <id>`, and only while the migrated files are unchanged.

## 5. Protect the shared branch of each application

Local guardrails stop an assistant's risky commands; they do not decide what merges. For that, each application repository keeps its checks in `.skillgate/delivery.json` and installs a trusted gate where merges happen:

- **A shared bare repository:** `skillgate delivery install --bare <repo.git> --approvers <signers file> --apply` adds a server-side check that tests the combined result of every push to a protected branch and requires an approver's signature on changes to the policy itself.
- **GitHub:** copy `templates/github/skillgate-delivery.yml` into the repository and turn on branch protection as docs/DELIVERY.md describes (required status check, branches up to date or a merge queue, code-owner review for policy files). Until a hosted rehearsal is recorded, treat this adapter as documented, not proved.
