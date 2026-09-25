# A history rewrite gives every rewritten commit a new sha, and every record that cites one

Kind: Living. Lesson entry.

- **ID:** 2026-09-25-a-history-rewrite-gives-every-rewritten-71cd
- **Status:** accepted
- **Date:** 2026-09-25

## What broke

Main's history was rewritten on 2026-09-25 to take two home-folder paths out of two lane task records (backlog B97; CI's `scrub-check.sh --history-all` had been red on every push since). The rewrite was planned and checked for what it had to keep (no tag moves, the newest tree unchanged, every commit signed) and not for what it would break: 25 commits got new shas, and eight records cited 15 of the old ones, 77 times in all, including the two eval evidence folders named by the commit they ran on. The gap was found after the force-push, while building the 1.5.0 manifest, not before it.

## The mechanism

A commit's sha is a hash of its tree, its parents, its author and committer lines, its message and its signature. Re-creating a commit to change one file changes its sha, and because each later commit names its parent's sha, every descendant changes too, even when its own files are byte for byte the same. A record that cites a commit by sha keeps the old string, which after the force-push names a commit no branch reaches. GitHub still shows such a commit by its sha until GitHub Support collects it (GitHub's own guidance: after a rewrite, old commits stay reachable "directly via their SHA-1 hashes in cached views"), so an old sha in a record can also lead straight back to what the rewrite removed.

A second trap, caught before the rewrite: every one of the 566 commits on main is signed. A whole-history tool that re-exports every commit can drop signatures and so re-hash commits whose files it never touched, moving the released commits off main. The rewrite used `git filter-branch` over `d9cad87..main` only (d9cad87 is the parent of the first commit that held a path), with a tree filter replacing the two paths under `docs/tasks` and `git commit-tree -S` as the commit filter, so d9cad87 and every commit before it kept its sha and signature and all nine release tags stayed on main.

## The fix

- The rewrite itself, owner-run (the auto-mode classifier refused it even on a scratchpad clone): checked before the push for no home path in main's history, the newest tree identical to the old main, d9cad87 unchanged, the same author, committer, dates and message on all 25, a good signature on all 25, only the two task records changed, all nine tags on the new main, and `scrub-check.sh --history` exit 0. Pushed with a lease on the old main, ruleset 23792740 off for the push and back on (deletion, non_fast_forward, required_signatures). CI on d5dbaa2: 129 steps, none failed.
- The records: each standalone old sha of 7 to 40 characters in CHANGELOG.md, docs/HANDOFF.md, docs/HANDOFF_ARCHIVE.md, the task records b6c7 and 3e50, decision 31e5, lesson 2e32 and evidence/live/2026-09-25-compliance-two-repositories.md was replaced by the new sha of the same length, and the reverse map was checked to give back every original file exactly. Commit messages were not changed, so a message may still name an old sha.
- The eval evidence folders keep their names and their `commit` field: they record the commit the eval ran on, as it was named then. The map below translates them (a5d3b58 is now faca928, 1e9de2e is now 70f97a5).

The map, oldest first. Four old shas are left out on purpose, because their own diffs held the paths; they are named by subject.

| Old | New | Subject |
|---|---|---|
| (not listed) | 815f25f | lane frameworks-data: task record from LANES.md |
| (not listed) | 712349d | N1: frameworks as data |
| 5f58d44 | 4f64564 | Allow list: the compliance eval fixture |
| (not listed) | f54f722 | lane compliance-runtime: task record from LANES.md |
| (not listed) | ed4e0c3 | N2: skilliton compliance scope |
| d98f6d8 | 73f6ea3 | N3: the baseline crosswalk and skilliton compliance sheet |
| 5de0c6c | c9a799e | N4: the banned-word check |
| d26e71a | 6a288c7 | Merge fix for compliance-runtime |
| 7757ac2 | c206305 | Compliance batch records (N8) |
| 6037d77 | 5d0ad54 | Compliance batch: CI steps, four lane tasks closed |
| 702a90f | 7a9b270 | Checkpoint and handoff: four lanes merged |
| 67c145c | e20499c | Handoff archive from the checkpoint |
| 6bdc129 | ee6ed15 | Maintenance after 21 commits |
| 48ad575 | 97931ff | Checkpoint and handoff: CI red on the history scrub only |
| 8b2ef41 | fcb3820 | lane compliance-hooks: task record from LANES.md |
| 558d6d1 | 96fe9e8 | N5: compliance scope proposal at prepare |
| ccb6f70 | 8374ce8 | N5 reconciliation |
| a5d3b58 | faca928 | Compliance batch: the hooks lane merged |
| 56c570a | f620f53 | Checkpoint: five lanes merged, batch closed |
| 1e9de2e | 70f97a5 | Compliance skill: the three words never appear |
| da4caab | 12f5e5b | Compliance eval, second run |
| f422295 | 66520da | Maintenance and handoff: the compliance batch closed |
| f4be9c8 | 9c0ce1b | Maintenance: usage ledger row for the closing window |
| 3d40604 | 58ac0f9 | Owner approvals |
| a2b2af0 | d5dbaa2 | Checkpoint: the owner's approvals recorded |

## The rule

Before rewriting history, list what cites the commits that will change: `git grep` every sha in the rewritten range, in every length the records use, and name the evidence folders keyed by one. Decide before the push which references will be translated and which stay as written, and write the map in the same change. After the push, the old shas are a pointer to what was removed, so the public map leaves out any commit whose own diff held it. For a signed history, rewrite the smallest range that holds the problem, never the whole history.

## What now enforces it

Nothing yet. B97 is the fix that makes a rewrite unnecessary (dispatch never commits a home path into a lane's task record); no check lists the records that cite a rewritten range.
