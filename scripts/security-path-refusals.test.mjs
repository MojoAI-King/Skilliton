#!/usr/bin/env node
// security-path-refusals.test.mjs: a security record refused for an attached path says which entry and which rule (B92).
//
// Measured 2026-09-24: a reassessment note named with 49 name characters in one run was refused as SENSITIVE_PATH by the
// long-encoded-run shape, and the refusal only said that some attached path "names credential-like material or looks
// like a secret", so finding it took eight previews. The refusal now names the entry ("artifacts entry 1") and the rule
// as a fixed phrase. The path itself is never printed: a path refused as secret-shaped may be a secret.
//
// Each test works in its own temporary folder, removed afterwards. Secret-shaped names are built at runtime.
//
//   node --test scripts/security-path-refusals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'skilliton.mjs');
const security = await import(pathToFileURL(join(here, '..', 'packs', 'base', 'plugins', 'workflow', 'runtime', 'lib', 'security.mjs')).href);
const SECURITY = '.skilliton/security';
const CONTROL_ID = 'DEMO-ACCESS';
const catalog = {
  schemaVersion: 1, catalogVersion: 'demo-1',
  controls: [{ id: CONTROL_ID, title: 'Synthetic access observation',
    mappings: [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }],
    expectedEvidence: ['Source and synthetic check output'] }],
};

function project(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-path-refusals-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify(catalog));
  writeFileSync(join(dir, 'source.js'), 'export const synthetic = true;\n');
  writeFileSync(join(dir, 'result.txt'), 'synthetic output\n');
  return dir;
}

function refusedPath(t, patch) {
  const dir = project(t);
  const input = { controlId: CONTROL_ID, assessment: 'observed', note: 'Synthetic observation only', reviewer: 'fixture-reviewer', sources: ['source.js'], artifacts: ['result.txt'], ...patch };
  try {
    security.createRecord(dir, input, { apply: false });
  } catch (e) {
    assert.ok(e instanceof security.SecurityRefusal);
    assert.equal(e.code, 'SENSITIVE_PATH');
    return e;
  }
  assert.fail('expected createRecord to refuse');
  return null;
}

const LONG = `2026-09-24-${'reassessment'}-3-SG-WORKFLOW-IMPROVEMENT`; // 49 name characters in one run
const TOKEN = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');

test('a long encoded run names the entry and the rule, never the path', (t) => {
  const e = refusedPath(t, { artifacts: [`.skilliton/private-evidence/${LONG}.md`] });
  assert.equal(e.detail, 'artifacts entry 1: one path part is a long run of letters, digits, hyphens or underscores, the shape of an encoded key');
  assert.equal(e.detail.includes(LONG), false);
});

test('a credential word, a credential file and a key file each name their rule and their entry', (t) => {
  assert.equal(refusedPath(t, { sources: ['source.js', 'docs/my-password-notes.md'] }).detail,
    'sources entry 2: one path part contains credential, password, secret, token or private key');
  assert.match(refusedPath(t, { sources: ['config/.env'] }).detail, /^sources entry 1: one path part is a credential file or folder name/);
  assert.equal(refusedPath(t, { artifacts: ['result.txt', 'certs/server.pem'] }).detail, 'artifacts entry 2: one path part is a key, certificate or keystore file');
});

test('a path that is itself secret-shaped names the shape and does not print the value', (t) => {
  const e = refusedPath(t, { sources: [`notes/${TOKEN}.md`] });
  assert.match(e.detail, /^sources entry 1: /);
  assert.equal(e.detail.includes(TOKEN), false);
  assert.equal(e.message.includes(TOKEN), false);
});

test('the printed refusal of skilliton security record carries the entry and the rule, and not the path', (t) => {
  const dir = project(t);
  const r = spawnSync(process.execPath, [cli, 'security', 'record', '--dir', dir, '--control', CONTROL_ID, '--assessment', 'observed',
    '--note', 'Synthetic observation only', '--reviewer', 'fixture-reviewer', '--source', 'source.js', '--artifact', `.skilliton/private-evidence/${LONG}.md`],
  { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const all = r.stdout + r.stderr;
  assert.match(all, /refused \(SENSITIVE_PATH\).*artifacts entry 1: one path part is a long run/);
  assert.equal(all.includes(LONG), false);
});

test('an entry file name is still accepted, and a record whose paths are ordinary is not refused', (t) => {
  const dir = project(t);
  mkdirSync(join(dir, 'docs', 'lessons'), { recursive: true });
  const entry = 'docs/lessons/2026-09-24-a-fix-that-hardens-the-writers-it-names-772e.md';
  writeFileSync(join(dir, entry), '# entry\n');
  const r = security.createRecord(dir, { controlId: CONTROL_ID, assessment: 'observed', note: 'Synthetic observation only', reviewer: 'fixture-reviewer',
    sources: ['source.js', entry], artifacts: ['result.txt'] }, { apply: false });
  assert.ok(r);
});
