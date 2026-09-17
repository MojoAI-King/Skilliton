# What has been exercised

Kind: Living. Where Skilliton has and has not actually been run: platforms, versions, scale, transports and signing setups, plus the security-review cases from PLAN.md section 8. Consolidated on 2026-09-16 from the "not done or not verified" lists of the six integration lane reports (untracked `LANE_REPORT.md` files in the lane worktrees, which can be removed) and from measurements made since. An item moves to "exercised" only with the run that proved it. Client behavior itself is in docs/CLIENTS.md.

## Platforms and versions

| Area | Exercised | Not exercised | Next step |
|---|---|---|---|
| Operating system | macOS 26 (Darwin 25.6): every suite, the live sessions and the rehearsals. Linux in CI (ubuntu-latest): every offline suite, with bash 5.2.21, git 2.55.0, GNU tar and dash as `/bin/sh` | Windows. `bin/skilliton` and every hook are bash scripts | Say "macOS and Linux" wherever support is stated, until Windows is decided |
| Node.js | 25.8.1 locally and 22.23.2 in CI (every suite); 20.19.4 locally for the lifecycle tests only | 18, the floor that docs/ONBOARDING.md and `bin/skilliton` state | Run the suite on Node 18 in CI, or raise the stated floor to a version CI runs (docs/BACKLOG.md B11) |
| Bash | 3.2.57 locally, 5.2.21 in CI | other shells | none planned |
| Git | 2.51.1 locally, 2.55.0 in CI | older than 2.34, which release signing needs (releases/SCHEMA.md) | none planned |
| Claude Code | 2.1.273: installs, updates, headless live sessions, evals | interactive sessions (O6, O7); other versions | docs/BACKLOG.md B5 |
| Codex CLI | 0.154.0-alpha.6.2: installs, verify, prompt input | lifecycle hooks in real sessions (O9) | docs/BACKLOG.md B2 |

## Scale

- Not measured: how long the session-end hook's `git status` takes on a large repository (it gets one second, because Claude Code shares a short budget among SessionEnd hooks; docs/CONTRACTS.md section 11), and the cost of re-verifying security evidence file manifests on a large repository.

## Delivery gate

- Exercised: pushes over the local file transport to a bare repository with the installed pre-receive hook (`scripts/delivery.test.mjs`, the demo), on macOS and in Linux CI.
- Not exercised: SSH and HTTP transports; shared server accounts (`safe.directory`, file ownership); concurrent pushes; sha256 object-format repositories; submodules; file names that are not UTF-8; LFS or other content filters during archive verification; the GitHub adapter on a hosted repository (O15, docs/BACKLOG.md B4).

## Releases and signing

- Exercised: git SSH signing with throwaway ed25519 keys that have no passphrase (`scripts/release.test.mjs`, the company release rehearsal). A fork renamed with `company init` (marketplace `acme-skills`) with a plugin outside `packs/base` (license `UNLICENSED`, accepted by `claude plugin validate --strict` on 2.1.273), released, installed from a local folder and verified on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2 (fork rehearsal).
- Exercised: a marketplace added from a GitHub `owner/repo` source on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2, from this public repository with no login (machine rehearsal J8, evidence/rehearsals/2026-09-17-machine); it has no signed release, so verify reports UNKNOWN VERSION there.
- Not exercised: a private GitHub repository (credentials); a GitHub source holding signed release tags (this repository has none until the owner signs one, B6); update, tamper, rollback and withdrawal under a renamed marketplace (the company release rehearsal keeps the default name).

## Machine setup (`join`)

- Exercised: `join` and `join --undo` on clean Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2 homes with a signed release, a marketplace and plugin installed by hand beforehand, a repeat, and three refusals (machine rehearsal J1 to J7); stand-in clients in CI (`scripts/join.test.mjs`: failure part way, changed launcher and signers, several receipts).
- Not exercised: the launcher from a real shell session with `~/.local/bin` on PATH (the rehearsal runs it by path); shells other than `/bin/sh` starting it; a person's existing Claude Code or Codex configuration; several companies joined on one real machine; Windows.
- Not exercised: passphrase-protected keys, ssh-agent, third-party signing programs; a present `.agents/plugins/marketplace.json` (the Codex catalog path, its path-mismatch refusal and `clients.codex` recording); `release create` with evidence of kind `skill-evaluation` or `other`; which cached version Codex loads when several are cached; whether a client's marketplace clone holds release tags.

## Endpoint security: the allow list, the footprint and the preflight check (M12)

