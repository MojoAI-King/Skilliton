# Joining a team that uses Skilliton

Kind: Living. For anyone who will build in a company's prepared repository with Claude Code or Codex, whether or not they write code for a living. Your company's version of this page may name its own marketplace; the steps are the same.

## What you get

- Your assistant knows how this team works: where decisions, tasks and handoffs are kept, when to review, and what it must never do.
- Every piece of work gets a task record, so you, a teammate, or a new session can pick it up exactly where it stopped.
- Some protections run on their own (called **enforced**), and some are instructions the assistant follows (**instructed**). The instructions in your project's `CLAUDE.md` or `AGENTS.md` label every behavior, so you always know which is which.
- The tools update when the company approves a new version, and you can check that what you have is exactly what was approved.

## 1. Set up your computer (once)

You need Claude Code or Codex, Node.js 22 or later, and git, on macOS or Linux. On Windows you also need Git for Windows, because Claude Code runs each hook through Git Bash there, and the Skilliton commands are run from Git Bash. Windows is not supported yet: since the port, the commands and the hooks pass on a GitHub-hosted Windows runner (evidence/live/windows/2026-09-23-hosted-runner-port.md), but backlog item B80 stands, and no Claude Code session has run on Windows (docs/BACKLOG.md B30, docs/WINDOWS.md). The checks have run on Node.js 22 and 25; Node.js 18 has not been run yet (docs/COVERAGE.md).

