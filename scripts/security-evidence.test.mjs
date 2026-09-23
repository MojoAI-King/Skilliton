#!/usr/bin/env node
// Acceptance tests for `skilliton security` status, record, applicability and findings, and for the engine's
// securitySummary. The command runs the way people run it: node scripts/skilliton.mjs security ...
//
// Adapted in place from the standalone prototype's 25 synthetic CLI tests (the prototype was scripts/security-evidence.mjs
// and is now packs/base/plugins/workflow/runtime/lib/security.mjs). Each of those tests still proves its protection.
// Exit codes follow docs/CONTRACTS.md section 6: 0 complete, 1 attention, 2 invalid or refused, 3 operation failed. The
// prototype used 2 for attention and 1 for invalid; the first new test below holds that mapping.
//
// Every test works in its own temporary folder under the system temp folder, removed afterwards, with HOME and the
// backup folder inside it. No external tools, accounts or scanners are used; git reads this repository's history in
// one test. Secret-shaped strings and control characters are built at runtime, never written as literals.
//
//   node --test scripts/security-evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const cli = join(here, 'skilliton.mjs');
const pluginDir = join(repo, 'packs', 'base', 'plugins', 'workflow');
const engine = await import(pathToFileURL(join(pluginDir, 'runtime', 'lib', 'security.mjs')).href);
// The prototype runtime, snapshotted: `git show c739bba:scripts/security-evidence.mjs` (c3fec4b before the 2026-09-23 rewrite).
const PROTOTYPE_RUNTIME = join(here, 'fixtures', 'prototype-v1', 'security-evidence.mjs');
const { PROTOTYPE_RUNTIME_SHA256 } = await import(pathToFileURL(join(pluginDir, 'runtime', 'lib', 'prototype-v1.mjs')).href);
const SECURITY = '.skilliton/security';
const START = '<!-- skilliton:security-findings:start -->';
const END = '<!-- skilliton:security-findings:end -->';
const DAY = 24 * 60 * 60 * 1000;

const control = () => ({ id: 'DEMO-ACCESS', title: 'Synthetic access observation', mappings: [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }], expectedEvidence: ['Source and synthetic check output'] });
const decision = (controlId, applies = true, decidedAt = '2020-01-01T00:00:00.000Z') => ({ controlId, applies, rationale: 'Synthetic fixture decision', decidedBy: 'fixture-owner', decidedAt });
const writeApplicability = (dir, decisions) => writeFileSync(join(dir, SECURITY, 'applicability.json'), JSON.stringify({ schemaVersion: 1, decisions }));

