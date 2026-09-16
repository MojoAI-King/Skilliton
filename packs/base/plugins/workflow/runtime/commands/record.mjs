// commands/record.mjs: `skillgate record decision|lesson "<title>"` (docs/CONTRACTS.md section 11). The engine is
// lib/records.mjs createEntry; this file parses arguments, shows the entry, and writes it only with --apply.

import { argPath, parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { OperationFailed, TransactionFailed, describeFailure, loadProject, resolveGitRoot } from "../lib/prepare.mjs";
import { ENTRY_KINDS, createEntry } from "../lib/records.mjs";

export const help = `record: create a decision or lesson entry with a collision-free ID.

  record decision "<title>" [--dir <repo root>]           show the entry that would be created; writes nothing
  record decision "<title>" --apply [--dir <repo root>]   write it
  record lesson "<title>" [--apply] [--dir <repo root>]   the same for a lesson

The entry is one new file in the decisions or lessons folder (prepare.directories; by default docs/decisions and
docs/lessons), named <id>.md with the ID YYYY-MM-DD-<slug>-<four random hex digits>: the local date, up to 40
lowercase letters, digits and hyphens from the title, and a random suffix. Entries written on different branches never
compete for a sequential number; the same title on the same day on two branches gets the same file name only when the
random suffixes also match (1 chance in 65,536), which Git then shows as a conflict rather than an overwrite.

A decision entry has the sections Decision, Why, Alternatives rejected, Risk, Reversibility and Evidence; a lesson
entry has What broke, The mechanism, The fix, The rule and What now enforces it. Each starts as "not yet written".
The status is "proposed" on a branch that is not an integration branch (prepare.integrationBranches; by default
main and master) or with a detached HEAD, otherwise "accepted".

record does not change the indexes: run "index --apply" on an integration branch to list new entries.

Exit codes: 0 complete; 2 refused, nothing written; 3 operation failed.`;

const shellQuote = (text) => (/^[A-Za-z0-9_./:,+=@%-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`);

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["apply"], options: ["dir"] }, "record");
    if (o.help) { say(help); return 0; }
    const [kind, title, ...extra] = o._;
    if (!kind) refuse(`record needs a kind and a title, for example: ${selfCommand()} record decision "Keep orders in PostgreSQL"`);
    if (!Object.hasOwn(ENTRY_KINDS, kind)) refuse(`record makes "decision" or "lesson" entries, not "${kind}"`);
    if (title === undefined) refuse(`record ${kind} needs a title, for example: ${selfCommand()} record ${kind} "Keep orders in PostgreSQL"`);
    if (extra.length) refuse(`record ${kind} takes one title; put the whole title in quotes (got ${o._.length - 1} separate words)`);
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";
    const project = loadProject(root);
    const mode = o.apply ? "apply" : "preview";
    let entry;
    try { entry = createEntry(project, kind, title, { apply: Boolean(o.apply), gitDir: repo.gitDir }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      const failure = describeFailure(`record ${kind}`, e);
      for (const line of failure.lines) console.error(line);
      return failure.exit;
    }
    const why = entry.integration ? `${entry.branch} is an integration branch` : entry.branch === null ? "HEAD is detached, so this is not an integration branch" : `${entry.branch} is not an integration branch (${project.integrationBranches.join(", ")})`;
    say(`skillgate record ${kind} (${mode}): ${tilde(root)}`);
    say(`${entry.written ? "Created" : "Would create"} ${entry.path} with the status ${entry.status} (${why}).`);
    if (!entry.written) {
      say("");
      say(entry.text.trimEnd());
      say("");
      say(`Summary: nothing written. The last four characters of the ID are random and are chosen again when the entry is written: ${selfCommand()} record ${kind} ${shellQuote(entry.title)} --apply${dirArg}`);
      return 0;
    }
    const record = kind === "decision" ? project.artifacts.decisions : project.artifacts.lessons;
    say(`Summary: ${kind} entry ${entry.id} written. Fill in each section in plain language. ${entry.integration ? `To list it in ${record}: ${selfCommand()} index --apply${dirArg}` : `The integrating session lists it in ${record} after merging (index runs on an integration branch).`}`);
    return 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skillgate: record could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skillgate.mjs
  }
}
