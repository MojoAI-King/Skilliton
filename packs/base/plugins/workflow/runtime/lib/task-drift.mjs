// task-drift.mjs: whether the work recorded on a task still matches the task's criteria (backlog B74). The stop
// hook's checkpoint reminder asks this on a stop it is already blocking, so it is said at most once per working tree
// state, exactly like the audit sentence, and it never blocks on its own. The growth note (a task past 15 checkpoints
// or a day old) is commands/checkpoint.mjs's; this one looks at what the work touched instead of how long it ran.
//
// The comparison is a plain word overlap, and that is its whole limit. A criterion's distinctive words are its words
// of four letters or more that are not common English or common development words and that appear in no more than
// half of the task's criteria (a word every criterion shares says nothing about which one the work is on). A
// criterion is traced when one of its distinctive words appears in a checkpoint of the task or in a path the task
// touched. A ticked criterion is never counted as untraced: it was done. The sentence is given only when at least two
// open criteria have no trace and the task holds at least five checkpoints, so a young task is never nudged.
//
// Touched paths: what the commits since the task's first checkpoint changed (else since its Updated time), from `git
// diff --name-only` against the last commit before that moment, plus the working tree as the stop hook already read
// it. The task record itself is left out, because every checkpoint changes it.

import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { clip } from "./lifecycle.mjs";
import { runGit } from "./journal.mjs";

const DRIFT_MIN_CHECKPOINTS = 5;
const DRIFT_MIN_UNTRACED = 2;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const COMMON = new Set(`about above after again also another anything because been before being below between both
change changed changes check checked checks could does done each either else every file files first from gets given
have into just keep kept later less line lines make makes many more most much must name named names need needs next
none only other over part same says should since some still such than that their them then there these they thing
this those through under until upon what when where whether which while will with within without work would your
item items test tests case cases note notes task tasks criteria criterion feature touch`.split(/\s+/));

// Lower case words of four letters or more, a plural "s" taken off so "hook" and "hooks" meet; numbers and the common
// words above are dropped.
function words(text) {
  const out = [];
  for (const raw of String(text ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    const w = raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (w.length >= 4 && !/^\d+$/.test(w) && !COMMON.has(w) && !COMMON.has(raw)) out.push(w);
  }
  return out;
}

// The comparison itself, on values already read. criteria: [{ done, text }]; checkpoints: the count; checkpointText:
// every checkpoint's text; touched: repository-relative paths. Returns null below the thresholds, else { untraced:
// [criterion text], folders: [top-level folders touched that no criterion names], criteria, checkpoints }.
const belowThresholds = (criteria, checkpoints) => !Array.isArray(criteria) || criteria.length < DRIFT_MIN_UNTRACED || !(checkpoints >= DRIFT_MIN_CHECKPOINTS);

export function assessDrift({ criteria, checkpoints, checkpointText, touched }) {
  if (belowThresholds(criteria, checkpoints)) return null;
  const sets = criteria.map((c) => new Set(words(c.text)));
  const shared = (w) => sets.filter((s) => s.has(w)).length * 2 > criteria.length;
  const distinctive = sets.map((s) => [...s].filter((w) => !shared(w)));
  const seen = new Set([...words(checkpointText), ...touched.flatMap((p) => words(p))]);
  const traced = (i) => distinctive[i].some((w) => seen.has(w));
  const untraced = criteria.filter((c, i) => !c.done && distinctive[i].length && !traced(i)).map((c) => c.text);
  const all = criteria.map((c) => c.text.toLowerCase()).join("\n");
  const top = new Set(touched.filter((p) => p.includes("/")).map((p) => p.split("/")[0]));
  const folders = [...top].filter((f) => !all.includes(f.toLowerCase())).sort();
  return { untraced, folders, criteria: criteria.length, checkpoints };
}

// Every line under the record's "## Checkpoints" heading, up to the next "## " heading.
function checkpointSection(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^## Checkpoints\s*$/.test(l.replace(/\r$/, "")));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

// Paths in `git status --porcelain=v1` text: the destination of a rename, quotes taken off.
const porcelainPaths = (porcelain) => (porcelain ?? "").split("\n").filter((l) => l.length > 3)
  .map((l) => l.slice(3).split(" -> ").pop().replace(/^"(.*)"$/, "$1"));

function committedSince(dir, since) {
  const before = runGit(dir, ["rev-list", "-1", `--before=${since}`, "HEAD"]);
  if (before.status !== 0) return []; // no commit at all yet, so nothing was committed since
  const diff = runGit(dir, ["diff", "--name-only", "-z", before.stdout.trim() || EMPTY_TREE, "HEAD"]);
  if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr.trim().split("\n")[0]}`);
  return diff.stdout.split("\0").filter(Boolean);
}

// The comparison for the stop hook's current task: null when the task is below the thresholds (nothing is read then),
// { result } when it ran, { problem } when it could not.
export function taskDrift(task, state) {
  if (!task?.file || belowThresholds(task.criteria, task.checkpoints)) return null;
  try {
    const since = Number.isFinite(Date.parse(task.firstCheckpointAt)) ? task.firstCheckpointAt : task.updated;
    const own = basename(task.file);
    const paths = new Set([...committedSince(dirname(task.file), since), ...porcelainPaths(state?.porcelain)]);
    const touched = [...paths].filter((p) => basename(p) !== own);
    const checkpointText = checkpointSection(readFileSync(task.file, "utf8"));
    return { result: assessDrift({ criteria: task.criteria, checkpoints: task.checkpoints, checkpointText, touched }) };
  } catch (e) {
    return { problem: clip(e?.message ?? String(e), 200) };
  }
}

// The one sentence for the stop reason, or null. The split is offered as a command, never done.
export function driftSentence(drift, command) {
  const r = drift?.result;
  if (r && r.untraced.length >= DRIFT_MIN_UNTRACED) {
    const shown = r.untraced.slice(0, 3).map((t) => `"${clip(t, 80)}"`).join(", ");
    const more = r.untraced.length > 3 ? `, and ${r.untraced.length - 3} more` : "";
    const folders = r.folders.length ? `, while the work touched ${r.folders.slice(0, 5).join(", ")}, which no criterion names` : "";
    const split = `${command} task start "<title for the untraced criteria>" --criteria "<each untraced criterion>" --branch <its own branch> --apply`;
    return `Drift check: ${r.untraced.length} of this task's ${r.criteria} criteria have no trace in its ${r.checkpoints} checkpoints or in the files `
      + `changed since the first one (${shown}${more})${folders}. If those criteria are a separate piece of work, split them off into a task of `
      + `their own by running: ${split}. This is a note and not a block.`;
  }
  if (drift?.problem) return `Whether this task's work still matches its criteria is unknown: the drift check did not run (${drift.problem}).`;
  return null;
}
