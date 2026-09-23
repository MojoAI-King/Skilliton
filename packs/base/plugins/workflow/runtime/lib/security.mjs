// security.mjs: the project security evidence engine. docs/CONTRACTS.md section 12 is the contract (section 9 for
// securitySummary); runtime/commands/security.mjs is the command line over it and lib/collectors.mjs gathers evidence
// through it.
//
// Adapted in place from the standalone prototype scripts/security-evidence.mjs (foundation commit 0bc2a05). Kept from
// the prototype: record schema 1 (records it wrote still validate), immutable records published by an atomic link,
// refusal of symbolic links and hard links, refusal of secret-shaped input without echoing it, the generated-report
// marker, and invalid records poisoning status visibly. Records are claims with file fingerprints, not scanner
// attestations, signatures, or compliance passes. Reports never contain file contents.
//
// Nothing here parses arguments, prints, or exits. Every refusal is a SecurityRefusal with a stable code and a kind:
// "invalid" (bad input, unsafe paths, evidence that does not validate; the command exits 2) or "failed" (the file
// system, a tool, or a write failed; exit 3). Refusal text never contains supplied values or file contents.
//
// Node built-ins, ./config.mjs, ./legacy-names.mjs and ./security-io.mjs (the file layer, split out on 2026-09-22) only.

import { closeSync, constants, fsyncSync, openSync, opendirSync, readSync, unlinkSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigError, resolveProject } from './config.mjs';
import { LEGACY_MANIFEST_MARKER } from './legacy-names.mjs';
import { LIMIT, SECURITY_DIR, RECORDS_DIR, CATALOG_REL, APPLICABILITY_REL, APPLICABILITY_LOCK_REL, REPORT_REL, PRIVATE_EVIDENCE_DIR, REPORT_MARKER, MANIFEST_MARKER, FINDINGS_START, FINDINGS_END, ASSESSMENTS, SecurityRefusal, refusalText, fail, object, secretShaped, textField, textFieldProblem, relativePath, projectRoot, inspect, checkedPath, inspectPath, newBudget, safeRead, digest, canonical, jsonRead, ensureDirectory, publish } from './security-io.mjs';

// The file layer's public names, re-exported so every caller of this module reads as before.
export { LIMIT, SECURITY_DIR, RECORDS_DIR, CATALOG_REL, APPLICABILITY_REL, APPLICABILITY_LOCK_REL, REPORT_REL, PRIVATE_EVIDENCE_DIR, REPORT_MARKER, MANIFEST_MARKER, FINDINGS_START, FINDINGS_END, ASSESSMENTS, SecurityRefusal, refusalText, SECRET_SHAPES, secretShaped, textField, textFieldProblem, relativePath, projectRoot, inspectPath, newBudget, readRepositoryFile, digest, ensureDirectory } from './security-io.mjs';

const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const keys = (value, names) => object(value) && Object.keys(value).every((k) => names.includes(k)) && names.every((k) => Object.hasOwn(value, k));
const patternField = (value, pattern) => typeof value === 'string' && pattern.test(value) && !secretShaped(value);

// ---------- catalog ----------

