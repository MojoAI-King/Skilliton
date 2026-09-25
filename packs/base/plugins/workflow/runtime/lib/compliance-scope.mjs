// compliance-scope.mjs: which compliance frameworks a project's own files point at, and the scope a named person
// confirmed. docs/decisions/2026-09-25-compliance-lives-in-public-skilliton-as-39ef.md is the design.
//
// A port of MojoComply's scope scanner (engine/src/scope.ts): the same seven root files and one level of workspace
// manifests, the same 512 KB cap, negation window and three hits per signal, the same 21 detectors, and the same
// scoring, timing, confidence and recording gate. The knowledge base is read from the plugin's own
// frameworks/scope-kb.json (MojoComply's scoping/applicability.yaml, converted with its keys unchanged); MojoComply
// itself is never read at run time.
//
// Nothing here decides that a framework applies to an organization: that is a legal determination the organization
// makes with its counsel. A proposal is a list of observations with the file and line of each, and absence of a
// signal is only ever "nothing observable pointed at it". Nothing is recorded without a named person.
//
// Reads: the scanned files of one project (through security-io, which never follows a symbolic link and refuses hard
// links), and JSON files inside the plugin's frameworks folder. Writes: .skilliton/compliance/scope.json and
// .skilliton/compliance/proposal.json, only through security-io's publish. Nothing here prints.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "./core.mjs";
import { SecurityRefusal, digest, ensureDirectory, inspectPath, newBudget, publish, safeRead, textFieldProblem } from "./security-io.mjs";

export const COMPLIANCE_DIR = ".skilliton/compliance";
export const SCOPE_REL = `${COMPLIANCE_DIR}/scope.json`;
export const PROPOSAL_REL = `${COMPLIANCE_DIR}/proposal.json`;
export const KB_FILE = "scope-kb.json";
export const BASELINE_CROSSWALK = "baseline-2-to-nist-csf-2.json";
const STATE_LIMIT = 1024 * 1024;

// kind "invalid": bad input or data (the command exits 2); "failed": the file system failed (exit 3).
export class ComplianceRefusal extends Error {
  constructor(message, kind = "invalid") { super(message); this.kind = kind; }
}
const refuse = (message, kind = "invalid") => { throw new ComplianceRefusal(message, kind); };

// SKILLITON_FRAMEWORKS_DIR names another frameworks folder: the tests use it, and so can a fork that ships its own.
export const frameworksDir = () => process.env.SKILLITON_FRAMEWORKS_DIR || join(PLUGIN_ROOT, "frameworks");

const byKey = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const byId = byKey("id"), byFile = byKey("file");

// ---------- detectors (scope.ts :131-382, unchanged patterns) ----------

