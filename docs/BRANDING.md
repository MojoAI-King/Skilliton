# Product naming and compatibility

Kind: Living.

**Skilliton is the current product name. Skillgate is its former name.** This is one evolved product, not a repository containing a separately named product. Use Skilliton in current documentation, diagrams, plugin descriptions and displayed product messages.

## Existing technical names

The following keep their existing spelling so current installations, scripts and project records continue to work:

- The `skillgate` command, `scripts/skillgate.mjs`, `bin/skillgate` and related filenames.
- The default `skillgate` marketplace, plugin installation identifiers and release tags.
- `.skillgate/` configuration and evidence paths, `SKILLGATE_*` environment variables, managed-block markers and schema/catalog identifiers.
- Existing launcher text and the setup comment used to recognize generated files safely. These are compatibility data, even where they contain the former product name.

These names refer to Skilliton. A future change to them needs a migration with upgrade and removal checks; changing the display name does not rename them.

## Historical records

Recorded test output, signed manifests, versioned catalogs, completed tasks, earlier decisions and archived plans keep the names recorded at the time. They are historical evidence, not current branding. The former decision to use different repository and product names is superseded by the [current naming decision](decisions/2026-09-16-skilliton-is-the-evolved-product-name-0be0.md).

## Distribution

The wording update ships in workflow 0.5.1. Existing prepared projects receive the renamed instruction block through the normal `0100-instructions-<hash>` migration, or an explicit `skillgate harness --apply`. Updating the plugin alone does not rewrite project documents. Earlier rehearsal results describe the versions named in those records, not a new live-client verification of 0.5.1.
