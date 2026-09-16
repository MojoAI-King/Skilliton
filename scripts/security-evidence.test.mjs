#!/usr/bin/env node
// Synthetic CLI acceptance tests. No external tools, accounts, or scanners are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, statSync, existsSync, copyFileSync, truncateSync, linkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const cli = join(dirname(fileURLToPath(import.meta.url)), 'security-evidence.mjs');
const control = () => ({ id: 'DEMO-ACCESS', title: 'Synthetic access observation', mappings: [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }], expectedEvidence: ['Source and synthetic check output'] });
function fixture(t, controls = [control()]) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'security-evidence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.skillgate/security'), { recursive: true });
  writeFileSync(join(dir, '.skillgate/security/catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls }));
  writeFileSync(join(dir, 'source.js'), 'export const synthetic = true;\n');
  writeFileSync(join(dir, 'result.txt'), 'synthetic output\n');
  return dir;
}
function run(dir, ...args) {
  const p = spawnSync(process.execPath, [cli, args.shift(), '--dir', dir, ...args], { encoding: 'utf8', timeout: 10000 });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr };
}
const observation = ['record', '--control', 'DEMO-ACCESS', '--assessment', 'observed', '--source', 'source.js', '--artifact', 'result.txt', '--note', 'Synthetic observation only', '--reviewer', 'fixture-reviewer'];
function record(dir, extra = []) { return run(dir, ...observation, '--apply', ...extra); }
function recordFiles(dir) { return readdirSync(join(dir, '.skillgate/security/records')).map(f => join(dir, '.skillgate/security/records', f)); }
function changeRecord(dir, mutate) {
  const f = recordFiles(dir)[0];
  const r = JSON.parse(readFileSync(f, 'utf8'));
  mutate(r); writeFileSync(f, JSON.stringify(r));
}

test('dry run validates but creates no records or report', t => {
  const dir = fixture(t);
  assert.equal(run(dir, ...observation).code, 0);
  assert.equal(existsSync(join(dir, '.skillgate/security/records')), false);
  const status = run(dir, 'status');
  assert.equal(status.code, 2);
  assert.match(status.out, /missing/);
  assert.equal(existsSync(join(dir, '.skillgate/security/REPORT.md')), false);
});

test('observed record binds source, artifact and control without claiming compliance', t => {
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
  assert.equal(readFileSync(join(dir, '.skillgate/security/REPORT.md'), 'utf8'), status.out);
});

for (const kind of ['source', 'artifact', 'mapping', 'catalog-version', 'deleted-source']) {
  test(`${kind} drift is stale and status never restamps evidence`, t => {
    const dir = fixture(t);
    assert.equal(record(dir).code, 0);
    const [f] = recordFiles(dir);
    const original = readFileSync(f, 'utf8');
    const modified = statSync(f).mtimeMs;
    if (kind === 'source') writeFileSync(join(dir, 'source.js'), 'changed\n');
    if (kind === 'artifact') writeFileSync(join(dir, 'result.txt'), 'changed\n');
    if (kind === 'deleted-source') rmSync(join(dir, 'source.js'));
    if (kind === 'mapping' || kind === 'catalog-version') {
      const p = join(dir, '.skillgate/security/catalog.json');
      const c = JSON.parse(readFileSync(p, 'utf8'));
      if (kind === 'mapping') c.controls[0].mappings[0].reference = 'A.2';
      else c.catalogVersion = 'demo-2';
      writeFileSync(p, JSON.stringify(c));
    }
    for (let n = 0; n < 2; n++) {
      const status = run(dir, 'status', '--apply');
      assert.equal(status.code, 2);
      assert.match(status.out, /observed.*stale/);
      assert.equal(readFileSync(f, 'utf8'), original);
      assert.equal(statSync(f).mtimeMs, modified);
    }
  });
}

