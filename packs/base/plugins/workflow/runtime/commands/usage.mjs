// commands/usage.mjs: `skilliton usage` (docs/CONTRACTS.md section 6). The reading is lib/usage.mjs and the pricing
// is the meter (the plugin's own, or the project's when it speaks the contract); this file parses arguments, gathers
// the batch boundaries (maintain events, closed tasks, merge commits), and prints the scorecard.

import { parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import {
  DEFAULT_LIMIT, MAX_LIMIT, RECONSTRUCTION_NOTE, batchBoundaries, batchRows, describeUsage, findMeter, foldScopes, meterTz, meterWindow,
  parseMerges, proveMeter,
} from "../lib/usage.mjs";
import { gitFor } from "../lib/audit-run.mjs";
import { readJournal } from "../lib/journal.mjs";
import { listTasks } from "../lib/tasks.mjs";
import { OperationFailed, loadProject, resolveGitRoot } from "../lib/prepare.mjs";

export const help = `usage: what this machine's own transcripts say the work cost, one row per batch.

  usage [--dir <repo root>]            every batch on the current branch, newest ${DEFAULT_LIMIT} rows
  usage --since <rev>                  only the batches that ended after <rev> was committed
  usage --limit <n>                    how many rows to keep, newest first (at most ${MAX_LIMIT})
  usage --project <key>[,<key>]        only these project folders, passed to the meter as it takes them
  usage --meter <path>                 the meter to use instead of the default (see below)
  usage --json                         the same rows as one JSON object

It reads nothing itself. The meter does the reading and the pricing, and its own test is run first, in this run: a
number from a meter whose test has not just passed is not printed here. The meter is the one this plugin ships
(runtime/meter/token-cost.mjs), unless the project has its own scripts/token-cost.mjs with its test beside it that
speaks the same contract; one that does not is named, with what it lacked, and the plugin's meter is used instead.

A batch ends at a boundary: a maintain event in this machine's journal, a task record closed as merged, done-local,
released or verified (at its Updated time), or a merge commit. A row runs from the instant the previous row ended to
the last boundary it names, and the meter is asked for exactly that span, so the rows tile time: nothing is counted
twice and nothing is left out. Boundaries inside the same minute are one row naming all of them. A repository that
only fast-forwards still gets rows, from its closed tasks and its maintenance.

${RECONSTRUCTION_NOTE}

Exit codes: 0 every row complete; 1 a row the meter could not price in full; 2 refused, nothing written; 3 it could
not run.`;

function parseUsageArgs(argv) {
  const o = parseArgs(argv, { flags: ["json"], options: ["dir", "meter", "project", "since", "limit"] }, "usage");
  if (o.help) return o;
  if (o._.length) refuse(`usage takes no plain arguments (got "${o._[0]}"). See: ${selfCommand()} usage --help`);
  o.limitValue = o.limit === undefined ? DEFAULT_LIMIT : Number(o.limit);
  if (!Number.isInteger(o.limitValue) || o.limitValue < 1 || o.limitValue > MAX_LIMIT) {
    refuse(`--limit takes a whole number from 1 to ${MAX_LIMIT} (got "${o.limit}"). Nothing was written.`);
  }
  o.projects = (o.project ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  // --since reaches git as an argument, so what is not obviously a revision is refused here rather than passed on
  // to see what happens. The first character must be a letter or digit, which is what keeps it from arriving as an
  // option; after that HEAD~1, origin/main, v1.2.3 and the rest are all ordinary.
  if (o.since !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/.test(o.since)) {
    refuse(`--since takes a branch, tag or commit (got ${JSON.stringify(o.since)}). Nothing was written.`);
  }
  return o;
}

// The three sources of a boundary. The journal and the task folder may be missing, and each says so rather than
// reading as "nothing happened".
function gatherBoundaries(root, since) {
  const git = gitFor(root);
  // %x00 between the fields, so a merge subject carrying anything at all cannot be read as a field boundary.
  const range = since ? [`${since}..HEAD`] : [];
  const merges = parseMerges(git(["log", "--merges", "--format=%H%x00%cI%x00%s", ...range]).stdout.toString("utf8"));
  const sinceAt = since ? git(["log", "-1", "--format=%cI", since]).stdout.toString("utf8").trim() : null;
  const journal = readJournal(root);
  const listed = listTasks(loadProject(root), { all: true });
  const notes = [];
  if (!journal.exists) notes.push("no journal on this machine, so no maintain event bounds a batch here");
  if (journal.corrupt) notes.push(`${journal.corrupt} line(s) of the journal could not be read and bound nothing`);
  for (const u of listed.unreadable) notes.push(`task record ${u.file} could not be read (${u.reason}) and bounds nothing`);
  const boundaries = batchBoundaries({ maintains: journal.events, tasks: listed.tasks, merges });
  const count = (kind) => boundaries.filter((b) => b.kind === kind && (!sinceAt || b.ms > Date.parse(sinceAt))).length;
  return { boundaries, sinceAt, notes, counts: { merges: count("merge"), tasks: count("task"), maintains: count("maintain") } };
}

function printJson(meter, proof, tz, projects, rows) {
  const strip = (list) => list.map(({ ms, ...rest }) => rest);
  say(JSON.stringify({
    meter: { path: meter.path, test: meter.test, proved: proof.summary },
    tz,
    projects,
    reconstruction: RECONSTRUCTION_NOTE,
    rows: rows.map((r) => ({
      from: r.from, to: r.to, tasks: strip(r.tasks), merges: strip(r.merges).map(({ sha, at, subject }) => ({ sha, at, subject })),
      maintains: strip(r.maintains), ...r.folded,
    })),
  }, null, 2));
}

export async function run(argv) {
  try {
    const o = parseUsageArgs(argv);
    if (o.help) { say(help); return 0; }
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const meter = findMeter(repo.root, o.meter ?? null);
    if (meter.notice && !o.json) say(`note: ${meter.notice}`);
    const tz = meterTz();
    const found = gatherBoundaries(repo.root, o.since);
    const rows = batchRows(found.boundaries, { limit: o.limitValue, since: found.sinceAt });

    const proof = proveMeter(meter);
    for (const row of rows) row.folded = foldScopes(meterWindow(meter, { since: row.from, until: row.to, projects: o.projects }));

    const incomplete = rows.filter((r) => r.folded.incomplete).length;
    if (o.json) printJson(meter, proof, tz, o.projects, rows);
    else {
      const c = found.counts;
      say(`skilliton usage in ${tilde(repo.root)}: ${rows.length} batch row(s) from ${c.merges} merge(s), ${c.tasks} closed task(s) and `
        + `${c.maintains} maintain event(s)${o.since ? ` after ${o.since}` : ""}`);
      for (const l of describeUsage({ rows, tz, meter: { path: tilde(meter.path), test: tilde(meter.test) }, proof, projects: o.projects })) say(l);
      for (const n of found.notes) say(`note: ${n}`);
      if (incomplete) say(`${incomplete} row(s) marked INCOMPLETE above: the meter could not price part of that window, so those rows are not quotable.`);
    }
    return incomplete ? 1 : 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skilliton: usage could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skilliton.mjs
  }
}
