// compliance-sheet.mjs: the control record. For each framework in the confirmed scope, every control of its library is
// walked to NIST CSF 2.0 (the library's own crosswalk), from CSF to the baseline security controls
// (frameworks/baseline-2-to-nist-csf-2.json), and from those to the project's security records and their freshness.
// docs/decisions/2026-09-25-compliance-lives-in-public-skilliton-as-39ef.md is the design.
//
// The security records, the applicability decisions and freshness are read only through lib/security.mjs
// (evaluateSecurity), never re-implemented here, and never written: frameworks are a layer that reads records.
//
// A row's state is one of evidenced (every mapped, applicable baseline control has a current observed record), partial
// (some do, or some have a record that is stale, expired or invalid), not_started (none), not_applicable (the control's
// own applicability gate, answered in the scope file's intake, or the project's decision that every mapped baseline
// control does not apply). A row that is not evidenced says what a person must supply. The sheet is an assessment of
// the evidence held, never a certification, and it says so.
//
// gatherInputs reads; projectSheet and renderBlock are pure over what it read, so the same inputs give the same sheet,
// byte for byte, and a second --apply changes nothing. Writes go through security-io's publish.

import { dirname } from "node:path";
import { resolveProject } from "./config.mjs";
import { evaluateSecurity } from "./security.mjs";
import { LIMIT, SecurityRefusal, canonical, digest, ensureDirectory, inspectPath, newBudget, publish, safeRead } from "./security-io.mjs";
import { ComplianceRefusal, SCOPE_REL, frameworksDir, loadFrameworksFolder, readScope } from "./compliance-scope.mjs";

export const SHEET_START = "<!-- skilliton:compliance-sheet:start -->";
export const SHEET_END = "<!-- skilliton:compliance-sheet:end -->";
export const STATES = ["evidenced", "partial", "not_started", "not_applicable"];
export const SHEET_DISCLAIMER = "This is an assessment of the evidence this project holds, not a certification, an attestation or a legal opinion. "
  + "The organization remains responsible for meeting each framework's requirements, and whether a framework applies to it is a legal "
  + "determination it makes with its counsel.";

const refuse = (message) => { throw new ComplianceRefusal(message); };
const sortedUnique = (list) => [...new Set(list)].sort();
const isList = Array.isArray;

// ---------- reading ----------

function checkLibrary(entry) {
  const gateOk = (g) => g === undefined || (g !== null && typeof g.question_id === "string" && isList(g.in_scope_answers));
  const ok = isList(entry.data.controls) && entry.data.controls.every((c) => c && typeof c.id === "string" && typeof c.citation === "string"
    && isList(c.evidence_types) && gateOk(c.applicability));
  if (!ok) refuse(`frameworks/${entry.file} is not a usable library: each control needs an id, a citation and evidence_types`);
}

function checkCrosswalk(entry) {
  const ok = entry.data && isList(entry.data.mappings) && entry.data.mappings.every((m) => m && typeof m.control_id === "string" && isList(m.csf));
  if (!ok) refuse(`frameworks/${entry.file} is not a usable crosswalk: each mapping needs a control_id and a csf list`);
}

// The baseline control rows from the security module: applicability, the latest record and its freshness. A project
// with no security catalog has no rows and says so; any other refusal (invalid evidence among them) reaches the caller.
function readBaseline(root, now) {
  try {
    const ev = evaluateSecurity(root, { now, budget: newBudget() });
    const rows = ev.rows.map((r) => ({ id: r.control.id, applies: r.applies, freshness: r.freshness, assessment: r.assessment, state: r.state,
      recordId: r.record?.id ?? null }));
    const invalid = "Some security evidence is invalid, so rows that rest on it are not evidenced. Run: skilliton security status";
    return { rows, warning: ev.result === "invalid" ? invalid : null };
  } catch (e) {
    if (e instanceof SecurityRefusal && e.code === "MISSING_CATALOG") {
      return { rows: [], warning: "This project has no security catalog (.skilliton/security/catalog.json), so no record can evidence a control." };
    }
    throw e;
  }
}

