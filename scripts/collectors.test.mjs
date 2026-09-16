#!/usr/bin/env node
// Acceptance tests for the evidence collectors: `skillgate security collect tests | secrets | delivery-policy`, run the
// way people run them (node scripts/skillgate.mjs security collect ..., and the shipped bin/skillgate for the mutation
// check). docs/CONTRACTS.md sections 12 and 14 are the contract.
//
// Every test works in its own temporary folder under the system temp folder, removed afterwards, with HOME and the
// backup folder inside it. Checks are small node programs. The secrets tests use git in a throwaway repository.
// Secret-shaped strings are built at runtime, never written as literals.
//
//   node --test scripts/collectors.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const cli = join(here, 'skillgate.mjs');
const pluginDir = join(repo, 'packs', 'base', 'plugins', 'workflow');
const BASELINE = join(pluginDir, 'catalogs', 'skillgate-baseline-2.json');
const STARTER = join(pluginDir, 'catalogs', 'skillgate-starter-1.json');
const SECURITY = '.skillgate/security';
const EVIDENCE = '.skillgate/private-evidence';
const DELIVERY = '.skillgate/delivery.json';

const bases = [];
const baseOf = (dir) => bases.find((b) => dir === b || dir.startsWith(`${b}/`));

// A project with the shipped baseline-2 catalog, inside the test's own temporary folder.
function project(t, { git = false, catalog = BASELINE } = {}) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'collectors-'));
  bases.push(base);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), readFileSync(catalog));
  writeFileSync(join(dir, 'app.js'), 'export const answer = 42;\n');
  if (git) gitIn(dir, 'init', '-q');
  return dir;
}
function envFor(dir, extra = {}) {
  const base = baseOf(dir);
  const env = { ...process.env, HOME: join(base, 'home'), SKILLGATE_BACKUPS: join(base, 'backups'), GIT_CONFIG_NOSYSTEM: '1', ...extra };
  for (const name of ['SKILLGATE_DEBUG', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_GLOBAL', 'XDG_CONFIG_HOME']) delete env[name];
  return env;
}
function gitIn(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: envFor(dir) });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
function sg(dir, args, extra = {}) {
  const p = spawnSync(process.execPath, [cli, 'security', ...args], { encoding: 'utf8', timeout: 90000, env: envFor(dir, extra) });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr, stdout: p.stdout };
}
const collect = (dir, name, args = [], extra = {}) => sg(dir, ['collect', name, '--dir', dir, ...args], extra);
const status = (dir) => sg(dir, ['status', '--dir', dir]);
const records = (dir) => {
  const folder = join(dir, SECURITY, 'records');
  return existsSync(folder) ? readdirSync(folder).map((f) => JSON.parse(readFileSync(join(folder, f), 'utf8'))).sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : 1)) : [];
};
const evidenceFiles = (dir) => (existsSync(join(dir, EVIDENCE)) ? readdirSync(join(dir, EVIDENCE)).sort() : []);
const writePolicy = (dir, checks, extra = {}) => writeFileSync(join(dir, DELIVERY), JSON.stringify({ schema: 'skillgate.delivery/1', protectedBranches: ['main'], checks, policyPaths: [DELIVERY], ...extra }));
const nodeCheck = (name, code, timeoutSeconds = 60) => ({ name, command: [process.execPath, '-e', code], timeoutSeconds });
const row = (controlId, applies, assessment, freshness) => new RegExp(`\\| ${controlId} \\| [^|]+ \\| ${applies} \\| ${assessment} \\| ${freshness} \\|`);
const NOTE = (collector) => new RegExp(`^Collector: ${collector} version 1 \\(workflow plugin (\\d+\\.\\d+\\.\\d+|version unreadable)\\); node v\\d+\\.\\d+\\.\\d+; git (\\S.*|not found)\\. `);

// ---------------------------------------------------------------- tests

