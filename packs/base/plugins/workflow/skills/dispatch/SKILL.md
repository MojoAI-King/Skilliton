---
name: dispatch
description: Turn a pile of raw notes (bugs, UI nits, feature ideas, a walkthrough dump) into verified, scoped task briefs, partitioned by the files each task writes into as many parallel git worktree lanes as the work needs, with setup commands, a coverage ledger that proves nothing was dropped, and a serial merge order. Use when someone pastes a list of six or more work items, a bug list, or asks to split work across sessions, windows, or lanes.
---

# dispatch: notes to parallel lanes

Input: raw notes, pasted or in a file the user names.
Output: `LANES.md` at the repo root (gitignored; add the entry to `.gitignore` on first run if missing), holding a coverage ledger, one brief per lane, setup commands, and the merge order. The human-facing guide is `PLAYBOOK.md` beside this file; keep the two consistent.

**When not to dispatch.** Fewer than six items, or items that all touch the same area: fix them in the current window and say so. A false parallel split costs more than a queue.

## Project config

Read the `dispatch` section of `.skilliton/config.json` at the repo root. If the file or the section is missing, propose one built from what the repo shows (its test script, its docs folder) and write it only after the user agrees. Every field is optional; the defaults are shown.

```json
{ "dispatch": {
  "laneRoot": "../<repo-name>-lanes",
  "hotspots": [],
  "mainOnlyPaths": ["docs/", "DECISIONS.md"],
  "laneSetup": [],
  "laneTestCommand": null,
  "mainOnlyChecks": [],
  "maxItemsPerLane": 8,
  "minItemsForLanes": 6
} }
```

