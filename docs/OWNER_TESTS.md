# Owner tests for the night of 2026-09-22

Kind: Living. Rewritten 2026-09-22 at 21:30 EDT for the owner, the night before the 2026-09-23 meeting. It lists what only you can do, in the order that wastes the least time. Each test gives the exact command or click, what you should see, and how long it takes. The longer list, including the steps that need another person or machine, is docs/OWNER_WALKTHROUGH.md.

**How to report.** For each test, write down what you saw in the client's exact words, or "not seen". Paste those notes into the next session and say "file tonight's owner tests". That session writes the evidence notes and ticks the boxes. A test that fails is a finding, not a step to repeat until it passes.

**Already measured tonight by the build session, so not on this list:** the session-start, stop and read-guard hooks firing in the VS Code extension (evidence/live/2026-09-22-vs-code-extension-hooks.md), a real Codex session (evidence/live/2026-09-22-codex-session.md), the Windows commands and every session hook on a hosted Windows machine, before and after the port (evidence/live/windows/), and a cold install from GitHub by an agent following INSTALL.md.

**Before you start (2 minutes).** Quit VS Code fully and open it again, so the hooks you test are the installed release's.

## 1. Four answers: given

At 21:33 EDT you wrote "Feel free to not ask me any more questions. I'm just going to confirm every single one anyway." The session took that as yes to all four:

1. **The security decisions** are recorded with `--decided-by owner` as docs/SECURITY_PROPOSAL.md proposed (13 apply, 2 do not). Read the table there and tell the next session if any row should change.
2. **The measured comparison** ran under docs/COMPARISON_PROTOCOL.md: evidence/comparison/2026-09-22/SUMMARY.md. What is left is yours: open claude.ai, Settings, Usage, and write down what it shows for 2026-09-22 after 21:30 EDT, so the token counts can be cross-checked (10-02 item 2).
3. **Release 1.0.1** is signed by the session with your git SSH key once the last change of the night is merged; the handoff says when.
4. **The join file (B53)** is handed out by the company, never committed to the repository, which is what the design already assumes; docs/ONBOARDING.md step 1 says so.

## 2. Three things only a person can see in the extension (5 minutes)

In a new Claude Code session in `~/Desktop/Skilliton`:

1. **The confirmation prompt.** Send: `Add one line to the end of README.md, then run git checkout -- .` (with the dot). Claude Code should ask you to confirm, with a guardrails reason starting `Check first: this throws away every uncommitted edit to tracked files`. Answer **No**, then ask it to remove the README line. Covers 01-01 item 3 (B5).
2. **The skills in the menu.** Type `/`. You should see the `workflow:` skills, `guardrails:guardrails`, `context-hygiene:context-hygiene` and `code-quality:split-a-file`. The build session measured that the extension gives all ten to the model; this checks they appear in the menu you type into. Covers 03-01 item 2.
3. **The status line.** Look at the bottom of the Claude Code panel and write down what it shows, or that there is none. Covers 03-01 item 2.

## 3. The separate account: the cold read and the clean-Mac install (30 to 45 minutes)

You planned a cold read on a separate account. The same account closes the clean-macOS items (02-03), so run it this way.

**a. Make the account** (as yourself): System Settings, Users and Groups, Add User, a Standard account. Log out and into it.

**b. As a newcomer, in the new account:** install Claude Code the way you normally do, and sign in. Then open a browser at <https://github.com/MojoAI-King/Skilliton> and follow INSTALL.md path 2 exactly as written, or hand it to the assistant with the one-sentence prompt INSTALL.md gives. Write down every place you had to know something the page did not say. Then clone any small repository, open it in Claude Code, say `hello`, and say yes when it offers to set the project up.

**You should see:** the plugins install with `Successfully installed plugin`; the new session's first reply is based on a "Project state" block and offers setup in plain words; after yes, `git status` shows the new records uncommitted.

**c. Optional, the device-management route (15 minutes more, needs your admin password):** back in your own account, place the managed-settings drop-in a company's device management would place, then start a session in the new account without installing anything by hand:

```bash
sudo mkdir -p "/Library/Application Support/ClaudeCode/managed-settings.d"
sudo tee "/Library/Application Support/ClaudeCode/managed-settings.d/50-skilliton.json" > /dev/null <<'EOF'
{ "extraKnownMarketplaces": { "skilliton": { "source": { "source": "github", "repo": "MojoAI-King/Skilliton" }, "autoUpdate": true } },
  "enabledPlugins": { "workflow@skilliton": true, "guardrails@skilliton": true, "context-hygiene@skilliton": true } }
EOF
```

**You should see**, within the new account's first three session starts, the three plugins installed and running with nobody typing an install command. On Linux, from the GitHub marketplace, the first start registered it, the second installed the plugins, and the third ran with their skills and hooks (evidence/rehearsals/2026-09-17-enrollment/SUMMARY.md). Count the starts. Whether macOS reads the `managed-settings.d` folder rather than only `managed-settings.json` is **not verified**; if nothing installs, that is the finding. Remove the file afterwards, because it applies to every account on the Mac:

```bash
sudo rm "/Library/Application Support/ClaudeCode/managed-settings.d/50-skilliton.json"
```

Covers 02-03 items 1 and 3, and walkthrough step 8.

## 4. Dispatch, maintenance and the guardrails notice, in a scratch repository (15 minutes, optional)

These were measured in headless runs. What is left is how they look to a person in the extension.

- **Set up, in a terminal:**

  ```bash
  mkdir -p ~/scratch-owner && cd ~/scratch-owner && git init -q -b main && printf '# Scrach\n' > README.md && printf 'console.log("hi")\n' > index.js && git add -A && git commit -qm first && git init -q --bare ../scratch-owner-remote.git && git remote add origin ../scratch-owner-remote.git && git push -q origin main && code .
  ```

- **a. Preparation.** Start a Claude Code session there and send `hello`. The block's first note reads `Prepared just now (this machine joined ...)`. Commit the new files: `git add -A && git commit -qm prepared`.
- **b. Dispatch.** Send as one message: `1. Fix the typo in the README title 2. Add an MIT LICENSE file 3. Add a .editorconfig 4. Make index.js print hello 5. Add a CONTRIBUTING.md 6. Add a CHANGELOG.md` (one item per line). The assistant should run `/workflow:dispatch` before editing, and write `LANES.md`. If it does the chores first, it should be held when it tries to finish, with `Skilliton dispatch was named for a prompt in this session ...`. Write down which happened.
- **c. Maintenance.** In the terminal: `git add -A && git commit -qm chores && git checkout -qb feature && echo x > feature.txt && git add -A && git commit -qm feature && git checkout -q main && git merge --no-ff -qm "merge feature" feature`. Then send `say ok`. It should be held with `Skilliton maintenance is due: 1 merge commit(s) landed ...` and run `skilliton maintain --apply`.
- **d. The guardrails notice.** Turn the force-push rule off for this scratch repository only, in your own terminal (once 1.0.1 is installed, the assistant is refused when it tries this itself):

  ```bash
  node -e 'const f=".skilliton/config.json";const c=JSON.parse(require("fs").readFileSync(f,"utf8"));c.guardrails={...(c.guardrails||{}),blockForcePush:false};require("fs").writeFileSync(f,JSON.stringify(c,null,2)+"\n")' && git add -A && git commit -qm "force push allowed here" && git commit -q --amend -m "force push allowed here, amended"
  ```

  Then send `Run exactly this: git push -f origin main`. The push should go through with a notice reading `[guardrails] Let through only because "blockForcePush": false ...`. Write down where it appeared. B50.
- **Clean up:** `rm -rf ~/scratch-owner ~/scratch-owner-remote.git`.

## 5. The Usage screen against the meter for 2026-09-21 (10 minutes)

The meter now prices every model this machine used, so the day's reconstruction is complete.

```bash
cd ~/Desktop/Skilliton && node scripts/token-cost.test.mjs && node scripts/token-cost.mjs 2026-09-21 2026-09-22 --project "$(basename "$(dirname "$(ls -t ~/.claude/projects/*Skilliton/*.jsonl | head -1)")")"
```

Then open claude.ai, Settings, Usage, and find 2026-09-21. Write down what it shows for that day in its own units. No figure goes into the repository until the two are compared. Covers B9 and O2, and the first half of walkthrough step 13.

## 6. The maintain minutes (1 minute)

Write down how many minutes an end-of-day `/maintain` took you before this week, and how many today, now that the stop hook asks for it and `skilliton maintain --apply` does the mechanical half. Only your numbers count. Covers 01-02 item 5 and 05-05 items 1 and 2.

## 7. Your other repositories (2 minutes each, as you open them)

On a repository's first session start it is prepared or migrated, and the block says which. Then `git status --short` in that repository, and commit the Skilliton files it lists as one commit of their own. The next session start should say `Pending migrations: none pending`.

## 8. The report card grades (10 minutes, last)

Open docs/REPORT_CARD.md. The bars were recomputed tonight from the ticked items. The letters are still the ones you gave on 2026-09-18, and a session never changes a letter. The build session writes its own proposed regrade, with the evidence behind each letter, at the end of the night; regrade any area you want and tell the next session.

## Not tonight: needs another person, machine or account

| What | Walkthrough step | What it needs |
|---|---|---|
| Windows on a real workstation | 9 | a Windows machine with a Claude login; the hosted-runner port is merged (evidence/live/windows/2026-09-23-hosted-runner-port.md), and B80 stands before support |
| A hosted repository with branch protection | 10 | your approval to create a disposable hosted repository |
| A private repository install | 11 | the same, private, with a credential named by location only |
| The new builder rehearsal | 14 | a person who has not seen this repository |
| Endpoint security (09-03) | none | a named endpoint-security product and policy |
