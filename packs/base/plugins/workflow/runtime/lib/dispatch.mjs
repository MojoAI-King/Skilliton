// dispatch.mjs: the engine of `skilliton dispatch` (docs/CONTRACTS.md section 17). It turns a lane plan into one Git
// worktree per lane, each holding a brief: what the lane is for, what it may read and must return, and the paths that
// belong to the integration branch.
//
// Why a file per lane instead of the plan itself: the plan holds every lane, and a lane session that reads it pays for
// the other lanes' items on every later turn. The brief is the one lane's page, written where that session already is.
//
// What this never does: run a command from the project's configuration. `dispatch.laneSetup` is printed and written
// into the brief for a person to run, on the same rule that keeps prepare from executing repository code.
//
// Refusals (exit 2, nothing created): no lane plan, a plan over the size bound, no lane headings, a lane without a
// branch, a malformed field, a duplicate lane name or branch, a lane root inside the repository, a base commit the
// repository does not have, an existing lane branch, an existing lane folder, and a folder Git already has as a
// worktree. Every problem found is listed at once, because fixing them one refusal at a time is the slow way.

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { PLUGIN_ROOT, refuse, tilde } from "./core.mjs";
import { readBranch, runGit } from "./journal.mjs";
import { newId } from "./ids.mjs";
import { OperationFailed } from "./lifecycle.mjs";
import { renderTask, taskRel } from "./tasks.mjs";

export const LANE_FILE = "LANES.md";
export const BRIEF_FILE = "LANE_BRIEF.md";
export const REPORT_FILE = "LANE_REPORT.md";
const MAX_PLAN_BYTES = 200000;
// A worktree add checks out the tree, which on a large repository is slower than a query; the journal's default
// timeout is for queries.
const WORKTREE_TIMEOUT_MS = 120000;

const LANE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const BRANCH_RE = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,100}$/;
const LANE_HEADING_RE = /^##\s+Lane:\s*(\S.*?)\s*$/;
const OTHER_HEADING_RE = /^#{1,2}\s+\S/;
const BASE_RE = /^\s*(?:[-*]\s*)?(?:\*\*)?base(?:\s+commit)?(?:\*\*)?\s*:\s*`?([0-9a-fA-F]{7,40})`?\s*$/i;
const ITEM_RE = /^\s*(?:[-*]\s*)?(N\d+)\.\s+(\S.*?)\s*$/;
const FIELD_RE = /^([A-Za-z][A-Za-z ]*?)\s*:\s*(\S.*)$/;
const FIELD_KEYS = ["branch", "model", "context ceiling"];

// ---------- reading the plan ----------

function parseLaneHeading(rest, line, problems) {
  const parts = rest.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  const name = parts.shift() ?? "";
  const lane = { name, line, branch: null, model: null, ceiling: null, items: [], base: null };
  if (!LANE_NAME_RE.test(name)) {
    const hint = name.includes(":") ? "; a lane's fields are separated from the name by two or more spaces, not one" : "";
    problems.push(`${LANE_FILE} line ${line}: "${name || "(empty)"}" is not a lane name. Use letters, digits, dot, underscore or hyphen, at most 61 characters: it becomes a folder name under the lane root${hint}`);
    return lane;
  }
  for (const part of parts) {
    const m = FIELD_RE.exec(part);
    if (!m) {
      problems.push(`${LANE_FILE} line ${line}: lane ${name} has "${part}", which is not a "key: value" field (fields are separated by two or more spaces)`);
      continue;
    }
    const key = m[1].toLowerCase().replace(/\s+/g, " ");
    const value = m[2].trim();
    if (!FIELD_KEYS.includes(key)) {
      problems.push(`${LANE_FILE} line ${line}: lane ${name} has the unknown field "${key}" (known: ${FIELD_KEYS.join(", ")})`);
      continue;
    }
    if (key === "branch") lane.branch = value;
    else if (key === "model") lane.model = value;
    else lane.ceiling = value;
  }
  if (lane.branch === null) problems.push(`${LANE_FILE} line ${line}: lane ${name} has no branch field. Write: ## Lane: ${name}   branch: lane/${name}-<mmdd>`);
  else if (!BRANCH_RE.test(lane.branch)) problems.push(`${LANE_FILE} line ${line}: lane ${name} has the branch "${lane.branch}", which is not a branch name (letters, digits, dot, underscore, hyphen and slash; no "..", no leading or trailing slash)`);
  return lane;
}

