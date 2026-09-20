// dispatch: create one Git worktree per lane from a lane plan, each with its brief. docs/CONTRACTS.md section 17;
// the engine is lib/dispatch.mjs.

import { parseArgs, refuse, say, selfCommand, tilde } from "../lib/core.mjs";
import { BRIEF_FILE, LANE_FILE, REPORT_FILE, applyDispatch, planDispatch } from "../lib/dispatch.mjs";
import { guardCommand, openProject } from "../lib/lifecycle.mjs";

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
      ${BRIEF_FILE}. ${BRIEF_FILE} and ${REPORT_FILE} are added once to the repository's info/exclude.

The lane root, the main-only paths, the lane test command and the lane setup come from the dispatch section of
.skilliton/config.json. Setup commands are never run: they are printed and written into each brief for a person to
run, because dispatch must not execute a repository's own code.

Exit codes: 0 complete; 2 invalid or refused (nothing was created); 3 operation failed (a worktree or a brief could
not be written; what was created is named).`;

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply", "preview"], options: ["file", "dir"] }, "dispatch");
  if (o.help) { say(help); return 0; }
  if (o._.length) refuse(`dispatch takes no plain arguments (got "${o._[0]}"); the lane plan is ${LANE_FILE}, or --file <path>`);
  if (o.apply && o.preview) refuse("--apply and --preview ask for opposite things; --apply shows the plan and then creates the worktrees, and without it dispatch only shows the plan");
  return guardCommand("dispatch", () => body(o));
}

// The plan is read down a column: the label is padded so the values line up under each other.
const FIELD_WIDTH = 17;
const field = (label, value) => `${label}${" ".repeat(Math.max(1, FIELD_WIDTH - label.length))}${value}`;

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
