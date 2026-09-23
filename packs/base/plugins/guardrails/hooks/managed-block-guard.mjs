#!/usr/bin/env node
// managed-block-guard.mjs: PreToolUse hook on Write, Edit and MultiEdit. In a prepared project it refuses a write
// that would take the managed Skilliton block out of CLAUDE.md or AGENTS.md (the lines between the harness start
// and end markers, docs/CONTRACTS.md section 4), because that block is how the project's working rules reach the
// assistant, and losing it is the failure the rest of Skilliton cannot see: a session with no block runs with no
// rules and says nothing about it. It is the file-writing half of the persistence rule (B61); guard-bash.sh holds
// the shell half (rm, rmdir, mv and git rm), and both are turned off by the same setting, guardrails.protectRecords.
//
// It computes what the file would hold after the call: the content of a Write, or the current file with each edit
// applied. When the current file carries both markers and the result would carry fewer, the write is refused. A
// write that changes text inside the block is allowed (doctor reports the drift, and harness --apply restores it),
// and so is any write to any other file.
//
// The limit that matters, stated here because an unstated limit in a guard is worse than no guard: it sees the
// assistant's own file-writing tool calls. It does not and cannot intercept a script writing through Bash, so it
// bounds the assistant, not the checkout. Each refusal says so, and so does docs/CONTRACTS.md.
//
// It fails open on anything unexpected: a payload it does not recognize, a file that is not one of the two, a folder
// that is not a repository, a repository with no Skilliton configuration, a file with no block, an edit whose
// old_string does not occur (the client refuses that edit itself), or a file that cannot be read.
//
// It also guards the file the rules come from (N30, 2026-09-22). guard-bash.sh reads its settings from
// .skilliton/config.json (or the earlier .skillgate/config.json) in the working tree, so an assistant that could write
// "blockForcePush": false there could turn the rule off and then run the command. A Write, Edit or MultiEdit of that
// file is refused when its result turns a guardrails key from true (or absent) to false, or takes a name out of
// protectedBranches; turning a rule off is a person's decision, made in their own editor or terminal. This half is not
// switched off by protectRecords, because a setting that could switch off the guard on its own setting guards nothing.
// A result that is not JSON is judged by its text, since the Bash guard's readers differ in what they accept. The shell
// half (a redirection, tee, cp, or a node -e naming the file) is in guard-bash.sh, which asks.
//
// Input (Claude Code hooks reference, PreToolUse): JSON on stdin with tool_name and tool_input. Write carries
// file_path and content; Edit carries file_path, old_string, new_string and replace_all; MultiEdit carries file_path
// and edits, a list of the same three fields. Output: nothing to let the write go ahead, or hookSpecificOutput with
// permissionDecision "deny" and permissionDecisionReason.

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const INSTRUCTION_NAMES = new Set(["claude.md", "agents.md"]); // compared in lower case
const START_MARKER = "<!-- skilliton:harness:start";
const END_MARKER = "<!-- skilliton:harness:end";
const CONFIG_FILE = join(".skilliton", "config.json");
const SETTINGS_DIRS = new Set([".skilliton", ".skillgate"]);
const RULE_KEYS = ["blockForcePush", "blockNoVerify", "blockSecretFiles", "protectRecords"];
const DEFAULT_BRANCHES = ["main", "master"];
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The rules a settings text leaves off and the branches it protects, read the way guard-bash.sh reads them: only a
// JSON false turns a rule off, and protectedBranches replaces the defaults only when it is a list. branches is null
// when the text is not JSON and so the list cannot be known; off is then every key the text sets to false.
function settingsOf(text, unreadableIsDefault) {
  if (text === null) return { off: new Set(), branches: DEFAULT_BRANCHES };
  let value;
  try { value = JSON.parse(text); } catch {
    if (unreadableIsDefault) return { off: new Set(), branches: DEFAULT_BRANCHES };
    return { off: new Set(RULE_KEYS.filter((k) => new RegExp(`"${k}"\\s*:\\s*false`).test(text))), branches: null };
  }
  const g = isObject(value) && isObject(value.guardrails) ? value.guardrails : {};
  return {
    off: new Set(RULE_KEYS.filter((k) => g[k] === false)),
    branches: Array.isArray(g.protectedBranches) ? g.protectedBranches.filter((b) => typeof b === "string") : DEFAULT_BRANCHES,
  };
}

