import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, symlinkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./prepare.mjs', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'skillgate-prepare-'));
  execFileSync('git', ['init', '-q', dir]);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(dir, ...args) {
  return spawnSync(process.execPath, [cli, '--dir', dir, ...args], { encoding: 'utf8' });
}
function snapshot(dir, prefix = '') {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).filter(e => e.name !== '.git').flatMap(e => {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? snapshot(dir, p) : [[p, readFileSync(join(dir, p), 'utf8')]];
  });
}

test('dry-run creates nothing and names a concrete plan', t => {
  const dir = fixture(t);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
  assert.deepEqual(snapshot(dir), []);
});

test('apply prepares core records and copied runtime; check is read-only', t => {
  const dir = fixture(t);
  const r = run(dir, '--apply');
  assert.equal(r.status, 0, r.stderr);
  for (const p of ['docs/STATUS.md', 'docs/BACKLOG.md', 'docs/ROADMAP.md', 'DECISIONS.md', 'docs/LESSONS.md', 'docs/HANDOFF.md', 'docs/MAINTAIN.md', '.skillgate/security/catalog.json', '.skillgate/bin/security-evidence.mjs']) assert.ok(existsSync(join(dir, p)), p);
  const before = snapshot(dir);
  assert.equal(run(dir, '--check').status, 0);
  assert.deepEqual(snapshot(dir), before);
  const evidence = spawnSync(process.execPath, [join(dir, '.skillgate/bin/security-evidence.mjs'), 'status', '--dir', dir], { encoding: 'utf8' });
  assert.equal(evidence.status, 2, evidence.stderr);
  assert.match(evidence.stdout, /missing/i);
});

test('reapply preserves human content and is byte-for-byte idempotent', t => {
  const dir = fixture(t);
  assert.equal(run(dir, '--apply').status, 0);
  writeFileSync(join(dir, 'docs/STATUS.md'), '# Real progress\nA decision made by a person.\n');
  const before = snapshot(dir);
  assert.equal(run(dir, '--apply').status, 0);
  assert.deepEqual(snapshot(dir), before);
});

test('adopts established document paths and preserves config keys and instructions', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate'));
  writeFileSync(join(dir, '.skillgate/config.json'), JSON.stringify({ dispatch: { minItemsForLanes: 9 }, handoff: { file: 'HANDOFF.md', maxBytes: 3000 } }));
  writeFileSync(join(dir, 'HANDOFF.md'), '# Existing handoff\n');
  writeFileSync(join(dir, 'STATUS.md'), '# Existing status\n');
  writeFileSync(join(dir, 'CLAUDE.md'), '# Existing rules\nKeep these instructions.\n');
  assert.equal(run(dir, '--apply').status, 0);
  assert.equal(readFileSync(join(dir, 'STATUS.md'), 'utf8'), '# Existing status\n');
  assert.equal(existsSync(join(dir, 'docs/STATUS.md')), false);
  const config = JSON.parse(readFileSync(join(dir, '.skillgate/config.json')));
  assert.equal(config.dispatch.minItemsForLanes, 9);
  assert.equal(config.handoff.maxBytes, 3000);
  assert.equal(config.prepare.artifacts.handoff, 'HANDOFF.md');
  assert.match(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), /^# Existing rules\nKeep these instructions\./);
  assert.ok(readdirSync(join(dir, '.git/skillgate-backups')).length > 0);
});

test('malformed config refuses without partial output or input content', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate'));
  writeFileSync(join(dir, '.skillgate/config.json'), '{ private-invalid-content');
  const before = snapshot(dir);
  const r = run(dir, '--apply');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /config is not valid JSON/);
  assert.doesNotMatch(r.stderr + r.stdout, /private-invalid-content/);
  assert.deepEqual(snapshot(dir), before);
});

test('unclosed or duplicate managed blocks refuse all writes', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'AGENTS.md'), '<!-- skillgate:project:start v1 -->\n');
  const before = snapshot(dir);
  const r = run(dir, '--apply');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /managed project markers/);
  assert.deepEqual(snapshot(dir), before);
});

test('symlinked destination refuses without writing outside the repo', t => {
  const dir = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'skillgate-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(dir, 'docs'));
  const r = run(dir, '--apply');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Symlink destinations/);
  assert.deepEqual(readdirSync(outside), []);
  assert.equal(existsSync(join(dir, '.skillgate/config.json')), false);
});

test('configured traversal and duplicate artifact paths are rejected', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate'));
  writeFileSync(join(dir, '.skillgate/config.json'), JSON.stringify({ prepare: { version: 1, artifacts: { status: '../outside.md' } } }));
  const traversal = run(dir, '--apply');
  assert.equal(traversal.status, 1);
  assert.match(traversal.stderr, /Unsafe project path/);
  writeFileSync(join(dir, '.skillgate/config.json'), JSON.stringify({ prepare: { version: 1, artifacts: { status: 'same.md', backlog: 'same.md' } } }));
  const duplicate = run(dir, '--apply');
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /Duplicate artifact/);
});

test('missing runtime is incomplete and can be repaired without changing docs', t => {
  const dir = fixture(t);
  assert.equal(run(dir, '--apply').status, 0);
  rmSync(join(dir, '.skillgate/bin/security-evidence.mjs'));
  assert.equal(run(dir, '--check').status, 2);
  assert.equal(run(dir, '--apply').status, 0);
  assert.equal(run(dir, '--check').status, 0);
});

