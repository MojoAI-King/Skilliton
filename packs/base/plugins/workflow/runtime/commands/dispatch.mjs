// dispatch: create one Git worktree per lane from a lane plan, each with its brief. docs/CONTRACTS.md section 17;
// the engine is lib/dispatch.mjs.

import { linkedWriteProblem, parseArgs, refuse, say, selfCommand, tilde } from "../lib/core.mjs";
import { BRIEF_FILE, LANE_FILE, REPORT_FILE, applyClose, applyDispatch, applyMerge, planClose, planDispatch, planMerge } from "../lib/dispatch.mjs";
import { guardCommand, openProject } from "../lib/lifecycle.mjs";
import { COST_HEADING, appendCostSection } from "../lib/dispatch-brief.mjs";
import { RECONSTRUCTION_NOTE, findMeter, laneFigures, proveMeter } from "../lib/usage.mjs";
import { PRICING_RETRIEVED } from "../meter/pricing.mjs";
import { basename, join } from "node:path";

export const help = `dispatch: turn a lane plan into one Git worktree per lane, each holding a brief.

The plan is ${LANE_FILE} at the repository root, written by the dispatch skill (/workflow:dispatch) or by hand: a
"Base commit: <sha>" line, then one heading per lane with its items under it, fields separated by two or more spaces:

  Base commit: 1a2b3c4d
  ## Lane: reviews   branch: lane/reviews-0920   model: sonnet   context ceiling: 120000
  N1. [TOUCH] Fix the empty-state copy: src/review/empty.tsx: the card names the next step

  dispatch [--file <path>] [--dir <project>] [--preview]
      The plan: each lane, the folder and branch it would get, the items it would carry, and what its brief would
      say. Writes nothing. --preview asks for the same thing out loud.
  dispatch --apply [--file <path>] [--dir <project>]
      Shows the plan, then creates each worktree with git worktree add under the lane root and writes each lane's
      ${BRIEF_FILE}, then writes each lane's own task record into its worktree and commits it on the lane branch, one
      acceptance criterion per item. ${BRIEF_FILE} and ${REPORT_FILE} are added once to the repository's info/exclude.
  dispatch merge [--dir <project>] [--apply]
      Brings each lane's own records back: the task record, and the decision and lesson entries it proposed, as they
      are COMMITTED on the lane branch. Each file is brought back (not here yet), already present (identical), or a
      conflict (here and different), and a conflict is named and never overwritten. Without --apply it writes
      nothing; with it the records are written into this working tree and nothing is committed, so the diff is read
      first. Run it in the main checkout, not in a lane.
  dispatch close [--dir <project>] [--apply]
      For every lane/* branch the integration branch already contains (git branch --merged): brings its records back
      the way merge does, closes its task record as merged when it is still in-progress (the record is backed up
      first), and detaches its folder to the integration branch, so the lane branch is no longer checked out anywhere.
      A merged lane whose folder holds uncommitted work refuses the whole close, naming the folder, before anything is
      written. Nothing is deleted: not a branch, not a folder. One line per lane; without --apply it writes nothing.
      For each merged lane it also prints what the meter reads from that lane's own transcripts, the sessions opened
      in its folder and a lane agent whose brief names the folder with the agents it started (tokens, estimated
      cost, and peak context against the context bound: dispatch.contextCeiling when set, else 200000),
      names every lane that ran past it, and with --apply appends the same lines under "${COST_HEADING}" in the
      lane's ${REPORT_FILE} when there is one (that file is never committed).

The lane root, the main-only paths, the lane test command and the lane setup come from the dispatch section of
.skilliton/config.json. Setup commands are never run: they are printed and written into each brief for a person to
run, because dispatch must not execute a repository's own code.

Exit codes: 0 complete; 1 attention (merge only: a conflict, a lane with uncommitted changes, or a lane that has not
written LANE DONE); 2 invalid or refused (nothing was created); 3 operation failed (a worktree, a brief or a record
could not be written; what was created is named).`;

