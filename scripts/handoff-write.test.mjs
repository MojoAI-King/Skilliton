// handoff-write.test.mjs: the pure functions of the workflow runtime's handoff engine
// (packs/base/plugins/workflow/runtime/lib/handoff.mjs), which `skilliton checkpoint --handoff` writes the shared
// handoff record with (docs/CONTRACTS.md section 3). Parse and render round-trip this repository's own layout, the
// rotation keeps five Earlier entries and returns the rest for the archive, the archive prepend lands below the
// header, the Written format reads back through the runtime's own parser, and each refusal names its cause.
// Run: node --test scripts/handoff-write.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const LIB = join(REPO, "packs", "base", "plugins", "workflow", "runtime", "lib");
const h = await import(pathToFileURL(join(LIB, "handoff.mjs")).href);
const { parseWritten } = await import(pathToFileURL(join(LIB, "lifecycle.mjs")).href);

const bullets = (state, next) => [`- **State:** ${state}`, `- **Next:** ${next}`, "- **Blocked:** nothing", "- **Watch out:** nothing known"];
const fixture = [
  "# Handoff", "", "Kind: Living.", "", "A sentence a person added above the note.", "",
  "## RESUME HERE", "", "Written: 2026-09-18 22:58 EDT", "",
  "- **State:** Published.", "- **Next:**", "  1. First.", "  2. Second.", "- **Blocked:** waiting on the owner", "- **Watch out:** the suite is slow", "",
  "## Earlier", "",
  "### 2026-09-18 16:40 EDT", "- **State:** Older note.", "- **Next:** was next.", "",
  "### 2026-09-17 13:31 EDT", "", "- **State:** Even older, with a blank line after its heading.", "",
  "## Something else", "", "Kept where it is.", "",
].join("\n");

test("parse and render round-trip this repository's handoff, the fixture, and a CRLF file byte for byte", () => {
  for (const text of [readFileSync(join(REPO, "docs", "HANDOFF.md"), "latin1"), fixture, fixture.replace(/\n/g, "\r\n")]) {
    const parsed = h.parseHandoff(text);
    assert.equal(h.renderHandoff(parsed), text);
  }
  const parsed = h.parseHandoff(fixture);
  assert.equal(parsed.resume.written, "2026-09-18 22:58 EDT");
  assert.deepEqual(parsed.head, ["# Handoff", "", "Kind: Living.", "", "A sentence a person added above the note."]);
  assert.deepEqual(parsed.earlier.entries.map((e) => e.heading), ["2026-09-18 16:40 EDT", "2026-09-17 13:31 EDT"]);
  assert.deepEqual(parsed.tail, ["## Something else", "", "Kept where it is."]);
  assert.deepEqual(h.handoffBullets(parsed), { State: "Published.", Next: "1. First. 2. Second.", Blocked: "waiting on the owner", "Watch out": "the suite is slow" });
  const fenced = h.parseHandoff(["# Handoff", "", "```", "## RESUME HERE", "```", "", "## RESUME HERE", "", "Written: 2026-01-01T00:00Z", "", "- **State:** real."].join("\n"));
  assert.equal(fenced.resume.written, "2026-01-01T00:00Z", "a heading inside a code fence is text");
  assert.deepEqual(fenced.head.slice(0, 3), ["# Handoff", "", "```"]);
  assert.equal(h.parseHandoff("# Handoff\n\nKind: Living.\n").resume, null);
});

