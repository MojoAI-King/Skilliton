# Release record contract

Kind: Living. The implemented format of company releases, their approval, trust and verification (docs/CONTRACTS.md section 13). Code: `packs/base/plugins/workflow/runtime/lib/treehash.mjs`, `release.mjs`, `trust.mjs`, `verify.mjs` and the commands `release`, `verify`, `trust`, `propose`; tests: `scripts/release.test.mjs`. Anything marked **Not built** or **Not verified** below is still design or an open check, not behavior.

## What a release means

A company-approved release identifies the exact installable plugin bytes a company wants its developers to run. The manifest describes them; approval is an SSH-signed Git tag that each machine checks against its own trust file. A user-editable approval list, a green CI run or a plugin update is not approval.

Upstream publishing proposes a version to company maintainers. Company review and release authorize distribution. Installing a package and reconciling a project's generated files are separate operations with separate recorded outcomes. Project security observations stay in each application repository and are never part of a release.

## The manifest: `releases/<version>.json`

Written by `skilliton release create --version <x.y.z> [--repo <skills repo>] [--evidence <file>]... [--apply]` in the company skills repository, then committed by the maintainer.

```json
{
  "schema": "skilliton.release/1",
  "release": "1.2.0",
  "sourceCommit": "<full commit id the plugin folders were hashed from>",
  "createdAt": "2026-09-16T12:00:00.000Z",
  "marketplace": "<name in .claude-plugin/marketplace.json>",
  "components": [
    { "kind": "plugin", "name": "workflow", "version": "0.2.4", "path": "packs/base/plugins/workflow",
      "treeSha256": "<hex>",
      "files": [ { "path": "bin/skilliton", "sha256": "<hex>", "executable": true } ] }
  ],
  "projectLayout": 2,
  "migrations": ["0002-integrated-layout"],
  "clients": {
    "claude-code": { "catalog": ".claude-plugin/marketplace.json", "marketplace": "<name>", "plugins": ["workflow"] },
    "codex": { "catalog": ".agents/plugins/marketplace.json", "marketplace": "<name>", "plugins": ["workflow"] }
  },
  "evidence": [ { "kind": "release", "path": "evidence/releases/1.2.0/checks.md", "sha256": "<hex>" } ],
  "notes": ["<anything the manifest could not record, in plain words>"]
}
```

| Field | Meaning |
|---|---|
| `schema` | always `skilliton.release/1` |
| `release` | `MAJOR.MINOR.PATCH`; equals the file name and the tag |
| `sourceCommit` | HEAD when the manifest was built; every plugin folder matched it byte for byte |
| `components` | one entry per plugin listed in `.claude-plugin/marketplace.json`, in catalog order; `version` from the plugin's `.claude-plugin/plugin.json`; `path` relative to the repository; `files` sorted by path with each file's sha256 and executable bit |
| `projectLayout` | `LAYOUT_VERSION` of the runtime's `config.mjs` |
| `migrations` | ids (`NNNN-slug`) from the runtime's `lib/migrations.mjs` (`MIGRATIONS` array of `{ id }`, or `listMigrations()`); `[]` plus a note when the module or that export is not in this build |
| `clients` | per client: the catalog file, marketplace name and plugins it lists. When the repository has no `.agents/plugins/marketplace.json`, `codex` is `{ "catalog": null, "marketplace": null, "plugins": [], "note" }` |
| `evidence` | each `--evidence` file: `kind` (`release` under `evidence/releases/`, `rehearsal` under `evidence/rehearsals/`, `skill-evaluation` under `evidence/<commit>/`, else `other`), repository path and sha256 |
| `notes` | an addition beyond CONTRACTS section 13: statements the manifest cannot express as data, such as the missing migrations module |

Validation (used by `release sign`, `release list` and `verify`) rejects: a wrong schema or version; a sourceCommit that is not a full commit id; an unparseable `createdAt`; component or file paths that are absolute, contain `..`, `.`, empty parts, a backslash or control characters; duplicate names or paths; a component path inside another; a `.DS_Store` entry; a `treeSha256` that does not equal the hash of its own file list; migration ids that are not `NNNN-slug`; evidence without kind, path and sha256.

## The tree hash

`treeSha256` is the sha256 of the lines `<sha256>  <path>\n` (two spaces), one per regular file in the plugin folder, sorted by the UTF-8 bytes of the path, with `/` separators and `.DS_Store` files left out. It is the output format of `sha256sum`, so it can be reproduced without Skilliton:

```
cd <plugin folder> && find . -type f ! -name .DS_Store | sed 's|^\./||' | LC_ALL=C sort \
  | while IFS= read -r f; do sha256sum "$f"; done | sha256sum        # shasum -a 256 on macOS
```

Symbolic links, other non-regular files, file names that are not valid UTF-8 or contain control characters or a backslash, more than 20000 files, or more than 1 GB are refused (by `release create`) or reported as not verifiable (by `verify`). The executable bit is recorded per file and is not hashed, because clients and file systems do not all preserve it.

## Creating a manifest