// Acronym patterns are case-sensitive on purpose, so "ACH" never matches "each" and "PAN" never matches "pans".
export const SIGNAL_DETECTORS = [
  { id: "payment-card-acceptance", patterns: [
    /(?<!magnetic[ -])\bstripe\b/gi, // "magnetic stripe" is a card-data term, not a processor
    /\bbraintree\b/gi, /\badyen\b/gi, /\bauthorize\.net\b/gi, /\bworldpay\b/gi, /\bcheckout\.com\b/gi,
    /\bsquare (payments?|sdk|terminal)\b/gi, /\bpayment (processor|gateway|provider)\b/gi, /\b(credit|debit|payment) cards?\b/gi,
    /\bcard payments?\b/gi, /\bmerchant account\b/gi] },
  { id: "payment-page-fully-outsourced", patterns: [
    /\bstripe checkout\b/gi, /\bhosted (checkout|payment page|payment form)\b/gi, /\bcheckout session\b/gi, /\btokeni[sz]ed\b/gi,
    /\btokeni[sz]ation\b/gi, /\bno card data\b/gi, /\bcard data (never|does not) (touch|reach)\w*/gi,
    /\bredirects? to the (payment )?(processor|gateway)\b/gi, /\bpayment links?\b/gi,
    /\bSAQ[ -]?A\b(?![ -]?EP)/g] }, // SAQ A, never SAQ A-EP
  { id: "payment-page-on-merchant-site", patterns: [
    /\bhosted fields\b/gi, /\bpayment element\b/gi, /\bstripe elements\b/gi, /\bembedded (payment|card) (form|field)\w*/gi,
    /\bdirect post\b/gi, /\bSAQ[ -]?A[ -]?EP\b/g] },
  { id: "card-data-handled-directly", patterns: [
    /\bprimary account numbers?\b/gi, /\bPAN\b/g, /\bsensitive authentication data\b/gi, /\bSAD\b/g, /\bcardholder data( environment)?\b/gi,
    /\bcard verification (value|code)\b/gi, /\bCVV\b/g, /\bmagnetic[ -]stripe\b/gi, /\btrack [12] data\b/gi, /\bcard numbers?\b/gi,
    /\bSAQ[ -]?D\b/g] },
  { id: "card-present-terminal", patterns: [
    /\bcard[ -]present\b/gi, /\bpoint[ -]of[ -]sale terminals?\b/gi, /\bPOS terminals?\b/gi,
    /\b(chip|contactless|card)[ -]readers?\b(?![^.\n]*\b(sd|memory|rfid badge)\b)/gi, /\bpoint[ -]to[ -]point encryption\b/gi,
    /\bP2PE\b/g, /\bEMV\b/g] },
  { id: "ephi-handling", patterns: [
    /\bePHI\b/g, /\bPHI\b/g, /\bprotected health information\b/gi, /\bhealth information\b/gi,
    /\bpatient (records?|charts?|data|information)\b/gi, /\belectronic health records?\b/gi, /\bEHR\b/g, /\bEMR\b/g,
    /\bmedical records?\b/gi, /\bclinical (data|records?)\b/gi, /\bHL7\b/g, /\bFHIR\b/g] },
  { id: "business-associate-agreement-present", patterns: [/\bbusiness associate agreements?\b/gi, /\bbusiness associates?\b/gi, /\bBAAs?\b/g] },
  { id: "consumer-health-data", patterns: [
    /\bconsumer health data\b/gi, /\bmed[ -]?spa\b/gi, /\bwellness (app|data|program|platform|records?)\b/gi,
    /\bfitness (tracking|data|app)\b/gi, /\bmental (health|wellness) (app|platform|data)\b/gi, /\bmy health my data\b/gi,
    /\bsymptom (tracking|log)\w*/gi, /\bbiometric (health|wellness)\b/gi] },
  { id: "substance-use-disorder-program", patterns: [
    /\bsubstance use disorder\b/gi, /\bopioid treatment program\b/gi, /\bmedication[ -]assisted treatment\b/gi,
    /\bdetox(ification)? program\b/gi, /\brecovery program\b/gi, /\bpart 2 program\b/gi] },
  { id: "multi-tenant-architecture", patterns: [
    /\bmulti[ -]?tenan(t|cy)\b/gi, /\btenant[_ -]?id\b/gi, /\bper[ -]tenant\b/gi, /\btenant (isolation|boundary|context)\b/gi] },
  { id: "service-delivered-to-third-party-customers", patterns: [
    /\blicens(?:ed|able|ing)[ -](?:out|to other)\b/gi, /\bwhite[ -]label\w*/gi, /\bresell\w*/gi,
    /\bother (retailers|customers|organi[sz]ations|tenants|firms|practices)\b/gi, /\bcustomer organi[sz]ations?\b/gi,
    /\bSaaS (offering|product|platform|business)\b/gi] },
  { id: "customer-security-assurance-demand", patterns: [
    /\bSOC\s*2\s+(report|examination|type\s*(i{1,2}\b|[12]\b))/gi, /\bvendor security (questionnaire|review|assessment)\b/gi,
    /\bsecurity questionnaires?\b/gi, /\bcustomer security review\b/gi, /\bdue diligence questionnaires?\b/gi] },
  { id: "nonbank-financial-activity", patterns: [
    /\bconsumer loans?\b/gi,
    /\b(consumer lending|lending business|loan origination|mortgage lending)\b/gi, // "book lending platform" stays out
    /\bloan servicing\b/gi, /\bmortgages?\b/gi, /\bdebt collection\b/gi, /\btax preparation\b/gi, /\bmoney transmi\w+/gi,
    /\bcheck cashing\b/gi, /\binvestment advis\w+/gi, /\bpayday\b/gi, /\bfinance company\b/gi, /\b(consumer|installment) financing\b/gi] },
  { id: "customer-financial-account-data", patterns: [
    /\brouting numbers?\b/gi, /\bbank account numbers?\b/gi, /\bACH\b/g, /\bcredit applications?\b/gi, /\bconsumer reports?\b/gi,
    /\bcredit bureaus?\b/gi] },
  { id: "ny-regulated-financial-entity", patterns: [
    /\bNYDFS\b/g, /\b23 NYCRR\b/g, /\bNew York (State )?Department of Financial Services\b/gi,
    /\bNew York (banking|insurance|virtual currency) licen[cs]e\b/gi, /\binsurance producers?\b/gi] },
  { id: "legal-practice-matter-data", patterns: [
    /\battorney[ -]client\b/gi, /\blaw firms?\b/gi, /\bmatter management\b/gi, /\bconflicts? check\w*/gi, /\bIOLTA\b/g,
    /\btrust accounting\b/gi, /\bclient matters?\b/gi, /\blegal practice\b/gi] },
  { id: "consumer-personal-information-at-scale", patterns: [
    /\bpersonally identifiable information\b/gi,
    /\bPII\b(?=[^.\n]*\b(resident|consumer|state|privacy law|opt[- ]out)\b)/g, // bare "PII" is too generic on its own
    /\bconsumer (personal )?(data|information)\b/gi, /\bcustomer (personal data|personal information|contact data|records?)\b/gi,
    /\bdata subject (access )?requests?\b/gi, /\bright to (delete|erasure)\b/gi, /\bopt[ -]out of (the )?sale\b/gi, /\bdo not sell\b/gi] },
  { id: "eu-uk-personal-data", patterns: [
    /\bGDPR\b/g, /\bdata protection officer\b/gi, /\bstandard contractual clauses\b/gi, /\bEuropean Economic Area\b/gi, /\bEEA\b/g,
    /\bEU (users|customers|residents|data subjects)\b/gi] },
  { id: "controlled-unclassified-information", patterns: [
    /\bcontrolled unclassified information\b/gi, /\bCUI\b/g, /\bDFARS\b/g, /\bCMMC\b/g, /\b800[ -]171\b/g, /\bDoD contracts?\b/g] },
  { id: "iso-27001-demand", patterns: [/\bISO[\/ -]?(IEC[\/ -]?)?27001\b/gi, /\bISMS\b/g, /\binformation security management system\b/gi] },
  { id: "federally-regulated-depository-institution", patterns: [
    /\bFDIC\b/g, /\bNCUA\b/g, /\bOCC\b/g, /\bcredit unions?\b/gi, /\bchartered banks?\b/gi, /\bstate[ -]chartered\b/gi] },
];

