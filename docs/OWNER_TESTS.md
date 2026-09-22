# Owner tests for the evening of 2026-09-22

Kind: Living. Written 2026-09-22 for the owner, the evening before the 2026-09-23 meeting. It is the list of what only you can do, in the order that wastes the least time. Each test gives the exact command or click, what you should see, and how long it takes. The longer list, including the steps that need another person or machine, is docs/OWNER_WALKTHROUGH.md. This file says which of its steps each test covers.

**How to report.** For each test, write down what you saw in the client's exact words, or "not seen". Paste those notes into the next session and say "file tonight's owner tests". That session writes the evidence notes and ticks the boxes. A test that fails is a finding, not a step to repeat until it passes.

**Before you start (2 minutes).** The workflow plugin went to 0.21.0 and guardrails to 0.7.0 at 17:06 EDT, after your last restart. Quit VS Code fully and open it again, so the hooks you test are the new ones.

## Tonight, on this machine

### 1. The session start in this repository (2 minutes)

- **Do:** open `~/Desktop/Skilliton` in VS Code and start a new Claude Code session. Send `hello`.
- **You should see:** the reply is based on a "Project state" block. Ask "what does the Project state block say about Versions?" It should say `workflow runtime 0.21.0 installed`. The guardrails line should read `[guardrails] on: force-push to protected branches, --no-verify, secret files, and removal of Skilliton's files are blocked.`
- **Covers:** the start of walkthrough step 2.

### 2. The keyboard checks in the extension (10 minutes)

Do all five in the session from test 1.

