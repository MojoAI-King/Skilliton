// commands/index.mjs: `skillgate index` (docs/CONTRACTS.md section 11). The engine is lib/records.mjs
// regenerateIndexes; this file parses arguments, shows each section's change, and writes only with --apply.

import { argPath, forDisplay, parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { OperationFailed, TransactionFailed, describeFailure, loadProject, resolveGitRoot } from "../lib/prepare.mjs";
import { regenerateIndexes } from "../lib/records.mjs";

export const help = `index: regenerate the decision, lesson and open-task indexes from their entry files.

  index [--dir <repo root>]           show the change to each index; writes nothing
  index --apply [--dir <repo root>]   write the indexes (on an integration branch only)

Each index is a managed section between two marker lines:
  <!-- skillgate:index:decisions:start --> ... <!-- skillgate:index:decisions:end -->   in the decisions record
  <!-- skillgate:index:lessons:start --> ... <!-- skillgate:index:lessons:end -->       in the lessons record
  <!-- skillgate:index:tasks:start --> ... <!-- skillgate:index:tasks:end -->           in the status record (open tasks)
A record without the markers gets its section appended after a blank line. Text outside the markers is never
changed. Each list is sorted by ID and built from the entry files alone, so every clone with the same entries writes
the same bytes, and running index again after a merge resolves a conflict inside a section.

Indexes are shared records, so --apply writes only on an integration branch (prepare.integrationBranches; by default
main and master). Entries recorded on other branches are listed after they are merged.

Exit codes: 0 complete; 1 an entry file could not be indexed as it is (each one is named); 2 refused, nothing
written; 3 operation failed.`;

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["apply"], options: ["dir"] }, "index");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`index takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} index --help`);
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";
    const project = loadProject(root);
    const mode = o.apply ? "apply" : "preview";
    let plan;
    try { plan = regenerateIndexes(project, { apply: Boolean(o.apply), gitDir: repo.gitDir }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      const failure = describeFailure("index", e);
      for (const line of failure.lines) console.error(line);
      return failure.exit;
    }
    const written = plan.result !== null;
    say(`skillgate index (${mode}): ${tilde(root)} (${plan.branch === null ? "detached HEAD" : `branch ${plan.branch}`}${plan.integration ? ", an integration branch" : ", not an integration branch"})`);
    say("");
    const width = Math.max(...plan.sections.map((s) => s.record.length));
    for (const s of plan.sections) {
      const listed = s.kind === "tasks" ? `${s.count} open task(s) of ${s.total} in ${s.dir}/` : `${s.count} ${s.kind === "decisions" ? "decision" : "lesson"} entr${s.count === 1 ? "y" : "ies"} in ${s.dir}/`;
      const change = !s.changed ? "already current" : s.hadSection ? "section rewritten" : "section appended after a blank line (the record had no markers)";
      const verb = !s.changed ? "current" : written ? "updated" : "update";
      say(`  ${verb.padEnd(8)} ${s.record.padEnd(width)}  ${s.kind} index: ${listed}; ${change}`);
    }
    const diffs = plan.sections.filter((s) => s.changed).map((s) => unifiedDiff(forDisplay(s.before.toString("latin1")), forDisplay(s.after.toString("latin1")), `a/${s.record}`, `b/${s.record}`)).join("");
    if (diffs) { say(""); process.stdout.write(diffs); }
    if (plan.problems.length) {
      say("");
      for (const p of plan.problems) say(`Problem: ${p}`);
    }
    const pending = plan.sections.filter((s) => s.changed).length;
    say("");
    if (written) say(`Backups of the records this run changed: ${tilde(plan.result.backupDir)} (inside the Git folder, never committed).`);
    const problems = plan.problems.length ? ` ${plan.problems.length} entry file(s) need attention (listed above).` : "";
    if (written) say(`Summary: ${pending} index section(s) written.${problems}`);
    else if (!pending) say(`Summary: every index is current; nothing written.${problems}`);
    else if (!plan.integration) say(`Summary: ${pending} index section(s) would change; nothing written. --apply writes indexes only on an integration branch (${project.integrationBranches.join(", ")}).${problems}`);
    else say(`Summary: ${pending} index section(s) would change; nothing written. To write them: ${selfCommand()} index --apply${dirArg}${problems}`);
    return plan.problems.length ? 1 : 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skillgate: index could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skillgate.mjs
  }
}
