// security.mjs: the project security evidence engine. docs/CONTRACTS.md section 12 is the contract (section 9 for
// securitySummary); runtime/commands/security.mjs is the command line over it and lib/collectors.mjs gathers evidence
// through it.
//
// Adapted in place from the standalone prototype scripts/security-evidence.mjs (foundation commit 23aae41). Kept from
// the prototype: record schema 1 (records it wrote still validate), immutable records published by an atomic link,
// refusal of symbolic links and hard links, refusal of secret-shaped input without echoing it, the generated-report
// marker, and invalid records poisoning status visibly. Records are claims with file fingerprints, not scanner
// attestations, signatures, or compliance passes. Reports never contain file contents.
//
// Nothing here parses arguments, prints, or exits. Every refusal is a SecurityRefusal with a stable code and a kind:
// "invalid" (bad input, unsafe paths, evidence that does not validate; the command exits 2) or "failed" (the file
// system, a tool, or a write failed; exit 3). Refusal text never contains supplied values or file contents.
//
// Node built-ins and ./config.mjs only; nothing outside the workflow plugin folder is imported.

import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigError, resolveProject } from './config.mjs';
import { LEGACY_MANIFEST_MARKER } from './legacy-names.mjs';

export const LIMIT = { catalog: 1024 * 1024, record: 64 * 1024, applicability: 1024 * 1024, backlog: 4 * 1024 * 1024, file: 32 * 1024 * 1024, total: 256 * 1024 * 1024, scanTotal: 1024 * 1024 * 1024, records: 5000, controls: 500, attachments: 32, decisions: 5000, manifestEntries: 200000 };
export const SECURITY_DIR = '.skilliton/security';
export const RECORDS_DIR = `${SECURITY_DIR}/records`;
export const CATALOG_REL = `${SECURITY_DIR}/catalog.json`;
export const APPLICABILITY_REL = `${SECURITY_DIR}/applicability.json`;
export const APPLICABILITY_LOCK_REL = `${SECURITY_DIR}/applicability.lock`;
export const REPORT_REL = `${SECURITY_DIR}/REPORT.md`;
export const PRIVATE_EVIDENCE_DIR = '.skilliton/private-evidence';
export const REPORT_MARKER = '<!-- skilliton-security-evidence-report:v1 -->';
export const MANIFEST_MARKER = '# skilliton-file-manifest/1';
export const FINDINGS_START = '<!-- skilliton:security-findings:start -->';
export const FINDINGS_END = '<!-- skilliton:security-findings:end -->';
export const ASSESSMENTS = ['observed', 'gap', 'needs-human'];
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- refusals ----------

