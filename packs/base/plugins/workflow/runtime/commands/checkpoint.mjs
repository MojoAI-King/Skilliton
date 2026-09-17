// checkpoint: add one checkpoint to a task record and record a checkpoint event in the local journal.
// docs/CONTRACTS.md section 11; the engines are lib/tasks.mjs and lib/journal.mjs.

import { forDisplay, parseArgs, refuse, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { appendEvent, backupRoot, readGitState } from "../lib/journal.mjs";
import { guardCommand, openProject } from "../lib/lifecycle.mjs";
import { appendCheckpoint, checkText, currentTask } from "../lib/tasks.mjs";

export const help = `checkpoint: add a checkpoint to a task record: the state of the work, the evidence for it, the next step, and the
mechanical Git state (branch, short commit, number of uncommitted paths). With --apply it also records a checkpoint
event in the local journal (<git dir>/skilliton/journal.jsonl), which the Stop reminder measures from.

  checkpoint [--task <id>] --state "<text>" [--evidence "<text>"] --next "<text>" [--dir <project>] [--apply]

Without --task: the current task, the open task whose Branch is the checked-out branch; more than one is refused as
ambiguous. Each value is one line. Shows the change; --apply writes it, after a backup under the Git dir.
Without --evidence the checkpoint says "none given".

Exit codes: 0 complete; 2 invalid or refused (nothing was written); 3 operation failed (the output says what was
written before the failure).`;

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["task", "state", "evidence", "next", "dir"] }, "checkpoint");
  if (o.help) { say(help); return 0; }
  const cmd = selfCommand();
  if (o._.length) refuse(`checkpoint takes no plain arguments (got "${o._[0]}"); put each value, in quotes, after its option`);
  if (o.state === undefined) refuse('checkpoint needs --state "<what is done and what is not>"');
  if (o.next === undefined) refuse('checkpoint needs --next "<the next concrete step>"');
  checkText(o.state, "--state");
  checkText(o.next, "--next");
  if (o.evidence !== undefined) checkText(o.evidence, "--evidence");
  return guardCommand("checkpoint", async () => {
    const { root, project } = openProject(o.dir);
    const git = readGitState(root, { shortHead: true });
    let id = o.task;
    if (id === undefined) {
      const current = currentTask(project, git.branch);
      if (current.ambiguous.length) refuse(`the current task is ambiguous: ${current.ambiguous.length} open tasks have Branch ${git.branch} (${current.ambiguous.join(", ")}); pass --task <id>`);
      if (!current.task) {
        const unreadable = current.unreadable.length ? ` (${current.unreadable.length} task record(s) could not be read: ${current.unreadable.map((u) => u.file).join(", ")})` : "";
        refuse(`there is no current task: ${git.branch ? `no open task record has Branch ${git.branch}` : "HEAD is detached"}${unreadable}. Start one with: ${cmd} task start "<title>" --apply, or pass --task <id>`);
      }
      id = current.task.id;
    }
    const at = new Date().toISOString();
    const apply = o.apply === true;
    // The Git line describes the work being checkpointed, so it is read before the task file changes.
    const plan = appendCheckpoint(project, id, { at, state: o.state, evidence: o.evidence, next: o.next, git }, { apply, backupDir: apply ? backupRoot(root) : null });
    say(`checkpoint${apply ? "" : " (preview)"}: task ${id} in ${plan.rel}`);
    say(forDisplay(unifiedDiff(plan.before, plan.after, `a/${plan.rel}`, `b/${plan.rel}`)).trimEnd());
    if (!apply) {
      say("Preview only; nothing was written. To write it, run the same command with --apply.");
      return 0;
    }
    say(`checkpoint: written to ${plan.rel}; the previous version was backed up to ${tilde(plan.backup)}`);
    // The fingerprint is read after the write, so the checkpoint's own change to the task file is part of the state it
    // records; otherwise the next Stop would see that change as unrecorded work.
    try {
      const after = readGitState(root);
      const { record } = appendEvent(root, { event: "checkpoint", session: null, task: id, at }, { state: after });
      say(`journal: checkpoint event recorded (working tree fingerprint ${record.fingerprint ? record.fingerprint.slice(0, 12) : "unavailable"})`);
    } catch (e) {
      console.error(`skilliton checkpoint: operation failed: the checkpoint was written to ${plan.rel}, but the journal event was not recorded (${e.message}); the Stop reminder cannot see this checkpoint`);
      return 3;
    }
    return 0;
  });
}
