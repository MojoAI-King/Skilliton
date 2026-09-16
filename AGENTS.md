<!-- skillgate:harness:start v1 -->
## How we work here (Skillgate)

This block is managed by Skillgate. Edit `templates/harness.md` in the company skills repo, not this copy; it is replaced on the next update.

Each behavior below is marked **enforced** (a hook does it every time, whatever anyone types) or **instructed** (you, the assistant, are told to do it and should, but nothing forces it). Enforced behaviors hold only while the `workflow` and `guardrails` plugins are installed and enabled; `node scripts/skillgate.mjs doctor` in the company skills repo checks that.

### Start of a session
- **Enforced:** the latest `RESUME HERE` section of `docs/HANDOFF.md` is shown at session start. Read it before doing anything else, and tell the user in one sentence where things stand.
- **Instructed:** if there is no handoff yet, ask what the user wants to get done today before exploring the codebase.

### While working
- **Instructed:** never load a large file whole. Search it or read the part you need. Keep command output out of the conversation when a summary will do.
- **Instructed:** when the user pastes six or more separate tasks, bugs, or notes, use `/workflow:dispatch` to verify and split them before writing code.
- **Instructed:** explain what you are about to change in plain language before changing it, especially for users who are not developers.
- **Enforced:** risky git commands are blocked by the guardrails hook (force-pushing a protected branch, skipping git hooks with `--no-verify`, committing files that look like secrets). When one is blocked, explain the reason in plain language and offer the safe alternative. Never try to get around a block.

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
