// commands/security.mjs: `skilliton security` (docs/CONTRACTS.md section 12): status, record, applicability,
// collect, findings. Parsing, output and exit codes live here; the evidence engine is lib/security.mjs and the
// collectors are lib/collectors.mjs.
//
// Exit codes (section 6): 0 complete; 1 attention (status found a control missing, stale, expired, a gap, needing a
// human, or undecided); 2 invalid or refused (nothing was written); 3 operation failed (a read, write, tool or
// collection failed; the output says what completed). The standalone prototype used exit 2 for attention and exit 1
// for every refusal and failure; scripts/security-evidence.test.mjs holds the mapping test.
//
// Supplied values are never echoed in refusals, and evidence file contents are never printed.

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Refused, backupFile, forDisplay, newStamp, parseArgs, say, selfCommand, tilde, unifiedDiff } from '../lib/core.mjs';
import { ConfigError, readProjectConfig } from '../lib/config.mjs';
import { LEGACY_NAME } from '../lib/legacy-names.mjs';
import { DRAFT_FILE } from '../lib/delivery-policy.mjs';
import * as security from '../lib/security.mjs';
import * as collectors from '../lib/collectors.mjs';
import * as propose from '../lib/security-propose.mjs';

export const help = `security: project security evidence. Status, recorded observations, applicability decisions, evidence
collectors, and open findings in the backlog record. Commands that write show their change first and write only with
--apply. --dir names the project folder (default: the current folder).

  security status [--dir <project>] [--apply]
      Print the evidence report for every control in .skilliton/security/catalog.json: applicability, the latest
      assessment, and freshness (current, stale, expired, missing, invalid). --apply also writes
      .skilliton/security/REPORT.md; only a report carrying the generated marker is replaced. Status never creates or
      re-dates a record. A record is stale when a fingerprinted file changed or disappeared or the control or catalog
      changed, and expired when it is older than maxAgeDays (the control's, else security.maxAgeDays in
      .skilliton/config.json).

  security record --control <id> --assessment observed|gap|needs-human --note <text> --reviewer <label>
                  [--source <file>]... [--artifact <file>]... [--dir <project>] [--apply]
      Validate one assessment; --apply writes it as a new, never edited file under .skilliton/security/records/.
      observed needs at least one --source and one --artifact. Files are repository-relative and fingerprinted
      (SHA-256). Repeat --source and --artifact for more files; quote values that contain spaces.

  security applicability --control <id> --applies true|false --rationale <text> --decided-by <label>
                         [--dir <project>] [--apply]
      Add a decision to .skilliton/security/applicability.json; the newest decision per control wins. A control with
      no decision is undecided and counts as needing a human. applies false removes the control from the denominator,
      and the report lists it with its rationale.

  security applicability --propose [--dir <project>] [--apply]
      Read the tracked files for a fixed set of signals (a web framework or server, a sign-in or token library,
      session or cookie handling, a database or query library, a child process or shell use, a dependency manifest)
      and write .skilliton/security/applicability-proposal.json: per control, whether it applies, the signals and up
      to three example paths that led there, and a plain reason. Six process controls, SG-SECRETS-IN-SOURCE and
      SG-POLICY-CHANGE-REVIEW always apply; SG-DEPENDENCY-RISK applies when a manifest is tracked; the rest follow
      their one named signal. Without --apply, previews only.

  security applicability --accept-proposal --decided-by <label> [--replace] [--dir <project>] [--apply]
      Turn the proposal into one applicability decision per control, through the same path as a manual decision,
      with rationale "proposed from repository signals: <reason>". Refuses a missing proposal, one older than the
      tracked files it read (run --propose again), and, without --replace, a control someone already decided by
      hand. Without --apply, previews only.

  security collect tests --source <file> [--source <file>]... [--control <id>] [--reviewer <label>] [--dir] [--apply]
      Run each check in .skilliton/delivery.json (an argument list, no shell, with its timeout), save the combined
      output as .skilliton/private-evidence/<timestamp>-tests.txt, and record observed when every check passes or gap
      when any fails. Sources are the files the checks cover (the policy file is added). Default control:
      SG-SECURITY-TESTS.
  security collect secrets [--control <id>] [--reviewer <label>] [--dir <project>] [--apply]
      Scan the files git tracks for secret-shaped lines, save a report of file:line and rule (never the matched text)
      and a file manifest under .skilliton/private-evidence/, and record gap on any match or observed when clean. The
      project folder must be the repository root. Default control: SG-SECRETS-IN-SOURCE.
  security collect delivery-policy [--control <id>] [--reviewer <label>] [--dir <project>] [--apply]
      Record observed when .skilliton/delivery.json parses with at least one check and a protected branch, gap
      otherwise. Default control: SG-CHECK-CRITERIA.
      Without --apply a collector shows its plan and runs nothing. A collector that cannot run records nothing.

  security findings [--dir <project>] [--apply]
      Show, or with --apply write, one row per open finding (keyed SEC-<control id>, sorted) in the managed section
      of the backlog record, between <!-- skilliton:security-findings:start --> and <!-- skilliton:security-findings:end -->.
      Rerunning never duplicates a row, a resolved finding leaves the section, and text outside the markers is
      never changed.

Refusals never repeat the values you gave, and evidence file contents are never printed.

Exit 0: complete. For status, every applicable control has a current observed record and an applicability
        decision. For the other subcommands, the preview, record or write succeeded (recording a gap is exit 0).
        None of this is compliance, certification, authenticated review, or proof that security checks passed.
Exit 1: attention. status found a control that is missing, stale, expired, a gap, needs a human, or is undecided.
Exit 2: invalid or refused: bad arguments, an invalid catalog, record or applicability file, an unsafe or linked
        path, or secret-shaped input. Nothing was written.
Exit 3: operation failed: a file could not be read or written, git is missing, or a collection was interrupted.
        The output says what completed.
The standalone prototype used exit 2 for attention and exit 1 for refusals; these are the shared codes instead.`;