export function validateCatalog(c) {
  const hasDescription = object(c) && Object.hasOwn(c, 'description');
  const catalogKeys = ['schemaVersion', 'catalogVersion', 'controls', ...(hasDescription ? ['description'] : [])];
  if (!keys(c, catalogKeys) || (hasDescription && !textField(c.description, 1000)) || c.schemaVersion !== 1 || !patternField(c.catalogVersion, VERSION) || !Array.isArray(c.controls) || c.controls.length === 0 || c.controls.length > LIMIT.controls) fail('INVALID_CATALOG');
  const seen = new Set();
  for (const ctrl of c.controls) {
    const hasMaxAge = object(ctrl) && Object.hasOwn(ctrl, 'maxAgeDays');
    if (!keys(ctrl, ['id', 'title', 'mappings', 'expectedEvidence', ...(hasMaxAge ? ['maxAgeDays'] : [])]) || !patternField(ctrl.id, ID) || !textField(ctrl.title) || seen.has(ctrl.id)) fail('INVALID_CATALOG');
    seen.add(ctrl.id);
    if (hasMaxAge && !(Number.isInteger(ctrl.maxAgeDays) && ctrl.maxAgeDays >= 1 && ctrl.maxAgeDays <= 3650)) fail('INVALID_CATALOG');
    if (!Array.isArray(ctrl.mappings) || ctrl.mappings.length === 0 || ctrl.mappings.length > 32 || !Array.isArray(ctrl.expectedEvidence) || ctrl.expectedEvidence.length === 0 || ctrl.expectedEvidence.length > 32 || !ctrl.expectedEvidence.every((s) => textField(s, 500))) fail('INVALID_CATALOG');
    for (const m of ctrl.mappings) {
      if (!keys(m, ['framework', 'version', 'reference', 'url', 'relationship']) || !textField(m.framework) || !textField(m.version, 64) || !textField(m.reference) || !textField(m.url, 1000) || m.relationship !== 'related') fail('INVALID_CATALOG');
      let url;
      try { url = new URL(m.url); } catch { fail('INVALID_CATALOG'); }
      if (url.protocol !== 'https:' || url.username || url.password) fail('INVALID_CATALOG');
    }
  }
  return c;
}
export function readCatalog(root, budget = newBudget()) {
  if (!checkedPath(root, CATALOG_REL, true).stat) fail('MISSING_CATALOG');
  return validateCatalog(jsonRead(root, CATALOG_REL, LIMIT.catalog, budget));
}
export const controlHash = (catalog, ctrl) => digest(canonical({ catalogVersion: catalog.catalogVersion, control: ctrl }));

// ---------- records (schema 1 and the prototype's validation; the path rule above also accepts deep paths it refused) ----------

function recordValidate(r, filename, now) {
  if (!keys(r, ['schemaVersion', 'id', 'controlId', 'catalogVersion', 'controlHash', 'recordedAt', 'assessment', 'note', 'reviewer', 'sources', 'artifacts'])
    || r.schemaVersion !== 1 || !UUID.test(r.id) || filename !== `${r.id}.json` || !patternField(r.controlId, ID)
    || !patternField(r.catalogVersion, VERSION) || !SHA.test(r.controlHash) || !ASSESSMENTS.includes(r.assessment) || !textField(r.note, 1000) || !textField(r.reviewer, 120)) fail('INVALID_RECORD');
  const ts = Date.parse(r.recordedAt);
  if (typeof r.recordedAt !== 'string' || !Number.isFinite(ts) || new Date(ts).toISOString() !== r.recordedAt || ts > now) fail('INVALID_RECORD');
  for (const list of [r.sources, r.artifacts]) {
    if (!Array.isArray(list) || list.length > LIMIT.attachments) fail('INVALID_RECORD');
    const seen = new Set();
    for (const a of list) {
      if (!keys(a, ['path', 'sha256']) || !SHA.test(a.sha256)) fail('INVALID_RECORD');
      relativePath(a.path, true);
      if (seen.has(a.path)) fail('INVALID_RECORD');
      seen.add(a.path);
    }
  }
  if (r.assessment === 'observed' && (!r.sources.length || !r.artifacts.length)) fail('INVALID_RECORD');
}

export function readHistory(root, budget = newBudget(), now = Date.now()) {
  const { path, stat } = checkedPath(root, RECORDS_DIR, true);
  if (!stat) return { records: [], invalid: 0 };
  if (!stat.isDirectory()) fail('UNSAFE_RECORD_DIRECTORY');
  const records = [];
  let invalid = 0;
  let count = 0;
  let directory;
  try { directory = opendirSync(path); } catch { fail('UNREADABLE_PATH'); }
  try {
    let entry;
    while ((entry = directory.readSync())) {
      if (++count > LIMIT.records) fail('INPUT_LIMIT');
      try {
        if (entry.name === 'README.md') {
          safeRead(root, `${RECORDS_DIR}/README.md`, LIMIT.record, budget);
          continue;
        }
        if (!/^[a-f0-9-]{36}\.json$/.test(entry.name) || !entry.isFile()) fail('INVALID_RECORD');
        const r = jsonRead(root, `${RECORDS_DIR}/${entry.name}`, LIMIT.record, budget);
        recordValidate(r, entry.name, now);
        records.push(r);
      } catch (e) {
        if (e instanceof SecurityRefusal && e.code === 'INPUT_LIMIT') throw e;
        invalid++;
      }
    }
  } finally { directory.closeSync(); }
  return { records, invalid };
}