const REFUSALS = {
  INVALID_ARGUMENTS: 'the arguments are not valid',
  INVALID_REPOSITORY: 'the project folder does not exist or is not a folder',
  UNSAFE_PATH: 'a path is empty, absolute, too long, has . or .. parts, backslashes, colons or control characters, or passes through something that is not a folder',
  SENSITIVE_PATH: 'an attached file path names credential-like material (.env, .git, .ssh, key, certificate or keystore files, or names containing password, secret, token or credential) or looks like a secret',
  MISSING_FILE: 'a named file does not exist',
  UNREADABLE_PATH: 'a path could not be inspected or read because of a file system error, such as missing permission',
  SYMLINK_REFUSED: 'a path goes through a symbolic link, which is never followed',
  UNSAFE_FILE: 'a named file is not a regular file with exactly one link (folders and hard links are refused)',
  INPUT_LIMIT: 'an input is larger than its limit (catalog 1 MB, record 64 KB, attached file 32 MB, 5000 records, 256 MB read in one run)',
  FILE_CHANGED_DURING_READ: 'a file changed while it was being read; run the command again',
  MALFORMED_JSON: 'a JSON file does not parse',
  MISSING_CATALOG: 'there is no security catalog at .skilliton/security/catalog.json; prepare the project first',
  INVALID_CATALOG: 'the security catalog does not match schema 1 (schemaVersion 1, a catalogVersion, and controls with a unique id, a title, related https mappings, expectedEvidence, and an optional whole-number maxAgeDays from 1 to 3650)',
  INVALID_RECORD_INPUT: 'the control is not in the catalog, the assessment is not observed, gap or needs-human, an attached file is listed twice, or the note (up to 1000 characters) or reviewer (up to 120) is empty, too long, has surrounding spaces or control characters, or looks like a secret; values are not shown',
  OBSERVED_REQUIRES_ATTACHMENTS: 'an observed assessment needs at least one source file and one artifact file',
  UNSAFE_RECORD_DIRECTORY: 'the records path .skilliton/security/records is not a folder',
  UNSAFE_DIRECTORY: 'a folder Skilliton writes into is not a real folder',
  UNSAFE_OUTPUT: 'the output path exists and is not a regular single-link file, or a record with that name already exists',
  NON_GENERATED_REPORT: '.skilliton/security/REPORT.md lacks the generated marker, so it is a human document and was left untouched; move it aside to regenerate the report',
  CHANGED_SINCE_READ: 'the file changed after Skilliton read it; run the command again',
  WRITE_FAILED: 'a file could not be written',
  INVALID_APPLICABILITY: 'the applicability file .skilliton/security/applicability.json does not match schema 1 (schemaVersion 1, and decisions each with controlId, applies true or false, rationale, decidedBy and a past ISO decidedAt)',
  INVALID_DECISION_INPUT: 'the control is not in the catalog, or the rationale (up to 1000 characters) or decided-by label (up to 120) is empty, too long, has surrounding spaces or control characters, or looks like a secret; values are not shown',
  APPLICABILITY_LOCKED: 'another applicability write holds .skilliton/security/applicability.lock; if no other write is running, an earlier one was interrupted, so delete that lock file and run again',
  INVALID_EVIDENCE: 'the security evidence is invalid (run security status to see why), so the findings section was not regenerated',
  MISSING_BACKLOG: 'the backlog record does not exist; prepare the project (or create the file) first',
  INVALID_FINDINGS_MARKERS: 'the backlog record has a security-findings start or end marker that is duplicated, unpaired, out of order, or not on a line of its own',
  UNKNOWN_CONTROL: 'the control is not in the project catalog; pass --control with one of the catalog control ids',
  SOURCE_REQUIRED: 'the tests collector needs at least one --source file that its checks cover',
  NO_DELIVERY_POLICY: 'there is no .skilliton/delivery.json, so there are no checks to run',
  INVALID_DELIVERY_POLICY: 'the delivery policy .skilliton/delivery.json is not usable',
  NO_DELIVERY_CHECKS: 'the delivery policy defines no checks',
  GIT_NOT_FOUND: 'git was not found on PATH',
  GIT_FAILED: 'a git command failed',
  NOT_A_GIT_REPOSITORY: 'the project folder is not inside a git repository',
  NOT_REPOSITORY_ROOT: 'the project folder is not the root of its git repository',
  NOTHING_TO_SCAN: 'no tracked file could be scanned',
  COLLECTION_INTERRUPTED: 'the collection was interrupted before it finished, so nothing was recorded',
  RECORD_NOT_WRITTEN: 'the collector saved its output, but the observation record was not written',
};
const FAILED_CODES = new Set(['UNREADABLE_PATH', 'WRITE_FAILED', 'GIT_NOT_FOUND', 'GIT_FAILED', 'COLLECTION_INTERRUPTED', 'RECORD_NOT_WRITTEN']);

export class SecurityRefusal extends Error {
  // detail: optional plain text built only from validated values (repository-relative paths Skilliton chose or
  // accepted, counts, fixed phrases). Never pass supplied text or file contents.
  constructor(code, detail = null) {
    super(`${code}: ${REFUSALS[code] ?? 'refused'}`);
    this.code = code;
    this.kind = FAILED_CODES.has(code) ? 'failed' : 'invalid';
    this.detail = detail;
  }
}
export const refusalText = (code) => REFUSALS[code] ?? 'the operation was refused';
const fail = (code, detail) => { throw new SecurityRefusal(code, detail); };

// ---------- values and paths ----------

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (value, names) => object(value) && Object.keys(value).every((k) => names.includes(k)) && names.every((k) => Object.hasOwn(value, k));