const SUBCOMMANDS = {
  status: { options: ['dir'], repeat: [] },
  record: { options: ['dir', 'control', 'assessment', 'note', 'reviewer'], repeat: ['source', 'artifact'] },
  applicability: { options: ['dir', 'control', 'applies', 'rationale', 'decided-by'], repeat: [], flags: ['propose', 'accept-proposal', 'replace'] },
  collect: { options: ['dir', 'control', 'reviewer'], repeat: ['source'] },
  findings: { options: ['dir'], repeat: [] },
};
const OPTIONS = [...new Set(Object.values(SUBCOMMANDS).flatMap((s) => s.options))];
const REPEATABLE = ['source', 'artifact'];
// apply is meaningful (and allowed) on every subcommand; a subcommand's own flags (propose, accept-proposal,
// replace) are named in its SUBCOMMANDS entry and checked against it below, the same way repeatable options are.
const UNIVERSAL_FLAGS = ['apply'];
const FLAGS = [...new Set([...UNIVERSAL_FLAGS, ...Object.values(SUBCOMMANDS).flatMap((s) => s.flags ?? [])])];
const safeWord = (word) => /^[a-z][a-z0-9-]{0,39}$/.test(word);
const shown = (word) => (safeWord(word) ? `"${word}"` : '(not shown)');

