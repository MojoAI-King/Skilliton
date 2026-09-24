# A count of permission prompts that skips the background agents' transcripts blames the wrong thing

Kind: Living. Lesson entry.

- **ID:** 2026-09-24-a-count-of-permission-prompts-that-skips-a3a6
- **Status:** proposed
- **Date:** 2026-09-24

## What broke

Asked why he was approving so many Bash commands, the session counted guardrails asks over a week of transcripts and reported 46, then told the owner the prompts came from Claude Code's auto-mode classifier, not from Skilliton. The owner said the number could not be right. It was not: the true count was 171 in the last 24 hours alone, 168 of them approved, nearly all of them Skilliton's guardrails saying "cannot see, so ask".

## The mechanism

Two mistakes in the first count. It matched one wording of the question ("Check first: guardrails could not") and missed every other reason text. And it read only the session files at the top of the project folder; each session's background agents write their own transcripts under `<session>/subagents/`, and those held 130 of the 171. The classifier's denials, which the first count did find, are not dialogs at all: they refuse the assistant without asking the person.

## The fix

A counter that walks every `.jsonl` under the project folder, including subfolders, and recognizes an ask by the hook's own output (`permissionDecision":"ask"` in a PreToolUse `hook_success` attachment), then groups by the reason's first words. Rerun over 24 hours it gave the 171, and a replay of every reason through the new guard's classes gave the numbers the decision rests on.

## The rule

Before naming what causes an interruption, count it by the field the client writes, over every transcript file the session folder holds, and read the reasons; a number the owner disputes is re-measured, not defended.

## What now enforces it

Nothing yet. The counter is a scratchpad script; the plan document lists a `skilliton` command for the prompt count as a leftover, and until it exists this rule is instructed only.