// A project folder inside the test's own temporary folder. With decide (the default), every control has an applies-true
// decision, so complete evidence exits 0; by contract, undecided applicability alone is attention.
function fixture(t, controls = [control()], { decide = true } = {}) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-evidence-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls }));
  if (decide) writeApplicability(dir, controls.map((c) => decision(c.id)));
  writeFileSync(join(dir, 'source.js'), 'export const synthetic = true;\n');
  writeFileSync(join(dir, 'result.txt'), 'synthetic output\n');
  return dir;
}
function envFor(dir, extra = {}) {
  const env = { ...process.env, HOME: join(dirname(dir), 'home'), SKILLITON_BACKUPS: join(dirname(dir), 'backups'), ...extra };
  delete env.SKILLITON_DEBUG;
  return env;
}
const withNodeOnPath = (dir) => envFor(dir, { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` });
function run(dir, ...args) {
  const p = spawnSync(process.execPath, [cli, 'security', args.shift(), '--dir', dir, ...args], { encoding: 'utf8', timeout: 30000, env: envFor(dir) });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr, stdout: p.stdout, stderr: p.stderr };
}
const observation = ['record', '--control', 'DEMO-ACCESS', '--assessment', 'observed', '--source', 'source.js', '--artifact', 'result.txt', '--note', 'Synthetic observation only', '--reviewer', 'fixture-reviewer'];
function record(dir, extra = []) { return run(dir, ...observation, '--apply', ...extra); }
function recordFiles(dir) { return readdirSync(join(dir, SECURITY, 'records')).map((f) => join(dir, SECURITY, 'records', f)); }
function changeRecord(dir, mutate) {
  const f = recordFiles(dir)[0];
  const r = JSON.parse(readFileSync(f, 'utf8'));
  mutate(r); writeFileSync(f, JSON.stringify(r));
}
function copyPlugin(dir, name) {
  const copy = join(dirname(dir), name, 'workflow');
  cpSync(pluginDir, copy, { recursive: true });
  return copy;
}

// ---------------------------------------------------------------- the prototype's 25 protections

test('dry run validates but creates no records or report', (t) => {
  const dir = fixture(t);
  assert.equal(run(dir, ...observation).code, 0);
  assert.equal(existsSync(join(dir, SECURITY, 'records')), false);
  const status = run(dir, 'status');
  assert.equal(status.code, 1);
  assert.match(status.out, /missing/);
  assert.equal(existsSync(join(dir, SECURITY, 'REPORT.md')), false);
});

test('observed record binds source, artifact and control without claiming compliance', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  const [f] = recordFiles(dir);
  const r = JSON.parse(readFileSync(f, 'utf8'));
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.assessment, 'observed');
  assert.match(r.sources[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(r.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(r.controlHash, /^[a-f0-9]{64}$/);
  assert.equal(r.sources[0].path, 'source.js');
  assert.equal(r.artifacts[0].path, 'result.txt');
  assert.doesNotMatch(readFileSync(f, 'utf8'), /export const/);
  const status = run(dir, 'status', '--apply');
  assert.equal(status.code, 0);
  assert.match(status.out, /observed.*current/);
  assert.match(status.out, /1\/1/);
  assert.match(status.out, /not.*compliance|not.*certification/i);
  assert.ok(status.stdout.startsWith(readFileSync(join(dir, SECURITY, 'REPORT.md'), 'utf8')));
});

for (const kind of ['source', 'artifact', 'mapping', 'catalog-version', 'deleted-source']) {
  test(`${kind} drift is stale and status never restamps evidence`, (t) => {
    const dir = fixture(t);
    assert.equal(record(dir).code, 0);
    assert.equal(run(dir, 'status').code, 0);
    const [f] = recordFiles(dir);
    const original = readFileSync(f, 'utf8');
    const modified = statSync(f).mtimeMs;
    if (kind === 'source') writeFileSync(join(dir, 'source.js'), 'changed\n');
    if (kind === 'artifact') writeFileSync(join(dir, 'result.txt'), 'changed\n');
    if (kind === 'deleted-source') rmSync(join(dir, 'source.js'));
    if (kind === 'mapping' || kind === 'catalog-version') {
      const p = join(dir, SECURITY, 'catalog.json');
      const c = JSON.parse(readFileSync(p, 'utf8'));
      if (kind === 'mapping') c.controls[0].mappings[0].reference = 'A.2';
      else c.catalogVersion = 'demo-2';
      writeFileSync(p, JSON.stringify(c));
    }
    for (let n = 0; n < 2; n++) {
      const status = run(dir, 'status', '--apply');
      assert.equal(status.code, 1);
      assert.match(status.out, /observed.*stale/);
      assert.equal(readFileSync(f, 'utf8'), original);
      assert.equal(statSync(f).mtimeMs, modified);
    }
  });
}

test('missing, empty and duplicate catalogs never produce a green result', (t) => {
  const dir = fixture(t);
  rmSync(join(dir, SECURITY, 'catalog.json'));
  assert.equal(run(dir, 'status').code, 2);
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: [] }));
  assert.equal(run(dir, 'status').code, 2);
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: [control(), control()] }));
  assert.equal(run(dir, 'status').code, 2);
});

test('denominator includes every control and current gaps remain nonzero', (t) => {
  const second = { ...control(), id: 'DEMO-REVIEW' };
  const dir = fixture(t, [control(), second]);
  assert.equal(record(dir).code, 0);
  let status = run(dir, 'status');
  assert.equal(status.code, 1);
  assert.match(status.out, /1\/2/);
  assert.equal(run(dir, 'record', '--control', second.id, '--assessment', 'gap', '--note', 'Missing review evidence', '--reviewer', 'fixture-reviewer', '--apply').code, 0);
  status = run(dir, 'status');
  assert.equal(status.code, 1);
  assert.match(status.out, /gap.*current/);
});

test('observed requires sources and artifacts; needs-human remains distinct', (t) => {
  const dir = fixture(t);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'observed', '--note', 'Missing attachments', '--reviewer', 'fixture').code, 2);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'needs-human', '--note', 'External evidence needed', '--reviewer', 'fixture', '--apply').code, 0);
  const status = run(dir, 'status');
  assert.equal(status.code, 1);
  assert.match(status.out, /needs-human.*current/);
});

test('malformed record remains prominently invalid even beside a valid latest record', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  writeFileSync(join(dir, SECURITY, 'records', 'broken.json'), '{');
  const status = run(dir, 'status', '--apply');
  assert.equal(status.code, 2);
  assert.match(status.out, /invalid/i);
  assert.match(status.out, /Invalid evidence records: 1/);
  assert.match(status.out, /Not written: \.skilliton\/security\/REPORT\.md/);
  assert.equal(existsSync(join(dir, SECURITY, 'REPORT.md')), false);
  assert.equal(readFileSync(join(dir, SECURITY, 'records', 'broken.json'), 'utf8'), '{');
});

test('future timestamps and filename identity mismatches are invalid', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  changeRecord(dir, (r) => { r.recordedAt = new Date(Date.now() + 60000).toISOString(); });
  assert.equal(run(dir, 'status').code, 2);
  changeRecord(dir, (r) => { r.recordedAt = new Date(0).toISOString(); r.id = '00000000-0000-4000-8000-000000000000'; });
  assert.equal(run(dir, 'status').code, 2);
});

test('unsafe source names and traversal are rejected before writes', (t) => {
  const dir = fixture(t);
  for (const name of ['../outside.txt', '/tmp/outside.txt', '.git/config', '.env', '.env.example', 'credentials.json', 'private.pem', 'id_rsa', 'nested/../source.js']) {
    const args = [...observation]; args[args.indexOf('--source') + 1] = name;
    const result = run(dir, ...args, '--apply');
    assert.equal(result.code, 2, `unsafe path accepted: ${name}`);
    assert.equal(existsSync(join(dir, SECURITY, 'records')), false);
  }
});

test('symlink source, nested parent, record and report paths are rejected', (t) => {
  const dir = fixture(t);
  symlinkSync(join(dir, 'source.js'), join(dir, 'alias.js'));
  const args = [...observation]; args[args.indexOf('--source') + 1] = 'alias.js';
  assert.equal(run(dir, ...args, '--apply').code, 2);
  mkdirSync(join(dir, 'real'));
  writeFileSync(join(dir, 'real/file.txt'), 'fixture');
  symlinkSync(join(dir, 'real'), join(dir, 'linked'));
  args[args.indexOf('--source') + 1] = 'linked/file.txt';
  assert.equal(run(dir, ...args, '--apply').code, 2);
  assert.equal(record(dir).code, 0);
  symlinkSync(join(dir, 'source.js'), join(dir, SECURITY, 'records', 'alias.json'));
  assert.equal(run(dir, 'status').code, 2);
  rmSync(join(dir, SECURITY, 'records', 'alias.json'));
  symlinkSync(join(dir, 'source.js'), join(dir, SECURITY, 'REPORT.md'));
  const before = readFileSync(join(dir, 'source.js'), 'utf8');
  assert.equal(run(dir, 'status', '--apply').code, 2);
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), before);
});

test('secret-shaped input and parser errors never echo values', (t) => {
  const dir = fixture(t);
  const forbidden = ['token=' + 'x'.repeat(32), 'gh' + 'p_' + 'A'.repeat(36), '-----BEGIN ' + 'PRIVATE KEY-----'];
  for (const value of forbidden) {
    for (const flag of ['--note', '--reviewer']) {
      const args = [...observation]; args[args.indexOf(flag) + 1] = value;
      const result = run(dir, ...args, '--apply');
      assert.equal(result.code, 2);
      assert.equal(result.out.includes(value), false);
    }
    const typo = run(dir, 'record', `--notes=${value}`);
    assert.equal(typo.code, 2);
    assert.equal(typo.out.includes(value), false);
    const stray = run(dir, ...observation, value);
    assert.equal(stray.code, 2);
    assert.equal(stray.out.includes(value), false);
  }
  const marker = 'NEVER_ECHO_THIS_INPUT';
  writeFileSync(join(dir, SECURITY, 'catalog.json'), '{' + marker);
  const result = run(dir, 'status');
  assert.equal(result.code, 2);
  assert.equal(result.out.includes(marker), false);
});

test('concurrent writers create independent records and newest assessment wins', async (t) => {
  const dir = fixture(t);
  const codes = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve) => {
    const p = spawn(process.execPath, [cli, 'security', 'record', '--dir', dir, ...observation.slice(1), '--apply'], { stdio: 'ignore', env: envFor(dir) });
    p.once('close', resolve);
  })));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  const files = recordFiles(dir);
  assert.equal(files.length, 4);
  assert.equal(new Set(files.map((f) => JSON.parse(readFileSync(f, 'utf8')).id)).size, 4);
  assert.equal(run(dir, 'status').code, 0);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'gap', '--note', 'Later gap found', '--reviewer', 'fixture', '--apply').code, 0);
  assert.match(run(dir, 'status').out, /gap.*current/);
});

test('the installed plugin copy runs without imports from, or a repository around, the skills repository', (t) => {
  const dir = fixture(t);
  const copy = copyPlugin(dir, 'installed');
  const result = spawnSync(join(copy, 'bin', 'skilliton'), ['security', 'status', '--dir', dir], { encoding: 'utf8', env: withNodeOnPath(dir) });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /missing/);
});

test('unexpected hidden files are invalid, not silently ignored', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  writeFileSync(join(dir, SECURITY, 'records', '.pending-00000000-0000-4000-8000-000000000000'), 'unfinished');
  assert.equal(run(dir, 'status').code, 2);
  assert.match(run(dir, 'status').out, /Invalid evidence records: 1/);
});

test('oversized attachments and hardlinks are refused without echoing contents', (t) => {
  const dir = fixture(t);
  truncateSync(join(dir, 'result.txt'), 32 * 1024 * 1024 + 1);
  assert.equal(record(dir).code, 2);
  writeFileSync(join(dir, 'result.txt'), 'synthetic');
  linkSync(join(dir, 'source.js'), join(dir, 'second.js'));
  assert.equal(record(dir).code, 2);
});

test('null identifiers and terminal control text are rejected in catalogs', (t) => {
  const dir = fixture(t);
  const p = join(dir, SECURITY, 'catalog.json');
  const override = String.fromCharCode(0x202e);
  for (const mutate of [(c) => { c.catalogVersion = null; }, (c) => { c.controls[0].id = null; }, (c) => { c.controls[0].title = `unsafe${override}header`; }]) {
    const c = { schemaVersion: 1, catalogVersion: 'demo-1', controls: [control()] };
    mutate(c); writeFileSync(p, JSON.stringify(c));
    assert.equal(run(dir, 'status').code, 2);
  }
});

test('latest timestamp and UUID tie-break determine assessment, regardless of directory order', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  const initial = JSON.parse(readFileSync(recordFiles(dir)[0], 'utf8'));
  rmSync(recordFiles(dir)[0]);
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  for (let i = 0; i < ids.length; i++) {
    const r = { ...initial, id: ids[i], recordedAt: '2020-01-01T00:00:00.000Z', assessment: i === 1 ? 'gap' : 'observed' };
    writeFileSync(join(dir, SECURITY, 'records', `${r.id}.json`), JSON.stringify(r));
  }
  assert.match(run(dir, 'status').out, /gap.*current/);
  const p = join(dir, SECURITY, 'records', `${ids[0]}.json`);
  const r = JSON.parse(readFileSync(p, 'utf8'));
  r.recordedAt = '2021-01-01T00:00:00.000Z';
  writeFileSync(p, JSON.stringify(r));
  assert.equal(run(dir, 'status').code, 0);
  assert.match(run(dir, 'status').out, /observed.*current/);
});

test('symlinked catalog and records directory are refused', (t) => {
  const dir = fixture(t);
  const p = join(dir, SECURITY, 'catalog.json');
  const original = readFileSync(p);
  rmSync(p);
  writeFileSync(join(dir, 'catalog-copy.json'), original);
  symlinkSync(join(dir, 'catalog-copy.json'), p);
  assert.equal(run(dir, 'status').code, 2);
  rmSync(p); writeFileSync(p, original);
  mkdirSync(join(dir, 'alternate-records'));
  symlinkSync(join(dir, 'alternate-records'), join(dir, SECURITY, 'records'));
  assert.equal(record(dir).code, 2);
  assert.equal(run(dir, 'status').code, 2);
  assert.deepEqual(readdirSync(join(dir, 'alternate-records')), []);
});

test('prepared catalog description and records README are supported without accepting unsafe README paths', (t) => {
  const dir = fixture(t);
  const p = join(dir, SECURITY, 'catalog.json');
  const c = JSON.parse(readFileSync(p, 'utf8'));
  c.description = 'Synthetic partial coverage catalog for review.';
  writeFileSync(p, JSON.stringify(c));
  mkdirSync(join(dir, SECURITY, 'records'));
  const readme = join(dir, SECURITY, 'records', 'README.md');
  writeFileSync(readme, '# Synthetic recording instructions\n');
  assert.equal(record(dir).code, 0);
  assert.equal(run(dir, 'status').code, 0);
  rmSync(readme); symlinkSync(join(dir, 'source.js'), readme);
  assert.equal(run(dir, 'status').code, 2);
  rmSync(readme);
  c.description = `unsafe${String.fromCharCode(0x202e)}control`;
  writeFileSync(p, JSON.stringify(c));
  assert.equal(run(dir, 'status').code, 2);
});

test('overall and command help describe commands and exits without reading or writing project files', (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, SECURITY, 'catalog.json'), 'intentionally malformed');
  const before = readdirSync(join(dir, SECURITY));
  for (const args of [['--help'], ['record', '--help'], ['status', '--help'], ['collect', 'tests', '--help']]) {
    const p = spawnSync(process.execPath, [cli, 'security', ...args], { cwd: dir, encoding: 'utf8', env: envFor(dir) });
    assert.equal(p.status, 0);
    assert.match(p.stdout, /security record --control/);
    assert.match(p.stdout, /security status \[--dir/);
    assert.match(p.stdout, /observed\|gap\|needs-human/);
    for (const code of [0, 1, 2, 3]) assert.match(p.stdout, new RegExp(`Exit ${code}`));
    assert.equal(p.stderr, '');
  }
  assert.deepEqual(readdirSync(join(dir, SECURITY)), before);
  assert.equal(readFileSync(join(dir, SECURITY, 'catalog.json'), 'utf8'), 'intentionally malformed');
  assert.equal(existsSync(join(dirname(dir), 'backups')), false);
});

test('status preserves human REPORT.md and refreshes only reports carrying its generated marker', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  const p = join(dir, SECURITY, 'REPORT.md');
  const human = '# Human security review\n\nFindings belong to the project team.\n';
  writeFileSync(p, human);
  const modified = statSync(p).mtimeMs;
  assert.equal(run(dir, 'status').code, 0);
  const refused = run(dir, 'status', '--apply');
  assert.equal(refused.code, 2);
  assert.match(refused.out, /NON_GENERATED_REPORT/);
  assert.equal(readFileSync(p, 'utf8'), human);
  assert.equal(statSync(p).mtimeMs, modified);
  assert.equal(readdirSync(join(dir, SECURITY)).some((f) => f.startsWith('.pending-')), false);
  rmSync(p);
  assert.equal(run(dir, 'status', '--apply').code, 0);
  assert.match(readFileSync(p, 'utf8'), /^<!-- skilliton-security-evidence-report:v1 -->\n/);
  writeFileSync(join(dir, 'source.js'), 'changed\n');
  assert.equal(run(dir, 'status', '--apply').code, 1);
  assert.match(readFileSync(p, 'utf8'), /observed.*stale/);
});

// ---------------------------------------------------------------- the shared contract

test('exit codes: complete 0, attention 1, invalid or refused 2 (the prototype used 2 for attention and 1 for invalid)', (t) => {
  const dir = fixture(t);
  const missing = run(dir, 'status');
  assert.equal(missing.code, 1, 'attention: an evaluated control is missing (prototype exit 2)');
  assert.match(missing.out, /Result: attention \(exit 1\)/);
  assert.equal(record(dir).code, 0);
  const complete = run(dir, 'status');
  assert.equal(complete.code, 0, 'complete (prototype exit 0)');
  assert.match(complete.out, /Result: complete \(exit 0\)/);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'gap', '--note', 'Recorded gap', '--reviewer', 'fixture', '--apply').code, 0, 'recording an unresolved assessment succeeds');
  assert.equal(run(dir, 'status').code, 1, 'a current gap is attention');
  writeFileSync(join(dir, SECURITY, 'records', 'broken.json'), '{');
  const invalid = run(dir, 'status');
  assert.equal(invalid.code, 2, 'invalid evidence (prototype exit 1)');
  assert.match(invalid.out, /Result: invalid \(exit 2\)/);
  rmSync(join(dir, SECURITY, 'records', 'broken.json'));
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'maybe', '--note', 'x', '--reviewer', 'y').code, 2, 'refused input (prototype exit 1)');
  for (const args of [['security'], ['security', 'frobnicate'], ['security', 'status', '--force'], ['security', 'status', '--dir', join(dirname(dir), 'absent')], ['security', 'collect', 'nothing', '--dir', dir]]) {
    const p = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: envFor(dir) });
    assert.equal(p.status, 2, `${args.join(' ')} is refused with exit 2`);
    assert.match(p.stderr, /^skilliton: refused: /);
  }
  writeFileSync(join(dir, '.skilliton', 'config.json'), '{"security": {"maxAgeDays": 0}}');
  assert.equal(run(dir, 'status').code, 2, 'an invalid project configuration is refused');
});

test('exit 3: a report that cannot be written is an operation failure, not a refusal', { skip: process.getuid?.() === 0 ? 'running as root, where a read-only folder does not block writes, so exit 3 was not exercised' : false }, (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  chmodSync(join(dir, SECURITY), 0o555);
  try {
    const failed = run(dir, 'status', '--apply');
    assert.equal(failed.code, 3);
    assert.match(failed.stderr, /operation failed \(WRITE_FAILED\)/);
    assert.equal(existsSync(join(dir, SECURITY, 'REPORT.md')), false);
  } finally { chmodSync(join(dir, SECURITY), 0o755); }
});

test('applicability: undecided needs a human, applies false leaves the denominator with its rationale, and the newest decision wins', (t) => {
  const single = fixture(t, [control()], { decide: false });
  assert.equal(record(single).code, 0);
  const undecided = run(single, 'status');
  assert.equal(undecided.code, 1, 'undecided applicability alone is attention, even when every control has a current observation');
  assert.match(undecided.out, /needs a human 1 \(undecided 1\)/);
  writeApplicability(single, [decision('DEMO-ACCESS')]);
  assert.equal(run(single, 'status').code, 0);

  const second = { ...control(), id: 'DEMO-REVIEW', title: 'Synthetic review observation' };
  const dir = fixture(t, [control(), second], { decide: false });
  assert.equal(record(dir).code, 0);
  let status = run(dir, 'status');
  assert.equal(status.code, 1);
  assert.match(status.out, /\| DEMO-ACCESS \| Synthetic access observation \| undecided \| observed \| current \|/);
  assert.match(status.out, /Current recorded observations: 1\/2 applicable controls/);
  let summary = engine.securitySummary(dir);
  assert.equal(summary.undecided, 2);
  assert.equal(summary.needsHuman, 2);

  writeApplicability(dir, [decision('DEMO-ACCESS'), decision('DEMO-REVIEW', true, '2020-01-01T00:00:00.000Z'),
    { ...decision('DEMO-REVIEW', false, '2021-01-01T00:00:00.000Z'), rationale: 'No review workflow exists in this synthetic project' }]);
  status = run(dir, 'status');
  assert.equal(status.code, 0);
  assert.match(status.out, /Current recorded observations: 1\/1 applicable controls/);
  assert.match(status.out, /\| DEMO-REVIEW \| Synthetic review observation \| no \| none \| missing \|/);
  assert.match(status.out, /## Not applicable\n\n- DEMO-REVIEW: No review workflow exists in this synthetic project \(decided by fixture-owner, 2021-01-01\)/);
  summary = engine.securitySummary(dir);
  assert.deepEqual({ total: summary.total, applicable: summary.applicable, current: summary.current, missing: summary.missing, undecided: summary.undecided, needsHuman: summary.needsHuman }, { total: 2, applicable: 1, current: 1, missing: 0, undecided: 0, needsHuman: 0 });

  writeApplicability(dir, [decision('DEMO-REVIEW', true, '2022-01-01T00:00:00.000Z'), decision('DEMO-ACCESS'), { ...decision('DEMO-REVIEW', false, '2021-01-01T00:00:00.000Z') }]);
  status = run(dir, 'status');
  assert.equal(status.code, 1, 'the newest decision wins, wherever it is in the file');
  assert.match(status.out, /\| DEMO-REVIEW \| Synthetic review observation \| yes \| none \| missing \|/);
});

test('applicability command: the preview writes nothing, --apply appends with a backup, refusals never echo values, and a held lock refuses', (t) => {
  const dir = fixture(t, [control()], { decide: false });
  const file = join(dir, SECURITY, 'applicability.json');
  const args = ['applicability', '--control', 'DEMO-ACCESS', '--applies', 'false', '--rationale', 'Synthetic project has no access surface', '--decided-by', 'fixture-owner'];
  const preview = run(dir, ...args);
  assert.equal(preview.code, 0);
  assert.match(preview.out, /Nothing was written/);
  assert.equal(existsSync(file), false);
  assert.equal(run(dir, ...args, '--apply').code, 0);
  let saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(saved.decisions.map((d) => Object.keys(d).sort()), [['applies', 'controlId', 'decidedAt', 'decidedBy', 'rationale']]);
  assert.equal(saved.decisions[0].applies, false);
  assert.equal(Date.parse(saved.decisions[0].decidedAt) <= Date.now(), true);
  assert.equal(run(dir, 'status').code, 0, 'the only control does not apply, so nothing applicable is outstanding');

  const again = [...args]; again[again.indexOf('--applies') + 1] = 'true';
  assert.equal(run(dir, ...again, '--apply').code, 0);
  saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(saved.decisions.map((d) => d.applies), [false, true]);
  assert.equal(readdirSync(join(dirname(dir), 'backups', 'security')).length, 1, 'the replaced file was backed up');

  const fake = 'gh' + 'p_' + 'B'.repeat(36);
  for (const [flag, value] of [['--rationale', fake], ['--decided-by', fake], ['--control', 'NOT-IN-CATALOG'], ['--applies', 'perhaps']]) {
    const bad = [...args]; bad[bad.indexOf(flag) + 1] = value;
    const refused = run(dir, ...bad, '--apply');
    assert.equal(refused.code, 2);
    assert.equal(refused.out.includes(value), false);
  }
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).decisions.length, 2);

  writeFileSync(join(dir, SECURITY, 'applicability.lock'), '');
  const locked = run(dir, ...args, '--apply');
  assert.equal(locked.code, 2);
  assert.match(locked.out, /APPLICABILITY_LOCKED/);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).decisions.length, 2);
  assert.equal(existsSync(join(dir, SECURITY, 'applicability.lock')), true, 'a lock this run did not take is left alone');
});

test('an invalid or linked applicability file makes status invalid, visibly, and refuses new decisions', (t) => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  const file = join(dir, SECURITY, 'applicability.json');
  const future = new Date(Date.now() + 3600000).toISOString();
  const contents = ['{', JSON.stringify({ schemaVersion: 2, decisions: [] }), JSON.stringify({ schemaVersion: 1, decisions: [{ ...decision('DEMO-ACCESS'), applies: 'yes' }] }), JSON.stringify({ schemaVersion: 1, decisions: [decision('DEMO-ACCESS', true, future)] })];
  for (const content of [...contents, null]) {
    rmSync(file, { force: true });
    if (content === null) { writeFileSync(join(dir, 'decisions.json'), JSON.stringify({ schemaVersion: 1, decisions: [decision('DEMO-ACCESS')] })); symlinkSync(join(dir, 'decisions.json'), file); }
    else writeFileSync(file, content);
    const status = run(dir, 'status', '--apply');
    assert.equal(status.code, 2);
    assert.match(status.out, /applicability file \.skilliton\/security\/applicability\.json is invalid/);
    assert.equal(existsSync(join(dir, SECURITY, 'REPORT.md')), false);
    const summary = engine.securitySummary(dir);
    assert.equal(summary.available, true);
    assert.equal(summary.invalid, 1);
    const refused = run(dir, 'applicability', '--control', 'DEMO-ACCESS', '--applies', 'true', '--rationale', 'Retry', '--decided-by', 'fixture', '--apply');
    assert.equal(refused.code, 2);
  }
});

test('expiry from the project config, or from the control in the catalog, makes a record expired without rewriting it', (t) => {
  const aged = (dir, days) => {
    assert.equal(record(dir).code, 0);
    const [f] = recordFiles(dir);
    const r = JSON.parse(readFileSync(f, 'utf8'));
    rmSync(f);
    const old = { ...r, id: '00000000-0000-4000-8000-00000000000a', recordedAt: new Date(Date.now() - days * DAY).toISOString() };
    const p = join(dir, SECURITY, 'records', `${old.id}.json`);
    writeFileSync(p, JSON.stringify(old, null, 2) + '\n');
    return p;
  };
  const dir = fixture(t);
  const p = aged(dir, 40);
  const original = readFileSync(p, 'utf8');
  const modified = statSync(p).mtimeMs;
  assert.equal(run(dir, 'status').code, 0, 'without a maximum age, an old record stays current');
  writeFileSync(join(dir, '.skilliton', 'config.json'), JSON.stringify({ security: { maxAgeDays: 30 } }));
  for (let n = 0; n < 2; n++) {
    const status = run(dir, 'status', '--apply');
    assert.equal(status.code, 1);
    assert.match(status.out, /\| DEMO-ACCESS \| Synthetic access observation \| yes \| observed \| expired \(older than 30 days\) \|/);
    assert.equal(readFileSync(p, 'utf8'), original);
    assert.equal(statSync(p).mtimeMs, modified);
  }
  assert.equal(engine.securitySummary(dir).expired, 1);
  writeFileSync(join(dir, '.skilliton', 'config.json'), JSON.stringify({ security: { maxAgeDays: 60 } }));
  assert.equal(run(dir, 'status').code, 0);

  const strict = fixture(t, [{ ...control(), maxAgeDays: 7 }]);
  writeFileSync(join(strict, '.skilliton', 'config.json'), JSON.stringify({ security: { maxAgeDays: 60 } }));
  aged(strict, 10);
  const status = run(strict, 'status');
  assert.equal(status.code, 1, "the control's own maxAgeDays takes precedence over the project setting");
  assert.match(status.out, /expired \(older than 7 days\)/);
  const invalid = fixture(t, [{ ...control(), maxAgeDays: 0 }]);
  assert.equal(run(invalid, 'status').code, 2, 'a maxAgeDays outside 1 to 3650 makes the catalog invalid');
});

test('records written by the prototype runtime still validate (record schema 1)', (t) => {
  const prototype = readFileSync(PROTOTYPE_RUNTIME);
  assert.equal(createHash('sha256').update(prototype).digest('hex'), PROTOTYPE_RUNTIME_SHA256, 'fixture: the snapshot is the prototype runtime release, byte for byte');
  const dir = fixture(t);
  const script = join(dirname(dir), 'prototype-security-evidence.mjs');
  writeFileSync(script, prototype);
  // The prototype keeps its register under the earlier .skillgate/ folder; migration 0003 moves the records unchanged.
  cpSync(join(dir, '.skilliton'), join(dir, '.skillgate'), { recursive: true });
  const p = spawnSync(process.execPath, [script, 'record', '--dir', dir, ...observation.slice(1), '--apply'], { encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  const written = readdirSync(join(dir, '.skillgate', 'security', 'records')).filter((n) => n.endsWith('.json'));
  assert.equal(written.length, 1, 'fixture: the prototype wrote one record');
  cpSync(join(dir, '.skillgate', 'security', 'records', written[0]), join(dir, SECURITY, 'records', written[0]));
  rmSync(join(dir, '.skillgate'), { recursive: true });
  assert.equal(recordFiles(dir).length, 1);
  const status = run(dir, 'status');
  assert.equal(status.code, 0);
  assert.match(status.out, /Invalid evidence records: 0/);
  assert.match(status.out, /\| DEMO-ACCESS \| Synthetic access observation \| yes \| observed \| current \|/);
});

test('securitySummary returns the contract shape and never throws for missing evidence', (t) => {
  const shape = ['available', 'catalogVersion', 'total', 'applicable', 'current', 'missing', 'stale', 'expired', 'invalid', 'gaps', 'needsHuman', 'undecided'];
  const dir = fixture(t, [control(), { ...control(), id: 'DEMO-REVIEW' }]);
  writeFileSync(join(dirname(dir), 'plain.txt'), 'not a folder');
  for (const root of [join(dirname(dir), 'absent'), join(dirname(dir), 'plain.txt'), dirname(dir), 42, null]) {
    const s = engine.securitySummary(root);
    assert.deepEqual(Object.keys(s), ['available', 'reason']);
    assert.equal(s.available, false);
    assert.equal(typeof s.reason, 'string');
  }
  let s = engine.securitySummary(dir);
  assert.deepEqual(Object.keys(s), shape);
  assert.deepEqual(s, { available: true, catalogVersion: 'demo-1', total: 2, applicable: 2, current: 0, missing: 2, stale: 0, expired: 0, invalid: 0, gaps: 0, needsHuman: 0, undecided: 0 });
  assert.equal(record(dir).code, 0);
  assert.equal(run(dir, 'record', '--control', 'DEMO-REVIEW', '--assessment', 'gap', '--note', 'Synthetic gap', '--reviewer', 'fixture', '--apply').code, 0);
  s = engine.securitySummary(dir);
  assert.deepEqual([s.current, s.gaps, s.missing], [1, 1, 0]);
  writeFileSync(join(dir, 'source.js'), 'changed\n');
  assert.equal(engine.securitySummary(dir).stale, 1);
  writeFileSync(join(dir, SECURITY, 'records', 'broken.json'), '{');
  s = engine.securitySummary(dir);
  assert.deepEqual([s.available, s.invalid, s.current], [true, 2, 0], 'an invalid record poisons every control, visibly');
  writeFileSync(join(dir, SECURITY, 'catalog.json'), '{');
  s = engine.securitySummary(dir);
  assert.equal(s.available, false);
  assert.match(s.reason, /MALFORMED_JSON/);
  rmSync(join(dir, SECURITY, 'catalog.json'));
  assert.match(engine.securitySummary(dir).reason, /no security catalog/);
});

test('the skillgate-baseline-2 catalog validates under the engine and keeps the seven starter controls unchanged', (t) => {
  const catalogs = join(pluginDir, 'catalogs');
  const baseline = JSON.parse(readFileSync(join(catalogs, 'skillgate-baseline-2.json'), 'utf8'));
  const starter = JSON.parse(readFileSync(join(catalogs, 'skillgate-starter-1.json'), 'utf8'));
  assert.equal(engine.validateCatalog(baseline), baseline);
  assert.equal(baseline.catalogVersion, 'skillgate-baseline-2');
  assert.equal(starter.controls.length, 7);
  for (const s of starter.controls) assert.deepEqual(baseline.controls.find((c) => c.id === s.id), s, `${s.id} is unchanged`);
  for (const id of ['SG-SECRETS-IN-SOURCE', 'SG-DEPENDENCY-RISK', 'SG-AUTHENTICATION', 'SG-SESSION-HANDLING', 'SG-ACCESS-CONTROL', 'SG-INPUT-INJECTION', 'SG-SECURITY-LOGGING', 'SG-POLICY-CHANGE-REVIEW']) {
    assert.ok(baseline.controls.some((c) => c.id === id), `${id} is in the catalog`);
  }
  const sources = readFileSync(join(repo, 'docs', 'security-catalog-sources.md'), 'utf8');
  for (const c of baseline.controls) {
    for (const m of c.mappings) {
      if (m.framework === 'NIST SSDF') {
        assert.deepEqual([m.version, m.url], ['1.1', 'https://csrc.nist.gov/pubs/sp/800/218/final']);
        assert.match(m.reference, /^(PO|PS|PW|RV)\.\d+\.\d+$/);
      } else {
        assert.deepEqual([m.framework, m.version, m.url], ['OWASP ASVS', '5.0.0', 'https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release']);
        assert.match(m.reference, /^v5\.0\.0-\d+\.\d+\.\d+$/);
      }
      assert.ok(sources.includes(`\`${m.reference}\``), `${c.id} ${m.reference} is listed in docs/security-catalog-sources.md`);
    }
  }
  const dir = fixture(t, [control()], { decide: false });
  copyFileSync(join(catalogs, 'skillgate-baseline-2.json'), join(dir, SECURITY, 'catalog.json'));
  const status = run(dir, 'status');
  assert.equal(status.code, 1);
  for (const c of baseline.controls) assert.match(status.out, new RegExp(`\\| ${c.id} \\|`));
  const index = JSON.parse(readFileSync(join(catalogs, 'index.json'), 'utf8'));
  assert.equal(index.schema, 'skilliton.catalogs/1');
  assert.equal(engine.validateCatalog(JSON.parse(readFileSync(join(catalogs, `${index.current}.json`), 'utf8'))).catalogVersion, index.current);
});

