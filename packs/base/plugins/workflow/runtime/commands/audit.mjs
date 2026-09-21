// commands/audit.mjs: `skilliton audit` (docs/CONTRACTS.md section 6). The rules are lib/audit.mjs and the reading is
// lib/audit-run.mjs; this file parses arguments, prints findings and returns the verdict.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLUGIN_ROOT, parseArgs, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { ALLOW_HELP, AUDIT_CONTROLS, AUDIT_RULES, findingLine, auditSummary } from "../lib/audit.mjs";
import { auditScope, gitFor, recordAudit, writeAuditEvidence } from "../lib/audit-run.mjs";
import { applyPrePush, describePrePush, planPrePush, prePushScopes } from "../lib/audit-install.mjs";
import { OperationFailed, resolveGitRoot } from "../lib/prepare.mjs";

const SHOWN = 200;
const DEFAULT_REVIEWER = "skilliton audit";

export const help = `audit: read the files a change touches and report what is worth a person's attention.

  audit [--dir <repo root>]                the files changed or added since HEAD, read from the working tree
  audit --range <base>..<head>             the files that range changed, read at <head>
  audit --record [--apply]                 write the run down as security evidence (working tree only)
  audit --reviewer <name>                  who the record names as the reviewer (default "${DEFAULT_REVIEWER}")
  audit install --pre-push [--apply]       install a pre-push hook that audits the range each push carries
  audit --pre-push                         what that hook runs: git's four fields per ref, read on standard input

Rules: ${AUDIT_RULES.map((r) => r.rule).join(", ")}, covering ${AUDIT_CONTROLS.join(", ")}.
A finding is a shape worth attention, not a proven defect, and the text that matched is never printed: the audit says
where to look. The whole of each changed file is read, not only the lines the change added, so a finding in a file you
touched is reported even when it was there before. ${ALLOW_HELP}

Changed files, never every file: a range or the working tree, and nothing else. Nothing is sent anywhere, no program
from the project is started, and without --apply nothing is written.

--record --apply writes one record per control (a gap when it has findings, an observation when it does not) with the
report attached and a manifest of exactly the files that were read as its source, so the register marks the
observation stale as soon as one of those files changes. It needs the working tree, because that is what the register
re-reads; with --range the run is reported and not recorded.

The pre-push hook reports and never rejects: it prints the findings and the push goes ahead. A hook that blocked a
push would teach people to skip the hook, and a hook everybody skips gates nothing; the merge gate is the one that
refuses. It is refused when core.hooksPath is set, or when a pre-push hook this command did not write is already
there, and it keeps a backup of any hook it replaces.

Exit codes: 0 no findings; 1 findings to act on; 2 refused, nothing written; 3 the audit could not run.`;

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["record", "apply", "pre-push"], options: ["dir", "range", "reviewer"] }, "audit");
    if (o.help) { say(help); return 0; }
    if (o._.length === 1 && o._[0] === "install") return install(o);
    if (o._.length) refuse(`audit takes no plain arguments except "install" (got "${o._[0]}"). See: ${selfCommand()} audit --help`);
    if (o["pre-push"]) return prePush(o);
    if (o.apply && !o.record) refuse(`--apply only applies to --record; audit writes nothing otherwise. See: ${selfCommand()} audit --help`);
    if (o.record && o.range) refuse("--record needs the working tree: the register re-reads the files a record names, and files read at a commit would not be the files it re-reads. Run the audit with --range to report, without it to record.");
    const reviewer = o.reviewer ?? DEFAULT_REVIEWER;
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const { scope, files, result } = auditScope(repo.root, { range: o.range ?? null });

    say(`skilliton audit: ${result.findings.length ? `${result.findings.length} finding(s) to act on` : "nothing found"} in ${scope.describe}`);
    for (const f of result.findings.slice(0, SHOWN)) say(`  ${findingLine(f)}`);
    if (result.findings.length > SHOWN) say(`  and ${result.findings.length - SHOWN} more finding(s), not printed here${o.record ? "; every one is in the report" : ""}`);
    for (const a of result.allowed) say(`  allowed ${a.path}:${a.line} ${a.rule}: ${a.allowedBecause}`);
    for (const s of result.skipped.slice(0, SHOWN)) say(`  not read ${s.path}: ${s.why}`);
    if (result.skipped.length > SHOWN) say(`  and ${result.skipped.length - SHOWN} more file(s) not read`);
    say(`  ${auditSummary(result)}`);

    if (o.record) {
      // An observation over no files is a sentence with nothing behind it, and the register would carry it as
      // evidence. Refusing is the honest answer: there is nothing to say about a scope that read nothing.
      if (!result.scanned) refuse(`--record needs files to read, and ${scope.describe} came to none. Nothing was written.`);
      if (!o.apply) {
        const plan = AUDIT_CONTROLS.map((c) => `${c} ${result.findings.some((f) => f.control === c) ? "gap" : "observed"}`).join(", ");
        say(`  would write ${AUDIT_CONTROLS.length} record(s): ${plan}, plus a report and a manifest of the ${result.scanned} file(s) read. Nothing was written; add --apply.`);
      } else {
        const at = new Date();
        const { report, manifest } = writeAuditEvidence(repo.root, { scope, files, result, at });
        const { records, missing } = recordAudit(repo.root, { scope, result, report, manifest, reviewer, apply: true, now: at });
        say(`  wrote ${records.length} record(s): ${records.map((r) => `${r.controlId} ${r.assessment}`).join(", ")}`);
        say(`  report: ${tilde(report)}; manifest of the ${result.scanned} file(s) read: ${tilde(manifest)}`);
        if (missing.length) say(`  no record for ${missing.join(", ")}: this project's catalog does not carry that control`);
      }
    }
    return result.findings.length ? 1 : 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skilliton: audit could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skilliton.mjs
  }
}