- `hotspots`: files or folders that have caused merge pain. Any two items that touch one share a lane.
- `mainOnlyPaths`: written by the main window only, never by a lane, with one exception: a lane creates its own task record and proposed decision and lesson entries as new files in the folders named by `prepare.directories` (defaults `docs/tasks`, `docs/decisions`, `docs/lessons`). Those are new files only one lane writes, so they never conflict; the shared records and indexes stay main-only.
- `laneSetup`: commands run once per lane after the worktree exists, with `{lane}` substituted (for example a per-lane test database, so two lanes' tests never share state).
- `laneTestCommand`: the exact test command a lane runs, with `{lane}` substituted. If null, lanes run the repo's normal test command and the brief says that lanes may interfere with each other.
- `mainOnlyChecks`: checks that cannot run in parallel (a fixed port, a shared device). Lanes never run them; main runs them at merge.

## Step 1: parse into atomic items

Split the notes into single-outcome items. One symptom is one item, even when three share a sentence. Keep the author's wording as the title so they recognize it.

**Number them N1, N2, N3 as you split, and never renumber.** The number is how an item is traced from the notes to a lane to a commit, and it is what makes Step 5's ledger checkable. When unsure whether a sentence is one complaint or two, split it and say so on both: a duplicate costs one wasted check, a merge costs a lost bug.

## Step 2: verify every item against the code before scoping it

Filed issues are often already fixed. For each item, check the code first:

- Already fixed or built: mark SHIPPED with the file and line. Do not lane it.
- Conflicts with a recorded decision (`DECISIONS.md` or the repo's equivalent): mark DECISION, cite it, and route it to the owner.
- Real and buildable: attach the file pointers now. Use subagents to locate code so the main session stays small: the workflow plugin ships `workflow:locate` (read-only, a turn limit, returns file and line pointers and nothing else) and `workflow:verify-item` (one item, one verdict, with the write set a lane needs). The brief must name the files so the lane does not search again.

## Step 3: size each item

TOUCH (a fix or copy change in known files), FEATURE (a new capability or a schema change), or PROJECT (a new system or integration). State the tier on each item. A PROJECT item never goes in a lane; it gets its own plan and session, flagged at the top of `LANES.md`.

## Step 4: partition into lanes by write set

**There is no lane cap and no target count.** The number of lanes is a fact about the work.

1. Give every item its **write set**: the files it will modify (not the files it reads), from Step 2. An item with no write set was not verified; send it back to Step 2.
2. **Union any two items whose write sets intersect.** Repeat until nothing merges. No two resulting groups write the same file.
3. **Force-union across `hotspots`**, even when the write sets do not otherwise touch.
4. **Items that write only `mainOnlyPaths`** (docs, decisions, skills, playbooks) go in the **Main window** section, not a lane.
5. **Name each lane for what it writes** (`checkout`, `auth`, `settings-page`). Two lanes that would share a name get a suffix for their distinct area. The name is how a person matches a window to a brief, so it must be unambiguous at a glance.
6. **Split a lane past `maxItemsPerLane`** along its own write sets, only if step 2 allows it. A lane that cannot split stays whole and says why.

Say these outcomes out loud rather than engineering around them: everything collapsed into one lane (hand back one lane); one lane holds most items and the rest hold one each (really one lane plus errands for the main window).

**Merging is serial no matter how many lanes run.** Each lane rebases on the main the previous merge produced and passes the full gate again. Parallel lanes buy build time, not merge time. State the merge cost at the top of `LANES.md`.

**Shared seams.** When two lanes meet at one seam (a route and its caller, a type both read, a component one moves and another imports), the brief names the seam's exact signature and which lane commits it first; the other imports it by name. Budget one fix round per lane at merge.

## Step 5: write LANES.md

**Name the base commit.** Put it on its own line near the top, in this exact form, so that `skilliton dispatch` reads the same commit a person does:

    Base commit: <the full sha from `git rev-parse main`>

A lane created from anything older (an agent worktree made from the last pushed commit is the usual cause) silently misses work, so every brief checks it. The line applies to every lane below it, and a second one before a later batch changes the base from there down. With no such line, `skilliton dispatch` uses HEAD and says in its plan that it did.

`skilliton dispatch` creates the worktrees from this file, so `LANES.md` no longer carries the `git worktree add` lines. It checks every lane before it writes anything and refuses the whole run if one is taken, because half a batch is worse than none:

- Folder already there, or a folder Git still has registered as a worktree: refused. Use a new folder (`<name>2`) or queue the items under "Queued for the next batch". Say which.
- Branch already there: refused. A lane never reuses a branch; the branch is what proves which commits are the lane's own.
- A `lane/*` branch with no worktree is a leftover to mention, not reuse.

If `LANES.md` exists and any of its lane branches still exist, append a dated section `# Batch: <date>`; never overwrite an active batch.

**At the very top, the lane sentence**, identical for every lane and every batch:

    Read LANE_BRIEF.md at the root of this worktree and follow it exactly.

`skilliton dispatch --apply` writes that brief into each worktree from this file. When the lanes were made by hand instead, the sentence names the absolute path of this `LANES.md` and tells the lane to find the heading whose folder matches its own.

**Then the coverage ledger.** This makes "nothing slipped through" checkable instead of asserted:

```
Items parsed: <N>
  In lanes:         <n>  (N3, N7, ...)
  Shipped already:  <n>  (N1, ...)
  Owner decisions:  <n>  (N4, ...)
  Main window:      <n>  (N9, ...)
  Deferred:         <n>  (N12, ... each with its reason)
Lanes: <n>.  Merge cost: <n> sequential gate runs.
```

Every N number appears in exactly one bucket. **Sum the buckets and check the total equals the parsed count.** If it does not, say so at the top instead of emitting lanes. Nothing is dropped for being small, vague, or awkward: an item you cannot place goes in Deferred with its reason, which the owner can overrule, where a missing line is one they cannot see.

**For each lane:**

````
## Lane: <name>   branch: lane/<name>-<mmdd>   model: <suggested>   context ceiling: <tokens>

Setup: `skilliton dispatch --apply` creates <laneRoot>/<name> on this branch and writes its brief. The `laneSetup` commands are printed and written into the brief; dispatch never runs them.

Then open <laneRoot>/<name> in a new window, start a fresh session, and paste the lane sentence from the top of this file.

### Brief
Run `git branch --show-current`. It must print lane/<name>-<mmdd>; otherwise stop and say so.
Run `git merge-base --is-ancestor <base commit> HEAD`. It must exit 0; otherwise stop and say the lane is missing the base commit.
You are in an isolated worktree. Do not edit anything under: <mainOnlyPaths>, except these new files: your task record (`skilliton task start "<lane name>" --branch lane/<name>-<mmdd> --apply`, then `skilliton checkpoint ... --apply` as items finish) and proposed decision or lesson entries (`skilliton record decision "<title>" --apply`). Never edit the shared handoff, status, backlog or indexes.
Do not touch files outside this lane's list without flagging it in the commit message.
Test command, exactly: <laneTestCommand or the repo default, with the interference warning>.
Never run: <mainOnlyChecks>. Main runs them at merge.
Commit once per item, with the N number in the subject. Do not push.
When every item is done, write LANE_REPORT.md at the worktree root (never commit it) with these headings, each present even when empty:
  Commits by item (hash, N number)
  Skipped (item, why)
  Merge-time expectations (conflicts you expect and how to resolve them; seams you touched; files outside your list)
  Run-time behavior (anything the first run after release does once: migrations, backfills, a screen that reads oddly for a while)
  Leftovers for other lanes (name the lane that owns the file)
Then say "LANE DONE" and list the commits, each with its N number.

Items:
N<k>. [tier] <title>: <files>: <what done looks like, one line>
````

A lane that needs more than about 200K tokens of context was scoped too wide; fix the partition here instead of absorbing it later. Mechanical lanes with a written spec and a gate behind them do not need the most capable model.

**At the bottom:** Shipped already (with evidence, so the author can cross them off), Owner decisions (with the conflicting decision), Main window items (with files), and the Merge order with the playbook's merge sentence verbatim.

## Step 6: create the lanes

`skilliton dispatch` with no flags prints the plan and writes nothing: the lane root, the base commit and where it came from, and for each lane its folder, branch, model, context ceiling, item count and the `git worktree add` line it would run. `--apply` prints that same plan and then creates each worktree and writes `LANE_BRIEF.md` at its root. `--file <path>` reads a plan that is not `LANES.md`. It reads at most the first 200KB of the plan, which is a page per lane and then some.

What it writes: one worktree per lane, one brief per lane, and `LANE_BRIEF.md` plus `LANE_REPORT.md` added to this repository's `.git/info/exclude`, so neither is ever committed. What it never does: run a command from `dispatch.laneSetup`, touch the integration branch, or push.

The brief is the bound. It carries the lane's items and nothing else as its scope, what to read (this brief, the files the items name, and what those lead to), what to return (`LANE_REPORT.md` with its five headings), the model and the context ceiling the heading named, the main-only paths, the check to run, and the setup dispatch did not run. A lane that needs more than its ceiling was scoped too wide: it stops and says so rather than compacting through it.

**Running a lane as an agent.** The workflow plugin ships `workflow:lane`: sonnet at high effort, no turn limit, briefed with the lane folder and nothing else. It reads `LANE_BRIEF.md`, runs the branch and base checks first, and returns `LANE_REPORT.md`. When a heading names a different model, pass it as the agent's model override; the brief records which model the plan named. Whether a lane agent's peak context stays under the window on real work is measured per dispatch, not assumed.

## Merge protocol (main window, one lane at a time)

When the user says a lane is done:

0. Read `<laneRoot>/<name>/LANE_REPORT.md` first; a lane with no report is asked for one. Run `git diff --name-only main...lane/<name>-<mmdd>` and stop if it touches `mainOnlyPaths`. Compare `git log --oneline main..lane/<name>-<mmdd>` against the brief's N numbers and name any item with no commit.
1. In the lane worktree: `git rebase main`.
2. Run the full gate on the rebased lane tree. Read the exit status on its own line; never judge a gate through a pipe into `tail` or `grep`, and in zsh do not rely on `PIPESTATUS`. Only when it is green: in main, `git merge --ff-only lane/<name>-<mmdd>` (fall back to a plain merge and say so).
3. Run `mainOnlyChecks` in main. A red that appears only here is undone with `git reset --keep <main-before-merge>` before reporting, since nothing was pushed.
4. The next lane rebases on the new main. Repeat.
5. After the last lane: confirm every lane branch is contained in main and no lane folder holds uncommitted work, then run `skilliton index --apply` (the decision, lesson and task indexes regenerate from the entry files the lanes added) and `maintain` once to write the decisions and status from the task records and commit messages.
6. Close the batch: detach each lane folder to main (`git -C <folder> checkout --detach main`), delete the lane branches, keep the folders.

A lane's green is not the merge's green: the lane proves it is internally sound, not that it is sound on top of the other lanes.