// ---------- the files a scan reads (scope.ts :386-413) ----------

// Bounded on purpose: the compliance surface is described in a project's own documents and manifests, not its source.
export const SCAN_ROOT_FILES = [".mojocomply.yaml", "CLAUDE.md", "COMPLIANCE.md", "README.md", "README.txt", "SECURITY.md", "package.json"];
export const SCAN_WORKSPACE_DIRS = ["apps", "packages", "services", "workers"];
export const MAX_FILE_BYTES = 512 * 1024;
const MAX_EVIDENCE_PER_SIGNAL = 3;
const MAX_MATCH_CHARS = 120;
const OVER_CAP = "larger than 512 KB, so it was not read";

// "no card data", "handles no health information" and "Not handled: payment card data" do not raise a signal. The
// window stops at a sentence end, a new line, and a contrastive clause ("we never store the PAN, but our server posts
// the card number" is an affirmative signal).
const NEGATION_WINDOW = 80;
const NEGATION = new RegExp(String.raw`\b(no|not|never|none|cannot|can't|does\s+not|doesn't|is\s+not|isn't|are\s+not|aren't|without|excludes?|`
  + String.raw`out\s+of\s+scope|n\/a)\b(?:(?!\b(?:but|however|although|though|except|whereas)\b)[^.!?\n;])*$`, "i");
const isNegated = (text, index) => NEGATION.test(text.slice(Math.max(0, index - NEGATION_WINDOW), index));

const SKIP_REASONS = { SYMLINK_REFUSED: "a symbolic link, which is never followed", UNSAFE_PATH: "a name or path Skilliton does not read" };