function install(o) {
  if (!o["pre-push"]) refuse(`audit install needs --pre-push, the only hook it writes. See: ${selfCommand()} audit --help`);
  if (o.range || o.record || o.reviewer) refuse("audit install takes --pre-push, --dir and --apply, and nothing else.");
  const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
  const git = gitFor(repo.root);
  const plan = planPrePush({ root: repo.root, git, runtime: join(PLUGIN_ROOT, "bin", "skilliton") });
  say(`skilliton audit install --pre-push in ${tilde(repo.root)}:`);
  for (const line of describePrePush(plan)) say(`  ${line}`);
  if (!o.apply) { say("  Nothing was written; add --apply."); return 0; }
  const { backup } = applyPrePush(plan, { git });
  say(`  written. ${backup ? `The hook that was there is kept at ${tilde(backup)}.` : "There was no hook there before."}`);
  return 0;
}

// What the hook runs. The four fields git wrote on standard input decide the whole scope; nothing else is consulted.
function prePush(o) {
  if (o.record || o.apply || o.range || o.reviewer) refuse("--pre-push reads its scope from standard input and takes no other option than --dir.");
  if (process.stdin.isTTY) refuse(`--pre-push is what the installed hook runs; it expects git's "<local ref> <local sha> <remote ref> <remote sha>" lines on standard input. To audit by hand, run: ${selfCommand()} audit --range <base>..<head>`);
  let input;
  try { input = readFileSync(0, "utf8"); } catch (e) { throw new OperationFailed(`standard input could not be read (${e.code ?? e.message})`); }
  const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
  const scopes = prePushScopes(input, { git: gitFor(repo.root) });
  if (!scopes.length) { say("skilliton audit: this push carries no ref, so nothing was read."); return 0; }

  let findings = 0;
  for (const s of scopes) {
    if (s.skip) { say(`skilliton audit: ${s.ref}: not audited, ${s.skip}`); continue; }
    const { scope, result } = auditScope(repo.root, { range: `${s.base}..${s.head}` });
    findings += result.findings.length;
    say(`skilliton audit: ${s.ref}: ${result.findings.length ? `${result.findings.length} finding(s) to act on` : "nothing found"} in ${scope.describe}${s.newRef ? ", the commits this push adds" : ""}`);
    for (const f of result.findings.slice(0, SHOWN)) say(`  ${findingLine(f)}`);
    if (result.findings.length > SHOWN) say(`  and ${result.findings.length - SHOWN} more finding(s), not printed here`);
    for (const a of result.allowed) say(`  allowed ${a.path}:${a.line} ${a.rule}: ${a.allowedBecause}`);
    for (const skipped of result.skipped.slice(0, SHOWN)) say(`  not read ${skipped.path}: ${skipped.why}`);
    if (result.skipped.length > SHOWN) say(`  and ${result.skipped.length - SHOWN} more file(s) not read`);
  }
  if (findings) say("The push is not stopped: this is a report. The merge gate is what refuses.");
  return findings ? 1 : 0;
}
