#!/usr/bin/env node
// security.test.mjs: `security status --json` (N9, docs/CONTRACTS.md section 12): the machine-readable shape
// lib/security.mjs's statusJson builds, pure, from what evaluateSecurity already computed. One case per freshness
// state (current, stale, expired, missing, invalid) and one for a control with no applicability decision, each
// checked against the shape this file holds. A last pair of tests proves the JSON is the only thing on stdout and
// that its counts match the numbers the human report prints, and that --json refuses to combine with --apply or
// --require-collected. The command runs the way people run it: node scripts/skilliton.mjs security status --json.
//
// Every test works in its own temporary folder under the system temp folder, removed afterwards, with HOME and the
// backup folder inside it.
//
//   node --test scripts/security.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'skilliton.mjs');
const engine = await import(pathToFileURL(join(here, '..', 'packs', 'base', 'plugins', 'workflow', 'runtime', 'lib', 'security.mjs')).href);
const SECURITY = '.skilliton/security';
const DAY = 24 * 60 * 60 * 1000;

const control = (id, extra = {}) => ({
  id, title: `Synthetic ${id} observation`,
  mappings: [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }],
  expectedEvidence: ['Source and synthetic check output'], ...extra,
});
const decision = (controlId, applies = true) => ({ controlId, applies, rationale: 'Synthetic fixture decision', decidedBy: 'fixture-owner', decidedAt: '2020-01-01T00:00:00.000Z' });

// A project folder inside the test's own temporary folder, with the given controls in its catalog and the given
// applicability decisions (possibly none, to leave a control undecided).
function fixture(t, controls, decisions) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-json-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls }));
  writeFileSync(join(dir, SECURITY, 'applicability.json'), JSON.stringify({ schemaVersion: 1, decisions }));
  writeFileSync(join(dir, 'source.js'), 'export const synthetic = true;\n');
  writeFileSync(join(dir, 'result.txt'), 'synthetic output\n');
  return dir;
}
function envFor(dir) {
  const env = { ...process.env, HOME: join(dirname(dir), 'home'), SKILLITON_BACKUPS: join(dirname(dir), 'backups') };
  delete env.SKILLITON_DEBUG;
  return env;
}
function run(dir, ...args) {
  const p = spawnSync(process.execPath, [cli, 'security', args.shift(), '--dir', dir, ...args], { encoding: 'utf8', timeout: 30000, env: envFor(dir) });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr, stdout: p.stdout, stderr: p.stderr };
}
function record(dir, controlId) {
  const r = run(dir, 'record', '--control', controlId, '--assessment', 'observed', '--source', 'source.js', '--artifact', 'result.txt',
    '--note', 'Synthetic observation only', '--reviewer', 'fixture-reviewer', '--apply');
  assert.equal(r.code, 0, r.out);
  return r;
}
function recordFiles(dir) { return readdirSync(join(dir, SECURITY, 'records')).filter((f) => f.endsWith('.json')).map((f) => join(dir, SECURITY, 'records', f)); }
function changeRecord(dir, controlId, mutate) {
  for (const f of recordFiles(dir)) {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    if (r.controlId !== controlId) continue;
    mutate(r); writeFileSync(f, JSON.stringify(r));
    return;
  }
  assert.fail(`no record found for ${controlId}`);
}