function probe(root, rel) {
  try { return { stat: inspectPath(root, rel) }; } catch (e) {
    if (e instanceof SecurityRefusal) return { skip: SKIP_REASONS[e.code] ?? "could not be inspected safely" };
    throw e;
  }
}

// The files this scan may read, sorted, and every candidate it will not read with the reason (a symbolic link, a file
// over the cap, something that is not a regular single-link file). Nothing outside the project is ever touched.
export function scanTargets(root) {
  const files = [], skipped = [];
  const consider = (rel) => {
    const p = probe(root, rel);
    if (p.skip) skipped.push({ file: rel, reason: p.skip });
    else if (!p.stat) return;
    else if (!p.stat.isFile() || p.stat.nlink !== 1) skipped.push({ file: rel, reason: "not a regular file with one link" });
    else if (p.stat.size > MAX_FILE_BYTES) skipped.push({ file: rel, reason: OVER_CAP });
    else files.push({ file: rel, mtimeMs: p.stat.mtimeMs });
  };
  for (const f of SCAN_ROOT_FILES) consider(f);
  for (const dir of SCAN_WORKSPACE_DIRS) {
    const d = probe(root, dir);
    if (d.skip) { skipped.push({ file: dir, reason: d.skip }); continue; }
    if (!d.stat?.isDirectory()) continue;
    let entries;
    try { entries = readdirSync(join(root, dir)).sort(); } catch { skipped.push({ file: dir, reason: "could not be listed" }); continue; }
    for (const entry of entries) {
      const e = probe(root, `${dir}/${entry}`);
      if (e.skip) skipped.push({ file: `${dir}/${entry}`, reason: e.skip });
      else if (e.stat?.isDirectory()) consider(`${dir}/${entry}/package.json`);
    }
  }
  return { files: files.sort(byFile), skipped: skipped.sort(byFile) };
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (index) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Sorted by file, line and phrase; the same phrase twice on one line (two patterns, one fact) counts once; at most three.
function capEvidence(list) {
  const cmp = (a, b) => byFile(a, b) || a.line - b.line || (a.match < b.match ? -1 : a.match > b.match ? 1 : 0);
  const sorted = [...list].sort(cmp);
  const unique = sorted.filter((e, i) => i === 0 || e.file !== sorted[i - 1].file || e.line !== sorted[i - 1].line
    || e.match.toLowerCase() !== sorted[i - 1].match.toLowerCase());
  return unique.slice(0, MAX_EVIDENCE_PER_SIGNAL);
}

// Each signal with where it was seen: the file, the line and the matched phrase only, never the surrounding text.
export function extractSignals(root, files, budget = newBudget()) {
  const hits = new Map(), skipped = [];
  for (const { file } of files) {
    let text;
    try { text = safeRead(root, file, MAX_FILE_BYTES, budget).toString("utf8"); } catch (e) {
      if (!(e instanceof SecurityRefusal)) throw e;
      skipped.push({ file, reason: e.code === "INPUT_LIMIT" ? OVER_CAP : "changed or could not be read safely" });
      continue;
    }
    const lineOf = lineIndex(text);
    for (const detector of SIGNAL_DETECTORS) {
      for (const pattern of detector.patterns) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(text)) !== null) {
          if (m[0].length === 0) break;
          if (isNegated(text, m.index)) continue;
          if (!hits.has(detector.id)) hits.set(detector.id, []);
          hits.get(detector.id).push({ file, line: lineOf(m.index), match: m[0].slice(0, MAX_MATCH_CHARS) });
        }
      }
    }
  }
  return { signals: [...hits].map(([id, evidence]) => ({ id, evidence: capEvidence(evidence) })).sort(byId), skipped };
}

// ---------- the knowledge base ----------

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const text = (v) => typeof v === "string" && v.trim().length > 0;

function triggerProblems(where, triggers, declared) {
  if (!Array.isArray(triggers) || !triggers.length) return [`${where}: needs at least one trigger`];
  return triggers.flatMap((t, i) => {
    const ok = t && text(t.applies_when) && declared.has(t.signal) && ["strong", "supporting"].includes(t.weight)
      && (t.posture === undefined || ["current", "prospective"].includes(t.posture));
    return ok ? [] : [`${where}: trigger ${i + 1} needs applies_when, a declared signal, weight strong or supporting, and posture current or prospective`];
  });
}

