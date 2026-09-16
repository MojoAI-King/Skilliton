#!/usr/bin/env node
// Runs the meter against the fixture transcripts and asserts hand-computed totals.
// Exit 0 = meter is trustworthy on these cases. Exit 1 = do not use its numbers anywhere.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const out = execFileSync("node", [join(here, "token-cost.mjs"), "--json"], {
  env: { ...process.env, SKILLGATE_PROJECTS: join(here, "fixtures", "transcripts"), SKILLGATE_TZ: "America/New_York" },
}).toString().trim().split("\n").pop();
const r = JSON.parse(out);
const expect = {
  records: 7, distinct: 4,
  top:      { requests: 3, input: 115, output: 75, cache_read: 4000, cache_write_5m: 600, cache_write_1h: 600 },
  subagent: { requests: 1, input: 7,   output: 9,  cache_read: 500,  cache_write_5m: 100, cache_write_1h: 0 },
};
let fail = 0;
const check = (name, got, want) => { if (got !== want) { console.log(`FAIL ${name}: got ${got}, want ${want}`); fail++; } else console.log(`ok   ${name} = ${got}`); };
check("records", r.records, expect.records);
check("distinct", r.distinct, expect.distinct);
for (const scope of ["top", "subagent"]) for (const f of Object.keys(expect[scope])) check(`${scope}.${f}`, r.byScope[scope]?.[f], expect[scope][f]);
console.log(fail ? `\n${fail} FAILURES: the meter is not trustworthy yet` : "\nmeter fixture test passed");
process.exit(fail ? 1 : 0);
