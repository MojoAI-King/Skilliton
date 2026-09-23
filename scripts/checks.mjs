#!/usr/bin/env node
// checks.mjs: run the repository's checks locally, one step at a time, from the list CI runs.
//
// The list lives in one place, .github/workflows/checks.yml; this runner reads the `name` and `run` of every step
// there rather than carrying a second copy that would drift (docs/BACKLOG.md B43 is about exactly that drift).
// Each step runs on its own, its whole output goes to a log under .git/skilliton/checks/, and one verdict line
// reaches the terminal, so a run reads as results rather than a transcript.
//
//   node scripts/checks.mjs                 run every step; exit 0 when all pass, 1 when one fails, 2 when it cannot run
//   node scripts/checks.mjs --list          print the steps and run nothing
//   node scripts/checks.mjs --only <text>   run only the steps whose name contains <text>
//
// Two kinds of step are skipped and say so: the one that checks the CI machine's tools, and the security
// collectors, which write records into the working tree that a checkout would then carry untracked (docs/MAINTAIN.md
// step 2 says why they are a CI step only). An `npm install` line is dropped, and `claude` runs the client the session was
// started with when CLAUDE_CODE_EXECPATH is set, because this machine may carry more than one install.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(REPO, ".github", "workflows", "checks.yml");
// In a linked worktree `.git` is a file that points at the real Git folder, so the log folder is found by asking git,
// which answers with that worktree's own folder; a checkout git cannot read falls back to `.git`.
const gitDir = spawnSync("git", ["-C", REPO, "rev-parse", "--absolute-git-dir"], { encoding: "utf8" });
const LOG_DIR = join(gitDir.status === 0 && gitDir.stdout.trim() ? gitDir.stdout.trim() : join(REPO, ".git"), "skilliton", "checks");

// The steps of the one job in checks.yml: [{ name, run }]. A `run: |` block keeps its lines in order.
export function readSteps(text) {
  const lines = text.split(/\r?\n/);
  const steps = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const name = /^\s+- name:\s*(.+?)\s*$/.exec(line);
    if (name) { current = { name: name[1], run: null }; steps.push(current); continue; }
    const run = /^(\s+)run:\s*(.*?)\s*$/.exec(line);
    if (run && current) {
      if (run[2] === "|" || run[2] === "|-") {
        const block = [];
        const indent = run[1].length;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (l.trim() === "") { block.push(""); continue; }
          if (l.search(/\S/) <= indent) break;
          block.push(l.slice(indent + 2));
        }
        current.run = block.join("\n").trim();
      } else current.run = run[2];
    }
  }
  return steps.filter((s) => s.run !== null);
}

function skipReason(step) {
  if (/^Tools the hooks need$/.test(step.name)) return "installs tools on the CI machine";
  if (/security collect/.test(step.run)) return "writes records into the working tree; a CI step only (docs/MAINTAIN.md step 2)";
  return null;
}

// An install line is CI's; here the client is the one the session runs (CLAUDE_CODE_EXECPATH) or whatever `claude`
// resolves to on PATH, and the log's first lines say which.
function localCommand(run) {
  const client = process.env.CLAUDE_CODE_EXECPATH;
  const withoutInstalls = run.split("\n").filter((l) => !/^\s*npm install\b/.test(l)).join("\n");
  return client ? withoutInstalls.replace(/(^|\n|;\s*|&&\s*|\bdo\s+)claude(?=\s)/g, `$1"${client}"`) : withoutInstalls;
}

function main(argv) {
  if (!existsSync(WORKFLOW)) { console.log(`checks NOT RUN: ${WORKFLOW} does not exist`); return 2; }
  const steps = readSteps(readFileSync(WORKFLOW, "utf8"));
  if (!steps.length) { console.log("checks NOT RUN: no steps with a run line were found in checks.yml"); return 2; }
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  const chosen = only ? steps.filter((s) => s.name.includes(only)) : steps;
  if (argv.includes("--list")) {
    for (const s of steps) console.log(`${skipReason(s) ? "skip " : "run  "}${s.name}`);
    console.log(`${steps.length} steps in checks.yml, ${steps.filter((s) => !skipReason(s)).length} run here`);
    return 0;
  }
  if (!chosen.length) { console.log(`checks NOT RUN: no step name contains "${only}"`); return 2; }
  mkdirSync(LOG_DIR, { recursive: true });
  // CI's scratch folder variable, so a step that writes under $RUNNER_TEMP has somewhere to write here too.
  const env = { ...process.env, RUNNER_TEMP: process.env.RUNNER_TEMP || mkdtempSync(join(tmpdir(), "skilliton-checks-")) };
  let pass = 0, fail = 0, skipped = 0, n = 0;
  const failed = [];
  console.log(`checks: ${chosen.length} step(s) from .github/workflows/checks.yml, logs under .git/skilliton/checks/`);
  for (const step of chosen) {
    n++;
    const reason = skipReason(step);
    if (reason) { skipped++; console.log(`${String(n).padStart(2)} SKIP ${step.name}: ${reason}`); continue; }
    const started = Date.now();
    // A plain shell, not a login shell: profile files would change the environment the preflight tests control.
    const r = spawnSync("bash", ["-c", localCommand(step.run)], { cwd: REPO, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const log = join(LOG_DIR, `${String(n).padStart(2, "0")}-${step.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.log`);
    writeFileSync(log, `# ${step.name}\n# ${step.run}\n# exit ${r.status}\n\n${r.stdout ?? ""}${r.stderr ?? ""}`);
    if (r.status === 0) { pass++; console.log(`${String(n).padStart(2)} PASS ${step.name} (${seconds}s)`); }
    else { fail++; failed.push(step.name); console.log(`${String(n).padStart(2)} FAIL ${step.name} exit ${r.status} (${seconds}s), log: ${log}`); }
  }
  console.log(`checks: ${pass} pass, ${fail} fail, ${skipped} skipped, of ${chosen.length}`);
  for (const name of failed) console.log(`  failed: ${name}`);
  return fail ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
