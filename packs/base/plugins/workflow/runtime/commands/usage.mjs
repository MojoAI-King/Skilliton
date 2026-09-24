// commands/usage.mjs: `skilliton usage` (docs/CONTRACTS.md section 6). The reading is lib/usage.mjs and the pricing
// is the meter (the plugin's own, or the project's when it speaks the contract); this file parses arguments, gathers
// the batch boundaries (maintain events, closed tasks, merge commits), and prints the scorecard.

import { parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import {
  DEFAULT_LIMIT, MAX_LIMIT, RECONSTRUCTION_NOTE, batchRows, collectBoundaries, describeUsage, findMeter, foldScopes, localTime, meterTz,
  meterWindow, proveMeter, usageScope,
} from "../lib/usage.mjs";
import { OperationFailed, loadProject, resolveGitRoot } from "../lib/prepare.mjs";
import {
  LEDGER_REL, appendLedgerRow, comparisonLines, describeSummary, ledgerDisplayRows, ledgerLinkProblem, meterTrend, readLedger, screenRow, screenTrend,
  taskStarts,
  taskTimes,
} from "../lib/usage-ledger.mjs";
import { countEvents } from "../meter/events.mjs";
import { listTasks, taskRel } from "../lib/tasks.mjs";

export const help = `usage: what this machine's own transcripts say the work cost, one row per batch.

  usage [--dir <repo root>]            every batch on the current branch, newest ${DEFAULT_LIMIT} rows
  usage --since <rev>                  only the batches that ended after <rev> was committed
  usage --limit <n>                    how many rows to keep, newest first (at most ${MAX_LIMIT})
  usage --project <key>[,<key>]        project folders whose name holds one of these (a substring, for a person)
  usage --all-projects                 every project on this machine
  usage --meter <path>                 the meter to use instead of the default (see below)
  usage --ledger-only                  the committed ledger rows only; reads no transcript, so another machine can run it
  usage --json                         the same rows as one JSON object

  usage screen --five-hour <n> --weekly <n> [--model-weekly <n>] [--at <time>] [--apply]
      files what the usage screen shows (whole numbers from 0 to 100) as a screen row in the ledger; --at is when it
      was read, and defaults to now. Without --apply it shows the row and writes nothing.
  usage summary [--baseline <YYYY-MM-DD>..<YYYY-MM-DD>]
      this period (since the last screen reading, else the last seven days) against a baseline: the window given
      (the one docs/USAGE_BASELINE.md records, once the owner has chosen it), else the earliest committed ledger rows,
      as many as this period has. Tokens and estimated cost, time per closed task, gate runs, refused reads and
      compactions, the two latest screen readings, any controlled comparison filed under evidence/comparison/, and a
      verdict that says saved only when the meter's tokens per batch and the screen's readings both went down, and
      "not established" when they disagree or a reading is missing. It never states an amount saved.

It reads nothing itself. The meter does the reading and the pricing, and its own test is run first, in this run: a
number from a meter whose test has not just passed is not printed here. The meter is the one this plugin ships
(runtime/meter/token-cost.mjs), unless the project has its own scripts/token-cost.mjs with its test beside it that
speaks the same contract; one that does not is named, with what it lacked, and the plugin's meter is used instead.

By default the reading covers this repository's own transcript folder and each of its lane worktrees' folders (the
worktrees under dispatch.laneRoot), matched exactly by the folder name Claude Code gives a path, never as a substring,
so another project whose name starts the same way is not counted. The scorecard's second line says which scope was used.

A batch ends at a boundary: a maintain event in this machine's journal, a task record closed as merged, done-local,
released or verified (at its Updated time), or a merge commit. A row runs from the instant the previous row ended to
the last boundary it names, and the meter is asked for exactly that span, so the rows tile time: nothing is counted
twice and nothing is left out. Boundaries inside the same minute are one row naming all of them. A repository that
only fast-forwards still gets rows, from its closed tasks and its maintenance.

The rows the ledger holds (.skilliton/usage/ledger.jsonl, one batch row appended by each maintain --apply, committed
with the maintenance) come first, marked committed or not yet committed; after them the live tail, the batches since
the ledger's last row, read from the transcripts now. A ledger row stores token counts only: its cost is worked out
when it is shown, from the meter's price table, whose retrieval date the scorecard names.

${RECONSTRUCTION_NOTE}

Exit codes: 0 every row complete; 1 a row the meter could not price in full; 2 refused, nothing written; 3 it could
not run.`;

// The repository, once its ledger path is known to be a file inside it: a linked ledger is refused before anything
// reads or writes it (lib/usage-ledger.mjs ledgerLinkProblem).
function ledgerRepo(dir) {
  const repo = resolveGitRoot(resolveExistingDir(dir, "--dir"));
  const linked = ledgerLinkProblem(repo.root);
  if (linked) refuse(`${linked}. Remove it, or replace it with the file itself, and run again. Nothing was written.`);
  return repo;
}

function parseUsageArgs(argv) {
  const o = parseArgs(argv, { flags: ["json", "all-projects", "ledger-only"], options: ["dir", "meter", "project", "since", "limit"] }, "usage");
  if (o.help) return o;
  if (o._.length) refuse(`usage takes no plain arguments except screen or summary first (got "${o._[0]}"). See: ${selfCommand()} usage --help`);
  o.limitValue = o.limit === undefined ? DEFAULT_LIMIT : Number(o.limit);
  if (!Number.isInteger(o.limitValue) || o.limitValue < 1 || o.limitValue > MAX_LIMIT) {
    refuse(`--limit takes a whole number from 1 to ${MAX_LIMIT} (got "${o.limit}"). Nothing was written.`);
  }
  o.projects = (o.project ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (o.projects.length && o["all-projects"]) {
    refuse("--project narrows the reading and --all-projects widens it to everything; give one of them. Nothing was written.");
  }
  // --since reaches git as an argument, so what is not obviously a revision is refused here rather than passed on
  // to see what happens. The first character must be a letter or digit, which is what keeps it from arriving as an
  // option; after that HEAD~1, origin/main, v1.2.3 and the rest are all ordinary.
  if (o.since !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/.test(o.since)) {
    refuse(`--since takes a branch, tag or commit (got ${JSON.stringify(o.since)}). Nothing was written.`);
  }
  return o;
}

function printJson(meter, proof, tz, scope, rows) {
  const strip = (list) => list.map(({ ms, ...rest }) => rest);
  say(JSON.stringify({
    meter: meter ? { path: meter.path, test: meter.test, proved: proof.summary } : null,
    tz,
    scope: { kind: scope.kind, describe: scope.describe },
    reconstruction: RECONSTRUCTION_NOTE,
    rows: rows.map((r) => ({
      from: r.from, to: r.to, source: r.source, tasks: strip(r.tasks),
      merges: strip(r.merges).map(({ sha, at, subject }) => ({ sha, at, subject })), maintains: strip(r.maintains), ...r.folded,
    })),
  }, null, 2));
}

const newest = (rows, limit) => (rows.length > limit ? rows.slice(rows.length - limit) : rows);

// The rows to print: the ledger's first (they hold the default scope, so a narrower or wider reading, or --since, reads
// the transcripts alone), then the live tail after the ledger's last row, read from the transcripts now.
function readRows(o, root, project, scope, { keep = () => true } = {}) {
  const useLedger = scope.kind === "repository" && !o.since;
  if (o["ledger-only"] && !useLedger) {
    refuse("--ledger-only reads the committed ledger, which holds this repository's default scope, so it does not combine with --project, "
      + "--all-projects or --since. Nothing was written.");
  }
  const ledger = useLedger ? ledgerDisplayRows(root).rows : [];
  if (o["ledger-only"]) return { rows: newest(ledger.filter((r) => r.source === "ledger-committed"), o.limitValue), found: null, meter: null, proof: null };
  const meter = findMeter(root, o.meter ?? null);
  if (meter.notice && !o.json) say(`note: ${meter.notice}`);
  const found = collectBoundaries(root, project, { since: o.since ?? null });
  // keep narrows the live rows before the meter reads them: the summary needs only the ones in its period.
  const live = batchRows(found.boundaries, { since: ledger.at(-1)?.to ?? found.sinceAt }).filter(keep).map((r) => ({ ...r, source: "live" }));
  const rows = newest([...ledger, ...live], o.limitValue);
  const proof = proveMeter(meter);
  for (const row of rows) if (row.source === "live") row.folded = foldScopes(meterWindow(meter, { since: row.from, until: row.to, scope }));
  return { rows, found, meter, proof };
}

function printScorecard(o, root, tz, scope, { rows, found, meter, proof }) {
  const c = found?.counts;
  const what = c ? ` from ${c.merges} merge(s), ${c.tasks} closed task(s) and ${c.maintains} maintain event(s)` : " (committed ledger rows only)";
  say(`skilliton usage in ${tilde(root)}: ${rows.length} batch row(s)${what}${o.since ? ` after ${o.since}` : ""}`);
  const shown = meter ? { path: tilde(meter.path), test: tilde(meter.test) } : null;
  for (const l of describeUsage({ rows, tz, meter: shown, proof, scope })) say(l);
  for (const n of found?.notes ?? []) say(`note: ${n}`);
}

// ---------- usage screen ----------

function screenCommand(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["dir", "five-hour", "weekly", "model-weekly", "at"] }, "usage screen");
  if (o.help) { say(help); return 0; }
  if (o._.length) refuse(`usage screen takes no plain arguments (got "${o._[0]}"). See: ${selfCommand()} usage --help`);
  const made = screenRow({ five_hour: o["five-hour"], weekly: o.weekly, model_weekly: o["model-weekly"], at: o.at });
  if (made.problem) refuse(`${made.problem}. Nothing was written.`);
  const repo = ledgerRepo(o.dir);
  const r = made.row;
  const reading = `five-hour ${r.five_hour} of 100, weekly ${r.weekly} of 100${r.model_weekly === null ? "" : `, model weekly ${r.model_weekly} of 100`}`;
  if (o.apply !== true) {
    say(`skilliton usage screen (preview): would add the reading read at ${r.at} (${reading}) to ${LEDGER_REL}. Nothing was written.`);
    say("To write it, run the same command with --apply.");
  } else {
    const done = appendLedgerRow(repo.root, r);
    if (!done.written) refuse(done.refused);
    say(`skilliton usage screen: added the reading read at ${r.at} (${reading}) to ${LEDGER_REL}; commit it with the rest of the work.`);
  }
  say("");
  say(RECONSTRUCTION_NOTE);
  return 0;
}

