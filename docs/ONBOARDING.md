# Joining a team that uses Skillgate

Kind: Living. For anyone who will build in a company's prepared repository with Claude Code or Codex, whether or not they write code for a living. Your company's version of this page may name its own marketplace; the steps are the same.

## What you get

- Your assistant knows how this team works: where decisions, tasks and handoffs are kept, when to review, and what it must never do.
- Every piece of work gets a task record, so you, a teammate, or a new session can pick it up exactly where it stopped.
- Some protections run on their own (called **enforced**), and some are instructions the assistant follows (**instructed**). The instructions in your project's `CLAUDE.md` or `AGENTS.md` label every behavior, so you always know which is which.
- The tools update when the company approves a new version, and you can check that what you have is exactly what was approved.

## 1. Install the company tools (once per computer)

You need Claude Code (logged in), Node.js 18 or later, and git, on macOS or Linux. The checks have run on Node.js 22 and 25; Node.js 18 has not been run yet, and Windows has not been tried (docs/COVERAGE.md).

1. Add the company marketplace. Your company gives you its name and location, for example `claude plugin marketplace add <company>/<skills-repo>`.
2. Install the base plugins: `claude plugin install workflow@<marketplace>`, `claude plugin install guardrails@<marketplace>`, and optionally `claude plugin install context-hygiene@<marketplace>`.
3. Trust the company's release signers, from the file your company gives you out of band (not from the repository itself): `skillgate trust add --company <company> --signers <file> --apply` (without `--apply` it shows what it would record).
4. Check it: `skillgate verify --company <company> --source <company skills repository clone>` should say VERIFIED for each plugin.

If `skillgate` is not found in your terminal, the plugins put it on the path only inside Claude Code sessions. In a terminal, run the same command as `node <company skills repository>/scripts/skillgate.mjs <command>`.

**Codex:** add the same marketplace with `codex plugin marketplace add <location>` and install with `codex plugin add workflow@<marketplace>`; `skillgate verify --client codex` checks the install. Codex gives you the skills and the `AGENTS.md` instructions, but it does not run hooks shipped inside plugins, so the session-start summary, the checkpoint reminder and guardrails need hooks your company configures for Codex, each trusted once (`/hooks` in the Codex CLI); ask your maintainer. The Codex IDE extension does not support plugins. See docs/CLIENTS.md for what is proved on each client.

## 2. Open a project

- **A project the team already prepared:** clone it and start a session in its folder. The session start shows the latest handoff and a "Project state" block. Ask: "Where do things stand?"
- **A new or existing project that is not prepared yet:** ask the assistant to prepare it, or run `skillgate prepare --dir <project>` to preview and `skillgate prepare --dir <project> --apply` to apply. It adopts records the project already has, adds only what is missing (marked "not yet assessed"), writes the instruction block, and changes nothing else. Running it again changes nothing.

## 3. Everyday work

1. **Say what you want in your own words.** The assistant turns it into a task record with acceptance criteria and, for anything bigger than a small fix, a branch of its own.
2. **Build.** The assistant explains each change before making it and records checkpoints as things are decided or verified. If it tries to stop with unrecorded changes, a hook reminds it (Claude Code).
3. **Review.** Before committing, the assistant runs a plain-language review: what changed, what could break, what was tested, and the security evidence state, with a verdict of READY TO COMMIT, NEEDS ATTENTION or STOP.
4. **Share.** Push your branch and follow your team's merge process. Where the delivery gate is installed, the shared branch accepts only a combined result that passes the team's checks.
5. **Hand off.** When you stop, ask for a handoff. The next session, yours or a teammate's, starts from it.

## 4. When something goes wrong

- **A command was blocked:** the assistant explains why and suggests a safe next step. Do not try to get around it; ask your maintainer if the rule seems wrong for your case.
- **A push was rejected by the delivery gate:** the message names the failing check. Pull the latest shared branch, run the checks locally (`skillgate delivery check`), fix, and push again.
- **The session ended in the middle of work:** start a new one. The session start tells you the previous session was interrupted, shows the last checkpoint and what is uncommitted, and the assistant resumes from there.
- **The session start says "stale":** the handoff or some security evidence is older than the latest changes. Ask the assistant to reconcile (`/workflow:maintain` on the shared branch, or a checkpoint on your task branch).

## 5. Receiving updates

- Run `claude plugin marketplace update <marketplace>` and `claude plugin update <plugin>@<marketplace>`, then start a new session (measured: this follows the marketplace up to a new version and back down after a rollback). With auto-update on in the team settings, Claude Code documents checking at session start; that has not been observed in Skillgate's rehearsals yet.
- After updating, run `skillgate verify`. VERIFIED means your installed files are exactly an approved release. TAMPERED, UNKNOWN VERSION or WITHDRAWN means stop and tell your maintainer; reinstalling the plugin usually fixes TAMPERED. If verify says a file is not executable, its hook or command cannot run: reinstall the plugin.
- If the session start says the project needs a migration, preview it with `skillgate migrate` and apply it with `skillgate migrate --apply` on the shared branch (or ask your maintainer). A migration never rewrites your records or text outside the managed blocks; `skillgate migrate --rollback <id> --apply` undoes it while the migrated files are unchanged.

## 6. Leaving or removing Skillgate

`skillgate remove --dir <project> --apply` removes the managed instruction blocks and generated reports and keeps every record, task, decision, lesson, evidence record and the Git history. Uninstall the plugins with `claude plugin uninstall <plugin>@<marketplace>`.
