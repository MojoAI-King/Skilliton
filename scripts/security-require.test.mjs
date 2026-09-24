#!/usr/bin/env node
// security-require.test.mjs: `skilliton security status --require-collected`, the CI half of backlog B71. It exits 1
// naming each collector-backed control (SG-SECRETS-IN-SOURCE always; SG-CHECK-CRITERIA when .skilliton/delivery.json
// exists) that has no record at all, and 0 when each has one. A stale or expired record is named on its line and
// passes, because maintain refreshes it; a missing one is what CI must not pass. Invalid evidence exits 2.
//
//   node scripts/security-require.test.mjs
//
// Each test works in its own temporary folder, removed afterwards, with HOME inside it. The command runs the way
// people run it: node scripts/skilliton.mjs security status --require-collected --dir <project>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'skilliton.mjs');
const engine = await import(pathToFileURL(join(here, '..', 'packs', 'base', 'plugins', 'workflow', 'runtime', 'lib', 'security.mjs')).href);
const SECURITY = '.skilliton/security';
const DAY_MS = 24 * 60 * 60 * 1000;

const mapping = [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }];
const control = (id) => ({ id, title: `Synthetic ${id}`, mappings: mapping, expectedEvidence: ['A synthetic observation'] });
const CONTROLS = ['SG-SECRETS-IN-SOURCE', 'SG-CHECK-CRITERIA', 'DEMO-OTHER'];

function fixture(t, { policy = false, applies = {}, config = null } = {}) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-require-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: CONTROLS.map(control) }));
  const decisions = CONTROLS.map((id) => ({ controlId: id, applies: applies[id] ?? true, rationale: 'Synthetic fixture decision', decidedBy: 'fixture-owner', decidedAt: '2020-01-01T00:00:00.000Z' }));
  writeFileSync(join(dir, SECURITY, 'applicability.json'), JSON.stringify({ schemaVersion: 1, decisions }));
  if (config) writeFileSync(join(dir, '.skilliton', 'config.json'), JSON.stringify(config));
  if (policy) writeFileSync(join(dir, '.skilliton', 'delivery.json'), '{}\n');
  writeFileSync(join(dir, 'source.txt'), 'first\n');
  return dir;
}

function run(dir, ...args) {
  const env = { ...process.env, HOME: join(dirname(dir), 'home'), SKILLITON_BACKUPS: join(dirname(dir), 'backups') };
  delete env.SKILLITON_DEBUG;
  const p = spawnSync(process.execPath, [cli, 'security', ...args, '--dir', dir], { encoding: 'utf8', timeout: 30000, env });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr };
}

const status = (dir) => run(dir, 'status', '--require-collected');
const record = (dir, id, at = new Date()) => engine.createRecord(dir, { controlId: id, assessment: 'gap', note: 'Synthetic gap only', reviewer: 'fixture-reviewer', sources: ['source.txt'], artifacts: [] }, { apply: true, now: at });
const line = (out, id) => out.split('\n').find((l) => l.startsWith(`  ${id} (`)) ?? '';

test('missing: no record for the secrets control exits 1 and names it; the policy control is not required without a policy', (t) => {
  const dir = fixture(t);
  const r = status(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(line(r.out, 'SG-SECRETS-IN-SOURCE'), /missing, no record at all\. Run: .* security collect secrets --apply/);
  assert.match(line(r.out, 'SG-CHECK-CRITERIA'), /not required, there is no delivery policy/);
  assert.match(r.out, /1 of 1 required control\(s\) have no record: SG-SECRETS-IN-SOURCE \(exit 1\)/);
});

test('missing: with a delivery policy both collector-backed controls are required and both are named', (t) => {
  const dir = fixture(t, { policy: true });
  const r = status(dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /2 of 2 required control\(s\) have no record: SG-SECRETS-IN-SOURCE, SG-CHECK-CRITERIA \(exit 1\)/);
  record(dir, 'SG-SECRETS-IN-SOURCE');
  const again = status(dir);
  assert.equal(again.code, 1, again.out);
  assert.match(again.out, /1 of 2 required control\(s\) have no record: SG-CHECK-CRITERIA \(exit 1\)/);
});

test('current: a record for each required control exits 0, whatever the rest of the report says', (t) => {
  const dir = fixture(t, { policy: true });
  record(dir, 'SG-SECRETS-IN-SOURCE');
  record(dir, 'SG-CHECK-CRITERIA');
  const r = status(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(line(r.out, 'SG-SECRETS-IN-SOURCE'), /record present, current$/);
  assert.match(r.out, /each of the 2 required control\(s\) has a record \(exit 0\)/);
  const plain = run(dir, 'status');
  assert.equal(plain.code, 1, 'without the flag, status keeps its own exit (gaps and a missing control are attention)');
});

test('stale: a record whose source changed is named stale and does not fail', (t) => {
  const dir = fixture(t);
  record(dir, 'SG-SECRETS-IN-SOURCE');
  writeFileSync(join(dir, 'source.txt'), 'second\n');
  const r = status(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(line(r.out, 'SG-SECRETS-IN-SOURCE'), /record present, stale \(maintain refreshes a stale record\)/);
});

test('expired: a record older than maxAgeDays is named expired and does not fail', (t) => {
  const dir = fixture(t, { config: { security: { maxAgeDays: 1 } } });
  record(dir, 'SG-SECRETS-IN-SOURCE', new Date(Date.now() - 3 * DAY_MS));
  const r = status(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(line(r.out, 'SG-SECRETS-IN-SOURCE'), /record present, expired/);
});

test('a control decided not to apply is not required, and says so', (t) => {
  const dir = fixture(t, { applies: { 'SG-SECRETS-IN-SOURCE': false } });
  const r = status(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(line(r.out, 'SG-SECRETS-IN-SOURCE'), /not required, decided not to apply/);
  assert.match(r.out, /each of the 0 required control\(s\) has a record \(exit 0\)/);
});

test('invalid evidence exits 2 rather than passing', (t) => {
  const dir = fixture(t);
  record(dir, 'SG-SECRETS-IN-SOURCE');
  writeFileSync(join(dir, SECURITY, 'records', '00000000-0000-4000-8000-000000000000.json'), '{"not": "a record"}\n');
  const r = status(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /the security evidence is invalid/);
});

test('the flag belongs to status only', (t) => {
  const dir = fixture(t);
  const r = run(dir, 'findings', '--require-collected');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /--require-collected does not apply to "security findings"/);
});