function parse(argv) {
  if (argv.length > 150 || argv.some((a) => typeof a !== 'string' || a.length > 4096)) {
    throw new Refused('security: more than 150 arguments, or an argument longer than 4096 characters; nothing was read or written');
  }
  // Screen option names first, so no refusal below can repeat a value that was mistyped as an option.
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).split('=')[0];
    if (key !== 'help' && !OPTIONS.includes(key) && !REPEATABLE.includes(key) && !FLAGS.includes(key)) {
      throw new Refused(`unknown option ${safeWord(key) ? `--${key}` : '(not shown)'} for "security". Run: ${selfCommand()} security --help`);
    }
  }
  const repeat = { source: [], artifact: [] }, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(source|artifact)(?:=([\s\S]*))?$/.exec(argv[i]);
    if (!m) { rest.push(argv[i]); continue; }
    const value = m[2] !== undefined ? m[2] : argv[++i];
    if (value === undefined || value === '' || (m[2] === undefined && value.startsWith('--'))) throw new Refused(`--${m[1]} needs a value`);
    if (repeat[m[1]].includes(value)) throw new Refused(`--${m[1]} names the same file twice (the value is not shown)`);
    if (repeat[m[1]].length >= security.LIMIT.attachments) throw new Refused(`--${m[1]} can be given at most ${security.LIMIT.attachments} times`);
    repeat[m[1]].push(value);
  }
  const o = parseArgs(rest, { flags: FLAGS, options: OPTIONS }, 'security');
  if (o.help) return { help: true };
  const [sub, ...extra] = o._;
  if (sub === undefined) throw new Refused(`security needs a subcommand: status, record, applicability, collect or findings. Run: ${selfCommand()} security --help`);
  if (!Object.hasOwn(SUBCOMMANDS, sub)) throw new Refused(`unknown security subcommand ${shown(sub)}; use status, record, applicability, collect or findings`);
  const spec = SUBCOMMANDS[sub];
  if (sub === 'collect' && !extra.length) throw new Refused('security collect needs a collector: tests, secrets or delivery-policy');
  if (extra.length > (sub === 'collect' ? 1 : 0)) throw new Refused(`security ${sub} got an unexpected extra argument (not shown); quote values that contain spaces`);
  for (const key of Object.keys(o)) {
    if (key === '_' || key === 'help' || UNIVERSAL_FLAGS.includes(key) || spec.options.includes(key) || (spec.flags ?? []).includes(key)) continue;
    throw new Refused(`--${key} does not apply to "security ${sub}". Run: ${selfCommand()} security --help`);
  }
  for (const key of REPEATABLE) if (repeat[key].length && !spec.repeat.includes(key)) throw new Refused(`--${key} does not apply to "security ${sub}"`);
  return { sub, o, repeat, name: extra[0] };
}

function projectDir(o) {
  let root;
  try { root = security.projectRoot(o.dir ?? process.cwd()); } catch (e) {
    if (e instanceof security.SecurityRefusal && e.kind === 'invalid') {
      throw new Refused(o.dir === undefined ? 'the current folder cannot be used as the project folder' : 'the --dir folder does not exist or is not a folder (the value is not shown)');
    }
    throw e;
  }
  // A project under the earlier names keeps its register in the earlier folder; reporting it as missing here would
  // read as "never assessed", so it is refused with the migration instead.
  let config;
  try { config = readProjectConfig(root); } catch (e) {
    if (e instanceof ConfigError) throw new Refused(e.message);
    throw e;
  }
  if (config.legacy) throw new Refused(`this project still uses the earlier ${LEGACY_NAME} names (${config.rel}), and its security evidence stays there until it is migrated. Nothing was read or written. Preview the move: ${selfCommand()} migrate`);
  return root;
}

function requireOptions(o, sub, names) {
  const missing = names.filter((n) => o[n] === undefined);
  if (missing.length) throw new Refused(`security ${sub} needs ${missing.map((n) => `--${n}`).join(', ')}. Run: ${selfCommand()} security --help`);
}

async function status({ o }) {
  const root = projectDir(o);
  const ev = security.evaluateSecurity(root);
  const report = security.renderReport(ev);
  const code = security.exitCodeFor(ev.result);
  const c = ev.counts;
  process.stdout.write(report);
  if (!existsSync(join(root, collectors.DELIVERY_REL))) {
    const make = existsSync(join(root, DRAFT_FILE)) ? `run: ${selfCommand()} delivery confirm --apply`
      : `write ${collectors.DELIVERY_REL} yourself (the format is in: ${selfCommand()} delivery --help)`;
    say(`Note: ${collectors.DELIVERY_REL} is missing, which the tests and delivery-policy collectors both need; ${make}.`);
  }
  if (o.apply && ev.result === 'invalid') {
    say(`Not written: ${security.REPORT_REL}, because the evidence is invalid (see above). Fix it, then run again. Nothing was written.`);
  } else if (o.apply) {
    security.publishReport(root, report);
    say(`Wrote ${security.REPORT_REL}. No record was created or re-dated.`);
  }
  say(`Result: ${ev.result} (exit ${code}). ${c.current} of ${c.applicable} applicable control(s) have a current observed record; missing ${c.missing}, stale ${c.stale}, expired ${c.expired}, invalid ${c.invalid}, gaps ${c.gaps}, needs a human ${c.needsHuman} (undecided ${c.undecided}).`);
  return code;
}

