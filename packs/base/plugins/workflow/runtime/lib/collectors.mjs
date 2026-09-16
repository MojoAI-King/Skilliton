// collectors.mjs: the evidence collectors behind `skillgate security collect <name>` (docs/CONTRACTS.md sections 12
// and 14).
//
// Each collector gathers real evidence, saves it under .skillgate/private-evidence/ (local; prepare adds it to
// .gitignore), and records one observation through security.mjs whose note names the collector, its version, and the
// node and git versions. Without apply a collector only plans: it runs no check and writes nothing. A collector that
// cannot run records nothing and throws SecurityRefusal with the reason. Collectors never print: `log` receives
// progress lines that hold no evidence content, and results come back to the command.
//
// Node built-ins and this plugin's lib/ only.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMIT, PRIVATE_EVIDENCE_DIR, SECRET_SHAPES, SecurityRefusal,
  appendEvidence, closeEvidenceFile, createEvidenceFile, createRecord, digest, fingerprintAttachment, inspectPath,
  newBudget, readCatalog, readRepositoryFile, refusalText, renderManifest, textField,
} from './security.mjs';

// Secret shapes whose match is a gap by itself; the others need a person's review (see collectSecrets).
export const HIGH_CONFIDENCE_RULES = ['private-key-block', 'known-token-prefix', 'json-web-token'];

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DELIVERY_REL = '.skillgate/delivery.json';
export const DELIVERY_SCHEMA = 'skillgate.delivery/1';
const DELIVERY_LIMIT = 256 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 600;
const BRANCH_RE = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,100}$/;

// version: bump when what a collector checks, or how it decides observed or gap, changes.
export const COLLECTORS = {
  tests: { version: '1', control: 'SG-SECURITY-TESTS' },
  secrets: { version: '1', control: 'SG-SECRETS-IN-SOURCE' },
  'delivery-policy': { version: '1', control: 'SG-CHECK-CRITERIA' },
};

const fail = (code, detail) => { throw new SecurityRefusal(code, detail); };

function pluginVersion() {
  try {
    const v = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
    return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
  } catch { return null; }
}

export function toolVersions() {
  let git = null;
  try {
    const r = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (!r.error && r.status === 0) git = /^git version (\S+(?: \([^)]{1,40}\))?)/.exec(r.stdout.trim())?.[1] ?? null;
  } catch { git = null; }
  return { node: process.version, git, plugin: pluginVersion() };
}

