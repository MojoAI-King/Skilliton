// audit.mjs: the deterministic offline audit of the files a change touches. Report card area 09 batch 02; PLAN.md
// M10; docs/BACKLOG.md B20. The command line over it is commands/audit.mjs.
//
// What this is: a small set of rules read over the text of changed files, with no network, no installation and no
// model. Every input arrives as a value ({ path, text }), so the whole engine is tested by calling it, and two runs
// over the same input produce the same findings in the same order. Determinism is the property the three places it
// runs depend on: the Stop routine, a pre-push hook, and the shared branch's merge gate, where a finding rejects a
// push and so must never depend on the order a caller happened to list the files in.
//
// What it is not: a scanner, and not a proof that a change is safe. Each rule is a shape worth a person's attention,
// mapped to the control in the security catalog that covers it, so a finding becomes a scoped observation in the
// register rather than a line in a log nobody keeps. No findings means these rules found nothing in these files, and
// the record says exactly that and nothing more.
//
// Changed files, never every file. docs/LESSONS.md (2026-09-16) records what happens otherwise: a scan over
// `git rev-list --all` reported strings from branches nobody in the session had written, because --all reaches every
// local branch, including other worktrees'. Every caller here passes an explicit list.
//
// Node built-ins and ./security.mjs only. The secret shapes are the security engine's own, imported rather than
// copied: a second implementation of one rule is a second thing to drift (the same reason area 06 batch 01 refused a
// second dash rule beside scripts/scrub-check.sh).

import { EVIDENCE_SHAPES as SECRET_SHAPES } from "./secret-rules.mjs";

// How much is read. A change larger than this is audited as far as the limits allow and the rest is reported as
// skipped, with the reason, because a silent partial audit would read as a clean one.
export const LIMITS = { files: 4000, fileBytes: 1024 * 1024, totalBytes: 64 * 1024 * 1024, lineChars: 4000 };

const shape = (rule) => {
  const found = SECRET_SHAPES.find((s) => s.rule === rule);
  if (!found) throw new Error(`audit: the security engine has no secret shape named ${rule}`);
  return found.re;
};

// Paths a rule applies to. A rule about how a program is written applies to program text: prose that mentions a flag
// is not use of it, and a page that has to name the flag for skipping git hooks should not be a finding. A comment
// inside a program file is program text to a line rule, so this file exempts its own pattern table below rather than
// pretending the distinction is free. The secret rules
// apply to every text file, because a key pasted into a README is still a key.
const ANY = /^/;
const CODE = /\.(?:mjs|cjs|js|jsx|ts|tsx)$/;
const PROGRAM = /\.(?:mjs|cjs|js|jsx|ts|tsx|py|rb|go|rs|java|sh|bash|zsh|ps1|yml|yaml|toml|json)$/;

// exec and execSync take a command line that a shell parses; execFile and spawn take an argument list and are not
// read here. The argument is examined on its own line, deliberately: an interpolation written across two lines is
// not found. That is a real limit of a line rule and it is written down rather than implied.
//
// The module name is not spelled in the pattern, and must not be: \b already matches after the dot, so a qualified
// call is found either way, and scripts/allowlist.test.mjs reads that name anywhere outside a comment as this file
// starting a program. Writing the prefix in would make a rule that searches for a thing indistinguishable from a
// use of it, and turn a gate red on the gate beside it.
const EXEC_CALL = /\bexec(?:Sync)?\s*\(/g;
const INTERPOLATED = [
  [/^[^)]*`[^`]*\$\{/, "template"],
  [/^[^)]*["'][^"']*["']\s*\+/, "concatenation"],
  [/^[^)]*\+\s*[A-Za-z_$]/, "concatenation"],
];

function interpolatedExec(line) {
  EXEC_CALL.lastIndex = 0;
  for (let m = EXEC_CALL.exec(line); m; m = EXEC_CALL.exec(line)) {
    const rest = line.slice(m.index + m[0].length);
    for (const [re, tag] of INTERPOLATED) if (re.test(rest)) return tag;
  }
  return null;
}

