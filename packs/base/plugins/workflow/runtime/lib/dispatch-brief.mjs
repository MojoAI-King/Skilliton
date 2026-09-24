// dispatch-brief.mjs: LANE_BRIEF.md's text (docs/CONTRACTS.md section 17). Split out of lib/dispatch.mjs, which was
// close to its own 600-line ceiling (scripts/lint.test.mjs) and had no room left for N67's split of briefText into
// named steps (docs/tasks/2026-09-23-lane-code-clarity-3584.md). lib/dispatch.mjs re-exports the three file name
// constants below so nothing importing them from there needs to change. Nothing here imports from outside the
// plugin folder.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { formatRecordHeader } from "./config.mjs";
import { tilde } from "./core.mjs";

export const LANE_FILE = "LANES.md";
export const BRIEF_FILE = "LANE_BRIEF.md";
export const REPORT_FILE = "LANE_REPORT.md";
// The sixth heading of a lane report. The lane writes it (or "not measured"); `skilliton dispatch close` appends what
// the meter read from the lane folder's own transcripts under it.
export const COST_HEADING = "Cost and peak context";

const bullet = (items) => items.map((i) => `- ${i}`).join("\n");

// The title, the record header, the lane's own facts, how to launch it, and the two checks it must pass before it
// writes anything.
function briefHeader(lane, ctx, model, ceiling) {
  const lines = [];
  lines.push(`# Lane brief: ${lane.name}`);
  lines.push("");
  lines.push(formatRecordHeader(
    ctx.recordHeader,
    `Reference. Written by \`skilliton dispatch\` from ${ctx.planRel} on ${ctx.date}. It is not committed: dispatch adds ` +
    `${BRIEF_FILE} and ${REPORT_FILE} to the repository's info/exclude.`,
  ));
  lines.push("");
  lines.push(`- **Lane:** ${lane.name}`);
  lines.push(`- **Branch:** ${lane.branch}, created from ${lane.base.slice(0, 12)} (${lane.baseFrom})`);
  lines.push(`- **Worktree:** ${lane.dir}`);
  lines.push(`- **Integration branch:** ${ctx.integrationBranch}, at ${tilde(ctx.root)}`);
  lines.push(`- **Model:** ${model}`);
  lines.push(`- **Context ceiling:** ${ceiling}`);
  lines.push("");
  lines.push("## Launching this lane");
  lines.push("");
  if (ctx.agent) {
    // The lane's own model reaches the command line only when it is a bare token: the LANES.md field is free text, and
    // a sentence in it would make the line unrunnable. Anything else falls back to the definition's own model.
    const m = /^[A-Za-z0-9][\w.-]*$/.test(lane.model ?? "") ? lane.model : ctx.agent.model;
    lines.push(
      `This lane runs as the \`${ctx.agent.name}\` agent the workflow plugin ships (\`agents/${ctx.agent.name}.md\`, model ` +
      `${ctx.agent.model}, effort ${ctx.agent.effort}). From the integration window:`,
    );
    lines.push("");
    lines.push("```");
    lines.push(`cd ${lane.dir} && claude --agent ${ctx.agent.name} --model ${m} --effort ${ctx.agent.effort}`);
    lines.push("```");
    lines.push("");
    lines.push(
      `The model and the effort are on the line rather than left to the client to read from the definition. If ` +
      `\`claude --help\` here does not list \`--agent\`, open a session in this folder and ask for the ${ctx.agent.name} ` +
      `agent by name: the definition is the same either way.`,
    );
  } else {
    lines.push(
      "The `agents/lane.md` beside this runtime could not be read, so this brief names no agent. Open a session in " +
      "this folder, say it is one lane of a dispatched batch, and give it this brief.",
    );
  }
  lines.push("");
  lines.push("## Check before you write");
  lines.push("");
  lines.push(`Run \`git branch --show-current\`. It must print ${lane.branch}; otherwise stop and say so.`);
  lines.push(`Run \`git merge-base --is-ancestor ${lane.base} HEAD\`. It must exit 0; otherwise stop and say this lane is missing the base commit.`);
  lines.push("");
  return lines;
}