test("rotation puts the previous note first under Earlier, keeps five, and returns the overflow oldest last", () => {
  const first = h.rotateHandoff(h.parseHandoff(fixture), { written: "2026-09-19 00:10 EDT", bullets: bullets("New.", "Next.") });
  assert.equal(first.rotated, "2026-09-18 22:58 EDT");
  assert.equal(first.dropped, false);
  assert.deepEqual(first.archived, []);
  assert.deepEqual(first.parsed.earlier.entries.map((e) => e.heading), ["2026-09-18 22:58 EDT", "2026-09-18 16:40 EDT", "2026-09-17 13:31 EDT"]);
  assert.deepEqual(first.parsed.earlier.entries[0].lines, ["- **State:** Published.", "- **Next:**", "  1. First.", "  2. Second.", "- **Blocked:** waiting on the owner", "- **Watch out:** the suite is slow"], "the Written line is not repeated in the entry");
  const rendered = h.renderHandoff(first.parsed);
  assert.ok(rendered.startsWith("# Handoff\n\nKind: Living.\n\nA sentence a person added above the note.\n\n## RESUME HERE\n\nWritten: 2026-09-19 00:10 EDT\n\n- **State:** New.\n"), rendered);
  assert.ok(rendered.endsWith("\n## Something else\n\nKept where it is.\n"), "a section after Earlier stays where it is");
  assert.ok(rendered.includes("### 2026-09-17 13:31 EDT\n\n- **State:** Even older"), "a blank line a person left after an Earlier heading is kept");

  let parsed = h.parseHandoff(fixture);
  const headings = [];
  for (let i = 1; i <= 6; i++) {
    const written = `2026-09-19 0${i}:00 EDT`;
    const r = h.rotateHandoff(parsed, { written, bullets: bullets(`Note ${i}.`, "n") });
    headings.push(r.parsed.earlier.entries.map((e) => e.heading));
    if (i < 4) assert.deepEqual(r.archived, [], `rotation ${i} archives nothing yet`);
    if (i === 4) assert.deepEqual(r.archived.map((e) => e.heading), ["2026-09-17 13:31 EDT"], "the sixth entry is the oldest");
    if (i === 6) assert.deepEqual(r.archived.map((e) => e.heading), ["2026-09-18 22:58 EDT"], "the sixth rotation archives the note the fixture started with");
    assert.ok(r.parsed.earlier.entries.length <= h.KEEP_EARLIER);
    parsed = r.parsed;
  }
  assert.deepEqual(headings[5], ["2026-09-19 05:00 EDT", "2026-09-19 04:00 EDT", "2026-09-19 03:00 EDT", "2026-09-19 02:00 EDT", "2026-09-19 01:00 EDT"]);
  assert.equal(h.parseHandoff(h.renderHandoff(parsed)).earlier.entries.length, 5);

  const placeholder = h.rotateHandoff(h.parseHandoff("# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: not yet assessed\n\n- **State:** Skilliton created this project's records.\n\n## Earlier\n"), { written: "2026-09-19T05:00Z", bullets: bullets("Real.", "n") });
  assert.equal(placeholder.dropped, true);
  assert.equal(placeholder.rotated, null);
  assert.deepEqual(placeholder.parsed.earlier.entries, [], "the placeholder preparation wrote is replaced, not kept");

  const noEarlier = h.rotateHandoff(h.parseHandoff("# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: 2026-09-01 10:00 EDT\n\n- **State:** Only note.\n"), { written: "2026-09-02 10:00 EDT", bullets: bullets("Second.", "n") });
  assert.equal(h.renderHandoff(noEarlier.parsed), "# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: 2026-09-02 10:00 EDT\n\n- **State:** Second.\n- **Next:** n\n- **Blocked:** nothing\n- **Watch out:** nothing known\n\n## Earlier\n\n### 2026-09-01 10:00 EDT\n- **State:** Only note.\n", "an Earlier section is created when there was none");
});

test("archive prepend lands below the header of a template archive and above the first entry of a filled one", () => {
  const entries = [{ heading: "2026-09-19 01:00 EDT", lines: ["- **State:** One."] }, { heading: "2026-09-18 22:58 EDT", lines: ["- **State:** Two."] }];
  const template = "# Handoff archive\n\nKind: Reference. The current handoff is `docs/HANDOFF.md`.\n\nNo earlier handoffs have been archived.\n";
  assert.equal(h.prependArchive(template, entries), "# Handoff archive\n\nKind: Reference. The current handoff is `docs/HANDOFF.md`.\n\n### 2026-09-19 01:00 EDT\n- **State:** One.\n\n### 2026-09-18 22:58 EDT\n- **State:** Two.\n");
  const filled = "# Handoff archive\n\nKind: Reference. The current handoff is `docs/HANDOFF.md`.\n\nSuperseded notes, newest first.\n\n### 2026-09-17 13:09 EDT\n- **State:** Old.\n";
  assert.equal(h.prependArchive(filled, entries.slice(0, 1)), "# Handoff archive\n\nKind: Reference. The current handoff is `docs/HANDOFF.md`.\n\nSuperseded notes, newest first.\n\n### 2026-09-19 01:00 EDT\n- **State:** One.\n\n### 2026-09-17 13:09 EDT\n- **State:** Old.\n");
  assert.equal(h.prependArchive(filled, []), filled, "no entries, no change");
  const crlf = template.replace(/\n/g, "\r\n");
  assert.ok(h.prependArchive(crlf, entries).includes("\r\n### 2026-09-19 01:00 EDT\r\n- **State:** One.\r\n\r\n### "), "the archive keeps its line ending");
  const real = readFileSync(join(REPO, "docs", "HANDOFF_ARCHIVE.md"), "latin1");
  const out = h.prependArchive(real, entries.slice(0, 1));
  assert.ok(out.indexOf("### 2026-09-19 01:00 EDT") < out.indexOf("### 2026-09-17"), "new entries go above this repository's existing ones");
  assert.ok(out.startsWith(real.split("### ")[0]), "the header of this repository's archive is untouched");
});

