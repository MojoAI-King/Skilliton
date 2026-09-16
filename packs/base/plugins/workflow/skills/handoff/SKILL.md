---
name: handoff
description: Write a short end-of-work note to docs/HANDOFF.md (where things stand, what is next, what is blocked, what to watch out for) and commit only that file, so the next session or the next person picks up without re-explaining. Use when finishing a stretch of work, stepping away, when the conversation has grown large, or when the user says "hand off", "save where we are", "wrap up for now", or "I'm done for today".
---

# handoff: a note the next session starts from

About a minute, not a ritual. Write down where things stand so the next session, or the next person, starts from facts instead of from memory. This skill writes one file. `/workflow:maintain` is the full reconciliation of status, decisions, and lessons; suggest it only if this session decided or learned something that is not written down anywhere.

Below, `docs/HANDOFF.md` means `handoff.file` from `.skillgate/config.json` when that is set.

## 1. Collect the facts

Run these and keep the output short:

- `git rev-parse --is-inside-work-tree`. If it fails, this folder is not a git repo: skip the other git commands and say so in State.
- `git branch --show-current`
- `git status --short` (more than about 20 lines: summarize by folder)
- `git rev-parse --abbrev-ref '@{u}'`. If it prints a branch, run `git log --oneline '@{u}..'` for the commits not yet pushed (more than 10: give the count and the newest few). If it fails, the branch has no upstream, so nothing on it is pushed.
- `date "+%Y-%m-%d %H:%M %Z"`

Then this conversation: what got finished, what was checked and how, what is half done, what is waiting on someone.

**Evidence only.** Every line traces to this conversation, a git command, or a command's output. Nothing invented, nothing guessed: if you are not sure, leave it out or write "not verified". What the user told you but you did not see is marked "user-reported". **Never write a secret value** (keys, tokens, passwords, connection strings); name it and say where it lives.

## 2. Write the note

Create the file (and `docs/`) if it does not exist. The layout is fixed, because the session-start hook reads it:

    # Handoff

    Kind: Living.

    ## RESUME HERE

    Written: <date from step 1>

    - **State:** <one or two sentences>. Branch `<name>`. Uncommitted: <none, or the files>. Not pushed: <none, the commits, or "no upstream">.
    - **Next:** <next actions in priority order, each naming the file or command to start from>
    - **Blocked:** <what is waiting on whom, or "nothing">
    - **Watch out:** <what a fresh session would trip on, or "nothing known">

    ## Earlier

    ### <date of the previous note>
    <the previous RESUME HERE block, unchanged>

- **The heading is exactly `## RESUME HERE`.** At the start of every session the hook shows that section and nothing else, cut off at `handoff.maxBytes` (default 6000 bytes). Stay well under it: a line with a path beats a paragraph.
- **The previous note moves; it is never deleted.** It becomes the first entry under `## Earlier`, headed `### <its Written date>`. No `Written:` line: use `git log -1 --format=%cs -- docs/HANDOFF.md`, or `undated` if that prints nothing.
- **At most five entries under `## Earlier`, newest first.** Move older ones to the top of `docs/HANDOFF_ARCHIVE.md`, below its header. If you create it, it starts with `# Handoff archive`, then `Kind: Reference. Older handoff notes, newest first; the current note is docs/HANDOFF.md.`
- Anything else a person added to the file stays where it is.
- "Not pushed" counts commits from before this note's own commit.

## 3. Commit the note, and only the note

If this is a git repo:

1. Run `git diff --cached --name-only`. If it lists anything besides `docs/HANDOFF.md` and `docs/HANDOFF_ARCHIVE.md`, **do not commit**: the user has other work staged, and a commit now would sweep it into the note's commit. Say that in one sentence and skip to section 4.
2. `git add -- docs/HANDOFF.md`, plus `docs/HANDOFF_ARCHIVE.md` if you changed it. Explicit paths only; never `git add -A` or `git add .`.
3. Run `git diff --cached --name-only` again. It must list only those files.
4. `git commit -m "docs(handoff): <one line on where things stand>"`. If a commit hook fails, report what it said; never retry with `--no-verify`.

**Never push.** Not a git repo: the note is saved but not committed; say so.

## 4. Tell the user

Two or three plain sentences: where the note is (its path), the state in one line, and that the next session in this repo will see it automatically at the start, so nobody has to re-explain. If you did not commit, say why and what they can do about it.