function runGit(root, args, maxBuffer = 16 * 1024 * 1024) {
  const r = spawnSync('git', ['-C', root, ...args], { timeout: 120000, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  if (r.error?.code === 'ENOENT') fail('GIT_NOT_FOUND');
  if (r.error) fail('GIT_FAILED', `git ${args[0]} did not finish (${r.error.code ?? 'error'})`);
  return { status: r.status, stdout: r.stdout };
}

// true: git ignores .skillgate/private-evidence/; false: it does not; null: it could not be checked.
export function privateEvidenceIgnored(root) {
  try {
    const r = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', '--', `${PRIVATE_EVIDENCE_DIR}/probe.txt`], { timeout: 20000, stdio: 'ignore' });
    if (r.error) return null;
    return r.status === 0 ? true : r.status === 1 ? false : null;
  } catch { return null; }
}

function requireControl(catalog, control, collector) {
  const id = control ?? COLLECTORS[collector].control;
  if (typeof id !== 'string' || !catalog.controls.some((c) => c.id === id)) {
    fail('UNKNOWN_CONTROL', control === undefined ? `the default control for this collector, ${id}, is not in catalog ${catalog.catalogVersion}` : `catalog ${catalog.catalogVersion}`);
  }
  return id;
}

function reviewerFor(collector, reviewer) {
  const label = reviewer ?? `skillgate collect ${collector}`;
  if (!textField(label, 120)) fail('INVALID_RECORD_INPUT');
  return label;
}

const collectorLine = (collector, v) => `Collector: ${collector} version ${COLLECTORS[collector].version} (workflow plugin ${v.plugin ?? 'version unreadable'}); node ${v.node}; git ${v.git ?? 'not found'}`;

// The note must pass the record's text rules (no secret shapes, at most 1000 characters), so shorter forms are tried
// when names in the detailed form do not.
function collectorNote(collector, v, detailed, brief) {
  const head = `${collectorLine(collector, v)}.`;
  const tail = 'This records what the collector saw at that time; it is not a security pass.';
  for (const note of [`${head} ${detailed} ${tail}`, `${head} ${brief} ${tail}`, `${head} ${tail}`]) if (textField(note, 1000)) return note;
  fail('RECORD_NOT_WRITTEN', 'the collector note could not be formed');
}

function recordOrExplain(root, catalog, input, outputs) {
  try { return createRecord(root, input, { apply: true, catalog }); } catch (e) {
    if (e instanceof SecurityRefusal) throw new SecurityRefusal('RECORD_NOT_WRITTEN', `${e.code}: ${refusalText(e.code)}; the collector output is at ${outputs.join(' and ')}`);
    throw e;
  }
}

// Any failure after an evidence file exists says where that file is and that nothing was recorded, and exits 3,
// because something was written.
function keepOutputs(outputs, work) {
  try { return work(); } catch (e) {
    if (e instanceof SecurityRefusal && outputs.length && e.code !== 'RECORD_NOT_WRITTEN' && e.code !== 'COLLECTION_INTERRUPTED') {
      throw new SecurityRefusal(e.kind === 'failed' ? e.code : 'RECORD_NOT_WRITTEN', `${e.kind === 'failed' ? '' : `${e.code}: `}the collector output so far is at ${outputs.join(' and ')}; nothing was recorded`);
    }
    throw e;
  }
}

// ---------- delivery policy (CONTRACTS section 14) ----------

// { exists, fingerprint, problems, checks, protectedBranches, policyPaths }. problems are fixed phrases that never
// quote the file. A symbolic link, hard link or oversized file is refused by the read itself.
export function readDeliveryPolicy(root, budget = newBudget()) {
  const empty = { checks: [], protectedBranches: [], policyPaths: [] };
  if (!inspectPath(root, DELIVERY_REL)) return { exists: false, fingerprint: null, problems: [], ...empty };
  const { buffer } = readRepositoryFile(root, DELIVERY_REL, budget, DELIVERY_LIMIT);
  const fingerprint = { path: DELIVERY_REL, sha256: digest(buffer) };
  let policy;
  try { policy = JSON.parse(buffer.toString('utf8')); } catch { return { exists: true, fingerprint, problems: ['the file is not valid JSON'], ...empty }; }
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) return { exists: true, fingerprint, problems: ['the file does not hold a JSON object'], ...empty };
  const problems = [];
  if (policy.schema !== DELIVERY_SCHEMA) problems.push(`"schema" is not "${DELIVERY_SCHEMA}"`);
  let protectedBranches = [];
  if (!Array.isArray(policy.protectedBranches) || !policy.protectedBranches.every((b) => typeof b === 'string' && BRANCH_RE.test(b))) problems.push('"protectedBranches" is not a list of branch names');
  else protectedBranches = [...policy.protectedBranches];
  const checks = [];
  if (!Array.isArray(policy.checks)) problems.push('"checks" is not a list');
  else {
    policy.checks.forEach((c, i) => {
      const n = i + 1, before = problems.length;
      if (c === null || typeof c !== 'object' || Array.isArray(c)) { problems.push(`check ${n} is not an object`); return; }
      if (!textField(c.name, 120)) problems.push(`check ${n} has no usable "name" (1 to 120 characters, no control characters, not secret-shaped)`);
      else if (checks.some((x) => x.name === c.name) || policy.checks.slice(0, i).some((x) => x?.name === c.name)) problems.push(`check ${n} repeats the name of an earlier check`);
      if (!Array.isArray(c.command) || c.command.length < 1 || c.command.length > 200 || typeof c.command[0] !== 'string' || !c.command[0] || !c.command.every((a) => typeof a === 'string' && a.length <= 4096 && !a.includes('\0'))) {
        problems.push(`check ${n} "command" is not a list of 1 to 200 arguments starting with a program (a shell string is not accepted)`);
      }
      const timeout = c.timeoutSeconds === undefined ? DEFAULT_TIMEOUT_SECONDS : c.timeoutSeconds;
      if (!(Number.isInteger(timeout) && timeout >= 1 && timeout <= 86400)) problems.push(`check ${n} "timeoutSeconds" is not a whole number from 1 to 86400`);
      if (problems.length === before) checks.push({ name: c.name, command: [...c.command], timeoutSeconds: timeout });
    });
  }
  let policyPaths = [];
  if (policy.policyPaths !== undefined) {
    if (!Array.isArray(policy.policyPaths) || !policy.policyPaths.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 400)) problems.push('"policyPaths" is not a list of paths');
    else policyPaths = [...policy.policyPaths];
  }
  return { exists: true, fingerprint, problems, checks, protectedBranches, policyPaths };
}