- Exercised: docs/IT-ALLOWLIST.md held to the code by `scripts/allowlist.test.mjs` (every program the hooks, launchers and runtime start, read from the shell and JavaScript code; every place the code reaches outside a repository; a scenario in an empty home folder that runs join, verify, doctor, the status line, preflight, prepare, the four lifecycle hooks, the four shell hooks and join --undo, and leaves 357 paths, every one inside a listed location); the small-footprint rules by `scripts/footprint.test.mjs` (no network code, no administrator rights, nothing left running, no system paths, every shipped file a text script, no code built at run time, only the product's own file modes); `skilliton preflight` against blocks made on purpose on a real machine (`scripts/preflight.test.mjs`): a program taken off PATH, a program present but not runnable by this user, a program whose exec fails, a program a hook needs, a folder this user may not write, a plugin folder whose scripts may not run, a repository behind a proxy that refuses the connection, a marketplace folder with no catalog, and `join` stopping before it writes anything when a folder it needs is blocked.
- Not exercised: **any endpoint-security product** (no ThreatLocker or similar device is available; docs/BACKLOG.md B29), so a block one of those products makes may look different from the conditions above; a policy that lets a coding tool's file be found but stops it starting (the check never starts a coding tool); Windows; a private company repository needing credentials (B31).

## Enrollment (M12 spike)

- Exercised: a Claude Code managed-settings drop-in placed by root in `/etc/claude-code/managed-settings.d/` on a clean Debian container (`node:22-bookworm-slim`, arm64) with Claude Code 2.1.274 and an unprivileged user; marketplaces from GitHub (this public repository) and from a folder on the machine; a read-only plugin seed; a first-login install (evidence/rehearsals/2026-09-17-enrollment).
- Not exercised: a claude.ai or Console login (starts used a placeholder key and a model endpoint that never answers); an interactive session after logging in; macOS profiles and Windows registry values; x86_64; other tools' managed files; `strictKnownMarketplaces`; `ref` pins and rings; offboarding; a real Intune or Jamf tenant.

## Renaming from the earlier names (M9)

- Exercised: migration `0003-skilliton-names` on a project prepared by the real earlier release (commit e5900d5, run from Git history), with a decision entry, its index, team settings and ignored private evidence: other commands refuse, preview writes nothing, apply moves everything, prepare then finds nothing missing, rollback restores every file exactly (scripts/rename.test.mjs); its refusals (a non-empty `.skilliton/`, a link, a lock, a file over 1 MB, reformatting team settings, a hand-edited block); a prototype project through 0002 and 0003 (migrate test, project rehearsal G1); this repository's own migration; a shared branch whose policy is at the earlier path, with real pushes (delivery test); the reports for an earlier join receipt, signers file, installs, release tags, delivery hook, variables, denylist and status line backups; guardrails honouring an unmigrated project's settings. Fork (7 of 7), machine (8 of 8, including installing the renamed marketplace from this repository's GitHub source), company release (18 of 18) and project (9 of 9) rehearsals rerun under the new names on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2, on commit 5a67e74 after the independent review's fixes; a merge that tries to bring back an earlier policy, for the current and the earlier path (delivery test).
- Not exercised: a machine actually joined with the earlier release and then undone with it (the refusal is tested with a receipt file); a real shared repository whose gate was installed by the earlier release and reinstalled; a project whose observations name files under the earlier folder; Windows paths for any of it.

## Security evidence

- Not exercised: interrupting a running collector check (SIGINT), and checks whose child processes leave their process group; the secrets collector on a real application repository (O22).
- Undecided: whether the catalog's requirement identifiers and original summaries are an adaptation of OWASP ASVS under CC BY-SA 4.0. Attribution is kept in docs/security-catalog-sources.md.

## Security-review cases (PLAN.md section 8)

| Case | Where it is exercised |
|---|---|
| Ref drift versus exact approved content | `scripts/release.test.mjs` (ref drift gives UNKNOWN VERSION); company release rehearsal A1 and T1 |
| Escaping import or manifest paths | `scripts/release.test.mjs` (escaping, linked and external plugin paths; a manifest path with `..`); `scripts/skilliton.test.mjs` (import refuses a symbolic link) |
| Unauthorized release attempt | `scripts/release.test.mjs` (unsigned, lightweight, other-format and untrusted tags); company release rehearsal A1 |
| Withdrawn but installed code | `scripts/release.test.mjs`; company release rehearsal W1 |
| A bad update reaching another environment | company release rehearsal A1 (the environment installs it; verify refuses it) |
| Private material in a skill import or proposal | `scripts/skilliton.test.mjs` (import refuses a secret-shaped key, a denylisted name, a dash, a home path, and runs no name scan without a denylist); `scripts/release.test.mjs` (propose refuses names, keys, dashes) |
| A malicious hook hidden behind passing evals | not exercised as a test. Verification proves installed bytes equal an approved release; it cannot judge a hook an approver reviewed and signed, so hooks, `bin/` and the runtime get the closest review (docs/RELEASING.md section 2) |
| Local guardrail bypass limits | stated, not tested as a bypass suite: guardrails see only the shell commands the assistant runs, not other terminals or indirect commands (the instruction template) |
