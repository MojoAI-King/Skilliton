#!/usr/bin/env node
// Runs token-direction.mjs against a small fixture and asserts hand-computed values, the same
// discipline as token-cost.test.mjs: every expected number below was computed by hand from
// scripts/fixtures/transcripts-direction/, not by running the script.
//
// The fixture exists to pin the gate-detection failures found and fixed while building this
// script against the real local transcripts (see the file header comment in token-direction.mjs):
// a bare "gate" substring (rgate3: "grep -rn gate PLAN.md docs/GATE-NOTES.md") and a sentence that
// starts with the two words "skilliton gate" (rgate2: "skilliton gate built in workflow 0.8.0
// with 13 tests") must both be rejected, and only the real invocation (rgate1) counted. It also
// pins: (requestId, message.id) dedup for context values (r1 appears twice with the same context);
// compact_boundary dedup by uuid (c1 appears twice, counts once) and the auto/manual trigger
// split; a real read-guard denial (ref1, carrying Claude Code's own "PreToolUse:Read hook error"
// wrapper) counted while a mere mention of the hook's wording in an unrelated tool result
// (decoy-source-read) is not; and that a subagent-scope usage record (r3) contributes to the
// day's model set but not to its top-level request count or context list.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "fixtures", "transcripts-direction");

const run = (...args) => JSON.parse(execFileSync("node", [join(here, "token-direction.mjs"), "--project-dir", FIXTURE, "--json", ...args], {
  env: { ...process.env, SKILLITON_TZ: "America/New_York", SKILLITON_TODAY: "2026-09-22" },
}).toString());

let fail = 0;
const check = (name, got, want) => {
  const same = typeof want === "number" ? Math.abs((got ?? NaN) - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!same) { console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

const out = run("2026-09-16", "2026-09-17");
check("scan files", out.scanCounters.files, 2);
check("scan unreadable_files", out.scanCounters.unreadable_files, 0);
check("scan unparseable_lines", out.scanCounters.unparseable_lines, 0);
check("day count", out.rows.length, 2);

const d1 = out.rows[0], d2 = out.rows[1];
check("d1 day", d1.day, "2026-09-16");
// r1 (deduped from 2 copies) = 100+200+50 = 350; r2 = 10+20+5 = 35; r5 = 1000+0+0 = 1000
check("d1 requests (r1 deduped, r2, r5)", d1.requests, 3);
check("d1 peak_context", d1.peak_context, 1000);
check("d1 median_context (sorted 35,350,1000)", d1.median_context, 350);
check("d1 mean_context ((35+350+1000)/3)", d1.mean_context, 1385 / 3);
check("d1 models (all scopes, this day)", d1.models, ["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5"]);
check("d1 compaction_boundaries (c1 deduped by uuid + c2)", d1.compaction_boundaries, 2);
check("d1 compaction_auto", d1.compaction_auto, 1);
check("d1 compaction_manual", d1.compaction_manual, 1);
check("d1 read_guard_refusals (ref1 only, decoy source-quote excluded)", d1.read_guard_refusals, 1);
check("d1 gate_runs (rgate1 only; prose and bare-word decoys excluded)", d1.gate_runs, 1);
check("d1 data_complete (every model priced)", d1.data_complete, true);
check("d1 day_elapsed (today is fixed at 2026-09-22)", d1.day_elapsed, true);

check("d2 day", d2.day, "2026-09-17");
// r3 is subagent scope: counts toward the day's model set, not toward top-level requests or context
check("d2 requests (r4 only; r3 is subagent scope)", d2.requests, 1);
check("d2 peak_context (r4: input 1, no cache)", d2.peak_context, 1);
check("d2 median_context", d2.median_context, 1);
check("d2 models (top r4 + subagent r3)", d2.models, ["claude-haiku-4-5-20251001", "claude-unknown-x"]);
check("d2 compaction_boundaries", d2.compaction_boundaries, 0);
check("d2 read_guard_refusals", d2.read_guard_refusals, 0);
check("d2 gate_runs", d2.gate_runs, 0);
check("d2 data_complete (claude-unknown-x has no price)", d2.data_complete, false);
check("d2 unpriced_models", d2.unpriced_models, { "claude-unknown-x": 1 });

// Negative control: the gate detector's failure modes this fixture exists to pin. If either
// decoy command were counted, d1.gate_runs would be 2 or 3 instead of 1.
check("negative control: gate_runs is not inflated by the bare-word or prose decoys", d1.gate_runs !== 2 && d1.gate_runs !== 3, true);

// Negative control: Claude Code's own hook-denial wrapper is required, not just the hook's wording.
// If the decoy source-quote line were counted, d1.read_guard_refusals would be 2.
check("negative control: read_guard_refusals is not inflated by a mere mention of the hook's wording", d1.read_guard_refusals !== 2, true);

console.log(fail ? `\n${fail} FAILURES: token-direction.mjs is not trustworthy yet` : "\ntoken-direction fixture test passed");
process.exit(fail ? 1 : 0);