// The prototype's secret shapes, one named rule each. secretShaped() is true when any rule matches, which is exactly
// what the prototype's single expression tested. The secrets collector scans tracked files with the same rules.
export const SECRET_SHAPES = [
  { rule: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { rule: 'known-token-prefix', re: /\b(?:gh[pousr]_|github_pat_|sk-(?:proj-|ant-)?|AKIA|ASIA)[A-Za-z0-9_-]{12,}/i },
  { rule: 'json-web-token', re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i },
  { rule: 'credential-assignment', re: /\b(?:password|passwd|secret|token|api[-_ ]?key|authorization)\s*[:=]\s*\S+/i },
  { rule: 'bearer-credential', re: /\bBearer\s+\S+/i },
  { rule: 'long-encoded-run', re: /[A-Za-z0-9+/_=-]{48,}/i },
];
export const secretShaped = (s) => SECRET_SHAPES.some(({ re }) => re.test(s));
// Attached file paths: every shape applies to the whole path, except the long encoded run, which applies to each
// path part. Across parts it refused ordinary deep paths (packs/base/plugins/workflow/runtime/lib/security is a
// 48-character run), while a run inside one part is still refused.
const secretShapedPath = (p) => SECRET_SHAPES.some(({ rule, re }) => (rule === 'long-encoded-run' ? p.split('/').some((part) => re.test(part)) : re.test(p)));

export function textField(s, max = 200) {
  return typeof s === 'string' && s.length > 0 && s.length <= max && s.trim() === s && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s) && !secretShaped(s);
}
const patternField = (value, pattern) => typeof value === 'string' && pattern.test(value) && !secretShaped(value);

export function relativePath(p, attachment = false) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 400 || p.startsWith('/') || /[\\\x00-\x1f\x7f:]/.test(p)) fail('UNSAFE_PATH');
  const parts = p.split('/');
  if (parts.some((v) => !v || v === '.' || v === '..')) fail('UNSAFE_PATH');
  if (attachment && secretShapedPath(p)) fail('SENSITIVE_PATH');
  if (attachment && parts.some((v) => /^(?:\.git|\.env(?:[.-].*)?|\.ssh|\.aws|\.azure|\.kube|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/i.test(v)
    || /(?:credential|password|passwd|secret|token|private[-_.]?key)/i.test(v)
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(v))) fail('SENSITIVE_PATH');
  return parts;
}

// The project folder as a real path. Symbolic links above the project folder (for example /var on macOS) are resolved
// once here; every path below it is inspected part by part and never followed.
export function projectRoot(dir) {
  let real, st;
  try { real = realpathSync(resolve(dir)); } catch (e) { fail(e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'INVALID_REPOSITORY' : 'UNREADABLE_PATH'); }
  try { st = lstatSync(real); } catch { fail('UNREADABLE_PATH'); }
  if (!st.isDirectory()) fail('INVALID_REPOSITORY');
  return real;
}

// lstat each part of rel below root. Symbolic links anywhere are refused, and every part but the last must be a folder.
function inspect(root, rel, missing = false) {
  const parts = rel.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let st;
    try { st = lstatSync(current); } catch (e) {
      if (e.code === 'ENOENT' && missing) return null;
      if (e.code === 'ENOENT') fail('MISSING_FILE');
      if (e.code === 'ENOTDIR') fail('UNSAFE_PATH');
      fail('UNREADABLE_PATH');
    }
    if (st.isSymbolicLink()) fail('SYMLINK_REFUSED');
    if (i !== parts.length - 1 && !st.isDirectory()) fail('UNSAFE_PATH');
    if (i === parts.length - 1) return st;
  }
  return null;
}
function checkedPath(root, rel, missing = false) {
  relativePath(rel);
  return { path: join(root, rel), stat: inspect(root, rel, missing) };
}
// The stat of a repository-relative path, or null when it does not exist; refuses unsafe paths and links.
export const inspectPath = (root, rel) => checkedPath(root, rel, true).stat;

// A read budget for one operation, so one process can evaluate many projects without sharing a counter.
export const newBudget = (total = LIMIT.total) => ({ bytesRead: 0, total });

