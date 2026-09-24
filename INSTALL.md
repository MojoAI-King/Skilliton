# Installing Skilliton

Kind: Living. Written for two readers: a person installing Skilliton, and an AI coding agent a person has asked to install it. The path 2 install was run on 2026-09-22 on macOS with Claude Code 2.1.278, by a rehearsal that installed from GitHub into an empty configuration. Its record so far is one line in [a task record](docs/tasks/2026-09-22-the-home-stretch-every-area-as-high-as-e-3732.md), not a file under `evidence/`, and it does not cover path 3 or the removal steps. The steps that need a signed-in session were measured in the owner's own sessions. Linux runs every check in CI but has not been taken through this guide.

## What you need

- **Claude Code**, signed in. The path 2 commands use its command line (`claude`). With only the VS Code extension, see rule 1 of [the agent section](#if-you-are-an-ai-agent-installing-this-for-someone).
- **git**, and **Node.js 22 or later** (`node --version`). CI runs Node.js 22, and the full check list also passes on Node.js 25 on the maintainer's machine; Node.js 20 ran in one review and is not a supported floor.
- **OpenSSH's `ssh-keygen`** (`command -v ssh-keygen` prints its path; there is no version flag on macOS). The demo and `skilliton verify` use it to check signatures; on Debian and Ubuntu it is the `openssh-client` package, usually already installed.
- macOS or Linux. Windows is not supported yet: after the port, preparation, every session hook and the guard's decisions work on a hosted Windows machine, but a command of several hundred KB takes the guard longer than its timeout (backlog B80), and no signed-in Claude Code session has run there ([evidence](evidence/live/windows/2026-09-23-hosted-runner-port.md)).

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

It prepares a throwaway project, turns a request into a task with a checkpoint, records real test evidence and shows it going stale when the code changes, then runs a shared repository whose merge check accepts a passing change and rejects a breaking one. No model, no network, and nothing is written outside a temporary folder (under `$TMPDIR` when it is set, which the demo honors).

The full check list takes about 7 minutes on an idle laptop and longer under load. To run the checks CI runs (`node scripts/checks.mjs --list` prints them and their count and runs nothing; the two that run only in CI are named when they are skipped):

```bash
node scripts/checks.mjs
```

## 2. Try it in your own Claude Code

**This path tracks the `main` branch, unsigned, with automatic updates, and is for trying it out; it is not for a machine that holds client work.** See [path 3](#3-roll-it-out-to-a-team) for that.

**Install the four plugins** from this repository's marketplace. The first command prints `Successfully added marketplace`, and each install prints `Successfully installed plugin`:

```bash
claude plugin marketplace add MojoAI-King/Skilliton
claude plugin install workflow@skilliton
claude plugin install guardrails@skilliton
claude plugin install context-hygiene@skilliton
claude plugin install code-quality@skilliton
```

**Start a new session.** Plugins load when a session starts, so an open session does not have them yet. In a terminal, `/exit` and run `claude` again; in VS Code, quit it fully and open it again. Claude Code documents that `/reload-plugins` loads plugins into an open session, but whether it also runs the session-start hook and puts the `skilliton` command on PATH is not verified, so use a new session for what follows.

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
| Finishing with uncommitted changes and no checkpoint in this session, however short it was (`checkpoints.holdFirstStop`, on by default); after a checkpoint, at least 20 minutes since it (`checkpoints.minMinutes`), both in `.skilliton/config.json` | The stop is held once per working-tree state, and the assistant is asked to record where the work stands | enforced by a hook |
| Six or more separate items in one message | The assistant is told to split them into lanes with `/workflow:dispatch` first | enforced note, the assistant does the work |
| Before a commit | `/workflow:review` summarizes what changed, what could break and what was tested | asked of the assistant |

Type `/` to see the skills: `workflow:task`, `workflow:review`, `workflow:handoff`, `workflow:maintain`, `workflow:dispatch`, `workflow:security`, `workflow:release`, and one each from the other three plugins.

**This path follows the repository's main branch.** Nothing checks the installed files against a signed release; path 3 does. Whoever controls main controls the hooks on a trial machine; a machine that holds client work joins signed.

**To take it out again:** in each prepared repository, run `skilliton remove` to see what it would take out (the assistant may run this preview for you), then run `skilliton remove --apply` yourself: the project's instructions and the guardrails reserve that step for a person. It takes out the managed block from CLAUDE.md and AGENTS.md (delete either file if nothing else was in it) and the generated `.skilliton/security/REPORT.md`, and keeps every record and `.skilliton/config.json` (add `--config` to delete that too). On this path `skilliton` is on PATH only inside a Claude Code session; in your own terminal, run it by its full path, `$CLAUDE_CONFIG_DIR` when that is set and `~/.claude` otherwise, then `/plugins/cache/skilliton/workflow/<version>/bin/skilliton`. Then remove the plugins and the marketplace:

```bash
claude plugin uninstall workflow@skilliton
claude plugin uninstall guardrails@skilliton
claude plugin uninstall context-hygiene@skilliton
claude plugin uninstall code-quality@skilliton
claude plugin marketplace remove skilliton
```

**What `skilliton doctor` checks on this path.** Run from the installed copy, it compares each installed base plugin with the catalog of the marketplace it came from and passes those lines when they match. In a repository that is not prepared yet it still exits 1, because CLAUDE.md and AGENTS.md have no managed block (those lines end in `[required]`); after `skilliton prepare --apply` it should exit 0. It reads Claude Code's files from `CLAUDE_CONFIG_DIR` when that is set, else from `~/.claude`, and its header says which. The context-hygiene plugin prints nothing at session start unless `SKILLITON_LESSONS` names a personal checklist file; if it names one that cannot be read, a `[context-hygiene]` line says so and gives the path.

## 3. Roll it out to a team

**This is the signed path for a machine that holds client work:** it pins to a signed release rather than tracking a branch. A company forks this repository, names it, signs its releases and hands each developer one join file. That path is [docs/RELEASING.md](docs/RELEASING.md) for the company and [docs/ONBOARDING.md](docs/ONBOARDING.md) for the developer. In short, a developer runs, once per machine:

```bash
git clone https://github.com/<company>/<skills-repo> ~/company-skills
node ~/company-skills/scripts/skilliton.mjs join --from <join file>           # preview
node ~/company-skills/scripts/skilliton.mjs join --from <join file> --apply   # install, pin, verify
```

The join file carries the company name, the skills repository's address and the approvers' public signing keys, and no secret. It comes from the company, never from the repository, so that whoever can change the repository cannot also change who is trusted. After a join, every repository a session opens on that machine is prepared at its first session start, and `skilliton verify` checks the installed files against the signed release. An empty `.skilliton-off` file at a repository's root (or a `skilliton-off` file inside its `.git` folder, which is never committed) keeps that one repository from being prepared automatically, and keeps Skilliton's workflow hooks out of it altogether: the session start says so in one line, and nothing else runs or is recorded there. The guardrails and the read guard still run. The company side of this path, including `skilliton company join-file`, which writes the join file, is in [docs/RELEASING.md](docs/RELEASING.md).

**From the try path to the team path.** Take the try install out first (the uninstall commands above), then join, so the machine follows one marketplace, the signed one.

**To try the team path against this repository itself,** with no company of your own, make a signers file from the key GitHub publishes for its owner and the address the release tag was signed with, then trust it:

```bash
git clone https://github.com/MojoAI-King/Skilliton.git ~/skilliton-upstream && cd ~/skilliton-upstream
key=$(gh api users/MojoAI-King/ssh_signing_keys --jq '.[0].key')
who=$(git cat-file -p skilliton-release/1.3.0 | sed -n 's/^tagger .*<\(.*\)>.*/\1/p')
printf '%s namespaces="git" %s\n' "$who" "$key" > ~/skilliton.allowed_signers
node scripts/skilliton.mjs trust add --company skilliton --signers ~/skilliton.allowed_signers --apply
node scripts/skilliton.mjs verify --company skilliton --source .
```

`company join-file` writes a join file from the same signers file when you want to rehearse `join --from` end to end. `join` and `preflight` both take `--bin-dir <folder>`, which moves where the launcher is written and probed (default `~/.local/bin`).

## If you are an AI agent installing this for someone

Follow path 2 unless the person names a company join file, in which case follow path 3. Rules that keep the install safe and visible:

1. **Check the prerequisites first** and stop if one is missing, saying which: `uname -s` (Darwin or Linux; stop on anything else), `claude --version` (this guide was run on 2.1.278; an older copy is not verified, and 2.1.92 was measured refusing the default model), `claude auth status` (signed in), `git --version`, `node --version` (22 or later). If `claude` is not on PATH, or is older than the session you are running in, and `CLAUDE_CODE_EXECPATH` is set, use `"$CLAUDE_CODE_EXECPATH"` in place of `claude` in every command below: it names the program the running session uses ([docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)). If neither works, stop and ask the person to install the Claude Code command line, or to install the four plugins from the VS Code extension's own plugin manager (documented by Claude Code, not run through this guide). Then check what is already there:
   - `claude plugin marketplace list` and `claude plugin list`: if a `skilliton` marketplace or any `@skilliton` plugin is listed, say so and ask before adding or installing again, so a rerun after a partial install is not reported as a failure.
   - `ls ~/.config/skilliton/joined/` (or the folder `SKILLITON_JOIN_DIR` names): a `.json` file there means this machine has joined a company. Its plugins came from the company's marketplace, and every unprepared repository a new session opens is prepared at session start without asking, unless the join file said to offer instead. Stop and tell the person, and do not install path 2 on top of it (a second copy of each plugin would sit beside the company's; whether both copies' hooks would then run is not verified). Offer path 3's `skilliton verify` instead, or, if they still want path 2, have them start the new session with `SKILLITON_AUTO_PREPARE=off` set.
2. **Tell the person what you are about to run** before each step, in plain words, and run the commands one at a time. Read each exit status. `claude plugin install` prints `Successfully installed`; anything else is a failure to report, not to retry silently.
3. **Do not edit `~/.claude/settings.json` by hand.** The plugin commands write it, and the running client manages it.
4. **Plugins load at the next session start.** After installing, tell the person to start a new session, because this one does not have them: in a terminal, `/exit` and run `claude` again inside a Git repository; in VS Code, quit it fully and open it again. Do not offer `/reload-plugins` in place of that before the check in step 7: whether it runs the session-start hook and puts `skilliton` on PATH is not verified.
5. **Preview before writing.** Every `skilliton` command that writes shows its change first and writes only with `--apply`. Show the preview, and add `--apply` only after the person agrees. Nothing is prepared without a yes.
6. **Leave the new files uncommitted** for the person to read, unless they ask you to commit them.
7. **Verification happens in the new session, which is a different conversation from yours.** Tell the person to start it inside a Git repository they are willing to set up (in a terminal, `cd` into it and run `claude`), not their home folder: outside a repository the hook says only that the project state is unavailable. Have them type: `hello, then run which -a skilliton`. In a repository Skilliton has not seen, the first reply should offer to set it up in words close to those quoted in path 2; in a prepared one, it should say where things stand. The words "Project state" need not appear, because that block goes to the assistant, not to the person. `which -a skilliton` should list the workflow plugin's launcher, `.../plugins/cache/skilliton/workflow/<version>/bin/skilliton` (measured on 2.1.280); an older client was measured putting it under `.../plugins/marketplaces/skilliton/packs/base/plugins/workflow/bin/` (2.1.92), and on a machine that has joined a company `~/.local/bin/skilliton` is listed first. Where `which` is missing, `type -a skilliton` does the same in bash and zsh. A check that does not depend on the reply's wording: after the session starts, `ls "$(git rev-parse --absolute-git-dir)/skilliton/journal.jsonl"` in that repository finds the journal the session-start hook writes. If any of these is missing, report it as not working and point to [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). `skilliton doctor` is not the install check before the repository is prepared: there it exits 1 because CLAUDE.md and AGENTS.md have no managed block, which is expected until the person says yes (see "What `skilliton doctor` checks on this path" above). The install itself is right when its `marketplace skilliton` and `base plugins` lines read OK.
8. **The stop reminder holds the first stop once** in a session that changed files and recorded no checkpoint; after that it waits 20 minutes from the last checkpoint. A session that changed nothing, or whose only changes are committed, is never held.

A person can hand this whole job to their agent with one message:

```
Install Skilliton for me by following INSTALL.md in https://github.com/MojoAI-King/Skilliton, path 2. Tell me each step before you run it, and do not prepare any repository until I say yes.
```

## When something does not work

[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) lists every case a real session has hit, with its cause. `skilliton doctor` checks an install and prints one line per check, with anything it could not check marked UNVERIFIED rather than passed.
