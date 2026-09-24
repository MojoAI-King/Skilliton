#!/usr/bin/env node
// security-findings.test.mjs: security findings live in their own file (backlog B78). `skilliton security findings`
// writes the project's findings file (security.findingsFile in .skilliton/config.json, default
// docs/SECURITY_FINDINGS.md; Kind: Reference; generated between the two marker lines), and the backlog record keeps
// between its own markers one line: a link to that file with the count of open findings. Migration
// 0004-security-findings-file (lib/migrations-findings.mjs) moves a section an earlier release wrote into the backlog
// out into the new file, with a receipt, and a second run changes nothing.
//
//   node scripts/security-findings.test.mjs
//
// Each test works in its own temporary folder, removed afterwards, with HOME and the backup folder inside it. Nothing
// here reads or writes this repository's own docs/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'skilliton.mjs');
const PLUGIN = join(here, '..', 'packs', 'base', 'plugins', 'workflow');
const lib = (name) => import(pathToFileURL(join(PLUGIN, 'runtime', 'lib', name)).href);
const engine = await lib('security.mjs');
const { migrationById, planMigration, applyMigration } = await lib('migrations.mjs');
const { loadProject, resolveGitRoot } = await lib('prepare.mjs');
const RUNTIME = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const SECURITY = '.skilliton/security';
const START = '<!-- skilliton:security-findings:start -->';
const END = '<!-- skilliton:security-findings:end -->';
const ID = '0004-security-findings-file';

const mapping = [{ framework: 'Demo', version: '1', reference: 'A.1', url: 'https://example.invalid/requirements', relationship: 'related' }];
const control = (id) => ({ id, title: `Synthetic ${id.toLowerCase()} observation`, mappings: mapping, expectedEvidence: ['A synthetic observation'] });

function fixture(t, { config = {}, backlog = '# Backlog\n\nKind: Living.\n\n- [ ] a human item\n' } = {}) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'security-findings-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'demo-1', controls: [control('DEMO-ACCESS'), control('DEMO-REVIEW')] }));
  const decisions = ['DEMO-ACCESS', 'DEMO-REVIEW'].map((id) => ({ controlId: id, applies: true, rationale: 'Synthetic fixture decision', decidedBy: 'fixture-owner', decidedAt: '2020-01-01T00:00:00.000Z' }));
  writeFileSync(join(dir, SECURITY, 'applicability.json'), JSON.stringify({ schemaVersion: 1, decisions }));
  writeFileSync(join(dir, '.skilliton', 'config.json'), JSON.stringify({ prepare: { version: 3, requires: { workflow: RUNTIME } }, ...config }));
  if (backlog !== null) writeFileSync(join(dir, 'docs', 'BACKLOG.md'), backlog);
  return dir;
}

function run(dir, ...args) {
  const env = { ...process.env, HOME: join(dirname(dir), 'home'), SKILLITON_BACKUPS: join(dirname(dir), 'backups') };
  delete env.SKILLITON_DEBUG;
  const p = spawnSync(process.execPath, [cli, ...args, '--dir', dir], { encoding: 'utf8', timeout: 30000, env });
  assert.equal(p.signal, null);
  return { code: p.status, out: p.stdout + p.stderr };
}

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const between = (text) => text.slice(text.indexOf(START) + START.length, text.indexOf(END)).split(/\r?\n/).slice(1, -1);

test('the write: rows go to docs/SECURITY_FINDINGS.md, the backlog keeps one linking line, and a rerun changes nothing', (t) => {
  const dir = fixture(t);
  const first = run(dir, 'security', 'findings', '--apply');
  assert.equal(first.code, 0, first.out);
  assert.match(first.out, /Created docs\/SECURITY_FINDINGS\.md/);
  const file = read(dir, 'docs/SECURITY_FINDINGS.md');
  assert.match(file, /^# Security findings\n\nKind: Reference\.\n\n<!-- skilliton:security-findings:start -->\n## Open findings\n/);
  assert.match(file, /\| SEC-DEMO-ACCESS \| Synthetic demo-access observation \| missing \| record an assessment or run a collector \|\n/);
  assert.ok(file.indexOf('SEC-DEMO-ACCESS') < file.indexOf('SEC-DEMO-REVIEW'));
  const backlog = read(dir, 'docs/BACKLOG.md');
  assert.ok(backlog.startsWith('# Backlog\n\nKind: Living.\n\n- [ ] a human item\n'), 'the human text is kept');
  assert.deepEqual(between(backlog), ['Security findings: 2 open, listed in [docs/SECURITY\\_FINDINGS.md](SECURITY_FINDINGS.md) (generated by skilliton security findings; do not edit between these markers).']);
  assert.doesNotMatch(backlog, /SEC-DEMO/);
  const again = run(dir, 'security', 'findings', '--apply');
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /already up to date \(2 open finding\(s\)\)/);
  assert.equal(read(dir, 'docs/BACKLOG.md'), backlog);
  assert.equal(read(dir, 'docs/SECURITY_FINDINGS.md'), file);
});