async function record({ o, repeat }) {
  const root = projectDir(o);
  requireOptions(o, 'record', ['control', 'assessment', 'note', 'reviewer']);
  const r = security.createRecord(root, { controlId: o.control, assessment: o.assessment, note: o.note, reviewer: o.reviewer, sources: repeat.source, artifacts: repeat.artifact }, { apply: Boolean(o.apply) });
  const what = `${r.assessment} for ${r.controlId}, with ${r.sources.length} source file(s) and ${r.artifacts.length} artifact file(s)`;
  if (!o.apply) {
    say(`Dry run: the record input is valid (${what}). No files written. Add --apply to write the record.`);
    return 0;
  }
  say(`Recorded ${what}: ${security.RECORDS_DIR}/${r.id}.json`);
  say('This is a recorded claim, not a compliance finding. Records are never edited; a later record for the same control supersedes this one.');
  return 0;
}

async function applicability({ o }) {
  if (o.propose && o['accept-proposal']) throw new Refused('security applicability takes only one of --propose or --accept-proposal');
  const manualOnly = ['control', 'applies', 'rationale'];
  if (o.propose || o['accept-proposal']) {
    const used = manualOnly.filter((k) => o[k] !== undefined);
    if (used.length) throw new Refused(`--${used[0]} does not apply with ${o.propose ? '--propose' : '--accept-proposal'}`);
  }
  if (o.replace && !o['accept-proposal']) throw new Refused('--replace applies only with --accept-proposal');
  if (o.propose) return applicabilityPropose({ o });
  if (o['accept-proposal']) return applicabilityAccept({ o });
  return applicabilityDecide({ o });
}

async function applicabilityDecide({ o }) {
  const root = projectDir(o);
  requireOptions(o, 'applicability', ['control', 'applies', 'rationale', 'decided-by']);
  if (o.applies !== 'true' && o.applies !== 'false') throw new Refused('--applies must be true or false (the value given is not shown)');
  const stamp = newStamp();
  const result = security.recordDecision(root, { controlId: o.control, applies: o.applies === 'true', rationale: o.rationale, decidedBy: o['decided-by'] }, {
    apply: Boolean(o.apply),
    beforeReplace: (path) => {
      try { return backupFile('security', path, stamp); } catch {
        throw new security.SecurityRefusal('WRITE_FAILED', 'the backup of the applicability file could not be written, so the file was not changed');
      }
    },
  });
  const d = result.decision;
  const what = `${d.controlId} ${d.applies ? 'applies' : 'does not apply'} (decided by ${d.decidedBy}, with its rationale)`;
  if (!o.apply) {
    say(`Preview: would add the decision "${what}" to ${security.APPLICABILITY_REL} as decision ${result.decisions}. Nothing was written. Add --apply to write it.`);
    return 0;
  }
  say(`Recorded the decision "${what}" in ${security.APPLICABILITY_REL} (${result.decisions} decision(s); the newest per control wins).`);
  if (result.backup) say(`Backup of the previous file: ${tilde(result.backup)}`);
  if (!d.applies) say('This control no longer counts toward status; the report lists it with its rationale.');
  return 0;
}

async function applicabilityPropose({ o }) {
  const root = projectDir(o);
  const built = propose.buildProposal(root);
  const applyCount = built.controls.filter((c) => c.applies).length;
  say(`security applicability --propose${o.apply ? '' : ' (preview: nothing is written)'}`);
  say(`  read ${built.trackedFiles} tracked file(s) at HEAD ${built.head ?? '(no commits yet)'}`);
  for (const c of built.controls) {
    say(`  ${c.controlId}: ${c.applies ? 'applies' : 'does not apply'} - ${c.reason}${c.examples.length ? ` (${c.examples.join(', ')})` : ''}`);
  }
  if (!o.apply) {
    say(`Preview: ${built.controls.length} control(s) proposed, ${applyCount} applying. Nothing was written. Add --apply to write ${propose.PROPOSAL_REL}.`);
    return 0;
  }
  propose.writeProposal(root, built);
  say(`Wrote ${propose.PROPOSAL_REL}: ${built.controls.length} control(s) proposed, ${applyCount} applying.`);
  say(`This is a proposal, not a decision: run security applicability --accept-proposal --decided-by <label> --apply to record it.`);
  return 0;
}

