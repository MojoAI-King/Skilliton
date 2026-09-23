#!/usr/bin/env node
// security-freshness.test.mjs: evidence freshness reads content, not time (N87). A file manifest attached to a record
// lists files with their hash, size and modification time; lib/security.mjs verifyManifest hashes every listed file
// each time, so an edit that keeps the size and restores the modification time still makes the record stale.
//
//   node --test scripts/security-freshness.test.mjs
//
// Each test works in its own temporary folder, removed afterwards, with HOME and the backup folder inside it. The
// command runs the way people run it: node scripts/skilliton.mjs security ...
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'skilliton.mjs');
const engine = await import(pathToFileURL(join(here, '..', 'packs', 'base', 'plugins', 'workflow', 'runtime', 'lib', 'security.mjs')).href);
const SECURITY = '.skilliton/security';
const SOURCE = 'src/answer.js';
const MANIFEST = 'evidence/answer-manifest.txt';
const BEFORE = 'export const answer = 42;\n';
const AFTER = 'export const answer = 43;\n';
const WHOLE_SECOND = 1700000000; // a modification time in whole seconds restores exactly, on every file system here

const control = { id: 'DEMO-ANSWER', title: 'Synthetic answer observation', mappings: [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }], expectedEvidence: ['A file manifest of the source'] };

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-freshness-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  for (const d of [SECURITY, 'src', 'evidence']) mkdirSync(join(dir, d), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: [control] }));
  writeFileSync(join(dir, SECURITY, 'applicability.json'), JSON.stringify({ schemaVersion: 1, decisions: [{ controlId: control.id, applies: true, rationale: 'Synthetic fixture decision', decidedBy: 'fixture-owner', decidedAt: '2020-01-01T00:00:00.000Z' }] }));
  writeFileSync(join(dir, SOURCE), BEFORE);
  utimesSync(join(dir, SOURCE), WHOLE_SECOND, WHOLE_SECOND);
  const st = statSync(join(dir, SOURCE));
  const entry = { sha256: createHash('sha256').update(readFileSync(join(dir, SOURCE))).digest('hex'), size: st.size, mtimeMs: st.mtimeMs, path: SOURCE };
  writeFileSync(join(dir, MANIFEST), engine.renderManifest([entry], 'the source of the synthetic answer'));
  writeFileSync(join(dir, 'result.txt'), 'synthetic output\n');
  const recorded = run(dir, 'record', '--control', control.id, '--assessment', 'observed', '--source', MANIFEST, '--artifact', 'result.txt', '--note', 'Synthetic observation only', '--reviewer', 'fixture-reviewer', '--apply');
  assert.equal(recorded.code, 0, recorded.out);
  return { dir, mtimeMs: st.mtimeMs };
}

function run(dir, ...args) {
  const env = { ...process.env, HOME: join(dirname(dir), 'home'), SKILLITON_BACKUPS: join(dirname(dir), 'backups') };
  delete env.SKILLITON_DEBUG;
  const p = spawnSync(process.execPath, [cli, 'security', args.shift(), '--dir', dir, ...args], { encoding: 'utf8', timeout: 30000, env });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr };
}

const freshness = (dir) => engine.evaluateSecurity(dir).rows.find((row) => row.control.id === control.id).freshness;
const manifestState = (dir) => engine.verifyManifest(dir, readFileSync(join(dir, MANIFEST)));

test('an unchanged listed file reads current, and the status line says content checked', (t) => {
  const { dir } = fixture(t);
  assert.equal(manifestState(dir), 'same');
  assert.equal(freshness(dir), 'current');
  const status = run(dir, 'status');
  assert.equal(status.code, 0, status.out);
  assert.match(status.out, /Result: complete .*Freshness: content checked/);
});

test('a 26-byte source changed from answer = 42 to answer = 43 with its modification time restored reads stale', (t) => {
  const { dir, mtimeMs } = fixture(t);
  assert.equal(Buffer.byteLength(BEFORE), 26);
  assert.equal(Buffer.byteLength(AFTER), 26);
  writeFileSync(join(dir, SOURCE), AFTER);
  utimesSync(join(dir, SOURCE), WHOLE_SECOND, WHOLE_SECOND);
  const st = statSync(join(dir, SOURCE));
  assert.equal(st.size, 26, 'the size is unchanged');
  assert.equal(st.mtimeMs, mtimeMs, 'the modification time is restored exactly, so only the content tells the edit apart');
  assert.equal(manifestState(dir), 'changed');
  assert.equal(freshness(dir), 'stale');
  const status = run(dir, 'status');
  assert.equal(status.code, 1, status.out);
  assert.match(status.out, /stale 1/);
});

test('a missing listed file reads changed, and the record stale', (t) => {
  const { dir } = fixture(t);
  unlinkSync(join(dir, SOURCE));
  assert.equal(manifestState(dir), 'changed');
  assert.equal(freshness(dir), 'stale');
});
