#!/usr/bin/env node
// Runs the meter against the fixture transcripts and asserts hand-computed totals.
// Exit 0 = meter is trustworthy on these cases. Exit 1 = do not use its numbers anywhere.
// Every expected value below was computed by hand from the fixture files (see fixtures/README.md),
// not by running the meter.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const run = (...args) => JSON.parse(execFileSync("node", [join(here, "token-cost.mjs"), "--json", ...args], {
  env: { ...process.env, SKILLITON_PROJECTS: join(here, "fixtures", "transcripts"), SKILLITON_TZ: "America/New_York" },
}).toString().trim().split("\n").pop());

let fail = 0;
const check = (name, got, want) => {
  const same = typeof want === "number" ? Math.abs((got ?? NaN) - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!same) { console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};
const scope = (label, r, s, want) => { for (const f of Object.keys(want)) check(`${label} ${s}.${f}`, r.byScope[s]?.[f], want[f]); };

// proj-a (all claude-fable-5-1: in 10, out 50, read 0.25, w5m 12.5, w1h 20 $/MTok)
//   r1 x3 dup: 100*10 + 50*50 + 1000*0.25 + 200*12.5 (no TTL breakdown, priced 5m) = 6250 micro-usd
//   r2:        10*10 + 20*50 + 3000*0.25                                          = 1850
//   r3:        5*10 + 5*50 + 400*12.5 + 600*20                                    = 17300
//   r4 x2 dup (subagent): 7*10 + 9*50 + 500*0.25 + 100*12.5                        = 1895
// proj-b
//   r5 x2 dup (claude-opus-5: 5, 25, 0.5, 6.25, 10): 1000*5 + 2000*25 + 10000*0.5 + 1000*10 = 70000
//   no ids (counted no_ids, never summed); r6 no timestamp (counted, never summed)
//   r7 unknown model: tokens counted, cost omitted, run flagged incomplete
//   r8 truncated JSON line: counted unparseable
const all = run();
check("records", all.records, 12);
check("distinct", all.distinct, 7);
check("duplicates", all.duplicates, 4);
check("no_ids", all.no_ids, 1);
check("no_timestamp", all.no_timestamp, 1);
check("unparseable_lines", all.unparseable_lines, 1);
check("unreadable_files", all.unreadable_files, 0);
check("unpriced_models", all.unpriced_models, { "claude-unknown-9": 1 });
check("incomplete", all.incomplete, true);
scope("all", all, "top", { requests: 5, input: 1125, output: 2075, cache_read: 14000, cache_write_5m: 600, cache_write_1h: 1600, cost_usd: 0.0954, ttl_unknown_tokens: 200 });
scope("all", all, "subagent", { requests: 1, input: 7, output: 9, cache_read: 500, cache_write_5m: 100, cache_write_1h: 0, cost_usd: 0.001895, ttl_unknown_tokens: 100 });

// --project filter: proj-a only. Complete (no unpriced model in scope).
const a = run("--project", "PROJ-A");
check("project filter incomplete", a.incomplete, false);
check("project filter filtered_project", a.filtered_project, 2);
scope("proj-a", a, "top", { requests: 3, input: 115, output: 75, cache_read: 4000, cache_write_5m: 600, cache_write_1h: 600, cost_usd: 0.0254 });

// --until: 15:30Z keeps r1 (14:00Z) and r2 (15:00Z) only; r3, r4, r5, r7 are out of window
const u = run("--project", "proj-a", "--until", "2026-09-14T15:30:00Z");
check("until out_of_window (window is checked before the project filter)", u.out_of_window, 4);
scope("until", u, "top", { requests: 2, cost_usd: 0.0081 });
check("until subagent absent", u.byScope.subagent, undefined);

// day window: Sep 15 only (America/New_York) keeps r5 and r7
const d = run("2026-09-15", "2026-09-15");
scope("day window", d, "top", { requests: 2, input: 1010, cost_usd: 0.07 });

// negative control: the naive sum (no dedup) must NOT match, or the fixture cannot detect the 3.28x class of bug
const naiveTopInput = 3 * 100 + 10 + 5 + 2 * 1000 + 10;
check("negative control: naive sum differs from dedup", naiveTopInput !== all.byScope.top.input, true);

console.log(fail ? `\n${fail} FAILURES: the meter is not trustworthy yet` : "\nmeter fixture test passed");
process.exit(fail ? 1 : 0);
