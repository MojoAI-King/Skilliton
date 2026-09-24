#!/usr/bin/env node
// Runs the meter against the fixture transcripts and asserts hand-computed totals.
// Exit 0 = meter is trustworthy on these cases. Exit 1 = do not use its numbers anywhere.
// Every expected value below was computed by hand from the fixture files (see the plugin's fixtures/meter/README.md),
// not by running the meter.
//
//   node token-cost.test.mjs               the fixture cases
//   node token-cost.test.mjs --reference   also the real-window figures, where those transcripts exist
//
// scripts/token-cost.test.mjs in the Skilliton repository runs this file with the same arguments.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { claudeConfigDir } from "../lib/verify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const METER = join(here, "token-cost.mjs");
// The fixtures ship with the plugin, so an installed copy can run this test, but outside runtime/: a data file inside a
// code folder is one docs/IT-ALLOWLIST.md's file check cannot vouch for (scripts/inventory.mjs, CODE_FOLDER).
const FIXTURES = join(here, "..", "..", "fixtures", "meter");
const out = (line = "") => process.stdout.write(`${line}\n`);
const lastJson = (buffer) => JSON.parse(buffer.toString().trim().split("\n").pop());
const run = (...args) => lastJson(execFileSync("node", [METER, "--json", ...args], {
  env: { ...process.env, SKILLITON_PROJECTS: join(FIXTURES, "transcripts"), SKILLITON_TZ: "America/New_York" },
}));

