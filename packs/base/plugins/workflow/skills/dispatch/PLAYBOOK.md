# Lanes: the short version

Kind: Living. The person-facing guide to the `dispatch` skill. When `SKILL.md` changes, this file changes in the same commit.

**Main** is your normal project folder on the `main` branch. It is always the truth.
**Lanes** are extra copies of the project (git worktrees) in one folder beside it, one per area of work. Each batch, a lane gets a fresh branch off main, does its work, and merges back.

**There is no lane limit.** `dispatch` sorts your items by which files they change, and the number of lanes falls out of that: three, seven, twelve. Two items that change the same file always share a lane.

**Only worth it for six or more items across two or more areas.** Fewer than that, just fix them in the main window.

**What lanes buy, and what they do not.** Lanes build at the same time. Merging does not: each lane merges on top of the one before it and runs the full checks again. Twelve lanes means twelve check runs back to back, and `LANES.md` says that cost at the top so it is never a surprise.

## The cycle

**1. Take notes.** Use the app, write down everything that is wrong or missing, any order, any wording.

**2. Main window:**

    /workflow:dispatch
    <paste your notes>

Open `LANES.md`. The **coverage ledger** at the top accounts for every item you wrote: in a lane, already shipped, needs your decision, main window, or deferred with a reason. The buckets add up to the number of items; if they do not, the file says so instead of showing lanes. Cross off "Shipped already". Decide the "Owner decisions".

**3. Main window:** say "set up the lanes", or run it yourself: `skilliton dispatch` prints exactly what it would create, and `skilliton dispatch --apply` creates it. It only makes branches and folders and writes one brief in each; it deletes nothing, runs none of your setup commands, and refuses the whole batch if any folder or branch is already taken.

**4. Each lane:** open the lane's folder in a new window, start a **fresh** conversation, and paste the first sentence printed in `LANES.md`. It is the same sentence for every lane and every batch: it tells the session to read `LANE_BRIEF.md` in that folder and follow it. The brief is that lane's whole instruction, including what it is allowed to read and what it must hand back. Leave it alone until it says **LANE DONE**.

**5. Main window, when a lane says LANE DONE:**

    Lane <name> is done.

Main reads that lane's report, rebases it, runs the checks, and merges only if they pass. It stops and names the problem if anything is red. One lane at a time; expect about one fix round per lane.

**6. Main window, after the last lane:**

    All lanes are merged. Confirm every lane branch is in main, no lane folder has uncommitted work, and the full checks pass. List what each lane added. If anything is missing or red, name the lane and stop.

**7. Main window, only if that check passed:**

    /workflow:maintain

**8. Close the batch:**

    Close the lanes: detach each lane folder back to main and delete the lane branches. Keep the folders.

## If something goes wrong

- **A lane asks to edit a doc or a file outside its list:** "Note it in the commit message and keep going." A lane may always create its own task record and new decision or lesson entry files; it never edits the shared handoff, status, backlog or indexes.
- **A lane says it is missing the base commit:** its folder was made from an older commit. Recreate the lane from the base named at the top of `LANES.md`.
- **Setting up the lanes refuses:** a folder or a branch from a previous batch is still there. Nothing was created. Either finish or close that batch, or give the new lane a different name.
- **A lane's tests fail on things it did not touch:** check that it used the exact test command from its brief. Lanes that share a test database or a port can break each other, and a red caused by another lane means nothing.
- **A merge goes red:** main tells you which lane broke what. Paste that into the lane: "Main's checks fail after your changes: <paste>. Fix on your branch and say LANE DONE again."
- **A lane wants to run a check listed as main-only:** "No, main runs that at merge."
- **The main window while lanes run:** docs, planning, and the "Main window" items from `LANES.md`. No code edits in main while lanes are open.
