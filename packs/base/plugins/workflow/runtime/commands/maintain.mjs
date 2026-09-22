// commands/maintain.mjs: `skilliton maintain` (docs/CONTRACTS.md section 11). The engine is lib/maintain.mjs; this
// file parses arguments, prints one line per step, and maps outcomes to exit codes.

import { argPath, parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { OperationFailed, TransactionFailed, describeFailure, loadProject, resolveGitRoot } from "../lib/prepare.mjs";
import { runMaintain } from "../lib/maintain.mjs";

export const help = `maintain: the mechanical half of maintenance, in one command the stop hook can name.

  maintain [--dir <repo root>]           show what it would write; writes nothing
  maintain --apply [--dir <repo root>]   write it, on an integration branch only

It regenerates the decision, lesson and task indexes from their entry files (as index --apply does), refreshes the
security findings section of the backlog record when the project keeps a security register (as security findings
--apply does), and records a maintain event in the journal, which is what the stop hook measures the next
maintenance from: on an integration branch, a merge commit since the last maintenance, or a day and at least one
commit since it, makes the next stop hold the session until this command has run and the assistant has done the
judgment half (/workflow:maintain: decisions and lessons from the conversation, status and backlog reconciled, the
handoff). Text outside the managed markers is never changed. A repository that is not prepared, or a branch that is
not an integration branch, is refused with nothing written.

Exit codes: 0 complete; 2 refused, nothing written; 3 a write failed (the output says what was rolled back).`;

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["apply"], options: ["dir"] }, "maintain");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`maintain takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} maintain --help`);
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";
    const project = loadProject(root);
    if (project.layoutVersion === null) refuse(`${tilde(root)} is not prepared by Skilliton (no prepare.version in ${project.configRel}), so there are no records to maintain. Nothing was written. To prepare it: ${selfCommand()} prepare --apply${dirArg}`);
    const mode = o.apply ? "apply" : "preview";
    let result;
    try { result = await runMaintain(project, { root, gitDir: repo.gitDir, apply: Boolean(o.apply) }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      const failure = describeFailure("maintain", e);
      for (const line of failure.lines) console.error(line);
      return failure.exit;
    }
    if (result.refused) refuse(result.refused);
    say(`skilliton maintain (${mode}): ${tilde(root)} (branch ${result.branch}, an integration branch)`);
    say("");
    const width = Math.max(...result.steps.map((s) => s.name.length));
    for (const s of result.steps) say(`  ${s.status.padEnd(11)} ${s.name.padEnd(width)}  ${s.detail}`);
    say("");
    const pending = result.steps.filter((s) => s.status === "would write").length;
    const notRun = result.steps.filter((s) => s.status === "not run").length;
    const tail = notRun ? ` ${notRun} step(s) did not run and say why above.` : "";
    if (result.wrote) {
      say(`Summary: the mechanical half is done and recorded.${tail} What is left is the judgment half: decisions and lessons from the conversation as entry files, the status record and the backlog reconciled with what merged, and the handoff (${selfCommand()} checkpoint --handoff ...). /workflow:maintain has the steps.`);
    } else {
      say(`Summary: ${pending} step(s) would write; nothing written.${tail} To write them: ${selfCommand()} maintain --apply${dirArg}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skilliton maintain: operation failed: ${e.message}`); return 3; }
    throw e;
  }
}