test('missing, empty and duplicate catalogs never produce a green result', t => {
  const dir = fixture(t);
  rmSync(join(dir, '.skillgate/security/catalog.json'));
  assert.equal(run(dir, 'status').code, 1);
  writeFileSync(join(dir, '.skillgate/security/catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: [] }));
  assert.equal(run(dir, 'status').code, 1);
  writeFileSync(join(dir, '.skillgate/security/catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: [control(), control()] }));
  assert.equal(run(dir, 'status').code, 1);
});

test('denominator includes every control and current gaps remain nonzero', t => {
  const second = { ...control(), id: 'DEMO-REVIEW' };
  const dir = fixture(t, [control(), second]);
  assert.equal(record(dir).code, 0);
  let status = run(dir, 'status');
  assert.equal(status.code, 2);
  assert.match(status.out, /1\/2/);
  assert.equal(run(dir, 'record', '--control', second.id, '--assessment', 'gap', '--note', 'Missing review evidence', '--reviewer', 'fixture-reviewer', '--apply').code, 0);
  status = run(dir, 'status');
  assert.equal(status.code, 2);
  assert.match(status.out, /gap.*current/);
});

test('observed requires sources and artifacts; needs-human remains distinct', t => {
  const dir = fixture(t);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'observed', '--note', 'Missing attachments', '--reviewer', 'fixture').code, 1);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'needs-human', '--note', 'External evidence needed', '--reviewer', 'fixture', '--apply').code, 0);
  const status = run(dir, 'status');
  assert.equal(status.code, 2);
  assert.match(status.out, /needs-human.*current/);
});

test('malformed record remains prominently invalid even beside a valid latest record', t => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  writeFileSync(join(dir, '.skillgate/security/records/broken.json'), '{');
  const status = run(dir, 'status', '--apply');
  assert.equal(status.code, 1);
  assert.match(status.out, /invalid/i);
  assert.match(status.out, /Invalid evidence records: 1/);
  assert.equal(readFileSync(join(dir, '.skillgate/security/records/broken.json'), 'utf8'), '{');
});

test('future timestamps and filename identity mismatches are invalid', t => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  changeRecord(dir, r => { r.recordedAt = new Date(Date.now() + 60000).toISOString(); });
  assert.equal(run(dir, 'status').code, 1);
  changeRecord(dir, r => { r.recordedAt = new Date(0).toISOString(); r.id = '00000000-0000-4000-8000-000000000000'; });
  assert.equal(run(dir, 'status').code, 1);
});

test('unsafe source names and traversal are rejected before writes', t => {
  const dir = fixture(t);
  for (const name of ['../outside.txt', '/tmp/outside.txt', '.git/config', '.env', '.env.example', 'credentials.json', 'private.pem', 'id_rsa', 'nested/../source.js']) {
    const args = [...observation]; args[args.indexOf('--source') + 1] = name;
    const result = run(dir, ...args, '--apply');
    assert.equal(result.code, 1, `unsafe path accepted: ${name}`);
    assert.equal(existsSync(join(dir, '.skillgate/security/records')), false);
  }
});

test('symlink source, nested parent, record and report paths are rejected', t => {
  const dir = fixture(t);
  symlinkSync(join(dir, 'source.js'), join(dir, 'alias.js'));
  const args = [...observation]; args[args.indexOf('--source') + 1] = 'alias.js';
  assert.equal(run(dir, ...args, '--apply').code, 1);
  mkdirSync(join(dir, 'real'));
  writeFileSync(join(dir, 'real/file.txt'), 'fixture');
  symlinkSync(join(dir, 'real'), join(dir, 'linked'));
  args[args.indexOf('--source') + 1] = 'linked/file.txt';
  assert.equal(run(dir, ...args, '--apply').code, 1);
  assert.equal(record(dir).code, 0);
  symlinkSync(join(dir, 'source.js'), join(dir, '.skillgate/security/records/alias.json'));
  assert.equal(run(dir, 'status').code, 1);
  rmSync(join(dir, '.skillgate/security/records/alias.json'));
  symlinkSync(join(dir, 'source.js'), join(dir, '.skillgate/security/REPORT.md'));
  const before = readFileSync(join(dir, 'source.js'), 'utf8');
  assert.equal(run(dir, 'status', '--apply').code, 1);
  assert.equal(readFileSync(join(dir, 'source.js'), 'utf8'), before);
});