const VERIFICATION_OFF = [
  [/--no-verify\b/, "git-hooks-skipped"], // skilliton-audit: allow verification-off the rule's own pattern, not a use of it
  [/rejectUnauthorized\s*:\s*false/, "tls-peer-unchecked"],
  [/NODE_TLS_REJECT_UNAUTHORIZED/, "tls-globally-off"], // skilliton-audit: allow verification-off the rule's own pattern, not a use of it
  [/StrictHostKeyChecking\s*=\s*no/, "host-key-unchecked"],
];

// A line whose first characters open a comment is prose in every language PROGRAM names: // in the C family, # in
// the shell, Python, Ruby, PowerShell, YAML and TOML, and * on the continuation lines of a block comment. A flag or
// a call named in a sentence about it is a description of the thing, not the thing, and a rule that fires on the
// paragraph explaining it is a rule people turn off. Only the whole line counts: a trailing comment never exempts
// the code in front of it, so `exec(`git ${ref}`) // fine` is still a finding.
//
// Secrets are the exception, and inProse marks them. A private key in a comment is a private key, in the history
// from the moment it is committed, and no sentence around it changes that.
const COMMENT_LINE = /^[ \t]*(?:\/\/|\/\*|\*|#)/;

const firstTag = (table) => (line) => { for (const [re, tag] of table) if (re.test(line)) return tag; return null; };
const tagged = (re, tag) => (line) => (re.test(line) ? tag : null);

// The rules, in the order a line is read, which is also the order two findings on one line come out in. Each names
// the control in the security catalog that covers it; commands/audit.mjs records one observation per control.
//
// Only the three specific secret shapes are here. The engine's other three (a credential assignment, a bearer
// credential, a long encoded run) match ordinary source constantly, and lib/collectors.mjs already treats only these
// three as a gap rather than as something for a person to look at. A rule that rejects a push has to be the kind
// that is right when it fires.
export const AUDIT_RULES = [
  { rule: "private-key-block", inProse: true, control: "SG-SECRETS-IN-SOURCE", applies: ANY, find: tagged(shape("private-key-block"), "private-key"),
    reason: "a private key block in a tracked file. Move the key out of the repository, then rotate it: it is in the history from the moment it is committed" },
  { rule: "known-token-prefix", inProse: true, control: "SG-SECRETS-IN-SOURCE", applies: ANY, find: tagged(shape("known-token-prefix"), "token"),
    reason: "a value shaped like an issued access token. Move it to the environment or a secret store, then rotate it" },
  { rule: "json-web-token", inProse: true, control: "SG-SECRETS-IN-SOURCE", applies: ANY, find: tagged(shape("json-web-token"), "jwt"),
    reason: "a value shaped like a JSON web token. Move it out and rotate it, even when it looks expired" },
  { rule: "shell-true", inProse: false, control: "SG-COMMAND-INJECTION", applies: CODE, find: tagged(/\bshell\s*:\s*true\b/, "shell-option"),
    reason: "a child process started through a shell, so every argument is parsed by the shell. Pass an argument list instead" },
  { rule: "interpolated-exec", inProse: false, control: "SG-COMMAND-INJECTION", applies: CODE, find: interpolatedExec,
    reason: "a shell command line built by interpolation or concatenation. Use execFile or spawn with an argument list" },
  { rule: "verification-off", inProse: false, control: "SG-POLICY-CHANGE-REVIEW", applies: PROGRAM, find: firstTag(VERIFICATION_OFF),
    reason: "a check being turned off. Say in the change why it is off here, or take it out" },
];

export const AUDIT_CONTROLS = [...new Set(AUDIT_RULES.map((r) => r.control))];

// An exemption lives on the line it exempts and carries a reason, so it is read in the same diff as the line it
// allows and cannot be a setting somewhere else that nobody opens. An allowed finding is reported as allowed, with
// its reason, and never dropped: a rule that goes quiet is how a gate stops gating.
const ALLOW_MARKER = /skilliton-audit:\s*allow\s+([a-z][a-z-]{0,39})\s+(\S[^\r\n]{0,200}?)\s*$/;
export const ALLOW_HELP = `To allow one line, end it with a comment: skilliton-audit: allow <rule> <why it is allowed here>`;

// The limit, written down rather than discovered later: a marker is a trailing comment, so there is nowhere to put
// one on a line inside a string literal. Help text and generated scripts that name a flag are the real cases, and
// the answer there is to word the sentence without the literal flag, not to widen the marker into something a string
// can carry, because then a repository's own data could exempt its own code.

const allowOn = (line) => {
  const m = ALLOW_MARKER.exec(line);
  return m ? { rule: m[1], why: m[2] } : null;
};

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// files: [{ path, text }]. Returns { findings, allowed, skipped, scanned, bytes, rules }.
//
// The list is sorted by path before anything is read, which is what makes the result independent of the order the
// caller found the files in: a git diff, a working tree walk and a push hook all reach the same output.
export function auditFiles(files) {
  const findings = [], allowed = [], skipped = [];
  let scanned = 0, bytes = 0;
  for (const file of [...files].sort(byPath)) {
    const path = String(file?.path ?? "");
    const text = typeof file?.text === "string" ? file.text : null;
    const note = (why) => skipped.push({ path, why });
    if (!path) continue;
    if (text === null) { note("its content was not readable as text"); continue; }
    if (scanned >= LIMITS.files) { note(`more than ${LIMITS.files} files changed, so this one was not read`); continue; }
    const size = Buffer.byteLength(text);
    if (size > LIMITS.fileBytes) { note(`it is larger than ${LIMITS.fileBytes} bytes`); continue; }
    if (bytes + size > LIMITS.totalBytes) { note(`the change is larger than ${LIMITS.totalBytes} bytes in all, so this one was not read`); continue; }
    if (text.includes("\0")) { note("it holds a zero byte, so it is not text"); continue; }
    bytes += size;
    scanned += 1;
    const rules = AUDIT_RULES.filter((r) => r.applies.test(path));
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // A line longer than the bound is read up to it. A match that straddles the cut is not found, which is the
      // trade a bound makes; the alternative is a rule whose cost has no ceiling.
      const line = lines[i].length > LIMITS.lineChars ? lines[i].slice(0, LIMITS.lineChars) : lines[i];
      const allow = allowOn(line);
      const prose = COMMENT_LINE.test(line);
      for (const r of rules) {
        if (prose && !r.inProse) continue;
        const tag = r.find(line);
        if (!tag) continue;
        const f = { path, line: i + 1, rule: r.rule, control: r.control, tag, reason: r.reason };
        if (allow && allow.rule === r.rule) allowed.push({ ...f, allowedBecause: allow.why });
        else findings.push(f);
      }
    }
  }
  return { findings, allowed, skipped, scanned, bytes, rules: AUDIT_RULES.length };
}

// What a finding prints. The matched text is never part of it: the audit reports where to look, and a tool that
// echoed a key into a terminal, a hook log or a commit message would be the leak it is looking for.
export const findingLine = (f) => `${f.path}:${f.line}: ${f.rule} (${f.control}): ${f.reason}`;

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One sentence for a reminder, a hook or a gate rejection. It names what was read as well as what was found, so a
// result bounded by the limits above cannot be read as a clean audit.
export function auditSummary(result) {
  const parts = [`${count(result.findings.length, "finding")} in ${count(result.scanned, "changed file")}`];
  if (result.allowed.length) parts.push(`${count(result.allowed.length, "allowed line")} carrying a reason`);
  if (result.skipped.length) parts.push(`${count(result.skipped.length, "file")} not read (${result.skipped[0].why})`);
  return parts.join("; ");
}

// The findings for one control, for the record commands/audit.mjs writes.
export const controlFindings = (result, control) => result.findings.filter((f) => f.control === control);
