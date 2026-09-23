#!/usr/bin/env node
// security-record-refusals.test.mjs: `security record` (createRecord, packs/base/plugins/workflow/runtime/lib/security.mjs)
// names which of control, assessment, note, reviewer, sources or artifacts it refused, and which rule that field
// broke (empty, too long, surrounding spaces, control characters, looks like a secret, listed twice, not in the
// catalog), never the value itself. scripts/security-evidence.test.mjs already covers `security record` end to end
// and is pinned at its size (scripts/lint.test.mjs), so these cases live here.
//
// The command line's own front door (commands/security.mjs) already refuses an empty --note/--reviewer, a repeated
// --source/--artifact, and too many of either, before createRecord ever sees them, each with its own text. So most
// cases here call createRecord directly, the way scripts/security-evidence.test.mjs already imports the engine for
// its own internal checks; a handful of tests at the end run the real `skilliton security record` to prove the
// detail still reaches its printed refusal for the fields the command does not pre-filter.
//
// Every test works in its own temporary folder under the system temp folder, removed afterwards. Secret-shaped and
// control-character strings are built at runtime, never written as literals.
//
//   node --test scripts/security-record-refusals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const cli = join(here, 'skilliton.mjs');
const pluginDir = join(repo, 'packs', 'base', 'plugins', 'workflow');
const security = await import(pathToFileURL(join(pluginDir, 'runtime', 'lib', 'security.mjs')).href);
const SECURITY = '.skilliton/security';
const CONTROL_ID = 'DEMO-ACCESS';

const catalog = () => ({
  schemaVersion: 1, catalogVersion: 'demo-1',
  controls: [{ id: CONTROL_ID, title: 'Synthetic access observation',
    mappings: [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }],
    expectedEvidence: ['Source and synthetic check output'] }],
});

function project(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-record-refusals-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify(catalog()));
  writeFileSync(join(dir, 'source.js'), 'export const synthetic = true;\n');
  writeFileSync(join(dir, 'result.txt'), 'synthetic output\n');
  return dir;
}
const validInput = () => ({ controlId: CONTROL_ID, assessment: 'observed', note: 'Synthetic observation only', reviewer: 'fixture-reviewer', sources: ['source.js'], artifacts: ['result.txt'] });

// Calls createRecord with one field patched away from a known-good input, and returns the SecurityRefusal so each
// test can look at its own field of interest without repeating the throw/catch boilerplate.
function refused(t, patch) {
  const dir = project(t);
  const input = { ...validInput(), ...patch };
  try {
    security.createRecord(dir, input, { apply: true });
  } catch (e) {
    assert.ok(e instanceof security.SecurityRefusal, 'a SecurityRefusal, not some other error');
    assert.equal(e.code, 'INVALID_RECORD_INPUT');
    return e;
  }
  assert.fail('expected createRecord to refuse');
  return null;
}

test('control: not in the catalog, and the supplied id is never echoed', (t) => {
  const e = refused(t, { controlId: 'NOT-A-REAL-CONTROL' });
  assert.equal(e.detail, 'control: not in the catalog');
  assert.equal(e.detail.includes('NOT-A-REAL-CONTROL'), false);
});

test('assessment: not observed, gap or needs-human, and the supplied value is never echoed', (t) => {
  const e = refused(t, { assessment: 'maybe-a-gap' });
  assert.equal(e.detail, 'assessment: not observed, gap or needs-human');
  assert.equal(e.detail.includes('maybe-a-gap'), false);
});

test('note: every text-field rule is named, and the value is never echoed', (t) => {
  const long = 'x'.repeat(1001);
  const secretLike = 'token=' + 'x'.repeat(32);
  const controlChar = `two${String.fromCharCode(1)}lines`;
  const cases = [
    ['', 'empty'],
    [long, 'too long'],
    [' leading space', 'surrounding spaces'],
    [controlChar, 'control characters'],
    [secretLike, 'looks like a secret'],
  ];
  for (const [value, rule] of cases) {
    const e = refused(t, { note: value });
    assert.equal(e.detail, `note: ${rule}`);
    if (value) assert.equal(e.detail.includes(value), false);
  }
});