// Everything the sheet depends on, read once. dir: the frameworks folder (default: the plugin's own).
export function gatherInputs(root, { dir = frameworksDir(), now = Date.now() } = {}) {
  const project = resolveProject(root);
  const scope = readScope(root, { now });
  const folder = loadFrameworksFolder(dir);
  const inScope = (scope?.frameworks ?? []).map((f) => f.id);
  const libraries = {}, crosswalks = {};
  for (const id of inScope) {
    const lib = folder.libraries.get(id);
    if (!lib) continue;
    checkLibrary(lib);
    libraries[id] = lib;
    const walk = folder.crosswalks.get(id);
    if (walk) { checkCrosswalk(walk); crosswalks[id] = walk; }
  }
  if (folder.baseline) checkCrosswalk(folder.baseline);
  const baseline = readBaseline(root, now);
  return { scope, libraries, crosswalks, baselineCrosswalk: folder.baseline, baseline, compliance: project.compliance };
}

// ---------- the projection (pure) ----------

function gateSaysOut(gate, intake) {
  const answer = intake?.[gate.question_id];
  if (answer === undefined) return false; // unanswered stays in scope: an unassessed control must look unassessed
  const given = isList(answer) ? answer : [String(answer)];
  return !given.some((a) => gate.in_scope_answers.includes(a));
}

function baselineProblem(row) {
  if (!row) return "not in this project's security catalog";
  if (row.state === "current") return null;
  if (!row.recordId) return "no record yet";
  if (["stale", "expired", "invalid"].includes(row.freshness)) return `its record is ${row.freshness}`;
  return `its current record says ${row.state}`;
}

function controlRow(control, csfIds, csfIndex, baselineById, intake, library) {
  const base = { id: control.id, citation: control.citation, csf: csfIds, baselineControls: [], records: [] };
  const person = (reason) => ({ reason, evidenceTypes: [...control.evidence_types] });
  if (control.applicability && gateSaysOut(control.applicability, intake)) {
    const reason = String(control.applicability.scope_note ?? "outside the scope the intake answers set");
    return { ...base, state: "not_applicable", reason, needsPerson: null };
  }
  if (!library.crosswalk) return { ...base, state: "not_started", needsPerson: person("no crosswalk from this library to NIST CSF 2.0 ships with Skilliton") };
  if (!csfIds.length) return { ...base, state: "not_started", needsPerson: person("the library's crosswalk maps this control to no NIST CSF 2.0 subcategory") };
  const mapped = sortedUnique(csfIds.flatMap((id) => csfIndex.get(id) ?? []));
  if (!mapped.length) {
    return { ...base, state: "not_started", needsPerson: person(`no baseline security control covers its NIST CSF 2.0 subcategories (${csfIds.join(", ")})`) };
  }
  const applicable = mapped.filter((id) => baselineById.get(id)?.applies !== "no");
  const row = { ...base, baselineControls: mapped, records: sortedUnique(applicable.map((id) => baselineById.get(id)?.recordId).filter(Boolean)) };
  if (!applicable.length) return { ...row, state: "not_applicable", reason: `the project decided ${mapped.join(", ")} does not apply`, needsPerson: null };
  const problems = applicable.map((id) => [id, baselineProblem(baselineById.get(id))]).filter(([, p]) => p);
  if (!problems.length) return { ...row, state: "evidenced", needsPerson: null };
  const some = problems.length < applicable.length || problems.some(([, p]) => p.startsWith("its record is"));
  return { ...row, state: some ? "partial" : "not_started", needsPerson: person(problems.map(([id, p]) => `${id}: ${p}`).join("; ")) };
}

function countStates(rows) {
  const counts = { total: rows.length };
  for (const s of STATES) counts[s] = rows.filter((r) => r.state === s).length;
  return counts;
}

function frameworkEntry(id, inputs, csfIndex, baselineById) {
  const lib = inputs.libraries[id];
  if (!lib) return { id, library: null, version: null, attribution: null, controls: [], counts: countStates([]) };
  const walk = inputs.crosswalks[id];
  const csfOf = new Map();
  for (const m of walk?.data.mappings ?? []) csfOf.set(m.control_id, sortedUnique([...(csfOf.get(m.control_id) ?? []), ...m.csf]));
  const library = { crosswalk: Boolean(walk) };
  const controls = lib.data.controls.map((c) => controlRow(c, csfOf.get(c.id) ?? [], csfIndex, baselineById, inputs.scope.intake, library));
  const meta = lib.data.meta ?? {};
  return { id, library: lib.file, version: meta.version ?? null, attribution: lib.data.attribution ?? null, controls, counts: countStates(controls) };
}

