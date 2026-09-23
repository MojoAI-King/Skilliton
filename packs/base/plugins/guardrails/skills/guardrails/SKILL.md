---
name: guardrails
description: Use when a git command was blocked or paused by the guardrails hook, or when the user asks what is protected, why a git command was stopped, or how a team lead changes the protections. Explains each rule, why it exists, the safe alternative, and the settings.
---

# Guardrails

A hook reads every Bash command before it runs and stops the few git commands that can erase shared work or leak a secret. When it stops one, tell the user in plain words what was stopped and why, then offer the safe alternative from the message. Never try to get around a block: do not reword the command, split it up, or move it into a script.

## Blocked

| Rule | What it stops | Why | Do this instead |
|---|---|---|---|
| Force-push to, or deleting, a protected branch | `git push --force`, `-f`, `--force-with-lease`, `--mirror`, or a `+branch` refspec aimed at `main` or `master` (also spelled `heads/main` or `refs/heads/main`, or reached by a pattern such as `refs/heads/*`), including a force-push with no branch named while you are on one; and `git push --delete`, `-d` or `:main`, which take the branch off the remote | It overwrites or removes the shared branch and can erase other people's work | Push your own branch without `--force` and open a pull request |
| Skipping checks | `git commit --no-verify` or `-n` (also `-nm`), `git push --no-verify` | It skips the project's git hooks, the checks that catch problems before work is saved or shared | Run it without the flag; if a check fails, fix what it reports |
| Secret files | `git add` or `git commit` that would stage or commit `.env` or `.env.*` (not `.env.example`, `.env.sample`, `.env.template`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `id_rsa*` or `id_ed25519*` (not `.pub`), `*credentials*.csv`, `*accessKeys*.csv`, `*api-key*` | A commit keeps a file in the history even after it is deleted | Add the file to `.gitignore` and stage files by name |
| Secret content | Added lines shaped like an AWS access key ID, an Anthropic API key, a GitHub token, a Slack token, a Stripe live secret key, or a private key block | Same: the history keeps it | Move the value into an environment variable or a secrets manager |

| Removing what Skilliton keeps | `rm`, `rmdir`, `mv` or `git rm` aimed at a `.skilliton` folder (anywhere), or in a prepared project at a record file (`docs/STATUS.md`, `docs/BACKLOG.md`, `DECISIONS.md`, `docs/HANDOFF.md` and the rest, where the project's configuration puts them), an entry folder (`docs/tasks`, `docs/decisions`, `docs/lessons`), `CLAUDE.md`, `AGENTS.md`, or a folder holding any of them, including `rm -rf .` or `*` at the root; and a `Write` or `Edit` that would take the managed block out of `CLAUDE.md` or `AGENTS.md` | Those files are the project's memory and its working rules; without them the next session starts from nothing and says nothing about it | Edit outside the managed block; if one file is really stale, say which and why and let the person remove it; the one route that takes Skilliton out of a project is `skilliton remove --apply`, run by a person |

The message names the file and the rule, never the secret itself. Removing a secret file from git (`git rm --cached .env`) is never blocked.

## Asks for confirmation first

These throw away work that was never committed: `git reset --hard`, `git clean -f` (not with `-n`), `git checkout .` or `git checkout -- .`, `git restore .` (not `--staged` alone), `git stash drop`, `git stash clear`, `git branch -D`. Before the user confirms, offer the safer step from the message: commit or stash first, preview with `git clean -n`, or use `git branch -d`.

**In Codex** these are blocked instead. Codex runs the same hook but cannot ask for confirmation from one (its documentation says the command would simply run), so every command above, and every command guardrails cannot check (no JSON reader, a folder it cannot work out, too many files, an internal error), is blocked with a message that says so and keeps the usual warning. If the user meant it, they run the command themselves in their own terminal. The hook recognizes Codex from a `turn_id` or `model` field in its input, or from `PLUGIN_ROOT`; `SKILLITON_GUARDRAILS_CLIENT=claude-code` or `codex` sets the client outright. This has not yet been checked in a live Codex session.

## Settings, for a team lead

`.skilliton/config.json` at the repository root. Every key is optional; these are the defaults:

```json
{ "guardrails": { "protectedBranches": ["main", "master"], "blockForcePush": true, "blockNoVerify": true, "blockSecretFiles": true, "protectRecords": true } }
```

- A person makes these changes in their own editor or terminal. A `Write` or `Edit` by the assistant that would turn a rule off or take a name out of `protectedBranches` is refused, and a shell command that writes the file (a redirection, `tee`, `cp`, `sed -i`, or a `node -e` or `python3 -c` naming it) asks first.
- Only `false` turns a rule off. `protectedBranches` takes names or simple patterns such as `release/*`. `protectRecords` covers both the shell rule and the managed block guard.
- The confirm-first prompts have no switch.
- `SKILLITON_GUARDRAILS=off` in the environment turns every check off for one session, and the session start message says so.
- If the file cannot be read, the defaults stay on and the session start message says so.

## Limits

It reads the command text. It follows `&&`, `;`, pipes, `cd`, and `git -C`, and ignores text inside quotes and heredocs. It reads past `env`, `sudo`, `nice`, `timeout`, `exec`, `caffeinate`, `stdbuf`, `ionice` and `time` with the values their options take; after a program it does not know, a later `git`, `rm` or `mv` that would be stopped asks instead. It does not see inside scripts, git aliases, or a string handed to a shell (`bash -c`, `sh -c`), `eval` or `xargs`; when such a string names git it asks for confirmation instead of allowing in silence (guardrails 0.5.2). Files over 10 MB are checked by name only. A removal path is judged after `cd`, `git -C` and `..` are applied and through symbolic links when the path exists; a path holding a variable or a command substitution cannot be resolved and is denied only when its own text names the `.skilliton` folder; letter case is compared as written. Without `CLAUDE_PROJECT_DIR` (Codex) the project is the repository root of the command's folder. If `jq`, `node`, and `python3` are all missing, every git command asks for confirmation (in Codex, is blocked) instead of being checked.
