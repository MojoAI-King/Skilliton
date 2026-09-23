# Security

Kind: Living.

## Reporting a problem

Open a private security advisory on the GitHub repository (Security tab, "Report a vulnerability") rather than a public issue. Say what you found, how to reproduce it, and which version (`skilliton verify` prints the installed release). Do not put a secret value in the report; name where it was.

## What this software does with your machine

- **No network code of its own.** One git command talks to a remote (`preflight`). Installs and updates go through the client's own plugin commands.
- **Every write outside a repository is listed** in `docs/IT-ALLOWLIST.md`, and CI fails when the code and that list disagree (`scripts/allowlist.test.mjs`). No administrator rights, nothing left running, no system paths (`scripts/footprint.test.mjs`).
- **Releases are signed.** A release is an SSH-signed git tag over a manifest that hashes every installable file; a machine trusts the signers its company hands it in a file that never travels through the repository. `skilliton verify` reports VERIFIED, TAMPERED, UNKNOWN VERSION, WITHDRAWN or NOT INSTALLED.
- **The guardrails hook** reads each shell command the assistant runs and blocks force-pushes to protected branches, skipped git hooks and secret-shaped commits. It does not cover a person's own terminal, other tools, or the inside of scripts and git aliases, and it says so.
- **Secret shapes are never printed.** The audit, the secrets collector and the security register refuse or report a match by rule name and location, never by value.

## What the guard is

The guardrails hook is a seatbelt against an assistant's ordinary and accidental commands, not a security boundary.

- **It reads command text.** It cannot see inside scripts, `bash -c`, `eval`, aliases or functions; a command that reaches a blocked action through one of those is not read at all.
- **A write to `.claude/settings.json` or `.claude/settings.local.json` can turn the hooks off.** The one way "enforced" holds against the assistant itself is a company delivering the hooks through Claude Code's managed settings: Claude Code's documented settings precedence places managed settings above local, project and user settings, so a session cannot override or disable them by editing its own files (read from Claude Code's documentation at https://code.claude.com/docs/en/managed-settings, not measured here).
- **`SKILLITON_GUARDRAILS=off` in the environment turns every check off for that session.** A company forbids setting it by policy; nothing in this repository enforces the prohibition.
- **The shared-branch gate is not a sandbox.** It runs a project's own checks under its own account and compares its hook, its approvers file and its git configuration before and after, so it detects tampering after the fact; it does not isolate the checks from the account that runs them (docs/DELIVERY.md, "What the local gate proves, and what it does not").

### Limits found by the 2026-09-23 reviews

Each is a way the hook's reading of command text falls short of the actions it names in "Blocked" and "Asks for confirmation first" above. One line each, with the release that is expected to carry the fix:

- **Option prefixes** the hook does not recognize as the flag they abbreviate (a `--force` or `--no-verify` spelled with an unhandled prefix or bundling) are not read as that flag: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **`--no-force` given after `--force-with-lease`** does not cancel the force-push it follows, because the hook does not read flag order the way git does: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **`git -c <config>` on a push, and a push run through a configured alias**, can change push behavior (for example a rewritten `push` alias, or `-c protocol.version=...`) the hook does not account for: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **A path or flag value holding an unresolved shell variable** (`$VAR`, not a command substitution) is judged by its literal text, not by what it expands to at run time: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **The commit-path size cap** (files over 10 MB checked by name only, see "Limits" in the guardrails skill) can pass a large secret-shaped file the content scan would otherwise catch: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **The discard verbs** asked for confirmation (`git reset --hard`, `git clean -f`, `git checkout .`, and the rest in "Asks for confirmation first") have forms the hook does not yet recognize as the same command: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **The record-deletion forms** guarded under "Removing what Skilliton keeps" have equivalent commands (beyond `rm`, `rmdir`, `mv`, `git rm`) that reach the same result without matching the guarded verb list: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.
- **A symlinked gate log or skills folder** lets a write land outside the path the hook checked, because the hook resolves a removal path through symbolic links only when the path already exists, not every path it reads: fixed in guardrails 0.9.0 and workflow 0.23.0, released in 1.2.0.

### Limits found by the second, 2026-09-23 review

- **The gate that protects its own check program** is not itself checked before the program runs: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **An in-place editor run on a record** can change it outside the path the hook checked: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **A shell fed a command from a pipe** is not read the way a command typed directly is: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **A write to the settings file**, beyond the forms already caught, still reaches it: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **A glob over a record folder** removes or changes files the guarded verb list does not name one by one: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **Command text over the size cap** is not scanned the way shorter command text is: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **The freshness check** reads a record's content in a way the review found it should not trust: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **The handoff hook, given a linked path,** does not resolve it the way the removal-path check does: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **The delivery reader's line bound** can be worked around by a file shaped to sit past it: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.
- **A hard-linked manifest** is not told apart from the file it links to: fixed in guardrails 0.10.0 and workflow 0.24.0, released in 1.3.0.

## What it is not

The security evidence register keeps observations tied to file fingerprints and marks them stale when their sources change. It is evidence-keeping for a team's own review; it is not a certification, an attestation, or a compliance pass, and nothing here claims one.

## Supported versions

The current signed release and the one before it. `releases/` holds every manifest. A withdrawn release is marked by a signed `skilliton-withdrawn/<version>` tag, not by a change under `releases/`: `skilliton release list` shows it as withdrawn, and `verify` reports its installs as WITHDRAWN.