export function fingerprintAttachment(root, rel, budget = newBudget()) {
  relativePath(rel, true);
  return { path: rel, sha256: digest(safeRead(root, rel, LIMIT.file, budget)) };
}

// input: { controlId, assessment, note, reviewer, sources, artifacts }. Each attachment is a repository-relative path
// (fingerprinted now) or a { path, sha256 } fingerprint a collector took from the bytes it actually used.
// field: which of control, assessment, note, reviewer, sources or artifacts is at fault; the rule after it is one of
// empty, too long, surrounding spaces, control characters, looks like a secret, listed twice, or not in the catalog
// (never the value itself). commands/security.mjs prints this as the refusal's detail, appended after the generic
// INVALID_RECORD_INPUT text.
export function createRecord(root, input, { apply = false, budget = newBudget(), catalog = null, now = new Date() } = {}) {
  const cat = catalog ?? readCatalog(root, budget);
  const ctrl = cat.controls.find((c) => c.id === input.controlId);
  if (!ctrl) fail('INVALID_RECORD_INPUT', 'control: not in the catalog');
  if (!ASSESSMENTS.includes(input.assessment)) fail('INVALID_RECORD_INPUT', 'assessment: not observed, gap or needs-human');
  const noteProblem = textFieldProblem(input.note, 1000);
  if (noteProblem) fail('INVALID_RECORD_INPUT', `note: ${noteProblem}`);
  const reviewerProblem = textFieldProblem(input.reviewer, 120);
  if (reviewerProblem) fail('INVALID_RECORD_INPUT', `reviewer: ${reviewerProblem}`);
  const sources = input.sources ?? [], artifacts = input.artifacts ?? [];
  for (const [field, list] of [['sources', sources], ['artifacts', artifacts]]) {
    if (!Array.isArray(list)) fail('INVALID_RECORD_INPUT', `${field}: not a list`);
    if (list.length > LIMIT.attachments) fail('INVALID_RECORD_INPUT', `${field}: more than ${LIMIT.attachments} files`);
    const paths = list.map((a) => (typeof a === 'string' ? a : a?.path));
    if (new Set(paths).size !== paths.length) fail('INVALID_RECORD_INPUT', `${field}: listed twice`);
  }
  if (input.assessment === 'observed' && (!sources.length || !artifacts.length)) fail('OBSERVED_REQUIRES_ATTACHMENTS');
  const fingerprint = (field) => (a) => {
    if (typeof a === 'string') return fingerprintAttachment(root, a, budget);
    if (!keys(a, ['path', 'sha256']) || !SHA.test(a.sha256)) fail('INVALID_RECORD_INPUT', `${field}: not a valid path/sha256 fingerprint`);
    relativePath(a.path, true);
    return { path: a.path, sha256: a.sha256 };
  };
  const r = { schemaVersion: 1, id: randomUUID(), controlId: ctrl.id, catalogVersion: cat.catalogVersion, controlHash: controlHash(cat, ctrl),
    recordedAt: now.toISOString(), assessment: input.assessment, note: input.note, reviewer: input.reviewer,
    sources: sources.map(fingerprint('sources')), artifacts: artifacts.map(fingerprint('artifacts')) };
  recordValidate(r, `${r.id}.json`, Date.now() + 1000);
  if (apply) {
    ensureDirectory(root, RECORDS_DIR);
    publish(root, `${RECORDS_DIR}/${r.id}.json`, JSON.stringify(r, null, 2) + '\n', 'record', { budget });
  }
  return r;
}

// ---------- applicability ----------

function applicabilityValidate(a, now) {
  if (!keys(a, ['schemaVersion', 'decisions']) || a.schemaVersion !== 1 || !Array.isArray(a.decisions) || a.decisions.length > LIMIT.decisions) fail('INVALID_APPLICABILITY');
  for (const d of a.decisions) {
    if (!keys(d, ['controlId', 'applies', 'rationale', 'decidedBy', 'decidedAt']) || !patternField(d.controlId, ID) || typeof d.applies !== 'boolean' || !textField(d.rationale, 1000) || !textField(d.decidedBy, 120)) fail('INVALID_APPLICABILITY');
    const ts = Date.parse(d.decidedAt);
    if (typeof d.decidedAt !== 'string' || !Number.isFinite(ts) || new Date(ts).toISOString() !== d.decidedAt || ts > now) fail('INVALID_APPLICABILITY');
  }
}