// A lane runs from its "## Lane:" heading to the next heading of level 1 or 2; deeper headings (### Brief, Items) are
// part of the lane. A "Base commit:" line outside a lane applies to every lane after it, so a plan that appends a
// later batch keeps each batch's own base.
function parseLanes(text) {
  const lines = text.split(/\r?\n/);
  const lanes = [];
  const problems = [];
  let base = null;
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const n = i + 1;
    const heading = LANE_HEADING_RE.exec(line);
    if (heading) {
      const lane = parseLaneHeading(heading[1], n, problems);
      lane.base = base;
      lanes.push(lane);
      current = lane;
      continue;
    }
    if (OTHER_HEADING_RE.test(line)) { current = null; continue; }
    if (!current) {
      const m = BASE_RE.exec(line);
      if (m) base = { sha: m[1].toLowerCase(), line: n };
      continue;
    }
    const item = ITEM_RE.exec(line);
    if (item) current.items.push({ ref: item[1], text: item[2], line: n });
  }
  return { lanes, problems };
}

// ---------- the repository ----------

function commitOf(root, ref) {
  const r = runGit(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout.trim() : null;
}

function branchExists(root, branch) {
  return runGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0;
}

function registeredWorktrees(root) {
  const r = runGit(root, ["worktree", "list", "--porcelain"]);
  if (r.status !== 0) throw new OperationFailed(`git worktree list failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}; nothing was created`);
  // One entry per block, and only one: a block ends at its branch line or at the blank line, whichever comes first,
  // so an attached worktree is never also reported as detached.
  const out = [];
  let path = null;
  const flush = (branch) => { if (path !== null) { out.push({ path, branch }); path = null; } };
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) { flush(null); path = line.slice("worktree ".length).trim(); }
    else if (line.startsWith("branch ") && path !== null) flush(line.slice("branch ".length).trim().replace(/^refs\/heads\//, ""));
    else if (line === "") flush(null);
  }
  flush(null);
  return out;
}

// The lane root, from the project's configuration or beside the repository. planDispatch refuses one inside the
// repository; merge only reads it, so it resolves the same path without repeating that judgement.
function laneRootOf(root, project) {
  return resolve(root, project.dispatch.laneRoot ?? `../${basename(root)}-lanes`);
}

function gitCommonDir(root) {
  const r = runGit(root, ["rev-parse", "--git-common-dir"]);
  if (r.status !== 0) throw new OperationFailed(`git rev-parse --git-common-dir failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}; nothing was created`);
  const value = r.stdout.trim();
  return isAbsolute(value) ? value : resolve(root, value);
}

function excludePlan(root) {
  const path = join(gitCommonDir(root), "info", "exclude");
  let present = new Set();
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (t) present.add(t.replace(/^\//, ""));
    }
  }
  return { path, add: [BRIEF_FILE, REPORT_FILE].filter((name) => !present.has(name)) };
}

// The lane agent this plugin ships, read from its own definition so the brief never states a model the definition does
// not. Anything unreadable or incomplete returns null and the brief says so instead of naming an agent that may not
// exist.
function laneAgent() {
  let text;
  try { text = readFileSync(join(PLUGIN_ROOT, "agents", "lane.md"), "utf8"); } catch { return null; }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!front) return null;
  const field = (key) => (new RegExp(`^${key}:[ \t]*(.+)$`, "m").exec(front[1]) ?? [])[1]?.trim();
  const agent = { name: field("name"), model: field("model"), effort: field("effort") };
  return agent.name && agent.model && agent.effort ? agent : null;
}