test('findings: identical across three runs, a resolved finding leaves the section, and text outside the markers is untouched', (t) => {
  const second = { ...control(), id: 'DEMO-REVIEW', title: 'Synthetic review observation' };
  const dir = fixture(t, [control(), second]);
  mkdirSync(join(dir, 'docs'));
  const backlog = join(dir, 'docs', 'BACKLOG.md');
  const head = Buffer.concat([Buffer.from('# Backlog\r\n\r\nKind: Living.\r\n\r\n- [ ] keep the caf', 'utf8'), Buffer.from([0xc3, 0xa9]), Buffer.from(' item\r\n', 'utf8')]);
  writeFileSync(backlog, head);
  assert.equal(run(dir, 'record', '--control', 'DEMO-REVIEW', '--assessment', 'gap', '--note', 'Synthetic review gap', '--reviewer', 'fixture-reviewer', '--apply').code, 0);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(run(dir, 'findings', '--apply').code, 0);
    runs.push(readFileSync(backlog));
  }
  assert.ok(runs[0].equals(runs[1]) && runs[1].equals(runs[2]), 'three runs leave identical bytes');
  assert.ok(runs[0].subarray(0, head.length).equals(head), 'the human text before the section is byte-identical');
  const text = runs[0].toString('utf8');
  assert.equal(text.split(START).length - 1, 1);
  assert.match(text, /\| SEC-DEMO-ACCESS \| Synthetic access observation \| missing \| record an assessment or run a collector \|\r\n/);
  assert.match(text, /\| SEC-DEMO-REVIEW \| Synthetic review observation \| gap \| resolve the gap, then record a new assessment \|\r\n/);
  assert.ok(text.indexOf('SEC-DEMO-ACCESS') < text.indexOf('SEC-DEMO-REVIEW'));

  const tail = Buffer.from('\r\n## Later human notes\r\n', 'utf8');
  writeFileSync(backlog, Buffer.concat([runs[0], tail]));
  assert.equal(run(dir, 'record', '--control', 'DEMO-REVIEW', '--assessment', 'observed', '--source', 'source.js', '--artifact', 'result.txt', '--note', 'Synthetic review resolved', '--reviewer', 'fixture-reviewer', '--apply').code, 0);
  assert.equal(run(dir, 'findings', '--apply').code, 0);
  const after = readFileSync(backlog);
  assert.doesNotMatch(after.toString('utf8'), /SEC-DEMO-REVIEW/);
  assert.equal(after.toString('utf8').split('SEC-DEMO-ACCESS').length - 1, 1);
  assert.ok(after.subarray(0, head.length).equals(head));
  assert.ok(after.subarray(after.length - tail.length - END.length - 2).equals(Buffer.concat([Buffer.from(`${END}\r\n`), tail])), 'the human text after the section is byte-identical');
  assert.equal(recordFiles(dir).length, 2, 'history stays in the observation records');

  assert.equal(record(dir).code, 0);
  assert.equal(run(dir, 'findings', '--apply').code, 0);
  assert.match(readFileSync(backlog, 'utf8'), /No open findings: every applicable control has a current observed record/);
  const unchanged = run(dir, 'findings', '--apply');
  assert.equal(unchanged.code, 0);
  assert.match(unchanged.out, /already up to date/);
});