// PURE: the sheet as data. The fingerprint covers every input the rendered sheet depends on.
export function projectSheet(inputs) {
  const csfIndex = new Map();
  for (const m of inputs.baselineCrosswalk?.data.mappings ?? []) for (const id of m.csf) csfIndex.set(id, [...(csfIndex.get(id) ?? []), m.control_id]);
  const baselineById = new Map(inputs.baseline.rows.map((r) => [r.id, r]));
  const ids = sortedUnique((inputs.scope?.frameworks ?? []).map((f) => f.id));
  const frameworks = inputs.scope ? ids.map((id) => frameworkEntry(id, inputs, csfIndex, baselineById)) : [];
  const warnings = [inputs.baseline.warning].filter(Boolean);
  if (!inputs.baselineCrosswalk) warnings.push("The baseline crosswalk is not installed with this plugin, so no record can evidence a control.");
  const crosswalk = { reviewed: inputs.baselineCrosswalk?.data.reviewed === true, reviewedBy: inputs.baselineCrosswalk?.data.reviewedBy ?? null };
  const fingerprintOf = {
    scope: inputs.scope, builtByCompany: inputs.compliance.builtByCompany, baseline: inputs.baseline.rows,
    files: [...Object.values(inputs.libraries), ...Object.values(inputs.crosswalks), inputs.baselineCrosswalk].filter(Boolean)
      .map((e) => [e.file, e.sha256]),
  };
  return {
    frameworks,
    inputsFingerprint: digest(canonical(fingerprintOf)),
    counts: countStates(frameworks.flatMap((f) => f.controls)),
    scope: inputs.scope ? { decidedBy: inputs.scope.decidedBy, decidedAt: inputs.scope.decidedAt } : null,
    crosswalk, warnings, builtByCompany: inputs.compliance.builtByCompany, sheetFile: inputs.compliance.sheetFile,
  };
}

export function computeSheet(root, options = {}) {
  return projectSheet(gatherInputs(root, options));
}

// ---------- rendering (pure) ----------

const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const STATE_WORDS = { evidenced: "evidenced", partial: "partial", not_started: "not started", not_applicable: "not applicable" };

export function countLine(counts) {
  return `Where the evidence stands: ${counts.total} controls: ${STATES.map((s) => `${counts[s]} ${STATE_WORDS[s]}`).join(", ")}.`;
}

function scopeLines(sheet) {
  if (!sheet.scope) return [`No framework is in scope: there is no confirmed scope file (${SCOPE_REL}). Run: skilliton compliance scope`];
  const who = `Scope confirmed by ${cell(sheet.scope.decidedBy)} on ${sheet.scope.decidedAt} (${SCOPE_REL}).`;
  return sheet.frameworks.length ? [who] : [who, "", "No framework is in scope."];
}

function frameworkTable(sheet) {
  if (!sheet.frameworks.length) return [];
  const lines = ["## Frameworks in scope", "", "| Framework | Library | Controls | Evidenced | Partial | Not started | Not applicable |",
    "|---|---|---|---|---|---|---|"];
  for (const f of sheet.frameworks) {
    const library = f.library ? cell(`${f.library}${f.version ? `, version ${f.version}` : ""}`)
      : "no library ships with Skilliton; a person assesses it separately";
    const c = f.counts;
    lines.push(`| ${f.id} | ${library} | ${c.total} | ${c.evidenced} | ${c.partial} | ${c.not_started} | ${c.not_applicable} |`);
  }
  const sources = sheet.frameworks.filter((f) => f.attribution).map((f) => `${f.id}: ${cell(f.attribution)}`);
  return sources.length ? [...lines, "", ...sources.map((s) => `Source of ${s}`), ""] : [...lines, ""];
}

export function rowLine(f, c) {
  const supply = c.needsPerson?.evidenceTypes.join(", ") || "evidence a person chooses";
  const needs = c.needsPerson ? `${c.needsPerson.reason}. Supply: ${supply}` : c.reason ? `nothing: ${c.reason}` : "nothing";
  return `| ${f.id}: ${c.id} | ${cell(c.citation)} | ${STATE_WORDS[c.state]} | ${c.records.join(", ")} | ${cell(needs)} |`;
}

