# A rewrite over every file walks the worktrees nested inside the repository

Kind: Living. Lesson entry.

- **ID:** 2026-09-22-a-rewrite-over-every-file-walks-the-work-0230
- **Status:** accepted
- **Date:** 2026-09-22

## What broke

Moving three build-era documents under docs/archive/ needed every link to them rewritten. A Python script walked the checkout with `os.walk('.')`, skipping only `.git`, and reported 71 files rewritten. Fifty-four of them were under `.claude/worktrees/agent-*/`: the six lane worktrees left from the 2026-09-16 dispatch, each a full checkout of another branch. Every one of those worktrees then read ten files modified in `git status`.

## The mechanism

A linked worktree is an ordinary folder with a `.git` file (not a folder) pointing at the main repository's `.git/worktrees/<name>`. A walk that skips a folder literally named `.git` skips only the main repository's object store; the nested worktrees have no such folder, so the walk descends into them and edits files that belong to other branches. `git ls-files` in the main worktree never lists them, which is why nothing in the tree the session thought it was editing looked wrong.

The revert then hit a second mechanism: `git -C <wt> checkout -- $files` with the file names in one zsh variable passed one argument containing newlines, and git answered "pathspec did not match", because zsh does not word-split an unquoted variable the way bash does (a lesson already recorded on 2026-09-21 for sweeps). The revert had to be a Python `subprocess.run([...,*names])`.

## The fix

The links were rewritten again with `git grep -l <name>` as the file list (commit 28ad475 and d35a9a8), and each worktree was reverted file by file with a list-safe call; `git -C <wt> status --short` read clean for all six afterwards, so nothing of another branch was changed for good.

## The rule

A rewrite over "every file in the repository" iterates the tracked files of this worktree (`git ls-files -z`, `git grep -l`), never a directory walk. If a walk must be used, it skips any folder that contains its own `.git` entry, file or folder, because that is what a nested worktree looks like. After any tree-wide rewrite, `git worktree list` and a `status` of each listed worktree are part of the check.

## What now enforces it

Nothing yet. The candidate is a line in scripts/lint.test.mjs or scripts/docs.test.mjs that fails when a file under `.claude/worktrees/` is newer than the main worktree's HEAD commit, which would catch a stray edit there before a commit; it is not written because the worktrees in question are removable and the rule is a habit for scripts a session writes, not for shipped code. The rule is stated here and in the owner's cross-project lessons file.