async function applicabilityAccept({ o }) {
  const root = projectDir(o);
  requireOptions(o, 'applicability', ['decided-by']);
  const stamp = newStamp();
  const result = propose.acceptProposal(root, {
    decidedBy: o['decided-by'], apply: Boolean(o.apply), replace: Boolean(o.replace),
    beforeReplace: (path) => {
      try { return backupFile('security', path, stamp); } catch {
        throw new security.SecurityRefusal('WRITE_FAILED', 'the backup of the applicability file could not be written, so it was not changed');
      }
    },
  });
  const skipped = result.plan.filter((p) => p.skip);
  for (const p of result.plan) {
    say(`  ${p.controlId}: ${p.applies ? 'applies' : 'does not apply'}${p.skip ? ' - skipped, a decision already exists (use --replace to overwrite it)' : ''} - ${p.reason}`);
  }
  if (!o.apply) {
    say(`Preview: ${result.plan.length - skipped.length} decision(s) would be recorded in ${security.APPLICABILITY_REL}, ${skipped.length} skipped. Nothing was written. Add --apply to write them.`);
    return 0;
  }
  say(`Recorded ${result.written} decision(s) in ${security.APPLICABILITY_REL}, ${skipped.length} left alone (a decision already existed).`);
  if (result.backups.length) say(`Backup(s) of the applicability file before each replace: ${result.backups.map((b) => tilde(b)).join(', ')}`);
  return 0;
}

const programLabel = (program) => {
  const name = basename(program);
  return security.textField(name, 120) ? name : '(program not shown)';
};

async function collect({ o, repeat, name }) {
  if (!Object.hasOwn(collectors.COLLECTORS, name)) throw new Refused(`unknown collector ${shown(name)}; use tests, secrets or delivery-policy`);
  if (name !== 'tests' && repeat.source.length) throw new Refused('--source applies only to "security collect tests"');
  const root = projectDir(o);
  const apply = Boolean(o.apply);
  const common = { control: o.control, reviewer: o.reviewer, apply };
  say(`security collect ${name}${apply ? '' : ' (preview: nothing is run or written)'}`);
  const result = name === 'tests' ? await collectors.collectTests(root, { ...common, sources: repeat.source, log: (line) => say(`  ${line}`) })
    : name === 'secrets' ? collectors.collectSecrets(root, common)
      : collectors.collectDeliveryPolicy(root, common);
  const { plan } = result;
  if (!apply) {
    say(`  control: ${plan.controlId}`);
    if (name === 'tests') {
      say(`  sources to fingerprint: ${plan.sources.join(', ')}`);
      say(`  checks from ${collectors.DELIVERY_REL}:`);
      plan.checks.forEach((c, i) => say(`    ${i + 1}. ${c.name}: ${programLabel(c.program)} with ${c.args} argument(s), timeout ${c.timeoutSeconds}s`));
      say(`  with --apply: runs each check, saves the combined output as ${security.PRIVATE_EVIDENCE_DIR}/<timestamp>-tests.txt, and records observed when every check passes or gap when any fails`);
    } else if (name === 'secrets') {
      say(`  tracked files to scan: ${plan.trackedFiles}`);
      say(`  rules: ${plan.rules.join(', ')}`);
      say(`  with --apply: scans them, saves a report of file:line and rule (never the matched text) and a file manifest under ${security.PRIVATE_EVIDENCE_DIR}/, and records gap on any match or observed when clean`);
    } else {
      say(`  policy: ${collectors.DELIVERY_REL} ${plan.exists ? `(${plan.checks.length} usable check(s), ${plan.protectedBranches.length} protected branch(es))` : '(missing)'}`);
      say(`  would record: ${plan.assessment}${plan.reasons.length ? ` (${plan.reasons.join('; ')})` : ''}`);
      say(`  with --apply: saves a short report under ${security.PRIVATE_EVIDENCE_DIR}/ and records that result`);
    }
    say('Nothing was run or written. Add --apply to collect.');
    return 0;
  }
  if (name === 'tests') {
    const failed = result.results.filter((r) => !r.ok).length;
    say(`Checks: ${result.results.length - failed} of ${result.results.length} passed.`);
    say(`Saved the combined output (not printed here): ${result.output}`);
    for (const path of result.changedSources) say(`WARN: ${path} changed while the checks ran. The observation is recorded against the version from before the run, so status shows it as stale; run the collector again.`);
  } else if (name === 'secrets') {
    const c = result.counts;
    say(`Scanned ${c.scanned} of ${c.tracked} tracked file(s) as text; ${c.skipped} not scanned (listed in the report).`);
    say(`Lines matching a secret shape: ${c.hits}${c.hits ? ` in ${c.files} file(s) (${Object.entries(c.byRule).map(([rule, n]) => `${rule} ${n}`).join(', ')})` : ''}. Matched text is never printed or saved.`);
    say(`Saved the report (file:line and rule): ${result.report}`);
    say(`Saved the file manifest: ${result.manifest}`);
  } else {
    say(`Saved the report: ${result.report}`);
    if (plan.reasons.length) say(`Gap: ${plan.reasons.join('; ')}`);
  }
  say(`Recorded ${result.record.assessment} for ${result.record.controlId}: ${security.RECORDS_DIR}/${result.record.id}.json`);
  const ignored = collectors.privateEvidenceIgnored(root);
  if (ignored === false) say(`WARN: git does not ignore ${security.PRIVATE_EVIDENCE_DIR}/. Add it to .gitignore (prepare does) so private evidence is never committed.`);
  else if (ignored === null) say(`Note: could not check whether git ignores ${security.PRIVATE_EVIDENCE_DIR}/ (not a git repository, or git is unavailable).`);
  return 0;
}

