# Installing Skilliton

Kind: Living. Written for two readers: a person installing Skilliton, and an AI coding agent a person has asked to install it. Every command below was run on 2026-09-22 on macOS with Claude Code 2.1.278, by a rehearsal that installed from GitHub into an empty configuration; the steps that need a signed-in session were measured in the owner's own sessions.

## What you need

- **Claude Code**, in a terminal or the VS Code extension, signed in.
- **git**, and **Node.js 22 or later** (`node --version`).
- macOS or Linux. Windows is not supported yet: its first run on a hosted Windows machine found that preparing a repository is refused there ([evidence](evidence/live/windows/2026-09-22-hosted-runner-first-run.md)).

## Pick a path

| You want to | Path | Time | What it changes on your machine |
|---|---|---|---|
| See what it does before installing anything | [1. Look](#1-look-nothing-installed) | 2 minutes | nothing outside a temporary folder |
| Use it in your own Claude Code | [2. Try](#2-try-it-in-your-own-claude-code) | 5 minutes | four plugins in your Claude Code configuration |
| Roll it out to a team from your company's fork | [3. Roll out](#3-roll-it-out-to-a-team) | 30 minutes once, then 1 minute per developer | the plugins, pinned to a signed release, and a `skilliton` command |

## 1. Look, nothing installed

```bash
git clone https://github.com/MojoAI-King/Skilliton.git
cd Skilliton
node scripts/autopilot-demo.mjs
```

It prepares a throwaway project, turns a request into a task with a checkpoint, records real test evidence and shows it going stale when the code changes, then runs a shared repository whose merge check accepts a passing change and rejects a breaking one. No model, no network, and nothing is written outside a temporary folder.

To run every check CI runs (about 10 minutes, 58 steps):

```bash
node scripts/checks.mjs
```

## 2. Try it in your own Claude Code

**Install the four plugins** from this repository's marketplace. The first command prints `Successfully added marketplace`, and each install prints `Successfully installed plugin`:

```bash
claude plugin marketplace add MojoAI-King/Skilliton
claude plugin install workflow@skilliton
claude plugin install guardrails@skilliton
claude plugin install context-hygiene@skilliton
claude plugin install code-quality@skilliton
```

**Start a new session.** Plugins load when a session starts, so an open session does not have them yet. Start a new one, or run `/reload-plugins` in the open one. In VS Code, quit it fully and open it again.

**Open a git repository and say hello.** The first reply is built on a "Project state" block the session-start hook adds. In a repository Skilliton has never seen, that block tells the assistant to ask you first, and it will, in words close to these:

> This project is not set up for Skilliton yet. Setting it up adds records for status, backlog, decisions, lessons and handoffs, a managed instruction block in CLAUDE.md and AGENTS.md, and a security register; it keeps any of those that already exist. Nothing is written until you say yes.

**Say yes.** The assistant runs `skilliton prepare` (a preview), then `skilliton prepare --apply`, and turns your first request into a task record. The new files are left uncommitted for you to read and commit.

**What you should see from then on:**

| When | What happens | Enforced or asked |
|---|---|---|
| Every session start | The last handoff and the project's state are shown to the assistant, which tells you where things stand | enforced by a hook |
| Before code changes | The assistant writes a task record with acceptance criteria | asked of the assistant |
| Every shell command | Force-pushes to protected branches, `--no-verify`, secret-shaped commits and deleting Skilliton's records are blocked; commands that throw away uncommitted work ask you first | enforced by a hook |
| A whole-file read over 50 KB | Refused, with how to read a range instead | enforced by a hook |
| Finishing with uncommitted changes, no checkpoint, and at least 20 minutes since the session started or the last checkpoint (`checkpoints.minMinutes` in `.skilliton/config.json`) | The stop is held once and the assistant is asked to record where the work stands | enforced by a hook |
| Six or more separate items in one message | The assistant is told to split them into lanes with `/workflow:dispatch` first | enforced note, the assistant does the work |
| Before a commit | `/workflow:review` summarizes what changed, what could break and what was tested | asked of the assistant |

Type `/` to see the skills: `workflow:task`, `workflow:review`, `workflow:handoff`, `workflow:maintain`, `workflow:dispatch`, `workflow:security`, `workflow:release`, and one each from the other three plugins.

**This path follows the repository's main branch.** Nothing checks the installed files against a signed release; path 3 does.

**To take it out again:** in each prepared repository, ask the assistant to run `skilliton remove` (a preview), then `skilliton remove --apply`. It takes out the managed block from CLAUDE.md and AGENTS.md (delete either file if nothing else was in it) and keeps every record and `.skilliton/config.json` (add `--config` to delete that too). Then remove the plugins and the marketplace:

```bash
claude plugin uninstall workflow@skilliton
claude plugin uninstall guardrails@skilliton
claude plugin uninstall context-hygiene@skilliton
claude plugin uninstall code-quality@skilliton
claude plugin marketplace remove skilliton
```

**What `skilliton doctor` checks on this path.** Run from the installed copy, it compares each installed base plugin with the catalog of the marketplace it came from and passes when they match. It reads Claude Code's files from `CLAUDE_CONFIG_DIR` when that is set, else from `~/.claude`, and its header says which. The context-hygiene plugin prints nothing at session start unless `SKILLITON_LESSONS` names a personal checklist file; if it names one that cannot be read, a `[context-hygiene]` line says so and gives the path.

## 3. Roll it out to a team

A company forks this repository, names it, signs its releases and hands each developer one join file. That path is [docs/RELEASING.md](docs/RELEASING.md) for the company and [docs/ONBOARDING.md](docs/ONBOARDING.md) for the developer. In short, a developer runs, once per machine:

```bash
git clone https://github.com/<company>/<skills-repo> ~/company-skills
node ~/company-skills/scripts/skilliton.mjs join --from <join file>           # preview
node ~/company-skills/scripts/skilliton.mjs join --from <join file> --apply   # install, pin, verify
```

The join file carries the company name, the skills repository's address and the approvers' public signing keys, and no secret. It comes from the company, never from the repository, so that whoever can change the repository cannot also change who is trusted. After a join, every repository a session opens on that machine is prepared at its first session start, and `skilliton verify` checks the installed files against the signed release. An empty `.skilliton-off` file at a repository's root (or a `skilliton-off` file inside its `.git` folder, which is never committed) keeps that one repository from being prepared automatically, and keeps Skilliton's workflow hooks out of it altogether: the session start says so in one line, and nothing else runs or is recorded there. The guardrails and the read guard still run. The company side of this path, including `skilliton company join-file`, which writes the join file, is in [docs/RELEASING.md](docs/RELEASING.md).

## If you are an AI agent installing this for someone

Follow path 2 unless the person names a company join file, in which case follow path 3. Rules that keep the install safe and visible:

1. **Check the prerequisites first** and stop if one is missing: `claude --version`, `git --version`, `node --version` (22 or later). Say which one is missing.
2. **Tell the person what you are about to run** before each step, in plain words, and run the commands one at a time. Read each exit status. `claude plugin install` prints `Successfully installed`; anything else is a failure to report, not to retry silently.
3. **Do not edit `~/.claude/settings.json` by hand.** The plugin commands write it, and the running client manages it.
4. **Plugins load at the next session start.** After installing, tell the person to start a new session (or run `/reload-plugins`), because this one does not have them.
5. **Preview before writing.** Every `skilliton` command that writes shows its change first and writes only with `--apply`. Show the preview, and add `--apply` only after the person agrees. Nothing is prepared without a yes.
6. **Leave the new files uncommitted** for the person to read, unless they ask you to commit them.
7. **Verification happens in the new session, which is a different conversation from yours.** Tell the person to start it and type: `hello, then run which skilliton`. The first reply should mention a "Project state" block, and `which skilliton` should print a path under the plugin cache (`.../plugins/cache/skilliton/workflow/<version>/bin/skilliton`), after `~/.local/bin` if the machine has joined. If either is missing, report it as not working and point to [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). Do not treat `skilliton doctor` exiting 1 on path 2 as a failed install (see "Two lines you may see" above).
8. **The stop reminder waits 20 minutes** by default, so trying it right after install shows nothing. That is the setting, not a fault.

A person can hand this whole job to their agent with one message:

```
Install Skilliton for me by following INSTALL.md in https://github.com/MojoAI-King/Skilliton, path 2. Tell me each step before you run it, and do not prepare any repository until I say yes.
```

## When something does not work

[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) lists every case a real session has hit, with its cause. `skilliton doctor` checks an install and prints one line per check, with anything it could not check marked UNVERIFIED rather than passed.
