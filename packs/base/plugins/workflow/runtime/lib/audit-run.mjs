// audit-run.mjs: what the audit reads and what it writes down. lib/audit.mjs holds the rules and touches nothing;
// this file finds the files a change touches, reads them, and turns a result into evidence the security register can
// keep. commands/audit.mjs and the Stop routine are its callers.
//
// The split is the point. Rules that never read a disk can be tested by calling them, and the reading that cannot be
// tested that way is in one small place where the scope is decided once: a range, or the working tree. Never every
// file, and never `git rev-list --all` (docs/LESSONS.md, 2026-09-16).

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { refuse } from "./core.mjs";
import { runGit } from "./collectors.mjs";
import { AUDIT_CONTROLS, AUDIT_RULES, LIMITS, auditFiles, controlFindings } from "./audit.mjs";
import { OperationFailed } from "./prepare.mjs";
import {
  SecurityRefusal, appendEvidence, closeEvidenceFile, createEvidenceFile, createRecord, digest, newBudget,
  readCatalog, renderManifest, secretShaped,
} from "./security.mjs";

// A branch, tag or commit, spelled conservatively: this text reaches git as an argument, so what is not obviously a
// revision is refused rather than passed on to see what happens. The first character must be a letter or digit, which
// is what keeps a revision from arriving at git as an option; after that the ordinary spellings are allowed, so
// HEAD~1, HEAD^^, origin/main, v1.2.3 and HEAD@{1} all work.
const REV = /^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]{0,199}$/;
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const names = (out) => out.toString("utf8").split("\0").filter(Boolean);

// what: the sentence a failure is reported with. It travels inside the options object rather than as an argument of
// its own, so that every call below hands this wrapper one object a reader (and scripts/git-config.test.mjs) can read.
function git(root, args, { what = "the repository could not be read", maxBuffer = 64 * 1024 * 1024, input = null, allowFailure = false } = {}) {
  let r;
  try { r = runGit(root, args, { maxBuffer, input }); } catch (e) {
    if (e instanceof SecurityRefusal) throw new OperationFailed(`${what} (${e.code === "GIT_NOT_FOUND" ? "git is not installed or not on PATH" : e.code})`);
    throw e;
  }
  if (r.status !== 0 && !allowFailure) throw new OperationFailed(`${what} (git ${args[0]} exited ${r.status})`);
  return r;
}

const commitAt = (root, rev) => {
  const r = git(root, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { what: `the commit ${JSON.stringify(rev)} could not be read`, allowFailure: true });
  return r.status === 0 ? r.stdout.toString("utf8").trim() : null;
};

// The base of a range may be a tree as well as a commit, because the first commit a push carries has no parent and
// the only honest base for it is the empty tree. git diff takes either; the head must still be a commit, since that
// is where the file contents are read from.
const baseAt = (root, rev) => {
  const commit = commitAt(root, rev);
  if (commit) return commit;
  const r = git(root, ["rev-parse", "--verify", "--quiet", `${rev}^{tree}`], { what: `the tree ${JSON.stringify(rev)} could not be read`, allowFailure: true });
  return r.status === 0 ? r.stdout.toString("utf8").trim() : null;
};

// A git runner bound to one repository, in the shape lib/audit-install.mjs wants: the hook's own scope decisions run
// through the same environment scrubbing (GIT_DIR and the rest) as everything else here, which matters because a hook
// is started by git with those variables already set.
export const gitFor = (root) => (args, options = {}) => git(root, args, { what: `the repository could not be read (git ${args[0]})`, ...options });

function parseRange(range) {
  const parts = String(range).split("..");
  if (parts.length !== 2 || !parts.every((p) => REV.test(p))) {
    refuse(`--range must be <base>..<head>, each a branch, tag or commit made of letters, digits, dots, slashes, underscores or hyphens (got ${JSON.stringify(range)})`);
  }
  return { base: parts[0], head: parts[1] };
}

// { kind, describe, at, paths }. `at` is the commit whose copies of the files are read, or null for the working tree.
// Deletions are left out: there is no file to read, and a file a change removes cannot carry a finding.
function resolveScope(root, { range = null } = {}) {
  if (range) {
    const { base, head } = parseRange(range);
    const headId = commitAt(root, head);
    if (!headId) refuse(`--range names ${JSON.stringify(head)}, which is not a commit in this repository`);
    if (!baseAt(root, base)) refuse(`--range names ${JSON.stringify(base)}, which is not a commit or a tree in this repository`);
    const paths = names(git(root, ["diff", "--name-only", "-z", "--diff-filter=d", base, head, "--"], { what: "the range could not be read" }).stdout);
    return { kind: "range", describe: `the ${paths.length} file(s) ${base}..${head} changed, read at ${head}`, at: headId, paths };
  }
  const head = commitAt(root, "HEAD");
  const changed = head
    ? names(git(root, ["diff", "--name-only", "-z", "--diff-filter=d", "HEAD", "--"], { what: "the working tree could not be compared with HEAD" }).stdout)
    : names(git(root, ["ls-files", "-z"], { what: "the tracked files could not be listed" }).stdout);
  const untracked = names(git(root, ["ls-files", "-z", "--others", "--exclude-standard"], { what: "the untracked files could not be listed" }).stdout);
  const paths = [...new Set([...changed, ...untracked])].sort();
  return {
    kind: "working",
    describe: head ? `the ${paths.length} file(s) changed or added since HEAD` : `the ${paths.length} file(s) in a repository with no commits yet`,
    at: null,
    paths,
  };
}