test('tests collector: the preview runs nothing and writes nothing', (t) => {
  const dir = project(t);
  const marker = join(baseOf(dir), 'check-ran');
  writePolicy(dir, [nodeCheck('writes a marker', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)]);
  const r = collect(dir, 'tests', ['--source', 'app.js']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /preview: nothing is run or written/);
  assert.match(r.out, /1\. writes a marker: \S+ with 2 argument\(s\), timeout 60s/);
  assert.match(r.out, /sources to fingerprint: app\.js, \.skillgate\/delivery\.json/);
  assert.equal(existsSync(marker), false);
  assert.deepEqual(evidenceFiles(dir), []);
  assert.deepEqual(records(dir), []);
});

test('tests collector: passing checks record observed with the saved output, the collector, its version and tool versions', (t) => {
  const dir = project(t);
  writePolicy(dir, [nodeCheck('unit', "console.log('unit output line')"), nodeCheck('lint', "console.error('lint output line')")]);
  const r = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Checks: 2 of 2 passed/);
  assert.equal(r.out.includes('unit output line'), false, 'check output is saved, not printed');
  const [rec] = records(dir);
  assert.deepEqual([rec.assessment, rec.controlId, rec.reviewer], ['observed', 'SG-SECURITY-TESTS', 'skillgate collect tests']);
  assert.deepEqual(rec.sources.map((s) => s.path), ['app.js', DELIVERY]);
  assert.equal(rec.artifacts.length, 1);
  assert.match(rec.artifacts[0].path, /^\.skillgate\/private-evidence\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-tests\.txt$/);
  assert.match(rec.note, NOTE('tests'));
  assert.ok(rec.note.includes(`node ${process.version};`));
  assert.match(rec.note, /All 2 checks passed: unit, lint\./);
  const output = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(output, /unit output line/);
  assert.match(output, /lint output line/);
  assert.match(output, /--- result: passed \(exit 0\)/);
  assert.match(status(dir).out, row('SG-SECURITY-TESTS', 'undecided', 'observed', 'current'));
});

test('tests collector: a failing command records gap, and findings pick it up', (t) => {
  const dir = project(t);
  writePolicy(dir, [
    nodeCheck('passes', 'process.exit(0)'),
    nodeCheck('fails', "console.log('boom'); process.exit(7)"),
    { name: 'missing program', command: ['skillgate-test-no-such-program'], timeoutSeconds: 30 },
  ]);
  const r = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Checks: 1 of 3 passed/);
  assert.match(r.out, /failed \(exit 7\)/);
  assert.match(r.out, /the program was not found/);
  const [rec] = records(dir);
  assert.equal(rec.assessment, 'gap');
  assert.match(rec.note, /2 of 3 checks did not pass: fails \(failed \(exit 7\)\), missing program \(the program was not found\)\./);
  const output = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(output, /boom/);
  assert.match(output, /--- result: failed \(exit 7\)/);
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'BACKLOG.md'), '# Backlog\n');
  assert.equal(sg(dir, ['findings', '--dir', dir, '--apply']).code, 0);
  assert.match(readFileSync(join(dir, 'docs', 'BACKLOG.md'), 'utf8'), /\| SEC-SG-SECURITY-TESTS \| [^|]+ \| gap; applicability undecided \|/);
});

test('tests collector: a check that runs past its timeout is stopped and recorded as gap', (t) => {
  const dir = project(t);
  writePolicy(dir, [nodeCheck('hangs', 'setInterval(() => {}, 1000)', 1)]);
  const started = Date.now();
  const r = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(r.code, 0, r.out);
  assert.ok(Date.now() - started < 30000, 'the check was stopped at its timeout');
  assert.match(r.out, /timed out after 1s and was stopped/);
  assert.equal(records(dir)[0].assessment, 'gap');
});

