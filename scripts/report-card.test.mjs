// report-card.test.mjs: the generator's contract on a fixture, independent of this repository's own batch files.
//   node scripts/report-card.test.mjs
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bar, check, read, render } from "./report-card.mjs";

let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "ok  " : "FAIL"} ${label}`); if (!cond) failures++; };

const tmp = mkdtempSync(join(tmpdir(), "report-card-test-"));
const area = join(tmp, "docs", "areas", "01-fixture");
mkdirSync(area, { recursive: true });
writeFileSync(join(area, "AREA.md"), `# A fixture area\n\nKind: Living. Area record.\n\n- **Grade:** B\n- **Build progress:** (written by the generator)\n\n<!-- report-card:start -->\n<!-- report-card:end -->\n`);
writeFileSync(join(area, "batch-01-first.md"), `# First\n\nKind: Living. Batch record.\n\n- **Type:** build\n\n## Acceptance\n\n- [x] one done (evidence: a test)\n- [ ] one open\n- [x] two done (evidence: a run)\n- [ ] two open\n\n## Notes\n\nNone.\n`);
writeFileSync(join(area, "batch-02-second.md"), `# Second\n\nKind: Living. Batch record.\n\n- **Type:** measure (owner's machine)\n\n## Acceptance\n\n- [ ] open\n- [ ] open too\n- [ ] still open\n`);
writeFileSync(join(tmp, "docs", "REPORT_CARD.md"), `# Card\n\nKind: Living.\n\n<!-- report-card:start -->\n<!-- report-card:end -->\n`);

ok(bar(7, 14) === "`[##########..........]` 50 (7 of 14)", "bar renders 7 of 14 as 50 with ten cells");
ok(bar(0, 0) === "`[....................]` 0 (0 of 0)", "bar with no items is 0, not a division error");
ok(bar(3, 3) === "`[####################]` 100 (3 of 3)", "a full bar is 20 cells");

const r = read(tmp);
ok(r.failures.length === 0, `the fixture reads without failures (${r.failures.join("; ") || "none"})`);
ok(r.areas.length === 1 && r.areas[0].done === 2 && r.areas[0].total === 7, "the area counts 2 of 7 across two batches");
ok(r.areas[0].batches[1].type === "measure (owner's machine)" && r.areas[0].batches[0].title === "First", "batch type and title are read");
ok(r.areas[0].grade === "B", "the grade is read");

const before = check(tmp);
ok(before.failures.length === 2 && before.failures.every((f) => /is stale/.test(f)), "before apply, the card and the AREA line are stale and nothing else fails");
for (const [p, text] of before.writes) writeFileSync(p, text);
const after = check(tmp);
ok(after.failures.length === 0, "after writing, the check is clean");
ok(readFileSync(join(area, "AREA.md"), "utf8").includes("- **Build progress:** `[######..............]` 29 (2 of 7) across 2 batch(es)"), "the AREA.md Build progress line carries the area bar");
const card = readFileSync(join(tmp, "docs", "REPORT_CARD.md"), "utf8");
ok(card.includes("**All areas:** `[######..............]` 29 (2 of 7)") && card.includes("| [01-fixture](areas/01-fixture/AREA.md) A fixture area | B | 2 | `[######..............]` 29 (2 of 7) |") && !card.includes("batch-01-first"), "the card block carries the total and one row per area, and no batch rows");
ok(readFileSync(join(area, "AREA.md"), "utf8").includes("| [01 First](batch-01-first.md) | build | `[##########..........]` 50 (2 of 4) |"), "the AREA.md block carries one row per batch");
ok(render(r.areas) === render(read(tmp).areas), "render is deterministic");

writeFileSync(join(area, "batch-01-first.md"), readFileSync(join(area, "batch-01-first.md"), "utf8").replace("- [ ] one open", "- [x] one open"));
const ticked = read(tmp);
ok(ticked.failures.some((f) => /a ticked item does not end with "\(evidence: \.\.\.\)"/.test(f)), "a ticked item without evidence is refused");
ok(check(tmp).failures.some((f) => /a ticked item does not end/.test(f)) && check(tmp).writes.length === 0, "check reports the content problem and writes nothing");

rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `report-card test FAILED: ${failures} check(s)` : "report-card test passed");
process.exit(failures ? 1 : 0);