function variantProblems(where, f, declared) {
  if (f.variants === undefined) return [];
  if (!Array.isArray(f.variants)) return [`${where}: variants must be a list`];
  const bad = f.variants.filter((v) => !v || !SLUG.test(v.id ?? "") || !text(v.label) || !text(v.note) || !Array.isArray(v.when_signals)
    || !v.when_signals.length || ![...v.when_signals, ...(v.unless_signals ?? [])].every((s) => declared.has(s)));
  return bad.length ? [`${where}: a variant needs an id, a label, a note and when_signals naming declared signals`] : [];
}

// The problems with a knowledge base, in the loader's order (scope.ts :513-613): shape, the signal vocabulary, the
// pairing of repo_scan signals with detectors in both directions, and every trigger naming a declared signal.
export function kbProblems(kb) {
  if (!kb || typeof kb !== "object" || !kb.meta || !Array.isArray(kb.signals) || !Array.isArray(kb.frameworks) || !Array.isArray(kb.candidates)) {
    return ["it needs meta, signals, frameworks and candidates"];
  }
  const problems = [];
  if (!text(kb.meta.version) || !["seed", "draft", "approved"].includes(kb.meta.status)) problems.push("meta needs a version and a status");
  const declared = new Map();
  for (const s of kb.signals) {
    const shaped = s && SLUG.test(s.id ?? "") && text(s.label) && ["repo_scan", "interview"].includes(s.source);
    if (!shaped) problems.push("a signal needs an id, a label and a source");
    else if (declared.has(s.id)) problems.push(`signal ${s.id} is declared twice`);
    else declared.set(s.id, s);
  }
  const detectorIds = new Set(SIGNAL_DETECTORS.map((d) => d.id));
  for (const s of declared.values()) {
    if (s.source === "repo_scan" && !detectorIds.has(s.id)) problems.push(`signal ${s.id} is repo_scan but has no detector`);
    if (s.source === "interview" && detectorIds.has(s.id)) problems.push(`signal ${s.id} is interview but has a detector`);
  }
  for (const id of detectorIds) if (!declared.has(id)) problems.push(`the detector ${id} is not declared as a signal`);
  for (const f of kb.frameworks) {
    const where = `framework ${f?.framework ?? "(no id)"}`;
    if (!f || !SLUG.test(f.framework ?? "") || !text(f.label) || !text(f.determination)) problems.push(`${where}: needs framework, label and determination`);
    else problems.push(...triggerProblems(where, f.triggers, declared), ...variantProblems(where, f, declared));
  }
  for (const c of kb.candidates) {
    const where = `candidate ${c?.id ?? "(no id)"}`;
    if (!c || !SLUG.test(c.id ?? "") || !text(c.name) || !text(c.determination)) problems.push(`${where}: needs id, name and determination`);
    else problems.push(...triggerProblems(where, c.triggers, declared));
  }
  return problems;
}

function readJsonFile(abs, shown) {
  let bytes;
  try { bytes = readFileSync(abs); } catch (e) {
    if (e.code === "ENOENT") return null;
    refuse(`${shown} could not be read`, "failed");
  }
  try { return { data: JSON.parse(bytes.toString("utf8")), sha256: digest(bytes) }; } catch { return refuse(`${shown} does not parse as JSON`); }
}

export function loadKb(dir = frameworksDir()) {
  const read = readJsonFile(join(dir, KB_FILE), `frameworks/${KB_FILE}`);
  if (!read) refuse(`the scoping knowledge base frameworks/${KB_FILE} is not installed with this plugin, so no scope can be proposed`);
  const problems = kbProblems(read.data);
  if (problems.length) refuse(`frameworks/${KB_FILE} is not a usable knowledge base: ${problems.slice(0, 5).join("; ")}`);
  return read.data;
}