test('tests collector: refuses without --source, a policy, an argument-list command, checks or a known control, and records nothing', (t) => {
  const dir = project(t);
  const refused = (args, code, pattern) => {
    const r = collect(dir, 'tests', [...args, '--apply']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, pattern);
    return r;
  };
  refused([], 2, /SOURCE_REQUIRED/);
  refused(['--source', 'app.js'], 2, /NO_DELIVERY_POLICY/);
  writeFileSync(join(dir, DELIVERY), JSON.stringify({ schema: 'skillgate.delivery/1', protectedBranches: ['main'], checks: [{ name: 'shell', command: 'npm test && echo ok' }] }));
  refused(['--source', 'app.js'], 2, /INVALID_DELIVERY_POLICY.*a shell string is not accepted/);
  writeFileSync(join(dir, DELIVERY), '{ not json');
  refused(['--source', 'app.js'], 2, /INVALID_DELIVERY_POLICY.*not valid JSON/);
  writePolicy(dir, []);
  refused(['--source', 'app.js'], 2, /NO_DELIVERY_CHECKS/);
  writePolicy(dir, [nodeCheck('ok', 'process.exit(0)')]);
  const unknown = refused(['--source', 'app.js', '--control', 'NOT-A-CONTROL'], 2, /UNKNOWN_CONTROL/);
  assert.equal(unknown.out.includes('NOT-A-CONTROL'), false);
  refused(['--source', '../outside.js'], 2, /UNSAFE_PATH/);
  refused(['--source', 'missing.js'], 2, /MISSING_FILE/);
  refused(['--source', '.env'], 2, /SENSITIVE_PATH/);
  const wrong = collect(dir, 'secrets', ['--source', 'app.js', '--apply']);
  assert.equal(wrong.code, 2);
  assert.match(wrong.out, /--source applies only to "security collect tests"/);
  writeFileSync(join(dir, SECURITY, 'catalog.json'), '{');
  refused(['--source', 'app.js'], 2, /MALFORMED_JSON/);
  assert.deepEqual(evidenceFiles(dir), []);
  assert.deepEqual(records(dir), []);
});

test('tests collector: a source changed by a check leaves the new observation stale and says so', (t) => {
  const dir = project(t);
  writePolicy(dir, [nodeCheck('rewrites app.js', "require('fs').appendFileSync('app.js', '// touched by the check')")]);
  const r = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN: app\.js changed while the checks ran/);
  assert.equal(records(dir)[0].assessment, 'observed');
  assert.match(status(dir).out, row('SG-SECURITY-TESTS', 'undecided', 'observed', 'stale'));
});

test('tests collector: a changed delivery policy makes the observation stale', (t) => {
  const dir = project(t);
  writePolicy(dir, [nodeCheck('unit', 'process.exit(0)')]);
  assert.equal(collect(dir, 'tests', ['--source', 'app.js', '--apply']).code, 0);
  assert.match(status(dir).out, row('SG-SECURITY-TESTS', 'undecided', 'observed', 'current'));
  writePolicy(dir, [nodeCheck('unit', 'process.exit(0)'), nodeCheck('added later', 'process.exit(1)')]);
  assert.match(status(dir).out, row('SG-SECURITY-TESTS', 'undecided', 'observed', 'stale'));
});

// ---------------------------------------------------------------- secrets

test('secrets collector: a runtime-built fake key records gap, and the key is never printed or saved', (t) => {
  const dir = project(t, { git: true });
  const fakeKey = 'gh' + 'p_' + 'Z'.repeat(36);
  assert.match(fakeKey, /\bgh[pousr]_[A-Za-z0-9_-]{12,}/, 'positive control: the fake key has the shape the rule looks for');
  writeFileSync(join(dir, 'config.js'), `export const key = "${fakeKey}";\n`);
  gitIn(dir, 'add', '.');
  const preview = collect(dir, 'secrets');
  assert.equal(preview.code, 0, preview.out);
  assert.match(preview.out, /tracked files to scan: 3/);
  assert.deepEqual(evidenceFiles(dir), []);
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.includes(fakeKey), false);
  assert.equal(r.out.includes('Z'.repeat(20)), false);
  assert.match(r.out, /Lines matching a secret shape: 1 in 1 file\(s\) \(known-token-prefix 1\)/);
  const [rec] = records(dir);
  assert.deepEqual([rec.assessment, rec.controlId, rec.reviewer], ['gap', 'SG-SECRETS-IN-SOURCE', 'skillgate collect secrets']);
  assert.match(rec.note, NOTE('secrets'));
  assert.equal(JSON.stringify(rec).includes('Z'.repeat(20)), false);
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(report, /^ {2}config\.js:1 known-token-prefix$/m);
  assert.match(report, /\.skillgate\/security\/catalog\.json \(an evidence engine file/);
  assert.match(readFileSync(join(dir, rec.sources[0].path), 'utf8'), /^# skillgate-file-manifest\/1\n/);
  for (const f of evidenceFiles(dir)) assert.equal(readFileSync(join(dir, EVIDENCE, f), 'utf8').includes('Z'.repeat(20)), false, `${f} holds no part of the key`);
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'gap', 'current'));
});

