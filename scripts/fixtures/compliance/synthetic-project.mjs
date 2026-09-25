// synthetic-project.mjs: the synthetic project the control-sheet tests run on (scripts/compliance-sheet.test.mjs and
// scripts/compliance-words.test.mjs). A temporary repository with the baseline catalog, two observed records (one made
// stale by editing its source), one applicability decision, and a confirmed scope naming the six-control fixture
// library and one framework with no library here; beside it, a temporary frameworks folder holding the fixture
// library, its crosswalk to NIST CSF 2.0, and a fixed fixture baseline crosswalk.
//
// Expected states: fx-sign-in evidenced; fx-permissions partial (stale record); fx-sessions partial (one mapped control
// has no record); fx-backups not_started (no baseline control covers PR.DS-11); fx-logging not_applicable (the project
// decided SG-SECURITY-LOGGING does not apply); fx-clearinghouse not_applicable (its gate, answered at intake).

import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRecord, recordDecision } from "../../../packs/base/plugins/workflow/runtime/lib/security.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const CATALOG = join(REPO, "packs/base/plugins/workflow/catalogs/skillgate-baseline-2.json");

export const SCOPE = {
  schemaVersion: 1, decidedBy: "Fixture Reviewer", decidedAt: "2026-01-01T00:00:00.000Z",
  frameworks: [{ id: "fixture-framework", confidence: "strong", signals: [] }, { id: "pci-dss-v4", confidence: "moderate", signals: [] }],
  intake: { "fixture-entity-type": "provider" },
};

function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

export function makeSyntheticProject({ config = null } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "compliance-sheet-project-")));
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "compliance-sheet-frameworks-")));
  copyFileSync(join(HERE, "sheet", "fixture-framework.json"), join(dir, "fixture-framework.json"));
  copyFileSync(join(HERE, "sheet", "fixture-framework-to-nist-csf-2.json"), join(dir, "fixture-framework-to-nist-csf-2.json"));
  copyFileSync(join(HERE, "sheet", "baseline-crosswalk.json"), join(dir, "baseline-2-to-nist-csf-2.json"));
  mkdirSync(join(root, ".skilliton", "security"), { recursive: true });
  copyFileSync(CATALOG, join(root, ".skilliton", "security", "catalog.json"));
  if (config) write(root, ".skilliton/config.json", JSON.stringify(config, null, 2) + "\n");
  for (const name of ["sign-in", "access"]) {
    write(root, `src/${name}.txt`, `fixture source for ${name}\n`);
    write(root, `evidence/${name}.txt`, `fixture review of ${name}\n`);
  }
  const observed = (controlId, name) => createRecord(root, { controlId, assessment: "observed", note: `Fixture review of ${name}`,
    reviewer: "Fixture Reviewer", sources: [`src/${name}.txt`], artifacts: [`evidence/${name}.txt`] }, { apply: true }).id;
  const records = { signIn: observed("SG-AUTHENTICATION", "sign-in"), access: observed("SG-ACCESS-CONTROL", "access") };
  write(root, "src/access.txt", "fixture source for access, edited after the record\n");
  recordDecision(root, { controlId: "SG-SECURITY-LOGGING", applies: false, rationale: "Fixture: this project writes no logs of its own",
    decidedBy: "Fixture Reviewer" }, { apply: true });
  write(root, ".skilliton/compliance/scope.json", JSON.stringify(SCOPE, null, 2) + "\n");
  return { root, dir, records, cleanup: () => { rmSync(root, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); } };
}