export function readApplicability(root, budget = newBudget(), now = Date.now()) {
  if (!checkedPath(root, APPLICABILITY_REL, true).stat) return { exists: false, bytes: null, decisions: [] };
  const bytes = safeRead(root, APPLICABILITY_REL, LIMIT.applicability, budget);
  let a;
  try { a = JSON.parse(bytes.toString('utf8')); } catch { fail('INVALID_APPLICABILITY'); }
  applicabilityValidate(a, now);
  return { exists: true, bytes, decisions: a.decisions };
}

// The newest decision per control wins; on equal times, the one later in the file wins.
export function latestDecisions(decisions) {
  const latest = new Map();
  for (const d of decisions) {
    const prev = latest.get(d.controlId);
    if (!prev || d.decidedAt >= prev.decidedAt) latest.set(d.controlId, d);
  }
  return latest;
}

// input: { controlId, applies (boolean), rationale, decidedBy }. Without apply, validates and returns the decision.
// With apply, holds applicability.lock, rereads the file, appends, and replaces the file only if it is unchanged since
// that read. beforeReplace(absolutePath) runs before an existing file is replaced (the command backs it up there).
export function recordDecision(root, input, { apply = false, beforeReplace = null, now = new Date() } = {}) {
  const budget = newBudget();
  const catalog = readCatalog(root, budget);
  if (!patternField(input.controlId, ID) || !catalog.controls.some((c) => c.id === input.controlId) || typeof input.applies !== 'boolean' || !textField(input.rationale, 1000) || !textField(input.decidedBy, 120)) fail('INVALID_DECISION_INPUT');
  const decision = { controlId: input.controlId, applies: input.applies, rationale: input.rationale, decidedBy: input.decidedBy, decidedAt: now.toISOString() };
  if (!apply) return { decision, decisions: readApplicability(root, budget).decisions.length + 1, written: false, backup: null };
  const lockPath = checkedPath(root, APPLICABILITY_LOCK_REL, true).path;
  let lockFd;
  try { lockFd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch (e) {
    fail(e.code === 'EEXIST' ? 'APPLICABILITY_LOCKED' : e.code === 'ELOOP' ? 'SYMLINK_REFUSED' : 'WRITE_FAILED');
  }
  try {
    closeSync(lockFd); lockFd = undefined;
    const current = readApplicability(root, budget);
    const next = { schemaVersion: 1, decisions: [...current.decisions, decision] };
    if (next.decisions.length > LIMIT.decisions) fail('INPUT_LIMIT');
    applicabilityValidate(next, Date.now() + 1000);
    const backup = current.exists && beforeReplace ? beforeReplace(join(root, APPLICABILITY_REL)) : null;
    publish(root, APPLICABILITY_REL, JSON.stringify(next, null, 2) + '\n', 'replace', { expected: current.bytes, fileMode: 0o644, budget });
    return { decision, decisions: next.decisions.length, written: true, backup };
  } finally {
    if (lockFd !== undefined) closeSync(lockFd);
    try { unlinkSync(lockPath); } catch { /* already gone */ }
  }
}

// ---------- file manifests ----------

// A file manifest attached to a record extends freshness to every file it lists: status reports the record stale when
// a listed file is missing, not a regular file, or has a different size or content. Every listed file is read and
// hashed each time the manifest is checked (N87): an edit that keeps the size and restores the modification time is
// still an edit, and the lists are small (the sources of one control). The size and modification time stay in each
// line as information; a different size still reads as changed without a read. Files added after the manifest was
// written are not part of the claim and are not detected.
export function renderManifest(entries, description) {
  return [MANIFEST_MARKER, `# ${description}`, '# Each line: sha256 size mtimeMs path', ...entries.map((e) => `${e.sha256} ${e.size} ${e.mtimeMs} ${e.path}`), ''].join('\n');
}
// An artifact saved before the rename starts with the earlier marker and is checked the same way: records are immutable.
const isManifest = (buffer) => [MANIFEST_MARKER, LEGACY_MANIFEST_MARKER].some((marker) => buffer.subarray(0, marker.length + 1).toString('utf8') === `${marker}\n`);

// 'same' | 'changed' | 'unsafe' (the manifest itself does not parse). Content is checked for every entry, every time.
export function verifyManifest(root, buffer, budget = newBudget(LIMIT.scanTotal)) {
  const lines = buffer.toString('utf8').split('\n');
  let entries = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' && i === lines.length - 1) break;
    if (line.startsWith('#')) continue;
    const m = /^([a-f0-9]{64}) (\d{1,15}) (\d{1,17}(?:\.\d{1,20})?) (.+)$/.exec(line);
    if (!m || ++entries > LIMIT.manifestEntries) return 'unsafe';
    const [, sha, size, , rel] = m;
    let st;
    try { relativePath(rel); } catch { return 'unsafe'; }
    try { st = inspect(root, rel, true); } catch { return 'changed'; }
    if (!st || !st.isFile() || st.size !== Number(size)) return 'changed';
    try { if (digest(safeRead(root, rel, LIMIT.file, budget)) !== sha) return 'changed'; } catch { return 'changed'; }
  }
  return 'same';
}