`release create` previews by default and writes `releases/<version>.json` only with `--apply`. It refuses, writing nothing (exit 2), when:

- a plugin folder differs from HEAD in any way: a changed, deleted, untracked or ignored file, a changed executable bit, or a change hidden from `git status` (assume-unchanged, skip-worktree). The check compares Git blob ids of the files on disk with `git ls-tree HEAD`, not `git status`;
- the version already has a manifest (in the working tree or at HEAD) or a `skilliton-release/` or `skilliton-withdrawn/` tag;
- a plugin source is not a path inside the repository: an object source (GitHub, URL), an absolute path, a path with `..`, a path through a symbolic link, or a folder whose real location is outside the repository; `metadata.pluginRoot` is not supported;
- a plugin's `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` versions (or names) disagree, or the catalog entry names another version;
- the Codex catalog points a plugin at a different folder than the Claude Code catalog;
- an `--evidence` file is outside the repository, a link, or not committed exactly as it is;
- the release's workflow plugin has a migrations module and the running runtime is not that plugin (same folder or same tree hash), because runtime code never loads code from outside its own plugin folder.

## Approval and withdrawal

- **Approval:** `release sign <version> [--apply]` checks the manifest is committed at HEAD and unchanged, valid, unsigned, built from an ancestor of HEAD, and that every plugin folder still has its recorded tree hash; it requires `gpg.format ssh` and a configured signing key, then runs, with the maintainer's own configuration, `git tag -s skilliton-release/<version> -m "skilliton release <version>" -m "manifest-sha256: <sha256 of the committed manifest bytes>" <HEAD>`. Skilliton never passes a key. After tagging it confirms the tag carries an SSH signature.
- **Withdrawal:** `release withdraw <version> --reason "<one line>" [--apply]` runs `git tag -s skilliton-withdrawn/<version> -m "skilliton withdrawn <version>" -m "reason: <text>" <the approved commit>`. It requires the release tag to exist. The tagger date is the withdrawal time. Withdrawal changes what verify reports; it does not disable, remove or roll back installed copies.
- **Listing:** `release list [--repo] [--company]` shows every version found in `releases/*.json` and in tags as `approved`, `unapproved` (with the reason) or `withdrawn`. Exit 2 when trust is not configured or any tag or approved manifest does not check out.

A tag counts only when every one of these holds; anything else is "does not verify" and never approved:

1. it is an annotated tag object whose `tag` header equals its ref name and whose `type` is `commit` (a signed tag copied under another version's name is refused);
2. its signature, found the way Git finds it (the last line starting with a signature marker), is a single, complete SSH signature; a PGP, X.509 or malformed signature is not verifiable here even if some keyring would accept it;
3. `git -c gpg.ssh.allowedSignersFile=<trust file> -c gpg.ssh.program=ssh-keygen verify-tag <tag object id>` exits 0 and prints `Good "git" signature for <principal> ...`. Measured with git 2.51 and OpenSSH: a key missing from the file still prints `Good "git" signature with ...` and exits 1, so the word "Good" alone is not accepted;
4. its signed message starts with `skilliton release <version>` and has exactly one `manifest-sha256: <64 hex>` line (withdrawal: `skilliton withdrawn <version>` and one `reason: <text>` line);
5. for approval, `releases/<version>.json` at the tagged commit has exactly that sha256 and passes validation.

Git reads run with `GIT_NO_REPLACE_OBJECTS=1`, so a `refs/replace` object cannot stand in for a tag or manifest.

## Trust

`trust add --company <name> --signers <allowed_signers file> [--apply]` copies an SSH allowed_signers file (ssh-keygen(1), ALLOWED SIGNERS) to `$SKILLITON_TRUST_DIR/<name>.allowed_signers`, default `~/.config/skilliton/trust/`. It checks every line (principals, options, key type, key data structure, fingerprint) and refuses a private key, an invalid line, a trust folder inside a Git work tree, and a different file already trusted for that company (remove it first). A line without `namespaces="git"` is accepted with a note. `trust show [--company]` prints signers and SHA256 fingerprints; `trust remove --company <name> [--apply]` backs the file up under `$SKILLITON_BACKUPS/trust/` and deletes it. `release list` and `verify` use the named company's file, or the only one configured; several without `--company`, none, a symbolic link or an invalid file is exit 2.

## Verifying installed plugins

`verify [--client claude-code|codex] [--config-dir <dir>] [--source <skills repo path>] [--company <name>] [--json]` reads approved releases from `--source` (default: the skills repository the runtime runs from) and prints one line per installed company plugin, then a summary:

| State | Meaning |
|---|---|
| `VERIFIED` | its version is in an approved, unwithdrawn release and every file matches that release's tree hash. The hash does not cover the executable bit: a file the release marks executable that is not executable is named in `notRunnable` and makes the exit `1`, because the client cannot run it; a bit the release does not have is a note |
| `TAMPERED` | its version is released but the files differ; changed, added, missing and not-verifiable files are named |
| `UNKNOWN VERSION` | no approved release has that version (for example a marketplace branch that moved past the last release); when the files equal another approved version, a note says so |
| `WITHDRAWN` | its files match a release withdrawn by a verified withdrawal tag; the reason and date are shown |
| `NOT INSTALLED` | a plugin of the newest approved release with no install record on this client (an addition beyond CONTRACTS section 13) |

Installed locations come from each client's own records, whose formats are not documented and are labelled "read as observed":

- **Claude Code:** `<config dir>/plugins/installed_plugins.json`, `{ "version", "plugins": { "<plugin>@<marketplace>": [ { "scope", "installPath", "version", ... } ] } }`; config dir is `--config-dir`, else `$CLAUDE_CONFIG_DIR`, else `~/.claude`. One line per install record. An install path outside `<config dir>/plugins/cache/` gets a note. `known_marketplaces.json` is read only for display.
- **Codex:** folders `<CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/<version>/` (`--config-dir`, else `$CODEX_HOME`, else `~/.codex`); a version folder named `local` takes its version from the plugin's `.codex-plugin/plugin.json`, else `.claude-plugin/plugin.json`. Which folder Codex loads when several versions are cached is **not verified**; each is reported.

Company plugins are those whose marketplace name appears in an approved or withdrawn manifest (`clients.codex.marketplace` for Codex, falling back to `marketplace`) or in the source's own catalog. Others are listed in a note, not checked.

Exit codes: `0` every company plugin install is VERIFIED (and there is at least one) and every file its release marks executable is executable; `1` any other state, including nothing to verify or a lost executable bit; `2` trust not configured, any release or withdrawal tag that does not verify, an invalid approved manifest, an invalid client record, or a bad invocation; `3` the check itself failed. With `--json`, stdout is exactly one `skilliton.result/1` object, also on a refusal or failure; `details` holds the client, records path and format label, source, trust file, every release with its approval and withdrawal, every plugin line with its files, counts, problems and notes.

## Proposals: `proposals/<id>.md`

`propose <lesson file> [--repo <skills repo>] [--apply]` copies one lesson entry (its `- **ID:** <id>` line, else an entry-id file name) into the skills repository as `proposals/<id>.md`, with the header `# Proposal: <title>`, `Kind: Living. Improvement proposal.`, and the bullets `source lesson: <id>`, `date: <YYYY-MM-DD>`, `status: proposed; needs a regression scenario, review and an approved release`, followed by the lesson exactly. The whole text is first scanned in a temporary copy by `<repo>/scripts/scrub-check.sh --path` (names, dashes, home paths) and by the import secret-shape scan; a hit, a missing denylist, or a scan that cannot run refuses it (exit 2) without printing the matched text. A proposal changes nothing by itself.

## Not built, not verified

- **Not built:** `--source` as a URL (clone the repository and pass its path); components other than plugins (the runner, templates and catalogs ship inside the workflow plugin, so their bytes are covered as plugin files, not as separate components); client prerequisite and minimum versions in `clients`; publication state, update and rollback targets; a JSON form of `release list`; checks of evidence content beyond its sha256; verify does not re-check `sourceCommit` ancestry (sign does).
- **Measured:** installs from a clean clone into a clean Claude Code 2.1.273 configuration and a clean Codex 0.154.0-alpha.6.2 home verify with every file matching (evidence/rehearsals/2026-09-16-company-release, which also covers the update, tamper, unauthorized release, withdrawal, rollback and removal), and both clients kept every executable bit (a throwaway install probe on 2026-09-16: 11 of 11 files on each). A local-folder marketplace copies the folder as it is, untracked and ignored files included, so release installs are tested from a clone.
- **Not verified:** how either client picks among several cached versions; that the marketplace copy a client keeps holds every release tag; line-ending conversion on Windows checkouts; behavior on Git older than 2.34 or OpenSSH without `ssh-keygen -Y`.

## Update and recovery behavior

- **Built:** a plugin update never edits a project. `status` and the session-start Project state block report the installed runtime version, the version the project requires and pending migrations separately. `migrate` previews, refuses hand edits inside managed blocks, backs up what it replaces, writes a receipt, and rolls back while the migrated files are unchanged. `verify` checks installed bytes against approved releases. Package rollback does not reverse a project migration by itself.
- **Built (2026-09-21):** `pin` moves a skills clone between signed release tags and records each move in `<git dir>/skilliton-pin.json`; `join` pins the clone to the newest approved release before it writes anything. It checks out the commit the verified tag object names rather than the tag name, refuses an unsigned, unapproved, withdrawn or unknown version, refuses a tag re-made on another commit among the tags that clone already held, and refuses a clone with a changed tracked file.
- **Not built, and not possible today:** pinning a client's installed copy of a plugin. `claude plugin marketplace add` and `marketplace update` take no ref, tag or branch (measured 2026-09-21 on 2.1.276), so a client downloads whatever the source points at now; the clone is what gets pinned and `verify` is what reports an install that does not match an approved release (`docs/decisions/2026-09-21-pinning-pins-the-clone-because-a-client-2fa4.md`).
- **Not built:** a client's own update command reports success before anything is verified, and nothing runs `verify` after an update by itself; developers run it (docs/ONBOARDING.md section 5).