// A bare `dispatch` still means "plan the lanes", so only a recognised first plain argument routes to a subcommand.
const ALLOWED = { merge: ["apply", "dir"], close: ["apply", "dir"] };
const OPTIONS = ["apply", "preview", "file", "dir"];

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply", "preview"], options: ["file", "dir"] }, "dispatch");
  if (o.help) { say(help); return 0; }
  const [sub, ...args] = o._;
  if (sub !== undefined && !Object.prototype.hasOwnProperty.call(ALLOWED, sub)) {
    refuse(`dispatch takes no plain arguments except the subcommands merge and close (got "${sub}"); the lane plan is ${LANE_FILE}, or --file <path>`);
  }
  if (sub !== undefined) {
    if (args.length) refuse(`dispatch ${sub} takes no plain arguments (got "${args[0]}")`);
    for (const key of OPTIONS) {
      if (o[key] === undefined || ALLOWED[sub].includes(key)) continue;
      refuse(key === "preview"
        ? `dispatch ${sub} previews by default and writes only with --apply, so it does not take --preview`
        : `--${key} is not used by dispatch ${sub}`);
    }
    return guardCommand(`dispatch ${sub}`, () => (sub === "close" ? closeBody(o) : mergeBody(o)));
  }
  if (o.apply && o.preview) refuse("--apply and --preview ask for opposite things; --apply shows the plan and then creates the worktrees, and without it dispatch only shows the plan");
  return guardCommand("dispatch", () => body(o));
}

// The plan is read down a column: the label is padded so the values line up under each other.
const FIELD_WIDTH = 17;
// The merge column carries a longer label than the plan column, and a label wider than its column loses the column.
const MERGE_FIELD_WIDTH = 19;
const field = (label, value, width = FIELD_WIDTH) => `${label}${" ".repeat(Math.max(1, width - label.length))}${value}`;

function printPlan(plan, apply) {
  const lanes = plan.lanes;
  say(`skilliton dispatch${apply ? "" : " (preview)"}: ${lanes.length} lane${lanes.length === 1 ? "" : "s"} from ${plan.planRel}`);
  say(field("  lane root:", `${tilde(plan.laneRoot)}${plan.laneRootExists ? "" : apply ? " (created)" : " (would be created)"}`));
  const bases = [...new Set(lanes.map((l) => `${l.base} ${l.baseFrom}`))];
  if (bases.length === 1) say(field("  base commit:", `${lanes[0].base.slice(0, 12)} (${lanes[0].baseFrom})`));
  else say(field("  base commit:", `${bases.length} different ones, named per lane below`));
  for (const lane of lanes) {
    say("");
    say(`  Lane ${lane.name}   branch ${lane.branch}   model ${lane.model ?? "not named"}   context ceiling ${lane.ceiling ?? "not named"}`);
    say(field("    worktree:", tilde(lane.dir)));
    say(field("    items:", lane.items.length ? `${lane.items.length} (${lane.items.map((i) => i.ref).join(", ")})` : `none named in ${plan.planRel}; the brief says so instead of guessing`));
    if (bases.length > 1) say(field("    base:", `${lane.base.slice(0, 12)} (${lane.baseFrom})`));
    say(field("    brief:", `${BRIEF_FILE} (${apply ? "written" : "would be written"}: scope, bound, main-only paths, checks, setup)`));
    say(field("    record:", `${lane.taskRel} (${apply ? "written and committed" : "would be written and committed"} on ${lane.branch}, ${lane.items.length} criteri${lane.items.length === 1 ? "on" : "a"})`));
    say(`    ${lane.command.join(" ")}`);
  }
  say("");
  const c = plan.context;
  say(field("  main-only:", c.mainOnlyPaths.length ? c.mainOnlyPaths.join(", ") : "none set (dispatch.mainOnlyPaths is empty); each brief says so"));
  say(field("  lane check:", c.laneTestCommand ?? "none set (dispatch.laneTestCommand); each brief asks the lane to name the check it ran"));
  if (c.mainOnlyChecks.length) say(field("  not in lanes:", `${c.mainOnlyChecks.join(", ")} (${c.integrationBranch} runs them at merge)`));
  if (c.laneSetup.length) say(field("  setup:", `${c.laneSetup.join("; ")} (dispatch does not run it; each brief names it)`));
  if (plan.exclude.add.length) say(field("  info/exclude:", `${plan.exclude.add.join(", ")} ${apply ? "added" : "would be added"}`));
}