test("formatWritten reads back through parseWritten to the same minute, in the local zone or as UTC", () => {
  const now = new Date();
  const written = h.formatWritten(now);
  const parsed = parseWritten(written);
  assert.ok(parsed.ok, `${written}: ${parsed.reason}`);
  assert.equal(Math.floor(parsed.at.getTime() / 60000), Math.floor(now.getTime() / 60000));
  assert.match(written, /^\d{4}-\d\d-\d\d(?: \d\d:\d\d [A-Z]{1,4}|T\d\d:\d\dZ)$/);
  const utc = `${now.toISOString().slice(0, 16)}Z`;
  const back = parseWritten(utc);
  assert.ok(back.ok && Math.floor(back.at.getTime() / 60000) === Math.floor(now.getTime() / 60000), "the UTC fallback form is readable too");
});

test("stateBullet folds the evidence in, and resolveBullets carries a real value over but never a placeholder", () => {
  assert.equal(h.stateBullet({ state: "Half done", evidence: "tests pass" }), "Half done. Evidence: tests pass.");
  assert.equal(h.stateBullet({ state: "Half done.", evidence: "tests pass!" }), "Half done. Evidence: tests pass!");
  assert.equal(h.stateBullet({ state: "Half done", evidence: undefined }), "Half done");
  assert.equal(h.stateBullet({ state: "Half done", evidence: " " }), "Half done");
  assert.deepEqual(h.resolveBullets({}, { Blocked: "waiting", "Watch out": "not yet written" }), { bullets: { Blocked: "waiting", "Watch out": "nothing known" }, carried: ["Blocked"], defaulted: ["Watch out"] });
  assert.deepEqual(h.resolveBullets({ Blocked: "given" }, { Blocked: "waiting", "Watch out": "Not yet assessed." }), { bullets: { Blocked: "given", "Watch out": "nothing known" }, carried: [], defaulted: ["Watch out"] });
  assert.deepEqual(h.resolveBullets({}, {}), { bullets: { Blocked: "nothing", "Watch out": "nothing known" }, carried: [], defaulted: ["Blocked", "Watch out"] });
});

test("checkResumeAge refuses a missing section, a missing or unreadable Written, and one ahead of the clock", () => {
  const at = new Date("2026-09-19T04:00:00Z");
  const check = (text) => h.checkResumeAge(h.parseHandoff(text), { rel: "docs/HANDOFF.md", at });
  const refused = (text, pattern) => assert.throws(() => check(text), (e) => e.constructor.name === "Refused" && pattern.test(e.message) && /Nothing was written/.test(e.message) ? true : (() => { throw new Error(`${e.constructor.name}: ${e.message}`); })());
  refused("# Handoff\n\nKind: Living.\n", /has no "## RESUME HERE" section/);
  refused("# Handoff\n\n## RESUME HERE\n\n- **State:** x\n", /has no "Written:" line/);
  refused("# Handoff\n\n## RESUME HERE\n\nWritten: yesterday\n", /the Written value could not be read/);
  refused("# Handoff\n\n## RESUME HERE\n\nWritten: 2026-09-19T04:06Z\n", /later than this machine's clock .* by more than 5 minutes/);
  assert.deepEqual(check("# Handoff\n\n## RESUME HERE\n\nWritten: 2026-09-19T04:04Z\n"), { placeholder: false, writtenAt: new Date("2026-09-19T04:04:00Z") }, "four minutes ahead is within the allowed skew");
  assert.deepEqual(check("# Handoff\n\n## RESUME HERE\n\nWritten: not yet assessed\n"), { placeholder: true, writtenAt: null });
});

test("this test file holds no forbidden dash characters or home paths", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.doesNotMatch(text, /[\u2013\u2014]/);
  assert.doesNotMatch(text, /\/Users\/|\/home\//);
});