test('findings: the preview writes nothing; broken markers, linked backlogs, a missing backlog, a changed file and invalid evidence are refused', (t) => {
  const dir = fixture(t);
  mkdirSync(join(dir, 'docs'));
  const backlog = join(dir, 'docs', 'BACKLOG.md');
  writeFileSync(backlog, '# Backlog\n');
  const modified = statSync(backlog).mtimeMs;
  const preview = run(dir, 'findings');
  assert.equal(preview.code, 0);
  assert.match(preview.out, /\+<!-- skilliton:security-findings:start -->/);
  assert.match(preview.out, /Nothing was written/);
  assert.equal(readFileSync(backlog, 'utf8'), '# Backlog\n');
  assert.equal(statSync(backlog).mtimeMs, modified);
  assert.equal(existsSync(join(dirname(dir), 'backups')), false);

  for (const broken of [`# Backlog\n${START}\n${START}\n${END}\n`, `# Backlog\n${END}\n${START}\n`, `# Backlog\n${START}\n`, `# Backlog\nnote ${START}\n${END}\n`]) {
    writeFileSync(backlog, broken);
    const refused = run(dir, 'findings', '--apply');
    assert.equal(refused.code, 2);
    assert.match(refused.out, /INVALID_FINDINGS_MARKERS/);
    assert.equal(readFileSync(backlog, 'utf8'), broken);
  }

  writeFileSync(backlog, '# Backlog\n');
  const plan = engine.planFindings(dir);
  writeFileSync(backlog, '# Backlog\n\n- [ ] edited by someone else meanwhile\n');
  assert.throws(() => engine.writeFindings(dir, plan), (e) => e.code === 'CHANGED_SINCE_READ');
  assert.equal(readFileSync(backlog, 'utf8'), '# Backlog\n\n- [ ] edited by someone else meanwhile\n');

  writeFileSync(backlog, '# Backlog\n');
  linkSync(backlog, join(dir, 'docs', 'BACKLOG-link.md'));
  assert.equal(run(dir, 'findings', '--apply').code, 2);
  rmSync(join(dir, 'docs', 'BACKLOG-link.md'));
  rmSync(backlog);
  writeFileSync(join(dir, 'elsewhere.md'), '# Elsewhere\n');
  symlinkSync(join(dir, 'elsewhere.md'), backlog);
  assert.equal(run(dir, 'findings', '--apply').code, 2);
  assert.equal(readFileSync(join(dir, 'elsewhere.md'), 'utf8'), '# Elsewhere\n');
  rmSync(backlog);
  const missing = run(dir, 'findings', '--apply');
  assert.equal(missing.code, 2);
  assert.match(missing.out, /MISSING_BACKLOG/);

  writeFileSync(backlog, '# Backlog\n');
  mkdirSync(join(dir, SECURITY, 'records'));
  writeFileSync(join(dir, SECURITY, 'records', 'broken.json'), '{');
  const invalid = run(dir, 'findings', '--apply');
  assert.equal(invalid.code, 2);
  assert.match(invalid.out, /INVALID_EVIDENCE/);
  assert.equal(readFileSync(backlog, 'utf8'), '# Backlog\n');
});

