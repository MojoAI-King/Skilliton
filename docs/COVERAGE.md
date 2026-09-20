# What has been exercised

Kind: Living. Where Skilliton has and has not actually been run: platforms, versions, scale, transports and signing setups, plus the security-review cases from PLAN.md section 8. Consolidated on 2026-09-16 from the "not done or not verified" lists of the six integration lane reports (untracked `LANE_REPORT.md` files in the lane worktrees, which can be removed) and from measurements made since. An item moves to "exercised" only with the run that proved it. Client behavior itself is in docs/CLIENTS.md.

## Platforms and versions

| Area | Exercised | Not exercised | Next step |
|---|---|---|---|
| Operating system | macOS 26 (Darwin 25.6): every suite, the live sessions and the rehearsals. Linux in CI (ubuntu-latest): every offline suite, with bash 5.2.21, git 2.55.0, GNU tar and dash as `/bin/sh` | **Windows: nothing at all.** The approach is decided (Git for Windows, so the bash hooks and launcher stay as they are) and every hook pins `"shell": "bash"`, but no Windows machine has run a command, a hook or a session | The owner runs docs/WINDOWS.md on a Windows machine and reports what happens (B30); until then, say "macOS and Linux, measured; Windows through Git for Windows, unmeasured" |
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
- Exercised: the launcher resolved from a real Claude Code session's Bash tool on this machine, and the plugin `bin/` folders on the PATH of a session started after the install (`evidence/live/2026-09-19-which-skilliton-in-a-session.md`, `evidence/live/2026-09-19-path-in-a-new-session.md`); the Windows `skilliton.cmd` launcher's content and undo, with the platform injected (`scripts/join.test.mjs`).
- Not exercised: shells other than `/bin/sh` starting the launcher; a person's existing Claude Code or Codex configuration; several companies joined on one real machine; anything run on Windows (the `.cmd` file has never been executed there).
- Not exercised: passphrase-protected keys, ssh-agent, third-party signing programs; a present `.agents/plugins/marketplace.json` (the Codex catalog path, its path-mismatch refusal and `clients.codex` recording); `release create` with evidence of kind `skill-evaluation` or `other`; which cached version Codex loads when several are cached; whether a client's marketplace clone holds release tags.

## Endpoint security: the allow list, the footprint and the preflight check (M12)