// The shape this file holds for `security status --json`'s controls: every key statusJson promises, nothing else.
const CONTROL_KEYS = ['id', 'title', 'applies', 'decidedBy', 'assessment', 'freshness', 'recordId', 'recordedAt', 'maxAgeDays'].sort();
const COUNT_KEYS = ['total', 'applicable', 'current', 'missing', 'stale', 'expired', 'invalid', 'gaps', 'needsHuman', 'undecided'];
function assertShape(json) {
  assert.equal(json.schema, 'skilliton.security-status/1');
  assert.equal(typeof json.catalogVersion, 'string');
  assert.ok(!Number.isNaN(Date.parse(json.generatedAt)), 'generatedAt parses as a date');
  assert.ok(Array.isArray(json.controls));
  for (const c of json.controls) {
    assert.deepEqual(Object.keys(c).sort(), CONTROL_KEYS);
    assert.equal(typeof c.id, 'string');
    assert.equal(typeof c.title, 'string');
    assert.ok(['yes', 'no', 'undecided', 'unknown'].includes(c.applies));
    assert.ok(c.decidedBy === null || typeof c.decidedBy === 'string');
    assert.ok(['none', 'observed', 'gap', 'needs-human'].includes(c.assessment));
    assert.ok(['current', 'stale', 'expired', 'missing', 'invalid'].includes(c.freshness));
    assert.ok(c.recordId === null || typeof c.recordId === 'string');
    assert.ok(c.recordedAt === null || typeof c.recordedAt === 'string');
    assert.ok(c.maxAgeDays === null || Number.isInteger(c.maxAgeDays));
  }
  assert.equal(typeof json.counts, 'object');
  for (const k of COUNT_KEYS) assert.ok(Number.isInteger(json.counts[k]), `counts.${k} is an integer`);
}
const byId = (json, id) => json.controls.find((c) => c.id === id);

test('statusJson is pure and takes generatedAt from the evaluation it is given, not a fresh timestamp', (t) => {
  const dir = fixture(t, [control('DEMO-PURE')], [decision('DEMO-PURE')]);
  const ev = engine.evaluateSecurity(dir, { now: Date.parse('2021-06-15T00:00:00.000Z') });
  const a = engine.statusJson(ev);
  const b = engine.statusJson(ev);
  assert.deepEqual(a, b);
  assert.equal(a.generatedAt, '2021-06-15T00:00:00.000Z');
  assert.equal(a.schema, engine.STATUS_JSON_SCHEMA);
  assertShape(a);
});

test('current: an observed record with unchanged fingerprinted files reads current', (t) => {
  const dir = fixture(t, [control('DEMO-CURRENT')], [decision('DEMO-CURRENT')]);
  record(dir, 'DEMO-CURRENT');
  const r = run(dir, 'status', '--json');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stderr, '');
  const json = JSON.parse(r.stdout);
  assertShape(json);
  const row = byId(json, 'DEMO-CURRENT');
  assert.equal(row.applies, 'yes');
  assert.equal(row.decidedBy, 'fixture-owner');
  assert.equal(row.assessment, 'observed');
  assert.equal(row.freshness, 'current');
  assert.match(row.recordId, /^[a-f0-9-]{36}$/);
  assert.equal(typeof row.recordedAt, 'string');
});

test('stale: an observed record whose fingerprinted source changed reads stale', (t) => {
  const dir = fixture(t, [control('DEMO-STALE')], [decision('DEMO-STALE')]);
  record(dir, 'DEMO-STALE');
  writeFileSync(join(dir, 'source.js'), 'export const synthetic = false;\n');
  const json = JSON.parse(run(dir, 'status', '--json').stdout);
  assertShape(json);
  const row = byId(json, 'DEMO-STALE');
  assert.equal(row.freshness, 'stale');
  assert.equal(row.assessment, 'observed');
});

test('expired: an observed record older than maxAgeDays reads expired, without the record itself changing', (t) => {
  const dir = fixture(t, [control('DEMO-EXPIRED', { maxAgeDays: 1 })], [decision('DEMO-EXPIRED')]);
  record(dir, 'DEMO-EXPIRED');
  changeRecord(dir, 'DEMO-EXPIRED', (r) => { r.recordedAt = new Date(Date.now() - 5 * DAY).toISOString(); });
  const json = JSON.parse(run(dir, 'status', '--json').stdout);
  assertShape(json);
  const row = byId(json, 'DEMO-EXPIRED');
  assert.equal(row.freshness, 'expired');
  assert.equal(row.maxAgeDays, 1);
});

