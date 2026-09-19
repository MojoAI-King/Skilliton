---
name: task
description: Turn a plain-language request into a tracked piece of work, then keep it moving and recoverable - a task record with acceptance criteria, the right branch, checkpoints as things are decided or verified, and an honest final state. Use when the user describes something to build, fix or change ("can you make...", "add...", "the page is broken..."), when resuming work after a break or a new session, or when asked "where are we on this".
---

# task: from a request to finished, recoverable work

The person asking may not be a developer. They describe an outcome; this skill makes sure it is written down clearly enough that any session, or any teammate, can pick it up, and that "done" means something checkable.

## 1. Find out whether this is new work or a continuation

- Run `skilliton status`. It shows the current task for this branch, open tasks, and whether the last session ended without a handoff. If `skilliton` is not found on the shell path, say so and run the plugin's own copy by its path: `bin/skilliton` in the workflow plugin folder, two folders above this skill's base directory. Only if that is missing too, continue with the same steps by hand and say the records were written by hand.
- If a current task matches the request, read it (`skilliton task show`): its acceptance criteria, its last checkpoint, and its handoff. Tell the user in two sentences where it stands, then continue from its "Next".
- If the last session was interrupted, say so, and compare the task record with `git status` and `git log` before trusting either.

## 2. Pin down the outcome

- Restate the request as an outcome in plain words ("people can reset their password from the sign-in page").
- Write two to six **acceptance criteria**: things someone could check without reading the code ("a reset email arrives within a minute", "an expired link shows a clear message"). Include what must keep working.
- Ask at most two questions, only where a wrong guess would waste the work. Otherwise state your assumption in the task record.

## 3. Create the task record and pick the branch

- On an integration branch (`main` by default) and the work is more than a small fix: tell the user you will work on a separate branch so the shared branch stays safe, then `git switch -c task/<short-name>`.
- Create the record: `skilliton task start "<title>" --request "<the user's words>" --criteria "<criterion>" --criteria "<criterion>" --apply`. The request is what the user asked for, in their words; the criteria are yours. It lands in the project's task folder with a collision-free id, so two people starting tasks at once never overwrite each other.
- Six or more separate requests at once are a batch: use `/workflow:dispatch` instead.
- If the person asked only to set the work up, not to build it yet, stop once the record exists: tell them in plain words where it is, what its criteria say and what you assumed. Leave commits, reviews and other shared records for when the work starts.

## 4. Work in small, checkable steps

- Before each change, say in one plain sentence what you are about to change and why.
- After each step that decided, verified or blocked something, record a checkpoint: `skilliton checkpoint --state "<what is true now>" --evidence "<what ran and what it showed>" --next "<the next step>" --apply`. The stop hook reminds you when there are changes and no recent checkpoint; do not wait for it.
- A choice someone might later question (a library, a data shape, a trade-off) gets its own entry: `skilliton record decision "<title>" --apply`, then fill in why and what else was considered.
- Evidence is only what actually ran in this session. "Should work" is not evidence.
- Never edit a list between `skilliton:index` markers by hand. If `skilliton index` cannot run, say why and leave the list for the next run.

## 5. Finish honestly

- Run the project's tests and read the result. Go through the acceptance criteria one by one and say which are met, with the evidence, and which are not.
- Run `/workflow:review` before committing.
- Set the real state: `skilliton task close <id> --state done-local --apply` when it is finished on this branch. `merged`, `released` and `verified` are later states that need their own evidence; never skip ahead.
- Run `/workflow:handoff` if anyone else, or a later session, will continue.
