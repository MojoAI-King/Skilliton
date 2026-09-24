// commands/gate.mjs: `skilliton gate` (docs/CONTRACTS.md section 6). The engine is lib/gate.mjs; this file parses
// arguments and prints the verdict. It never prints the run's output on success, and on failure only its tail.

import { parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { DEFAULT_LABEL, DEFAULT_TAIL, DEFAULT_TIMEOUT_SECONDS, LABEL_RE, MAX_TAIL, MAX_TIMEOUT_SECONDS, describe, planGate, runGate } from "../lib/gate.mjs";
import { OperationFailed, resolveGitRoot } from "../lib/prepare.mjs";

export const help = `gate: run the project's checks and return a verdict, not a transcript.

  gate [--dir <repo root>]                 run the delivery policy's checks (.skilliton/delivery.json), else npm run verify
  gate --cmd "<command>"                   run one command through the shell instead
  gate --policy                            run the delivery policy's checks and refuse if there is no policy
  gate --label <name>                      name the log (default ${DEFAULT_LABEL}); letters, digits, . _ -
  gate --tail <lines>                      lines shown on failure (default ${DEFAULT_TAIL}, at most ${MAX_TAIL})
  gate --timeout <seconds>                 stop a check after this long (default ${DEFAULT_TIMEOUT_SECONDS}, at most ${MAX_TIMEOUT_SECONDS}); a policy
                                           check keeps its own timeout when that is shorter

The full output of every run goes to .git/skilliton/gate/<label>.log inside the repository (in a linked worktree,
under its own .git/worktrees/<name>/ folder; folder 0700, file 0600, never committed). What is printed: the verdict from the exit status, the tree it ran on (commit, branch and any
uncommitted files, because a green on a changed tree is about that tree and not about a commit), and on failure the
last lines of the failing run. On failure only, the verdict adds what it can measure without guessing about the
machine: the untracked files present when the run started, the tracked files already changed against HEAD, and the
one-minute load average with the CPU count (not measured on Windows), because a failure in a file outside those
lists may come from the machine or another session, not the change. It also names the files the failing check's output
mentions that Git tracks and that are outside the change (what differs from the merge base with the integration
branch, and the working tree), and the other node processes running when the gate started (the count and the first
three, each by its program and script file only, since a command line can carry a token; not measured on Windows).
Checks run in the policy's order and stop at the first failure. The checks run with this shell's environment; the
shared branch's delivery gate is the one that isolates.

Exit codes: 0 every run passed; 1 a run failed, timed out or was killed (the verdict says which); 2 refused, nothing
run; 3 the gate itself could not run (the log could not be written, git could not be started).`;

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["policy"], options: ["dir", "cmd", "label", "tail", "timeout"] }, "gate");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`gate takes no plain arguments (got "${o._[0]}"); the command goes after --cmd, in quotes. See: ${selfCommand()} gate --help`);
    const label = o.label ?? DEFAULT_LABEL;
    if (!LABEL_RE.test(label)) refuse(`--label must be 1 to 64 characters of letters, digits, dots, underscores or hyphens, starting with a letter or digit (got ${JSON.stringify(label)})`);
    const whole = (name, value, fallback, max) => {
      if (value === undefined) return fallback;
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) refuse(`--${name} must be a whole number from 1 to ${max} (got ${JSON.stringify(value)})`);
      return Number(value);
    };
    const tailLines = whole("tail", o.tail, DEFAULT_TAIL, MAX_TAIL);
    const timeoutSeconds = whole("timeout", o.timeout, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const plan = planGate(repo.root, { cmd: o.cmd ?? null, policy: Boolean(o.policy), timeoutSeconds });
    let outcome;
    try { outcome = await runGate(plan, { root: repo.root, gitDir: repo.gitDir, label, tailLines }); } catch (e) {
      if (e && typeof e.code === "string") throw new OperationFailed(`the gate log could not be written (${e.code}: ${e.message})`);
      throw e;
    }
    const { results, where, startTree, machine, competing, outside } = outcome;
    const failed = results.find((r) => !r.ok) ?? null;
    const passed = results.filter((r) => r.ok);
    const seconds = results.reduce((a, r) => a + r.seconds, 0);
    const skipped = plan.runs.length - results.length;
    if (!failed) say(`skilliton gate (${label}): PASS: ${plan.kind === "policy" ? `${results.length} check(s) passed (${results.map((r) => r.name).join(", ")})` : `${results[0].name} exit 0`} in ${seconds}s, from ${plan.source}`);
    else say(`skilliton gate (${label}): FAIL: ${plan.kind === "policy" ? `check "${failed.name}" ` : ""}${describe(failed)} after ${failed.seconds}s${passed.length ? ` (${passed.length} passed first: ${passed.map((r) => r.name).join(", ")})` : ""}${skipped ? `; ${skipped} later check(s) not run` : ""}, from ${plan.source}`);
    if (where) {
      const tree = `${where.shortHead ?? "no commits yet"}${where.branch ? ` on ${where.branch}` : " (detached HEAD)"}`;
      const dirty = where.dirty.length
        ? `${where.dirty.length} uncommitted file(s), so this verdict is about this tree and not about a commit: ${where.dirty.slice(0, 8).join(", ")}${where.dirty.length > 8 ? `, and ${where.dirty.length - 8} more (in the log)` : ""}`
        : "clean";
      say(`  tree: ${tree}, ${dirty}`);
    } else say("  tree: not recorded (git could not describe this folder)");
    if (failed && failed.tail.length) {
      say(`  --- last ${failed.tail.length} line(s) of ${JSON.stringify(failed.name)} ---`);
      for (const line of failed.tail) say(`  ${line}`);
    }
    say(`  log: ${tilde(outcome.log)}`);
    if (failed) {
      const more = (list) => (list.length > 5 ? `, and ${list.length - 5} more (in the log)` : "");
      const listed = (list) => (list.length ? `${list.length} (${list.slice(0, 5).join(", ")}${more(list)})` : "0");
      if (startTree) {
        say(`  untracked when the run started: ${listed(startTree.untracked)}`);
        say(`  tracked file(s) changed against HEAD: ${listed(startTree.trackedChanged)}`);
      } else say("  untracked / tracked-changed: not recorded (git could not describe this folder)");
      say(machine.measured
        ? `  load average (1m): ${machine.loadavg1.toFixed(2)} across ${machine.cpuCount} CPU(s)`
        : `  load average (1m): not measured on ${machine.reason}`);
      say("  a failure in a file outside these lists may come from the machine or another session, not the change");
      for (const line of contextLines(outside, competing, listed)) say(`  ${line}`);
    }
    return failed ? 1 : 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skilliton: gate could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skilliton.mjs
  }
}

// The two lines that separate the change from the machine on a failing verdict.
function contextLines(outside, competing, listed) {
  const files = outside.measured
    ? `failing files outside your change: ${listed(outside.files)}; the change is what differs from ${outside.against}`
    : `failing files outside your change: not measured (${outside.reason})`;
  const processes = competing.measured
    ? `competing processes: ${competing.count} other node process(es) running at the start${competing.first.length ? `: ${competing.first.join("; ")}` : ""}`
    : `competing processes: ${competing.reason}`;
  return [files, processes];
}
