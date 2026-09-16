// task: start, list, show, or close a task record. docs/CONTRACTS.md section 11; the engine is lib/tasks.mjs.

import { forDisplay, parseArgs, refuse, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { backupRoot, readBranch } from "../lib/journal.mjs";
import { clip, guardCommand, openProject } from "../lib/lifecycle.mjs";
import { CLOSED_STATES, checkBranch, closeTask, createTask, currentTask, findTask, listTasks, pickCurrent, taskRel } from "../lib/tasks.mjs";

export const help = `task: start, list, show, or close a task record. Each task is one file in the project's tasks folder (default
docs/tasks), named by a collision-free ID (YYYY-MM-DD-<slug>-<four hex digits>), so contributors on different
branches never edit the same file to add a task.

  task start "<title>" [--criteria "<text>" ...] [--branch <name>] [--owner <label>] [--dir <project>] [--apply]
      Shows the record it would create; --apply writes it. The State starts as in-progress. --branch defaults to
      the checked-out branch. --owner is a label, not an authenticated identity (default: unassigned).
  task list [--all] [--dir <project>]
      Open tasks (with --all, every task); the current task is marked with *. Unreadable records are named.
  task show [<id>] [--dir <project>]
      One task. Without an ID: the current task, the open task whose Branch is the checked-out branch.
  task close <id> --state <${CLOSED_STATES.join("|")}> [--dir <project>] [--apply]
      Shows the change to State and Updated; --apply writes it, after a backup under the Git dir.

Exit codes: 0 complete; 1 attention (unreadable task records, no current task for task show, or more than one);
2 invalid or refused (nothing was written); 3 operation failed.`;

const VALUE_OPTIONS = ["--branch", "--owner", "--state", "--dir"];
const ALLOWED = { start: ["apply", "branch", "owner", "dir", "criteria"], list: ["all", "dir"], show: ["dir"], close: ["apply", "state", "dir"] };

// --criteria may be given more than once, which parseArgs refuses for an option, so it is collected first.
function takeCriteria(argv) {
  const values = [], rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--criteria") {
      const value = argv[i + 1];
      if (value === undefined || value === "" || value.startsWith("--")) refuse("--criteria needs a value");
      values.push(value);
      i++;
    } else if (a.startsWith("--criteria=")) {
      const value = a.slice("--criteria=".length);
      if (value === "") refuse("--criteria needs a value");
      values.push(value);
    } else {
      rest.push(a);
      if (VALUE_OPTIONS.includes(a) && i + 1 < argv.length) rest.push(argv[++i]);
    }
  }
  return { values, rest };
}

export async function run(argv) {
  const { values: criteria, rest } = takeCriteria(argv);
  const o = parseArgs(rest, { flags: ["apply", "all"], options: ["branch", "owner", "state", "dir"] }, "task");
  if (o.help) { say(help); return 0; }
  const [sub, ...args] = o._;
  if (!sub) refuse(`task needs a subcommand: start, list, show or close. Run: ${selfCommand()} task --help`);
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, sub)) refuse(`unknown task subcommand "${sub}"; use start, list, show or close`);
  for (const key of ["apply", "all", "branch", "owner", "state", "dir"]) {
    if (o[key] !== undefined && !ALLOWED[sub].includes(key)) refuse(`--${key} is not used by task ${sub}`);
  }
  if (criteria.length && !ALLOWED[sub].includes("criteria")) refuse(`--criteria is not used by task ${sub}`);
  const body = { start, list, show, close }[sub];
  return guardCommand(`task ${sub}`, () => body(args, o, criteria));
}

async function start(args, o, criteria) {
  const cmd = selfCommand();
  if (args.length !== 1) refuse(args.length ? `task start takes one title, in quotes (got ${args.length} separate words)` : `task start needs a title, for example: ${cmd} task start "Add a sign-in form"`);
  const { root, project } = openProject(o.dir);
  const checkedOut = readBranch(root);
  let branch = o.branch;
  if (branch === undefined) {
    if (!checkedOut) refuse("HEAD is detached, so there is no branch to record; pass --branch <name>");
    branch = checkedOut;
  }
  branch = checkBranch(branch);
  const before = listTasks(project);
  const plan = createTask(project, { title: args[0], criteria, branch, owner: o.owner ?? "unassigned" }, { apply: o.apply === true });
  const sameBranch = before.tasks.filter((t) => t.branch === branch);
  const notes = [];
  if (sameBranch.length) notes.push(`note: branch ${branch} already has ${sameBranch.length} open task(s) (${sameBranch.map((t) => t.id).join(", ")}); with more than one, the current task is ambiguous and a checkpoint needs --task <id>`);
  if (checkedOut !== branch) notes.push(`note: the checked-out branch is ${checkedOut ?? "none (HEAD is detached)"}; this task is the current task only while ${branch} is checked out`);
  for (const u of before.unreadable) notes.push(`attention: ${u.message}`);
  if (o.apply !== true) {
    say(`task start (preview): would create ${plan.rel}`);
    say("The last four hex digits of the ID are drawn again when the record is written.");
    say("");
    say(plan.content.trimEnd());
    say("");
    for (const n of notes) say(n);
    say("Preview only; nothing was written. To create it, run the same command with --apply.");
    return 0;
  }
  say(`task start: created ${plan.rel}`);
  say(`  ID: ${plan.id}`);
  say(`  State: in-progress; Branch: ${branch}; Owner: ${o.owner ?? "unassigned"}`);
  for (const n of notes) say(n);
  say(`Record progress with: ${cmd} checkpoint${checkedOut === branch && !sameBranch.length ? "" : ` --task ${plan.id}`} --state "<what is done>" --evidence "<checks run>" --next "<next step>" --apply`);
  return 0;
}

