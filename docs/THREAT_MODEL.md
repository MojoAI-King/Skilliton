# Threat model, on one page

Kind: Living. What Skilliton protects, against whom, with which mechanism, and where each mechanism stops. Written 2026-09-23 after three independent cold reviews of `main` at 029f159; the limits they found are listed at the end with the release that carries each fix. SECURITY.md is the short public statement; docs/IT-ALLOWLIST.md is the footprint for endpoint security teams; docs/DELIVERY.md is the shared-branch gate. This page is the one that says what each of those is for.

## What is being protected

1. **Shared history.** The protected branch of a project (`main` by default, set in `.skilliton/config.json`) and the branches other people have based work on. A forced update rewrites what a teammate holds.
2. **The project's records.** `docs/tasks/`, `docs/decisions/`, `docs/lessons/`, the status, backlog and handoff files, `DECISIONS.md`, and the managed block in `CLAUDE.md` and `AGENTS.md`. They are how the next session and the next person know where things stand.
3. **Secrets.** A key, token or password must not enter history, because history is copied to every clone and is very hard to clean.
4. **The hooks themselves.** A session in which the hooks have been turned off looks, from the outside, like a session in which nothing needed stopping.
5. **What a laptop runs.** The plugin files installed on a developer's machine should be the ones the company signed, not whatever `main` holds today.

## Who the adversary is

The guard is built for **an assistant's ordinary and accidental commands**: the `git push --force` it types to make a rebase land, the `rm -rf docs` it runs to "clean up", the `--no-verify` it adds to get past a failing hook, the settings file it edits to stop a hook from interrupting. Those are the commands that cost a team its afternoon, and they are common.

It is **not** built to hold against a person, or an assistant, that sets out to get around it. A guard that reads command text can be defeated by anyone who knows it reads command text. That is a property of every hook-based control, and the sections below say where the real boundary is for each asset.

## The mechanisms, and where each one stops

| Asset | Mechanism | What it covers | Where it stops |
|---|---|---|---|
| Shared history | The guardrails plugin's Bash hook (`guard-bash.sh`), a Claude Code PreToolUse hook | Commands the assistant runs through the Bash tool: forced pushes to a protected branch, hook skips, discard verbs, git configuration on the command line that changes what a push does | A person's own terminal. A script, `bash -c`, `eval`, a shell function or alias, a variable the command line does not assign. An environment where the hooks were turned off (asset 4). The real boundary is the forge's branch protection and the delivery gate in the next row |
| Shared history, at the shared repository | The delivery gate (`skilliton delivery install`), a pre-receive hook on the bare repository | Every push from every client: the combined result must pass the policy's checks, and a change to the policy needs an approver's signature | It runs the project's own checks under the repository's own account, so it detects a tampered check after the fact, it does not sandbox it (docs/DELIVERY.md). A push straight to a hosted forge that does not run the gate is covered only by that forge's own protection |
| Records | The same Bash hook, plus the Write and Edit half (`managed-block-guard.mjs`) | Deleting or emptying a record, removing the `.skilliton` folder, taking the managed block out of `CLAUDE.md` | Same as the first row: text the hook cannot read (globs it does not expand, a program it does not know, a write by a script). Git history keeps the deleted file; the guard buys an interruption, not immutability |
| Secrets | The add and commit paths of the Bash hook; the secrets collector (`skilliton security collect secrets`); the whole-history audit (`skilliton audit`) | Secret-shaped files and lines at `git add` and `git commit`, the working tree at maintain time, every file the repository ever changed in CI | The hook scans by content up to a size cap and by name above it, so a very large file is checked by name only. The shapes are a list; a secret that matches none passes. The collector and the audit report; neither rewrites history |
| The hooks | `skilliton verify` (hashes of the installed plugin files), `skilliton status` (the Project state block says when guardrails is off), `SKILLITON_GUARDRAILS=off` is visible in the session's environment | A changed plugin file; a session that started with the guard off | A write to `.claude/settings.json` or `.claude/settings.local.json` can remove the hooks for the next session. Claude Code's documented precedence puts managed settings (placed by IT in the system location) above project settings, so a company that needs "enforced" to hold against the assistant itself delivers the hooks through managed settings (read from the documentation, not measured here; docs/IT-ALLOWLIST.md names the paths) |
| What a laptop runs | Signed releases: a manifest with every file's hash, an SSH signature over it, the allowed signers list, `skilliton pin` and `skilliton verify` | The plugin files installed from a release match the manifest the company signed | A laptop that joined on the "try it" path tracks `main` unsigned and updates automatically; only the signed join is meant for a machine that holds client work (INSTALL.md) |

