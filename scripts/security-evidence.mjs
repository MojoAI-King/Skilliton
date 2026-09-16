#!/usr/bin/env node
// Self-contained runtime copied into prepared projects. Records are claims with
// file fingerprints, not scanner attestations, signatures, or compliance passes.
// This tool neither runs checks nor reads file contents into generated reports.
import { constants, lstatSync, fstatSync, openSync, closeSync, readSync, writeFileSync, fsyncSync, mkdirSync, renameSync, unlinkSync, linkSync, opendirSync } from 'node:fs';
import { resolve, join, parse, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const LIMIT = { catalog: 1024 * 1024, record: 64 * 1024, file: 32 * 1024 * 1024, total: 256 * 1024 * 1024, records: 5000, controls: 500, attachments: 32 };
const BASE = '.skillgate/security';
const REPORT_MARKER = '<!-- skillgate-security-evidence-report:v1 -->';
const ASSESSMENTS = ['observed', 'gap', 'needs-human'];
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
let bytesRead = 0;

class Refusal extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new Refusal(code); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (value, names) => object(value) && Object.keys(value).every(k => names.includes(k)) && names.every(k => Object.hasOwn(value, k));
function secretShaped(s) {
  return /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|sk-(?:proj-|ant-)?|AKIA|ASIA)[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:password|passwd|secret|token|api[-_ ]?key|authorization)\s*[:=]\s*\S+|\bBearer\s+\S+|[A-Za-z0-9+/_=-]{48,})/i.test(s);
}
function textField(s, max = 200) {
  return typeof s === 'string' && s.length > 0 && s.length <= max && s.trim() === s && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s) && !secretShaped(s);
}
const patternField = (value, pattern) => typeof value === 'string' && pattern.test(value) && !secretShaped(value);
function relativePath(p, attachment = false) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 400 || p.startsWith('/') || /[\\\x00-\x1f\x7f:]/.test(p)) fail('UNSAFE_PATH');
  const parts = p.split('/');
  if (parts.some(v => !v || v === '.' || v === '..')) fail('UNSAFE_PATH');
  if (attachment && secretShaped(p)) fail('SENSITIVE_PATH');
  if (attachment && parts.some(v => /^(?:\.git|\.env(?:[.-].*)?|\.ssh|\.aws|\.azure|\.kube|\.npmrc|\.pypirc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/i.test(v)
    || /(?:credential|password|passwd|secret|token|private[-_.]?key)/i.test(v)
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(v))) fail('SENSITIVE_PATH');
  return parts;
}
function inspectAbsolute(p, missing = false) {
  const absolute = resolve(p);
  let current = parse(absolute).root;
  const parts = absolute.slice(current.length).split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let st;
    try { st = lstatSync(current); } catch (e) {
      if (e.code === 'ENOENT' && missing) return null;
      if (e.code === 'ENOENT') fail('MISSING_FILE');
      fail('UNREADABLE_PATH');
    }
    if (st.isSymbolicLink()) fail('SYMLINK_REFUSED');
    if (i !== parts.length - 1 && !st.isDirectory()) fail('UNSAFE_PATH');
    if (i === parts.length - 1) return st;
  }
  return lstatSync(current);
}
function checkedPath(root, rel, missing = false) {
  relativePath(rel);
  const path = join(root, rel);
  return { path, stat: inspectAbsolute(path, missing) };
}
function safeRead(root, rel, limit) {
  const { path, stat } = checkedPath(root, rel);
  if (!stat.isFile() || stat.nlink !== 1) fail('UNSAFE_FILE');
  if (stat.size > limit || bytesRead + stat.size > LIMIT.total) fail('INPUT_LIMIT');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) fail('FILE_CHANGED_DURING_READ');
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!count) fail('FILE_CHANGED_DURING_READ');
      offset += count;
    }
    const after = fstatSync(fd);
    const visible = inspectAbsolute(path);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || visible.ino !== before.ino || visible.dev !== before.dev) fail('FILE_CHANGED_DURING_READ');
    bytesRead += buffer.length;
    return buffer;
  } finally { if (fd !== undefined) closeSync(fd); }
}
const digest = data => createHash('sha256').update(data).digest('hex');
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function jsonRead(root, rel, limit) {
  const data = safeRead(root, rel, limit);
  try { return JSON.parse(data.toString('utf8')); } catch { fail('MALFORMED_JSON'); }
}
function catalogRead(root) {
  const c = jsonRead(root, `${BASE}/catalog.json`, LIMIT.catalog);
  const hasDescription = object(c) && Object.hasOwn(c, 'description');
  const catalogKeys = ['schemaVersion', 'catalogVersion', 'controls', ...(hasDescription ? ['description'] : [])];
  if (!keys(c, catalogKeys) || (hasDescription && !textField(c.description, 1000)) || c.schemaVersion !== 1 || !patternField(c.catalogVersion, VERSION) || !Array.isArray(c.controls) || c.controls.length === 0 || c.controls.length > LIMIT.controls) fail('INVALID_CATALOG');
  const seen = new Set();
  for (const ctrl of c.controls) {
    if (!keys(ctrl, ['id', 'title', 'mappings', 'expectedEvidence']) || !patternField(ctrl.id, ID) || !textField(ctrl.title) || seen.has(ctrl.id)) fail('INVALID_CATALOG');
    seen.add(ctrl.id);
    if (!Array.isArray(ctrl.mappings) || ctrl.mappings.length === 0 || ctrl.mappings.length > 32 || !Array.isArray(ctrl.expectedEvidence) || ctrl.expectedEvidence.length === 0 || ctrl.expectedEvidence.length > 32 || !ctrl.expectedEvidence.every(s => textField(s, 500))) fail('INVALID_CATALOG');
    for (const m of ctrl.mappings) {
      if (!keys(m, ['framework', 'version', 'reference', 'url', 'relationship']) || !textField(m.framework) || !textField(m.version, 64) || !textField(m.reference) || !textField(m.url, 1000) || m.relationship !== 'related') fail('INVALID_CATALOG');
      let url;
      try { url = new URL(m.url); } catch { fail('INVALID_CATALOG'); }
      if (url.protocol !== 'https:' || url.username || url.password) fail('INVALID_CATALOG');
    }
  }
  return c;
}
const controlHash = (catalog, ctrl) => digest(canonical({ catalogVersion: catalog.catalogVersion, control: ctrl }));
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
function historyRead(root) {
  const { path, stat } = checkedPath(root, `${BASE}/records`, true);
  if (!stat) return { records: [], invalid: 0 };
  if (!stat.isDirectory()) fail('UNSAFE_RECORD_DIRECTORY');
  const records = [];
  let invalid = 0;
  let count = 0;
  const now = Date.now();
  const directory = opendirSync(path);
  try {
    let entry;
    while ((entry = directory.readSync())) {
      if (++count > LIMIT.records) fail('INPUT_LIMIT');
      try {
        if (entry.name === 'README.md') {
          safeRead(root, `${BASE}/records/README.md`, LIMIT.record);
          continue;
        }
        if (!/^[a-f0-9-]{36}\.json$/.test(entry.name) || !entry.isFile()) fail('INVALID_RECORD');
        const r = jsonRead(root, `${BASE}/records/${entry.name}`, LIMIT.record);
        recordValidate(r, entry.name, now);
        records.push(r);
      } catch (e) {
        if (e instanceof Refusal && e.code === 'INPUT_LIMIT') throw e;
        invalid++;
      }
    }
  } finally { directory.closeSync(); }
  return { records, invalid };
}
function ensureDirectory(root, rel) {
  const parts = relativePath(rel);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const st = inspectAbsolute(current, true);
    if (!st) {
      try { mkdirSync(current, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
    if (!inspectAbsolute(current).isDirectory()) fail('UNSAFE_DIRECTORY');
  }
}
function publish(root, rel, data, immutable) {
  const { path, stat } = checkedPath(root, rel, true);
  if (stat && (!stat.isFile() || stat.nlink !== 1 || immutable)) fail('UNSAFE_OUTPUT');
  const checkGenerated = existing => {
    if (existing && !immutable && !safeRead(root, rel, LIMIT.catalog).toString('utf8').startsWith(REPORT_MARKER + '\n')) fail('NON_GENERATED_REPORT');
  };
  checkGenerated(stat);
  const parentRel = rel.slice(0, rel.lastIndexOf('/'));
  // Keep incomplete writes outside the evidence directory so every entry in
  // records must validate, including unexpected hidden files.
  const tempRel = `${BASE}/.pending-${randomUUID()}`;
  const temp = checkedPath(root, tempRel, true).path;
  let fd;
  try {
    fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, data);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    checkedPath(root, parentRel);
    const current = checkedPath(root, rel, true).stat;
    if (current && (!current.isFile() || current.nlink !== 1 || immutable)) fail('UNSAFE_OUTPUT');
    checkGenerated(current);
    if (immutable) {
      // link is atomic and refuses collisions without overwriting a record.
      linkSync(temp, path);
      unlinkSync(temp);
    } else renameSync(temp, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    // Recheck parents before cleanup; never follow a substituted directory.
    try { checkedPath(root, tempRel); unlinkSync(temp); } catch { /* Nothing safely left to remove. */ }
  }
}
function argumentsRead(args) {
  if (args.length < 1 || args.length > 150 || args.some(s => s.length > 4096)) fail('INVALID_ARGUMENTS');
  if ((args.length === 1 && args[0] === '--help') || (args.length === 2 && ['record', 'status'].includes(args[0]) && args[1] === '--help')) return { help: true };
  const command = args.shift();
  if (!['record', 'status'].includes(command)) fail('INVALID_ARGUMENTS');
  const out = { command, apply: false, source: [], artifact: [] };
  const allowed = command === 'status' ? ['dir'] : ['dir', 'control', 'assessment', 'source', 'artifact', 'note', 'reviewer'];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { if (out.apply) fail('INVALID_ARGUMENTS'); out.apply = true; continue; }
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed.includes(key) || i + 1 >= args.length) fail('INVALID_ARGUMENTS');
    const value = args[++i];
    if (value.startsWith('--')) fail('INVALID_ARGUMENTS');
    if (key === 'source' || key === 'artifact') {
      if (out[key].length >= LIMIT.attachments || out[key].includes(value)) fail('INVALID_ARGUMENTS');
      out[key].push(value);
    } else {
      if (Object.hasOwn(out, key)) fail('INVALID_ARGUMENTS');
      out[key] = value;
    }
  }
  if (!out.dir) fail('INVALID_ARGUMENTS');
  out.root = resolve(out.dir);
  const st = inspectAbsolute(out.root);
  if (!st.isDirectory()) fail('INVALID_REPOSITORY');
  return out;
}
function makeRecord(options, catalog) {
  const ctrl = catalog.controls.find(c => c.id === options.control);
  if (!ctrl || !ASSESSMENTS.includes(options.assessment) || !textField(options.note, 1000) || !textField(options.reviewer, 120)) fail('INVALID_RECORD_INPUT');
  if (options.assessment === 'observed' && (!options.source.length || !options.artifact.length)) fail('OBSERVED_REQUIRES_ATTACHMENTS');
  const fingerprint = path => { relativePath(path, true); return { path, sha256: digest(safeRead(options.root, path, LIMIT.file)) }; };
  const r = { schemaVersion: 1, id: randomUUID(), controlId: ctrl.id, catalogVersion: catalog.catalogVersion, controlHash: controlHash(catalog, ctrl),
    recordedAt: new Date().toISOString(), assessment: options.assessment, note: options.note, reviewer: options.reviewer,
    sources: options.source.map(fingerprint), artifacts: options.artifact.map(fingerprint) };
  if (options.apply) {
    ensureDirectory(options.root, `${BASE}/records`);
    publish(options.root, `${BASE}/records/${r.id}.json`, JSON.stringify(r, null, 2) + '\n', true);
  }
  process.stdout.write(options.apply ? `Recorded observation or assessment: ${r.id}. This is not a compliance finding.\n` : 'Dry run: record input validated. No files written.\n');
  return 0;
}
const markdown = s => s.replace(/[\\|`*_{}\[\]()<>#]/g, '\\$&');
function status(options, catalog) {
  const history = historyRead(options.root);
  const latest = new Map();
  for (const r of history.records) {
    const prev = latest.get(r.controlId);
    if (!prev || r.recordedAt > prev.recordedAt || (r.recordedAt === prev.recordedAt && r.id > prev.id)) latest.set(r.controlId, r);
  }
  const fingerprintCache = new Map();
  const rows = catalog.controls.map(ctrl => {
    const r = latest.get(ctrl.id);
    let freshness = history.invalid ? 'invalid' : r ? 'current' : 'missing';
    if (r && !history.invalid) {
      if (r.controlHash !== controlHash(catalog, ctrl) || r.catalogVersion !== catalog.catalogVersion) freshness = 'stale';
      for (const a of [...r.sources, ...r.artifacts]) {
        try {
          if (!fingerprintCache.has(a.path)) fingerprintCache.set(a.path, digest(safeRead(options.root, a.path, LIMIT.file)));
          if (fingerprintCache.get(a.path) !== a.sha256 && freshness !== 'invalid') freshness = 'stale';
        } catch (e) {
          if (e instanceof Refusal && e.code === 'MISSING_FILE' && freshness !== 'invalid') freshness = 'stale';
          else freshness = 'invalid';
        }
      }
    }
    return { ctrl, assessment: r?.assessment ?? 'none', freshness };
  });
  const observed = rows.filter(r => r.assessment === 'observed' && r.freshness === 'current').length;
  const invalid = history.invalid > 0 || rows.some(r => r.freshness === 'invalid');
  const inactive = history.records.filter(r => !catalog.controls.some(c => c.id === r.controlId)).length;
  const lines = [REPORT_MARKER, '', '# Security evidence status', '', `Current recorded observations: ${observed}/${rows.length} controls.`,
    `Invalid evidence records: ${history.invalid}.`, `Historical records outside the current catalog: ${inactive}.`, '',
    'Assessment and freshness are separate. Observed means a recorded claim, not a control pass.',
    'Exit 0 means only that every control has a current recorded observation. It does not establish compliance, certification, or passing security checks.',
    'File hashes detect drift from a recorded claim. This tool does not run checks or authenticate reviewers.',
    'Mappings marked related are pointers for review, not claims of equivalence or complete framework coverage.', '',
    '| Control | Title | Assessment | Freshness |', '| --- | --- | --- | --- |',
    ...rows.map(r => `| ${markdown(r.ctrl.id)} | ${markdown(r.ctrl.title)} | ${r.assessment} | ${r.freshness} |`), '',
    'Missing records and unresolved assessments need evidence or human review. Stale records need a new observation after review; existing records are never restamped.', ''];
  if (history.invalid) lines.splice(6, 0, 'Invalid records make every control invalid until the record problem is resolved. No malformed record is silently discarded.');
  const report = lines.join('\n');
  if (options.apply) publish(options.root, `${BASE}/REPORT.md`, report, false);
  process.stdout.write(report);
  return invalid ? 1 : observed === rows.length ? 0 : 2;
}

const HELP = `Security evidence records and freshness reporting

Usage:
  node security-evidence.mjs --help
  node security-evidence.mjs record --help
  node security-evidence.mjs status --help
  node security-evidence.mjs record --dir <repo> --control <id> --assessment observed|gap|needs-human --note <text> --reviewer <label> [--source <repo-relative-file>] [--artifact <repo-relative-file>] [--apply]
  node security-evidence.mjs status --dir <repo> [--apply]

Repeat --source and --artifact for multiple files. Observed requires at least
one source and one artifact. Values containing spaces must be shell quoted.
Record validates inputs without writing unless --apply is supplied.
Status prints the derived report; --apply also writes .skillgate/security/REPORT.md.
Only a report carrying this tool's generated marker can be overwritten.
Existing evidence records are never edited. Help never reads or writes project files.

Exit 0: help displayed, record input accepted, or all catalog controls have
        current recorded observations for status. This is not compliance,
        certification, authenticated review, or proof that security checks passed.
Exit 1: invalid invocation, malformed or unsafe input, invalid evidence, or
        an operation refusal or failure.
Exit 2: status has missing or stale evidence, a gap, or a needs-human assessment.
`;

try {
  const options = argumentsRead(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    process.exitCode = 0;
  } else {
    const catalog = catalogRead(options.root);
    process.exitCode = options.command === 'record' ? makeRecord(options, catalog) : status(options, catalog);
  }
} catch (e) {
  // Never print raw OS errors, supplied arguments, JSON text, or secret values.
  const code = e instanceof Refusal ? e.code : 'OPERATION_FAILED';
  process.stderr.write(`Security evidence operation refused (${code}). No successful status is claimed.\n`);
  process.exitCode = 1;
}