// ---------- status ----------

// 'same' | 'changed' | 'missing' | 'unsafe'. A missing or changed file makes a record stale; an unreadable or unsafe
// one makes the evidence invalid, as in the prototype.
function attachmentState(root, a, cache, budget, manifestBudget) {
  let entry = cache.get(a.path);
  if (!entry) {
    try {
      const buffer = safeRead(root, a.path, LIMIT.file, budget);
      entry = { sha256: digest(buffer), manifest: isManifest(buffer) ? buffer : null, verified: null };
    } catch (e) {
      entry = { error: e instanceof SecurityRefusal && e.code === 'MISSING_FILE' ? 'missing' : 'unsafe' };
    }
    cache.set(a.path, entry);
  }
  if (entry.error) return entry.error;
  if (entry.sha256 !== a.sha256) return 'changed';
  if (entry.manifest) {
    if (entry.verified === null) entry.verified = verifyManifest(root, entry.manifest, manifestBudget);
    return entry.verified;
  }
  return 'same';
}

// Evaluates every catalog control. Reads only; never creates, edits or re-dates a record.
//   applies:   'yes' | 'no' | 'undecided' | 'unknown' (the applicability file is invalid)
//   freshness: 'current' | 'stale' | 'expired' | 'missing' | 'invalid'
//   state:     freshness, or for a current record its assessment: 'current' (observed) | 'gap' | 'needs-human'
// result: 'invalid' when any record file, fingerprinted file or the applicability file is invalid; 'complete' when
// every applicable control is current and decided; otherwise 'attention'.
export function evaluateSecurity(root, { now = Date.now(), budget = newBudget() } = {}) {
  const catalog = readCatalog(root, budget);
  const project = resolveProject(root);
  const history = readHistory(root, budget, now);
  let applicability, applicabilityInvalid = false;
  try { applicability = readApplicability(root, budget, now); } catch (e) {
    if (!(e instanceof SecurityRefusal) || e.kind !== 'invalid') throw e;
    applicabilityInvalid = true;
    applicability = { exists: true, bytes: null, decisions: [] };
  }
  const controlIds = new Set(catalog.controls.map((c) => c.id));
  const decisions = latestDecisions(applicability.decisions);
  const latest = new Map();
  for (const r of history.records) {
    const prev = latest.get(r.controlId);
    if (!prev || r.recordedAt > prev.recordedAt || (r.recordedAt === prev.recordedAt && r.id > prev.id)) latest.set(r.controlId, r);
  }
  const poisoned = history.invalid > 0 || applicabilityInvalid;
  const cache = new Map();
  const manifestBudget = newBudget(LIMIT.scanTotal);
  const rows = catalog.controls.map((ctrl) => {
    const decision = applicabilityInvalid ? null : decisions.get(ctrl.id) ?? null;
    const applies = applicabilityInvalid ? 'unknown' : decision ? (decision.applies ? 'yes' : 'no') : 'undecided';
    const r = latest.get(ctrl.id) ?? null;
    const maxAgeDays = ctrl.maxAgeDays ?? project.security.maxAgeDays ?? null;
    let freshness = poisoned ? 'invalid' : r ? 'current' : 'missing';
    if (r && !poisoned) {
      if (r.controlHash !== controlHash(catalog, ctrl) || r.catalogVersion !== catalog.catalogVersion) freshness = 'stale';
      for (const a of [...r.sources, ...r.artifacts]) {
        const state = attachmentState(root, a, cache, budget, manifestBudget);
        if (state === 'unsafe') freshness = 'invalid';
        else if (state !== 'same' && freshness !== 'invalid') freshness = 'stale';
      }
      if (freshness === 'current' && maxAgeDays !== null && now - Date.parse(r.recordedAt) > maxAgeDays * DAY_MS) freshness = 'expired';
    }
    const state = freshness !== 'current' ? freshness : r.assessment === 'observed' ? 'current' : r.assessment === 'gap' ? 'gap' : 'needs-human';
    return { control: ctrl, decision, applies, record: r, assessment: r?.assessment ?? 'none', freshness, state, maxAgeDays };
  });
  const counted = rows.filter((row) => row.applies !== 'no');
  const count = (test) => counted.filter(test).length;
  const counts = {
    total: rows.length,
    applicable: counted.length,
    current: count((row) => row.state === 'current'),
    missing: count((row) => row.state === 'missing'),
    stale: count((row) => row.state === 'stale'),
    expired: count((row) => row.state === 'expired'),
    invalid: count((row) => row.state === 'invalid'),
    gaps: count((row) => row.state === 'gap'),
    needsHuman: count((row) => row.state === 'needs-human' || row.applies === 'undecided'),
    undecided: count((row) => row.applies === 'undecided'),
  };
  const invalid = poisoned || rows.some((row) => row.freshness === 'invalid');
  const complete = !invalid && counts.undecided === 0 && counts.current === counts.applicable;
  return {
    project, catalog, rows, counts,
    invalidRecords: history.invalid,
    inactiveRecords: history.records.filter((r) => !controlIds.has(r.controlId)).length,
    applicabilityExists: applicability.exists,
    applicabilityInvalid,
    decisionsOutsideCatalog: [...decisions.keys()].filter((id) => !controlIds.has(id)).length,
    result: invalid ? 'invalid' : complete ? 'complete' : 'attention',
  };
}

