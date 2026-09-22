# A project's own numbered entries are a note said once, never a problem per file and never an attention exit

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-project-s-own-numbered-entries-are-a-n-ab8c
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The owner ran `skilliton task start ... --apply && skilliton checkpoint ... --apply` on `main` in one of their own repositories, one that had kept numbered decision entries (`NNN-slug.md`, well over two hundred of them) since long before this runtime. The task record was written, the checkpoint was written, the indexes were written, and then the index step printed one "was not indexed: its name is not an entry ID" line per numbered file and the checkpoint exited 1, so the chained command reported failure. Read from the terminal: a wall of problems and a red exit for a write that had succeeded.

## The mechanism

`readEntries` in `runtime/lib/records.mjs` treated every `.md` file under an entries folder whose name is not an entry ID as a problem. That is right for a stray `notes.md`; it is wrong for a project's own earlier numbering, which `prepare` adopts on purpose and which the project's record lists its own way. Problems set the attention exit (1) in both `index` and `checkpoint`, so a condition that will hold for the life of that repository turned every checkpoint there into an attention exit, and the message was repeated once per file because nothing counted them.

## The fix

A name of the shape `<digits>-<slug>.md` is counted as a numbered entry from before this runtime and reported once, as a note naming the folder, the count and the first three names, saying they stay listed the project's own way. Notes are printed by `index` ("Note:") and by `checkpoint` ("indexes: note:") and never set the exit. Any other non-ID name is still a problem. Workflow plugin 0.15.6.

## The rule

A condition that will be true for the life of a repository is said once and is not an attention exit; an attention exit is for something a person can and should change. A message that would repeat per file is counted and summarised, with the first few names. And a write command's exit code is about the write: what it wrote, it says it wrote, and anything else it noticed is a note beside that.

## What now enforces it

`scripts/records.test.mjs`: "numbered entries from before this runtime are one note, not a problem per file, and do not set the exit", which plants four numbered files and asserts exit 0, one note, no per-file problem, and that a stray non-ID file still raises a problem with exit 1.