function readChecked(root, rel, limit, budget) {
  const { path, stat } = checkedPath(root, rel);
  if (!stat.isFile() || stat.nlink !== 1) fail('UNSAFE_FILE');
  if (stat.size > limit || budget.bytesRead + stat.size > budget.total) fail('INPUT_LIMIT');
  let fd;
  try {
    try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (e) { fail(e.code === 'ELOOP' ? 'SYMLINK_REFUSED' : e.code === 'ENOENT' ? 'FILE_CHANGED_DURING_READ' : 'UNREADABLE_PATH'); }
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) fail('FILE_CHANGED_DURING_READ');
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      let count;
      try { count = readSync(fd, buffer, offset, buffer.length - offset, offset); } catch { fail('UNREADABLE_PATH'); }
      if (!count) fail('FILE_CHANGED_DURING_READ');
      offset += count;
    }
    const after = fstatSync(fd);
    const visible = inspect(root, rel);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || visible.ino !== before.ino || visible.dev !== before.dev) fail('FILE_CHANGED_DURING_READ');
    budget.bytesRead += buffer.length;
    return { buffer, stat: after };
  } finally { if (fd !== undefined) closeSync(fd); }
}
const safeRead = (root, rel, limit, budget) => readChecked(root, rel, limit, budget).buffer;
// For collectors: the bytes and stat of one repository file, read with the same protections.
export const readRepositoryFile = (root, rel, budget, limit = LIMIT.file) => readChecked(root, rel, limit, budget);

export const digest = (data) => createHash('sha256').update(data).digest('hex');
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (object(v)) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function jsonRead(root, rel, limit, budget) {
  const data = safeRead(root, rel, limit, budget);
  try { return JSON.parse(data.toString('utf8')); } catch { fail('MALFORMED_JSON'); }
}

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

