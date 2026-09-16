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