test('secrets collector: a clean repository records observed, and changing a scanned file makes it stale', (t) => {
  const dir = project(t, { git: true });
  writeFileSync(join(dir, '.gitignore'), '/.skillgate/private-evidence/\n');
  writeFileSync(join(dir, 'image.bin'), Buffer.from([0, 1, 2, 3, 4]));
  gitIn(dir, 'add', '.');
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /WARN: git does not ignore/);
  assert.match(r.out, /Scanned 2 of 4 tracked file\(s\) as text; 2 not scanned/);
  const [rec] = records(dir);
  assert.equal(rec.assessment, 'observed');
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(report, /image\.bin \(binary/);
  assert.match(report, /Lines matching a rule: 0\./);
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'current'));
  writeFileSync(join(dir, 'app.js'), 'export const answer = 4242;\n');
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'stale'));
  writeFileSync(join(dir, 'app.js'), 'export const answer = 42;\n');
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'current'), 'the manifest compares content, not only modification times');
  rmSync(join(dir, '.gitignore'));
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'stale'), 'a scanned file that disappears makes it stale');
});

test('secrets collector: refuses outside a repository root or when the catalog lacks its control, fails plainly without git, and records nothing', (t) => {
  const plain = project(t);
  const notRepo = collect(plain, 'secrets', ['--apply']);
  assert.equal(notRepo.code, 2, notRepo.out);
  assert.match(notRepo.out, /NOT_A_GIT_REPOSITORY/);

  const dir = project(t, { git: true });
  gitIn(dir, 'add', '.');
  const sub = join(dir, 'sub');
  mkdirSync(join(sub, SECURITY), { recursive: true });
  writeFileSync(join(sub, SECURITY, 'catalog.json'), readFileSync(BASELINE));
  const nested = collect(sub, 'secrets', ['--apply']);
  assert.equal(nested.code, 2, nested.out);
  assert.match(nested.out, /NOT_REPOSITORY_ROOT/);

  const noGit = collect(dir, 'secrets', ['--apply'], { PATH: join(baseOf(dir), 'empty-path') });
  assert.equal(noGit.code, 3, noGit.out);
  assert.match(noGit.out, /operation failed \(GIT_NOT_FOUND\)/);

  const starter = project(t, { git: true, catalog: STARTER });
  gitIn(starter, 'add', '.');
  const lacking = collect(starter, 'secrets', ['--apply']);
  assert.equal(lacking.code, 2, lacking.out);
  assert.match(lacking.out, /UNKNOWN_CONTROL.*SG-SECRETS-IN-SOURCE, is not in catalog skillgate-starter-1/);

  for (const folder of [plain, dir, sub, starter]) {
    assert.deepEqual(evidenceFiles(folder), []);
    assert.deepEqual(records(folder), []);
  }
});

// ---------------------------------------------------------------- delivery policy