// Working-tree copies, with the size and fingerprint the manifest needs, so nothing is read twice.
// `absent` is the caller's words for a path that is not there: the delivery gate reads a tree it extracted from a
// commit, where "no longer in the working tree" would be a sentence about the wrong thing.
export function readWorking(root, paths, absent = "it is no longer in the working tree") {
  const files = [], skipped = [];
  let total = 0;
  for (const path of paths) {
    let st;
    try { st = statSync(join(root, path)); } catch { skipped.push({ path, why: absent }); continue; }
    if (!st.isFile()) { skipped.push({ path, why: "it is not a regular file" }); continue; }
    if (st.size > LIMITS.fileBytes) { skipped.push({ path, why: `it is larger than ${LIMITS.fileBytes} bytes` }); continue; }
    if (total + st.size > LIMITS.totalBytes) { skipped.push({ path, why: `the change is larger than ${LIMITS.totalBytes} bytes in all, so this one was not read` }); continue; }
    let bytes;
    try { bytes = readFileSync(join(root, path)); } catch { skipped.push({ path, why: "it could not be read" }); continue; }
    total += bytes.length;
    files.push({ path, text: bytes.toString("utf8"), sha256: digest(bytes), size: st.size, mtimeMs: st.mtimeMs });
  }
  return { files, skipped };
}

// The copies at one commit, in two git calls however many files there are: sizes first, so nothing over the bounds is
// ever read, then the contents of what is left.
function readBlobs(root, commit, paths) {
  const files = [], skipped = [];
  if (!paths.length) return { files, skipped };
  const request = (list) => list.map((p) => `${commit}:${p}\n`).join("");
  const sizes = git(root, ["cat-file", "--batch-check=%(objecttype) %(objectsize)"], { what: "the files at that commit could not be measured", input: request(paths), maxBuffer: 16 * 1024 * 1024 })
    .stdout.toString("utf8").split("\n");
  const wanted = [];
  let total = 0;
  paths.forEach((path, i) => {
    const m = /^(\w+) (\d+)$/.exec(sizes[i] ?? "");
    if (!m || m[1] !== "blob") { skipped.push({ path, why: "it is not a file at that commit" }); return; }
    const size = Number(m[2]);
    if (size > LIMITS.fileBytes) { skipped.push({ path, why: `it is larger than ${LIMITS.fileBytes} bytes at that commit` }); return; }
    if (total + size > LIMITS.totalBytes) { skipped.push({ path, why: `the change is larger than ${LIMITS.totalBytes} bytes in all, so this one was not read` }); return; }
    total += size;
    wanted.push(path);
  });
  if (!wanted.length) return { files, skipped };
  const out = git(root, ["cat-file", "--batch"], { what: "the files at that commit could not be read", input: request(wanted), maxBuffer: total + 1024 * 1024 }).stdout;
  let at = 0;
  for (const path of wanted) {
    const end = out.indexOf(0x0a, at);
    const header = end < 0 ? "" : out.subarray(at, end).toString("utf8");
    const m = /^[a-f0-9]{4,64} blob (\d+)$/.exec(header);
    // A header this reader cannot follow means the rest of the stream cannot be located either, so it stops rather
    // than reading one file's bytes as another's. Reporting a wrong line number is worse than reporting nothing.
    if (!m) throw new OperationFailed(`git cat-file returned a header this reader could not follow while reading ${JSON.stringify(path)}`);
    const size = Number(m[1]);
    files.push({ path, text: out.subarray(end + 1, end + 1 + size).toString("utf8") });
    at = end + 1 + size + 1;
  }
  return { files, skipped };
}

