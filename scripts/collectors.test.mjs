#!/usr/bin/env node
// Acceptance tests for the evidence collectors: `skilliton security collect tests | secrets | delivery-policy`, run the
// way people run them (node scripts/skilliton.mjs security collect ..., and the shipped bin/skilliton for the mutation
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
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const cli = join(here, 'skilliton.mjs');
const pluginDir = join(repo, 'packs', 'base', 'plugins', 'workflow');
const BASELINE = join(pluginDir, 'catalogs', 'skillgate-baseline-2.json');
const STARTER = join(pluginDir, 'catalogs', 'skillgate-starter-1.json');
const SECURITY = '.skilliton/security';
const EVIDENCE = '.skilliton/private-evidence';
const DELIVERY = '.skilliton/delivery.json';
const DELIVERY_DRAFT = '.skilliton/delivery.draft.json';

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
  const env = { ...process.env, HOME: join(base, 'home'), SKILLITON_BACKUPS: join(base, 'backups'), GIT_CONFIG_NOSYSTEM: '1', ...extra };
  for (const name of ['SKILLITON_DEBUG', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_GLOBAL', 'XDG_CONFIG_HOME']) delete env[name];
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
const writePolicy = (dir, checks, extra = {}) => writeFileSync(join(dir, DELIVERY), JSON.stringify({ schema: 'skilliton.delivery/1', protectedBranches: ['main'], checks, policyPaths: [DELIVERY], ...extra }));
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
  assert.match(r.out, /sources to fingerprint: app\.js, \.skilliton\/delivery\.json/);
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
  assert.deepEqual([rec.assessment, rec.controlId, rec.reviewer], ['observed', 'SG-SECURITY-TESTS', 'skilliton collect tests']);
  assert.deepEqual(rec.sources.map((s) => s.path), ['app.js', DELIVERY]);
  assert.equal(rec.artifacts.length, 1);
  assert.match(rec.artifacts[0].path, /^\.skilliton\/private-evidence\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-tests\.txt$/);
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
    { name: 'missing program', command: ['skilliton-test-no-such-program'], timeoutSeconds: 30 },
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
  writeFileSync(join(dir, DELIVERY), JSON.stringify({ schema: 'skilliton.delivery/1', protectedBranches: ['main'], checks: [{ name: 'shell', command: 'npm test && echo ok' }] }));
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

test('N45: security status and the tests collector point at the same fix when the delivery policy is missing, and at delivery confirm once a draft exists', (t) => {
  const dir = project(t);
  const noDraftStatus = status(dir);
  assert.match(noDraftStatus.out, /Note: \.skilliton\/delivery\.json is missing, which the tests and delivery-policy collectors both need; write \.skilliton\/delivery\.json yourself \(the format is in: .* delivery --help\)\.$/m);
  const noDraftCollect = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(noDraftCollect.code, 2, noDraftCollect.out);
  assert.match(noDraftCollect.out, /NO_DELIVERY_POLICY.*write \.skilliton\/delivery\.json yourself/);

  writeFileSync(join(dir, DELIVERY_DRAFT), JSON.stringify({ schema: 'skilliton.delivery/1', protectedBranches: ['main'], checks: [] }));
  const withDraftStatus = status(dir);
  assert.match(withDraftStatus.out, /Note: \.skilliton\/delivery\.json is missing, which the tests and delivery-policy collectors both need; run: .* delivery confirm --apply\.$/m);
  const withDraftCollect = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(withDraftCollect.code, 2, withDraftCollect.out);
  assert.match(withDraftCollect.out, /NO_DELIVERY_POLICY.*delivery confirm --apply/);
  assert.deepEqual(evidenceFiles(dir), []);
  assert.deepEqual(records(dir), []);

  writePolicy(dir, [nodeCheck('ok', 'process.exit(0)')]);
  assert.equal(status(dir).out.includes('is missing'), false, 'the note disappears once the policy exists');
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
  assert.deepEqual([rec.assessment, rec.controlId, rec.reviewer], ['gap', 'SG-SECRETS-IN-SOURCE', 'skilliton collect secrets']);
  assert.match(rec.note, NOTE('secrets'));
  assert.equal(JSON.stringify(rec).includes('Z'.repeat(20)), false);
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(report, /^ {2}config\.js:1 known-token-prefix$/m);
  assert.match(report, /\.skilliton\/security\/catalog\.json \(an evidence engine file/);
  assert.match(readFileSync(join(dir, rec.sources[0].path), 'utf8'), /^# skilliton-file-manifest\/1\n/);
  for (const f of evidenceFiles(dir)) assert.equal(readFileSync(join(dir, EVIDENCE, f), 'utf8').includes('Z'.repeat(20)), false, `${f} holds no part of the key`);
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'gap', 'current'));
});

test('secrets collector: only generic shapes (a long encoded run such as a lockfile hash) record needs-human, not a gap', (t) => {
  const dir = project(t, { git: true });
  const digestLike = 'a1b2c3d4'.repeat(8);
  assert.match(digestLike, /[A-Za-z0-9+/_=-]{48,}/, 'positive control: the generic long-encoded-run rule matches it');
  writeFileSync(join(dir, 'lock.json'), `{ "integrity": "${digestLike}" }\n`);
  gitIn(dir, 'add', '.');
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  const [rec] = records(dir);
  assert.equal(rec.assessment, 'needs-human');
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(report, /^Result: needs-human \(only generic shapes matched/m);
  assert.match(report, /^ {2}lock\.json:1 long-encoded-run$/m);
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'needs-human', 'current'));
});

test('secrets collector: a clean repository records observed, and changing a scanned file makes it stale', (t) => {
  const dir = project(t, { git: true });
  writeFileSync(join(dir, '.gitignore'), '/.skilliton/private-evidence/\n');
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

// ---------------------------------------------------------------- secrets allowlist (N47)

const ALLOW = '.skilliton/security/secrets-allow.json';
const writeAllow = (dir, entries) => writeFileSync(join(dir, ALLOW), JSON.stringify(entries));

test('secrets allowlist: an entry allowed by line number moves the hit into Allowed with its reason, and the key is still never printed', (t) => {
  const dir = project(t, { git: true });
  const fakeKey = 'gh' + 'p_' + 'Y'.repeat(36);
  writeFileSync(join(dir, 'config.js'), `export const key = "${fakeKey}";\n`);
  gitIn(dir, 'add', '.');
  writeAllow(dir, [{ path: 'config.js', rule: 'known-token-prefix', line: 1, reason: 'synthetic test fixture, not a real key' }]);
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.includes(fakeKey), false);
  const [rec] = records(dir);
  assert.equal(rec.assessment, 'observed');
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.equal(report.includes(fakeKey), false);
  assert.match(report, /^Matches \(file:line rule; the matched text is never written\):\n {2}none$/m);
  assert.match(report, new RegExp(`^Allowed by ${ALLOW.replace(/\./g, '\\.')} .*:\\n {2}config\\.js:1 known-token-prefix: synthetic test fixture, not a real key$`, 'm'));
  const manifest = readFileSync(join(dir, rec.sources[0].path), 'utf8');
  assert.match(manifest, new RegExp(`${ALLOW.replace(/\./g, '\\.')}$`, 'm'), 'the allowlist file is one of the manifest lines, so editing it makes the record stale');
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'current'));
});