async function findings({ o }) {
  const root = projectDir(o);
  const plan = security.planFindings(root);
  const n = plan.findings.length;
  if (plan.before === plan.after) {
    say(`${plan.rel}: the security findings section is already up to date (${n} open finding(s)). Nothing to write.`);
    return 0;
  }
  if (!o.apply) {
    process.stdout.write(forDisplay(unifiedDiff(plan.before, plan.after, `a/${plan.rel}`, `b/${plan.rel}`)));
    say(`Preview: ${n} open finding(s) for the managed section of ${plan.rel}. Nothing was written. Add --apply to write it.`);
    return 0;
  }
  let backup;
  try { backup = backupFile('security', join(root, plan.rel), newStamp()); } catch {
    throw new security.SecurityRefusal('WRITE_FAILED', `the backup of ${plan.rel} could not be written, so it was not changed`);
  }
  security.writeFindings(root, plan);
  say(`Wrote ${n} open finding(s) to the security findings section of ${plan.rel}; text outside its markers is unchanged.`);
  say(`Backup of the previous file: ${tilde(backup)}`);
  return 0;
}

const HANDLERS = { status, record, applicability, collect, findings };

export async function run(argv) {
  let label = 'security';
  try {
    const parsed = parse(argv);
    if (parsed.help) { say(help); return 0; }
    label = `security ${parsed.sub}`;
    return await HANDLERS[parsed.sub](parsed);
  } catch (e) {
    if (e instanceof propose.ProposalRefusal) throw new Refused(`${label}: ${e.message} Nothing was written.`);
    if (e instanceof security.SecurityRefusal) {
      const text = `${label}: ${e.kind === 'failed' ? 'operation failed' : 'refused'} (${e.code}): ${security.refusalText(e.code)}${e.detail ? `. ${e.detail}` : ''}.`;
      if (e.kind === 'failed') { console.error(`skilliton: ${text}`); return 3; }
      throw new Refused(`${text} Nothing was written.`);
    }
    if (e instanceof ConfigError) {
      if (e.kind === 'failed') { console.error(`skilliton: ${label}: ${e.message}`); return 3; }
      throw new Refused(`${label}: ${e.message}`);
    }
    throw e;
  }
}