1. **The confirmation prompt.** Send: `Add one line to the end of README.md, then run git checkout -- .` (with the dot). You should see Claude Code ask you to confirm it, with a guardrails reason that starts `Check first: this throws away every uncommitted edit to tracked files`. Answer **No**, then ask it to remove the README line itself. A single-file `git checkout -- README.md` is not asked about, by design, so use the dot. Covers 01-01 item 3 (B5).
2. **The skills.** Type `/` in the prompt box. You should see `workflow:task`, `workflow:review`, `workflow:handoff`, `workflow:maintain`, `workflow:security`, `workflow:dispatch`, `workflow:release`, `guardrails:guardrails`, `context-hygiene:context-hygiene` and `code-quality:split-a-file`. Covers 03-01 item 2.
3. **The status line.** Look at the bottom of the Claude Code panel. Write down what the status line shows, or that there is none. Covers 03-01 item 2.
4. **The read guard.** Send: `Read the whole file scripts/lifecycle.test.mjs with the Read tool, not a range`. You should see the read refused with a message naming the 50 KB limit and how to read a range instead. The file is about 146 KB. Covers 03-01 item 1.
5. **The stop hook.** Leave one small uncommitted change, for example `Add a line "test" to a new file scratch.txt`, and keep the session going for 20 minutes (this project's `checkpoints.minMinutes`). You can do the other tests meanwhile. The next time the assistant finishes a reply, it should be held with `Skilliton checkpoint reminder: the working tree has changed since ...`. Then ask it to delete `scratch.txt`. Covers 03-01 item 1.

### 3. Dispatch, maintenance and the guardrails notice, in a scratch repository (15 minutes)

These were each measured today in headless runs. What is left is how they look to a person in the extension. Use a scratch repository so nothing real is touched.

- **Set up, in a terminal:**

  ```bash
  mkdir -p ~/scratch-owner && cd ~/scratch-owner && git init -q -b main && printf '# Scrach\n' > README.md && printf 'console.log("hi")\n' > index.js && git add -A && git commit -qm first && git init -q --bare ../scratch-owner-remote.git && git remote add origin ../scratch-owner-remote.git && git push -q origin main && code .
  ```

  If `code .` is not found, open the folder from VS Code's File menu instead.

- **a. Preparation.** Start a Claude Code session in that window and send `hello`. You should see that the repository was just prepared: the block's first note reads `Prepared just now (this machine joined ...)`, and `git status` in the terminal shows the new files. Commit them in the terminal with `git add -A && git commit -qm prepared`.
- **b. Dispatch.** Send this as one message:

  ```
  1. Fix the typo in the README title
  2. Add an MIT LICENSE file
  3. Add a .editorconfig
  4. Make index.js print hello
  5. Add a CONTRIBUTING.md
  6. Add a CHANGELOG.md
  ```

  You should see the assistant run `/workflow:dispatch` before it edits anything, and write `LANES.md` with one lane and a coverage ledger of six items. If it does the chores first, it should be held when it tries to finish, with `Skilliton dispatch was named for a prompt in this session ...`. Write down which of the two happened.
- **c. Maintenance.** In the terminal:

  ```bash
  git add -A && git commit -qm chores && git checkout -qb feature && echo x > feature.txt && git add -A && git commit -qm feature && git checkout -q main && git merge --no-ff -qm "merge feature" feature
  ```

  Then send `say ok`. When the assistant finishes, it should be held with `Skilliton maintenance is due: 1 merge commit(s) landed ...`, and it should run `skilliton maintain --apply`.
- **d. The guardrails notice.** In the terminal, turn the force-push rule off for this scratch repository only:

  ```bash
  node -e 'const f=".skilliton/config.json";const c=JSON.parse(require("fs").readFileSync(f,"utf8"));c.guardrails={...(c.guardrails||{}),blockForcePush:false};require("fs").writeFileSync(f,JSON.stringify(c,null,2)+"\n")' && git add -A && git commit -qm "force push allowed here" && git commit -q --amend -m "force push allowed here, amended"
  ```

  Then send: `Run exactly this: git push -f origin main`. The push should go through, and you should see a notice reading `[guardrails] Let through only because "blockForcePush": false under guardrails in .skilliton/config.json turned that rule off; with the rule on, this command would be blocked.` Write down where the notice appeared and whether you would have noticed it. B50.
- **Clean up afterwards:** `rm -rf ~/scratch-owner ~/scratch-owner-remote.git`.

### 4. The security applicability decisions (5 minutes with the proposal)

This repository's register lists 15 controls, and every one is undecided. For each, you decide whether it applies to Skilliton, with one sentence of reason. **docs/SECURITY_PROPOSAL.md now proposes all fifteen with their reasons: read its table, change any row you disagree with, and say "accept the security proposal".** The steps below are the long way.

- **See them:** `cd ~/Desktop/Skilliton && node scripts/skilliton.mjs security status`
- **Record one** (`--decided-by owner`, not your name, because names never go in this repository):

  ```bash
  node scripts/skilliton.mjs security applicability --control SG-SESSION-HANDLING --applies false --rationale "Skilliton has no server and no sign-in; it runs as a local command" --decided-by owner --apply
  ```

- **The 15:** SG-CHECK-CRITERIA, SG-CHECK-EVIDENCE, SG-SECURITY-TESTS, SG-ROOT-CAUSE, SG-RECURRING-PATTERNS, SG-WORKFLOW-IMPROVEMENT, SG-COMMAND-INJECTION, SG-SECRETS-IN-SOURCE, SG-DEPENDENCY-RISK, SG-AUTHENTICATION, SG-SESSION-HANDLING, SG-ACCESS-CONTROL, SG-INPUT-INJECTION, SG-SECURITY-LOGGING, SG-POLICY-CHANGE-REVIEW.
- **You should see:** `security status` lists each decided control with its rationale, and the undecided count goes down to zero.
- **Easier route:** tell the next session "these apply: ... ; these do not, because ..." and it will run the commands. The decision stays yours. Covers 05-03 item 1 (B7), walkthrough step 12.

### 5. The Usage screen against the meter for 2026-09-21 (10 minutes)

- **Do:** in a terminal, run the meter's self-test and then the meter for that day:

  ```bash
  cd ~/Desktop/Skilliton && node scripts/token-cost.test.mjs && node scripts/token-cost.mjs 2026-09-21 2026-09-22 --project "$(basename "$(dirname "$(ls -t ~/.claude/projects/*Skilliton/*.jsonl | head -1)")")"
  ```

  Then open claude.ai, go to Settings, then Usage, and find 2026-09-21.
- **You should see:** the meter prints its request count and peak context for the day (990 requests at the top level when it was last read). Write down what the Usage screen shows for the same day, in its own units, whatever they are. No figure goes into the repository until the two have been compared. Covers B9 and O2. It is the first half of walkthrough step 13.

### 6. The maintain minutes (1 minute)

- **Do:** write down two numbers. First, how many minutes an end-of-day `/maintain` took you before this week. Second, how many minutes the maintenance took today, now that the stop hook asks for it and `skilliton maintain --apply` does the mechanical half.
- **You should see:** only your own numbers. Nothing measures this for you. Covers 01-02 item 5 and 05-05 items 1 and 2, walkthrough steps 4 and 5.

### 7. Your other repositories (2 minutes each, as you open them)

- **Do:** open each repository in VS Code as you normally would. On its first session start, it is either prepared or its managed block is migrated, and the block says which (`Prepared just now` or `Migrated just now`). Then in a terminal in that repository:

  ```bash
  git status --short
  ```

  Commit the Skilliton files it lists (`.skilliton/`, `CLAUDE.md`, `AGENTS.md`, `DECISIONS.md` and the records under `docs/`) as one commit of their own, so nothing unrelated rides along.
- **You should see:** the next session start in that repository says `Pending migrations: none pending`.

### 8. One decision only you can make, and the release (2 minutes)

- **Where the join file is published (B53).** A developer of your company needs the join file to run `skilliton join --from <file> --apply`. It holds the company name, the skills repository's address and the public signing keys, and no secret. Choose one: committed in the company's fork, attached to its releases, or handed out by IT. Tell the next session which.
- **Release 1.0.0: done.** Signed and pushed on 2026-09-22 at your go, before these tests by your choice. A fresh clone sees it approved, and `skilliton verify` on this Mac reads VERIFIED for all four plugins at both scopes (evidence/live/2026-09-22-release-1.0.0.md). If a test tonight finds something, the fix ships as 1.0.1 the same way.

### 9. The report card grades (10 minutes, last)

- **Do:** open docs/REPORT_CARD.md. The bars were recomputed today from the ticked items: 99 of 123, up from 95. The letter grades are still the ones you gave on 2026-09-18.
- **You should see:** each area's bar and your letter beside it. Regrade any letter you want to change, and tell the next session. A session never changes a letter.

## Not tonight: needs another person, machine or account

Each has a full step in docs/OWNER_WALKTHROUGH.md.

| What | Walkthrough step | What it needs |
|---|---|---|
| A Codex session in a prepared repository | 7 | a logged-in Codex in an isolated home (B2) |
| The clean macOS account | 8 | a fresh user account on a Mac |
| The Windows run | 9 | the Windows machine |
| A hosted repository with branch protection | 10 | your approval to create a disposable hosted repository |
| A private repository install | 11 | the same, private, with a credential named by location only |
| The measured comparison | 13 | the tasks, ceiling and measure agreed first, then the Usage screen |
| The new builder rehearsal | 14 | a person who has not seen this repository |
| Endpoint security (09-03) | none | a named endpoint-security product and policy |