test('secrets allowlist: an entry allowed by sha256 of the matched line still allows it when the line number moves', (t) => {
  const dir = project(t, { git: true });
  const fakeKey = 'gh' + 'p_' + 'V'.repeat(36);
  const lineText = `export const key = "${fakeKey}";`;
  writeFileSync(join(dir, 'config.js'), `// a leading comment shifts the line number\n${lineText}\n`);
  gitIn(dir, 'add', '.');
  const sha256 = createHash('sha256').update(Buffer.from(lineText, 'latin1')).digest('hex');
  writeAllow(dir, [{ path: 'config.js', rule: 'known-token-prefix', sha256, reason: 'synthetic fixture, matched by content' }]);
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.includes(fakeKey), false);
  const [rec] = records(dir);
  assert.equal(rec.assessment, 'observed');
});

test('secrets allowlist: an unallowed specific hit is still a gap even while another line is allowed', (t) => {
  const dir = project(t, { git: true });
  const allowedKey = 'gh' + 'p_' + 'U'.repeat(36);
  const gapKey = 'gh' + 'p_' + 'T'.repeat(36);
  writeFileSync(join(dir, 'allowed.js'), `export const key = "${allowedKey}";\n`);
  writeFileSync(join(dir, 'leaked.js'), `export const key = "${gapKey}";\n`);
  gitIn(dir, 'add', '.');
  writeAllow(dir, [{ path: 'allowed.js', rule: 'known-token-prefix', line: 1, reason: 'synthetic fixture' }]);
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.includes(allowedKey), false);
  assert.equal(r.out.includes(gapKey), false);
  const [rec] = records(dir);
  assert.equal(rec.assessment, 'gap');
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(report, /^ {2}leaked\.js:1 known-token-prefix$/m);
  assert.doesNotMatch(report, /^ {2}allowed\.js:1 known-token-prefix$/m);
});

test('secrets allowlist: an entry that matches nothing this run is reported as unused', (t) => {
  const dir = project(t, { git: true });
  gitIn(dir, 'add', '.');
  writeAllow(dir, [{ path: 'app.js', rule: 'known-token-prefix', line: 5, reason: 'nothing here now' }]);
  const r = collect(dir, 'secrets', ['--apply']);
  assert.equal(r.code, 0, r.out);
  const [rec] = records(dir);
  const report = readFileSync(join(dir, rec.artifacts[0].path), 'utf8');
  assert.match(report, /^ {2}app\.js known-token-prefix \(line 5\): nothing here now$/m);
});

