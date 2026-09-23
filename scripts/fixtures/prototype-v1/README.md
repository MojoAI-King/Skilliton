# Prototype v1 fixtures

Kind: Reference. Test input only; nothing here ships or runs in a user's project.

These three files are byte-for-byte copies of the standalone prototype released at commit `0bc2a05` (`23aae41` until the history rewrite of 2026-09-23, which kept the tree and the author date; `23aae41` is in no clone made since):

| File | Source |
|---|---|
| `prepare.mjs` | `git show 0bc2a05:scripts/prepare.mjs` |
| `project-files.mjs` | `git show 0bc2a05:scripts/project-files.mjs` |
| `security-evidence.mjs` | `git show 0bc2a05:scripts/security-evidence.mjs` |

`scripts/migrate.test.mjs` runs this `prepare.mjs --apply` in a temporary Git repository to build a real layout-1 project (copied runtime under `.skillgate/bin/`, `skillgate:project` blocks), then migrates it with the current runtime. The same test checks that `packs/base/plugins/workflow/runtime/lib/prototype-v1.mjs` still agrees with these files: the runtime hash and the two block renderers.

**Do not edit these files**, not even to fix a lint warning or a typo. Migration `0002-integrated-layout` recognises layout-1 content by exact bytes, so an edited fixture would test a prototype that never existed. To confirm a copy is intact, compare its sha256 with the output of the matching `git show` command above; `scripts/migrate.test.mjs` pins the three digests, so the check runs in any checkout, and compares with the commit wherever the clone is not shallow. `scripts/security-evidence.test.mjs` runs this `security-evidence.mjs` as the prototype runtime.