- Exercised: docs/IT-ALLOWLIST.md held to the code by `scripts/allowlist.test.mjs` (every program the hooks, launchers and runtime start, read from the shell and JavaScript code; every place the code reaches outside a repository; a scenario in an empty home folder that runs join, verify, doctor, the status line, preflight, prepare, the four lifecycle hooks, the four shell hooks and join --undo, and leaves 357 paths, every one inside a listed location); the small-footprint rules by `scripts/footprint.test.mjs` (no network code, no administrator rights, nothing left running, no system paths, every shipped file a text script, no code built at run time, only the product's own file modes); `skilliton preflight` against blocks made on purpose on a real machine (`scripts/preflight.test.mjs`): a program taken off PATH, a program present but not runnable by this user, a program whose exec fails, a program a hook needs, a folder this user may not write, a plugin folder whose scripts may not run, a repository behind a proxy that refuses the connection, a marketplace folder with no catalog, and `join` stopping before it writes anything when a folder it needs is blocked.
- Not exercised: **any endpoint-security product** (no ThreatLocker or similar device is available; docs/BACKLOG.md B29), so a block one of those products makes may look different from the conditions above; a policy that lets a coding tool's file be found but stops it starting (the check never starts a coding tool); Windows; a private company repository needing credentials (B31).

## Session cost: the read guard, the gate, the meter and the compaction window

- Exercised: the context-hygiene read guard against fixture payloads with the field names the tools reference documents and a payload captured from a real session (`scripts/read-guard.test.mjs`: a refusal with the reason, the log line, and silence for a small file, a ranged read, an image, a PDF, a missing file, another tool, malformed input, a limit from the environment, an unwritable log); `skilliton gate` with real commands in a temporary repository (`scripts/gate.test.mjs`: pass, fail with the tail, a signal, a timeout, large output kept whole in the log, a changed tree named, the policy's checks in order stopping at the first failure, a program that cannot start, the package.json fallback with a stand-in npm, every refusal); the meter's fixtures fail under first-copy-wins and pass with the largest-output rule, and `--reference` reproduces the known window on the one machine that holds it; the harness template's Session cost section applied to this repository by migration `0100-instructions-ff8374b8e33a`; the allow-list scenario runs the read guard and the gate in an empty home folder.
- Exercised live (2026-09-18, Claude Code 2.1.276, live rehearsal step L5): the read guard refusing a whole-file Read of a 60KB file with the reason, logging it once, and letting a ranged read of the same file through.
- Exercised live (2026-09-18, Claude Code 2.1.276, live rehearsal step L6): a session compacting on its own at the `autoCompactWindow` a project's `.claude/settings.json` sets (100000 in a disposable project), with the PreCompact hook and the compact SessionStart hook recorded in the journal and the Project state shown to the model again afterwards.
- **Measured and unexplained (2026-09-20):** the build session in this repository, in the VS Code extension on 2.1.276, compacted automatically 17 times and never near this project's `autoCompactWindow` of 600000. It compacted just short of 1M until 2026-09-17, then once at 393975, then steadily between 164741 and 179051 from 2026-09-18T21:54 onward, including after the setting was committed. The session began before the setting existed, so a value read once at session start would explain no effect but not the change partway through. No cause is asserted (`evidence/live/2026-09-20-vs-code-extension-session.md` section 5, docs/BACKLOG.md B36).
- Not exercised: a session that starts with the template's own 600000 already in place, which is the one run that settles the line above; either hook on Windows (docs/WINDOWS.md); and Codex (hooks in plugins are removed there).

## Dispatch into worktrees

- Exercised: `skilliton dispatch` over fixture repositories built per test (`scripts/dispatch.test.mjs`, 14 cases): the preview naming every lane, folder, branch and item and writing nothing; `--apply` creating one worktree per lane; the brief carrying the scope, the bound, the model and the main-only paths and never running setup; and every refusal, which is the larger half of the surface (an existing lane branch, an existing folder, a folder Git still has registered, a lane root inside the repository, a base commit the repository does not have, duplicate names or branches, a malformed field, a missing plan, a plan over the size bound, a repository with no commits, an invalid dispatch configuration, and the argument mistakes). The three shipped agent definitions are checked as files by the packaging test, against the documented frontmatter value sets.
- Exercised as fixtures only (2026-09-20): the UserPromptSubmit hook that suggests dispatch when a prompt reads as six or more separate items (`scripts/lifecycle.test.mjs`: the counting table over numbered lines, bulleted lines and sentences outside fenced code, the additionalContext shape, the journal event, silence below the threshold, the threshold read from the project's dispatch configuration at 3 and at 20, and silence outside a project). **Not exercised: whether Claude Code delivers UserPromptSubmit to a hook registered by a plugin at all.** The event and its fields are documented and the hook has never been seen running in a session; DECISIONS.md O27 holds the open item and the one live prompt that settles it.
- **Not exercised at all: any of it for real.** No multi-lane dispatch has been run on this repository or any other, no lane agent has been launched from a brief, no lane report has been collected, and no peak context per lane has been read from the meter. Nothing here has been proved to help a session; it has been proved to refuse correctly.
- Not exercised: undoing a dispatch, which no command offers; two lanes running the same check at once, which the brief warns about in words; Windows paths for any of it.
- Next step: one real dispatch of two or more lanes with the meter over the window it runs in (docs/areas/04-token-efficiency/batch-03-subagent-hygiene.md item 3), and the collect step in area 07.


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
