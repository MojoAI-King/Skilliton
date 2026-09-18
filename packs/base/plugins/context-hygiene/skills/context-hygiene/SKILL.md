---
name: context-hygiene
description: Use when working in any coding session where context size, cache cost, or session length could grow. Applies rules for reading large files, ending sessions, batching shell commands, running checks through a gate, and using subagents so that context stays small and cache writes stay rare.
---

# Context hygiene

These are the rules that survived a measured, corrected investigation into where an AI coding budget actually went. Each one targets a measured cause, not a hunch. The measurement lives in the company skills repository (`scripts/token-cost.mjs`, with a fixture test and a reference check); no number in this skill is a promise about your project.

## Large results are the main cache-write cost

- **Enforced on Claude Code (this plugin's read guard):** a whole-file read of a non-image file over 50KB is refused, with the reason. Read it by range (`offset` and `limit`), search it (`grep -n`, `rg`), or summarize it with a script that prints a bounded result, and keep the full content on disk. Images and PDFs are never refused: an image is priced by its pixels, not its bytes, and a PDF is read by page.
- Never `cat` a large scratchpad or log into the conversation. Write it to a file and read back a bounded slice.
- Before a broad `grep -r`, `rg`, or `find`, narrow the path or count first (`grep -c`, `rg --count`). A count is cheap; a firehose is not.

## Idle gaps are the other main cache-write cost

- Returning to a large context after a long idle gap rebuilds the cache at full price. End finished work deliberately: write a short handoff (what was done, what is next, which files) and start fresh later.
- Do not clear mid-task to save tokens. Clearing costs a rewrite and risks losing the thread, which costs more than it saves.
- Pick the model at the start of a session; switching mid-session discards the cache.
- Where the team settings set an automatic compaction window (`autoCompactWindow` in `.claude/settings.json`), the client compacts at that size. Do not wait for it: a handoff before the window is a smaller, better summary than a compaction at it.

## Shell discipline

- Batch independent checks into one command where the results are needed together. Do not poll.
- Preserve exit status. Never pipe a test or build through `head` or `tail`. Run the project's checks through `skilliton gate`: it runs the verify command or the delivery policy's checks, keeps the full output in a log under the repository's `.git/skilliton/gate/`, and prints a verdict from the bare exit status with a bounded tail on failure.

## Subagents are real cost, not free workers

- A subagent is a session of its own, with its own context. Use one for bounded, independent fan-out work where only a conclusion needs to return, and give it the bound in its brief.
- Do not spawn one where a direct lookup would do.

## What this skill does not do

It does not change the model's maximum context window, and it does not guarantee a saving. Whether it saved anything is checked against real quota (the client's usage screen, and the pack's status line log where it is set up), never assumed. The read guard sees the Read tool only: a shell command that prints a whole file is covered by the guardrails plugin's rules for commands, not by this one.