test('secret-shaped input and parser errors never echo values', t => {
  const dir = fixture(t);
  const forbidden = ['token=' + 'x'.repeat(32), 'ghp_' + 'A'.repeat(36), '-----BEGIN PRIVATE KEY-----'];
  for (const value of forbidden) {
    for (const flag of ['--note', '--reviewer']) {
      const args = [...observation]; args[args.indexOf(flag) + 1] = value;
      const result = run(dir, ...args, '--apply');
      assert.equal(result.code, 1);
      assert.equal(result.out.includes(value), false);
    }
  }
  const marker = 'NEVER_ECHO_THIS_INPUT';
  writeFileSync(join(dir, '.skillgate/security/catalog.json'), '{' + marker);
  const result = run(dir, 'status');
  assert.equal(result.code, 1);
  assert.equal(result.out.includes(marker), false);
});

test('concurrent writers create independent records and newest assessment wins', async t => {
  const dir = fixture(t);
  const codes = await Promise.all(Array.from({ length: 4 }, () => new Promise(resolve => {
    const p = spawn(process.execPath, [cli, 'record', '--dir', dir, ...observation.slice(1), '--apply'], { stdio: 'ignore' });
    p.once('close', resolve);
  })));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  const files = recordFiles(dir);
  assert.equal(files.length, 4);
  assert.equal(new Set(files.map(f => JSON.parse(readFileSync(f, 'utf8')).id)).size, 4);
  assert.equal(run(dir, 'status').code, 0);
  assert.equal(run(dir, 'record', '--control', 'DEMO-ACCESS', '--assessment', 'gap', '--note', 'Later gap found', '--reviewer', 'fixture', '--apply').code, 0);
  assert.match(run(dir, 'status').out, /gap.*current/);
});

test('copied runtime works without imports or repository dependencies', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate/runtime'));
  const copied = join(dir, '.skillgate/runtime/security-evidence.mjs');
  copyFileSync(cli, copied);
  const result = spawnSync(process.execPath, [copied, 'status', '--dir', dir], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /missing/);
});

test('unexpected hidden files are invalid, not silently ignored', t => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  writeFileSync(join(dir, '.skillgate/security/records/.pending-00000000-0000-4000-8000-000000000000'), 'unfinished');
  assert.equal(run(dir, 'status').code, 1);
  assert.match(run(dir, 'status').out, /Invalid evidence records: 1/);
});

test('oversized attachments and hardlinks are refused without echoing contents', t => {
  const dir = fixture(t);
  truncateSync(join(dir, 'result.txt'), 32 * 1024 * 1024 + 1);
  assert.equal(record(dir).code, 1);
  writeFileSync(join(dir, 'result.txt'), 'synthetic');
  linkSync(join(dir, 'source.js'), join(dir, 'second.js'));
  assert.equal(record(dir).code, 1);
});

test('null identifiers and terminal control text are rejected in catalogs', t => {
  const dir = fixture(t);
  const p = join(dir, '.skillgate/security/catalog.json');
  for (const mutate of [c => { c.catalogVersion = null; }, c => { c.controls[0].id = null; }, c => { c.controls[0].title = 'unsafe\u202eheader'; }]) {
    const c = { schemaVersion: 1, catalogVersion: 'demo-1', controls: [control()] };
    mutate(c); writeFileSync(p, JSON.stringify(c));
    assert.equal(run(dir, 'status').code, 1);
  }
});

test('latest timestamp and UUID tie-break determine assessment, regardless of directory order', t => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  const initial = JSON.parse(readFileSync(recordFiles(dir)[0], 'utf8'));
  rmSync(recordFiles(dir)[0]);
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  for (let i = 0; i < ids.length; i++) {
    const r = { ...initial, id: ids[i], recordedAt: '2020-01-01T00:00:00.000Z', assessment: i === 1 ? 'gap' : 'observed' };
    writeFileSync(join(dir, '.skillgate/security/records', `${r.id}.json`), JSON.stringify(r));
  }
  assert.match(run(dir, 'status').out, /gap.*current/);
  const p = join(dir, '.skillgate/security/records', `${ids[0]}.json`);
  const r = JSON.parse(readFileSync(p, 'utf8'));
  r.recordedAt = '2021-01-01T00:00:00.000Z';
  writeFileSync(p, JSON.stringify(r));
  assert.equal(run(dir, 'status').code, 0);
  assert.match(run(dir, 'status').out, /observed.*current/);
});