test('the backlog line: an old section in the backlog is replaced by the link, and text outside the markers in both files stays', (t) => {
  const old = `# Backlog\r\n\r\n${START}\r\n## Security findings\r\n\r\n| ID | Control | State | Next step |\r\n| --- | --- | --- | --- |\r\n| SEC-X | x | missing | y |\r\n${END}\r\n\r\n## Later notes\r\n`;
  const dir = fixture(t, { backlog: old });
  writeFileSync(join(dir, 'docs', 'SECURITY_FINDINGS.md'), '# Security findings\n\nKind: Reference.\n\nA person wrote this.\n');
  assert.equal(run(dir, 'security', 'findings', '--apply').code, 0);
  const backlog = read(dir, 'docs/BACKLOG.md');
  assert.ok(backlog.startsWith(`# Backlog\r\n\r\n${START}\r\nSecurity findings: 2 open, listed in `), backlog);
  assert.ok(backlog.endsWith(`${END}\r\n\r\n## Later notes\r\n`));
  assert.equal(between(backlog).length, 1);
  const file = read(dir, 'docs/SECURITY_FINDINGS.md');
  assert.ok(file.startsWith('# Security findings\n\nKind: Reference.\n\nA person wrote this.\n\n<!-- skilliton:security-findings:start -->\n'));
  assert.equal(file.split(START).length - 1, 1);
});

test('security.findingsFile names another file; an unsafe name or a missing folder is refused and nothing is written', (t) => {
  const dir = fixture(t, { config: { security: { findingsFile: 'reports/FINDINGS.md' } } });
  mkdirSync(join(dir, 'reports'));
  assert.equal(run(dir, 'security', 'findings', '--apply').code, 0);
  assert.match(read(dir, 'reports/FINDINGS.md'), /SEC-DEMO-REVIEW/);
  assert.match(read(dir, 'docs/BACKLOG.md'), /listed in \[reports\/FINDINGS\.md\]\(\.\.\/reports\/FINDINGS\.md\)/);
  assert.equal(existsSync(join(dir, 'docs', 'SECURITY_FINDINGS.md')), false);
  for (const bad of ['../outside.md', 'docs/findings.txt', 'docs/BACKLOG.md']) {
    const refusedDir = fixture(t, { config: { security: { findingsFile: bad } } });
    const r = run(refusedDir, 'security', 'findings', '--apply');
    assert.equal(r.code, 2, r.out);
    // Refused either when the config is read (security.findingsFile names the setting) or by the writer (UNSAFE_PATH):
    // the backlog record itself passes the config's shape rule and is refused by the writer, which knows the artifacts.
    assert.match(r.out, /UNSAFE_PATH|security\.findingsFile must be a repository-relative \.md path/);
    assert.equal(r.out.includes(bad), false, 'the value is never echoed');
  }
  const missingFolder = fixture(t, { config: { security: { findingsFile: 'nowhere/FINDINGS.md' } } });
  const r = run(missingFolder, 'security', 'findings', '--apply');
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /the folder of the findings file does not exist/);
  assert.equal(read(missingFolder, 'docs/BACKLOG.md'), '# Backlog\n\nKind: Living.\n\n- [ ] a human item\n');
});

test('the preview writes nothing, and a file changed after the plan stops the whole write', (t) => {
  const dir = fixture(t);
  const preview = run(dir, 'security', 'findings');
  assert.equal(preview.code, 0, preview.out);
  assert.match(preview.out, /\+\+\+ b\/docs\/SECURITY_FINDINGS\.md/);
  assert.match(preview.out, /Nothing was written/);
  assert.equal(existsSync(join(dir, 'docs', 'SECURITY_FINDINGS.md')), false);
  const plan = engine.planFindings(dir);
  assert.equal(plan.changed, true);
  writeFileSync(join(dir, 'docs', 'BACKLOG.md'), '# Backlog\n\n- [ ] edited meanwhile\n');
  assert.throws(() => engine.writeFindings(dir, plan), (e) => e.code === 'CHANGED_SINCE_READ');
  assert.equal(existsSync(join(dir, 'docs', 'SECURITY_FINDINGS.md')), false, 'the findings file was not written either');
});

