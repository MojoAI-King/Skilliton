# Skillgate: session contract

Kind: Living.

Read PLAN.md v4 (canonical product direction), docs/HANDOFF.md (current work), docs/CONTRACTS.md (implemented versus target contracts), DECISIONS.md and docs/LESSONS.md. docs/AUTOPILOT_INTEGRATION.md guides the next milestone; docs/MAINTAIN.md holds this repository's maintenance steps.

Continue authorized work from the current milestone, preserving other sessions' changes. Do not revive older day-by-day or prototype roadmaps. Agree shared files and interfaces before parallel work; one integrating session owns the shared plan/contracts and decision reconciliation. Keep unverified gates open.

Public-repo rules: no client or personal material, credential values, absolute home-directory paths, or em/en dashes. Run scripts/scrub-check.sh before committing. Do not claim savings without reproduced, cross-checked evidence.

<!-- skillgate:harness:start v1 -->
## How we work here (Skillgate)

This block is managed by Skillgate. Edit `templates/harness.md` in the company skills repo, not this copy. Changes reach this project when `harness --apply` runs; automatic repository migration on plugin update is not implemented yet.

Each behavior below is marked **enforced** (an installed, enabled hook handles its supported event) or **instructed** (the assistant is asked to do it). The current hook implementation targets Claude Code. `node scripts/skillgate.mjs doctor` in the company skills repo inspects installation and configuration records; actual hook execution must be observed separately. Codex behavior has not been rehearsed.

### Start of a session
- **Enforced within the supported session-start hook:** the configured handoff's latest `RESUME HERE` section is shown when present (default `docs/HANDOFF.md`). Missing content is reported. **Instructed:** read it, verify its claims against current work, and tell the user briefly where things stand. Display does not prove the handoff is current.
- **Instructed:** if there is no handoff yet, ask what the user wants to get done today before exploring the codebase.

### While working
- **Instructed:** never load a large file whole. Search it or read the part you need. Keep command output out of the conversation when a summary will do.
- **Instructed:** when the user pastes six or more separate tasks, bugs, or notes, use `/workflow:dispatch` to verify and split them before writing code.
- **Instructed:** explain what you are about to change in plain language before changing it, especially for users who are not developers.
- **Enforced within supported Claude Bash calls while guardrails is enabled:** the hook checks for protected-branch force pushes, skipped git hooks and secret-shaped commits. It does not inspect all indirect commands or govern other terminals. When a command is blocked, explain why and offer a safe next step. Never try to get around a block. Shared merge eligibility belongs to the repository's trusted checks and review policy.

### Before committing
- **Instructed:** run `/workflow:review` on the working tree and show the user its summary: what changed, what could break, and what was tested.
- **Instructed:** run the project's tests and read the result before committing. Never commit on a failing test without the user explicitly agreeing.

### End of a stretch of work
- **Instructed:** when the work is finished, when the user is stepping away, or when the conversation has grown large, run `/workflow:handoff` so the next session, or the next person, can pick up without re-explaining.
- **Instructed:** after merging a batch of work or at the end of a working day, run `/workflow:maintain` to bring the decisions, status, and lessons up to date.

### Always
- **Instructed:** say "I don't know" or "not verified" instead of guessing, and never report a failed or skipped check as a success.
- **Instructed:** never write a secret value (keys, tokens, passwords) into any file, commit, or message.
<!-- skillgate:harness:end -->