// ---------- tests ----------

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const startFailure = (e) => (e?.code === 'ENOENT' ? 'the program was not found' : e?.code === 'EACCES' ? 'the program is not executable' : `the program could not start (${e?.code ?? 'error'})`);

export function describeResult(r) {
  if (r.interrupted) return 'interrupted';
  if (r.timedOut) return `timed out after ${r.timeoutSeconds}s and was stopped`;
  if (!r.started) return r.reason;
  if (r.exitCode === 0) return 'passed (exit 0)';
  return r.exitCode !== null ? `failed (exit ${r.exitCode})` : `failed (stopped by ${r.signal})`;
}

// Runs one check as an argument list, without a shell, in its own process group, writing stdout and stderr into fd.
// The whole group is stopped on timeout and on an interrupt of this process, while the check is still running. After
// the check exits, nothing is signalled: its process id may already belong to someone else. A background process the
// check left behind can still write to the evidence file, which then no longer matches its fingerprint, and status
// shows the observation as stale.
function runCheck(root, check, fd) {
  return new Promise((finish) => {
    const started = Date.now();
    let settled = false, timedOut = false, interrupted = false, child = null, timer = null;
    const stopGroup = () => {
      if (!child || child.pid === undefined) return;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch { /* the group has already exited */ }
    };
    const onSignal = () => { interrupted = true; stopGroup(); };
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      finish({ ...result, ms: Date.now() - started, timedOut, interrupted, timeoutSeconds: check.timeoutSeconds });
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    try {
      child = spawn(check.command[0], check.command.slice(1), { cwd: root, stdio: ['ignore', fd, fd], detached: process.platform !== 'win32', shell: false, windowsHide: true });
    } catch (e) {
      done({ ok: false, started: false, reason: startFailure(e) });
      return;
    }
    timer = setTimeout(() => { timedOut = true; stopGroup(); }, check.timeoutSeconds * 1000);
    child.once('error', (e) => done({ ok: false, started: false, reason: startFailure(e) }));
    child.once('exit', (code, signal) => done({ ok: !timedOut && !interrupted && code === 0, started: true, exitCode: code, signal }));
  });
}

