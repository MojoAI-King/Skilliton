#!/usr/bin/env node
// A synthetic local rehearsal. The final repository intentionally contains a defect.
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scripts = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(realpathSync(tmpdir()), 'skillgate-autopilot-demo-'));
function run(command, args, expected = 0) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, expected, `Expected exit ${expected}, received ${result.status}: ${result.stderr}`);
  return result.stdout;
}
const prepare = (...args) => run(process.execPath, [join(scripts, 'prepare.mjs'), '--dir', root, ...args]);
const evidence = (command, args = [], expected = 0) => run(process.execPath, [join(root, '.skillgate/bin/security-evidence.mjs'), command, '--dir', root, ...args], expected);
run('git', ['init', '--quiet']);
assert.match(prepare(), /DRY RUN/);
assert.deepEqual(readdirSync(root), ['.git']);
console.log('PASS: preview wrote no project files.');
prepare('--apply');
assert.match(prepare('--check'), /PREPARED/);
assert.match(prepare('--apply'), /0 file\(s\) changed/);
console.log('PASS: preparation installed records and runtime; repeat setup changed nothing.');
assert.match(evidence('status', [], 2), /0\/7 controls/);
console.log('PASS: new project reports 7 missing observations.');

mkdirSync(join(root, 'src'));
mkdirSync(join(root, '.skillgate/private-evidence'));
const source = join(root, 'src/access.mjs');
writeFileSync(source, "export const mayEdit = role => role === 'admin';\n");
writeFileSync(join(root, 'access.test.mjs'), "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { mayEdit } from './src/access.mjs';\ntest('editing requires the admin role', () => { assert.equal(mayEdit('admin'), true); assert.equal(mayEdit('viewer'), false); });\n");
writeFileSync(join(root, '.skillgate/private-evidence/access-pass.txt'), run(process.execPath, ['--test', 'access.test.mjs']));
evidence('record', ['--control', 'SG-SECURITY-TESTS', '--assessment', 'observed', '--source', 'src/access.mjs', '--source', 'access.test.mjs', '--artifact', '.skillgate/private-evidence/access-pass.txt', '--note', 'Synthetic role-check test passed for the two explicitly tested roles.', '--reviewer', 'demo-reviewer', '--apply']);
const records = join(root, '.skillgate/security/records');
const recordName = readdirSync(records).find(name => name.endsWith('.json'));
const original = readFileSync(join(records, recordName), 'utf8');
assert.match(evidence('status', ['--apply'], 2), /1\/7 controls/);
console.log('PASS: actual passing test evidence produced one current observation; six remain missing.');

writeFileSync(source, 'export const mayEdit = role => true;\n');
writeFileSync(join(root, '.skillgate/private-evidence/access-fail.txt'), run(process.execPath, ['--test', 'access.test.mjs'], 1));
const report = evidence('status', ['--apply'], 2);
assert.match(report, /SG-SECURITY-TESTS[^\n]*observed \| stale/);
assert.match(report, /0\/7 controls/);
assert.equal(readFileSync(join(records, recordName), 'utf8'), original);
console.log('PASS: introduced defect fails the application test; source drift makes the observation stale.');
console.log('PASS: the earlier observation was preserved byte-for-byte.');
console.log('Synthetic demo intentionally ends with a failing test and stale observation. No merge gate was installed.');
console.log(`Inspect the disposable repository: ${root}`);