// The whole read: scope, contents, rules. The files that could not be read join the ones the rules skipped, so one
// list answers "what was not looked at" however it came to be unread.
export function auditScope(root, { range = null } = {}) {
  const scope = resolveScope(root, { range });
  const { files, skipped } = scope.at ? readBlobs(root, scope.at, scope.paths) : readWorking(root, scope.paths);
  const result = auditFiles(files);
  return { scope, files, result: { ...result, skipped: [...result.skipped, ...skipped].sort(byPath) } };
}

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The report a person reads and the manifest the register watches. The manifest lists exactly the files that were
// audited, with their fingerprints, and it is the record's source: lib/security.mjs re-reads a manifest source on
// every evaluation, so the observation goes stale the moment one of those files changes. That is what makes it a
// scoped observation rather than a claim about the repository.
export function writeAuditEvidence(root, { scope, files, result, at = new Date() }) {
  const report = createEvidenceFile(root, "audit", at);
  try {
    appendEvidence(report.fd, [
      "Skilliton audit report",
      `Audited: ${at.toISOString()}. Scope: ${scope.describe}.`,
      `Rules: ${AUDIT_RULES.map((r) => r.rule).join(", ")}. A finding is a shape worth attention, not a proven defect.`,
      `Files read: ${result.scanned}. Not read: ${result.skipped.length}. Findings: ${result.findings.length}. Allowed by a marker on the line: ${result.allowed.length}.`,
      "",
      "Findings (file:line rule (control): why; the matched text is never written):",
      ...(result.findings.length ? result.findings.map((f) => `  ${f.path}:${f.line} ${f.rule} (${f.control}): ${f.reason}`) : ["  none"]),
      "",
      "Allowed on the line, with the reason given there:",
      ...(result.allowed.length ? result.allowed.map((f) => `  ${f.path}:${f.line} ${f.rule}: ${f.allowedBecause}`) : ["  none"]),
      "",
      "Not read:",
      ...(result.skipped.length ? result.skipped.map((s) => `  ${s.path} (${s.why})`) : ["  none"]),
      "",
    ].join("\n"));
  } finally { closeEvidenceFile(report.fd); }
  const manifest = createEvidenceFile(root, "audit-files", at);
  try {
    appendEvidence(manifest.fd, renderManifest(files.filter((f) => f.sha256), `Files the audit read at ${at.toISOString()}`));
  } finally { closeEvidenceFile(manifest.fd); }
  return { report: report.rel, manifest: manifest.rel };
}

// A note carries counts and rule names and never a path. lib/security.mjs refuses a note that is itself secret
// shaped, and a repository path long enough is a run of encoded-looking characters, so a note that named its files
// would refuse the record it was written for. The paths are in the report, which the record attaches.
function noteFor(control, result, scope) {
  const mine = controlFindings(result, control);
  const rules = AUDIT_RULES.filter((r) => r.control === control).map((r) => r.rule);
  const byRule = rules.map((rule) => [rule, mine.filter((f) => f.rule === rule).length]).filter(([, n]) => n);
  const allowed = result.allowed.filter((f) => f.control === control).length;
  const note = [
    `Skilliton audit of ${scope.kind === "range" ? "a range of commits" : "the working tree"}: ${count(result.scanned, "file")} read, ${count(result.skipped.length, "file")} not read.`,
    `Rules for this control: ${rules.join(", ")}.`,
    mine.length ? `Found ${count(mine.length, "line")} to act on (${byRule.map(([rule, n]) => `${rule} ${n}`).join(", ")}); each is listed in the attached report with its file and line.` : "No line matched a rule for this control.",
    allowed ? `${count(allowed, "line")} was allowed by a marker on the line, with a reason, and is listed in the report.` : "",
  ].filter(Boolean).join(" ");
  // The engine would refuse a secret shaped note, and a refusal here would read as the audit failing. Nothing above
  // can produce one today; if a rule name ever could, the audit says so rather than writing a note that is rejected.
  if (secretShaped(note)) throw new OperationFailed(`the note for ${control} came out in a shape the security engine refuses, so no record was written`);
  return note;
}

// One record per control the rules cover: a gap when that control has findings, an observation when it does not.
// A control the project's catalog does not carry is reported, not skipped in silence.
export function recordAudit(root, { scope, result, report, manifest, reviewer, apply = false, now = new Date() }) {
  const budget = newBudget();
  let catalog;
  try { catalog = readCatalog(root, budget); } catch (e) {
    if (e instanceof SecurityRefusal) throw new OperationFailed(`the security catalog could not be read (${e.code}), so no record was written`);
    throw e;
  }
  const records = [], missing = [];
  for (const control of AUDIT_CONTROLS) {
    if (!catalog.controls.some((c) => c.id === control)) { missing.push(control); continue; }
    const assessment = controlFindings(result, control).length ? "gap" : "observed";
    try {
      records.push(createRecord(root, { controlId: control, assessment, note: noteFor(control, result, scope), reviewer, sources: [manifest], artifacts: [report] }, { apply, budget, catalog, now }));
    } catch (e) {
      if (e instanceof SecurityRefusal) throw new OperationFailed(`the record for ${control} was refused (${e.code})`);
      throw e;
    }
  }
  return { records, missing };
}
