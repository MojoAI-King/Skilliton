#!/usr/bin/env node
// security-propose.test.mjs: `security applicability --propose` and `--accept-proposal`
// (packs/base/plugins/workflow/runtime/lib/security-propose.mjs, commands/security.mjs; field report N43,
// backlog B70). Harness mirrors scripts/collectors.test.mjs (a temp git repository, `git add .`, no commit needed
// since git ls-files reads the index).
//
//   node --test scripts/security-propose.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const cli = join(here, 'skilliton.mjs');
const pluginDir = join(repo, 'packs', 'base', 'plugins', 'workflow');
const BASELINE = join(pluginDir, 'catalogs', 'skillgate-baseline-2.json');
const STARTER = join(pluginDir, 'catalogs', 'skillgate-starter-1.json');
const SECURITY = '.skilliton/security';
const PROPOSAL = `${SECURITY}/applicability-proposal.json`;
const APPLICABILITY = `${SECURITY}/applicability.json`;

const bases = [];
const baseOf = (dir) => bases.find((b) => dir === b || dir.startsWith(`${b}/`));

function project(t, { catalog = BASELINE } = {}) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'propose-'));
  bases.push(base);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const dir = join(base, 'project');
  mkdirSync(join(dir, SECURITY), { recursive: true });
  mkdirSync(join(base, 'home'));
  writeFileSync(join(dir, SECURITY, 'catalog.json'), readFileSync(catalog));
  gitIn(dir, 'init', '-q');
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
const propose = (dir, args = []) => sg(dir, ['applicability', '--propose', '--dir', dir, ...args]);
const accept = (dir, args = []) => sg(dir, ['applicability', '--accept-proposal', '--dir', dir, ...args]);
const proposalFile = (dir) => JSON.parse(readFileSync(join(dir, PROPOSAL), 'utf8'));
const controlOf = (proposal, id) => proposal.controls.find((c) => c.controlId === id);
const decisions = (dir) => (existsSync(join(dir, APPLICABILITY)) ? JSON.parse(readFileSync(join(dir, APPLICABILITY), 'utf8')).decisions : []);
const decisionFor = (dir, id) => decisions(dir).filter((d) => d.controlId === id).pop();

// ---------------------------------------------------------------- tests

test('propose: previews, then --apply writes the proposal; reads only tracked files; a library name inside plain prose is not a signal, only code shaped like an import, require or dependency line is', (t) => {
  const dir = project(t);
  writeFileSync(join(dir, 'LICENSE'), 'WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.\n');
  writeFileSync(join(dir, 'notes.md'), 'This uses regular expressions to read source text; it discusses the flask shape of a river.\n');
  writeFileSync(join(dir, 'untracked.js'), "require('express');\n"); // never git-added: not a tracked file
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo', dependencies: { express: '^4.0.0' } }));
  writeFileSync(join(dir, 'server.js'), "const express = require('express');\nrequire('express-session');\nconst { spawnSync } = require('child_process');\n");
  gitIn(dir, 'add', 'LICENSE', 'notes.md', 'package.json', 'server.js', SECURITY);

  const preview = propose(dir);
  assert.equal(preview.code, 0, preview.out);
  assert.match(preview.out, /preview: nothing is written/);
  assert.match(preview.out, /read 5 tracked file\(s\)/); // LICENSE, notes.md, package.json, server.js, the catalog; untracked.js is not among them
  assert.match(preview.out, /SG-ACCESS-CONTROL: applies - the repository shows a web framework or server \(package\.json, server\.js\)/);
  assert.match(preview.out, /SG-SESSION-HANDLING: applies - the repository shows session or cookie handling \(server\.js\)/);
  assert.match(preview.out, /SG-COMMAND-INJECTION: applies - the repository shows a child process or shell use \(server\.js\)/);
  assert.match(preview.out, /SG-DEPENDENCY-RISK: applies - the repository shows a dependency manifest \(package\.json\)/);
  assert.match(preview.out, /SG-AUTHENTICATION: does not apply - no tracked file shows a sign-in or token library/);
  assert.equal(existsSync(join(dir, PROPOSAL)), false, 'preview writes nothing');

  const applied = propose(dir, ['--apply']);
  assert.equal(applied.code, 0, applied.out);
  assert.match(applied.out, /Wrote \.skilliton\/security\/applicability-proposal\.json/);
  const p = proposalFile(dir);
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.trackedFiles, 5);
  assert.equal(typeof p.filesFingerprint, 'string');
  const access = controlOf(p, 'SG-ACCESS-CONTROL');
  assert.equal(access.applies, true);
  assert.deepEqual(access.signals, ['web-framework']);
  assert.deepEqual(access.examples.sort(), ['package.json', 'server.js']);
  assert.match(access.reason, /^the repository shows a web framework or server$/);
  assert.equal(controlOf(p, 'SG-CHECK-CRITERIA').applies, true);
  assert.deepEqual(controlOf(p, 'SG-CHECK-CRITERIA').examples, []);
});

