# Machine setup runs from a clone of the company repository, with a receipt

Kind: Living. Decision entry.

- **ID:** 2026-09-16-machine-setup-runs-from-a-clone-of-the-c-fceb
- **Status:** accepted
- **Date:** 2026-09-16

## Decision

`skillgate join` sets up a developer's machine (PLAN.md M7). A developer clones the company skills repository and runs `node <clone>/scripts/skillgate.mjs join --company <name> --signers <file>`, which previews, then with `--apply` adds the company marketplace to each coding client found, installs the plugins the team template enables, trusts the release signers, writes a `skillgate` launcher into `~/.local/bin`, and runs verify against the clone. A receipt per company records every change, so `join --undo` removes exactly what join added.

The design choices, each for a stated reason:

1. **The clone is the verify source.** Measured on 2026-09-16: Claude Code keeps a GitHub marketplace as a shallow, single-branch clone, and neither client's copy holds release tags, so neither can stand in for the clone verify needs. join refuses a shallow clone for the same reason.
2. **No download-and-run installer.** The developer runs code from a clone they made with git, not a script piped from the network into a shell.
3. **The signers file comes from outside the repository**, as `trust add` already requires, so a pull cannot change whom a machine trusts.
4. **The launcher never edits a shell profile.** When `~/.local/bin` is not on PATH, join prints the line to add. An existing file there that is not this company's launcher is never replaced.
5. **A client binary runs only to make a change.** Install state is read from the clients' own files, the way verify reads them, because every Codex invocation (even `--version`) writes into its home: a preview, a repeat and a refusal therefore change nothing.
6. **The receipt is rewritten after every step**, through a temporary file, so a failure part way leaves an accurate record for undo. Undo removes a signers file or launcher only when its sha256 still matches, and keeps a marketplace other plugins were installed from.

## Why

The owner chose one-command setup per machine as the milestone after making a fork the company's own. Installing by hand took four to six commands per client, a separate clone for verify, and a manual trust step.

## Alternatives rejected

- A `curl | sh` bootstrap: unreviewable code run with the user's rights, and it still needs git, Node and a signers file.
- An npm package run with `npx`: adds a registry and its install scripts to the trust chain, and the package would not carry the release tags verify needs.
- Using the client's marketplace copy as the verify source: measured shallow and without tags.
- Editing shell profiles to add `~/.local/bin` to PATH: changes files people maintain by hand, across shells join cannot all parse.

## Risk

The launcher runs whatever the clone holds, so pulling the clone changes the terminal command's code (the installed plugins still change only through the client's update and verify). A private GitHub repository and a GitHub source holding signed release tags are not yet exercised. After undo, Claude Code leaves empty settings entries and its downloaded plugins, and Codex keeps an empty marketplace folder in its cache.

## Reversibility

EASY. `join --undo --company <name> --apply`.

## Evidence

`evidence/rehearsals/2026-09-17-machine/SUMMARY.md` (8 of 8 on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2, including installs from this repository's GitHub source); `scripts/join.test.mjs` (36 tests with stand-in clients, including a regression for each finding of the security-first review); the client measurements in docs/CLIENTS.md.