test('attached file paths: deep repository paths are accepted, while secret-shaped parts are still refused', (t) => {
  const dir = fixture(t);
  const deep = 'packs/base/plugins/workflow/runtime/lib/security.mjs';
  assert.match(deep, /[A-Za-z0-9+/_=-]{48,}/, "positive control: the prototype's whole-path rule refused this path");
  mkdirSync(join(dir, dirname(deep)), { recursive: true });
  writeFileSync(join(dir, deep), 'export {};\n');
  const args = [...observation];
  args[args.indexOf('--source') + 1] = deep;
  assert.equal(run(dir, ...args, '--apply').code, 0);
  const longPart = 'Q'.repeat(24) + 'z'.repeat(30);
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'cache', longPart), 'x');
  const tokenName = 'gh' + 'p_' + 'C'.repeat(20) + '.json';
  writeFileSync(join(dir, tokenName), '{}');
  for (const path of [`cache/${longPart}`, tokenName]) {
    args[args.indexOf('--source') + 1] = path;
    const refused = run(dir, ...args, '--apply');
    assert.equal(refused.code, 2);
    assert.match(refused.out, /SENSITIVE_PATH/);
    assert.equal(refused.out.includes(path), false);
  }
  assert.equal(recordFiles(dir).length, 1);
});

test('mutation check: a runtime that ignores changed fingerprints fails the drift assertion', (t) => {
  const dir = fixture(t);
  const copy = copyPlugin(dir, 'mutant');
  const enginePath = join(copy, 'runtime', 'lib', 'security.mjs');
  const target = "if (entry.sha256 !== a.sha256) return 'changed';";
  const source = readFileSync(enginePath, 'utf8');
  assert.equal(source.split(target).length, 2, 'the mutation target is in the engine exactly once');
  writeFileSync(enginePath, source.replace(target, "if (false) return 'changed';"));
  assert.equal(record(dir).code, 0);
  writeFileSync(join(dir, 'source.js'), 'changed\n');
  const real = run(dir, 'status');
  assert.equal(real.code, 1);
  assert.match(real.out, /observed \| stale/);
  const mutant = spawnSync(join(copy, 'bin', 'skilliton'), ['security', 'status', '--dir', dir], { encoding: 'utf8', env: withNodeOnPath(dir) });
  assert.equal(mutant.status, 0, 'the mutant reports complete, so the stale assertion above is able to fail');
  assert.match(mutant.stdout, /observed \| current/);
});