// ---------- the brief ----------

const bullet = (items) => items.map((i) => `- ${i}`).join("\n");

function briefText(lane, ctx) {
  const setup = ctx.laneSetup.map((c) => c.replaceAll("{lane}", lane.name));
  const model = lane.model ? `${lane.model} (named in ${LANE_FILE})` : `not named in ${LANE_FILE}; ask before using the most capable one, because a lane with a written spec and a gate behind it rarely needs it`;
  const ceiling = lane.ceiling ? `${lane.ceiling} (named in ${LANE_FILE})` : `not named in ${LANE_FILE}`;
  const lines = [];
  lines.push(`# Lane brief: ${lane.name}`);
  lines.push("");
  lines.push(`Kind: Reference. Written by \`skilliton dispatch\` from ${ctx.planRel} on ${ctx.date}. It is not committed: dispatch adds ${BRIEF_FILE} and ${REPORT_FILE} to the repository's info/exclude.`);
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
    lines.push(`This lane runs as the \`${ctx.agent.name}\` agent the workflow plugin ships (\`agents/${ctx.agent.name}.md\`, model ${ctx.agent.model}, effort ${ctx.agent.effort}). From the integration window:`);
    lines.push("");
    lines.push("```");
    lines.push(`cd ${lane.dir} && claude --agent ${ctx.agent.name} --model ${m} --effort ${ctx.agent.effort}`);
    lines.push("```");
    lines.push("");
    lines.push(`The model and the effort are on the line rather than left to the client to read from the definition. If \`claude --help\` here does not list \`--agent\`, open a session in this folder and ask for the ${ctx.agent.name} agent by name: the definition is the same either way.`);
  } else {
    lines.push("The `agents/lane.md` beside this runtime could not be read, so this brief names no agent. Open a session in this folder, say it is one lane of a dispatched batch, and give it this brief.");
  }
  lines.push("");
  lines.push("## Check before you write");
  lines.push("");
  lines.push(`Run \`git branch --show-current\`. It must print ${lane.branch}; otherwise stop and say so.`);
  lines.push(`Run \`git merge-base --is-ancestor ${lane.base} HEAD\`. It must exit 0; otherwise stop and say this lane is missing the base commit.`);
  lines.push("");
  lines.push(`## Scope: ${lane.items.length} item${lane.items.length === 1 ? "" : "s"}`);
  lines.push("");
  if (lane.items.length) {
    lines.push(...lane.items.map((i) => `${i.ref}. ${i.text}`));
    lines.push("");
    lines.push(`These items and nothing else. Work that is not here belongs to another lane: write it under "Leftovers for other lanes" in ${REPORT_FILE} instead of doing it. Commit once per item with the N number in the subject, and do not push.`);
  } else {
    lines.push(`${LANE_FILE} names no items for this lane. Do not guess the scope: say so and stop.`);
  }
  lines.push("");
  lines.push("## Your bound");
  lines.push("");
  lines.push(bullet([
    "**Read:** this brief, the files the items name, and what those lead to. Not the repository end to end, and not the other lanes' items.",
    `**Return:** ${REPORT_FILE} at the root of this worktree, with these headings, each present even when empty: Commits by item (hash, N number); Skipped (item, why); Merge-time expectations (conflicts you expect and how to resolve them, seams you touched, files outside your list); Run-time behavior (what the first run after release does once); Leftovers for other lanes (name the lane that owns the file). End with the line LANE DONE and the commits, each with its N number.`,
    `**Model:** ${model}.`,
    `**Context ceiling:** ${ceiling}. Work that needs more than the ceiling was scoped too wide: stop, write what is done in ${REPORT_FILE}, and say so. Do not compact your way through it.`,
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
    lines.push(`This project sets no main-only paths (\`dispatch.mainOnlyPaths\` in .skilliton/config.json is empty), so nothing is reserved for ${ctx.integrationBranch}. If the shared records live in this repository, set it before the next dispatch.`);
    lines.push("");
  }
  lines.push(`The exception is the files this lane writes for itself. Its task record already exists and is committed on this branch: \`${lane.taskRel}\`, with one acceptance criterion per item above. Tick a criterion when it is done, and record a checkpoint as items finish (\`skilliton checkpoint --state "<what is true>" --evidence "<what ran>" --next "<next step>" --apply\`); a decision or a lesson goes in as its own proposed entry (\`skilliton record decision "<title>" --apply\`). Never the shared handoff, status, backlog or indexes: ${ctx.integrationBranch} writes those once the lanes are merged. \`skilliton dispatch merge\` brings this lane's records back, so commit them.`);
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  lines.push(ctx.laneTestCommand
    ? `Run in this worktree: \`${ctx.laneTestCommand}\`. Read the exit status on its own line; never judge a check through a pipe into \`head\` or \`tail\`.`
    : "This project names no lane test command (`dispatch.laneTestCommand` in .skilliton/config.json). Use the project's own check, and say which one you ran. Two lanes running the same check at once can share a port, a database or a build folder: if that is possible here, say so rather than trusting the result.");
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
  lines.push(`Say so in the main window. Merging is serial no matter how many lanes ran: each lane rebases on the ${ctx.integrationBranch} the previous merge produced and passes the full gate again. A lane's green proves the lane is sound on its own, not on top of the others.`);
  lines.push("");
  return lines.join("\n");
}

// ---------- the plan ----------

export function planDispatch(root, project, { file, now = new Date() } = {}) {
  const rel = file ?? LANE_FILE;
  const path = isAbsolute(rel) ? resolve(rel) : resolve(root, rel);
  let st = null;
  try { st = statSync(path); } catch { st = null; }
  if (!st || !st.isFile()) {
    refuse(`${tilde(path)} does not exist, so there is no lane plan to dispatch. The dispatch skill writes it (/workflow:dispatch, with the items), or write it by hand: a "Base commit: <sha>" line, then one "## Lane: <name>   branch: <branch>" heading per lane with its N numbered items under it (docs/CONTRACTS.md section 17). Nothing was created`);
  }
  if (st.size > MAX_PLAN_BYTES) {
    refuse(`${tilde(path)} is ${Math.ceil(st.size / 1024)} KB, over the ${Math.round(MAX_PLAN_BYTES / 1024)} KB dispatch reads. A lane plan is a page per lane; a file this size is something else. Nothing was created`);
  }
  const { lanes, problems } = parseLanes(readFileSync(path, "utf8"));
  if (!lanes.length) {
    refuse(`${tilde(path)} has no lane headings, so there is nothing to create. Each lane starts with a line like: ## Lane: reviews   branch: lane/reviews-0920   model: sonnet   context ceiling: 120000. Nothing was created`);
  }

  const laneRoot = laneRootOf(root, project);
  const inside = relative(root, laneRoot);
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
    refuse(`the lane root is ${tilde(laneRoot)}, which is inside this repository. A worktree inside the repository it branches from is committed by accident and makes git status unreadable; set dispatch.laneRoot in .skilliton/config.json to a folder beside it, for example ../${basename(root)}-lanes. Nothing was created`);
  }

  const head = commitOf(root, "HEAD");
  if (!head) {
    refuse(`this repository has no commits yet, so a lane has nothing to branch from. Make the first commit on ${project.integrationBranches[0]}, then run dispatch again. Nothing was created`);
  }
  const worktrees = registeredWorktrees(root);
  const seenName = new Map();
  const seenBranch = new Map();
  const resolvedBase = new Map();
  const planned = [];
  for (const lane of lanes) {
    if (seenName.has(lane.name)) problems.push(`${LANE_FILE}: the lane name ${lane.name} is used twice (lines ${seenName.get(lane.name)} and ${lane.line}); each lane needs its own folder under the lane root`);
    else seenName.set(lane.name, lane.line);
    if (lane.branch) {
      if (seenBranch.has(lane.branch)) problems.push(`${LANE_FILE}: the branch ${lane.branch} is used by two lanes (lines ${seenBranch.get(lane.branch)} and ${lane.line})`);
      else seenBranch.set(lane.branch, lane.line);
    }
    const dir = join(laneRoot, lane.name);
    let base = head;
    let baseFrom = `the checked-out HEAD, because ${LANE_FILE} names no base commit`;
    if (lane.base) {
      const key = lane.base.sha;
      if (!resolvedBase.has(key)) {
        const full = commitOf(root, key);
        resolvedBase.set(key, full);
        if (!full) problems.push(`${LANE_FILE} line ${lane.base.line}: the base commit ${key} is not in this repository. Fetch it, or write the commit this batch starts from: git rev-parse ${project.integrationBranches[0]}`);
      }
      base = resolvedBase.get(key) ?? key;
      baseFrom = `named in ${LANE_FILE} line ${lane.base.line}`;
    }
    if (lane.branch && branchExists(root, lane.branch)) {
      problems.push(`the branch ${lane.branch} already exists, so lane ${lane.name} (line ${lane.line}) would not be created from ${base.slice(0, 12)}. A finished batch leaves its branches behind: delete it with git branch -d ${lane.branch}, or give this lane a new branch and folder name`);
    }
    if (existsSync(dir)) {
      const registered = worktrees.find((w) => resolve(w.path) === resolve(dir));
      problems.push(registered
        ? `${tilde(dir)} is already a worktree of this repository${registered.branch ? ` on branch ${registered.branch}` : " (detached)"}, so lane ${lane.name} (line ${lane.line}) would not be created. Another window may be working in it: use a new lane name, or remove it with git worktree remove ${tilde(dir)}`
        : `${tilde(dir)} already exists and is not a worktree of this repository, so lane ${lane.name} (line ${lane.line}) would not be created. Move it aside, or give the lane another name`);
    } else {
      const registered = worktrees.find((w) => resolve(w.path) === resolve(dir));
      if (registered) problems.push(`Git still has ${tilde(dir)} registered as a worktree${registered.branch ? ` on branch ${registered.branch}` : ""} although the folder is gone; run git worktree prune, then dispatch again`);
    }
    planned.push({ ...lane, dir, briefPath: join(dir, BRIEF_FILE), base, baseFrom, command: ["git", "worktree", "add", dir, "-b", lane.branch ?? "<branch>", base] });
  }

  const ctx = {
    root,
    planRel: isAbsolute(rel) ? tilde(path) : rel,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    integrationBranch: project.integrationBranches[0],
    mainOnlyPaths: project.dispatch.mainOnlyPaths,
    laneSetup: project.dispatch.laneSetup,
    laneTestCommand: project.dispatch.laneTestCommand,
    mainOnlyChecks: project.dispatch.mainOnlyChecks,
    agent: laneAgent(),
  };
  for (const lane of planned) {
    lane.taskId = newId(`Lane ${lane.name}`, { date: now, fallback: "lane" });
    lane.taskRel = taskRel(project, lane.taskId);
    lane.taskPath = join(lane.dir, lane.taskRel);
    lane.task = problems.length ? "" : renderTask({
      id: lane.taskId,
      title: `Lane ${lane.name}`,
      state: "in-progress",
      branch: lane.branch,
      owner: "unassigned",
      updated: now.toISOString(),
      request: `${LANE_FILE}, dispatched ${ctx.date}: the items below are this lane's whole scope, and work that is not among them belongs to another lane.`,
      criteria: lane.items.map((i) => `${i.ref}. ${i.text}`),
    });
  }
  for (const lane of planned) lane.brief = problems.length ? "" : briefText(lane, ctx);

  return {
    planPath: path,
    planRel: ctx.planRel,
    laneRoot,
    laneRootExists: existsSync(laneRoot),
    head,
    lanes: planned,
    context: ctx,
    exclude: problems.length ? { path: null, add: [] } : excludePlan(root),
    problems,
  };
}