## What "enforced" means here

The harness block marks each behavior **enforced**, **instructed** or **checked at merge**. Enforced means a hook of an installed, enabled plugin does it on a supported client event. It holds against the assistant's ordinary mistakes for as long as the hooks are installed and on. It does not hold against whoever can edit the settings that install them. For a company that needs the second property, the order of controls is: managed settings for the hooks, the forge's branch protection for history, the delivery gate for the checks, signed releases for the files, and this page for the people who have to decide whether that is enough.

## Limits the 2026-09-23 reviews found, and where each fix ships

Every line below was reproduced on `main` at 029f159 before it was written here. "Guardrails 0.9.0" and "workflow 0.23.0" are the plugin versions that carry the fix; the release that bundles them is 1.2.0.

| Limit at 029f159 | Fix |
|---|---|
| Git accepts any unambiguous prefix of a long option, so `--forc`, `--f`, `--mir` and `--no-ver` were read as harmless | Guardrails 0.9.0: a prefix of a dangerous option is read as that option |
| `--no-force` after `--force-with-lease` was read as cancelling the force; git does not cancel it | Guardrails 0.9.0: `--no-force` cancels `--force` only |
| `-c remote.<name>.push=+...`, `-c alias.<x>='push -f'`, `-c push.default` with a force flag, and the same through `GIT_CONFIG_*` and `--config-env` were not read | Guardrails 0.9.0: they ask, or deny when aimed at a protected branch |
| An unresolved `$variable` in a push or a discard was read as a harmless word | Guardrails 0.9.0: it asks, the way `$( )` already did |
| A staged file larger than the hook could scan inside its timeout let the commit through | Guardrails 0.9.0: the commit path caps the content scan the way the add path does, and says so |
| `checkout -f`, `switch --discard-changes`, `worktree remove --force`, `restore <path>`, `checkout -- <path>` were allowed | Guardrails 0.9.0: they ask |
| `find ... -delete`, brace expansion, `$PWD` and `./x/../x` paths, `> record`, `truncate`, `cp /dev/null`, a heredoc onto `CLAUDE.md`, `rsync --delete`, a one-line interpreter call, and a differently cased name on a case-insensitive disk were not read as the record deletions they are | Guardrails 0.9.0: they deny |
| A write to `.claude/settings*.json` naming hooks or plugins, and creating `.skilliton-off`, were allowed | Guardrails 0.9.0: they ask |
| The gate's log file followed a symbolic link, so a link planted at `.git/skilliton/gate/<label>.log` made the gate overwrite a file outside the repository | Workflow 0.23.0: the log is opened without following links and refuses a linked path |
| `new-skill` and `import` followed a symbolic link in a plugin's `skills` folder and wrote outside the repository | Workflow 0.23.0: every component of the destination is checked from the repository root down; a link refuses with nothing written |
| The team settings template turned automatic plugin updates on | The template defaults to off (a decision entry records why) |
| The allow list said no runtime git call contacts a remote; `skilliton preflight` runs `git ls-remote` | The sentence now names that one call |

## Limits the pre-release review of 1.4.0 found, 2026-09-24

| Limit | Fix |
|---|---|
| `harness --apply` and `project-settings --apply` followed a committed symbolic link at `CLAUDE.md`, `AGENTS.md` or `.claude/settings.json` and wrote outside the repository (reproduced before 1.4.0; the same code is in 0.9.0 and 1.3.0); `dispatch merge` did the same for a linked record folder | Workflow 0.25.0: every component below the repository root is read with lstat; a link that resolves outside, or to nothing, and a file with a second hard link are refused with nothing written |
| The usage ledger's first version appended through a committed link | Refused before any release: the ledger is never read or written through a link |
| A failing gate verdict printed other node processes' full command lines | Each is named by its program and script file only |

## Limits the security retest after 1.4.0 found, 2026-09-24

| Limit | Fix |
|---|---|
| `dispatch --apply` wrote a lane's brief, and could write its task record and report, through a committed symbolic link in the base commit, outside the repository (reproduced on 1.4.0); `company init`, `new-plugin`, `release create` and the policy confirm had no link check | Workflow 0.25.1: a base commit with a link where dispatch writes is refused before any worktree is made; the four other writers check with linkedWriteProblem; a test lists every file write with its reason |

## What this page does not claim

No number here is a measurement of risk. Nothing here is a compliance certification. A team that needs one measures its own controls under its own policy; this page tells that team what Skilliton's controls are and where they stop, so the measurement starts from the truth.