// ---------- usage summary ----------

const DAY_RANGE_RE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

// The baseline rows and the words that say where they came from.
function baselineOf(o, read, periodRows, meterContext) {
  if (o.baseline !== undefined) {
    const m = DAY_RANGE_RE.exec(o.baseline);
    if (!m || m[1] > m[2]) {
      refuse(`--baseline takes <YYYY-MM-DD>..<YYYY-MM-DD>, the earlier day first (got ${JSON.stringify(o.baseline)}). Nothing was written.`);
    }
    const [days, tz] = [{ from: m[1], to: m[2] }, meterContext.tz];
    const rows = batchRows(read.found.boundaries).filter((r) => {
      const day = localTime(r.to, tz).slice(0, 10);
      return day >= days.from && day <= days.to;
    });
    for (const row of rows) row.folded = foldScopes(meterWindow(read.meter, { since: row.from, until: row.to, days, scope: meterContext.scope }));
    return { rows, label: `${days.from}..${days.to} in ${tz}, the window given with --baseline (${rows.length} batch(es) ended in it)` };
  }
  const before = read.rows.filter((r) => r.source === "ledger-committed" && Date.parse(r.to) <= meterContext.sinceMs);
  const rows = before.slice(0, periodRows.length);
  return { rows, label: `the earliest ${rows.length} committed ledger row(s) before this period, the same count as this period has where the ledger allows` };
}