test('missing: a decided control with no record reads missing, with no record fields', (t) => {
  const dir = fixture(t, [control('DEMO-MISSING')], [decision('DEMO-MISSING')]);
  const r = run(dir, 'status', '--json');
  assert.equal(r.code, 1, r.out);
  const json = JSON.parse(r.stdout);
  assertShape(json);
  const row = byId(json, 'DEMO-MISSING');
  assert.equal(row.freshness, 'missing');
  assert.equal(row.assessment, 'none');
  assert.equal(row.recordId, null);
  assert.equal(row.recordedAt, null);
});

test('undecided: a control with no applicability decision at all reads undecided, with no decidedBy', (t) => {
  const dir = fixture(t, [control('DEMO-UNDECIDED')], []);
  const r = run(dir, 'status', '--json');
  assert.equal(r.code, 1, r.out);
  const json = JSON.parse(r.stdout);
  assertShape(json);
  const row = byId(json, 'DEMO-UNDECIDED');
  assert.equal(row.applies, 'undecided');
  assert.equal(row.decidedBy, null);
});

test('invalid: a malformed record file poisons every control, all reading invalid', (t) => {
  const dir = fixture(t, [control('DEMO-INVALID')], [decision('DEMO-INVALID')]);
  mkdirSync(join(dir, SECURITY, 'records'), { recursive: true });
  writeFileSync(join(dir, SECURITY, 'records', '00000000-0000-4000-8000-000000000000.json'), '{"not": "a record"}\n');
  const r = run(dir, 'status', '--json');
  assert.equal(r.code, 2, r.out);
  const json = JSON.parse(r.stdout);
  assertShape(json);
  const row = byId(json, 'DEMO-INVALID');
  assert.equal(row.freshness, 'invalid');
});

test('--json prints one object and nothing else, and its counts equal the numbers the text report prints', (t) => {
  const dir = fixture(t, [control('DEMO-A'), control('DEMO-B')], [decision('DEMO-A'), decision('DEMO-B', false)]);
  record(dir, 'DEMO-A');
  const text = run(dir, 'status');
  const catalogLine = /Catalog: [^,]+, (\d+) controls; not applicable: \d+; undecided applicability: (\d+)\./.exec(text.out);
  const resultLine = /Result: \w+ \(exit \d+\)\. (\d+) of (\d+) applicable control\(s\) have a current observed record; missing (\d+), stale (\d+), expired (\d+), invalid (\d+), gaps (\d+), needs a human (\d+) \(undecided (\d+)\)/.exec(text.out);
  assert.ok(catalogLine, text.out);
  assert.ok(resultLine, text.out);
  const total = Number(catalogLine[1]);
  const [current, applicable, missing, stale, expired, invalid, gaps, needsHuman, undecided] = resultLine.slice(1).map(Number);
  assert.equal(Number(catalogLine[2]), undecided, 'the two lines of the human report agree on undecided');
  const r = run(dir, 'status', '--json');
  assert.equal(r.code, text.code);
  assert.equal(r.stderr, '');
  assert.doesNotThrow(() => JSON.parse(r.stdout), 'stdout is exactly one JSON object, nothing else printed around it');
  const json = JSON.parse(r.stdout);
  assertShape(json);
  assert.deepEqual(json.counts, { total, applicable, current, missing, stale, expired, invalid, gaps, needsHuman, undecided });
});

test('--json does not combine with --apply or --require-collected, and writes nothing', (t) => {
  const dir = fixture(t, [control('DEMO-GUARD')], [decision('DEMO-GUARD')]);
  const apply = run(dir, 'status', '--json', '--apply');
  assert.equal(apply.code, 2, apply.out);
  assert.equal(apply.stdout, '');
  assert.equal(existsSync(join(dir, SECURITY, 'REPORT.md')), false);
  const requireCollected = run(dir, 'status', '--json', '--require-collected');
  assert.equal(requireCollected.code, 2, requireCollected.out);
  assert.equal(requireCollected.stdout, '');
});