let fail = 0;
const check = (name, got, want) => {
  const same = typeof want === "number" ? Math.abs((got ?? NaN) - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!same) { out(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } else out(`ok   ${name} = ${JSON.stringify(got)}`);
};
const scope = (label, r, s, want) => { for (const f of Object.keys(want)) check(`${label} ${s}.${f}`, r.byScope[s]?.[f], want[f]); };

// proj-a (all claude-fable-5-1: in 10, out 50, read 0.25, w5m 12.5, w1h 20 $/MTok)
//   r1 x3 dup: the copies carry output 1, 2 and 50 (the first two are streaming partials); the largest wins:
//              100*10 + 50*50 + 1000*0.25 + 200*12.5 (no TTL breakdown, priced 5m) = 6250 micro-usd
//   r2:        10*10 + 20*50 + 3000*0.25                                          = 1850
//   r3:        5*10 + 5*50 + 400*12.5 + 600*20                                    = 17300
//   r4 x2 dup (subagent), copies carry output 1 then 9: 7*10 + 9*50 + 500*0.25 + 100*12.5 = 1895
// proj-b
//   r5 x2 dup (claude-opus-5: 5, 25, 0.5, 6.25, 10): 1000*5 + 2000*25 + 10000*0.5 + 1000*10 = 70000
//   no ids (counted no_ids, never summed); r6 no timestamp (counted, never summed)
//   r7 unknown model: tokens counted, cost omitted, run flagged incomplete
//   r8 truncated JSON line: counted unparseable
//   r9 model <synthetic>: written locally, no API call; counted as synthetic, never a request
const all = run();
check("records", all.records, 13);
check("distinct", all.distinct, 8);
check("synthetic", all.synthetic, 1);
check("duplicates", all.duplicates, 4);
check("no_ids", all.no_ids, 1);
check("no_timestamp", all.no_timestamp, 1);
check("unparseable_lines", all.unparseable_lines, 1);
check("unreadable_files", all.unreadable_files, 0);
check("unpriced_models", all.unpriced_models, { "claude-unknown-9": 1 });
check("incomplete", all.incomplete, true);
scope("all", all, "top", {
  requests: 5, input: 1125, output: 2075, cache_read: 14000, cache_write_5m: 600, cache_write_1h: 1600, cost_usd: 0.0954, ttl_unknown_tokens: 200,
});
scope("all", all, "subagent", {
  requests: 1, input: 7, output: 9, cache_read: 500, cache_write_5m: 100, cache_write_1h: 0, cost_usd: 0.001895, ttl_unknown_tokens: 100,
});
// peak_context is a maximum and never a sum: the largest context one request carried, hand-computed as
// input + cache_read + cache writes (output is not context).
//   day 2026-09-14 top: m1 100+1000+200 = 1300; m2 10+3000 = 3010; m3 5+400+600 = 1005 -> 3010
//   day 2026-09-15 top: m5 1000+10000+1000 = 12000; m7 10 -> 12000, and byScope takes the larger of the two days
//   subagent:           m4 7+500+100 = 607 (its duplicate carries the same context and a larger output; peak ignores it)
scope("all", all, "top", { peak_context: 12000 });
scope("all", all, "subagent", { peak_context: 607 });
// Three negative controls, one per way this could be written wrong: summing the day buckets in byScope would give
// 15010, summing the records inside a bucket would give 12010, and counting m5's output as context would give 14000.
check("negative control: peak is a maximum over requests and over buckets, and excludes output",
  ![15010, 12010, 14000].includes(all.byScope.top.peak_context), true);
// Every cache write at the 5m rate (how the reference figures were established): r3's 600 1h tokens move from
// 20 to 12.5 $/MTok (17300 - 4500 = 12800), r5's 1000 from 10 to 6.25 (70000 - 3750 = 66250);
// 6250 + 1850 + 12800 + 66250 = 87150 micro-usd.
scope("all 5m", all, "top", { cost_all_5m_usd: 0.08715 });
scope("all 5m", all, "subagent", { cost_all_5m_usd: 0.001895 });
// The tie-break's own negative control: with first-copy-wins, top output would be 2026 (1 + 20 + 5 + 2000) and
// subagent output 1, so the two output checks above fail without the rule (checked by reverting it).
check("negative control: first-copy-wins would differ", 2026 !== all.byScope.top.output && 1 !== all.byScope.subagent.output, true);

// --project filter: proj-a only. Complete (no unpriced model in scope).
const a = run("--project", "PROJ-A");
check("project filter incomplete", a.incomplete, false);
check("project filter filtered_project", a.filtered_project, 3);
scope("proj-a", a, "top", {
  requests: 3, input: 115, output: 75, cache_read: 4000, cache_write_5m: 600, cache_write_1h: 600, peak_context: 3010, cost_usd: 0.0254,
});

// --until: 15:30Z keeps r1 (14:00Z) and r2 (15:00Z) only; r3, r4, r5, r7, r9 are out of window
const u = run("--project", "proj-a", "--until", "2026-09-14T15:30:00Z");
check("until out_of_window (window is checked before the project filter)", u.out_of_window, 5);
scope("until", u, "top", { requests: 2, peak_context: 3010, cost_usd: 0.0081 });
check("until subagent absent", u.byScope.subagent, undefined);

// --since is exclusive and --until inclusive, so windows that share an end never count a record twice.
// proj-a, (14:00Z, 16:00Z]: r1 sits exactly on --since and is out; r2 (15:00Z) and r3 (16:00Z, exactly on --until) are
// in: 1850 + 17300 = 19150 micro-usd; peak 3010 (r2). Out of window: r1 (on --since), r4 (16:30Z), r5, r7 and r9 = 5.
const si = run("--project", "proj-a", "--since", "2026-09-14T14:00:00Z", "--until", "2026-09-14T16:00:00Z");
check("since out_of_window", si.out_of_window, 5);
scope("since", si, "top", { requests: 2, input: 15, peak_context: 3010, cost_usd: 0.01915 });
check("since is named in the window", si.window.since, "2026-09-14T14:00:00Z");
// The two forms compose: Sep 15 alone keeps r5 (12:00Z) and r7 (12:10Z); --since 12:00Z then drops r5, which sits on
// it, leaving r7 (unpriced, input 10). r9 is synthetic and is counted as such, never as a request.
const sd = run("2026-09-15", "2026-09-15", "--since", "2026-09-15T12:00:00Z");
scope("day and since", sd, "top", { requests: 1, input: 10, cost_usd: 0 });
check("day and since unpriced", sd.unpriced_models, { "claude-unknown-9": 1 });

// day window: Sep 15 only (America/New_York) keeps r5 and r7
const d = run("2026-09-15", "2026-09-15");
scope("day window", d, "top", { requests: 2, input: 1010, peak_context: 12000, cost_usd: 0.07 });

// negative control: the naive sum (no dedup) must NOT match, or the fixture cannot detect the 3.28x class of bug
const naiveTopInput = 3 * 100 + 10 + 5 + 2 * 1000 + 10;
check("negative control: naive sum differs from dedup", naiveTopInput !== all.byScope.top.input, true);

// --reference: the meter must also reproduce the real-window figures two independent reviews established on
// 2026-09-15 (DECISIONS.md O2): UTC days 2026-09-14 and 2026-09-15, every project, every cache write priced at
// the 5m rate. Those transcripts exist on one machine, so elsewhere this reports NOT RUN and passes nothing.
if (process.argv.includes("--reference")) {
  const projects = process.env.SKILLITON_PROJECTS ?? join(claudeConfigDir(), "projects");
  const ref = lastJson(execFileSync("node", [METER, "--json", "2026-09-14", "2026-09-15"], {
    env: { ...process.env, SKILLITON_PROJECTS: projects, SKILLITON_TZ: "UTC" }, maxBuffer: 64 * 1024 * 1024,
  }));
  const top = ref.byScope.top, sub = ref.byScope.subagent;
  if (!top || !sub || top.requests < 1000) {
    out(`NOT RUN: the reference transcripts (UTC 2026-09-14 to 2026-09-15) are not under ${projects}; ${ref.records} usage records in that`
      + " window. The fixture result above stands on its own; the reference figures are not confirmed on this machine.");
  } else {
    const near = (name, got, want, within) => {
      const ok = Math.abs(got - want) <= within;
      out(`${ok ? "ok  " : "FAIL"} reference ${name} = ${got} (want ${want} within ${within})`);
      if (!ok) fail++;
    };
    near("top-level requests", top.requests, 1919, 0);
    near("subagent requests", sub.requests, 439, 0);
    near("top-level cost, all writes at 5m", top.cost_all_5m_usd, 407.68, 1);
    near("subagent cost, all writes at 5m", sub.cost_all_5m_usd, 70.72, 0.5);
  }
}

out(fail ? `\n${fail} FAILURES: the meter is not trustworthy yet` : "\nmeter fixture test passed");
process.exit(fail ? 1 : 0);
