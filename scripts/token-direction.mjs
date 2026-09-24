#!/usr/bin/env node
// token-direction.mjs: a per-day direction-of-travel report for ONE project's Claude Code
// transcripts, built on top of the tested meter (scripts/token-cost.mjs) rather than
// re-deriving its dedup and pricing logic.
//
// Every number here is a reconstruction from local transcripts on this machine, not a bill.
// It goes nowhere as a savings or percentage claim: PLAN.md sections 6 and 8 and DECISIONS.md
// O2/O3 govern any number that leaves this repository, and none of that arithmetic is repeated
// here.
//
// What it reports, per day:
//   - top-level requests, peak context, and whether the day's data is complete: all three read
//     straight from `node scripts/token-cost.mjs <day> <day> --json` against this project's own
//     transcript folder (no re-implementation of dedup or pricing).
//   - median and mean context across that day's top-level requests: token-cost.mjs only ever
//     reports peak_context (a maximum), so this script does its own pass to collect one context
//     value per deduped top-level request, using the identical (requestId, message.id) dedup key
//     and the same fact the meter's own comment relies on -- the input side of a duplicate group
//     never varies between copies -- so the first copy's context is as good as the last.
//   - which models were used that day, from every usage record (top-level and subagent).
//   - compaction boundaries: `type:"system", subtype:"compact_boundary"` records, deduped by
//     `uuid` (a boundary can be repeated verbatim in a continued transcript; confirmed on this
//     machine's own transcripts: 84 raw lines, 70 distinct events).
//   - read-guard refusals: Claude Code's own "PreToolUse:Read hook error" wrapper around a denied
//     Read call. This is Claude Code's runtime text, not the hook's source template, so it does
//     not fire on a session merely reading or quoting the hook's own source file (checked: the
//     hook's literal reason text appears in these transcripts, unrelated to a real denial, far
//     more often than real denials do -- via source reads, diffs and test fixtures -- which is
//     why this script keys on the wrapper Claude Code adds, not the hook's own wording, and why
//     the wrapper is asserted NOT to appear in the hook's source in the accompanying test).
//   - `skilliton gate` runs: a Bash tool_use containing a shell segment that starts with
//     `skilliton gate` or `node .../skilliton.mjs gate`. Checked against this project's real
//     transcripts, where three cheaper approaches all overcounted: a bare "gate" substring match
//     (a filename or a PLAN.md heading mentioning gate) overcounts by more than 100x; an
//     unanchored regex search of the whole command string matches the invocation syntax quoted
//     inside a heredoc that writes gate.mjs's own source; and even a per-segment, start-anchored
//     match without a trailing boundary matches two real sentences of prose ("skilliton gate built
//     in workflow 0.8.0 with 13 tests", "skilliton gate in this repository has no checks of its
//     own") that happen to start with those two words. This script therefore splits each command
//     on shell separators (`;`, `&`, `|`, newline -- not quote-aware, so a separator inside a
//     quoted string can still split a sentence into a false-looking segment) and requires the
//     match to be followed immediately by `--cmd`, a redirect, a pipe, or the end of the segment
//     -- what an invocation is followed by and prose is not. This is a reconstruction of what the
//     transcripts show, not a parse of the shell: a quoted semicolon inside prose can still slip
//     through in principle, and this script's own test pins the exact failures above so a future
//     change cannot reopen them silently.
//
// Usage:
//   node scripts/token-direction.mjs [FROM_DAY TO_DAY] [--project-root <path>] [--project-dir <path>] [--json]
//   FROM_DAY/TO_DAY default to 2026-09-16 and 2026-09-22, in SKILLITON_TZ (America/New_York
//   unless overridden), matching token-cost.mjs's own day bucketing.
//   --project-root is the repository whose transcripts to measure; it defaults to the MAIN
//   worktree (via `git rev-parse --git-common-dir`, so a lane worktree still measures the one
//   project the repository as a whole is filed under, never its own lane-worktree folder). The
//   project's key under SKILLITON_PROJECTS (default ~/.claude/projects) is derived from that path
//   at run time and never written to disk or committed: it is machine-specific.
//   --project-dir bypasses key derivation entirely and points straight at a transcripts folder;
//   used by this script's own test for isolation, and available for pointing at a project folder
//   directly.

import { readdirSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bashCommandRunsGate, extractBashCommand, lineMarks } from "../packs/base/plugins/workflow/runtime/meter/events.mjs";
import { folderNameFor, projectsRoot } from "../packs/base/plugins/workflow/runtime/meter/projects.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const METER = join(here, "token-cost.mjs");
const TZ = process.env.SKILLITON_TZ ?? "America/New_York";

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const value = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const JSON_OUT = flag("--json");
const projectRootArg = value("--project-root");
const projectDirArg = value("--project-dir");
const consumed = new Set();
for (const k of ["--project-root", "--project-dir"]) { const i = argv.indexOf(k); if (i >= 0) { consumed.add(i); consumed.add(i + 1); } }
const positional = argv.filter((a, i) => !consumed.has(i) && !a.startsWith("--"));
const FROM = positional[0] ?? "2026-09-16";
const TO = positional[1] ?? "2026-09-22";
const TODAY = process.env.SKILLITON_TODAY ?? new Date().toLocaleDateString("en-CA", { timeZone: TZ });

function deriveProjectDir() {
  if (projectDirArg) return projectDirArg;
  const projectsHome = projectsRoot();
  let root = projectRootArg;
  if (!root) {
    const gitCommonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
    root = dirname(gitCommonDir); // the MAIN worktree, not whichever worktree this script runs from
  }
  // One hyphen per character that is not a letter or digit, never collapsed (runtime/meter/projects.mjs says what was
  // verified); the collapsing form this script used before missed a folder whose path held "/." or "/-".
  return join(projectsHome, folderNameFor(root));
}

const PROJECT_DIR = deriveProjectDir();

