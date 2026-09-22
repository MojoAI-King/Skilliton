# The session-start hook in a repository that was never prepared, measured live, 2026-09-22

Kind: Reference (evidence). Measured at 12:20 EDT on the maintainer's machine, where the plugins are enabled at user scope (workflow 0.17.0 installed at the time).

## What ran

A fresh Git repository in a temporary folder with one commit and no Skilliton files at all (no `.skilliton/`, no records, no managed block). In it, one headless Claude Code call, exactly:

```
claude -p "Reply with the single word ok and nothing else." --output-format text --max-turns 1
```

Exit 0; the reply was `ok`.

## What was measured

- The workflow plugin's hooks ran in that repository without any preparation: its journal at `<git dir>/skilliton/journal.jsonl` holds one `session-start` and one `session-end` event written by that call. A plugin enabled at user scope runs in any folder (the same fact as evidence/live/2026-09-21-owner-machine-session.md), and this is that fact in a repository with nothing of Skilliton's in it.
- The text the hook puts into the session's context in that repository, from `skilliton hook session-start` with the same folder as `cwd`: the Layout line says the project is not prepared and names `skilliton prepare`; the next line is the offer to prepare, in plain words, with the commands a yes runs in order; the Records line says 9 of 9 missing and, since workflow 0.17.1, that none of them is in Git and `prepare --apply` creates them, instead of listing the nine files a second time.

## Not measured here

Whether the assistant then makes the offer in its own words to a person (the block is an instruction to it; the headless call above asked for one word and got one). That is step 6 of docs/OWNER_WALKTHROUGH.md (one unprepared repository, harnessed live), which needs a person at the keyboard.