test('symlinked catalog and records directory are refused', t => {
  const dir = fixture(t);
  const p = join(dir, '.skillgate/security/catalog.json');
  const original = readFileSync(p);
  rmSync(p);
  writeFileSync(join(dir, 'catalog-copy.json'), original);
  symlinkSync(join(dir, 'catalog-copy.json'), p);
  assert.equal(run(dir, 'status').code, 1);
  rmSync(p); writeFileSync(p, original);
  mkdirSync(join(dir, 'alternate-records'));
  symlinkSync(join(dir, 'alternate-records'), join(dir, '.skillgate/security/records'));
  assert.equal(record(dir).code, 1);
  assert.equal(run(dir, 'status').code, 1);
  assert.deepEqual(readdirSync(join(dir, 'alternate-records')), []);
});

test('prepared catalog description and records README are supported without accepting unsafe README paths', t => {
  const dir = fixture(t);
  const p = join(dir, '.skillgate/security/catalog.json');
  const c = JSON.parse(readFileSync(p, 'utf8'));
  c.description = 'Synthetic partial coverage catalog for review.';
  writeFileSync(p, JSON.stringify(c));
  mkdirSync(join(dir, '.skillgate/security/records'));
  const readme = join(dir, '.skillgate/security/records/README.md');
  writeFileSync(readme, '# Synthetic recording instructions\n');
  assert.equal(record(dir).code, 0);
  assert.equal(run(dir, 'status').code, 0);
  rmSync(readme); symlinkSync(join(dir, 'source.js'), readme);
  assert.equal(run(dir, 'status').code, 1);
  rmSync(readme);
  c.description = 'unsafe\u202econtrol';
  writeFileSync(p, JSON.stringify(c));
  assert.equal(run(dir, 'status').code, 1);
});

test('overall and command help describe commands and exits without reading or writing project files', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, '.skillgate/security/catalog.json'), 'intentionally malformed');
  const before = readdirSync(join(dir, '.skillgate/security'));
  for (const args of [['--help'], ['record', '--help'], ['status', '--help']]) {
    const p = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(p.status, 0);
    assert.match(p.stdout, /record --dir/);
    assert.match(p.stdout, /status --dir/);
    assert.match(p.stdout, /observed\|gap\|needs-human/);
    assert.match(p.stdout, /Exit 0/);
    assert.match(p.stdout, /Exit 1/);
    assert.match(p.stdout, /Exit 2/);
    assert.equal(p.stderr, '');
  }
  assert.deepEqual(readdirSync(join(dir, '.skillgate/security')), before);
  assert.equal(readFileSync(join(dir, '.skillgate/security/catalog.json'), 'utf8'), 'intentionally malformed');
});

test('status preserves human REPORT.md and refreshes only reports carrying its generated marker', t => {
  const dir = fixture(t);
  assert.equal(record(dir).code, 0);
  const p = join(dir, '.skillgate/security/REPORT.md');
  const human = '# Human security review\n\nFindings belong to the project team.\n';
  writeFileSync(p, human);
  const modified = statSync(p).mtimeMs;
  assert.equal(run(dir, 'status').code, 0);
  const refused = run(dir, 'status', '--apply');
  assert.equal(refused.code, 1);
  assert.match(refused.out, /NON_GENERATED_REPORT/);
  assert.equal(readFileSync(p, 'utf8'), human);
  assert.equal(statSync(p).mtimeMs, modified);
  assert.equal(readdirSync(join(dir, '.skillgate/security')).some(f => f.startsWith('.pending-')), false);
  rmSync(p);
  assert.equal(run(dir, 'status', '--apply').code, 0);
  assert.match(readFileSync(p, 'utf8'), /^<!-- skillgate-security-evidence-report:v1 -->\n/);
  writeFileSync(join(dir, 'source.js'), 'changed\n');
  assert.equal(run(dir, 'status', '--apply').code, 2);
  assert.match(readFileSync(p, 'utf8'), /observed.*stale/);
});