1. **Get one file from your company:** its join file (`<company>.skilliton-join.json`), which names the company, where its skills repository lives, and its release signers. It comes separately (from device management, an internal page, or a person at the company), never from the repository itself, so whoever can change the repository cannot also change whom your machine trusts (the owner's decision of 2026-09-22, B53). If your company hands out the two facts instead of the file, you need its short name and its `allowed_signers` file; the commands below take `--company <name> --signers <file>` in place of `--from <file>`.
2. **Check this machine first (on a managed laptop):** `node ~/company-skills/scripts/skilliton.mjs preflight` says whether the programs Skilliton needs can run here, whether it can write the folders it uses, and whether the company's plugin repository can be reached. It changes nothing, and names what IT would have to allow for anything blocked (docs/IT-ALLOWLIST.md). `join` runs the same checks and stops before changing anything if one of them would stop setup.
3. **Clone the repository and preview:** `git clone <company skills repository> ~/company-skills`, then `node ~/company-skills/scripts/skilliton.mjs join --from <join file>`. It lists what it would add for each coding tool it finds, and writes nothing.
4. **Apply it:** run the same command with `--apply`. It adds the company marketplace and plugins, trusts the signers, puts a `skilliton` command in `~/.local/bin`, and ends with `skilliton verify`, which should say VERIFIED for every plugin. If it says `~/.local/bin` is not on your PATH, add the line it prints to your shell profile.
5. **Your clone sits on a signed release.** `join` moves the clone to the newest approved release before it writes anything, checking out the commit the verified tag names rather than the tag name, and refuses if the newest tag is unsigned or has been re-made on another commit. It says which release it pinned to. To move later: `skilliton pin --release <x.y.z> --apply` or `skilliton pin --latest --apply`; `skilliton pin` on its own shows where the clone is and what it could move to. Your clone is then on a detached HEAD, which is deliberate; the command prints the `git checkout <branch>` that undoes it. Pass `join --no-pin` to skip it. This pins the clone Skilliton itself runs from, not your client's downloaded copy of a plugin, because neither client offers a ref to install from; `skilliton verify` is what reports a download that does not match an approved release.
6. **To take it back out:** `skilliton join --undo --company <company> --apply` removes exactly what join added and keeps what you had before.

By hand instead: `claude plugin marketplace add <company>/<skills-repo>`, `claude plugin install workflow@<marketplace>` and each other plugin, `skilliton trust add --company <company> --signers <file> --apply`, then `skilliton verify --company <company> --source <clone>`. Inside a Claude Code session `skilliton` resolves to the terminal command join wrote, which is first on PATH; the workflow plugin's own `bin/` is on the Bash tool's PATH too, but only in a session started after the plugin was installed (both measured on 2026-09-19: `evidence/live/2026-09-19-which-skilliton-in-a-session.md` and `evidence/live/2026-09-19-path-in-a-new-session.md`).

**Codex:** `join` sets Codex up too when it is installed. By hand, add the same marketplace with `codex plugin marketplace add <location>` and install with `codex plugin add workflow@<marketplace>`; `skilliton verify --client codex` checks the install. Codex gives you the skills and the `AGENTS.md` instructions, but it does not run hooks shipped inside plugins, so the session-start summary, the checkpoint reminder and guardrails need hooks your company configures for Codex, each trusted once (`/hooks` in the Codex CLI); ask your maintainer. The Codex IDE extension does not support plugins. See docs/CLIENTS.md for what is proved on each client.

## 2. Open a project

- **A project the team already prepared:** clone it and start a session in its folder. The session start shows the latest handoff and a "Project state" block. Ask: "Where do things stand?"
- **A new or existing project that is not prepared yet:** on a machine that has joined, the first session start prepares it and says what it wrote; commit those files with your next commit. Elsewhere, ask the assistant to prepare it, or run `skilliton prepare --dir <project>` to preview and `skilliton prepare --dir <project> --apply` to apply. It adopts records the project already has, adds only what is missing (marked "not yet assessed"), writes the instruction block, and changes nothing else. Running it again changes nothing.

Preparing does not write `.claude/settings.json`; `skilliton project-settings --apply` writes the team's plugin settings there when the project should enable the plugins for everyone who opens it, and `doctor` warns until one exists.

## 3. Everyday work

1. **Say what you want in your own words.** The assistant turns it into a task record with acceptance criteria and, for anything bigger than a small fix, a branch of its own.
2. **Build.** The assistant explains each change before making it and records checkpoints as things are decided or verified. If it tries to stop with unrecorded changes, a hook reminds it (Claude Code).
3. **Review.** Before committing, the assistant runs a plain-language review: what changed, what could break, what was tested, and the security evidence state, with a verdict of READY TO COMMIT, NEEDS ATTENTION or STOP.
4. **Share.** Push your branch and follow your team's merge process. Where the delivery gate is installed, the shared branch accepts only a combined result that passes the team's checks.
5. **Hand off.** When you stop, ask for a handoff. The next session, yours or a teammate's, starts from it.
6. **Close the task.** The assistant ticks each criterion as it is met; when the work is done, it (or you) closes the record with `skilliton task close <id> --state done-local --apply`, or `merged` once it lands, and the open-tasks index follows.

## 4. When something goes wrong

- **A command was blocked:** the assistant explains why and suggests a safe next step. Do not try to get around it; ask your maintainer if the rule seems wrong for your case.
- **A push was rejected by the delivery gate:** the message names the failing check. Pull the latest shared branch, run the checks locally (`skilliton delivery check`), fix, and push again.
- **The session ended in the middle of work:** start a new one. The session start says the previous session was interrupted (it left no session end, as after a crash), or that it ended with uncommitted changes and no checkpoint (as when it ran out of turns), shows the last checkpoint and what is uncommitted, and the assistant resumes from there.
- **The session start says "stale":** the handoff or some security evidence is older than the latest changes. Ask the assistant to reconcile (`/workflow:maintain` on the shared branch, or a checkpoint on your task branch).

## 5. Receiving updates

- Run `claude plugin marketplace update <marketplace>` and `claude plugin update <plugin>@<marketplace>`, then start a new session (measured: this follows the marketplace up to a new version and back down after a rollback). With auto-update on in the team settings, Claude Code documents checking at session start; that has not been observed in Skilliton's rehearsals yet.
- After updating, run `skilliton verify`. VERIFIED means your installed files are exactly an approved release. TAMPERED, UNKNOWN VERSION or WITHDRAWN means stop and tell your maintainer; reinstalling the plugin usually fixes TAMPERED. If verify says a file is not executable, its hook or command cannot run: reinstall the plugin.
- If the session start says the project needs a migration, preview it with `skilliton migrate` and apply it with `skilliton migrate --apply` on the shared branch (or ask your maintainer). A migration never rewrites your records or text outside the managed blocks; `skilliton migrate --rollback <id> --apply` undoes it while the migrated files are unchanged.

## 6. Leaving or removing Skilliton

`skilliton remove --dir <project> --apply` removes the managed instruction blocks and generated reports and keeps every record, task, decision, lesson, evidence record and the Git history. Uninstall the plugins with `claude plugin uninstall <plugin>@<marketplace>`.
