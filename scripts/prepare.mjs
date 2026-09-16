#!/usr/bin/env node
// Explicit repository preparation. No shell commands from project data are executed.
import { readFileSync, writeFileSync, existsSync, lstatSync, realpathSync, mkdirSync, openSync, closeSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { version, candidates, projectDocuments, projectInstructions, maintenanceInstructions, securityCatalog } from './project-files.mjs';

const MAX_BYTES = 1024 * 1024;
const fail = message => { throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const markerStart = '<!-- skillgate:project:start v1 -->';
const markerEnd = '<!-- skillgate:project:end -->';
const localDir = dirname(fileURLToPath(import.meta.url));

function argumentsFor(argv) {
  const args = { apply: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dir' && !args.dir && argv[i + 1] && !argv[i + 1].startsWith('--')) args.dir = argv[++i];
    else if (key === '--apply' && !args.apply) args.apply = true;
    else if (key === '--check' && !args.check) args.check = true;
    else if (key === '--help') return { help: true };
    else fail('Unknown, duplicate, or incomplete option. Use --help.');
  }
  if (!args.dir) fail('An explicit --dir Git repository root is required.');
  if (args.apply && args.check) fail('Use either --apply or --check, not both.');
  return args;
}

function targetRoot(input) {
  let root;
  try { root = realpathSync(resolve(input)); } catch { fail('The target directory is unavailable.'); }
  if (!lstatSync(root).isDirectory()) fail('The target must be a directory.');
  let gitRoot;
  try { gitRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).trim(); }
  catch { fail('The target must be an existing Git repository root.'); }
  if (realpathSync(gitRoot) !== root) fail('Choose the Git repository root, not a subdirectory.');
  return root;
}

function safePath(root, path) {
  if (typeof path !== 'string' || path.length > 240 || !/^[a-zA-Z0-9._/-]+$/.test(path) || isAbsolute(path) || path.split('/').some(p => !p || p === '..' || p === '.' || p.toLowerCase() === '.git')) fail('Unsafe project path; use a simple repository-relative path.');
  const target = resolve(root, path);
  if (relative(root, target).startsWith('..')) fail('Project path escapes the target root.');
  let cursor = root;
  for (const part of path.split('/')) {
    cursor = join(cursor, part);
    let st;
    try { st = lstatSync(cursor); } catch (e) { if (e.code === 'ENOENT') continue; fail('Cannot inspect a project path.'); }
    if (st.isSymbolicLink()) fail('Symlink destinations are not supported by Prepare.');
    if (cursor !== target && !st.isDirectory()) fail('A project path parent is not a directory.');
    if (cursor === target && !st.isFile()) fail('A project file destination is not a regular file.');
    if (st.isFile() && st.nlink !== 1) fail('Hardlinked project files are not supported by Prepare.');
  }
  return target;
}

function read(root, path) {
  const file = safePath(root, path);
  if (!existsSync(file)) return null;
  if (lstatSync(file).size > MAX_BYTES) fail('A managed project file exceeds the supported size.');
  return readFileSync(file, 'utf8');
}

function managed(previous, content) {
  const text = previous ?? '';
  const starts = [...text.matchAll(/<!-- skillgate:project:start[^\n]*-->/g)];
  const ends = [...text.matchAll(/<!-- skillgate:project:end -->/g)];
  if (text.split('<!-- skillgate:project:start').length - 1 !== starts.length || text.split('<!-- skillgate:project:end').length - 1 !== ends.length || starts.length !== ends.length || starts.length > 1 || (starts.length && (starts[0][0] !== markerStart || starts[0].index >= ends[0].index))) fail('Malformed or incompatible managed project markers; reconcile them before setup.');
  const block = `${markerStart}\n${content.trimEnd()}\n${markerEnd}`;
  if (!starts.length) return text + (text ? (text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n') : '') + block + '\n';
  return text.slice(0, starts[0].index) + block + text.slice(ends[0].index + markerEnd.length);
}

function makePlan(root) {
  const configText = read(root, '.skillgate/config.json');
  let config = {};
  if (configText !== null) {
    try { config = JSON.parse(configText); } catch { fail('The project config is not valid JSON; no files were changed.'); }
    if (!object(config)) fail('The project config must be an object.');
  }
  for (const key of ['prepare', 'handoff']) if (config[key] !== undefined && !object(config[key])) fail('A project configuration section has an invalid shape.');
  if (config.prepare?.version !== undefined && config.prepare.version !== version) fail('Incompatible preparation version; a reviewed migration is required.');
  if (config.prepare?.artifacts !== undefined && !object(config.prepare.artifacts)) fail('The preparation artifact map must be an object.');
  const overrides = config.prepare?.artifacts ?? {};
  if (Object.keys(overrides).some(k => !Object.hasOwn(candidates, k))) fail('The artifact map contains an unsupported role.');
  const artifacts = {};
  const reserved = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/tasks/README.md', 'docs/decisions/README.md', 'docs/lessons/README.md', 'docs/security/README.md'].map(p => p.toLowerCase()));
  for (const [role, defaults] of Object.entries(candidates)) {
    const companion = role === 'backlogArchive' ? artifacts.backlog : role === 'handoffArchive' ? artifacts.handoff : null;
    const paths = companion ? [companion.replace(/\.md$/, '_ARCHIVE.md'), ...defaults] : defaults;
    const override = overrides[role] ?? (role === 'handoff' ? config.handoff?.file : undefined);
    if (override !== undefined) {
      safePath(root, override);
      if (!override.endsWith('.md') || override.toLowerCase().startsWith('.skillgate/') || reserved.has(override.toLowerCase())) fail('Artifact roles require distinct Markdown record files.');
      artifacts[role] = override;
    } else {
      // Validate candidate paths even when another conventional file is adopted.
      for (const path of paths) safePath(root, path);
      artifacts[role] = paths.find(path => existsSync(join(root, path))) ?? paths[0];
    }
  }
  if (new Set(Object.values(artifacts).map(p => p.toLowerCase())).size !== Object.keys(artifacts).length) fail('Duplicate artifact destinations are not allowed.');
  if (config.handoff?.file && config.handoff.file !== artifacts.handoff) fail('The handoff and preparation paths disagree; reconcile config before setup.');
  const changes = [];
  const expected = [];
  const add = (path, content, preserve = false) => {
    const before = read(root, path);
    const after = preserve && before !== null ? before : content;
    expected.push(path);
    if (before !== after) changes.push({ path, before, after });
  };
  const docs = projectDocuments(artifacts);
  for (const [path, content] of Object.entries(docs)) {
    if (path === artifacts.maintain) add(path, managed(read(root, path) ?? content, maintenanceInstructions()));
    else add(path, content, true);
  }
  for (const path of ['AGENTS.md', 'CLAUDE.md']) add(path, managed(read(root, path), projectInstructions(artifacts)));
  const nextConfig = { ...config, handoff: { ...config.handoff, file: artifacts.handoff }, prepare: { ...config.prepare, version, artifacts } };
  add('.skillgate/config.json', JSON.stringify(config) === JSON.stringify(nextConfig) && configText !== null ? configText : serialize(nextConfig));

  const catalogPath = '.skillgate/security/catalog.json';
  const existingCatalog = read(root, catalogPath);
  if (existingCatalog !== null) {
    let catalog;
    try { catalog = JSON.parse(existingCatalog); } catch { fail('The security catalog is not valid JSON; it was preserved.'); }
    if (!object(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.controls) || !catalog.controls.length) fail('The existing security catalog is incompatible or empty; it was preserved.');
  }
  add(catalogPath, serialize(securityCatalog), true);
  let runtime;
  try { runtime = readFileSync(join(localDir, 'security-evidence.mjs'), 'utf8'); } catch { fail('The bundled security runtime is missing; preparation cannot proceed.'); }
  if (existingCatalog !== null) {
    const validation = spawnSync(process.execPath, [join(localDir, 'security-evidence.mjs'), 'status', '--dir', root], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    if (![0, 2].includes(validation.status)) fail('The security runtime rejected the existing catalog or records; they were preserved.');
  }
  const installed = read(root, '.skillgate/bin/security-evidence.mjs');
  if (installed !== null && installed !== runtime) fail('The installed runtime differs; preserve it and review a runtime migration.');
  add('.skillgate/bin/security-evidence.mjs', runtime);
  const ignore = read(root, '.gitignore') ?? '';
  const ignoreLines = ignore.split(/\r?\n/);
  const needed = ['/.skillgate/prepare.lock', '/.skillgate/private-evidence/'].filter(s => !ignoreLines.includes(s));
  add('.gitignore', needed.length ? ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + '\n# Skillgate setup lock and private evidence\n' + needed.join('\n') + '\n' : ignore);
  return { changes, expected, artifacts };
}

function ensureParents(root, file, createdDirs) {
  const parents = relative(root, dirname(file)).split('/').filter(Boolean);
  let cursor = root;
  for (const part of parents) {
    cursor = join(cursor, part);
    if (!existsSync(cursor)) { mkdirSync(cursor); createdDirs.push(cursor); }
    else if (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink()) fail('A write parent changed during preparation.');
  }
}

function atomic(file, content, beforeRename = () => {}) {
  const temp = join(dirname(file), `.skillgate-${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: existsSync(file) ? lstatSync(file).mode & 0o777 : 0o644 });
    beforeRename();
    renameSync(temp, file);
  }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}

function apply(root) {
  const dirs = [];
  const lockPath = safePath(root, '.skillgate/prepare.lock');
  ensureParents(root, lockPath, dirs);
  let lock;
  try { lock = openSync(lockPath, 'wx', 0o600); } catch { fail('Preparation lock exists or cannot be acquired; another setup may be active.'); }
  const written = [];
  let plan;
  try {
    plan = makePlan(root);
    const backupId = randomUUID();
    const gitDir = execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).trim();
    if (realpathSync(gitDir) !== gitDir || !lstatSync(gitDir).isDirectory()) fail('Git-private backup storage is not a regular directory.');
    for (const change of plan.changes) {
      const target = safePath(root, change.path);
      if (read(root, change.path) !== change.before) fail('A destination changed during preparation; retry after reconciling the workspace.');
      if (change.before !== null) {
        const backup = safePath(gitDir, `skillgate-backups/${backupId}/${change.path}`);
        ensureParents(gitDir, backup, dirs);
        writeFileSync(backup, change.before, { flag: 'wx', mode: 0o600 });
      }
      ensureParents(root, target, dirs);
      atomic(target, change.after, () => {
        if (read(root, change.path) !== change.before) fail('A destination changed while staging a write; the external edit was preserved.');
      });
      written.push(change);
    }
    return plan;
  } catch (error) {
    let rollbackFailed = false;
    for (const change of written.reverse()) {
      try {
        if (read(root, change.path) !== change.after) { rollbackFailed = true; continue; }
        if (change.before === null) unlinkSync(join(root, change.path));
        else atomic(join(root, change.path), change.before, () => {
          if (read(root, change.path) !== change.after) fail('A destination changed during rollback; the external edit was preserved.');
        });
      } catch { rollbackFailed = true; }
    }
    const cause = error?.code ? 'Filesystem write failed.' : error.message;
    fail(rollbackFailed ? `Preparation failed; rollback is incomplete. Inspect changed files and Git-private backups before retrying. ${cause}` : `Preparation failed; written project files were rolled back. Inspect Git-private backups and retry. ${cause}`);
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
    for (const dir of [...dirs].reverse()) { try { rmdirSync(dir); } catch (e) { if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes(e.code)) process.stderr.write('NOTE: an empty setup directory could not be removed.\n'); } }
  }
}

try {
  const args = argumentsFor(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/prepare.mjs --dir <Git repository root> [--apply | --check]\nDefault: show the file plan, without writes. Apply preserves project records. Check verifies setup only, not security or application correctness.');
  } else {
    const root = targetRoot(args.dir);
    const plan = makePlan(root); // Full preflight before lock or any writes.
    if (args.check) {
      console.log(plan.changes.length ? `INCOMPLETE: ${plan.changes.length} setup file(s) need preparation.` : `PREPARED: ${plan.expected.length} setup files present. Application and security behavior remain unverified.`);
      for (const c of plan.changes) console.log(`${c.before === null ? 'missing' : 'outdated'} ${c.path}`);
      process.exitCode = plan.changes.length ? 2 : 0;
    } else if (!args.apply) {
      console.log(`DRY RUN: ${plan.changes.length} file change(s); nothing written.`);
      for (const c of plan.changes) console.log(`${c.before === null ? 'create' : 'update managed content in'} ${c.path}`);
    } else {
      const result = apply(root);
      console.log(`PREPARED: ${result.changes.length} file(s) changed; existing records preserved.`);
      console.log('Next: establish project-specific checks and inspect missing security observations. No plugins, hooks, or hosted merge rules were installed.');
    }
  }
} catch (error) {
  // Own validation errors use fixed messages; native errors must never echo input content.
  const message = error instanceof Error && !error.code ? error.message : 'Filesystem operation failed; inspect permissions and retry.';
  process.stderr.write(`PREPARE REFUSED: ${message}\n`);
  process.exitCode = 1;
}
