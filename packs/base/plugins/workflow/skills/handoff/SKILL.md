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

## 2. Choose where the note goes

- **On an integration branch** (or when the repository has no task records): the shared handoff file. Follow section 3.
- **On any other branch, with a current task record** (`skilliton task show` prints its path): the `## Handoff` section of that task record. Replace that section's four bullets (**State**, **Next**, **Blocked**, **Watch out**) and leave the rest of the file alone. First record a checkpoint if progress since the last one is not written down: `skilliton checkpoint --state "..." --evidence "..." --next "..." --apply`. Then go to section 4. Never edit the shared handoff from a task branch: two people writing it at once is how one note overwrites the other.
- **On another branch with no task record:** say so, offer `skilliton task start "<title>" --apply`, and write the shared handoff only if the user agrees.

## 3. Write the shared note

Create the file (and its folder) if it does not exist. The layout is fixed, because the session-start hook reads it:

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
- **The previous note moves; it is never deleted.** It becomes the first entry under `## Earlier`, headed `### <its Written date>`. No `Written:` line: use `git log -1 --format=%cs -- <handoff file>`, or `undated` if that prints nothing.
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
