# Skillgate: session contract

Kind: Living.

All preparation/security source, tests, demo, verification and archived design notes are in this checkout. Read docs/AUTOPILOT_START_HERE.md for the material index and docs/BUILD_GOAL.md for the full execution objective; no earlier chat or sibling worktree is required.

Read PLAN.md v4 before doing anything. It is the canonical development-autopilot direction; its milestones supersede the older day-by-day scope. Then read docs/HANDOFF.md (where things stand), DECISIONS.md (every choice and the open items), docs/CONTRACTS.md (shared names and formats), and docs/LESSONS.md (what went wrong here and what now prevents it). docs/MAINTAIN.md lists this repo's own end-of-session steps.

Rules for every session in this repo:
- Continue authorized work from the current milestone in PLAN.md and docs/HANDOFF.md. Use docs/AUTOPILOT_INTEGRATION.md for the next integration. Do not revive a superseded branch roadmap or wait for an obsolete day number. Keep unverified gates open.
- Agree shared files and interfaces before parallel implementation. Preserve other sessions' work. The integrating session owns shared contracts, PLAN.md and final decision/status reconciliation.
- Nothing silent, ever. A crashed check, a missing field, or an unverified assumption is reported as such, never rounded up to success.
- Do not invent Claude Code hook or plugin capabilities. If a behavior is not confirmed in the official docs or by running it, say "unverified" and propose the test.
- No dollar or percentage savings claims anywhere in this repo unless produced by scripts/token-cost.mjs and cross-checked. See PLAN.md Sections 6 and 8 and DECISIONS.md O2/O3.
- No em dashes or en dashes in any file.
- Do not touch client material. Public examples are sanitized copies only. No client, evaluator, or personal names anywhere in this repo; run scripts/scrub-check.sh before every commit.

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