test('delivery-policy collector: observed for checks and a protected branch, gap otherwise, and a changed policy is stale', (t) => {
  const dir = project(t);
  const latest = () => records(dir).at(-1);
  const preview = collect(dir, 'delivery-policy');
  assert.equal(preview.code, 0);
  assert.match(preview.out, /would record: gap \(there is no \.skillgate\/delivery\.json\)/);
  assert.deepEqual(records(dir), []);

  assert.equal(collect(dir, 'delivery-policy', ['--apply']).code, 0);
  assert.deepEqual([latest().assessment, latest().controlId, latest().sources.length], ['gap', 'SG-CHECK-CRITERIA', 0]);
  writePolicy(dir, []);
  assert.equal(collect(dir, 'delivery-policy', ['--apply']).code, 0);
  assert.equal(latest().assessment, 'gap');
  assert.match(latest().note, /no checks are defined/);
  writePolicy(dir, [nodeCheck('unit', 'process.exit(0)')], { protectedBranches: [] });
  assert.equal(collect(dir, 'delivery-policy', ['--apply']).code, 0);
  assert.match(latest().note, /no protected branch is named/);
  writeFileSync(join(dir, DELIVERY), JSON.stringify({ schema: 'skillgate.delivery/2', protectedBranches: ['main'], checks: [nodeCheck('unit', 'process.exit(0)')] }));
  assert.equal(collect(dir, 'delivery-policy', ['--apply']).code, 0);
  assert.match(latest().note, /"schema" is not "skillgate\.delivery\/1"/);

  writePolicy(dir, [nodeCheck('unit', 'process.exit(0)')]);
  const r = collect(dir, 'delivery-policy', ['--apply']);
  assert.equal(r.code, 0, r.out);
  const rec = latest();
  assert.equal(rec.assessment, 'observed');
  assert.match(rec.note, NOTE('delivery-policy'));
  assert.deepEqual(rec.sources.map((s) => s.path), [DELIVERY]);
  assert.match(readFileSync(join(dir, rec.artifacts[0].path), 'utf8'), /Checks defined: 1 \(unit\)\nProtected branches: main/);
  assert.match(status(dir).out, row('SG-CHECK-CRITERIA', 'undecided', 'observed', 'current'));
  writePolicy(dir, [nodeCheck('unit', 'process.exit(0)'), nodeCheck('lint', 'process.exit(0)')]);
  assert.match(status(dir).out, row('SG-CHECK-CRITERIA', 'undecided', 'observed', 'stale'));
});

test('delivery-policy collector: a symlinked policy is refused by every collector that reads it, and nothing is recorded', (t) => {
  const dir = project(t);
  const elsewhere = join(baseOf(dir), 'elsewhere.json');
  writeFileSync(elsewhere, JSON.stringify({ schema: 'skillgate.delivery/1', protectedBranches: ['main'], checks: [nodeCheck('unit', 'process.exit(0)')] }));
  symlinkSync(elsewhere, join(dir, DELIVERY));
  for (const [name, args] of [['delivery-policy', []], ['tests', ['--source', 'app.js']]]) {
    const r = collect(dir, name, [...args, '--apply']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /SYMLINK_REFUSED/);
  }
  assert.deepEqual(evidenceFiles(dir), []);
  assert.deepEqual(records(dir), []);
});

// ---------------------------------------------------------------- mutation check

test('mutation check: a tests collector that ignores exit codes is caught by the gap assertion', (t) => {
  const dir = project(t);
  const copy = join(baseOf(dir), 'mutant', 'workflow');
  cpSync(pluginDir, copy, { recursive: true });
  const file = join(copy, 'runtime', 'lib', 'collectors.mjs');
  const target = 'ok: !timedOut && !interrupted && code === 0,';
  const text = readFileSync(file, 'utf8');
  assert.equal(text.split(target).length, 2, 'the mutation target is in the collector exactly once');
  writeFileSync(file, text.replace(target, 'ok: !timedOut && !interrupted,'));
  writePolicy(dir, [nodeCheck('fails', 'process.exit(1)')]);
  const mutant = spawnSync(join(copy, 'bin', 'skillgate'), ['security', 'collect', 'tests', '--dir', dir, '--source', 'app.js', '--apply'], {
    encoding: 'utf8', env: envFor(dir, { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` }),
  });
  assert.equal(mutant.status, 0, mutant.stderr);
  assert.equal(records(dir)[0].assessment, 'observed', 'the mutant records observed for a failing check, so the gap assertion is able to fail');
  const real = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(real.code, 0, real.out);
  assert.deepEqual(records(dir).map((r) => r.assessment), ['observed', 'gap']);
});