test('existing incompatible catalog and runtime are not overwritten', t => {
  const dir = fixture(t);
  assert.equal(run(dir, '--apply').status, 0);
  writeFileSync(join(dir, '.skillgate/bin/security-evidence.mjs'), '// locally changed runtime\n');
  const before = snapshot(dir);
  const r = run(dir, '--apply');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /runtime differs/);
  assert.deepEqual(snapshot(dir), before);
});

test('lock refuses concurrent setup; subdirectories and missing dir are refused', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate'));
  writeFileSync(join(dir, '.skillgate/prepare.lock'), 'another process');
  const before = snapshot(dir);
  const r = run(dir, '--apply');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lock exists/);
  assert.deepEqual(snapshot(dir), before);
  mkdirSync(join(dir, 'sub'));
  assert.equal(run(join(dir, 'sub'), '--apply').status, 1);
  assert.equal(spawnSync(process.execPath, [cli, '--apply']).status, 1);
});

test('reserved and case-alias record paths cannot replace instruction files', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate'));
  for (const artifacts of [{ status: 'docs/security/README.md' }, { status: 'agents.md' }, { status: 'same.md', backlog: 'SAME.md' }, { status: '.GIT/config.md' }]) {
    writeFileSync(join(dir, '.skillgate/config.json'), JSON.stringify({ prepare: { version: 1, artifacts } }));
    const before = snapshot(dir);
    const r = run(dir, '--apply');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Artifact roles|Duplicate artifact|Unsafe project path/);
    assert.deepEqual(snapshot(dir), before);
  }
});

test('archives exist and invalid catalog is rejected by the installed schema', t => {
  const dir = fixture(t);
  assert.equal(run(dir, '--apply').status, 0);
  assert.ok(existsSync(join(dir, 'docs/BACKLOG_ARCHIVE.md')));
  assert.ok(existsSync(join(dir, 'docs/HANDOFF_ARCHIVE.md')));
  writeFileSync(join(dir, '.skillgate/security/catalog.json'), JSON.stringify({ schemaVersion: 1, catalogVersion: 'bad', controls: [{}] }));
  const r = run(dir, '--check');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /security runtime rejected/);
});

function preloader(t, source) {
  const d = mkdtempSync(join(realpathSync(tmpdir()), 'skillgate-fault-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const path = join(d, 'inject.mjs');
  writeFileSync(path, source);
  return path;
}

test('mid-write failure rolls back and backups cannot enter tracked files', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '.skillgate'));
  writeFileSync(join(dir, '.skillgate/config.json'), '{}\n');
  writeFileSync(join(dir, '.gitignore'), '/.skillgate/config.json\n');
  const before = snapshot(dir);
  const inject = preloader(t, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const rename=fs.renameSync; fs.renameSync=(a,b)=>{if(b.endsWith('/.skillgate/config.json')) {const e=new Error('injected'); e.code='EACCES'; throw e;} return rename(a,b);}; syncBuiltinESMExports();`);
  const r = spawnSync(process.execPath, ['--import', inject, cli, '--dir', dir, '--apply'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rolled back/);
  assert.deepEqual(snapshot(dir), before);
  const untracked = execFileSync('git', ['-C', dir, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  assert.doesNotMatch(untracked, /backup|config\.json/);
  assert.ok(existsSync(join(dir, '.git/skillgate-backups')));
});

test('an edit arriving during backup is preserved and setup refuses', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'AGENTS.md'), '# Original\n');
  const inject = preloader(t, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const write=fs.writeFileSync; let fired=false; fs.writeFileSync=(p,...a)=>{ const out=write(p,...a); if(!fired && String(p).includes('/skillgate-backups/') && String(p).endsWith('/AGENTS.md')) { fired=true; write(process.env.SKILLGATE_TEST_TARGET+'/AGENTS.md','# Concurrent edit\\n'); } return out; }; syncBuiltinESMExports();`);
  const r = spawnSync(process.execPath, ['--import', inject, cli, '--dir', dir, '--apply'], { encoding: 'utf8', env: { ...process.env, SKILLGATE_TEST_TARGET: dir } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /external edit was preserved/);
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# Concurrent edit\n');
  assert.equal(existsSync(join(dir, 'docs/STATUS.md')), false);
});

test('an edit arriving during rollback is preserved and reported incomplete', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'AGENTS.md'), '# Original\n');
  const inject = preloader(t, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
let rollingBack=false; const rename=fs.renameSync; fs.renameSync=(a,b)=>{ if(b.endsWith('/.skillgate/config.json')) {rollingBack=true; const e=new Error('injected'); e.code='EACCES'; throw e;} return rename(a,b); };
const write=fs.writeFileSync; fs.writeFileSync=(p,...a)=>{const out=write(p,...a); if(rollingBack && String(p).endsWith('.tmp') && a[0]==='# Original\\n') write(process.env.SKILLGATE_TEST_TARGET+'/AGENTS.md','# Concurrent rollback edit\\n'); return out;}; syncBuiltinESMExports();`);
  const r = spawnSync(process.execPath, ['--import', inject, cli, '--dir', dir, '--apply'], { encoding: 'utf8', env: { ...process.env, SKILLGATE_TEST_TARGET: dir } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rollback is incomplete/);
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# Concurrent rollback edit\n');
  assert.equal(existsSync(join(dir, 'docs/STATUS.md')), false);
});
