# Product naming

Kind: Living.

**Skilliton is the product's name. Skillgate is its former name.** This is one evolved product. Since milestone M9 (PLAN.md section 7; workflow 0.6.0, guardrails 0.3.0, context-hygiene 0.2.0) every current technical name is Skilliton too: the `skilliton` command, `scripts/skilliton.mjs` and `bin/skilliton`, the default `skilliton` marketplace, the `.skilliton/` project folder, `SKILLITON_*` environment variables, the managed markers, format and schema names, the `skilliton-release/` and `skilliton-withdrawn/` tags, the machine folders under `~/.config/skilliton/`, and the GitHub delivery template.

## What kept its earlier name, and why

- **Security catalog versions** `skillgate-starter-1` and `skillgate-baseline-2`, and the `SG-` control IDs. Stored observations name them, and renaming them would mean rewriting evidence records, which must never look like a renewed assessment (DECISIONS.md O23). A later catalog version can carry new names through a catalog migration.
- **Recorded evidence, dated records and archives:** rehearsal and eval evidence, signed manifests, task, decision and lesson entries, handoff and backlog archives, and archived plans describe what ran, under the names it ran with.
- **The standalone prototype's exact bytes** (`runtime/lib/prototype-v1.mjs` and `scripts/fixtures/prototype-v1/`), which migration 0002 recognises.

`scripts/names.test.mjs` enforces this: any other use of the earlier name fails, and each allowed file, phrase or section carries its reason. In the runtime, only `runtime/lib/legacy-names.mjs` spells the earlier technical names, apart from the prototype's own markers and catalog versions; the guardrails hook, the scrub check and the status line setup name the few earlier paths they report, each allowed line by line.

## Moving from the earlier names

- **A prepared project:** run `skilliton migrate` to preview migration `0003-skilliton-names`, then `skilliton migrate --apply`, and commit the result with its receipt. Until then every other command refuses the project and says so. `skilliton migrate --rollback 0003-skilliton-names --apply` restores the earlier layout exactly while nothing it wrote has changed. The migration never rewrites a record's own words; its notes list any that still name the earlier command. It keeps the earlier `.gitignore` lines beside the current ones, because other clones and branches may still write private evidence to the earlier folder, and it checks that the moved evidence is ignored before telling you to commit.
- **A shared repository with the delivery gate:** a branch whose policy is still at `.skillgate/delivery.json` stays protected by it. Commit the project's migration signed by an approver, because it moves the policy. To put the gate itself on the current runtime, move the earlier `pre-receive` hook out of the hooks folder, unset its two earlier git settings, and run `skilliton delivery install` again; install names both settings when it finds the earlier hook.
- **A machine set up with `join`:** undo that setup with the release that wrote it, from a clone checked out at a commit before the rename, then run `skilliton join`. The current `join` refuses until the earlier receipt is gone, so no setup is recorded twice.
- **Release signers, releases and settings:** a signers file at the earlier location is not trusted automatically; `trust add` names it. Releases tagged under the earlier prefix are re-created under the current one. Earlier environment variables, the earlier denylist location and earlier status line backups are named wherever they are found, never read.

docs/CONTRACTS.md section 16 lists every piece of earlier state and what the runtime does with it.

## Distribution

The rename ships in workflow 0.6.0, guardrails 0.3.0 and context-hygiene 0.2.0, from the marketplace now named `skilliton`. Updating the plugins does not move a project: its migration does. Rehearsal results recorded before M9 describe the versions and names in their own records.