test('propose: nine controls that need no signal, and only controls the project catalog actually has', (t) => {
  const full = project(t, { catalog: BASELINE });
  writeFileSync(join(full, 'app.js'), 'module.exports = {};\n');
  gitIn(full, 'add', '.');
  assert.equal(propose(full, ['--apply']).code, 0);
  const p = proposalFile(full);
  const alwaysTrue = ['SG-CHECK-CRITERIA', 'SG-CHECK-EVIDENCE', 'SG-SECURITY-TESTS', 'SG-ROOT-CAUSE', 'SG-RECURRING-PATTERNS', 'SG-WORKFLOW-IMPROVEMENT', 'SG-SECRETS-IN-SOURCE', 'SG-POLICY-CHANGE-REVIEW'];
  for (const id of alwaysTrue) assert.equal(controlOf(p, id).applies, true, id);
  assert.equal(controlOf(p, 'SG-DEPENDENCY-RISK').applies, false, 'no manifest is tracked here');
  assert.equal(p.controls.length, 15);

  const starter = project(t, { catalog: STARTER });
  writeFileSync(join(starter, 'app.js'), 'module.exports = {};\n');
  gitIn(starter, 'add', '.');
  assert.equal(propose(starter, ['--apply']).code, 0);
  const s = proposalFile(starter);
  assert.equal(s.controls.length, 7, JSON.stringify(s.controls.map((c) => c.controlId)));
  assert.ok(s.controls.every((c) => ['SG-CHECK-CRITERIA', 'SG-CHECK-EVIDENCE', 'SG-SECURITY-TESTS', 'SG-ROOT-CAUSE', 'SG-RECURRING-PATTERNS', 'SG-WORKFLOW-IMPROVEMENT', 'SG-COMMAND-INJECTION'].includes(c.controlId)));
  assert.equal(controlOf(s, 'SG-SECRETS-IN-SOURCE'), undefined, 'not in the starter catalog, so not proposed');
});

test('accept-proposal: records one decision per control with the proposal reason as rationale, never overwrites an existing decision unless told to replace it, and refuses a missing or stale proposal', (t) => {
  const dir = project(t);
  writeFileSync(join(dir, 'app.js'), 'module.exports = {};\n');
  gitIn(dir, 'add', '.');

  const missing = accept(dir, ['--decided-by', 'tester']);
  assert.equal(missing.code, 2, missing.out);
  assert.match(missing.out, /no proposal at \.skilliton\/security\/applicability-proposal\.json.*--propose --apply first/);

  assert.equal(propose(dir, ['--apply']).code, 0);
  const preview = accept(dir, ['--decided-by', 'tester']);
  assert.equal(preview.code, 0, preview.out);
  assert.match(preview.out, /Preview: 15 decision\(s\) would be recorded.*0 skipped/);
  assert.equal(decisions(dir).length, 0, 'preview writes nothing');

  const applied = accept(dir, ['--decided-by', 'tester', '--apply']);
  assert.equal(applied.code, 0, applied.out);
  assert.match(applied.out, /Recorded 15 decision\(s\).*0 left alone/);
  const critical = decisionFor(dir, 'SG-SECRETS-IN-SOURCE');
  assert.equal(critical.applies, true);
  assert.equal(critical.decidedBy, 'tester');
  assert.match(critical.rationale, /^proposed from repository signals: every repository can carry a secret-shaped value by mistake$/);

  // A control someone already decided by hand is left alone on a second accept, unless --replace is given.
  const again = accept(dir, ['--decided-by', 'tester2', '--apply']);
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /Recorded 0 decision\(s\).*15 left alone/);
  assert.match(again.out, /skipped, a decision already exists \(use --replace to overwrite it\)/);
  assert.equal(decisions(dir).length, 15, 'nothing new was appended');

  const replaced = accept(dir, ['--decided-by', 'tester3', '--replace', '--apply']);
  assert.equal(replaced.code, 0, replaced.out);
  assert.match(replaced.out, /Recorded 15 decision\(s\).*0 left alone/);
  assert.equal(decisions(dir).length, 30, 'a replace appends a new decision; the newest per control still wins');
  assert.equal(decisionFor(dir, 'SG-SECRETS-IN-SOURCE').decidedBy, 'tester3');

  // Staleness: the tracked files changed since the proposal was read.
  writeFileSync(join(dir, 'app.js'), 'module.exports = { changed: true };\n');
  const stale = accept(dir, ['--decided-by', 'tester4', '--replace', '--apply']);
  assert.equal(stale.code, 2, stale.out);
  assert.match(stale.out, /is older than the tracked files it read.*Run --propose again/);
  assert.equal(decisions(dir).length, 30, 'a stale proposal writes nothing');
});

test('applicability: --propose and --accept-proposal are mutually exclusive, reject the manual-decision options, and --replace only applies to --accept-proposal', (t) => {
  const dir = project(t);
  gitIn(dir, 'add', '.');
  const both = sg(dir, ['applicability', '--propose', '--accept-proposal', '--dir', dir]);
  assert.equal(both.code, 2, both.out);
  assert.match(both.out, /takes only one of --propose or --accept-proposal/);

  const withControl = sg(dir, ['applicability', '--propose', '--control', 'SG-SECRETS-IN-SOURCE', '--dir', dir]);
  assert.equal(withControl.code, 2, withControl.out);
  assert.match(withControl.out, /--control does not apply with --propose/);

  const bareReplace = sg(dir, ['applicability', '--replace', '--dir', dir]);
  assert.equal(bareReplace.code, 2, bareReplace.out);
  assert.match(bareReplace.out, /--replace applies only with --accept-proposal/);

  const acceptNoLabel = accept(dir, []);
  assert.equal(acceptNoLabel.code, 2, acceptNoLabel.out);
  assert.match(acceptNoLabel.out, /needs --decided-by/);

  const elsewhere = sg(dir, ['status', '--propose', '--dir', dir]);
  assert.equal(elsewhere.code, 2, elsewhere.out);
  assert.match(elsewhere.out, /--propose does not apply to "security status"/);
});
