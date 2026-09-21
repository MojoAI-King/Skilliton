// commands/usage.mjs: `skilliton usage` (docs/CONTRACTS.md section 6). The reading is lib/usage.mjs and the pricing
// is the project's own meter; this file parses arguments, asks git which batches merged, and prints the scorecard.

import { parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { DEFAULT_LIMIT, MAX_LIMIT, RECONSTRUCTION_NOTE, batchRows, describeUsage, findMeter, foldScopes, meterTz, meterWindow, parseMerges, proveMeter } from "../lib/usage.mjs";
import { gitFor } from "../lib/audit-run.mjs";
import { OperationFailed, resolveGitRoot } from "../lib/prepare.mjs";

export const help = `usage: what this machine's own transcripts say the work cost, one row per batch that merged.

  usage [--dir <repo root>]            every merge on the current branch, newest ${DEFAULT_LIMIT} rows
  usage --since <rev>                  only the merges after <rev>
  usage --limit <n>                    how many rows to keep, newest first (at most ${MAX_LIMIT})
  usage --project <key>[,<key>]        only these project folders, passed to the meter as it takes them
  usage --meter <path>                 the meter to use, when it is not scripts/token-cost.mjs
  usage --json                         the same rows as one JSON object

It reads nothing itself. The project's meter does the reading and the pricing, and its own test is run first, in this
run: a number from a meter whose test has not just passed is not printed here.

A window is whole days, in the timezone the meter buckets by, because that is the finest the meter can tell apart. A
row runs from the day after the previous batch merged through the day this one merged, so the rows tile the calendar:
no day is counted twice and none is left out. Two merges on one day are one row naming both.

${RECONSTRUCTION_NOTE}

Exit codes: 0 every row complete; 1 a row the meter could not price in full; 2 refused, nothing written; 3 it could
not run.`;

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["json"], options: ["dir", "meter", "project", "since", "limit"] }, "usage");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`usage takes no plain arguments (got "${o._[0]}"). See: ${selfCommand()} usage --help`);

    const limit = o.limit === undefined ? DEFAULT_LIMIT : Number(o.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) refuse(`--limit takes a whole number from 1 to ${MAX_LIMIT} (got "${o.limit}"). Nothing was written.`);
    const projects = (o.project ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    // --since reaches git as an argument, so what is not obviously a revision is refused here rather than passed on
    // to see what happens. The first character must be a letter or digit, which is what keeps it from arriving as an
    // option; after that HEAD~1, origin/main, v1.2.3 and the rest are all ordinary.
    if (o.since !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/.test(o.since)) refuse(`--since takes a branch, tag or commit (got ${JSON.stringify(o.since)}). Nothing was written.`);

    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const meter = findMeter(repo.root, o.meter ?? null);
    const tz = meterTz();
    const git = gitFor(repo.root);

    // %x00 between the fields, so a merge subject carrying anything at all cannot be read as a field boundary.
    const range = o.since ? [`${o.since}..HEAD`] : [];
    const log = git(["log", "--merges", "--format=%H%x00%cI%x00%s", ...range]);
    const merges = parseMerges(log.stdout.toString("utf8"));
    const rows = batchRows(merges, tz, { limit });

    const proof = proveMeter(meter);
    for (const row of rows) row.folded = foldScopes(meterWindow(meter, { from: row.from, to: row.to, projects }));

    const incomplete = rows.filter((r) => r.folded.incomplete).length;
    if (o.json) {
      say(JSON.stringify({
        meter: { path: meter.path, test: meter.test, proved: proof.summary },
        tz,
        projects,
        reconstruction: RECONSTRUCTION_NOTE,
        rows: rows.map((r) => ({ from: r.from, to: r.to, merges: r.merges.map((m) => ({ sha: m.sha, at: m.at, subject: m.subject })), ...r.folded })),
      }, null, 2));
    } else {
      say(`skilliton usage in ${tilde(repo.root)}: ${rows.length} batch row(s) from ${merges.length} merge(s)${o.since ? ` after ${o.since}` : ""}`);
      for (const l of describeUsage({ rows, tz, meter: { path: tilde(meter.path), test: tilde(meter.test) }, proof, projects })) say(l);
      if (incomplete) say(`${incomplete} row(s) marked INCOMPLETE above: the meter could not price part of that window, so those rows are not quotable.`);
    }
    return incomplete ? 1 : 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skilliton: usage could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skilliton.mjs
  }
}
