---
name: handoff
description: Write a short end-of-work note (where things stand, what is next, what is blocked, what to watch out for) and commit only that note, so the next session or the next person picks up without re-explaining. On an integration branch it updates the shared handoff (docs/HANDOFF.md by default); on any other branch it updates that branch's task record. Use when finishing a stretch of work, stepping away, when the conversation has grown large, or when the user says "hand off", "save where we are", "wrap up for now", or "I'm done for today".
---

# handoff: a note the next session starts from

About a minute, not a ritual. Write down where things stand so the next session, or the next person, starts from facts instead of from memory. This skill writes one note. `/workflow:maintain` is the full reconciliation of status, decisions, and lessons; suggest it only if this session decided or learned something that is not written down anywhere.

## 1. Collect the facts

Run these and keep the output short:

- `git rev-parse --is-inside-work-tree`. If it fails, this folder is not a git repo: skip the other git commands and say so in State.
- `git branch --show-current`
- `git status --short` (more than about 20 lines: summarize by folder)
- `git rev-parse --abbrev-ref '@{u}'`. If it prints a branch, run `git log --oneline '@{u}..'` for the commits not yet pushed (more than 10: give the count and the newest few). If it fails, the branch has no upstream, so nothing on it is pushed.
- `date "+%Y-%m-%d %H:%M %Z"`
- `skilliton status` if it is available. It names the handoff file, the integration branches, and the current task. If `skilliton` is not found, the handoff file is `handoff.file` from `.skilliton/config.json`, else `docs/HANDOFF.md`, and the integration branches are `main` and `master`.

Then this conversation: what got finished, what was checked and how, what is half done, what is waiting on someone.

**Evidence only.** Every line traces to this conversation, a git command, or a command's output. Nothing invented, nothing guessed: if you are not sure, leave it out or write "not verified". What the user told you but you did not see is marked "user-reported". **Never write a secret value** (keys, tokens, passwords, connection strings); name it and say where it lives. Keep "done locally", "merged", "released", "installed" and "verified" separate.

## 2. Write the note with the command

When `skilliton` is available and there is a current task record (`skilliton task show` prints its path), one command writes the note in the right place and rotates the older ones:

    skilliton checkpoint --handoff --state "<one or two sentences>" --evidence "<what ran and its result>" --next "<next actions, each naming the file or command>" --blocked "<what waits on whom>" --watch-out "<what a fresh session would trip on>"

Run it once without `--apply` and read the diffs, then again with `--apply`. It chooses the place from the branch: on an integration branch it rewrites `## RESUME HERE` in the shared handoff file (the layout in section 3, with `Written:` read from the clock and a **Git** line for the branch, head and uncommitted count), moves the previous note to the top of `## Earlier`, keeps five there and moves the rest to the archive; on any other branch it writes the task record's `## Handoff` section only and prints why. `--blocked` and `--watch-out` left out carry over from the previous note, and the command prints each carry-over; check that the carried text is still true. It refuses, writing nothing, when the file's Written time is ahead of the clock or the file has no `## RESUME HERE` or `Written:` line; fix the file by hand, then run it again. The command does not know what is pushed: add the "Not pushed" facts from step 1 to the State text yourself.

- **On any other branch with no task record:** say so, offer `skilliton task start "<title>" --apply`, and write the shared handoff by hand (section 3) only if the user agrees. Never edit the shared handoff from a task branch: two people writing it at once is how one note overwrites the other.
- **Without `skilliton`** (the command is not found, or the repository is not prepared): write the shared note by hand as section 3 describes.

## 3. The shared note's layout

This is what the command writes, and what you write by hand when it is not available. Create the file (and its folder) if it does not exist. The layout is fixed, because the session-start hook reads it:

    # Handoff

    Kind: Living.

    ## RESUME HERE

    Written: <date from step 1>

    - **State:** <one or two sentences>. Branch `<name>`. Uncommitted: <none, or the files>. Not pushed: <none, the commits, or "no upstream">.
    - **Next:** <next actions in priority order, each naming the file or command to start from>
    - **Blocked:** <what is waiting on whom, or "nothing">
    - **Watch out:** <what a fresh session would trip on, or "nothing known">
    - **Git:** <branch> @ <short head>, <n> uncommitted

    ## Earlier

    ### <date of the previous note>
    <the previous RESUME HERE block, unchanged>

- **The heading is exactly `## RESUME HERE`.** At the start of every session the hook shows that section and nothing else, cut off at `handoff.maxBytes` (default 6000 bytes). Stay well under it: a line with a path beats a paragraph.
- **The previous note moves; it is never deleted.** It becomes the first entry under `## Earlier`, headed `### <its Written date>`. No `Written:` line (by hand only; the command refuses instead): use `git log -1 --format=%cs -- <handoff file>`, or `undated` if that prints nothing.
- **At most five entries under `## Earlier`, newest first.** Move older ones to the top of the handoff archive (`docs/HANDOFF_ARCHIVE.md` by default), below its header. If you create it, it starts with `# Handoff archive`, then `Kind: Reference. Older handoff notes, newest first; the current note is <handoff file>.`
- Anything else a person added to the file stays where it is.
- "Not pushed" counts commits from before this note's own commit.

## 4. Commit the note, and only the note

If this is a git repo:

1. Run `git diff --cached --name-only`. If it lists anything besides the note's file (and the handoff archive), **do not commit**: the user has other work staged, and a commit now would sweep it into the note's commit. Say that in one sentence and skip to section 5.
2. `git add -- <the note's file>`, plus the archive if you changed it. Explicit paths only; never `git add -A` or `git add .`.
3. Run `git diff --cached --name-only` again. It must list only those files.
4. `git commit -m "docs(handoff): <one line on where things stand>"`. If a commit hook fails, report what it said; never retry with `--no-verify`.

**Never push.** Not a git repo: the note is saved but not committed; say so.

## 5. Tell the user

Two or three plain sentences: where the note is (its path), the state in one line, and that the next session in this repo will see it automatically at the start, so nobody has to re-explain. If you did not commit, say why and what they can do about it.
