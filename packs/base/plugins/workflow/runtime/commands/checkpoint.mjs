// checkpoint: add one checkpoint to a task record, rewrite that record's Handoff section, on an integration branch
// regenerate the indexes and (with --handoff) the shared handoff record, and record a checkpoint event in the local
// journal. docs/CONTRACTS.md sections 3 and 11; the engines are lib/tasks.mjs, lib/handoff.mjs, lib/records.mjs and
// lib/journal.mjs. Writes happen in this order: task record, shared handoff and its archive (one transaction),
// indexes (one transaction), journal. A failure after the first write says what stands and what to run.

import { Refused, forDisplay, parseArgs, refuse, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { applySharedHandoff, planSharedHandoff, stateBullet } from "../lib/handoff.mjs";
import { appendEvent, backupRoot, gitDir, readGitState } from "../lib/journal.mjs";
import { WRITTEN_AHEAD_MS, guardCommand, openProject } from "../lib/lifecycle.mjs";
import { TransactionFailed, describeFailure, readPath } from "../lib/prepare.mjs";
import { INDEX_KINDS, INDEX_RECORD_ROLE, ROLE_LABELS } from "../lib/project-files.mjs";
import { regenerateIndexes } from "../lib/records.mjs";
import { appendCheckpoint, checkText, currentTask, findTask, gitLine } from "../lib/tasks.mjs";

export const help = `checkpoint: add a checkpoint to a task record: the state of the work, the evidence for it, the next step, and the
mechanical Git state (branch, short commit, number of uncommitted paths). The same write brings the task record's
"## Handoff" section up to date (State, Next, Blocked, Watch out). On an integration branch (main or master by
default) the open-task index in the status record is regenerated too, and --handoff rewrites the shared handoff
record's RESUME HERE block, moving the previous note under "## Earlier" (five kept; older ones go to the top of the
handoff archive). With --apply it also records a checkpoint event in the local journal
(<git dir>/skilliton/journal.jsonl), which the Stop reminder measures from.

  checkpoint [--task <id>] --state "<text>" [--evidence "<text>"] --next "<text>" [--blocked "<text>"]
             [--watch-out "<text>"] [--handoff] [--dir <project>] [--apply]

Without --task: the current task, the open task whose Branch is the checked-out branch; more than one is refused as
ambiguous. Each value is one line. Shows every change; --apply writes them, each after a backup under the Git dir.
Without --evidence the checkpoint says "none given". Without --blocked or --watch-out the handoff keeps the previous
note's value when a person wrote one, else says "nothing" and "nothing known"; each carry-over is printed.
Off an integration branch the shared handoff and the indexes are never touched, and the output says so.

Refused, with nothing written: a handoff record with no "## RESUME HERE" section or "Written:" line, a Written value
that cannot be read or is later than this machine's clock by more than five minutes, and a task record whose Updated
is later than the clock by the same margin (a time typed ahead would make the new note read as the older one).

Exit codes: 0 complete; 1 complete, but an index entry needs attention (named in the output); 2 invalid or refused
(nothing was written); 3 operation failed (the output says what was written before the failure).`;

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply", "handoff"], options: ["task", "state", "evidence", "next", "blocked", "watch-out", "dir"] }, "checkpoint");
  if (o.help) { say(help); return 0; }
  const cmd = selfCommand();
  if (o._.length) refuse(`checkpoint takes no plain arguments (got "${o._[0]}"); put each value, in quotes, after its option`);
  if (o.state === undefined) refuse('checkpoint needs --state "<what is done and what is not>"');
  if (o.next === undefined) refuse('checkpoint needs --next "<the next concrete step>"');
  checkText(o.state, "--state");
  checkText(o.next, "--next");
  if (o.evidence !== undefined) checkText(o.evidence, "--evidence");
  if (o.blocked !== undefined) checkText(o.blocked, "--blocked");
  if (o["watch-out"] !== undefined) checkText(o["watch-out"], "--watch-out");
  return guardCommand("checkpoint", async () => {
    const { root, project } = openProject(o.dir);
    const git = readGitState(root, { shortHead: true });
    let task;
    if (o.task === undefined) {
      const current = currentTask(project, git.branch);
      if (current.ambiguous.length) refuse(`the current task is ambiguous: ${current.ambiguous.length} open tasks have Branch ${git.branch} (${current.ambiguous.join(", ")}); pass --task <id>`);
      if (!current.task) {
        const unreadable = current.unreadable.length ? ` (${current.unreadable.length} task record(s) could not be read: ${current.unreadable.map((u) => u.file).join(", ")})` : "";
        refuse(`there is no current task: ${git.branch ? `no open task record has Branch ${git.branch}` : "HEAD is detached"}${unreadable}. Start one with: ${cmd} task start "<title>" --apply, or pass --task <id>`);
      }
      task = current.task;
    } else {
      task = findTask(project, o.task);
      if (!task) refuse(`there is no task ${o.task} in ${project.directories.tasks}/`);
    }
    const id = task.id;
    const at = new Date();
    const atIso = at.toISOString();
    const apply = o.apply === true;
    const integrationList = project.integrationBranches.join(", ");
    const whereWeAre = git.branch === null ? "HEAD is detached" : `this branch is ${git.branch}`;
    const integration = git.branch !== null && project.integrationBranches.includes(git.branch);
    const shared = o.handoff === true && integration;
    const given = { Blocked: o.blocked, "Watch out": o["watch-out"] };
    const gitText = gitLine(git);
    const state = stateBullet({ state: o.state, evidence: o.evidence });

    // 1. The shared handoff plan comes first: its refusals (a note written ahead of the clock, a missing RESUME HERE)
    //    must stop the run before the task record is written.
    let sharedPlan = null;
    if (shared) sharedPlan = planSharedHandoff(project, { at, state, next: o.next, given, git: gitText });

    // 2. The task record's Handoff bullets: the shared note's resolved values, else the record's own previous ones.
    const previous = sharedPlan ? sharedPlan.bullets : { Blocked: task.handoff?.blocked ?? null, "Watch out": task.handoff?.watchOut ?? null };
    const handoffValues = { State: state, Next: o.next };
    const carried = [], defaulted = [];
    for (const label of ["Blocked", "Watch out"]) {
      if (given[label] !== undefined) { handoffValues[label] = given[label]; continue; }
      if (sharedPlan) { handoffValues[label] = sharedPlan.bullets[label]; continue; }
      const before = previous[label];
      if (before && !/^not yet (written|assessed)\.?$/i.test(before.trim())) { handoffValues[label] = before; carried.push(label); continue; }
      handoffValues[label] = label === "Blocked" ? "nothing" : "nothing known";
      defaulted.push(label);
    }
    if (sharedPlan) { carried.push(...sharedPlan.carried); defaulted.push(...sharedPlan.defaulted); }

    // The Git line describes the work being checkpointed, so it is read before the task file changes.
    const plan = appendCheckpoint(project, id, { at: atIso, state: o.state, evidence: o.evidence, next: o.next, git }, { apply, backupDir: apply ? backupRoot(root) : null, handoff: handoffValues, aheadMs: WRITTEN_AHEAD_MS });
    say(`checkpoint${apply ? "" : " (preview)"}: task ${id} in ${plan.rel}`);
    say(forDisplay(unifiedDiff(plan.before, plan.after, `a/${plan.rel}`, `b/${plan.rel}`)).trimEnd());
    for (const label of carried) say(`handoff: ${label} carried over from the previous note`);
    for (const label of defaulted) say(`handoff: ${label} not given and nothing to carry over; written as "${handoffValues[label]}"`);
    if (o.handoff === true && !integration) say(`handoff: the shared handoff is written on an integration branch (${integrationList}), and ${whereWeAre}; the note went to the task record's Handoff section only`);
    if (sharedPlan) {
      if (sharedPlan.created) say(`handoff: ${sharedPlan.rel} does not exist and is created from the record template`);
      if (sharedPlan.dropped) say(`handoff: the previous note in ${sharedPlan.rel} was the placeholder preparation wrote, so it is replaced, not kept under Earlier`);
      else if (sharedPlan.rotated) say(`handoff: the previous note (Written: ${sharedPlan.rotated}) moves to the top of Earlier`);
      if (sharedPlan.archivedCount) say(`handoff: ${sharedPlan.archivedCount} older note(s) beyond the five kept move to the top of ${sharedPlan.archiveRel}${sharedPlan.archiveCreated ? " (created from the record template)" : ""}`);
      if (sharedPlan.resumeBytes > sharedPlan.maxBytes) say(`handoff: note: the new RESUME HERE section is ${sharedPlan.resumeBytes} bytes, over the ${sharedPlan.maxBytes} bytes handoff.maxBytes allows; the session-start hook clips it`);
      for (const change of sharedPlan.changes) {
        const before = change.before === null ? "" : change.before.toString("latin1");
        say(forDisplay(unifiedDiff(before, change.after.toString("latin1"), `a/${change.path}`, `b/${change.path}`)).trimEnd());
      }
    }

    // 3. The indexes: planned with the task record's new text laid over the file, so the preview matches the write.
    let indexPlan = null, indexSkip = null, indexRefusal = null;
    if (!integration) indexSkip = `indexes: skipped; indexes are written on an integration branch (${integrationList}), and ${whereWeAre}`;
    else {
      for (const kind of INDEX_KINDS) {
        const role = INDEX_RECORD_ROLE[kind];
        if (readPath(root, project.artifacts[role], `the ${ROLE_LABELS[role]} ${project.artifacts[role]}`) === null) {
          indexSkip = `indexes: skipped; the ${ROLE_LABELS[role]} ${project.artifacts[role]} does not exist (run ${cmd} prepare --apply to create the records)`;
          break;
        }
      }
    }
    const overlay = { [plan.rel]: Buffer.from(plan.after, "latin1").toString("utf8") };
    const indexRun = (write) => {
      try { return regenerateIndexes(project, { apply: write, gitDir: gitDir(root), branch: git.branch, overlay }); } catch (e) {
        if (e instanceof Refused) { indexRefusal = e.message; return null; }
        throw e;
      }
    };
    if (indexSkip) say(indexSkip);
    else if (!apply) {
      indexPlan = indexRun(false);
      if (indexPlan) sayIndexes(indexPlan, false);
      else say(`indexes: not written: ${indexRefusal}`);
    }
    if (!apply) {
      say("Preview only; nothing was written. To write it, run the same command with --apply.");
      return 0;
    }

    // Writes. From here every failure says what stands.
    say(`checkpoint: written to ${plan.rel}; the previous version was backed up to ${tilde(plan.backup)}`);
    let exit = 0;
    const standing = [plan.rel];
    const journal = () => {
      // The fingerprint is read after the writes, so the checkpoint's own changes are part of the state it records;
      // otherwise the next Stop would see them as unrecorded work.
      try {
        const after = readGitState(root);
        const { record } = appendEvent(root, { event: "checkpoint", session: null, task: id, at: atIso }, { state: after });
        say(`journal: checkpoint event recorded (working tree fingerprint ${record.fingerprint ? record.fingerprint.slice(0, 12) : "unavailable"})`);
        return true;
      } catch (e) {
        console.error(`skilliton checkpoint: operation failed: the checkpoint was written to ${standing.join(", ")}, but the journal event was not recorded (${e.message}); the Stop reminder cannot see this checkpoint`);
        return false;
      }
    };
    if (sharedPlan) {
      try {
        const result = applySharedHandoff(project, sharedPlan, { gitDir: gitDir(root) });
        if (result) {
          standing.push(...sharedPlan.changes.map((c) => c.path));
          say(`handoff: written to ${sharedPlan.changes.map((c) => c.path).join(" and ")}; backups of the previous versions are under ${tilde(result.backupDir)}`);
        } else say(`handoff: ${sharedPlan.rel} already holds this note; nothing to write`);
      } catch (e) {
        if (!(e instanceof TransactionFailed)) throw e;
        const failure = describeFailure("checkpoint", e);
        for (const line of failure.lines) console.error(line);
        console.error(`The checkpoint stands in ${plan.rel}. The shared handoff was not written; fix the cause above, then run the same command again (the task record gets a second checkpoint, which is harmless).`);
        journal();
        return 3;
      }
    }
    if (!indexSkip) {
      let written = null;
      try {
        written = indexRun(true);
      } catch (e) {
        if (!(e instanceof TransactionFailed)) throw e;
        const failure = describeFailure("checkpoint", e);
        for (const line of failure.lines) console.error(line);
        console.error(`The checkpoint stands in ${standing.join(", ")}. The indexes were not written; run ${cmd} index --apply once the cause above is fixed.`);
        journal();
        return 3;
      }
      if (written) {
        sayIndexes(written, true);
        if (written.problems.length) exit = 1;
      } else {
        say(`indexes: not written: ${indexRefusal}. The checkpoint stands in ${standing.join(", ")}; run ${cmd} index --apply once that is fixed`);
        exit = 1;
      }
    }
    if (!journal()) return 3;
    return exit;
  });
}

function sayIndexes(plan, written) {
  const changed = plan.sections.filter((s) => s.changed);
  if (!changed.length) { say("indexes: every index is current; nothing to write"); return; }
  for (const s of changed) {
    const listed = s.kind === "tasks" ? `${s.count} open task(s) of ${s.total}` : `${s.count} ${s.kind === "decisions" ? "decision" : "lesson"} entr${s.count === 1 ? "y" : "ies"}`;
    say(`indexes: ${written ? "written" : "would write"} ${s.record} (${s.kind} index: ${listed})`);
    say(forDisplay(unifiedDiff(s.before.toString("latin1"), s.after.toString("latin1"), `a/${s.record}`, `b/${s.record}`)).trimEnd());
  }
  if (written && plan.result) say(`indexes: backups of the previous versions are under ${tilde(plan.result.backupDir)}`);
  for (const p of plan.problems) say(`indexes: problem: ${p}`);
  for (const n of plan.notes ?? []) say(`indexes: note: ${n}`);
}
