---
name: guardrails
description: Use when a git command was blocked or paused by the guardrails hook, or when the user asks what is protected, why a git command was stopped, or how a team lead changes the protections. Explains each rule, why it exists, the safe alternative, and the settings.
---

# Guardrails

A hook reads every Bash command before it runs and stops the few git commands that can erase shared work or leak a secret. When it stops one, tell the user in plain words what was stopped and why, then offer the safe alternative from the message. Never try to get around a block: do not reword the command, split it up, or move it into a script.

## Blocked

| Rule | What it stops | Why | Do this instead |
|---|---|---|---|
| Force-push to a protected branch | `git push --force`, `-f`, `--force-with-lease`, `--mirror`, or a `+branch` refspec aimed at `main` or `master`, including a force-push with no branch named while you are on one | It overwrites the shared branch and can erase other people's work | Push your own branch without `--force` and open a pull request |
| Skipping checks | `git commit --no-verify` or `-n` (also `-nm`), `git push --no-verify` | It skips the project's git hooks, the checks that catch problems before work is saved or shared | Run it without the flag; if a check fails, fix what it reports |
| Secret files | `git add` or `git commit` that would stage or commit `.env` or `.env.*` (not `.env.example`, `.env.sample`, `.env.template`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `id_rsa*` or `id_ed25519*` (not `.pub`), `*credentials*.csv`, `*accessKeys*.csv`, `*api-key*` | A commit keeps a file in the history even after it is deleted | Add the file to `.gitignore` and stage files by name |
| Secret content | Added lines shaped like an AWS access key ID, an Anthropic API key, a GitHub token, a Slack token, a Stripe live secret key, or a private key block | Same: the history keeps it | Move the value into an environment variable or a secrets manager |

The message names the file and the rule, never the secret itself. Removing a secret file from git (`git rm --cached .env`) is never blocked.

## Asks for confirmation first

These throw away work that was never committed: `git reset --hard`, `git clean -f` (not with `-n`), `git checkout .` or `git checkout -- .`, `git restore .` (not `--staged` alone), `git stash drop`, `git stash clear`, `git branch -D`. Before the user confirms, offer the safer step from the message: commit or stash first, preview with `git clean -n`, or use `git branch -d`.

## Settings, for a team lead

`.skillgate/config.json` at the repository root. Every key is optional; these are the defaults:

```json
{ "guardrails": { "protectedBranches": ["main", "master"], "blockForcePush": true, "blockNoVerify": true, "blockSecretFiles": true } }
```

- Only `false` turns a rule off. `protectedBranches` takes names or simple patterns such as `release/*`.
- The confirm-first prompts have no switch.
- `SKILLGATE_GUARDRAILS=off` in the environment turns every check off for one session, and the session start message says so.
- If the file cannot be read, the defaults stay on and the session start message says so.

## Limits

It reads the command text. It follows `&&`, `;`, pipes, `cd`, and `git -C`, and ignores text inside quotes and heredocs. It does not see inside scripts, `bash -c`, `eval`, or git aliases, and it does not cover `git push --delete`. Files over 10 MB are checked by name only. If `jq`, `node`, and `python3` are all missing, every git command asks for confirmation instead of being checked.