// options: { sources: [repository-relative paths the checks cover], control, reviewer, apply, log }
export async function collectTests(root, { sources = [], control, reviewer, apply = false, log = () => {} } = {}) {
  const budget = newBudget();
  const catalog = readCatalog(root, budget);
  const controlId = requireControl(catalog, control, 'tests');
  const reviewerLabel = reviewerFor('tests', reviewer);
  if (!sources.length) fail('SOURCE_REQUIRED');
  const sourcePrints = sources.map((p) => fingerprintAttachment(root, p, budget));
  const policy = readDeliveryPolicy(root, budget);
  if (!policy.exists) fail('NO_DELIVERY_POLICY');
  if (policy.problems.length) fail('INVALID_DELIVERY_POLICY', policy.problems.join('; '));
  if (!policy.checks.length) fail('NO_DELIVERY_CHECKS');
  // The policy decides which checks ran, so a later change to it also makes the observation stale.
  const recordSources = sourcePrints.some((s) => s.path === policy.fingerprint.path) ? sourcePrints : [...sourcePrints, policy.fingerprint];
  if (recordSources.length > LIMIT.attachments) fail('INVALID_RECORD_INPUT');
  const plan = { controlId, sources: recordSources.map((s) => s.path), checks: policy.checks.map(({ name, command, timeoutSeconds }) => ({ name, program: command[0], args: command.length - 1, timeoutSeconds })) };
  if (!apply) return { applied: false, plan };

  const versions = toolVersions();
  const startedAt = new Date();
  const out = createEvidenceFile(root, 'tests', startedAt);
  const results = [];
  const total = policy.checks.length;
  let closed = false;
  try {
    appendEvidence(out.fd, [
      'Skillgate collector output: tests',
      collectorLine('tests', versions),
      `Started: ${startedAt.toISOString()}`,
      `Policy: ${DELIVERY_REL} (sha256 ${policy.fingerprint.sha256})`,
      `Checks: ${total}. Each runs from the project folder as an argument list, without a shell, with its timeout.`,
      '',
    ].join('\n'));
    for (const [i, check] of policy.checks.entries()) {
      log(`running check ${i + 1} of ${total}: ${check.name}`);
      appendEvidence(out.fd, `\n=== check ${i + 1} of ${total}: ${check.name}\nargv: ${JSON.stringify(check.command)}\ntimeout: ${check.timeoutSeconds}s\n--- output (stdout and stderr) ---\n`);
      const result = await runCheck(root, check, out.fd);
      appendEvidence(out.fd, `\n--- result: ${describeResult(result)} after ${seconds(result.ms)} ---\n`);
      results.push({ name: check.name, ...result });
      log(`  ${describeResult(result)} after ${seconds(result.ms)}`);
      if (result.interrupted) break;
    }
    const passed = results.filter((r) => r.ok).length;
    appendEvidence(out.fd, `\nFinished: ${new Date().toISOString()}. ${passed} of ${total} checks passed.\n`);
    closed = true;
    closeEvidenceFile(out.fd);
  } catch (e) {
    if (!closed) { try { closeEvidenceFile(out.fd); } catch { /* reported through the original error */ } }
    return keepOutputs([out.rel], () => { throw e; });
  }
  if (results.some((r) => r.interrupted)) fail('COLLECTION_INTERRUPTED', `the output so far is at ${out.rel}`);

  const failed = results.filter((r) => !r.ok);
  const changedSources = recordSources.filter((s) => {
    try { return fingerprintAttachment(root, s.path, newBudget()).sha256 !== s.sha256; } catch { return true; }
  }).map((s) => s.path);
  const detailed = failed.length
    ? `${failed.length} of ${total} checks did not pass: ${failed.map((r) => `${r.name} (${describeResult(r)})`).join(', ')}.`
    : `All ${total} checks passed: ${results.map((r) => r.name).join(', ')}.`;
  const brief = failed.length ? `${failed.length} of ${total} checks did not pass.` : `All ${total} checks passed.`;
  const record = recordOrExplain(root, catalog, {
    controlId, assessment: failed.length ? 'gap' : 'observed', note: collectorNote('tests', versions, detailed, brief),
    reviewer: reviewerLabel, sources: recordSources, artifacts: [out.rel],
  }, [out.rel]);
  return { applied: true, plan, results, output: out.rel, record, changedSources };
}

// ---------- secrets ----------

