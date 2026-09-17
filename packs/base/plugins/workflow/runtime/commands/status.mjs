// status: where the project stands. Writes nothing. docs/CONTRACTS.md sections 9 to 11; the engine is lib/lifecycle.mjs.

import { Refused, parseArgs, refuse, say } from "../lib/core.mjs";
import { ConfigError } from "../lib/config.mjs";
import { GitError } from "../lib/journal.mjs";
import { OperationFailed, clip, gatherProjectState, guardCommand, openProject, reportExitCode, reportSummary, resultObject, statusLines } from "../lib/lifecycle.mjs";
import { TaskChangedError, TaskRecordError } from "../lib/tasks.mjs";

export const help = `status: where the project stands, one line per check. Writes nothing.

  status [--dir <project>] [--json]

Checks, in order:
  layout      the project layout version (prepare.version)
  migrations  pending layout migrations (from lib/migrations.mjs, when this build has it)
  versions    the installed workflow runtime version against prepare.requires
  records     which record files from the project's artifact map exist
  tasks       open task records, the current task (by branch), unreadable or ambiguous records
  handoff     whether the shared handoff's Written time is older than the latest commit or an uncommitted change
  sessions    whether a session recorded in this worktree's journal was interrupted
  security    security evidence counts (from lib/security.mjs, when this build has it)

Each line starts with OK, ATTENTION, NOTE, NOT RUN or FAILED. NOT RUN names a check this build or setup cannot make;
it is never counted as OK. --json prints exactly one JSON object (schema skilliton.result/1) and nothing else.

Exit codes: 0 nothing needs attention among the checks that ran; 1 something needs attention (a pending migration,
a required version not met, missing records, a stale handoff on an integration branch, an interrupted session with
uncommitted changes, unreadable or ambiguous task records, or security evidence that needs attention); 2 invalid
(a bad invocation, not a Git repository, or an unusable configuration); 3 a check could not be evaluated.`;

async function evaluate(argv) {
  const o = parseArgs(argv, { flags: ["json"], options: ["dir"] }, "status");
  if (o._.length) refuse(`status takes no plain arguments (got "${o._[0]}")`);
  const { root, project } = openProject(o.dir, { allowLegacy: true });
  const report = await gatherProjectState(root, { project });
  return { report, code: reportExitCode(report) };
}

export async function run(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { say(help); return 0; }
  if (!argv.includes("--json")) {
    return guardCommand("status", async () => {
      const { report, code } = await evaluate(argv);
      for (const line of statusLines(report)) say(line);
      return code;
    });
  }
  // --json: stdout carries exactly one object whatever happens, and the exit code matches its result.
  const emit = (code, summary, details) => {
    process.stdout.write(`${JSON.stringify(resultObject("status", code, summary, details), null, 2)}\n`);
    return code;
  };
  try {
    const { report, code } = await evaluate(argv);
    return emit(code, reportSummary(report), { root: report.root, git: report.git, checks: report.checks, ...report.data });
  } catch (e) {
    if (e instanceof Refused || e instanceof TaskRecordError || e instanceof TaskChangedError || (e instanceof ConfigError && e.kind !== "failed")) {
      return emit(2, `refused: ${clip(e.message, 500)}`, { error: e.message });
    }
    if (e instanceof GitError || e instanceof OperationFailed || e instanceof ConfigError || (typeof e?.code === "string" && /^E[A-Z]+$/.test(e.code))) {
      return emit(3, `operation failed: ${clip(e.message, 500)}`, { error: e.message });
    }
    return emit(3, `unexpected internal error: ${clip(e?.message ?? e, 500)}. This is a bug in skilliton.`, { error: String(e?.message ?? e) });
  }
}
