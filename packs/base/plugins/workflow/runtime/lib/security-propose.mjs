// lib/security-propose.mjs: proposing applicability from what the repository shows, so the owner answers once
// (field report N43, backlog B70). docs/CONTRACTS.md section 12 is the applicability contract this extends.
//
// `security applicability --propose` reads the tracked files (git ls-files, bounded in count and bytes the same way
// lib/collectors.mjs collectSecrets is) for a fixed, listed set of signals, and writes
// .skilliton/security/applicability-proposal.json: per control, whether it applies, which signals led there, up to
// three example paths, and a plain reason. Nine controls need no signal: six process controls (every project has
// them) plus SG-SECRETS-IN-SOURCE and SG-POLICY-CHANGE-REVIEW always apply, and SG-DEPENDENCY-RISK applies when a
// dependency manifest is tracked. The rest follow the one named signal category that decides them. Only controls
// this module knows how to decide, and that are present in the project's own catalog, get a proposed decision; a
// custom catalog's other controls are left for a person.
//
// `security applicability --accept-proposal` turns that proposal into one applicability decision per control through
// the existing path (recordDecision in lib/security.mjs), with rationale "proposed from repository signals: <reason>"
// and the given label. It refuses a missing proposal, a stale one (the tracked files changed size, timestamp, or
// membership since the proposal was read, so it may no longer describe the repository), and overwriting a decision a
// person already made, unless told to replace it.
//
// This module never guesses: a signal is a fixed pattern list, checked against tracked file content or names, never
// a judgement call, and every path it names in a proposal is one it actually read.
//
// Node built-ins, ./collectors.mjs (runGit only) and ./security.mjs (its exported functions only).