// Files the evidence engine validates against the same shapes on every read; their fingerprints are 64-character
// hashes by design, which the long-encoded-run shape would always match.
const engineValidated = (rel) => rel === '.skillgate/security/catalog.json' || rel === '.skillgate/security/applicability.json' || /^\.skillgate\/security\/records\/[a-f0-9-]{36}\.json$/.test(rel);
const SKIP_REASONS = {
  MISSING_FILE: 'listed by git but missing from the working tree',
  SYMLINK_REFUSED: 'a symbolic link, not followed',
  UNSAFE_FILE: 'not a regular file with one link (a folder, submodule or hard link)',
  UNSAFE_PATH: 'a name the scanner does not read (a colon, backslash or control character, or a very long path)',
  FILE_CHANGED_DURING_READ: 'changed while it was being read',
  UNREADABLE_PATH: 'could not be read',
};

export function collectSecrets(root, { control, reviewer, apply = false } = {}) {
  const budget = newBudget();
  const catalog = readCatalog(root, budget);
  const controlId = requireControl(catalog, control, 'secrets');
  const reviewerLabel = reviewerFor('secrets', reviewer);
  const top = runGit(root, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) fail('NOT_A_GIT_REPOSITORY');
  let topReal;
  try { topReal = realpathSync(top.stdout.toString('utf8').replace(/\r?\n$/, '')); } catch { fail('GIT_FAILED', 'git named a repository root that could not be resolved'); }
  if (topReal !== root) fail('NOT_REPOSITORY_ROOT');
  const listing = runGit(root, ['ls-files', '-z'], 256 * 1024 * 1024);
  if (listing.status !== 0) fail('GIT_FAILED', 'git ls-files did not succeed');
  const tracked = listing.stdout.toString('utf8').split('\0').filter(Boolean);
  const plan = { controlId, trackedFiles: tracked.length, rules: SECRET_SHAPES.map((s) => s.rule) };
  if (!apply) return { applied: false, plan };

  const versions = toolVersions();
  const startedAt = new Date();
  const head = runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const headText = head.status === 0 ? head.stdout.toString('utf8').trim() : 'no commits yet';
  const scanBudget = newBudget(LIMIT.scanTotal);
  const hits = [], skipped = [], entries = [];
  for (const rel of tracked) {
    if (engineValidated(rel)) { skipped.push({ path: rel, reason: 'an evidence engine file, validated against the same shapes whenever it is read' }); continue; }
    if (/[\r\n]/.test(rel)) { skipped.push({ path: '(a file whose name contains a line break)', reason: 'its name cannot be listed on one line' }); continue; }
    let st;
    try { st = inspectPath(root, rel); } catch (e) {
      if (!(e instanceof SecurityRefusal)) throw e;
      skipped.push({ path: rel, reason: SKIP_REASONS[e.code] ?? `not read (${e.code})` });
      continue;
    }
    if (!st) { skipped.push({ path: rel, reason: SKIP_REASONS.MISSING_FILE }); continue; }
    if (st.isFile() && st.size > LIMIT.file) { skipped.push({ path: rel, reason: 'larger than 32 MB' }); continue; }
    if (st.isFile() && scanBudget.bytesRead + st.size > scanBudget.total) fail('INPUT_LIMIT', 'the tracked files add up to more than 1 GB, so the scan stopped and nothing was written');
    let read;
    try { read = readRepositoryFile(root, rel, scanBudget); } catch (e) {
      if (!(e instanceof SecurityRefusal)) throw e;
      skipped.push({ path: rel, reason: e.code === 'INPUT_LIMIT' ? 'grew past 32 MB while being read' : SKIP_REASONS[e.code] ?? `not read (${e.code})` });
      continue;
    }
    const { buffer, stat } = read;
    if (buffer.subarray(0, 8000).includes(0)) { skipped.push({ path: rel, reason: 'binary (a zero byte in its first 8000 bytes)' }); continue; }
    buffer.toString('latin1').split('\n').forEach((line, i) => {
      for (const { rule, re } of SECRET_SHAPES) if (re.test(line)) hits.push({ path: rel, line: i + 1, rule });
    });
    entries.push({ sha256: digest(buffer), size: stat.size, mtimeMs: stat.mtimeMs, path: rel });
  }
  if (!entries.length) fail('NOTHING_TO_SCAN', `${tracked.length} tracked file(s), none readable as text`);

  const byRule = {};
  for (const h of hits) byRule[h.rule] = (byRule[h.rule] ?? 0) + 1;
  // Specific shapes (a private key block, a provider token prefix, a JSON web token) are a gap to act on. Generic
  // shapes (an assignment to a secret-sounding name, a bearer header, a long encoded run) match hashes, lockfiles and
  // test fixtures in almost every repository, so on their own they need a person's review rather than a gap: measured
  // on this repository, 60 generic matches and no specific one.
  const specific = hits.filter((h) => HIGH_CONFIDENCE_RULES.includes(h.rule));
  const assessment = specific.length ? 'gap' : hits.length ? 'needs-human' : 'observed';
  let manifest = null;
  const report = createEvidenceFile(root, 'leak-scan', startedAt);
  keepOutputs([report.rel], () => {
    try {
      appendEvidence(report.fd, [
        'Skillgate collector report: secrets',
        collectorLine('secrets', versions),
        `Scanned: ${startedAt.toISOString()}. Repository HEAD: ${headText}.`,
        'Scope: the files git ls-files lists, read from the working tree (uncommitted edits included; untracked files are not scanned).',
        `Rules: ${SECRET_SHAPES.map((s) => s.rule).join(', ')}. These are the evidence engine's secret shapes; a match is a shape to review, not a confirmed secret.`,
        `Tracked files: ${tracked.length}. Scanned as text: ${entries.length}. Not scanned: ${skipped.length}.`,
        `Lines matching a rule: ${hits.length}.`,
        `Specific rules (a match is a gap): ${HIGH_CONFIDENCE_RULES.join(', ')}. Generic rules (matches need a person's review): ${SECRET_SHAPES.map((x) => x.rule).filter((r) => !HIGH_CONFIDENCE_RULES.includes(r)).join(', ')}.`,
        `Result: ${assessment === 'gap' ? `gap (${specific.length} line(s) matched a specific secret shape; each needs action)` : assessment === 'needs-human' ? 'needs-human (only generic shapes matched; a person decides whether any is a secret)' : 'observed (no scanned line matched a rule)'}`,
        '',
        'Matches by rule:',
        ...(hits.length ? Object.entries(byRule).map(([rule, n]) => `  ${rule}: ${n}`) : ['  none']),
        '',
        'Matches (file:line rule; the matched text is never written):',
        ...(hits.length ? hits.map((h) => `  ${h.path}:${h.line} ${h.rule}`) : ['  none']),
        '',
        'Not scanned:',
        ...(skipped.length ? skipped.map((s) => `  ${s.path} (${s.reason})`) : ['  none']),
        '',
      ].join('\n'));
    } finally { closeEvidenceFile(report.fd); }
    manifest = createEvidenceFile(root, 'leak-scan-files', startedAt);
  });
  keepOutputs([report.rel, manifest.rel], () => {
    try { appendEvidence(manifest.fd, renderManifest(entries, `Files the secrets collector scanned as text at ${startedAt.toISOString()}`)); } finally { closeEvidenceFile(manifest.fd); }
  });

  const files = new Set(hits.map((h) => h.path)).size;
  const detailed = hits.length
    ? `${hits.length} line(s) in ${files} file(s) matched a secret shape (${Object.entries(byRule).map(([rule, n]) => `${rule} ${n}`).join(', ')}); ${entries.length} of ${tracked.length} tracked files scanned as text.`
    : `No scanned line matched a secret shape; ${entries.length} of ${tracked.length} tracked files scanned as text, ${skipped.length} not scanned (listed in the report).`;
  const brief = specific.length ? `${specific.length} line(s) matched a specific secret shape.` : hits.length ? `${hits.length} line(s) matched only generic secret shapes; review needed.` : 'No scanned line matched a secret shape.';
  const record = recordOrExplain(root, catalog, {
    controlId, assessment, note: collectorNote('secrets', versions, detailed, brief), reviewer: reviewerLabel,
    sources: [manifest.rel], artifacts: [report.rel],
  }, [report.rel, manifest.rel]);
  return { applied: true, plan, report: report.rel, manifest: manifest.rel, record, counts: { tracked: tracked.length, scanned: entries.length, skipped: skipped.length, hits: hits.length, files, byRule } };
}