// The lane's items, what it must read and return, and which paths belong to the integration branch instead.
function briefScope(lane, ctx, model, ceiling) {
  const lines = [];
  lines.push(`## Scope: ${lane.items.length} item${lane.items.length === 1 ? "" : "s"}`);
  lines.push("");
  if (lane.items.length) {
    lines.push(...lane.items.map((i) => `${i.ref}. ${i.text}`));
    lines.push("");
    lines.push(
      `These items and nothing else. Work that is not here belongs to another lane: write it under "Leftovers for ` +
      `other lanes" in ${REPORT_FILE} instead of doing it. Commit once per item with the N number in the subject, and do not push.`,
    );
  } else {
    lines.push(`${LANE_FILE} names no items for this lane. Do not guess the scope: say so and stop.`);
  }
  lines.push("");
  lines.push("## Your bound");
  lines.push("");
  lines.push(bullet([
    "**Read:** this brief, the files the items name, and what those lead to. Not the repository end to end, and not the other lanes' items.",
    `**Return:** ${REPORT_FILE} at the root of this worktree, with these headings, each present even when empty: Commits ` +
    `by item (hash, N number); Skipped (item, why); Merge-time expectations (conflicts you expect and how to resolve ` +
    `them, seams you touched, files outside your list); Run-time behavior (what the first run after release does once); ` +
    `Leftovers for other lanes (name the lane that owns the file); ${COST_HEADING} (what this lane's own transcripts cost and the ` +
    `largest context it reached, from your own dispatch close if it works here, else "not measured"; dispatch close appends the ` +
    `meter's reading under it when the lane is closed). End with the line LANE DONE and the commits, each with its N number.`,
    `**Model:** ${model}.`,
    `**Context ceiling:** ${ceiling}. Work that needs more than the ceiling was scoped too wide: stop, write what is done ` +
    `in ${REPORT_FILE}, and say so. Do not compact your way through it.`,
    "**Nothing silent:** a check that crashed, an item you could not do, an assumption you could not verify is reported as that, never rounded up.",
  ]));
  lines.push("");
  lines.push("## Paths that belong to the integration branch");
  lines.push("");
  if (ctx.mainOnlyPaths.length) {
    lines.push("Do not edit these here. Every lane would edit the same lines, and the merge would be a conflict for each one:");
    lines.push("");
    lines.push(bullet(ctx.mainOnlyPaths));
    lines.push("");
  } else {
    lines.push(
      `This project sets no main-only paths (\`dispatch.mainOnlyPaths\` in .skilliton/config.json is empty), so nothing ` +
      `is reserved for ${ctx.integrationBranch}. If the shared records live in this repository, set it before the next dispatch.`,
    );
    lines.push("");
  }
  lines.push(
    `The exception is the files this lane writes for itself. Its task record already exists and is committed on this ` +
    `branch: \`${lane.taskRel}\`, with one acceptance criterion per item above. Tick a criterion when it is done, and ` +
    `record a checkpoint as items finish (\`skilliton checkpoint --state "<what is true>" --evidence "<what ran>" --next ` +
    `"<next step>" --apply\`); a decision or a lesson goes in as its own proposed entry (\`skilliton record decision ` +
    `"<title>" --apply\`). Never the shared handoff, status, backlog or indexes: ${ctx.integrationBranch} writes those ` +
    `once the lanes are merged. \`skilliton dispatch merge\` brings this lane's records back, so commit them.`,
  );
  lines.push("");
  return lines;
}