// The JSON files of the frameworks folder by what they are: a library (meta.framework and controls), a crosswalk
// (meta.from and mappings), the baseline crosswalk by its file name. Any other JSON is left alone; one that does not
// parse is refused with its name. A missing folder is an empty one.
export function loadFrameworksFolder(dir = frameworksDir()) {
  const out = { dir, libraries: new Map(), crosswalks: new Map(), baseline: null };
  let names;
  try { names = readdirSync(dir).filter((n) => n.endsWith(".json") && n !== KB_FILE).sort(); } catch (e) {
    if (e.code === "ENOENT") return out;
    return refuse("the frameworks folder could not be listed", "failed");
  }
  for (const name of names) {
    const read = readJsonFile(join(dir, name), `frameworks/${name}`);
    const entry = { file: name, data: read?.data, sha256: read?.sha256 };
    const meta = read?.data?.meta;
    if (name === BASELINE_CROSSWALK) out.baseline = entry;
    else if (meta && typeof meta.from === "string" && Array.isArray(read.data.mappings)) out.crosswalks.set(meta.from, entry);
    else if (meta && typeof meta.framework === "string" && Array.isArray(read.data.controls) && meta.role !== "spine") out.libraries.set(meta.framework, entry);
  }
  return out;
}

// ---------- the proposal (scope.ts :654-907) ----------

export const SCOPE_DISCLAIMER = "Recommended assessment scope only. Whether any of these frameworks applies to this organization is a legal "
  + "determination made by the organization with its counsel and, for the card-brand standard, by its acquirer. Skilliton does not make "
  + "that determination and does not conclude that a framework does or does not apply. The signals below are observations from the "
  + "project's own files; confirm the scope in writing before relying on it.";

const POINTS = { strong: 3, supporting: 1 };
const TIMING_RANK = { now: 0, conditional: 1, watch: 2 };

// A prospective trigger describes a future state, so it is worth half (rounded up) and never reads as "scope this now".
function matchTriggers(triggers, detected) {
  const matched = [];
  for (const t of triggers) {
    const evidence = detected.get(t.signal);
    if (!evidence) continue;
    const posture = t.posture ?? "current";
    const points = posture === "prospective" ? Math.ceil(POINTS[t.weight] / 2) : POINTS[t.weight];
    matched.push({ signal: t.signal, appliesWhen: t.applies_when.trim(), weight: t.weight, posture, points, evidence });
  }
  return matched.sort((a, b) => b.points - a.points || (a.signal < b.signal ? -1 : a.signal > b.signal ? 1 : 0));
}

function timingOf(matched) {
  if (matched.some((m) => m.weight === "strong" && m.posture === "current")) return "now";
  if (matched.some((m) => m.weight === "strong")) return "conditional";
  return "watch";
}

// Breadth of evidence: distinct file and line places, because three phrases in one sentence are one place.
function confidenceOf(matched) {
  if (!matched.some((m) => m.weight === "strong")) return "weak";
  const places = new Set(matched.flatMap((m) => m.evidence.map((e) => `${e.file}:${e.line}`)));
  return matched.length >= 2 || places.size >= 3 ? "strong" : "moderate";
}

// Declared order is precedence: the widest scope is listed first, so an ambiguous project is never narrowed by accident.
function pickVariant(f, detected) {
  for (const v of f.variants ?? []) {
    if (!v.when_signals.every((s) => detected.has(s)) || (v.unless_signals ?? []).some((s) => detected.has(s))) continue;
    return { id: v.id, label: v.label.trim(), note: v.note.trim(), dimension: (f.variant_dimension ?? "variant").trim() };
  }
  return null;
}

// What --apply may record on a person's confirmation (scope.ts :694-701): current activity, a library that ships here,
// not weak, and resting on at least one strong signal. A variant, an intake question and a removal are never decided.
export const isRecordable = (r) => r.timing === "now" && r.library === "shipped" && r.confidence !== "weak"
  && r.triggers.some((t) => t.weight === "strong");

function recommendation(entry, id, label, detected, library) {
  const matched = matchTriggers(entry.triggers, detected);
  if (!matched.length) return null;
  const variant = library === "not_encoded" ? null : pickVariant(entry, detected);
  const r = {
    id, label: label.trim(), kind: library === "not_encoded" ? "candidate" : "framework", library,
    timing: timingOf(matched), confidence: confidenceOf(matched), score: matched.reduce((n, m) => n + m.points, 0),
    signals: matched.flatMap((m) => m.evidence.map((e) => ({ id: m.signal, file: e.file, line: e.line, match: e.match, weight: m.weight }))),
    triggers: matched.map(({ evidence, ...t }) => t),
    variant, variantOpen: (entry.variants ?? []).length && !variant && entry.variant_note ? entry.variant_note.trim() : null,
    determination: entry.determination.trim(),
  };
  return { ...r, recordable: isRecordable(r) };
}