test('reviewer: every text-field rule is named, and the value is never echoed', (t) => {
  const long = 'x'.repeat(121);
  const secretLike = 'gh' + 'p_' + 'x'.repeat(36);
  const controlChar = `two${String.fromCharCode(2)}names`;
  const cases = [
    ['', 'empty'],
    [long, 'too long'],
    ['trailing space ', 'surrounding spaces'],
    [controlChar, 'control characters'],
    [secretLike, 'looks like a secret'],
  ];
  for (const [value, rule] of cases) {
    const e = refused(t, { reviewer: value });
    assert.equal(e.detail, `reviewer: ${rule}`);
    if (value) assert.equal(e.detail.includes(value), false);
  }
});

test('sources: not a list, listed twice, too many files, and a bad path/sha256 fingerprint', (t) => {
  assert.equal(refused(t, { sources: 'source.js' }).detail, 'sources: not a list');
  assert.equal(refused(t, { sources: ['source.js', 'source.js'] }).detail, 'sources: listed twice');
  const tooMany = Array.from({ length: security.LIMIT.attachments + 1 }, (_, i) => `f${i}.js`);
  assert.equal(refused(t, { sources: tooMany }).detail, `sources: more than ${security.LIMIT.attachments} files`);
  assert.equal(refused(t, { sources: [{ path: 'source.js' }] }).detail, 'sources: not a valid path/sha256 fingerprint');
  assert.equal(refused(t, { sources: [{ path: 'source.js', sha256: 'not-hex' }] }).detail, 'sources: not a valid path/sha256 fingerprint');
});

test('artifacts: not a list, listed twice, too many files, and a bad path/sha256 fingerprint', (t) => {
  assert.equal(refused(t, { artifacts: 'result.txt' }).detail, 'artifacts: not a list');
  assert.equal(refused(t, { artifacts: ['result.txt', 'result.txt'] }).detail, 'artifacts: listed twice');
  const tooMany = Array.from({ length: security.LIMIT.attachments + 1 }, (_, i) => `f${i}.txt`);
  assert.equal(refused(t, { artifacts: tooMany }).detail, `artifacts: more than ${security.LIMIT.attachments} files`);
  assert.equal(refused(t, { artifacts: [{ path: 'result.txt' }] }).detail, 'artifacts: not a valid path/sha256 fingerprint');
});

// ---------------------------------------------------------------- end to end, through `skilliton security record`

function envFor(dir) {
  const env = { ...process.env, HOME: join(dirname(dir), 'home') };
  delete env.SKILLITON_DEBUG;
  return env;
}
function record(dir, ...args) {
  const p = spawnSync(process.execPath, [cli, 'security', 'record', '--dir', dir, ...args, '--apply'], { encoding: 'utf8', timeout: 30000, env: envFor(dir) });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr };
}
const OBSERVATION = ['--control', CONTROL_ID, '--assessment', 'observed', '--source', 'source.js', '--artifact', 'result.txt', '--note', 'Synthetic observation only', '--reviewer', 'fixture-reviewer'];

test('security record (the real command): a bad control names "control: not in the catalog" and writes nothing', (t) => {
  const dir = project(t);
  const args = [...OBSERVATION]; args[args.indexOf('--control') + 1] = 'NOT-A-REAL-CONTROL';
  const r = record(dir, ...args);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /control: not in the catalog/);
  assert.equal(r.out.includes('NOT-A-REAL-CONTROL'), false);
  assert.match(r.out, /Nothing was written/);
});

test('security record (the real command): a bad assessment names "assessment: ..." and writes nothing', (t) => {
  const dir = project(t);
  const args = [...OBSERVATION]; args[args.indexOf('--assessment') + 1] = 'maybe-a-gap';
  const r = record(dir, ...args);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /assessment: not observed, gap or needs-human/);
  assert.equal(r.out.includes('maybe-a-gap'), false);
});

test('security record (the real command): a secret-shaped note names "note: looks like a secret" and writes nothing', (t) => {
  const dir = project(t);
  const secretLike = 'gh' + 'p_' + 'z'.repeat(36);
  const args = [...OBSERVATION]; args[args.indexOf('--note') + 1] = secretLike;
  const r = record(dir, ...args);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /note: looks like a secret/);
  assert.equal(r.out.includes(secretLike), false);
  assert.match(r.out, /Nothing was written/);
});