import { closeSync, constants, fsyncSync, openSync, realpathSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { runGit } from './collectors.mjs';
import { samePath } from './path-form.mjs';
import {
  LIMIT, SECURITY_DIR, SecurityRefusal, digest, ensureDirectory, inspectPath, latestDecisions, newBudget,
  readApplicability, readCatalog, readRepositoryFile, recordDecision,
} from './security.mjs';

export const PROPOSAL_REL = `${SECURITY_DIR}/applicability-proposal.json`;
const PROPOSAL_SCHEMA = 1;
const PROPOSAL_LIMIT = 4 * 1024 * 1024;
const MAX_EXAMPLES = 3;
const MAX_TRACKED = 200000; // sanity bound on the tracked-file count, the scale collectSecrets already assumes

// Refusals this module raises on its own account (a missing or stale proposal, a decision already made, a
// malformed proposal file). Never a compliance judgement, only "the input this command needs is not usable".
export class ProposalRefusal extends Error {}

const fail = (code, detail) => { throw new SecurityRefusal(code, detail); };
const refuse = (message) => { throw new ProposalRefusal(message); };

// Controls that apply whatever the repository shows, and the fixed reason recorded for each.
const ALWAYS_APPLY = {
  'SG-CHECK-CRITERIA': 'a process control: every project needs its delivery checks named, whatever it builds',
  'SG-CHECK-EVIDENCE': 'a process control: every project needs to keep evidence for decisions it already made',
  'SG-SECURITY-TESTS': 'a process control: security behavior belongs in the same tests as everything else',
  'SG-ROOT-CAUSE': 'a process control: naming the mechanism behind a failure applies to every project',
  'SG-RECURRING-PATTERNS': 'a process control: grouping findings by cause applies to every project',
  'SG-WORKFLOW-IMPROVEMENT': 'a process control: closing a lesson with an enforcing check applies to every project',
  'SG-SECRETS-IN-SOURCE': 'every repository can carry a secret-shaped value by mistake',
  'SG-POLICY-CHANGE-REVIEW': 'every repository has policy or configuration whose own changes deserve separate review',
};

// The six fixed signal categories this item names. Five are patterns tested against a tracked file's text content
// (case-insensitive, a plain name or a short, named regex, never an AI judgement call); the sixth, a dependency
// manifest, is a fixed set of filenames, checked without reading the file.
//
// A library's name is matched only the way source code actually names a dependency (required, imported, used, or a
// manifest's own dependency key), never as a bare word: "express" and "flask" are ordinary English words ("EXPRESS
// OR IMPLIED" in a license file, "regular expressions" in a comment), and matching them bare turned prose into a
// false "applies" for three controls in this repository's own docs (caught while building this proposal against
// this repository; see LANE_REPORT.md). importLike() is the fix; a handful of already distinctive, multi-token or
// punctuated idioms (net/http, spring-boot, django.contrib.auth, ProcessBuilder() and the rest below) stay as plain
// literals, because they are not plain English words and a false match on them was not observed.
function importLike(name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp([
    `require\\(['"]${n}(?:/[^'"]*)?['"]\\)`, // require('name') or require('name/sub'), JS/Node/Ruby
    `from\\s+['"]${n}(?:/[^'"]*)?['"]`,       // import ... from 'name', JS/TS
    `import\\s+['"]${n}(?:/[^'"]*)?['"]`,     // import 'name', JS/TS side-effect import
    `"${n}"\\s*:\\s*"`,                       // "name": "version", a manifest's own dependency line
    `import\\s+${n}\\b`,                       // import name, Python/Go
    `from\\s+${n}(?:\\.[\\w.]+)?\\s+import`,  // from name.sub import x, Python
    `require\\s+['"]${n}['"]`,                 // require 'name', Ruby
    `gem\\s+['"]${n}['"]`,                     // gem 'name', a Gemfile line
    `^\\s*${n}\\s*=`,                          // name = "version", a Cargo.toml dependency line
    `${n}::`,                                  // name::Thing, Rust/Ruby namespace use
  ].join('|'), 'im');
}
const SIGNALS = {
  'web-framework': {
    label: 'a web framework or server', kind: 'content',
    patterns: [importLike('express'), importLike('fastify'), importLike('koa'), importLike('hapi'), importLike('nestjs'), importLike('django'), importLike('flask'), importLike('fastapi'), importLike('rails'), importLike('sinatra'), importLike('actix-web'), importLike('rocket'), importLike('gin-gonic'), /net\/http/i, /spring-boot/i, /http\.createServer/i, /ListenAndServe/i],
  },
  'sign-in': {
    label: 'a sign-in or token library', kind: 'content',
    patterns: [importLike('passport'), importLike('next-auth'), importLike('auth0'), importLike('oauth2'), importLike('openid'), importLike('jsonwebtoken'), importLike('jose'), importLike('devise'), importLike('warden'), /django\.contrib\.auth/i, /flask_login/i, /firebase-auth/i, /supabase.{0,20}auth/i],
  },
  session: {
    label: 'session or cookie handling', kind: 'content',
    patterns: [importLike('express-session'), importLike('cookie-session'), /connect\.sid/i, /set-cookie/i, /flask\.session/i, /django\.contrib\.sessions/i, /rack::session/i, /httponly/i],
  },
  database: {
    label: 'a database or query library', kind: 'content',
    patterns: [importLike('pg'), importLike('postgres'), importLike('mysql'), importLike('mysql2'), importLike('sqlite3'), importLike('mongoose'), importLike('prisma'), importLike('knex'), importLike('sequelize'), importLike('typeorm'), importLike('sqlalchemy'), importLike('activerecord'), /django\.db/i, /database\/sql/i, /gorm\.io/i],
  },
  'child-process': {
    label: 'a child process or shell use', kind: 'content',
    patterns: [/child_process/i, /\bspawnSync?\b/, /\bexecFileSync?\b/, /\bexecSync\b/, /subprocess\.(run|Popen|call)/, /\bos\.system\(/, /\bos\/exec\b/, /Runtime\.getRuntime\(\)\.exec/, /ProcessBuilder\(/, /Process::/], // inventory: a pattern, not a use: the proposal looks for this name in a project's files
  },
  'dependency-manifest': {
    label: 'a dependency manifest', kind: 'name',
    names: new Set(['package.json', 'requirements.txt', 'pyproject.toml', 'poetry.lock', 'pipfile', 'gemfile', 'gemfile.lock', 'cargo.toml', 'go.mod', 'go.sum', 'composer.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'mix.exs']),
  },
};

// Which controls a signal decides. SG-DEPENDENCY-RISK is decided by a signal (present when a manifest exists)
// rather than folded into ALWAYS_APPLY, because the item asks for it "when a manifest exists", not unconditionally.
const SIGNAL_CONTROLS = {
  'SG-COMMAND-INJECTION': ['child-process'],
  'SG-AUTHENTICATION': ['sign-in'],
  'SG-SESSION-HANDLING': ['session'],
  'SG-ACCESS-CONTROL': ['web-framework'],
  'SG-INPUT-INJECTION': ['web-framework', 'database'],
  'SG-SECURITY-LOGGING': ['web-framework', 'sign-in'],
  'SG-DEPENDENCY-RISK': ['dependency-manifest'],
};

function note(found, key, path) {
  const list = found[key] ?? (found[key] = []);
  if (list.length < MAX_EXAMPLES && !list.includes(path)) list.push(path);
}

// { found: { signalKey: [example paths] }, trackedCount, filesFingerprint, head }. Mirrors collectSecrets' own
// repository-root guard and per-file/total budget, so a proposal reads no more of a large repository than a secrets
// scan already does; unreadable, oversized or binary files are skipped, never guessed at. filesFingerprint covers
// every tracked path's size and modification time (not file content, which would cost a second full read), so
// --accept-proposal can tell whether the tracked files changed since without rescanning their content.
function scanSignals(root) {
  const top = runGit(root, ['rev-parse', '--show-toplevel']);
  if (top.status !== 0) fail('NOT_A_GIT_REPOSITORY');
  let topReal, rootReal;
  try { topReal = realpathSync.native(top.stdout.toString('utf8').replace(/\r?\n$/, '')); rootReal = realpathSync.native(root); } catch { fail('GIT_FAILED', 'git named a repository root that could not be resolved'); }
  if (!samePath(topReal, rootReal)) fail('NOT_REPOSITORY_ROOT');

  const head = runGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const headSha = head.status === 0 ? head.stdout.toString('utf8').trim() : null;
  const listing = runGit(root, ['ls-files', '-z'], { maxBuffer: 256 * 1024 * 1024 });
  if (listing.status !== 0) fail('GIT_FAILED', 'git ls-files did not succeed');
  const tracked = listing.stdout.toString('utf8').split('\0').filter(Boolean);
  if (tracked.length > MAX_TRACKED) fail('INPUT_LIMIT', `more than ${MAX_TRACKED} tracked files`);

  const found = {};
  const fingerprintLines = [];
  const budget = newBudget(LIMIT.scanTotal);
  for (const rel of [...tracked].sort()) {
    const base = basename(rel).toLowerCase();
    if (SIGNALS['dependency-manifest'].names.has(base)) note(found, 'dependency-manifest', rel);
    let st;
    try { st = inspectPath(root, rel); } catch { continue; }
    if (!st) continue; // listed by git but missing from the working tree
    fingerprintLines.push(`${rel} ${st.isFile() ? st.size : -1} ${st.mtimeMs}`);
    if (!st.isFile() || st.size > LIMIT.file) continue;
    if (budget.bytesRead + st.size > budget.total) fail('INPUT_LIMIT', 'the tracked files add up to more than the scan budget, so the scan stopped and nothing was written');
    let buffer;
    try { ({ buffer } = readRepositoryFile(root, rel, budget)); } catch { continue; }
    if (buffer.subarray(0, 8000).includes(0)) continue; // binary
    const text = buffer.toString('latin1');
    for (const [key, def] of Object.entries(SIGNALS)) {
      if (def.kind !== 'content') continue;
      if ((found[key] ?? []).length >= MAX_EXAMPLES) continue;
      if (def.patterns.some((re) => re.test(text))) note(found, key, rel);
    }
  }
  return { found, trackedCount: tracked.length, filesFingerprint: digest(Buffer.from(fingerprintLines.join('\n'), 'utf8')), head: headSha };
}

function reasonFor(controlId, candidateSignals, matched) {
  if (Object.hasOwn(ALWAYS_APPLY, controlId)) return ALWAYS_APPLY[controlId];
  return matched.length
    ? `the repository shows ${matched.map((k) => SIGNALS[k].label).join(' and ')}`
    : `no tracked file shows ${candidateSignals.map((k) => SIGNALS[k].label).join(' or ')}`;
}

// Builds the proposal (reads only, writes nothing): { schemaVersion, generatedAt, head, trackedFiles,
// filesFingerprint, controls: [{ controlId, applies, signals, examples, reason }] }.
export function buildProposal(root, { now = new Date() } = {}) {
  const catalog = readCatalog(root);
  const present = new Set(catalog.controls.map((c) => c.id));
  const { found, trackedCount, filesFingerprint, head } = scanSignals(root);
  const controls = [];
  for (const id of [...Object.keys(ALWAYS_APPLY), ...Object.keys(SIGNAL_CONTROLS)]) {
    if (!present.has(id)) continue;
    const candidateSignals = SIGNAL_CONTROLS[id] ?? [];
    const matched = candidateSignals.filter((k) => (found[k] ?? []).length);
    const applies = Object.hasOwn(ALWAYS_APPLY, id) ? true : matched.length > 0;
    const examples = [...new Set(matched.flatMap((k) => found[k] ?? []))].slice(0, MAX_EXAMPLES);
    controls.push({ controlId: id, applies, signals: matched, examples, reason: reasonFor(id, candidateSignals, matched) });
  }
  controls.sort((a, b) => (a.controlId < b.controlId ? -1 : 1));
  return { schemaVersion: PROPOSAL_SCHEMA, generatedAt: now.toISOString(), head, trackedFiles: trackedCount, filesFingerprint, controls };
}

// Overwrites the proposal file in place (it is a working file the next --propose fully regenerates, not an
// immutable record, so it needs no lock or fingerprint-guarded replace the way applicability.json does).
export function writeProposal(root, proposal) {
  ensureDirectory(root, SECURITY_DIR);
  const path = join(root, PROPOSAL_REL);
  const data = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  let fd;
  try { fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644); } catch (e) { fail(e.code === 'ELOOP' ? 'SYMLINK_REFUSED' : 'WRITE_FAILED'); }
  try {
    let offset = 0;
    while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
    fsyncSync(fd);
  } catch { fail('WRITE_FAILED'); } finally { closeSync(fd); }
}

// { exists, proposal } for the command layer's own preview text; throws ProposalRefusal on a proposal that exists
// but does not parse or does not match this module's shape.
export function readProposal(root) {
  const stat = inspectPath(root, PROPOSAL_REL);
  if (!stat) return { exists: false, proposal: null };
  const { buffer } = readRepositoryFile(root, PROPOSAL_REL, newBudget(), PROPOSAL_LIMIT);
  let proposal;
  try { proposal = JSON.parse(buffer.toString('utf8')); } catch { refuse(`${PROPOSAL_REL} is not valid JSON; run --propose again`); }
  if (proposal === null || typeof proposal !== 'object' || proposal.schemaVersion !== PROPOSAL_SCHEMA
    || typeof proposal.filesFingerprint !== 'string' || !Array.isArray(proposal.controls)) {
    refuse(`${PROPOSAL_REL} does not match the shape this command writes; run --propose again`);
  }
  return { exists: true, proposal };
}

// True when the tracked files (their paths, sizes and modification times) are exactly what the proposal read.
function proposalIsFresh(root, proposal) {
  return scanSignals(root).filesFingerprint === proposal.filesFingerprint;
}

// Turns a fresh proposal into one applicability decision per control, through the existing recordDecision path, with
// rationale "proposed from repository signals: <reason>". Refuses a missing or stale proposal, and refuses to
// replace a decision a person already made unless replace is true. Without apply, previews only.
export function acceptProposal(root, { decidedBy, apply = false, replace = false, now = new Date(), beforeReplace = null } = {}) {
  const { exists, proposal } = readProposal(root);
  if (!exists) refuse(`no proposal at ${PROPOSAL_REL}; run: security applicability --propose --apply first`);
  if (!proposalIsFresh(root, proposal)) {
    refuse(`${PROPOSAL_REL} is older than the tracked files it read (generated ${proposal.generatedAt}); the tracked files have since changed size, timestamp or membership. Run --propose again, then --accept-proposal.`);
  }
  const existing = latestDecisions(readApplicability(root).decisions);
  const plan = proposal.controls.map((c) => ({
    controlId: c.controlId, applies: c.applies, reason: c.reason,
    rationale: `proposed from repository signals: ${c.reason}`,
    skip: !replace && existing.has(c.controlId),
  }));
  if (!apply) return { plan, written: 0, backups: [] };
  let written = 0;
  const backups = [];
  for (const p of plan) {
    if (p.skip) continue;
    // Each accepted control is its own applicability.json replace (recordDecision reads, appends and republishes
    // the whole file), so it is backed up the same way a manual decision is, one backup file per control.
    const result = recordDecision(root, { controlId: p.controlId, applies: p.applies, rationale: p.rationale, decidedBy }, { apply: true, now, beforeReplace });
    if (result.backup) backups.push(result.backup);
    written++;
  }
  return { plan, written, backups };
}