// PURE over the project's scanned files and the knowledge base: the same inputs give the same proposal, byte for byte.
// generatedAt is the modification time of the newest file read (null when none was), never the clock, so a proposal
// drafted again from unchanged files is the same proposal, and one drafted after they change reads as newer.
export function proposeScope(root, { kb = null, libraries = null } = {}) {
  const base = kb ?? loadKb();
  const shipped = libraries ?? new Set(loadFrameworksFolder().libraries.keys());
  const { files, skipped: notRead } = scanTargets(root);
  const { signals, skipped: unreadable } = extractSignals(root, files);
  const detected = new Map(signals.map((s) => [s.id, s.evidence]));
  const frameworks = [
    ...base.frameworks.map((f) => recommendation(f, f.framework, f.label, detected, shipped.has(f.framework) ? "shipped" : "not_shipped")),
    ...base.candidates.map((c) => recommendation(c, c.id, c.name, detected, "not_encoded")),
  ].filter(Boolean).sort((a, b) => TIMING_RANK[a.timing] - TIMING_RANK[b.timing] || b.score - a.score || byId(a, b));
  const read = files.filter((f) => !unreadable.some((u) => u.file === f.file));
  const newest = read.length ? Math.max(...read.map((f) => f.mtimeMs)) : null;
  return {
    schemaVersion: 1,
    generatedAt: newest === null ? null : new Date(Math.floor(newest)).toISOString(),
    subject: { scanned: read.map((f) => f.file), skipped: [...notRead, ...unreadable].sort(byFile) },
    knowledgeBase: { version: base.meta.version, status: base.meta.status },
    signals,
    frameworks,
    notPointedAt: base.frameworks.filter((f) => !frameworks.some((r) => r.id === f.framework))
      .map((f) => ({ id: f.framework, label: f.label.trim() })).sort(byId),
    intakeQuestions: base.signals.filter((s) => s.source === "interview").map((s) => s.label.trim()).sort(),
    disclaimer: SCOPE_DISCLAIMER,
  };
}

// ---------- the confirmed scope and the drafted proposal ----------

const CONFIDENCE = ["strong", "moderate", "weak"];
const exactKeys = (o, names) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === names.length
  && names.every((k) => Object.hasOwn(o, k));
const intakeValue = (v) => typeof v === "string" || typeof v === "boolean" || (Array.isArray(v) && v.every((x) => typeof x === "string"));

// The reason a scope file is not usable, or null. decidedAt must be an ISO time in the past, as for applicability.
export function scopeProblem(s, now = Date.now()) {
  if (!exactKeys(s, ["schemaVersion", "decidedBy", "decidedAt", "frameworks", "intake"]) || s.schemaVersion !== 1) {
    return "it needs exactly schemaVersion 1, decidedBy, decidedAt, frameworks and intake";
  }
  if (textFieldProblem(s.decidedBy, 120)) return `decidedBy is ${textFieldProblem(s.decidedBy, 120)}`;
  const ts = Date.parse(s.decidedAt);
  const iso = typeof s.decidedAt === "string" && Number.isFinite(ts) && new Date(ts).toISOString() === s.decidedAt;
  if (!iso || ts > now) return "decidedAt is not a past ISO time";
  if (!Array.isArray(s.frameworks) || s.frameworks.length > 100) return "frameworks must be a list of at most 100";
  const ids = new Set();
  for (const f of s.frameworks) {
    const signalsOk = Array.isArray(f?.signals) && f.signals.every((g) => exactKeys(g, ["id", "file", "line"]) && SLUG.test(g.id)
      && typeof g.file === "string" && Number.isInteger(g.line) && g.line >= 1);
    if (!exactKeys(f, ["id", "confidence", "signals"]) || !SLUG.test(f.id) || !CONFIDENCE.includes(f.confidence) || !signalsOk || ids.has(f.id)) {
      return "each framework needs a unique id, a confidence and its signals (id, file, line)";
    }
    ids.add(f.id);
  }
  if (!s.intake || typeof s.intake !== "object" || Array.isArray(s.intake) || !Object.values(s.intake).every(intakeValue)) {
    return "intake must map each question to a string, true or false, or a list of strings";
  }
  return null;
}

