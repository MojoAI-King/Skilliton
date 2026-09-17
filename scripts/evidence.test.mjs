#!/usr/bin/env node
// Tests scripts/evidence.mjs with a synthetic eval result that carries exactly what must never be committed:
// an absolute home path and model-written text with a dash and a fake key. Temp folders only.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "evidence-test-"));
const deny = join(tmp, "denylist");
writeFileSync(deny, "# test denylist\nexamplenamealpha\n");
let fails = 0, oks = 0;
const ok = (c, l) => { if (c) { oks++; console.log(`ok   ${l}`); } else { fails++; console.log(`FAIL ${l}`); } };
const run = (...args) => {
  try { return { code: 0, out: execFileSync("node", [join(here, "evidence.mjs"), ...args], { env: { ...process.env, SKILLITON_DENYLIST: deny }, stdio: ["ignore", "pipe", "pipe"] }).toString() }; }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};

const home = "/Us" + "ers/someone/Desktop/Skilliton/packs/base/plugins/workflow";
const dash = String.fromCharCode(0x2014); // built at runtime so no literal dash exists in this repository
const fakeKey = "AKIA" + "TESTFAKE00000001";
const raw = {
  schemaVersion: 1, claudeVersion: "2.1.273", startedAt: "2026-09-16T17:35:49.176Z", durationSeconds: 12, costUsd: 0.5, partial: false,
  suite: { root: home, ablation: "with-without", threshold: 1, concurrency: 1, plugins: [{ name: "workflow", version: "0.2.4", path: home }] },
  aggregates: { casesTotal: 1, casesPassed: 1, overallScore: 1, overallPassRate: 1, meanDelta: 0.5 },
  cases: [{
    name: "demo-case", runsPerCase: 1, maxTurns: 5, promptMarkdown: `text ${dash} with a dash`,
    graders: [{ name: "judge", type: "llm", graderMarkdown: `rubric ${dash}` }, { name: "fired", type: "tool_used" }],
    aggregates: { score: 1, delta: 0.5 },
    arms: {
      with: [{ score: 1, passed: true, turns: 3, error: null, tracePath: "/private/tmp/e-x/out/trace.jsonl", skippedPaidGraders: false,
        graders: [{ name: "judge", passed: true, scored: true, explanation: `looks right ${dash} ${fakeKey}`, evidence: `# Handoff ${dash} ${home}`, judgeVotes: [true, true, false] }, { name: "fired", passed: true, scored: false }] }],
      without: [{ score: 0.5, passed: false, turns: 4, error: null, tracePath: "/private/tmp/e-y/out/trace.jsonl", skippedPaidGraders: false,
        graders: [{ name: "judge", passed: false, scored: true, explanation: "missing", judgeVotes: [false, false, false] }] }],
    },
  }],
};
const rawPath = join(tmp, "aggregate-result.json");
writeFileSync(rawPath, JSON.stringify(raw));
const sha = execFileSync("git", ["-C", join(here, ".."), "rev-parse", "HEAD"]).toString().trim();

console.log("== a result carrying a home path, dashes, and a key becomes clean evidence");
const out1 = join(tmp, "out1");
const r1 = run(rawPath, "--sha", sha, "--out", out1);
ok(r1.code === 0, `writes with exit 0 (got ${r1.code}: ${r1.out.trim().split("\n").pop()})`);
const summaryText = existsSync(join(out1, "summary.json")) ? readFileSync(join(out1, "summary.json"), "utf8") : "";
const mdText = existsSync(join(out1, "SUMMARY.md")) ? readFileSync(join(out1, "SUMMARY.md"), "utf8") : "";
ok(summaryText && mdText, "summary.json and SUMMARY.md exist");
for (const [label, needle] of [["the home path", "/Us" + "ers/"], ["a dash", dash], ["the fake key", fakeKey], ["the judge explanation", "looks right"], ["the trace path", "/private/tmp/e-x"]]) {
  ok(!summaryText.includes(needle) && !mdText.includes(needle), `${label} is not in the evidence`);
}
const s = summaryText ? JSON.parse(summaryText) : {};
ok(s.commit === sha, "the evidence is bound to the full commit sha");
ok(/^[0-9a-f]{64}$/.test(s.rawResultSha256 ?? ""), "the raw result is identified by its sha256");
ok(s.plugins?.[0]?.name === "workflow" && s.plugins?.[0]?.version === "0.2.4" && !("path" in (s.plugins?.[0] ?? {})), "plugin name and version kept, path dropped");
ok(s.cases?.[0]?.arms?.with?.[0]?.graders?.[0]?.passed === true && s.cases?.[0]?.arms?.without?.[0]?.graders?.[0]?.passed === false, "every grader's pass or fail per arm is kept");
ok(JSON.stringify(s.cases?.[0]?.arms?.with?.[0]?.graders?.[0]?.votes) === JSON.stringify(["PASS", "PASS", "FAIL"]), "judge votes are kept as PASS or FAIL only");
ok(s.cases?.[0]?.arms?.with?.[0]?.graders?.[1]?.scored === false, "indicator graders are marked unscored");
ok(/\| judge \| llm \| 1 of 1 \| 0 of 1 \|/.test(mdText), "SUMMARY.md tables pass counts per arm");

console.log("\n== refusals write nothing");
const notesBad = join(tmp, "notes.md");
writeFileSync(notesBad, `a note ${dash} with a dash\n`);
const out2 = join(tmp, "out2");
const r2 = run(rawPath, "--sha", sha, "--out", out2, "--notes", notesBad);
ok(r2.code === 2 && /scrub check/.test(r2.out), "notes that fail the scrub check are refused with exit 2");
ok(!existsSync(out2) || readdirSync(out2).length === 0, "and nothing is left behind");
const r3 = run(rawPath, "--sha", "0000000000000000000000000000000000000000", "--out", join(tmp, "out3"));
ok(r3.code === 2 && /not in this repository/.test(r3.out), "an unknown commit is refused");
writeFileSync(join(tmp, "bad.json"), "{ not json");
ok(run(join(tmp, "bad.json"), "--out", join(tmp, "out4")).code === 2, "invalid JSON is refused");
writeFileSync(join(tmp, "v2.json"), JSON.stringify({ schemaVersion: 2, cases: [] }));
ok(run(join(tmp, "v2.json"), "--out", join(tmp, "out5")).code === 2, "an unknown result format is refused");

console.log(fails ? `\nRESULT: FAIL (${fails} of ${fails + oks} checks failed)` : `\nRESULT: PASS (all ${oks} checks ok)`);
process.exit(fails ? 1 : 0);