// ---------- delivery policy ----------

export function collectDeliveryPolicy(root, { control, reviewer, apply = false } = {}) {
  const budget = newBudget();
  const catalog = readCatalog(root, budget);
  const controlId = requireControl(catalog, control, 'delivery-policy');
  const reviewerLabel = reviewerFor('delivery-policy', reviewer);
  const policy = readDeliveryPolicy(root, budget);
  const reasons = policy.exists ? [...policy.problems] : [`there is no ${DELIVERY_REL}`];
  if (policy.exists && !policy.problems.length) {
    if (!policy.checks.length) reasons.push('no checks are defined');
    if (!policy.protectedBranches.length) reasons.push('no protected branch is named');
  }
  const assessment = reasons.length ? 'gap' : 'observed';
  const plan = { controlId, exists: policy.exists, assessment, reasons, checks: policy.checks.map((c) => c.name), protectedBranches: policy.protectedBranches };
  if (!apply) return { applied: false, plan };

  const versions = toolVersions();
  const at = new Date();
  const out = createEvidenceFile(root, 'delivery-policy', at);
  keepOutputs([out.rel], () => {
    try {
      appendEvidence(out.fd, [
        'Skillgate collector report: delivery-policy',
        collectorLine('delivery-policy', versions),
        `Checked: ${at.toISOString()}`,
        `Policy: ${DELIVERY_REL} ${policy.exists ? `(sha256 ${policy.fingerprint.sha256})` : '(missing)'}`,
        `Checks defined: ${policy.checks.length}${policy.checks.length ? ` (${policy.checks.map((c) => c.name).join(', ')})` : ''}`,
        `Protected branches: ${policy.protectedBranches.length ? policy.protectedBranches.join(', ') : 'none'}`,
        `Policy paths: ${policy.policyPaths.length ? policy.policyPaths.join(', ') : 'none listed'}`,
        `Result: ${assessment}${reasons.length ? ` (${reasons.join('; ')})` : ''}`,
        'This observes that the policy file defines checks and protected branches. It does not show that the checks were reviewed, that they pass, or that anything enforces them.',
        '',
      ].join('\n'));
    } finally { closeEvidenceFile(out.fd); }
  });
  const detailed = assessment === 'observed'
    ? `The delivery policy defines ${policy.checks.length} check(s) (${policy.checks.map((c) => c.name).join(', ')}) and protected branch(es) ${policy.protectedBranches.join(', ')}; this does not show that the checks were reviewed, pass, or are enforced.`
    : `The delivery policy is missing or not usable: ${reasons.join('; ')}.`;
  const brief = assessment === 'observed'
    ? `The delivery policy defines ${policy.checks.length} check(s) and ${policy.protectedBranches.length} protected branch(es); this does not show that they are reviewed, pass, or are enforced.`
    : 'The delivery policy is missing or not usable.';
  const record = recordOrExplain(root, catalog, {
    controlId, assessment, note: collectorNote('delivery-policy', versions, detailed, brief), reviewer: reviewerLabel,
    sources: policy.fingerprint ? [policy.fingerprint] : [], artifacts: [out.rel],
  }, [out.rel]);
  return { applied: true, plan, report: out.rel, record };
}