async function list(args, o) {
  if (args.length) refuse(`task list takes no plain arguments (got "${args[0]}")`);
  const { root, project } = openProject(o.dir);
  const branch = readBranch(root);
  const listed = listTasks(project, { all: o.all === true });
  const current = pickCurrent(listed.tasks, branch);
  const which = o.all ? "" : "open ";
  if (!listed.exists) {
    say(`task list: no task records yet (${listed.dir} does not exist). To start one: ${selfCommand()} task start "<title>" --apply`);
  } else if (!listed.tasks.length) {
    say(`task list: no ${which}task records in ${listed.dir}`);
  } else {
    say(`task list: ${listed.tasks.length} ${which}task(s) in ${listed.dir}; ${branch ? `checked-out branch ${branch}` : "HEAD is detached"}`);
    for (const t of listed.tasks) say(`${current.task && t.id === current.task.id ? "*" : " "} ${t.id}  ${t.state.padEnd(11)}  ${t.branch}  ${clip(t.title, 100)}`);
    if (current.task) say("* is the current task: open, and its Branch is the checked-out branch");
  }
  if (current.ambiguous.length) say(`attention: the current task is ambiguous: ${current.ambiguous.length} open tasks have Branch ${branch} (${current.ambiguous.join(", ")})`);
  for (const u of listed.unreadable) say(`attention: ${u.message}`);
  return listed.unreadable.length || current.ambiguous.length ? 1 : 0;
}

function printTask(project, task) {
  say(`Task: ${task.title}`);
  say(`  ID:       ${task.id}`);
  say(`  State:    ${task.state}`);
  say(`  Branch:   ${task.branch}`);
  say(`  Owner:    ${task.owner}`);
  say(`  Updated:  ${task.updated}`);
  say(`  File:     ${taskRel(project, task.id)}`);
  if (task.criteria.length) {
    say(`Acceptance criteria: ${task.criteria.filter((c) => c.done).length} of ${task.criteria.length} checked`);
    for (const c of task.criteria) say(`  [${c.done ? "x" : " "}] ${c.text}`);
  } else {
    say("Acceptance criteria: none written as checkboxes");
  }
  say(`Checkpoints: ${task.checkpoints}`);
  if (task.lastCheckpoint) {
    const c = task.lastCheckpoint;
    say(`  latest: ${c.at}`);
    say(`    State:    ${c.state ?? "not recorded"}`);
    say(`    Evidence: ${c.evidence ?? "not recorded"}`);
    say(`    Next:     ${c.next ?? "not recorded"}`);
    say(`    Git:      ${c.git ?? "not recorded"}`);
  }
  if (!task.handoff) {
    say("Handoff: not yet written");
  } else {
    say("Handoff:");
    say(`  State:     ${task.handoff.state ?? "not recorded"}`);
    say(`  Next:      ${task.handoff.next ?? "not recorded"}`);
    say(`  Blocked:   ${task.handoff.blocked ?? "not recorded"}`);
    say(`  Watch out: ${task.handoff.watchOut ?? "not recorded"}`);
  }
}

async function show(args, o) {
  const cmd = selfCommand();
  if (args.length > 1) refuse(`task show takes at most one task ID (got ${args.length} arguments)`);
  const { root, project } = openProject(o.dir);
  if (args.length) {
    const task = findTask(project, args[0]);
    if (!task) refuse(`there is no task ${args[0]} (looked for ${taskRel(project, args[0])})`);
    printTask(project, task);
    return 0;
  }
  const branch = readBranch(root);
  const current = currentTask(project, branch);
  for (const u of current.unreadable) say(`attention: ${u.message}`);
  if (current.ambiguous.length) {
    say(`task show: the current task is ambiguous: ${current.ambiguous.length} open tasks have Branch ${branch} (${current.ambiguous.join(", ")}). Show one with: ${cmd} task show <id>`);
    return 1;
  }
  if (!current.task) {
    say(`task show: there is no current task (${branch ? `no open task record has Branch ${branch}` : "HEAD is detached"}). To start one: ${cmd} task start "<title>" --apply; to see every task: ${cmd} task list --all`);
    return 1;
  }
  printTask(project, current.task);
  return current.unreadable.length ? 1 : 0;
}

async function close(args, o) {
  const cmd = selfCommand();
  if (args.length !== 1) refuse(`task close needs exactly one task ID, for example: ${cmd} task close <id> --state done-local --apply`);
  if (o.state === undefined) refuse(`task close needs --state, one of: ${CLOSED_STATES.join(", ")}`);
  const { root, project } = openProject(o.dir);
  const plan = closeTask(project, args[0], o.state, { apply: o.apply === true, backupDir: o.apply === true ? backupRoot(root) : null });
  if (!plan.changed) {
    say(`task close: ${plan.task.id} is already ${o.state}; nothing to change`);
    return 0;
  }
  say(`task close${o.apply === true ? "" : " (preview)"}: ${plan.rel}`);
  say(forDisplay(unifiedDiff(plan.before, plan.after, `a/${plan.rel}`, `b/${plan.rel}`)).trimEnd());
  if (o.apply !== true) {
    say("Preview only; nothing was written. To write it, run the same command with --apply.");
    return 0;
  }
  say(`task close: ${plan.task.id} is now ${o.state}; the previous version was backed up to ${tilde(plan.backup)}`);
  return 0;
}