function* walk(dir, counters) {
  let ents = [];
  try { ents = readdirSync(dir); } catch { counters.unreadable_dirs++; return; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { counters.unreadable_files++; continue; }
    if (st.isDirectory()) yield* walk(p, counters);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const inWindow = (day) => day >= FROM && day <= TO;

// The gate, refusal and compaction rules (see the file-header comment for why they are shaped this way) live in the
// workflow plugin's runtime/meter/events.mjs, so this script and `skilliton usage summary` count the same way.

async function scan() {
  const counters = { files: 0, unreadable_files: 0, unreadable_dirs: 0, unparseable_lines: 0 };
  const perDay = new Map(); // day -> { contexts:number[], models:Set, compaction:Set(uuid), refusals:Set(uuid), gateRuns:Set(uuid) }
  const dayBucket = (day) => {
    if (!perDay.has(day)) perDay.set(day, { contexts: [], models: new Set(), compaction: new Map(), refusals: new Set(), gateRuns: new Set() });
    return perDay.get(day);
  };
  const seenRequests = new Set(); // (requestId|messageId) for usage-record dedup, same key shape as token-cost.mjs

  for (const file of walk(PROJECT_DIR, counters)) {
    counters.files++;
    const scope = file.includes("/subagents/") ? "subagent" : "top";
    let rl;
    try {
      rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
      for await (const line of rl) {
        const hasUsage = line.includes('"usage"');
        const { compact: isCompact, refusal: isRefusal, gate: maybeGate } = lineMarks(line);
        if (!hasUsage && !isCompact && !isRefusal && !maybeGate) continue;

        let rec;
        try { rec = JSON.parse(line); } catch { counters.unparseable_lines++; continue; }
        const ms = Date.parse(rec.timestamp ?? "");
        if (Number.isNaN(ms)) continue;
        const day = dayOf(ms);
        if (!inWindow(day)) continue;

        if (isCompact) {
          const b = dayBucket(day);
          const key = rec.uuid ?? `${day}|${b.compaction.size}`;
          b.compaction.set(key, rec.compactMetadata?.trigger ?? "unknown");
        }
        if (isRefusal) { dayBucket(day).refusals.add(rec.uuid ?? `${day}|${dayBucket(day).refusals.size}`); }
        if (maybeGate) {
          const cmd = extractBashCommand(rec);
          if (cmd && bashCommandRunsGate(cmd)) dayBucket(day).gateRuns.add(rec.uuid ?? `${rec.requestId ?? ""}|${rec.message?.id ?? ""}`);
        }

        if (hasUsage) {
          const msg = rec.message;
          if (!msg || !msg.usage) continue;
          const reqId = rec.requestId ?? rec.request_id ?? "";
          const msgId = msg.id ?? "";
          const model = msg.model ?? "unknown";
          if (model === "<synthetic>") continue;
          const key = `${reqId}|${msgId}`;
          if (key !== "|" && seenRequests.has(key)) continue; // dedup: input side never varies across copies
          if (key !== "|") seenRequests.add(key);
          const u = msg.usage;
          const cc = u.cache_creation;
          const hasTtl = cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null);
          const cw5m = hasTtl ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
          const cw1h = hasTtl ? (cc.ephemeral_1h_input_tokens ?? 0) : 0;
          const context = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + cw5m + cw1h;
          const b = dayBucket(day);
          b.models.add(model);
          if (scope === "top") b.contexts.push(context);
        }
      }
    } catch (e) {
      counters.unreadable_files++;
      console.error(`UNREADABLE: ${file}: ${e.message}`);
    } finally {
      rl?.close();
    }
  }
  return { counters, perDay };
}

function meterDay(day) {
  try {
    const out = execFileSync("node", [METER, day, day, "--json"], {
      env: { ...process.env, SKILLITON_PROJECTS: PROJECT_DIR, SKILLITON_TZ: TZ },
      maxBuffer: 64 * 1024 * 1024,
    }).toString().trim().split("\n").pop();
    return JSON.parse(out);
  } catch (e) {
    return { error: e.message };
  }
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

function dayList(from, to) {
  const days = [];
  let d = new Date(`${from}T12:00:00Z`); // noon UTC: never crosses a day boundary under a TZ offset
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) { days.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
  return days;
}

const { counters, perDay } = await scan();
const rows = [];
for (const day of dayList(FROM, TO)) {
  const tc = meterDay(day);
  const own = perDay.get(day) ?? { contexts: [], models: new Set(), compaction: new Map(), refusals: new Set(), gateRuns: new Set() };
  const top = tc.byScope?.top;
  const dataComplete = tc.error ? null : !tc.incomplete;
  const elapsed = day < TODAY;
  const triggers = [...own.compaction.values()];
  rows.push({
    day,
    requests: top?.requests ?? 0,
    peak_context: top?.peak_context ?? 0,
    median_context: median(own.contexts),
    mean_context: mean(own.contexts),
    models: [...own.models].sort(),
    compaction_boundaries: own.compaction.size,
    compaction_auto: triggers.filter((t) => t === "auto").length,
    compaction_manual: triggers.filter((t) => t === "manual").length,
    compaction_other: triggers.filter((t) => t !== "auto" && t !== "manual").length,
    read_guard_refusals: own.refusals.size,
    gate_runs: own.gateRuns.size,
    data_complete: dataComplete,
    day_elapsed: elapsed,
    unpriced_models: tc.unpriced_models ?? {},
    meter_error: tc.error ?? null,
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ from: FROM, to: TO, tz: TZ, today: TODAY, projectDir: PROJECT_DIR, scanCounters: counters, rows }, null, 2));
} else {
  console.log(`token-direction: ${FROM} to ${TO}, tz=${TZ}, project=${PROJECT_DIR}`);
  console.log(`scan: files=${counters.files} unreadable_files=${counters.unreadable_files} unreadable_dirs=${counters.unreadable_dirs} unparseable_lines=${counters.unparseable_lines}`);
  for (const r of rows) {
    console.log(`${r.day}  requests=${r.requests}  peak_ctx=${r.peak_context}  median_ctx=${r.median_context ?? "n/a"}  mean_ctx=${r.mean_context ? r.mean_context.toFixed(0) : "n/a"}  compactions=${r.compaction_boundaries}(auto=${r.compaction_auto},manual=${r.compaction_manual},other=${r.compaction_other})  refusals=${r.read_guard_refusals}  gate_runs=${r.gate_runs}  complete=${r.data_complete}  elapsed=${r.day_elapsed}  models=${r.models.join(",")}`);
  }
}
