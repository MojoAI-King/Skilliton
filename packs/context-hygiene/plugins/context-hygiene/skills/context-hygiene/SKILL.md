---
name: context-hygiene
description: Use when working in any coding session where context size, cache cost, or session length could grow. Applies rules for reading large files, ending sessions, batching shell commands, and using subagents so that context stays small and cache writes stay rare.
---

# Context hygiene

These are the rules that survived a measured, corrected investigation into where an AI coding budget actually went. Each one targets a measured cause, not a hunch.

## Large results are the main cache-write cost

- Never load a file over about 50KB into context raw. Summarize it with a script, or read it by line range with `sed -n` or `head`/`tail`, and keep the full content on disk.
- Never `cat` a large scratchpad or log into the conversation. Write it to a file and read back a bounded slice.
- Before a broad `grep -r`, `rg`, or `find`, narrow the path or count first (`grep -c`, `rg --count`). A count is cheap; a firehose is not.

## Idle gaps are the other main cache-write cost

- Returning to a large context after a long idle gap rebuilds the cache at full price. End finished work deliberately: write a short handoff (what was done, what is next, which files) and start fresh later.
- Do not clear mid-task to save tokens. Clearing costs a rewrite and risks losing the thread, which costs more than it saves.

## Shell discipline

- Batch independent checks into one command where the results are needed together.
- Preserve exit status. Never pipe a test or build through `head` or `tail`; use the gate wrapper (`scripts/gate.mjs`) which logs full output and prints a bounded summary.

## Subagents are real cost, not free workers

- Use a subagent for bounded, independent fan-out work where only a conclusion needs to return.
- Do not spawn one where a direct lookup would do.

## What this skill does not do

It does not change the model's maximum context window, and it does not guarantee a saving. Whether it saved anything is checked against real quota (see the pack's status line log), never assumed.
