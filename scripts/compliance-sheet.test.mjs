#!/usr/bin/env node
// compliance-sheet.test.mjs: the baseline crosswalk and `skilliton compliance sheet` (lane N3).
//
// The shipped crosswalk maps each of the 15 baseline controls, and is marked unreviewed for the owner. The sheet runs on
// the synthetic project of scripts/fixtures/compliance/synthetic-project.mjs: every state appears, the counts add up,
// the rows name their records and what a person must supply, a second --apply changes zero rows and leaves the file
// byte-identical, and the same inputs give the same JSON.
//
//   node scripts/compliance-sheet.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SHEET_DISCLAIMER, SHEET_END, SHEET_START, STATES, computeSheet, renderBlock, sheetStatus, writeSheet,
} from "../packs/base/plugins/workflow/runtime/lib/compliance-sheet.mjs";
import { SCOPE_REL } from "../packs/base/plugins/workflow/runtime/lib/compliance-scope.mjs";
import { makeSyntheticProject } from "./fixtures/compliance/synthetic-project.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(REPO, "packs/base/plugins/workflow/runtime/skilliton.mjs");
const FRAMEWORKS = join(REPO, "packs/base/plugins/workflow/frameworks");
const CATALOG = JSON.parse(readFileSync(join(REPO, "packs/base/plugins/workflow/catalogs/skillgate-baseline-2.json"), "utf8"));
const BACKUPS = realpathSync(mkdtempSync(join(tmpdir(), "compliance-sheet-backups-")));

const cleanups = [() => rmSync(BACKUPS, { recursive: true, force: true })];
after(() => { for (const c of cleanups) c(); });
function synthetic(options) {
  const p = makeSyntheticProject(options);
  cleanups.push(p.cleanup);
  return p;
}
const cli = (p, args) => spawnSync(process.execPath, [CLI, "compliance", ...args, "--dir", p.root], {
  encoding: "utf8", env: { ...process.env, SKILLITON_FRAMEWORKS_DIR: p.dir, SKILLITON_BACKUPS: BACKUPS },
});
const rowsOf = (sheet) => Object.fromEntries(sheet.frameworks.flatMap((f) => f.controls.map((c) => [c.id, c])));

test("the shipped baseline crosswalk maps each of the 15 baseline controls, unreviewed until the owner signs it", () => {
  const walk = JSON.parse(readFileSync(join(FRAMEWORKS, "baseline-2-to-nist-csf-2.json"), "utf8"));
  assert.deepEqual(walk.meta, { from: "skillgate-baseline-2", to: "nist-csf-2", status: "draft" });
  assert.equal(walk.reviewed, false);
  assert.ok(Object.hasOwn(walk, "reviewedBy"));
  assert.deepEqual(walk.mappings.map((m) => m.control_id), CATALOG.controls.map((c) => c.id));
  assert.equal(walk.mappings.length, 15);
  const spine = readdirSync(FRAMEWORKS).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(readFileSync(join(FRAMEWORKS, n), "utf8")))
    .find((d) => d?.meta?.role === "spine");
  const spineIds = spine ? new Set(spine.functions.flatMap((f) => f.categories.flatMap((c) => c.subcategories.map((s) => s.id)))) : null;
  for (const m of walk.mappings) {
    assert.deepEqual(Object.keys(m), ["control_id", "csf", "strength", "reason"], m.control_id);
    assert.ok(m.csf.length > 0 && m.csf.every((id) => /^[A-Z]{2}\.[A-Z]{2}-\d{2}$/.test(id)), `${m.control_id}: CSF subcategory ids`);
    if (spineIds) assert.ok(m.csf.every((id) => spineIds.has(id)), `${m.control_id}: every id is in the shipped CSF spine`);
    assert.ok(["strong", "partial"].includes(m.strength), m.control_id);
    assert.ok(typeof m.reason === "string" && m.reason.length > 20 && !m.reason.includes("\n"), `${m.control_id}: a one-line reason`);
  }
});

test("the synthetic project's sheet: every state, the records behind each row, and exactly who needs a person and why", () => {
  const p = synthetic();
  const sheet = computeSheet(p.root, { dir: p.dir });
  const rows = rowsOf(sheet);
  assert.deepEqual(Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.state])), {
    "fx-sign-in": "evidenced", "fx-permissions": "partial", "fx-sessions": "partial",
    "fx-backups": "not_started", "fx-logging": "not_applicable", "fx-clearinghouse": "not_applicable",
  });
  for (const s of STATES) assert.ok(Object.values(rows).some((r) => r.state === s), `${s} appears`);
  assert.deepEqual(sheet.counts, { total: 6, evidenced: 1, partial: 2, not_started: 1, not_applicable: 2 });
  assert.equal(STATES.reduce((n, s) => n + sheet.counts[s], 0), sheet.counts.total);
  assert.deepEqual(rows["fx-sign-in"].records, [p.records.signIn]);
  assert.deepEqual(rows["fx-permissions"].records, [p.records.access]);
  assert.deepEqual(rows["fx-sessions"].records, [p.records.signIn]);
  assert.deepEqual(Object.values(rows).filter((r) => r.needsPerson).map((r) => r.id), ["fx-permissions", "fx-sessions", "fx-backups"]);
  assert.equal(rows["fx-permissions"].needsPerson.reason, "SG-ACCESS-CONTROL: its record is stale");
  assert.equal(rows["fx-sessions"].needsPerson.reason, "SG-SESSION-HANDLING: no record yet");
  assert.equal(rows["fx-backups"].needsPerson.reason, "no baseline security control covers its NIST CSF 2.0 subcategories (PR.DS-11)");
  assert.deepEqual(rows["fx-backups"].needsPerson.evidenceTypes, ["fx-backups written procedure", "fx-backups review record"]);
  assert.match(rows["fx-clearinghouse"].reason, /clearinghouse/);
  assert.equal(rows["fx-logging"].reason, "the project decided SG-SECURITY-LOGGING does not apply");
  const pci = sheet.frameworks.find((f) => f.id === "pci-dss-v4");
  assert.deepEqual([pci.library, pci.controls.length], [null, 0], "a scoped framework with no library is listed, not dropped");
  const block = renderBlock(sheet);
  assert.ok(block.includes("| fixture-framework: fx-backups | Fixture 2.1 | not started |  | no baseline security control covers its NIST CSF 2.0 "
    + "subcategories (PR.DS-11). Supply: fx-backups written procedure, fx-backups review record |"));
  assert.deepEqual(computeSheet(p.root, { dir: p.dir }), sheet, "the same inputs give the same sheet");
});

