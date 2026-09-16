# Lessons

Kind: Living. This repository's own lessons, specific and technical, in the format `/workflow:maintain` writes (what broke, the mechanism, the fix, the rule, what now enforces it).

## 2026-09-16 A test certified a copy of the hook instead of the hook that ships

1. **What broke:** on the real lessons file, the shipped session-start hook injected 1 byte, silently, while its fixture test passed.
2. **The mechanism:** the hook matched the heading exactly (`$0 == h`) and the real heading carries a suffix; the test ran `scripts/fixtures/hook/repaired.awk`, a copy of the logic, against a sample whose heading had no suffix.
3. **The fix:** prefix match and a visible notice when nothing is found, in `packs/base/plugins/context-hygiene/hooks/session-start-checklist.sh`.
4. **The rule:** a test drives the file that ships, with the input shape that production actually has.
5. **What now enforces it:** `scripts/hook-fixture.test.sh` runs the shipped hook against a suffixed heading; run with `--hook` against the old hook, it fails.

## 2026-09-16 Hook scripts that could never run passed every test

1. **What broke:** the session-start hook and the status line were committed without the executable bit since the first commit, including the published one.
2. **The mechanism:** `hooks.json` and `setup.mjs` run both scripts by path, which needs mode 755; every test ran them as `bash <script>`, which does not.
3. **The fix:** executable bits set in git (`git update-index --chmod=+x`).
4. **The rule:** invoke a script in tests the way production invokes it.
5. **What now enforces it:** `scripts/packs.test.mjs` fails on any non-executable hook script; `hook-fixture.test.sh` and `statusline.test.sh` run the scripts by path.

## 2026-09-16 A piped gate let a failing commit through

1. **What broke:** a commit went in while `scrub-check.sh` printed FAIL (a literal em dash in a new test file).
2. **The mechanism:** the command was `bash scripts/scrub-check.sh | tail -1 && git add ... && git commit`. A pipeline's exit status is its last command's, so `tail` succeeded and the chain continued.
3. **The fix:** the file was corrected and the unpushed commit amended, so the dash never reached history; `scrub-check.sh --history` passes.
4. **The rule:** run a gate as its own step, read its exit status on its own line, then commit as a separate step. Never pipe a gate into `head`, `tail`, or `grep` when its result decides anything.
5. **What now enforces it:** nothing automatic in this repository yet. CI runs every gate as a separate step, which catches the result after a push, not before a local commit.

## 2026-09-16 A file writer turned an escape sequence into the character it names

1. **What broke:** a test meant to hold a JavaScript escape sequence for the em dash character (backslash, the letter u, then 2014) was written with the literal character instead, which this repository forbids. Writing this lesson reproduced the same failure once more, and the scrub check caught it.
2. **The mechanism:** the escape was interpreted when the file was written, before JavaScript ever saw it.
3. **The fix:** `String.fromCharCode(0x2014)` in `scripts/evidence.test.mjs`.
4. **The rule:** build forbidden characters and secret-shaped strings at runtime (character codes, string concatenation), never as literals or escapes in source.
5. **What now enforces it:** `scripts/scrub-check.sh` (tree and `--history`), locally and in CI.

## 2026-09-16 Eval failures were grader mistakes three times out of four

1. **What broke:** the first eval runs scored the review skill as failing where its transcripts showed correct behavior.
2. **The mechanism:** a pattern searched only the line after `Next:`; a rubric treated "that pass means nothing" as a claimed pass; a pattern matched the word "pass" in a prediction; the default judge failed an explicitly allowed prediction. One real defect was found the same way: the review rule demanded NEEDS ATTENTION for a comment-only change, which a reviewer rightly calls ready.
3. **The fix:** graders rewritten to match meaning; the review verdict rule and a fixed verdict line in `packs/base/plugins/workflow/skills/review/SKILL.md`; runs kept with `--keep-temp` so transcripts can be read.
4. **The rule:** read the transcript of every failed eval check before changing a skill or a grader; a score is a hint, the transcript is the evidence.
5. **What now enforces it:** nothing automatic; `evidence/<commit>/SUMMARY.md` notes record the diagnosis of each failure.

## 2026-09-16 Agent worktrees started from the last pushed commit, not local main

1. **What broke:** parallel lanes began without files committed locally minutes earlier (the shared contract), and one lane worked from an out-of-date base.
2. **The mechanism:** the worktree for each isolated agent was created from the remote's commit, not from local `main`.
3. **The fix:** lanes fast-forwarded to local `main` before committing; one was sent the contract values directly.
4. **The rule:** push (or otherwise publish) the commit a parallel lane must build on before dispatching it, and name that commit in the brief.
5. **What now enforces it:** nothing yet; the dispatch skill's lane brief checks the branch name, not the base commit.

## 2026-09-16 "Enforced" in the harness block was only true with the plugins installed

1. **What broke:** the first harness template told the model that the handoff display and the git blocks were **enforced**, and this repository applied it before the plugins that enforce them were installed on the machine.
2. **The mechanism:** a hook enforces a behavior only while its plugin is installed and enabled; the block is written into `CLAUDE.md` independently of installation, so the label could state a guarantee that did not exist.
3. **The fix:** `templates/harness.md` now says enforced behaviors hold only while `workflow` and `guardrails` are installed and enabled, and names `skillgate doctor` as the check (commit 1bdf74e).
4. **The rule:** a claim that something is enforced names the condition it depends on, wherever the claim can outlive that condition.
5. **What now enforces it:** `node scripts/skillgate.mjs doctor` reports whether the base plugins are installed and enabled and whether the block is current; nothing checks the wording itself.

## 2026-09-16 A live probe whose success is "nothing changed" nearly passed without running

1. **What broke:** the first run of the committed `scripts/live-guardrails-probe.sh` never started a Claude Code session, and the protected branch did not move.
2. **The mechanism:** `--allowedTools` takes a list (`<tools...>`), so it consumed the prompt placed after it; the CLI exited with "Input must be provided". An unchanged remote is exactly what a successful block looks like.
3. **The fix:** the prompt goes right after `-p`, before any list-taking flag, and stdin is `/dev/null`; the probe checks the session's exit status before judging the result and ships a `--control` run that must move the branch without the plugin.
4. **The rule:** a check that passes on absence of change first proves the actor ran, and carries a control that shows the change happening without the protection.
5. **What now enforces it:** the probe itself (exit 2, NOT RUN, when the session fails); `--control` must report the branch moved.

## 2026-09-16 Another agent session was working the same repository

1. **What broke:** a pre-push secret scan over `git rev-list --all` matched strings in a file nobody in this session had written.
2. **The mechanism:** a Codex session had created worktrees (`~/Desktop/Skilliton-security-0916`, `~/Desktop/Skilliton-autopilot-0916`) and branches in this repository; `--all` includes every local branch, pushed or not.
3. **The fix:** only `main` was pushed; the other branches were left untouched and recorded as owner decision O11, with a trial merge showing no conflicts.
4. **The rule:** before pushing or scanning history, run `git worktree list` and `git for-each-ref refs/heads`, and scope pushes and scans to your own refs.
5. **What now enforces it:** nothing yet (DECISIONS.md O13: `scrub-check.sh --history` still scans every ref).