// The reason to refuse a write of the settings file, or "" when the write keeps every rule and every protected branch.
function settingsRefusal(tool, input, file) {
  let current = null;
  try { current = readFileSync(file, "utf8"); } catch { current = null; }
  const after = resultOf(tool, input, current ?? "");
  if (after === null) return "";
  const before = settingsOf(current, true);
  const next = settingsOf(after, false);
  const turnedOff = [...next.off].filter((k) => !before.off.has(k));
  const dropped = next.branches === null ? [] : before.branches.filter((b) => !next.branches.includes(b));
  if (turnedOff.length === 0 && dropped.length === 0) return "";
  const what = [
    ...turnedOff.map((k) => `set "${k}" to false`),
    ...(dropped.length ? [`take ${dropped.join(", ")} out of protectedBranches`] : []),
  ].join(" and ");
  return `guardrails settings guard: this ${tool} would ${what} in ${file}, the file the guardrails read their settings from. Turning a rule off or unprotecting a branch is a person's decision: they make that change in their own editor or terminal, not the assistant. Leave the setting as it is and say what you need and why. This guard sees the assistant's own file-writing tool calls; a shell command that writes the file asks for confirmation through the Bash guard.`;
}

// The repository root is the nearest folder up from the file that has a .git, whether file (a linked worktree) or folder.
function findRoot(from) {
  let dir = from;
  for (;;) {
    let found = false;
    try { statSync(join(dir, ".git")); found = true; } catch { found = false; }
    if (found) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// The project's configuration object, or null when this is not a prepared project (no file) or it cannot be read.
function readConfig(root) {
  let text;
  try { text = readFileSync(join(root, CONFIG_FILE), "utf8"); } catch { return null; }
  try { const value = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

const hasBlock = (text) => text.includes(START_MARKER) && text.includes(END_MARKER);

// What the file would hold after the call, or null when that cannot be known.
function resultOf(tool, input, current) {
  if (tool === "Write") return typeof input.content === "string" ? input.content : null;
  const edits = tool === "Edit" ? [input] : Array.isArray(input.edits) ? input.edits : null;
  if (!edits) return null;
  let text = current;
  for (const edit of edits) {
    if (!edit || typeof edit !== "object" || typeof edit.old_string !== "string" || typeof edit.new_string !== "string") return null;
    if (edit.old_string === "" || !text.includes(edit.old_string)) return null;
    text = edit.replace_all === true ? text.split(edit.old_string).join(edit.new_string) : text.replace(edit.old_string, () => edit.new_string);
  }
  return text;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  if (!payload || typeof payload !== "object" || !TOOLS.has(payload.tool_name)) return;
  const input = payload.tool_input;
  if (!input || typeof input !== "object" || typeof input.file_path !== "string" || !input.file_path) return;
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const file = isAbsolute(input.file_path) ? resolve(input.file_path) : resolve(cwd, input.file_path);
  // Letter case is folded: on a case-insensitive disk (macOS, Windows) .Skilliton/Config.json and claude.md are the
  // same files as .skilliton/config.json and CLAUDE.md. On a case-sensitive one the fold refuses a little more.
  if (basename(file).toLowerCase() === "config.json" && SETTINGS_DIRS.has(basename(dirname(file)).toLowerCase())) {
    const reason = settingsRefusal(payload.tool_name, input, file);
    if (reason) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`);
    return;
  }
  if (!INSTRUCTION_NAMES.has(basename(input.file_path).toLowerCase())) return;

  const root = findRoot(dirname(file));
  if (!root) return;                                            // not a repository
  const rel = relative(root, file).split(sep).join("/");
  if (!INSTRUCTION_NAMES.has(rel.toLowerCase())) return;        // an instruction file elsewhere than the root
  const config = readConfig(root);
  if (!config) return;                                          // not a prepared project: nothing is managed
  const guardrails = config.guardrails && typeof config.guardrails === "object" && !Array.isArray(config.guardrails) ? config.guardrails : {};
  if (guardrails.protectRecords === false) return;              // the team turned the rule off
  let current;
  try { current = readFileSync(file, "utf8"); } catch { return; }
  if (!hasBlock(current)) return;                               // no block to lose
  const after = resultOf(payload.tool_name, input, current);
  if (after === null || hasBlock(after)) return;

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `guardrails managed block guard: this ${payload.tool_name} would take the managed Skilliton block out of ${rel} (the lines from ${START_MARKER} to ${END_MARKER}), which is how the project's working rules reach every session. Edit outside the markers, or change the block in the company's template and apply it with skilliton harness --apply. The one route that removes the block is skilliton remove --apply, run by a person; a team lead turns this rule off with "protectRecords": false under guardrails in .skilliton/config.json. This guard sees the assistant's own file-writing tool calls and cannot see a script writing through Bash.`,
    },
  })}\n`);
});