test("--apply writes the block with its parts; a second run changes zero rows and leaves the file byte-identical", () => {
  const p = synthetic();
  const first = writeSheet(p.root, { apply: true, dir: p.dir });
  assert.deepEqual([first.path, first.state, first.written, first.changedRows], ["docs/COMPLIANCE-CONTROLS.md", "missing", true, 6]);
  const text = readFileSync(join(p.root, first.path), "utf8");
  for (const part of [SHEET_START, "# Control record", "Generated by `skilliton compliance sheet --apply`", SHEET_DISCLAIMER,
    "Built by the company being assessed: no.", `Scope confirmed by Fixture Reviewer on 2026-01-01T00:00:00.000Z (${SCOPE_REL}).`,
    "## Frameworks in scope", "| fixture-framework | fixture-framework.json, version 0.0.1-fixture | 6 | 1 | 2 | 1 | 2 |",
    "| pci-dss-v4 | no library ships with Skilliton; a person assesses it separately | 0 | 0 | 0 | 0 | 0 |",
    "Where the evidence stands: 6 controls: 1 evidenced, 2 partial, 1 not started, 2 not applicable.",
    "| Control | Citation | State | Evidence | Needs a person |", "Inputs fingerprint: ", SHEET_END]) {
    assert.ok(text.includes(part), `the sheet has: ${part}`);
  }
  const second = writeSheet(p.root, { apply: true, dir: p.dir });
  assert.deepEqual([second.state, second.written, second.changedRows], ["current", false, 0]);
  assert.equal(readFileSync(join(p.root, first.path), "utf8"), text, "byte-identical");
  assert.deepEqual(sheetStatus(p.root, { dir: p.dir }), { state: "current", changedRows: 0, path: first.path });
  writeFileSync(join(p.root, "src/sign-in.txt"), "edited after the record\n");
  const moved = sheetStatus(p.root, { dir: p.dir });
  assert.deepEqual([moved.state, moved.changedRows], ["stale", 2], "fx-sign-in and fx-sessions change; fx-permissions was already partial");
});

test("text outside the markers is kept, the old file is backed up, and a doubled marker is refused", () => {
  const p = synthetic({ config: { compliance: { builtByCompany: true, sheetFile: "records/controls.md" } } });
  writeFileSync(join(p.root, "README.md"), "x\n");
  const rel = "records/controls.md";
  const before = "# Our controls\n\nWritten by hand.\n";
  writeSheet(p.root, { apply: true, dir: p.dir });
  const created = readFileSync(join(p.root, rel), "utf8");
  assert.ok(created.includes("Built by the company being assessed: yes."));
  writeFileSync(join(p.root, rel), `${before}\n${created}Kept after.\n`);
  const backups = [];
  writeFileSync(join(p.root, "src/access.txt"), "fixture source for access\n");
  const result = writeSheet(p.root, { apply: true, dir: p.dir, beforeReplace: (path) => { backups.push(path); return "backup-path"; } });
  assert.deepEqual([result.written, result.changedRows, result.backup], [true, 1, "backup-path"]);
  assert.deepEqual(backups, [join(p.root, rel)]);
  const after2 = readFileSync(join(p.root, rel), "utf8");
  assert.ok(after2.startsWith(before) && after2.endsWith("Kept after.\n"));
  writeFileSync(join(p.root, rel), `${after2}\n${SHEET_START}\n`);
  assert.throws(() => writeSheet(p.root, { apply: true, dir: p.dir }), /doubled, unpaired or out of order/);
});

test("no confirmed scope: the sheet says so and lists nothing", () => {
  const p = synthetic();
  rmSync(join(p.root, SCOPE_REL));
  const sheet = computeSheet(p.root, { dir: p.dir });
  assert.deepEqual([sheet.frameworks, sheet.counts.total, sheet.scope], [[], 0, null]);
  assert.match(renderBlock(sheet), /No framework is in scope: there is no confirmed scope file/);
});

test("the command: --json prints computeSheet's result, the preview exits 1 until --apply writes, then 0", () => {
  const p = synthetic();
  const json = cli(p, ["sheet", "--json"]);
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), JSON.parse(JSON.stringify(computeSheet(p.root, { dir: p.dir }))));
  const preview = cli(p, ["sheet"]);
  assert.equal(preview.status, 1, preview.stderr);
  assert.match(preview.stdout, /docs\/COMPLIANCE-CONTROLS\.md is missing: 6 row\(s\) would change/);
  assert.match(preview.stdout, /fixture-framework: fx-backups: no baseline security control covers/);
  const applied = cli(p, ["sheet", "--apply"]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /Wrote docs\/COMPLIANCE-CONTROLS\.md: 6 row\(s\) changed\./);
  const again = cli(p, ["sheet", "--apply"]);
  assert.match(again.stdout, /is current: 0 rows changed, nothing written\./);
  assert.equal(cli(p, ["sheet"]).status, 0);
});