// ---------- writing ----------

export function applyDispatch(root, plan) {
  if (plan.problems.length) throw new OperationFailed("applyDispatch was called with a plan that has problems; nothing was created");
  const created = [];
  let laneRootCreated = false;
  if (!existsSync(plan.laneRoot)) {
    mkdirSync(plan.laneRoot, { recursive: true });
    laneRootCreated = true;
  }
  const soFar = () => (created.length ? `${created.length} lane(s) were created first: ${created.map((c) => `${c.name} (${tilde(c.dir)}, branch ${c.branch})`).join("; ")}. Remove one with: git worktree remove <folder> and git branch -D <branch>` : "No lane was created");
  for (const lane of plan.lanes) {
    const r = runGit(root, ["worktree", "add", lane.dir, "-b", lane.branch, lane.base], { timeoutMs: WORKTREE_TIMEOUT_MS });
    if (r.status !== 0) {
      throw new OperationFailed(`git worktree add failed for lane ${lane.name}: ${(r.stderr || r.stdout).trim().split("\n").pop() || `exit ${r.status}`}. ${soFar()}`);
    }
    try {
      writeFileSync(lane.briefPath, lane.brief, "utf8");
    } catch (e) {
      throw new OperationFailed(`lane ${lane.name} has a worktree at ${tilde(lane.dir)} but its brief could not be written (${e.code ?? "error"}). ${soFar()}`);
    }
    // The record is committed here, on the lane branch alone, rather than asked for in the brief: a lane's scope then
    // exists as a file whether or not the session that reads the brief obliges, and `dispatch merge` has something
    // deterministic to bring back. One commit on top of the base keeps the base an ancestor, which the brief checks.
    try {
      mkdirSync(dirname(lane.taskPath), { recursive: true });
      writeFileSync(lane.taskPath, lane.task, "utf8");
    } catch (e) {
      throw new OperationFailed(`lane ${lane.name} has a worktree and a brief at ${tilde(lane.dir)} but its task record could not be written (${e.code ?? "error"}). ${soFar()}`);
    }
    for (const args of [["add", "--", lane.taskRel], ["commit", "-q", "-m", `lane ${lane.name}: task record from ${LANE_FILE}`, "--", lane.taskRel]]) {
      const r = runGit(lane.dir, args, { timeoutMs: WORKTREE_TIMEOUT_MS });
      if (r.status !== 0) {
        throw new OperationFailed(`lane ${lane.name} has a worktree and a brief at ${tilde(lane.dir)}, but git ${args[0]} of its task record on ${lane.branch} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}. ${soFar()}`);
      }
    }
    created.push(lane);
  }
  const excluded = [];
  if (plan.exclude.add.length) {
    mkdirSync(dirname(plan.exclude.path), { recursive: true });
    const before = existsSync(plan.exclude.path) ? readFileSync(plan.exclude.path, "utf8") : "";
    appendFileSync(plan.exclude.path, `${before === "" || before.endsWith("\n") ? "" : "\n"}${plan.exclude.add.join("\n")}\n`, "utf8");
    excluded.push(...plan.exclude.add);
  }
  return { created, laneRootCreated, excluded };
}