// The block between the markers, markers included, ending without a new line.
export function renderBlock(sheet) {
  const lines = [SHEET_START, "# Control record", "",
    "Generated by `skilliton compliance sheet --apply` from the inputs fingerprinted at the end; the next run replaces everything between the markers.",
    "", SHEET_DISCLAIMER, "", `Built by the company being assessed: ${sheet.builtByCompany ? "yes" : "no"}.`, "", ...scopeLines(sheet)];
  if (!sheet.crosswalk.reviewed) lines.push("", "The crosswalk from the baseline security controls to NIST CSF 2.0 has not been reviewed yet.");
  else lines.push("", `The crosswalk from the baseline security controls to NIST CSF 2.0 was reviewed by ${cell(sheet.crosswalk.reviewedBy ?? "(no name)")}.`);
  for (const w of sheet.warnings) lines.push("", w);
  lines.push("", ...frameworkTable(sheet), countLine(sheet.counts), "", "## Controls", "");
  const rows = sheet.frameworks.flatMap((f) => f.controls.map((c) => rowLine(f, c)));
  if (rows.length) lines.push("| Control | Citation | State | Evidence | Needs a person |", "|---|---|---|---|---|", ...rows);
  else lines.push("No control to list.");
  lines.push("", `Inputs fingerprint: ${sheet.inputsFingerprint}`, SHEET_END);
  return lines.join("\n");
}

// ---------- the file ----------

// The rows of a block's controls table, by their first cell.
function tableRows(block) {
  const rows = new Map();
  const at = block.indexOf("\n## Controls\n");
  if (at < 0) return rows;
  for (const line of block.slice(at).split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| Control |")) continue;
    rows.set(line.slice(2, line.indexOf(" |", 2)), line);
  }
  return rows;
}

export function changedRowCount(oldBlock, newBlock) {
  const before = tableRows(oldBlock ?? ""), after = tableRows(newBlock);
  let changed = 0;
  for (const [key, line] of after) if (before.get(key) !== line) changed++;
  for (const key of before.keys()) if (!after.has(key)) changed++;
  return changed;
}

// The file's current bytes and the block between its markers; refuses a marker that is doubled or out of order.
function readSheetFile(root, rel) {
  if (!inspectPath(root, rel)) return { bytes: null, text: null, block: null };
  const bytes = safeRead(root, rel, LIMIT.backlog, newBudget());
  const text = bytes.toString("utf8");
  const starts = text.split(SHEET_START).length - 1, ends = text.split(SHEET_END).length - 1;
  if (starts === 0 && ends === 0) return { bytes, text, block: null };
  const s = text.indexOf(SHEET_START), e = text.indexOf(SHEET_END);
  if (starts !== 1 || ends !== 1 || e < s) refuse(`${rel} has a compliance-sheet start or end marker that is doubled, unpaired or out of order`);
  return { bytes, text, block: text.slice(s, e + SHEET_END.length) };
}

function plan(root, options) {
  const sheet = computeSheet(root, options);
  const rel = sheet.sheetFile;
  const file = readSheetFile(root, rel);
  const block = renderBlock(sheet);
  let next;
  if (file.block !== null) next = file.text.replace(file.block, () => block);
  else if (file.text !== null) next = `${file.text.replace(/\n*$/, "")}\n\n${block}\n`;
  else next = `${block}\n`;
  return { sheet, rel, file, block, next, changedRows: changedRowCount(file.block, block) };
}

// missing: no file or no block; current: the block is what a run would write; stale: it differs.
export function sheetStatus(root, options = {}) {
  const p = plan(root, options);
  if (p.file.block === null) return { state: "missing", changedRows: p.changedRows, path: p.rel };
  return { state: p.file.block === p.block ? "current" : "stale", changedRows: p.changedRows, path: p.rel };
}

// Without apply, reads only. beforeReplace(absolutePath) runs before an existing file is replaced (the command backs
// it up there). A file whose bytes would not change is not written.
export function writeSheet(root, { apply = false, beforeReplace = null, ...options } = {}) {
  const p = plan(root, options);
  const due = p.file.text !== p.next;
  let backup = null;
  if (apply && due) {
    const parent = dirname(p.rel) === "." ? null : dirname(p.rel);
    if (parent) ensureDirectory(root, parent);
    if (p.file.bytes && beforeReplace) backup = beforeReplace(`${root}/${p.rel}`);
    publish(root, p.rel, p.next, "replace", { expected: p.file.bytes, tempDir: parent, fileMode: 0o644 });
  }
  const state = p.file.block === null ? "missing" : p.file.block === p.block ? "current" : "stale";
  return { changedRows: p.changedRows, path: p.rel, state, written: apply && due, due, backup, sheet: p.sheet };
}