export const exitCodeFor = (result) => ({ complete: 0, attention: 1, invalid: 2 })[result] ?? 3;

// docs/CONTRACTS.md section 9. Never throws: anything that prevents an evaluation is { available: false, reason }.
// current, missing, stale, expired, invalid and gaps partition the applicable controls by evidence state (needs-human
// assessments are the rest); undecided counts applicable controls with no applicability decision, and needsHuman
// counts controls that are undecided or whose current assessment is needs-human.
export function securitySummary(root) {
  try {
    let real;
    try { real = projectRoot(String(root)); } catch { return { available: false, reason: 'the project folder does not exist or is not a folder' }; }
    const { catalog, counts } = evaluateSecurity(real);
    return { available: true, catalogVersion: catalog.catalogVersion, total: counts.total, applicable: counts.applicable, current: counts.current, missing: counts.missing, stale: counts.stale, expired: counts.expired, invalid: counts.invalid, gaps: counts.gaps, needsHuman: counts.needsHuman, undecided: counts.undecided };
  } catch (e) {
    if (e instanceof SecurityRefusal) return { available: false, reason: e.code === 'MISSING_CATALOG' ? `no security catalog at ${CATALOG_REL}; the project is not prepared for security evidence` : `security evidence could not be evaluated (${e.code}: ${refusalText(e.code)})` };
    if (e instanceof ConfigError) return { available: false, reason: `the project configuration could not be used: ${e.message}` };
    return { available: false, reason: `security evidence could not be evaluated (${e?.code ?? 'unexpected error'})` };
  }
}

// ---------- report ----------