async function body(o) {
  const { root, project } = openProject(o.dir);
  const plan = planDispatch(root, project, { file: o.file });
  if (plan.problems.length) {
    refuse(`${plan.problems.length} problem${plan.problems.length === 1 ? "" : "s"} in the lane plan, so no worktree was created:\n${plan.problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  printPlan(plan, o.apply === true);
  if (o.apply !== true) {
    say("");
    say(`Preview only; nothing was created. To create them, run the same command with --apply.`);
    return 0;
  }
  const done = applyDispatch(root, plan);
  say("");
  for (const lane of done.created) say(`created ${tilde(lane.dir)} on ${lane.branch} from ${lane.base.slice(0, 12)}, with ${BRIEF_FILE}`);
  if (done.excluded.length) say(`info/exclude: added ${done.excluded.join(", ")}`);
  say(`Next: open each folder in its own window, start a fresh session there, and say: read ${BRIEF_FILE} at the root of this worktree and follow it.`);
  say(`Merging is serial: each lane rebases on ${project.integrationBranches[0]} and passes the full gate again, one at a time. Run ${selfCommand()} gate in the lane before you merge it.`);
  return 0;
}

// ---------- merge ----------

function laneState(lane) {
  if (!lane.branch) return "detached HEAD, no lane branch";
  const parts = [];
  if (lane.dirty === null) parts.push("uncommitted work unknown");
  else parts.push(lane.dirty ? `${lane.dirty} uncommitted change${lane.dirty === 1 ? "" : "s"}` : "clean");
  if (lane.done === true) parts.push("LANE DONE");
  else if (lane.done === false) parts.push(`no LANE DONE in ${REPORT_FILE}`);
  else parts.push(`${REPORT_FILE} unread`);
  return parts.join(", ");
}

function printMerge(plan, apply) {
  say(`skilliton dispatch merge${apply ? "" : " (preview)"}: ${plan.lanes.length} lane${plan.lanes.length === 1 ? "" : "s"} under ${tilde(plan.laneRoot)}`);
  say(field("  records:", plan.dirs.join(", "), MERGE_FIELD_WIDTH));
  say(field("  this branch:", plan.branch, MERGE_FIELD_WIDTH));
  for (const lane of plan.lanes) {
    say("");
    say(`  Lane ${lane.name}   branch ${lane.branch ?? "none"}`);
    say(field("    worktree:", tilde(lane.dir), MERGE_FIELD_WIDTH));
    say(field("    state:", laneState(lane), MERGE_FIELD_WIDTH));
    say(field("    brought back:", `${lane.bring}${apply ? " (written)" : ""}`, MERGE_FIELD_WIDTH));
    say(field("    already here:", String(lane.same), MERGE_FIELD_WIDTH));
    say(field("    conflict:", String(lane.conflict), MERGE_FIELD_WIDTH));
  }
  if (plan.bring.length) {
    say("");
    say(`${plan.bring.length} record${plan.bring.length === 1 ? "" : "s"} ${apply ? "written into" : "would come back to"} ${plan.branch}:`);
    for (const f of plan.bring) say(`  - ${f.path} (lane ${f.lane})`);
  }
  if (plan.conflicts.length) {
    say("");
    say(`${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? "" : "s"}, not written:`);
    for (const f of plan.conflicts) say(`  - ${f.path}: ${f.why}. Read the lane's copy with: git show ${f.branch}:${f.path}`);
  }
  if (plan.warnings.length) {
    say("");
    say(`${plan.warnings.length} warning${plan.warnings.length === 1 ? "" : "s"}:`);
    for (const w of plan.warnings) say(`  - ${w}`);
  }
}

async function mergeBody(o) {
  const { root, project } = openProject(o.dir);
  const plan = planMerge(root, project);
  if (!plan.lanes.length) {
    say(`skilliton dispatch merge: no lane worktree under ${tilde(plan.laneRoot)}${plan.laneRootExists ? "" : ", which does not exist"}, so there is nothing to bring back.`);
    say(`Lanes are the worktrees ${selfCommand()} dispatch --apply creates there; git worktree list shows what this repository has.`);
    return 0;
  }
  printMerge(plan, o.apply === true);
  const attention = plan.conflicts.length + plan.warnings.length;
  if (o.apply !== true) {
    say("");
    say(plan.bring.length
      ? `Preview only; nothing was written. To write ${plan.bring.length === 1 ? "that record" : "those records"} into this working tree, run the same command with --apply.`
      : "Preview only; nothing was written, and nothing would come back: every record the lanes committed is already here or in conflict.");
    return attention ? 1 : 0;
  }
  const done = applyMerge(root, plan);
  say("");
  say(done.written.length
    ? `Wrote ${done.written.length} record${done.written.length === 1 ? "" : "s"} into ${tilde(root)} and committed nothing: read them with git status and git diff, then commit on ${plan.branch}.`
    : "Nothing was written: no lane record is missing from this branch.");
  if (plan.conflicts.length) say(`The ${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? " above was" : "s above were"} left alone; merge each one by hand.`);
  return attention ? 1 : 0;
}

// ---------- close ----------

function closeLine(lane, apply) {
  const head = `  ${lane.branch.padEnd(28)} `;
  if (!lane.merged) return `${head}not merged into this branch; left alone`;
  const parts = [];
  const state = apply ? lane.before : lane.task?.state ?? null;
  if (!state) parts.push("no task record on this branch for it");
  else if (state === "in-progress") parts.push(`task ${apply ? lane.taskId : lane.task.id} ${apply ? "closed" : "would close"} as merged`);
  else parts.push(`task already ${state}`);
  if (!lane.dir) parts.push("its folder is gone, so there is nothing to detach");
  else if (!lane.attached) parts.push(`${tilde(lane.dir)} already detached`);
  else if (lane.dirty !== 0) parts.push(`${tilde(lane.dir)} holds uncommitted work, so the close is refused`);
  else parts.push(`${tilde(lane.dir)} ${apply ? "now detached" : "would be detached"} to this branch`);
  return `${head}merged: ${parts.join("; ")}`;
}

const DEFAULT_CONTEXT_BOUND = 200000;
const num = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Where the figures came from: the folder's own sessions, lane agents filed under the integrating window, or neither.
function laneSource(f) {
  if (f.laneAgents === null) {
    return f.requests ? "" : " (no transcript is filed under this folder, and this meter does not look for lane agents: a lane run as an agent from"
      + " the main window is recorded in that window's)";
  }
  const agents = f.laneAgents ? `; ${f.laneAgents} of them lane agent transcript(s) filed under the integrating window` : "";
  const left = f.laneAgentsLeftOut ? `; ${f.laneAgentsLeftOut} lane agent transcript(s) left out (a brief naming another folder too, or a first`
    + " message that could not be read)" : "";
  const none = f.requests ? "" : " (no session was opened in this folder and no lane agent's brief names it)";
  return `${agents}${left}${none}`;
}

function laneCostLine(meter, lane, bound) {
  const name = basename(lane.dir);
  try {
    const f = laneFigures(meter, lane.dir);
    const over = f.peak_context > bound;
    return { name, over, line: `lane ${name}: ${f.requests} request(s), ${num(f.tokens)} tokens, est usd ${f.cost_usd.toFixed(2)}, peak context `
      + `${num(f.peak_context)} against a bound of ${num(bound)}${over ? ", PAST THE BOUND" : ""}`
      + `${f.incomplete ? "; INCOMPLETE, do not quote" : ""}${laneSource(f)}` };
  } catch (e) {
    return { name, over: false, line: `lane ${name}: not measured (${String(e?.message ?? e).split("\n")[0]})` };
  }
}

// Cost and peak context per merged lane, from the meter over that lane's own transcripts only: the folder's sessions and its lane agents.
function laneCosts(root, project, plan) {
  const lanes = plan.lanes.filter((l) => l.merged && l.dir);
  if (!lanes.length) return null;
  const set = project.dispatch?.contextCeiling;
  const bound = Number.isInteger(set) && set > 0 ? set : DEFAULT_CONTEXT_BOUND;
  let meter;
  try {
    meter = findMeter(root);
    proveMeter(meter);
  } catch (e) {
    return { bound, perLane: new Map(), summary: `cost and peak context: not measured (${String(e?.message ?? e).split("\n")[0]})` };
  }
  const perLane = new Map(lanes.map((l) => [l.branch, laneCostLine(meter, l, bound)]));
  const past = [...perLane.values()].filter((c) => c.over).map((c) => c.name);
  const summary = past.length ? `ran past the context bound of ${num(bound)}: ${past.join(", ")}` : `no lane ran past the context bound of ${num(bound)}`;
  return { bound, perLane, summary };
}

function printCosts(costs, plan, apply) {
  if (!costs) return;
  say("");
  say("cost and peak context, from each merged lane's own transcripts, its folder's sessions and its lane agents "
    + `(est usd priced from the meter's table retrieved ${PRICING_RETRIEVED}):`);
  for (const c of costs.perLane.values()) say(`  ${c.line}`);
  say(`  ${costs.summary}`);
  if (!apply) return;
  const date = new Date().toISOString().slice(0, 10);
  for (const lane of plan.lanes) {
    const c = costs.perLane.get(lane.branch);
    if (!c) continue;
    const lines = [`Measured by skilliton dispatch close on ${date}, from this lane's own transcripts (a reconstruction, not a bill):`, `- ${c.line}`];
    if (c.over) lines.push(`- ran past the context bound of ${num(costs.bound)}`);
    const reportLinked = linkedWriteProblem(lane.dir, REPORT_FILE);
    if (reportLinked) say(`  not appended in ${tilde(join(lane.dir, REPORT_FILE))}: ${reportLinked}`);
    else if (appendCostSection(join(lane.dir, REPORT_FILE), lines)) say(`  appended under "${COST_HEADING}" in ${tilde(join(lane.dir, REPORT_FILE))}`);
  }
}

async function closeBody(o) {
  const { root, project } = openProject(o.dir);
  const plan = planClose(root, project);
  const apply = o.apply === true;
  const done = apply ? applyClose(root, project, plan) : null;
  const merged = plan.lanes.filter((l) => l.merged).length;
  say(`skilliton dispatch close${apply ? "" : " (preview)"}: ${plan.lanes.length} lane branch${plan.lanes.length === 1 ? "" : "es"}, `
    + `${merged} merged into ${plan.branch}`);
  for (const lane of plan.lanes) say(closeLine(lane, apply));
  printCosts(laneCosts(root, project, plan), plan, apply);
  const bring = plan.merge.bring.filter((e) => plan.lanes.some((l) => l.merged && l.branch === e.branch));
  const verb = apply ? "brought back" : "would come back";
  if (bring.length) say(`${bring.length} record${bring.length === 1 ? "" : "s"} ${verb}: ${bring.map((e) => e.path).join(", ")}`);
  say("");
  say(apply
    ? `Closed. ${done.brought.length} record(s) brought back and the task records changed in this working tree; nothing was committed. `
      + `Read git status and commit on ${plan.branch}.`
    : "Preview only; nothing was written. To close the merged lanes, run the same command with --apply.");
  if (plan.lanes.some((l) => l.merged && l.dir)) { say(""); say(RECONSTRUCTION_NOTE); }
  return 0;
}