// A backlog as the earlier release wrote it: the generated section, rows included, with a person's text around it.
const OLD_BACKLOG = ['# Backlog', '', 'Kind: Living.', '', '- [ ] keep this', '', START, '## Security findings', '',
  'Generated by skilliton security findings from .skilliton/security (catalog demo-1). Do not edit this section.', '',
  '| ID | Control | State | Next step |', '| --- | --- | --- | --- |', '| SEC-DEMO-ACCESS | Synthetic access | missing | record an assessment |',
  '| SEC-DEMO-REVIEW | Synthetic review | gap | resolve the gap |', END, '', '## Later notes', ''].join('\n');

function gitProject(t, options) {
  const dir = fixture(t, options);
  const env = { ...process.env, HOME: join(dirname(dir), 'home'), GIT_CONFIG_NOSYSTEM: '1' };
  execFileSync('git', ['init', '-q', dir], { env, stdio: 'ignore' });
  return { dir, repo: resolveGitRoot(dir) };
}

async function migrate(repo) {
  const project = loadProject(repo.root);
  const plan = await planMigration(migrationById(ID, project), project, { root: repo.root, runtimeVersion: RUNTIME });
  return { plan, done: plan.files.length ? applyMigration(plan, { root: repo.root, gitDir: repo.gitDir, runtimeVersion: RUNTIME }) : null };
}

test('the migration moves the old section into the new file with a receipt; a second run changes nothing; a rollback restores', async (t) => {
  const { dir, repo } = gitProject(t, { backlog: OLD_BACKLOG });
  const migration = migrationById(ID, loadProject(dir));
  assert.equal(migration.needed(loadProject(dir)), true);
  const { plan, done } = await migrate(repo);
  assert.deepEqual(plan.files.map((f) => `${f.action} ${f.path}`), ['create docs/SECURITY_FINDINGS.md', 'update docs/BACKLOG.md']);
  const file = read(dir, 'docs/SECURITY_FINDINGS.md');
  assert.match(file, /^# Security findings\n\nKind: Reference\.\n\n<!-- skilliton:security-findings:start -->\n## Open findings\n\nGenerated by /);
  assert.match(file, /\| SEC-DEMO-ACCESS \| Synthetic access \| missing \| record an assessment \|\n\| SEC-DEMO-REVIEW /);
  const backlog = read(dir, 'docs/BACKLOG.md');
  assert.ok(backlog.startsWith('# Backlog\n\nKind: Living.\n\n- [ ] keep this\n\n'));
  assert.ok(backlog.endsWith(`${END}\n\n## Later notes\n`));
  assert.deepEqual(between(backlog).length, 1);
  assert.match(between(backlog)[0], /^Security findings: 2 open, listed in /);
  const receipt = JSON.parse(read(dir, done.receiptRel));
  assert.equal(done.receiptRel, `.skilliton/migrations/${ID}.json`);
  assert.deepEqual(receipt.files.map((f) => f.path), ['docs/SECURITY_FINDINGS.md', 'docs/BACKLOG.md']);
  assert.equal(migration.needed(loadProject(dir)), false);

  const second = await migration.plan(loadProject(dir), { root: dir });
  assert.deepEqual(second.files, [], 'a second run plans no change');
  assert.match(second.notes[0], /nothing to move/);

  const rollback = run(dir, 'migrate', '--rollback', ID, '--apply');
  assert.equal(rollback.code, 0, rollback.out);
  assert.equal(read(dir, 'docs/BACKLOG.md'), OLD_BACKLOG);
  assert.equal(existsSync(join(dir, 'docs', 'SECURITY_FINDINGS.md')), false);
});

test('the migration keeps a findings file that already holds a generated section, and plans nothing for a clean backlog', async (t) => {
  const { dir, repo } = gitProject(t, { backlog: OLD_BACKLOG });
  const existing = `# Security findings\n\nKind: Reference.\n\n${START}\n## Open findings\n\nNewer.\n${END}\n`;
  writeFileSync(join(dir, 'docs', 'SECURITY_FINDINGS.md'), existing);
  const { plan } = await migrate(repo);
  assert.deepEqual(plan.files.map((f) => f.path), ['docs/BACKLOG.md']);
  assert.match(plan.notes.join(' '), /already holds a generated findings section/);
  assert.equal(read(dir, 'docs/SECURITY_FINDINGS.md'), existing);

  const clean = gitProject(t);
  const project = loadProject(clean.dir);
  assert.equal(migrationById(ID, project).needed(project), false);
  assert.deepEqual((await migrationById(ID, project).plan(project, { root: clean.dir })).files, []);
});