const md = (s) => String(s).replace(/[\\|`*_{}\[\]()<>#]/g, '\\$&');

export function renderReport(ev) {
  const { counts } = ev;
  const notApplicable = ev.rows.filter((row) => row.applies === 'no');
  const freshnessLabel = (row) => (row.freshness === 'expired' ? `expired (older than ${row.maxAgeDays} days)` : row.freshness);
  const lines = [REPORT_MARKER, '', '# Security evidence status', '',
    `Current recorded observations: ${counts.current}/${counts.applicable} applicable controls.`,
    `Invalid evidence records: ${ev.invalidRecords}.`,
    `Historical records outside the current catalog: ${ev.inactiveRecords}.`,
    `Catalog: ${md(ev.catalog.catalogVersion)}, ${counts.total} controls; not applicable: ${notApplicable.length}; undecided applicability: ${counts.undecided}.`,
    `Missing: ${counts.missing}. Stale: ${counts.stale}. Expired: ${counts.expired}. Invalid: ${counts.invalid}. Gaps: ${counts.gaps}. Needs a human: ${counts.needsHuman}.`];
  if (ev.invalidRecords) lines.push('Invalid records make every control invalid until the record problem is resolved. No malformed record is silently discarded.');
  if (ev.applicabilityInvalid) lines.push(`The applicability file ${APPLICABILITY_REL} is invalid, so every control is invalid until it is fixed.`);
  if (ev.decisionsOutsideCatalog) lines.push(`Applicability decisions for controls outside the current catalog: ${ev.decisionsOutsideCatalog}.`);
  lines.push('',
    'Assessment and freshness are separate. Observed means a recorded claim, not a control pass.',
    'Exit 0 means only that every applicable control has a current recorded observation and an applicability decision. It does not establish compliance, certification, or passing security checks.',
    'File hashes detect drift from a recorded claim. This tool does not run checks or authenticate reviewers.',
    'Mappings marked related are pointers for review, not claims of equivalence or complete framework coverage.', '',
    '| Control | Title | Applies | Assessment | Freshness |', '| --- | --- | --- | --- | --- |',
    ...ev.rows.map((row) => `| ${md(row.control.id)} | ${md(row.control.title)} | ${row.applies} | ${row.assessment} | ${freshnessLabel(row)} |`), '');
  if (notApplicable.length) {
    lines.push('## Not applicable', '', ...notApplicable.map((row) => `- ${md(row.control.id)}: ${md(row.decision.rationale)} (decided by ${md(row.decision.decidedBy)}, ${row.decision.decidedAt.slice(0, 10)})`), '');
  }
  lines.push('Missing records and unresolved assessments need evidence or human review. Stale and expired records need a new observation after review; existing records are never restamped. Undecided controls need an applicability decision.', '');
  return lines.join('\n');
}

export function publishReport(root, text) {
  publish(root, REPORT_REL, text, 'report');
}

// ---------- findings in the backlog record ----------

const NEXT_STEP = {
  missing: 'record an assessment or run a collector',
  stale: 'review what changed, then record a new assessment',
  expired: 'reassess, then record a new assessment',
  gap: 'resolve the gap, then record a new assessment',
  'needs-human': 'a person assesses the control and records the result',
};

// One row per applicable control that is not current and decided, keyed SEC-<control id>, sorted by that key.
export function openFindings(ev) {
  if (ev.result === 'invalid') fail('INVALID_EVIDENCE');
  return ev.rows
    .filter((row) => row.applies !== 'no' && (row.state !== 'current' || row.applies === 'undecided'))
    .map((row) => {
      const states = [], steps = [];
      if (row.state !== 'current') { states.push(row.state); steps.push(NEXT_STEP[row.state]); }
      if (row.applies === 'undecided') { states.push('applicability undecided'); steps.push('decide whether the control applies'); }
      return { id: `SEC-${row.control.id}`, controlId: row.control.id, title: row.control.title, state: states.join('; '), next: steps.join('; ') };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function renderFindingsBlock(ev, findings) {
  const lines = [FINDINGS_START, '## Security findings', '',
    `Generated by skilliton security findings from ${SECURITY_DIR} (catalog ${md(ev.catalog.catalogVersion)}). Do not edit this section: record evidence, then run the command again. Text outside the two marker lines is never changed.`, ''];
  if (!findings.length) lines.push('No open findings: every applicable control has a current observed record and an applicability decision.');
  else lines.push('| ID | Control | State | Next step |', '| --- | --- | --- | --- |', ...findings.map((f) => `| ${md(f.id)} | ${md(f.title)} | ${f.state} | ${f.next} |`));
  lines.push(FINDINGS_END);
  return lines.join('\n');
}

const occurrences = (text, needle) => { const at = []; for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) at.push(i); return at; };

// text and the result are latin1 strings (one character per byte), so bytes outside the section are preserved exactly;
// block is ordinary text and is inserted as UTF-8, with the file's own line endings.
export function upsertFindings(text, block) {
  const starts = occurrences(text, FINDINGS_START), ends = occurrences(text, FINDINGS_END);
  const nl = text.indexOf('\n');
  const eol = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const body = Buffer.from(block.split('\n').join(eol), 'utf8').toString('latin1');
  if (!starts.length && !ends.length) {
    if (text === '') return body + eol;
    return text + (text.endsWith('\n') ? eol : eol + eol) + body + eol;
  }
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) fail('INVALID_FINDINGS_MARKERS');
  const lineStart = (i) => i === 0 || text[i - 1] === '\n';
  const lineEnd = (i) => i === text.length || text.startsWith('\n', i) || text.startsWith('\r\n', i);
  const endAt = ends[0] + FINDINGS_END.length;
  if (!lineStart(starts[0]) || !lineEnd(starts[0] + FINDINGS_START.length) || !lineStart(ends[0]) || !lineEnd(endAt)) fail('INVALID_FINDINGS_MARKERS');
  return text.slice(0, starts[0]) + body + text.slice(endAt);
}

// Reads only. The plan holds the backlog bytes read, so writeFindings refuses when the file changed in between.
export function planFindings(root) {
  const budget = newBudget();
  const ev = evaluateSecurity(root, { budget });
  const findings = openFindings(ev);
  const rel = ev.project.artifacts.backlog;
  const stat = checkedPath(root, rel, true).stat;
  if (!stat) fail('MISSING_BACKLOG', `configured backlog record: ${rel}`);
  const bytes = safeRead(root, rel, LIMIT.backlog, budget);
  const before = bytes.toString('latin1');
  const after = upsertFindings(before, renderFindingsBlock(ev, findings));
  return { rel, bytes, before, after, fileMode: stat.mode & 0o777, findings, evaluation: ev };
}

export function writeFindings(root, plan) {
  const parent = plan.rel.includes('/') ? plan.rel.slice(0, plan.rel.lastIndexOf('/')) : '';
  publish(root, plan.rel, Buffer.from(plan.after, 'latin1'), 'replace', { expected: plan.bytes, tempDir: parent, fileMode: plan.fileMode });
}

// ---------- private evidence files ----------

// Creates a new file .skilliton/private-evidence/<timestamp>-<label>.txt (never replacing one) and returns
// { rel, fd }. The folder is created with mode 700 and the file with mode 600; neither may be a link.
export function createEvidenceFile(root, label, at = new Date()) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(label)) fail('INVALID_ARGUMENTS');
  ensureDirectory(root, PRIVATE_EVIDENCE_DIR);
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  for (let n = 0; n < 1000; n++) {
    const rel = `${PRIVATE_EVIDENCE_DIR}/${stamp}${n ? `-${n}` : ''}-${label}.txt`;
    relativePath(rel, true);
    const { path } = checkedPath(root, rel, true);
    try {
      return { rel, fd: openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW, 0o600) };
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      fail(e.code === 'ELOOP' ? 'SYMLINK_REFUSED' : 'WRITE_FAILED');
    }
  }
  fail('WRITE_FAILED');
}

export function appendEvidence(fd, text) {
  const data = Buffer.from(text, 'utf8');
  let offset = 0;
  try { while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset); } catch { fail('WRITE_FAILED'); }
}

export function closeEvidenceFile(fd) {
  let problem = false;
  try { fsyncSync(fd); } catch { problem = true; }
  try { closeSync(fd); } catch { problem = true; }
  if (problem) fail('WRITE_FAILED');
}
