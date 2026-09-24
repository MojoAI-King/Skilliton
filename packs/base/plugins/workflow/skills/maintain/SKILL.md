---
name: maintain
description: Bring the repo's living documents up to date (handoff and resume marker, status, backlog, changelog, decisions, lessons), reconciled against git history and against what happened in this conversation, then commit them. Use at the end of a work session, before stepping away from a large context, after merging a batch of lanes, or when the user says "update the docs", "get ready for compaction", "wrap up", or "maintain".
---

# maintain: nothing learned in this session gets lost

Bring every living document in this repository up to date, so that a fresh session, or a different person, can pick up the work from the files alone.

**The test is not "did git change". It is "would closing this conversation lose anything."** A clean working tree does not mean there is nothing to do: plans, comparisons, decisions, and findings the user asked for often exist only in the chat. Find that material and write it into a file (an existing doc that fits, or a new `docs/<topic>.md` when none does), then link it from the repo's entry doc (`CLAUDE.md`, `AGENTS.md`, or `README.md`).

## First step: run skilliton maintain --apply and read its output

Before anything else, run skilliton maintain --apply and read its output. Every maintenance starts here, whichever way it was asked for (this skill, a personal maintain skill, or the stop hook's reminder), so that the journal sees every maintenance: the command records a maintain event, which is what the stop hook measures the next maintenance from, and without that event the stop hook keeps asking. It also regenerates the decision, lesson and task indexes, and refreshes the security findings section of the backlog when the project keeps a security register. Read what it printed: a step it reports as refused or not run goes into the report (section 6), never past it. Where `skilliton` is not found, say so and run `bin/skilliton` or `node scripts/skilliton.mjs`; in a project Skilliton has not prepared, say the command does not apply here and go on.

## 0. Then the repo's own checklist, before the generic steps

If `docs/MAINTAIN.md` exists, read it and run its steps as part of this ritual. It holds what is specific to this repo (index generators, archive scripts, generated tables). This skill stays generic. If a repo keeps re-deriving the same setup from prose, that is the signal to create one.

## 1. Find the living documents, and check the branch

**Prepared projects first.** Run `skilliton status` if it is available. In a project Skilliton prepared, it names every record (status, backlog and its archive, roadmap, decisions, lessons, handoff and its archive, maintenance steps), the entry folders for tasks, decisions and lessons, the integration branches, open tasks, pending migrations, and the security evidence counts. Those are the documents. A pending migration is reported to the user; do not run it as part of maintenance.

**Integration branches only.** The shared records (status, backlog, handoff, indexes, the decisions and lessons monoliths) are reconciled on an integration branch (`prepare.integrationBranches`, default `main` and `master`). On any other branch, update only that branch's task record and create new decision or lesson entry files; say that the shared records wait for integration, then skip to section 4a.

Otherwise, in this order:

1. `CLAUDE.md`, `AGENTS.md`, and `README.md` often name them ("read docs/STATUS.md first"). Their pointers override the list below.
2. Common names at the root and under `docs/`: `HANDOFF.md`, `STATUS.md`, `BACKLOG.md`, `TODO.md`, `CHANGELOG.md`, `DECISIONS.md`, `docs/decisions/`, `docs/LESSONS.md`.
3. Fallback: files under `docs/` containing `Last updated`, `Kind: Living`, `RESUME HERE`, or checkbox lists.

If none exist, offer `skilliton prepare` (it previews first, adopts what exists, and adds only what is missing, marked "not yet assessed"). Without Skilliton, offer to create `docs/HANDOFF.md` and `DECISIONS.md`, and nothing more. Do not invent a documentation system.

## 2. Establish what actually happened, from evidence

- `git log` since each document's last-updated marker; the current branch; uncommitted changes; whether the branch is pushed.
- This conversation: decisions made, things shipped, things verified and how, new blockers, actions now waiting on someone else.
- **Reconcile, do not rewrite.** Compare each document's claims against the evidence first. A document that is already right is reported as "verified current, no change" and left untouched.
- Evidence gathering must not leak secrets into documents: connection strings, tokens, signed URLs, and environment dumps are summarized by name and location, never pasted.

## 3. Update each document in its own format

- **Keep its structure exactly.** A table stays a table. You are updating a document, not redesigning it.
- **Never invent facts.** Everything written traces to a commit, a command's output, or something the user said. Things the user reported but you did not see are labelled "user-reported".
- **Never write a secret value.** Write "set in <location>". If a secret was exposed this session, record the exposure and a rotation task, never the value.
- **Match the repo's formatter or linter** if it has one, and run it after.
- **Currency markers:** update the date and one-line state summary the document already uses. Do not add a header it lacks.
- **Finished items** are marked done with evidence (commit hash, test count). In a backlog, move a finished item to an archive file with its closure date instead of deleting it; a live queue that carries finished work is how people pick up work that already shipped.
- **Cross-file consistency, checked not assumed:** for each item you touched, search the other living documents for it and confirm they agree on its state (done, next, blocked) and its owner.
- **Task records:** read the open ones (`skilliton task list`). A task whose work is finished gets its real state, not a hopeful one: `done-local` when it is only on a branch, `merged`, `released` or `verified` only with the evidence for that state (`skilliton task close <id> --state <state> --apply`). Its outcome moves into the status record; the backlog item moves to the archive with the closure date and evidence.
- **The mechanical half** is the first step above (`skilliton maintain --apply`), already run by now. Everything in this section is the half only you can do.
- **Indexes:** after adding or merging entry files, run `skilliton index --apply`. It regenerates the decision, lesson and task indexes between their markers and never touches text outside them.

### The resume marker (`docs/HANDOFF.md`)

The top of `docs/HANDOFF.md` is a section headed exactly `## RESUME HERE`, which the session-start hook shows to the next session. The day's checkpoints write it: `skilliton checkpoint --handoff ... --apply` on an integration branch rewrites the block, rotates the previous one under `## Earlier` and archives beyond five (the layout is in `/workflow:handoff`). Here the step is a check, not a rewrite: read the block's `Written:` time, run `git log --oneline --since="<that time>"`, and compare. If nothing happened since the block was written, leave it alone and say "handoff current". If the block is behind (commits, a decision or a blocker it does not name), write one more checkpoint with `--handoff` carrying the facts, rather than editing the file by hand. Write it by hand only where `skilliton` is not found, starting with `Written: <date and time>` read from the clock with `date "+%Y-%m-%d %H:%M %Z"` rather than from memory (`skilliton status` reports a time later than now instead of trusting it), then:

- **State:** one or two sentences on where things stand.
- **Next:** the next actions in priority order, each with the file or command to start from.
- **Blocked:** what is waiting on whom.
- **Watch out:** anything a fresh session would trip on (a failing check with a known reason, a half-finished migration).

By hand, move the previous `RESUME HERE` block below, under `## Earlier`, headed `### <its Written date>` (no `Written:` line: use `git log -1 --format=%cs -- docs/HANDOFF.md`, or `undated`). Keep the five most recent there; move older ones to `docs/HANDOFF_ARCHIVE.md`. The live file must stay short enough to read whole.

The same rule holds for the other mechanical records: `skilliton index` without `--apply` must report every index current (a checkpoint on an integration branch regenerates them; a stale one means a record was edited by hand since, so apply it), and each open task record's `## Handoff` must match its last checkpoint (`skilliton task show <id>`). What still needs judgment, and is written here: new decisions and lessons as entry files, the status paragraph, and the backlog rows.

### Decisions (`DECISIONS.md`)

Every architectural or product choice made this session gets an entry, written so a smart non-engineer can follow it:

```
## <date> <area>
**Decision:** what was chosen, one sentence.
**Why:** two or three sentences, no unexplained jargon.
**Alternatives rejected:** what else was considered, and why not.
**Risk:** what could go wrong, and how we would notice.
**Reversibility:** EASY / MODERATE / EXPENSIVE.
```

Keep its open-items table current. When the project has a decisions entry folder (a prepared project does), each new decision is its own file: `skilliton record decision "<title>" --apply`, then fill in its sections, then `skilliton index --apply`. Two writers never take the same number that way.

### Security evidence

Run `skilliton security status`. Report its counts in plain words: current, missing, stale, gaps, needs a person's decision. Stale or missing evidence is a finding to report, not a failure to hide, and never something to fix by re-dating a record. On an integration branch, `skilliton security findings --apply` writes one backlog row per open finding without duplicating rows. Evidence counts are never described as security or compliance.

## 4. Harvest lessons: two files, two jobs

A lesson has two halves that cannot live in one file. Write each lesson twice.

### 4a. The repo's lessons file (specific and technical). Do this first.

In a prepared project, each lesson is its own entry file: `skilliton record lesson "<title>" --apply`, then fill in its sections (the same five parts as below), then `skilliton index --apply`. Otherwise `docs/LESSONS.md`, or wherever the entry doc points. Create it if missing, seeded only from lessons this session earned. Each entry has:

1. **What broke:** the symptom as the user saw it.
2. **The mechanism:** why it broke, at the level of the actual machinery. If you cannot state it, the diagnosis is not finished.
3. **The fix:** the real file and line.
4. **The rule:** what a future session must do differently.
5. **What now enforces it:** the test, script, or check. If nothing does, write "nothing yet" and say so in the report. An entry with no enforcement line is a story, not a lesson.

Real paths, real commands, real commit hashes. No secrets.

### 4b. The team lessons file (portable)

If the team keeps a shared lessons file, its path is `maintain.teamLessonsFile` in `.skilliton/config.json` or the `SKILLITON_TEAM_LESSONS` environment variable. If neither is set, report "no team lessons file configured" and skip this step.

- **What qualifies:** anything earned this session that would help a different project get it right the first time. Routine work does not qualify.
- **Read its header first** and append in its format. The default format is **mistake, then rule, then shortcut**, dated to the month.
- **Strictly portable:** no client names, project names, repo paths, domains, or dollar figures. If a lesson cannot be told without them, it belongs only in 4a.
- **Sharpen, do not duplicate:** if the lesson exists, improve that entry.
- **Never copy the team lessons file into a repo.** It is written to be stripped of the specifics a repo needs, and it may hold material from other projects.
- **A lesson that should change how the whole company works** (a skill, a check, the instruction template) is a proposal, not a local edit: `skilliton propose <lesson entry> --repo <company skills repository>` copies it, scrubbed, for review. It becomes company policy only through a regression scenario, review and an approved release.
- If the session earned nothing portable, say "no new lessons". Do not manufacture one.

## 5. Commit

- Stage **only** the documents you changed, by explicit path. Never `git add -A` in a session that touched other files.
- Follow the repo's commit message style (read `git log`).
- Push only if the branch already tracks a remote and earlier documentation commits were pushed; otherwise leave it local and say so.

## 6. Report

End with a short summary:

- each document: updated (what changed) or verified current
- the new `RESUME HERE` top three items
- decisions recorded, or "no new decisions"
- lessons added to 4a and 4b, or "no new lessons" / "no team lessons file configured"
- anything stale or contradictory you could not resolve without the user (ask, do not guess)
- any unrelated uncommitted changes in the tree, flagged and left uncommitted