// ---------- merging the lanes back ----------
//
// What comes back is each lane's own records: its task record, and the decision and lesson entries it proposed. The
// brief already tells a lane it may write those and nothing else shared, and the lane write guard in the guardrails
// plugin refuses the rest. Merge reads what is COMMITTED on the lane branch, never the lane's working tree, because
// the brief asks the lane to commit once per item and a half-written record is not a record.
//
// It writes into this working tree and commits nothing: the person reads the diff and decides. A record already here
// and different is a conflict, named and never overwritten.

const DONE_LINE = /^[ \t]*LANE DONE\b/m;
const MAX_REPORT_BYTES = 200000;

const under = (parent, child) => {
  const rel = relative(parent, resolve(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

function gitDirOf(root) {
  const r = runGit(root, ["rev-parse", "--git-dir"]);
  if (r.status !== 0) throw new OperationFailed(`git rev-parse --git-dir failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}; nothing was written`);
  const value = r.stdout.trim();
  return isAbsolute(value) ? value : resolve(root, value);
}

// The three record roles, in the order a reader expects them, without a duplicate if a project points two at one folder.
function recordDirs(project) {
  const dirs = [];
  for (const role of ["tasks", "decisions", "lessons"]) {
    const dir = project.directories?.[role];
    if (dir && !dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

function committedRecords(root, branch, dirs) {
  const r = runGit(root, ["ls-tree", "-r", "-z", "--name-only", branch, "--", ...dirs]);
  if (r.status !== 0) throw new OperationFailed(`git ls-tree failed for ${branch} (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}; nothing was written`);
  return r.stdout.split("\0").filter(Boolean).sort();
}

function committedText(root, branch, path) {
  const r = runGit(root, ["show", `${branch}:${path}`]);
  if (r.status !== 0) throw new OperationFailed(`git show ${branch}:${path} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}; nothing was written`);
  return r.stdout;
}

// Everything about one lane that does not need the other lanes: its branch, whether the worktree is clean, and
// whether it has written LANE DONE. None of it refuses; an unfinished lane is still read.
function readLane(root, worktree) {
  const dir = resolve(worktree.path);
  const lane = { name: basename(dir), dir, branch: worktree.branch, dirty: null, done: null, warnings: [], bring: 0, same: 0, conflict: 0 };
  if (!lane.branch) {
    lane.warnings.push(`lane ${lane.name} at ${tilde(dir)} has a detached HEAD, so there is no lane branch to read records from; check it out on its branch, or remove it with git worktree remove ${tilde(dir)}`);
    return lane;
  }
  if (!existsSync(dir)) {
    lane.warnings.push(`lane ${lane.name}: Git still has ${tilde(dir)} registered as a worktree on ${lane.branch} although the folder is gone. What is committed on the branch is still read; git worktree prune clears the registration`);
    return lane;
  }
  const st = runGit(dir, ["status", "--porcelain"]);
  if (st.status !== 0) {
    lane.warnings.push(`lane ${lane.name}: git status failed in ${tilde(dir)} (exit ${st.status}), so whether it has uncommitted work is unknown`);
  } else {
    lane.dirty = st.stdout.split(/\r?\n/).filter((l) => l.trim() !== "").length;
    if (lane.dirty) lane.warnings.push(`lane ${lane.name} has ${lane.dirty} uncommitted change${lane.dirty === 1 ? "" : "s"} in ${tilde(dir)}; a record that is not committed is not read here`);
  }
  const reportPath = join(dir, REPORT_FILE);
  let size = null;
  try { size = statSync(reportPath).size; } catch { size = null; }
  if (size === null) {
    lane.done = false;
    lane.warnings.push(`lane ${lane.name} has no ${REPORT_FILE} in ${tilde(dir)}, so it has not said what it did, what it skipped, or what to expect at merge`);
  } else if (size > MAX_REPORT_BYTES) {
    lane.done = null;
    lane.warnings.push(`lane ${lane.name}: ${REPORT_FILE} is ${Math.ceil(size / 1024)} KB, over the ${Math.round(MAX_REPORT_BYTES / 1024)} KB merge reads, so whether it ends with LANE DONE is unknown`);
  } else {
    let text = null;
    try { text = readFileSync(reportPath, "utf8"); } catch (e) {
      lane.warnings.push(`lane ${lane.name}: ${REPORT_FILE} could not be read (${e.code ?? "error"}), so whether it ends with LANE DONE is unknown`);
    }
    if (text !== null) {
      lane.done = DONE_LINE.test(text);
      if (!lane.done) lane.warnings.push(`lane ${lane.name}: ${REPORT_FILE} has no LANE DONE line, so the lane is not finished; what it has committed is still read`);
    }
  }
  return lane;
}

function classify(root, lane, path, claimed, branch) {
  const entry = { lane: lane.name, branch: lane.branch, path, content: committedText(root, lane.branch, path) };
  if (entry.content.includes("\0")) {
    lane.warnings.push(`lane ${lane.name}: ${path} is not text, so it was not brought back; merge carries records, and a binary file in a records folder belongs in a commit of its own`);
    return null;
  }
  const here = join(root, path);
  let mine = null;
  if (existsSync(here)) {
    try { mine = readFileSync(here, "utf8"); } catch (e) {
      lane.conflict++;
      return { ...entry, state: "conflict", why: `it is already at ${path} on ${branch} and could not be read there (${e.code ?? "error"})` };
    }
  }
  if (mine === entry.content) { lane.same++; return { ...entry, state: "same", why: `identical to the file already on ${branch}` }; }
  if (mine !== null) { lane.conflict++; return { ...entry, state: "conflict", why: `it is already on ${branch} and differs` }; }
  const twin = claimed.get(path);
  if (twin && twin.content !== entry.content) { lane.conflict++; return { ...entry, state: "conflict", why: `lane ${twin.lane} brings back the same path with different content` }; }
  if (twin) { lane.same++; return { ...entry, state: "same", why: `identical to the copy lane ${twin.lane} brings back` }; }
  lane.bring++;
  claimed.set(path, entry);
  return { ...entry, state: "bring", why: `not on ${branch}` };
}

export function planMerge(root, project) {
  if (gitDirOf(root) !== gitCommonDir(root)) {
    refuse(`${tilde(root)} is a linked worktree, and merge runs on the integration branch in the main checkout: a lane cannot bring its own records back to itself. Open the main checkout and run it there. Nothing was written`);
  }
  const laneRoot = laneRootOf(root, project);
  const dirs = recordDirs(project);
  const branch = readBranch(root) ?? "this detached HEAD";
  const lanes = registeredWorktrees(root).filter((w) => under(laneRoot, w.path)).map((w) => readLane(root, w));
  lanes.sort((a, b) => a.name.localeCompare(b.name));
  const claimed = new Map();
  const files = [];
  for (const lane of lanes) {
    if (!lane.branch || !existsSync(lane.dir)) continue;
    for (const path of committedRecords(root, lane.branch, dirs)) {
      const entry = classify(root, lane, path, claimed, branch);
      if (entry) files.push(entry);
    }
  }
  const of = (state) => files.filter((f) => f.state === state);
  return {
    laneRoot, laneRootExists: existsSync(laneRoot), dirs, branch, lanes,
    bring: of("bring"), same: of("same"), conflicts: of("conflict"),
    warnings: lanes.flatMap((l) => l.warnings),
  };
}

export function applyMerge(root, plan) {
  const written = [];
  const soFar = () => (written.length ? `${written.length} record${written.length === 1 ? " was" : "s were"} written first: ${written.join(", ")}` : "No record was written");
  for (const entry of plan.bring) {
    const target = join(root, entry.path);
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.content, "utf8");
    } catch (e) {
      throw new OperationFailed(`${entry.path} from lane ${entry.lane} could not be written (${e.code ?? "error"}). ${soFar()}`);
    }
    written.push(entry.path);
  }
  return { written };
}
