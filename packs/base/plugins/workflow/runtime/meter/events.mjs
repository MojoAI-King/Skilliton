// events.mjs: counting what the transcripts say happened, beside the meter's counting of what it cost: skilliton gate
// runs, reads the read guard refused, and compactions. The rules were built and checked in scripts/token-direction.mjs
// against real transcripts (its header comment says what three simpler rules got wrong, and its test pins each
// failure); they live here so that script and `skilliton usage summary` read the transcripts the same way. Nothing here
// touches usage or dedups requests: that is the meter's, and it is not re-derived.

import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { folderNameFor, projectsRoot } from "./projects.mjs";

// Matched per shell segment: the segment must START with the invocation and be followed only by `--cmd`, a numbered or
// bare redirect, a pipe, or nothing, never by another word, which is what tells a real invocation from a sentence that
// happens to start with the same two words.
const GATE_SEG_RE = /^\s*(skilliton|node\s+\S*skilliton(\.mjs)?)\s+gate\s*(--cmd\b|\d*>|\||$)/;
const SEGMENT_SPLIT_RE = /[\n;&|]+/;

export function bashCommandRunsGate(command) {
  return command.split(SEGMENT_SPLIT_RE).some((seg) => GATE_SEG_RE.test(seg));
}

export function extractBashCommand(rec) {
  const content = rec?.message?.content;
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item?.type === "tool_use" && item?.name === "Bash" && typeof item?.input?.command === "string") return item.input.command;
  }
  return null;
}

// Cheap tests on the raw line, so a line that cannot be one of these is never parsed. A refusal is Claude Code's own
// wrapper around a denied Read, not the hook's wording, which also appears wherever its source is read or quoted.
export const lineMarks = (line) => ({
  compact: line.includes('"subtype":"compact_boundary"'),
  refusal: line.includes("PreToolUse:Read hook error"),
  gate: line.includes('"name":"Bash"') && line.includes("gate"),
});

function* jsonlFiles(dir, counters) {
  let ents = [];
  try { ents = readdirSync(dir); } catch { counters.unreadable_dirs++; return; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { counters.unreadable_files++; continue; }
    if (st.isDirectory()) yield* jsonlFiles(p, counters);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

function countLine(line, window, seen) {
  const marks = lineMarks(line);
  if (!marks.compact && !marks.refusal && !marks.gate) return 0;
  let rec;
  try { rec = JSON.parse(line); } catch { return 1; }
  const ms = Date.parse(rec.timestamp ?? "");
  if (Number.isNaN(ms) || (window.sinceMs != null && ms <= window.sinceMs) || (window.untilMs != null && ms > window.untilMs)) return 0;
  const id = rec.uuid ?? `${rec.requestId ?? ""}|${rec.message?.id ?? ""}|${ms}`;
  if (marks.compact) seen.compactions.set(id, rec.compactMetadata?.trigger ?? "unknown"); // a boundary can repeat verbatim
  if (marks.refusal) seen.refusals.add(id);
  if (marks.gate) {
    const cmd = extractBashCommand(rec);
    if (cmd && bashCommandRunsGate(cmd)) seen.gateRuns.add(id);
  }
  return 0;
}

// Counts gate runs, refused reads and compactions in the transcripts of the given project paths (matched exactly, by
// the folder name Claude Code gives each), inside (sinceMs, untilMs]. Every file or line it could not read is counted.
export async function countEvents(paths, { sinceMs = null, untilMs = null, env = process.env } = {}) {
  const root = projectsRoot(env);
  const counters = { files: 0, unreadable_files: 0, unreadable_dirs: 0, unparseable_lines: 0, absent_project_dirs: 0 };
  const seen = { compactions: new Map(), refusals: new Set(), gateRuns: new Set() };
  for (const name of [...new Set(paths.map(folderNameFor))]) {
    const dir = join(root, name);
    if (!existsSync(dir)) { counters.absent_project_dirs++; continue; }
    for (const file of jsonlFiles(dir, counters)) {
      counters.files++;
      let rl;
      try {
        rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
        for await (const line of rl) counters.unparseable_lines += countLine(line, { sinceMs, untilMs }, seen);
      } catch {
        counters.unreadable_files++;
      } finally {
        rl?.close();
      }
    }
  }
  const triggers = [...seen.compactions.values()];
  return {
    ...counters, gate_runs: seen.gateRuns.size, read_refusals: seen.refusals.size, compactions: seen.compactions.size,
    compactions_auto: triggers.filter((t) => t === "auto").length,
  };
}
