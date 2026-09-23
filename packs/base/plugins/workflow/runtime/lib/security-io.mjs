// security-io.mjs: the file layer under the security evidence engine (lib/security.mjs): its limits and paths, the
// refusal codes, the secret shapes, repository-relative path checks that never follow a link, guarded reads with a
// budget, and the atomic publish that never replaces a record. Moved out of security.mjs on 2026-09-22 character for
// character (the split-a-file skill); the engine imports these and re-exports the public ones, so callers are unchanged.
//
// Node built-ins only; nothing outside the workflow plugin folder is imported.

import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EVIDENCE_SHAPES } from './secret-rules.mjs';

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
  INVALID_SECRETS_ALLOWLIST: 'the secrets allowlist .skilliton/security/secrets-allow.json does not match its schema (a JSON array of objects, each with a repository-relative "path", a "rule" the secrets collector uses, either a whole-number "line" or a 64-character "sha256" of the matched line, and a non-empty "reason", 1 to 500 characters, no control characters, not secret-shaped, and no other keys); values are not shown',
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
export const fail = (code, detail) => { throw new SecurityRefusal(code, detail); };

// ---------- values and paths ----------

export const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The engine's secret shapes, one named rule each, from lib/secret-rules.mjs. secretShaped() is true when any rule
// matches. The secrets collector scans tracked files with the same rules.
export const SECRET_SHAPES = EVIDENCE_SHAPES;
export const secretShaped = (s) => SECRET_SHAPES.some(({ re }) => re.test(s));
// Attached file paths: every shape applies to the whole path, except the long encoded run, which applies to each
// path part. Across parts it refused ordinary deep paths (packs/base/plugins/workflow/runtime/lib/security is a
// 48-character run), while a run inside one part is still refused.
const secretShapedPath = (p) => SECRET_SHAPES.some(({ rule, re }) => (rule === 'long-encoded-run' ? p.split('/').some((part) => re.test(part)) : re.test(p)));

export function textField(s, max = 200) {
  return typeof s === 'string' && s.length > 0 && s.length <= max && s.trim() === s && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s) && !secretShaped(s);
}

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
export function inspect(root, rel, missing = false) {
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
export function checkedPath(root, rel, missing = false) {
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
export const safeRead = (root, rel, limit, budget) => readChecked(root, rel, limit, budget).buffer;
// For collectors: the bytes and stat of one repository file, read with the same protections.
export const readRepositoryFile = (root, rel, budget, limit = LIMIT.file) => readChecked(root, rel, limit, budget);

export const digest = (data) => createHash('sha256').update(data).digest('hex');
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (object(v)) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export function jsonRead(root, rel, limit, budget) {
  const data = safeRead(root, rel, limit, budget);
  try { return JSON.parse(data.toString('utf8')); } catch { fail('MALFORMED_JSON'); }
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
export function publish(root, rel, data, mode, { expected = null, tempDir = SECURITY_DIR, fileMode = 0o600, budget = newBudget() } = {}) {
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