test('secrets allowlist: editing the file makes the secrets record stale', (t) => {
  const dir = project(t, { git: true });
  const fakeKey = 'gh' + 'p_' + 'W'.repeat(36);
  writeFileSync(join(dir, 'config.js'), `export const key = "${fakeKey}";\n`);
  gitIn(dir, 'add', '.');
  writeAllow(dir, [{ path: 'config.js', rule: 'known-token-prefix', line: 1, reason: 'synthetic fixture' }]);
  assert.equal(collect(dir, 'secrets', ['--apply']).code, 0);
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'current'));
  writeAllow(dir, [{ path: 'config.js', rule: 'known-token-prefix', line: 1, reason: 'a different reason now' }]);
  assert.match(status(dir).out, row('SG-SECRETS-IN-SOURCE', 'undecided', 'observed', 'stale'));
});

test('secrets allowlist: an invalid file refuses naming the entry index and field, and writes nothing', (t) => {
  const dir = project(t, { git: true });
  gitIn(dir, 'add', '.');
  const cases = [
    [{ path: 'app.js', rule: 'known-token-prefix', line: 1 }, /entry 0: is missing "reason"/],
    [{ path: 'app.js', rule: 'known-token-prefix', line: 1, reason: '' }, /entry 0: "reason" is empty/],
    [{ path: 'app.js', rule: 'known-token-prefix', line: 1, reason: 'ok', extra: true }, /entry 0: has an unknown key "extra"/],
    [{ path: '../outside', rule: 'known-token-prefix', line: 1, reason: 'ok' }, /entry 0: "path" is not a safe repository-relative path/],
    [{ path: 'app.js', rule: 'not-a-real-rule', line: 1, reason: 'ok' }, /entry 0: "rule" is not one of the secrets collector's rules/],
    [{ path: 'app.js', rule: 'known-token-prefix', reason: 'ok' }, /entry 0: needs a "line" or a "sha256" field/],
    [{ path: 'app.js', rule: 'known-token-prefix', line: 1, sha256: 'a'.repeat(64), reason: 'ok' }, /entry 0: cannot have both "line" and "sha256"/],
    [{ path: 'app.js', rule: 'known-token-prefix', line: 0, reason: 'ok' }, /entry 0: "line" is not a positive whole number/],
    [{ path: 'app.js', rule: 'known-token-prefix', sha256: 'not-hex', reason: 'ok' }, /entry 0: "sha256" is not a 64-character lowercase hex digest/],
  ];
  for (const [entry, pattern] of cases) {
    writeAllow(dir, [entry]);
    const r = collect(dir, 'secrets', ['--apply']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, pattern);
    assert.deepEqual(evidenceFiles(dir), []);
    assert.deepEqual(records(dir), []);
  }
  writeFileSync(join(dir, ALLOW), '{ not json');
  const badJson = collect(dir, 'secrets', ['--apply']);
  assert.equal(badJson.code, 2, badJson.out);
  assert.match(badJson.out, /INVALID_SECRETS_ALLOWLIST/);
  writeFileSync(join(dir, ALLOW), JSON.stringify({ not: 'an array' }));
  const notArray = collect(dir, 'secrets', ['--apply']);
  assert.equal(notArray.code, 2, notArray.out);
  assert.match(notArray.out, /does not hold a JSON array/);
});

// ---------------------------------------------------------------- delivery policy

test('delivery-policy collector: observed for checks and a protected branch, gap otherwise, and a changed policy is stale', (t) => {
  const dir = project(t);
  const latest = () => records(dir).at(-1);
  const preview = collect(dir, 'delivery-policy');
  assert.equal(preview.code, 0);
  assert.match(preview.out, /would record: gap \(there is no \.skilliton\/delivery\.json\)/);
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
  writeFileSync(join(dir, DELIVERY), JSON.stringify({ schema: 'skilliton.delivery/2', protectedBranches: ['main'], checks: [nodeCheck('unit', 'process.exit(0)')] }));
  assert.equal(collect(dir, 'delivery-policy', ['--apply']).code, 0);
  assert.match(latest().note, /"schema" is not "skilliton\.delivery\/1"/);

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
  writeFileSync(elsewhere, JSON.stringify({ schema: 'skilliton.delivery/1', protectedBranches: ['main'], checks: [nodeCheck('unit', 'process.exit(0)')] }));
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
  const mutant = spawnSync(join(copy, 'bin', 'skilliton'), ['security', 'collect', 'tests', '--dir', dir, '--source', 'app.js', '--apply'], {
    encoding: 'utf8', env: envFor(dir, { PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` }),
  });
  assert.equal(mutant.status, 0, mutant.stderr);
  assert.equal(records(dir)[0].assessment, 'observed', 'the mutant records observed for a failing check, so the gap assertion is able to fail');
  const real = collect(dir, 'tests', ['--source', 'app.js', '--apply']);
  assert.equal(real.code, 0, real.out);
  assert.deepEqual(records(dir).map((r) => r.assessment), ['observed', 'gap']);
});
