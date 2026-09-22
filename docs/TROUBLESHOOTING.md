# Troubleshooting

Kind: Living. Every entry here was hit by a real person or a real session and has a measured cause. When something is not on this page, `skilliton status` is the first command: it reads the files and says what it found, and it writes nothing.

## "I don't see anything when I open a repository"

| What you see | Cause | What to do |
|---|---|---|
| No `[guardrails] on: ...` line and no project state block at the top of a new session | The session started before the plugins were installed or updated. Claude Code loads plugins at session start. | Restart the session (close and reopen the editor's chat, or `/exit` and start `claude` again). Every plugin update ends with "Restart to apply changes" for this reason. |
| The guardrails line is there but no project state block, or the block says the repository is not prepared | The machine has joined but this repository has not been prepared. Joining is once per machine; preparing is once per repository. | `skilliton prepare --dir <repo>` to see what it would write, then the same with `--apply`, then restart the session. |
| `/` shows no `workflow:` or `guardrails:` skills | The plugins are not enabled for this account, or the client is not Claude Code | `claude plugin list` to see what is installed and at which scope. In Codex the skills show but no plugin hooks run; in Cursor nothing runs (docs/CLIENTS.md). |
| The state block says `Previous session: interrupted` | The last session ended without a session-end event (a crash, a killed terminal, a machine that slept) | Nothing to fix. It is information: check `git status` for work that session left, and the task record for its last checkpoint. |
| The state block says the handoff is older than the latest commit | Someone committed after the last handoff was written | Read the commits since; write a checkpoint with `--handoff` when you finish. It is a note, not a fault. |
| The state block says a record, or `.skilliton/config.json`, is tracked in Git and missing from the working tree | Someone deleted it in Finder or a terminal, outside every hook; no hook restores anything | Run the `git checkout -- <path>` it prints. If the removal was meant, `skilliton remove --apply` records it; a record that was never made is created by `skilliton prepare --apply`. |

## Joining a machine

| What you see | Cause | What to do |
|---|---|---|
| `join` refuses and lists several missing flags | It needs the company, the signers file and the repository, and it names every one it lacks at once | Use the join file: `join --from <file> --apply`. The file comes from your company, never from the repository. |
| `join` says the machine already joined a company | A receipt under `~/.config/skilliton/joined/` says so | Nothing to do for a second repository: run `prepare` there. To leave a company, `join --undo --company <name> --apply`. |
| `join` refuses about a release tag on a fresh clone | Fixed in workflow 0.15.2; an older clone judged the tag before the machine | Pull the repository and run `join` again. |
| `skilliton: command not found` in a terminal | `join` writes the launcher to `~/.local/bin`, which must be on PATH; inside a Claude Code session the workflow plugin adds its own `bin/` | Add `~/.local/bin` to PATH, or run `node <clone>/scripts/skilliton.mjs ...`. Which one a session resolves first is measured in evidence/live/2026-09-19-which-skilliton-in-a-session.md. |
| `claude` runs an older version than the editor's | This machine carries more than one Claude Code install; PATH resolves one, the editor runs another | Run client commands with the session's binary: `"$CLAUDE_CODE_EXECPATH" plugin ...`. The runner and the checks do this already. |

## Preparing a repository

| What you see | Cause | What to do |
|---|---|---|
| `prepare` refuses: "inside the Git repository ... but is not its root" although it is the root | The folder was spelled in a different letter case than the file system stores it (macOS ignores case; the check did not, B56) | Pass the path exactly as `git rev-parse --show-toplevel` prints it. |
| `prepare` says "already current" and changes nothing | It has run here before; repeat runs are no-ops by design | Nothing to do. `migrate` applies a newer layout when one exists; `status` says whether one is pending. |
| A `delivery.draft.json` appeared under `.skilliton/` | `prepare` found a test command in the project and drafted a delivery policy from it | It is inert until `skilliton delivery confirm --apply`. Read it first. |
| The state block reports a pending migration | The installed plugin is newer than the project's layout, or a template changed | `skilliton migrate` to preview, then `--apply`; commit the receipt it writes. |

## Guardrails

| What you see | Cause | What to do |
|---|---|---|
| A git command was denied with a reason | The command was a force-push to a protected branch, skipped git hooks, or added a secret-shaped file | Read the reason; it names the safe alternative. `/guardrails:guardrails` explains every rule and how a team lead changes them. |
| A confirmation prompt on a command that discards work | The hook asks before `git checkout -- .`, `git reset --hard` and similar | Answer no unless you meant it. In Codex the same command is refused, because Codex cannot ask from a hook. |
| The session-start line says a rule is turned off | The project's `.skilliton/config.json` lowers a guardrail | That is the team's setting; the line exists so it is never silent. A command the turned-off rule would have caught passes without a note (B50). |
| A shell string that names git asks first | `bash -c "..."`, `sh -c`, `eval` and `xargs` hand text to a shell the hook cannot read inside | Run the git command directly, or confirm. |
| `rm`, `mv` or `git rm` was denied naming `.skilliton`, a record, `docs`, `CLAUDE.md` or `AGENTS.md` | The command would remove what Skilliton keeps in the project (guardrails 0.6.0, B61) | If one file is really stale, a person removes it; to take Skilliton out of the project, a person runs `skilliton remove --apply`. A team lead turns the rule off with `"protectRecords": false` under `guardrails` in `.skilliton/config.json`. |
| A Write or Edit to CLAUDE.md or AGENTS.md was denied | The result would no longer carry the managed block between the harness markers | Edit outside the markers; change the block through the company's template and `skilliton harness --apply`. |

## Releases and verify

| What you see | Cause | What to do |
|---|---|---|
| `verify` reports TAMPERED and names files | An installed file differs from the signed manifest | If the named file is one you edited on purpose, reinstall the plugin; if not, do not use that install until someone has looked. TAMPERED from an `.in_use/<pid>` marker was a false reading fixed in workflow 0.15.1. |
| `verify` reports UNKNOWN VERSION | The installed version is not in any signed manifest the clone knows | Pull the company repository; if the version is still unknown, it did not come from a signed release. |
| `release sign` refuses | git is not configured to sign with an SSH key, or the key is not in the signers file | `git config gpg.format ssh` and `user.signingkey` first; the key's public line must be in the company's `allowed_signers`. |

## Sessions and cost

| What you see | Cause | What to do |
|---|---|---|
| "Whole-file reads of non-image files over 50KB are refused" | The read guard; the rule exists so one read does not fill the context | Read a range, grep, or summarise with a script. Images and PDFs are never refused. |
| The stop hook asks for a checkpoint | The working tree changed since the last checkpoint and none was recorded; it asks once per tree state | Record the checkpoint it prints, or say why the work should not be recorded. |
| A check passes on its own and fails through a runner | The runner's shell or environment differs (a login shell sources profile files) | Compare the shell flags and the starting environment first. `scripts/checks.mjs` uses a plain shell for this reason. |
| The session compacted far below the configured window | The window in `.claude/settings.json` is set but the client's own limit applied first; not explained (O25) | Nothing to fix; write a checkpoint before long stretches so a compaction loses nothing. |

## When none of this fits

1. `skilliton status --dir <repo>`: layout, migrations, versions, records, sessions, security, each with OK, NOTE or ATTENTION.
2. `claude plugin list` and `skilliton verify`: what is installed, at which scope, and whether it matches a signed release.
3. Restart the session, then the editor. Plugin and settings changes take effect at session start.
4. Open an issue on the company's fork with the three outputs above; never paste a token, a key or a `.env` line.