// The checks the lane runs (and must not run), the setup dispatch left for a person, and how the lane finishes.
function briefChecksAndSetup(lane, ctx, setup) {
  const lines = [];
  lines.push("## Checks");
  lines.push("");
  lines.push(ctx.laneTestCommand
    ? `Run in this worktree: \`${ctx.laneTestCommand}\`. Read the exit status on its own line; never judge a check through a pipe into \`head\` or \`tail\`.`
    : "This project names no lane test command (`dispatch.laneTestCommand` in .skilliton/config.json). Use the project's " +
      "own check, and say which one you ran. Two lanes running the same check at once can share a port, a database or a " +
      "build folder: if that is possible here, say so rather than trusting the result.");
  lines.push("");
  lines.push(
    "Keep every single command under about eight minutes: run a long suite one file at a time, and leave the full check " +
    "list to the integration branch. A lane run as an agent that stays silent for ten minutes inside one call is " +
    "stopped as stalled (B87).",
  );
  if (ctx.mainOnlyChecks.length) {
    lines.push("");
    lines.push(`Do not run: ${ctx.mainOnlyChecks.join(", ")}. ${ctx.integrationBranch} runs those once at merge.`);
  }
  lines.push("");
  lines.push("## Setup dispatch did not run");
  lines.push("");
  if (setup.length) {
    lines.push("dispatch never runs a command from the project's configuration. Run these in this worktree before you start:");
    lines.push("");
    lines.push("```");
    lines.push(...setup);
    lines.push("```");
  } else {
    lines.push("None: this project sets no `dispatch.laneSetup` commands.");
  }
  lines.push("");
  lines.push("## When the lane is done");
  lines.push("");
  lines.push(
    `Say so in the main window. Merging is serial no matter how many lanes ran: each lane rebases on the ` +
    `${ctx.integrationBranch} the previous merge produced and passes the full gate again. A lane's green proves the lane ` +
    `is sound on its own, not on top of the others.`,
  );
  lines.push("");
  return lines;
}

export function briefText(lane, ctx) {
  const setup = ctx.laneSetup.map((c) => c.replaceAll("{lane}", lane.name));
  const model = lane.model
    ? `${lane.model} (named in ${LANE_FILE})`
    : `not named in ${LANE_FILE}; ask before using the most capable one, because a lane with a written spec and a gate ` +
      `behind it rarely needs it`;
  const ceiling = lane.ceiling ? `${lane.ceiling} (named in ${LANE_FILE})` : `not named in ${LANE_FILE}`;
  return [
    ...briefHeader(lane, ctx, model, ceiling),
    ...briefScope(lane, ctx, model, ceiling),
    ...briefChecksAndSetup(lane, ctx, setup),
  ].join("\n");
}

// Appends lines under the report's cost heading: at the end of that section when the report has one, else as a new
// section just before its LANE DONE line (or at the end). Returns false, writing nothing, when the report is not there
// or already holds exactly these lines. The report is never committed (it is in info/exclude).
export function appendCostSection(reportPath, lines) {
  if (!existsSync(reportPath)) return false;
  const text = readFileSync(reportPath, "utf8");
  const block = lines.join("\n");
  if (text.includes(block)) return false;
  const all = text.split("\n");
  const heading = all.findIndex((l) => l.trim().replace(/^#+\s*/, "") === COST_HEADING && /^#/.test(l.trim()));
  const done = all.findIndex((l) => /^[ \t]*LANE DONE\b/.test(l));
  let at;
  let insert = ["", ...lines, ""];
  if (heading >= 0) {
    const next = all.findIndex((l, i) => i > heading && (/^#{1,2}\s/.test(l) || /^[ \t]*LANE DONE\b/.test(l)));
    at = next < 0 ? all.length : next;
  } else {
    at = done < 0 ? all.length : done;
    insert = ["", `## ${COST_HEADING}`, "", ...lines, ""];
  }
  // One blank line either side, never two: the report's own blank lines are left as they are.
  if (at > 0 && all[at - 1].trim() === "") insert = insert.slice(1);
  if (at < all.length && all[at].trim() === "") insert = insert.slice(0, -1);
  all.splice(at, 0, ...insert);
  writeFileSync(reportPath, all.join("\n"));
  return true;
}
