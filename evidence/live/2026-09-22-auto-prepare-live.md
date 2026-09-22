# A repository prepared by the installed hook at its first session start, measured live, 2026-09-22

Kind: Reference (evidence). Measured at 13:41 EDT on the maintainer's machine, which joined its company on 2026-09-19 (receipt under `~/.config/skilliton/joined/`, from before the `prepare` field, so it reads as `auto`). Workflow 0.18.0 installed at user and project scope minutes before, from the marketplace, after commit b25abcf was pushed.

## What ran

A fresh Git repository in a temporary folder with one commit and nothing of Skilliton's in it. In it, one headless Claude Code call, exactly:

```
claude -p "Reply with the single word ok and nothing else." --output-format text --max-turns 1
```

Exit 0; the reply was `ok`.

## What was measured

After the call, without any other command having run in that folder:

- `.skilliton/config.json` present; `CLAUDE.md` and `AGENTS.md` carrying the managed block; `DECISIONS.md`, `docs/` with the records and the entry folders, and `.gitignore`: the files `prepare --apply` writes, left uncommitted.
- The journal at `<git dir>/skilliton/journal.jsonl` holds one `session-start` and one `session-end` event from that call, so the preparation happened inside the session-start hook of the installed plugin, not from this checkout.

The same path run directly from this checkout an hour earlier (`skilliton hook session-start` with a fresh repository as `cwd`, against the same receipt): 19 files written and named in the block's first note; a second start wrote nothing; a `skilliton-off` file inside `.git` produced the "Not prepared on purpose" line and no files.

## Not measured here

Whether the assistant then tells a person what was prepared in its own words (the note is in the block it reads; the headless call asked for one word and got one). A machine that has not joined (the offer stands; fixture only). The `"prepare": "offer"` join file on a real machine (fixture only).
