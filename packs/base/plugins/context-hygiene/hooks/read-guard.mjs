#!/usr/bin/env node
// read-guard.mjs: PreToolUse hook on Read. Refuses a whole-file read of a non-image file larger than the limit
// (50KB unless SKILLITON_READ_LIMIT_KB says otherwise), with a reason the model sees, so the session reads a
// range, searches the file, or summarizes it with a script instead. A ranged read (one that passes `limit`) is
// never refused; an image or a PDF is never refused, because they cannot be read in ranges.
//
// Why a hook and not a rule in the instructions: the instructions already say it, and the largest single
// cache-write events in the measured transcripts were still whole-file reads. A refusal with the reason in it
// is followed; a rule in a long instruction file is not always.
//
// It fails open on anything unexpected: a guard that blocks work on a payload it did not expect is worse than
// no guard. It writes one line per refusal to ~/.claude/skilliton/read-guard.log (SKILLITON_READ_GUARD_LOG),
// so what it refused can be checked afterwards; a log it cannot write never stops the refusal.
//
// Input (Claude Code hooks reference, PreToolUse): JSON on stdin with tool_name and tool_input; the Read tool's
// input is file_path (string), offset (integer, optional) and limit (integer, optional). Output: nothing to let
// the read go ahead, or hookSpecificOutput.permissionDecision "deny" with permissionDecisionReason.
// Registered in hooks/hooks.json under PreToolUse with matcher "Read"; docs/IT-ALLOWLIST.md names the log.

import { appendFileSync, lstatSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join } from "node:path";

const DEFAULT_LIMIT_KB = 50;
const fromEnv = Number(process.env.SKILLITON_READ_LIMIT_KB);
const LIMIT_KB = Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_LIMIT_KB;
const EXEMPT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic", ".tif", ".tiff", ".svg", ".pdf"]);
// The log location can be moved (tests do), but only to an absolute .log path that is not a symbolic link: the line
// written carries the refused file's name, which the model chose, so the log must never be a file something else runs.
const notSymlink = (p) => { try { return !lstatSync(p).isSymbolicLink(); } catch { return true; } };
const override = process.env.SKILLITON_READ_GUARD_LOG;
const LOG = override && isAbsolute(override) && override.endsWith(".log") && notSymlink(override)
  ? override
  : join(homedir(), ".claude", "skilliton", "read-guard.log");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  if (!payload || typeof payload !== "object" || payload.tool_name !== "Read") return;
  const input = payload.tool_input;
  if (!input || typeof input !== "object") return;
  const file = input.file_path;
  if (typeof file !== "string" || !file) return;
  const limit = typeof input.limit === "string" && input.limit.trim() ? Number(input.limit) : input.limit;
  if (Number.isFinite(limit)) return; // a ranged read is the thing this hook asks for (a numeric string counts)
  if (EXEMPT.has(extname(file).toLowerCase())) return;
  let size;
  try { size = statSync(file).size; } catch { return; } // a file the tool will report on itself
  const kb = Math.ceil(size / 1024);
  if (kb <= LIMIT_KB) return;
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), session: payload.session_id ?? null, cwd: payload.cwd ?? null, file, kb, limitKb: LIMIT_KB })}\n`);
  } catch { /* the log is a convenience; the refusal is the point */ }
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `context-hygiene read guard: ${file} is ${kb}KB, and a whole-file read of a non-image file over ${LIMIT_KB}KB is refused (session cost rule). Read a range with offset and limit, search it with grep, or summarize it with a script that prints a bounded result.`,
    },
  })}\n`);
});