function readState(root, rel) {
  if (!inspectPath(root, rel)) return null;
  const bytes = safeRead(root, rel, STATE_LIMIT, newBudget());
  try { return { bytes, data: JSON.parse(bytes.toString("utf8")) }; } catch { return refuse(`${rel} does not parse as JSON`); }
}

// The confirmed scope, or null when none was recorded. An unusable file is refused, never read as "no scope".
export function readScope(root, { now = Date.now() } = {}) {
  const state = readState(root, SCOPE_REL);
  if (!state) return null;
  const problem = scopeProblem(state.data, now);
  if (problem) refuse(`${SCOPE_REL} is not a usable scope file: ${problem}`);
  return state.data;
}

// The scope --apply would write. Additive, as MojoComply's recording is: a framework recorded earlier stays recorded
// (no signal now is not evidence a regime stopped applying), a recordable one is added or refreshed, and the intake
// answers are kept. decidedBy must be a usable label (the value is never echoed).
export function planScope(root, proposal, decidedBy, { now = new Date() } = {}) {
  const problem = textFieldProblem(decidedBy, 120);
  if (problem) refuse(`--decided-by is ${problem === "empty" ? "missing or empty" : problem} (the value is not shown), so nothing was written`);
  const existing = readScope(root);
  const frameworks = new Map((existing?.frameworks ?? []).map((f) => [f.id, f]));
  const recorded = proposal.frameworks.filter((f) => f.recordable);
  for (const f of recorded) frameworks.set(f.id, { id: f.id, confidence: f.confidence, signals: f.signals.map(({ id, file, line }) => ({ id, file, line })) });
  const scope = { schemaVersion: 1, decidedBy, decidedAt: now.toISOString(), frameworks: [...frameworks.values()].sort(byId), intake: existing?.intake ?? {} };
  const before = new Set((existing?.frameworks ?? []).map((f) => f.id));
  return {
    scope, existing,
    added: recorded.filter((f) => !before.has(f.id)).map((f) => f.id),
    kept: [...before].filter((id) => !recorded.some((f) => f.id === id)).sort(),
    notRecorded: proposal.frameworks.filter((f) => !f.recordable),
  };
}

function writeState(root, rel, text, beforeReplace) {
  ensureDirectory(root, COMPLIANCE_DIR);
  const current = readState(root, rel);
  const backup = current && beforeReplace ? beforeReplace(join(root, rel)) : null;
  publish(root, rel, text, "replace", { expected: current?.bytes ?? null, tempDir: COMPLIANCE_DIR, fileMode: 0o644 });
  return backup;
}

// beforeReplace(absolutePath) runs before an existing scope file is replaced (the command backs it up there).
export function writeScope(root, plan, { beforeReplace = null } = {}) {
  const problem = scopeProblem(plan.scope, Date.now() + 1000);
  if (problem) refuse(`the scope to write is not usable: ${problem}`);
  const backup = writeState(root, SCOPE_REL, JSON.stringify(plan.scope, null, 2) + "\n", beforeReplace);
  return { path: SCOPE_REL, backup };
}

// The drafted proposal, kept for the session start to compare with the confirmed scope. Without apply, reads only.
export function writeProposal(root, proposal, { apply = false, beforeReplace = null } = {}) {
  const text = JSON.stringify(proposal, null, 2) + "\n";
  const current = readState(root, PROPOSAL_REL);
  const changed = !current || current.bytes.toString("utf8") !== text;
  const backup = apply && changed ? writeState(root, PROPOSAL_REL, text, beforeReplace) : null;
  return { path: PROPOSAL_REL, changed, written: apply && changed, backup };
}

export function readProposal(root) {
  const state = readState(root, PROPOSAL_REL);
  if (!state) return null;
  const p = state.data;
  if (!p || p.schemaVersion !== 1 || !Array.isArray(p.frameworks) || !Array.isArray(p.intakeQuestions)) refuse(`${PROPOSAL_REL} is not a usable proposal`);
  return p;
}