async function summaryCommand(argv) {
  const o = parseArgs(argv, { flags: [], options: ["dir", "baseline", "meter"] }, "usage summary");
  if (o.help) { say(help); return 0; }
  if (o._.length) refuse(`usage summary takes no plain arguments (got "${o._[0]}"). See: ${selfCommand()} usage --help`);
  const repo = ledgerRepo(o.dir);
  const tz = meterTz();
  const project = loadProject(repo.root);
  const scope = usageScope(repo.root, project);
  const screens = readLedger(repo.root).rows.filter((r) => r.kind === "screen").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const untilMs = Date.now();
  const sinceMs = screens.length ? Date.parse(screens.at(-1).at) : untilMs - 7 * 24 * 3600000;
  const inPeriod = (r) => Date.parse(r.to) > sinceMs && Date.parse(r.to) <= untilMs;
  const read = readRows({ ...o, limitValue: MAX_LIMIT, json: false }, repo.root, project, scope, { keep: inPeriod });
  const periodRows = read.rows.filter(inPeriod);
  const baseline = baselineOf(o, read, periodRows, { tz, scope, sinceMs });
  const listed = listTasks(project, { all: true });
  const tasks = taskTimes(listed.tasks, taskStarts(repo.root, project), (id) => taskRel(project, id), { sinceMs, untilMs });
  const events = await countEvents(scope.dirs, { sinceMs, untilMs });
  const since = screens.length ? "the last usage screen reading" : "seven days ago, because no usage screen reading is filed";
  const periodLabel = `${localTime(new Date(sinceMs).toISOString(), tz)}..${localTime(new Date(untilMs).toISOString(), tz)} in ${tz}, since ${since}`;
  say(`skilliton usage summary in ${tilde(repo.root)} (${scope.describe})`);
  const meter = meterTrend(periodRows, baseline.rows);
  const lines = describeSummary({
    periodLabel, baselineLabel: baseline.label, meter, screen: screenTrend(screens), tasks, events, comparison: comparisonLines(repo.root), tz,
  });
  for (const l of lines) say(l);
  return 0;
}

export async function run(argv) {
  try {
    if (argv[0] === "screen") return screenCommand(argv.slice(1));
    if (argv[0] === "summary") return await summaryCommand(argv.slice(1));
    const o = parseUsageArgs(argv);
    if (o.help) { say(help); return 0; }
    const repo = ledgerRepo(o.dir);
    const tz = meterTz();
    const project = loadProject(repo.root);
    const scope = usageScope(repo.root, project, { projects: o.projects, all: o["all-projects"] === true });
    const read = readRows(o, repo.root, project, scope);
    const incomplete = read.rows.filter((r) => r.folded.incomplete).length;
    if (o.json) printJson(read.meter, read.proof, tz, scope, read.rows);
    else {
      printScorecard(o, repo.root, tz, scope, read);
      if (incomplete) say(`${incomplete} row(s) marked INCOMPLETE above: the meter could not price part of that window, so those rows are not quotable.`);
    }
    return incomplete ? 1 : 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skilliton: usage could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skilliton.mjs
  }
}
