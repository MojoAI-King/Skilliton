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

## What it is not

The security evidence register keeps observations tied to file fingerprints and marks them stale when their sources change. It is evidence-keeping for a team's own review; it is not a certification, an attestation, or a compliance pass, and nothing here claims one.

## Supported versions

The current signed release and the one before it. `releases/` holds every manifest. A withdrawn release is marked by a signed `skilliton-withdrawn/<version>` tag, not by a change under `releases/`: `skilliton release list` shows it as withdrawn, and `verify` reports its installs as WITHDRAWN.