export function ensureDirectory(root, rel) {
  const parts = relativePath(rel);
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/');
    if (!inspect(root, sub, true)) {
      try { mkdirSync(join(root, sub), { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') fail('WRITE_FAILED'); }
    }
    if (!inspect(root, sub).isDirectory()) fail('UNSAFE_DIRECTORY');
  }
}

// Writes data to rel through a temporary file, rechecking the destination immediately before it is placed.
//   mode "record":  a new immutable file, linked into place, so an existing file is never replaced.
//   mode "report":  replaces the file only when it is absent or starts with REPORT_MARKER.
//   mode "replace": replaces the file only when its bytes still equal `expected` (null: it must still be absent).
// Temporary files live in tempDir (default .skilliton/security, outside the records folder, so every entry in records
// must validate, including unexpected hidden files).
function publish(root, rel, data, mode, { expected = null, tempDir = SECURITY_DIR, fileMode = 0o600, budget = newBudget() } = {}) {
  const { path, stat } = checkedPath(root, rel, true);
  const immutable = mode === 'record';
  const guard = (current) => {
    if (current && (!current.isFile() || current.nlink !== 1 || immutable)) fail('UNSAFE_OUTPUT');
    if (mode === 'report' && current && !safeRead(root, rel, LIMIT.catalog, budget).toString('utf8').startsWith(REPORT_MARKER + '\n')) fail('NON_GENERATED_REPORT');
    if (mode === 'replace' && (expected === null ? current !== null : !current || !safeRead(root, rel, LIMIT.backlog, budget).equals(expected))) fail('CHANGED_SINCE_READ');
  };
  guard(stat);
  const parentRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : null;
  const tempRel = `${tempDir ? `${tempDir}/` : ''}.pending-${randomUUID()}`;
  const temp = checkedPath(root, tempRel, true).path;
  let fd;
  try {
    try { fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); } catch { fail('WRITE_FAILED'); }
    try {
      writeFileSync(fd, data);
      if (fileMode !== 0o600) fchmodSync(fd, fileMode);
      fsyncSync(fd);
    } catch { fail('WRITE_FAILED'); }
    closeSync(fd); fd = undefined;
    if (parentRel) checkedPath(root, parentRel);
    guard(checkedPath(root, rel, true).stat);
    try {
      if (immutable) {
        // link is atomic and refuses collisions without overwriting a record.
        linkSync(temp, path);
        unlinkSync(temp);
      } else renameSync(temp, path);
    } catch (e) { fail(e.code === 'EEXIST' ? 'UNSAFE_OUTPUT' : 'WRITE_FAILED'); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    // Recheck parents before cleanup; never follow a substituted directory.
    try { checkedPath(root, tempRel); unlinkSync(temp); } catch { /* Nothing safely left to remove. */ }
  }
}

export function fingerprintAttachment(root, rel, budget = newBudget()) {
  relativePath(rel, true);
  return { path: rel, sha256: digest(safeRead(root, rel, LIMIT.file, budget)) };
}

// input: { controlId, assessment, note, reviewer, sources, artifacts }. Each attachment is a repository-relative path
// (fingerprinted now) or a { path, sha256 } fingerprint a collector took from the bytes it actually used.
export function createRecord(root, input, { apply = false, budget = newBudget(), catalog = null, now = new Date() } = {}) {
  const cat = catalog ?? readCatalog(root, budget);
  const ctrl = cat.controls.find((c) => c.id === input.controlId);
  if (!ctrl || !ASSESSMENTS.includes(input.assessment) || !textField(input.note, 1000) || !textField(input.reviewer, 120)) fail('INVALID_RECORD_INPUT');
  const lists = [input.sources ?? [], input.artifacts ?? []];
  for (const list of lists) {
    if (!Array.isArray(list) || list.length > LIMIT.attachments) fail('INVALID_RECORD_INPUT');
    const paths = list.map((a) => (typeof a === 'string' ? a : a?.path));
    if (new Set(paths).size !== paths.length) fail('INVALID_RECORD_INPUT');
  }
  if (input.assessment === 'observed' && (!lists[0].length || !lists[1].length)) fail('OBSERVED_REQUIRES_ATTACHMENTS');
  const fingerprint = (a) => {
    if (typeof a === 'string') return fingerprintAttachment(root, a, budget);
    if (!keys(a, ['path', 'sha256']) || !SHA.test(a.sha256)) fail('INVALID_RECORD_INPUT');
    relativePath(a.path, true);
    return { path: a.path, sha256: a.sha256 };
  };
  const r = { schemaVersion: 1, id: randomUUID(), controlId: ctrl.id, catalogVersion: cat.catalogVersion, controlHash: controlHash(cat, ctrl),
    recordedAt: now.toISOString(), assessment: input.assessment, note: input.note, reviewer: input.reviewer,
    sources: lists[0].map(fingerprint), artifacts: lists[1].map(fingerprint) };
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
// a listed file is missing, not a regular file, or has a different size or content. A file whose size and modification
// time both still match is not reread; an edit that preserves both is not detected. Files added after the manifest
// was written are not part of the claim and are not detected.
export function renderManifest(entries, description) {
  return [MANIFEST_MARKER, `# ${description}`, '# Each line: sha256 size mtimeMs path', ...entries.map((e) => `${e.sha256} ${e.size} ${e.mtimeMs} ${e.path}`), ''].join('\n');
}
// An artifact saved before the rename starts with the earlier marker and is checked the same way: records are immutable.
const isManifest = (buffer) => [MANIFEST_MARKER, LEGACY_MANIFEST_MARKER].some((marker) => buffer.subarray(0, marker.length + 1).toString('utf8') === `${marker}\n`);

// 'same' | 'changed' | 'unsafe' (the manifest itself does not parse).
function verifyManifest(root, buffer, budget) {
  const lines = buffer.toString('utf8').split('\n');
  let entries = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' && i === lines.length - 1) break;
    if (line.startsWith('#')) continue;
    const m = /^([a-f0-9]{64}) (\d{1,15}) (\d{1,17}(?:\.\d{1,20})?) (.+)$/.exec(line);
    if (!m || ++entries > LIMIT.manifestEntries) return 'unsafe';
    const [, sha, size, mtime, rel] = m;
    let st;
    try { relativePath(rel); } catch { return 'unsafe'; }
    try { st = inspect(root, rel, true); } catch { return 'changed'; }
    if (!st || !st.isFile() || st.size !== Number(size)) return 'changed';
    if (st.mtimeMs === Number(mtime)) continue;
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
