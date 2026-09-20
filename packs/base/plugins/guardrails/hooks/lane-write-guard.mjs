#!/usr/bin/env node
// lane-write-guard.mjs: PreToolUse hook on the file-writing tools. Inside a lane worktree it refuses a
// write to a path the project reserves for its integration branch (dispatch.mainOnlyPaths), because
// every lane would edit the same lines of the same shared record and the merge would be one conflict
// per lane. The lane's own records are the exception, and not as a convenience: docs/ is the first
// main-only path in a prepared project, and the lane brief tells the lane to write its task record and
// to propose decision and lesson entries, which are one file each under the entry folders. Refusing
// those would refuse the work the brief asks for.
//
// The limit that matters, stated here because an unstated limit in a guard is worse than no guard: it
// sees the assistant's own file-writing tool calls. It does not and cannot intercept a script writing
// through Bash, so it bounds the assistant, not the worktree. Each refusal says so, and so does
// docs/CONTRACTS.md.
//
// It fails open on anything unexpected: a payload it does not recognize, a folder that is not a
// repository, the main checkout, a repository with no Skilliton configuration, a path outside the
// repository. A guard that blocks work on input it did not expect is worse than no guard.
//
// A lane is a linked worktree, which git marks by making .git a FILE holding "gitdir: <path>" pointing
// inside <common git folder>/worktrees/. The main checkout has .git as a directory, so it is never a
// lane, and neither is a submodule (its .git file points at <common>/modules/).
//
// Input (Claude Code hooks reference, PreToolUse): JSON on stdin with tool_name and tool_input. Write,
// Edit and MultiEdit take file_path; NotebookEdit takes notebook_path. Output: nothing to let the write
// go ahead, or hookSpecificOutput.permissionDecision "deny" with permissionDecisionReason. Registered
// in hooks/hooks.json under PreToolUse with a matcher naming each of the four tools, rather than a
// shorter pattern that would depend on how a client matches part of a name.

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// The same defaults the runtime uses (lib/config.mjs DISPATCH_DEFAULTS and DIRECTORY_DEFAULTS). They
// apply only to a project that HAS a configuration file: no file at all means this is not a prepared
// project and the guard stays out of the way.
const DEFAULT_MAIN_ONLY = ["docs/", "DECISIONS.md"];
const DEFAULT_DIRECTORIES = { tasks: "docs/tasks", decisions: "docs/decisions", lessons: "docs/lessons" };
const REPORT_FILE = "LANE_REPORT.md";

const tidy = (p) => String(p).replace(/^\.\//, "").replace(/\/+$/, "");
// "docs/" covers docs and everything under it; "DECISIONS.md" covers that one file. A prefix never
// matches half a name, so docs/ does not cover docsite/README.md.
const covers = (entry, rel) => { const e = tidy(entry); return e !== "" && (rel === e || rel.startsWith(`${e}/`)); };

// The repository root is the nearest folder up from the file that has a .git, whether file or folder.
function findRoot(from) {
  let dir = from;
  for (;;) {
    const dotGit = join(dir, ".git");
    let st = null;
    try { st = statSync(dotGit); } catch { st = null; }
    if (st) return { root: dir, dotGit, linked: !st.isDirectory() };
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// null when this is not a linked worktree. Otherwise the branch it is on, or null when it is detached
// or HEAD cannot be read: a lane with no readable branch is still a lane.
function laneOf(root, dotGit) {
  let text;
  try { text = readFileSync(dotGit, "utf8"); } catch { return null; }
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(text);
  if (!m) return null;
  const gitdir = isAbsolute(m[1]) ? m[1] : resolve(root, m[1]);
  if (!/(^|[\\/])worktrees[\\/]/.test(gitdir)) return null;
  let head;
  try { head = readFileSync(join(gitdir, "HEAD"), "utf8"); } catch { return { branch: null }; }
  const ref = /^ref:\s*refs\/heads\/(.+?)\s*$/m.exec(head);
  return { branch: ref ? ref[1] : null };
}

function readConfig(root) {
  let value;
  try { value = JSON.parse(readFileSync(join(root, ".skilliton", "config.json"), "utf8")); } catch { return null; }
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

const stringList = (v, fallback) =>
  Array.isArray(v) ? v.filter((e) => typeof e === "string" && e.trim() !== "") : fallback;

function entryDirs(config) {
  const set = config?.prepare?.directories;
  return ["tasks", "decisions", "lessons"].map((role) => {
    const v = set && typeof set === "object" && !Array.isArray(set) ? set[role] : null;
    return tidy(typeof v === "string" && v.trim() !== "" ? v.trim() : DEFAULT_DIRECTORIES[role]);
  });
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  if (!payload || typeof payload !== "object" || !TOOLS.has(payload.tool_name)) return;
  const input = payload.tool_input;
  if (!input || typeof input !== "object") return;
  const named = typeof input.file_path === "string" && input.file_path ? input.file_path
    : typeof input.notebook_path === "string" && input.notebook_path ? input.notebook_path
      : null;
  if (!named) return;
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const file = isAbsolute(named) ? resolve(named) : resolve(cwd, named);

  const found = findRoot(dirname(file));
  if (!found || !found.linked) return;             // not a repository, or the main checkout
  const lane = laneOf(found.root, found.dotGit);
  if (!lane) return;                               // a .git file that is not a linked worktree
  const config = readConfig(found.root);
  if (!config) return;                             // not a prepared project: nothing is reserved

  const rel = relative(found.root, file).split(sep).join("/");
  if (!rel || rel === ".." || rel.startsWith("../")) return;   // outside the repository
  const mainOnly = stringList(config.dispatch?.mainOnlyPaths, DEFAULT_MAIN_ONLY);
  if (!mainOnly.some((entry) => covers(entry, rel))) return;
  // The lane's own records: one file per entry, which is what the entry folders are for. The README a
  // prepared project writes into each folder is shared prose, not a record, so it stays reserved.
  if (entryDirs(config).some((dir) => rel.startsWith(`${dir}/`)) && basename(rel) !== "README.md") return;

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `guardrails lane write guard: ${rel} is reserved for the integration branch (dispatch.mainOnlyPaths in .skilliton/config.json), and this worktree is a lane${lane.branch ? ` on ${lane.branch}` : ""}. Every lane would edit the same lines and the merge would be one conflict per lane. Put what you were going to write in ${REPORT_FILE} under "Merge-time expectations"; if it is a decision or a lesson, propose it as its own entry file with skilliton record, which the lane may write. This guard sees the assistant's own file-writing tool calls and cannot see a script writing through Bash.`,
    },
  })}\n`);
});
