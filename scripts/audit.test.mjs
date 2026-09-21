#!/usr/bin/env node
// audit.test.mjs: the audit rule engine finds the planted flaws, and only those (PLAN.md M10; docs/BACKLOG.md B20;
// report card area 09 batch 02 item 1).
//
//   node scripts/audit.test.mjs               exit 0 when every check passes, 1 when one fails
//   node scripts/audit.test.mjs --self-test   applies one mutant at a time and reports which checks each one kills
//
// Every planted flaw is assembled from pieces at run time by plant(), so no line of this file is itself a flaw. A
// check that wrote a planted key as a literal would become a file with a key in it: lib/collectors.mjs would report
// it as a gap, the audit would report it on every run, and the answer would be an allowlist entry for the check that
// tests allowlisting. Assembling the flaw keeps the check honest and the repository clean at the same time.
//
// The self-test follows docs/lessons/2026-09-20-a-mutant-that-kills-two-cases-has-told-y-afe9: each mutant is applied
// on its own and the checks it kills are named, because "6 mutants, 6 red runs" says nothing about which check is
// pulling weight.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { auditFiles, findingLine, auditSummary, controlFindings, AUDIT_CONTROLS, AUDIT_RULES, LIMITS } from "../packs/base/plugins/workflow/runtime/lib/audit.mjs";
import { evaluateSecurity, secretShaped } from "../packs/base/plugins/workflow/runtime/lib/security.mjs";

const plant = (...parts) => parts.join("");

// The planted values. Each is a shape, not a credential: nothing here was ever issued by anything.
const PRIVATE_KEY = plant("-----BEGIN ", "RSA PRIVATE ", "KEY-----");
const TOKEN = plant("gh", "p_", "EXAMPLEONLYNOTAREALTOKEN");
const JWT = plant("ey", "J", "hbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxIn0", ".", "c2lnbmF0dXJl");
const SHELL_TRUE = plant("  ", "shell", ": true,");
const INTERPOLATED = plant("  execSync(", "`git log ", "${", "ref}`);"); // skilliton-audit: allow interpolated-exec a planted fixture, not a call
const CONCATENATED = plant("  exec(", '"ls " ', "+ dir);"); // skilliton-audit: allow interpolated-exec a planted fixture, not a call
const NO_VERIFY = plant("git push --no-", "verify");
const TLS_OFF = plant("  rejectUnauthorized", ": false,");

const MARKER = (rule, why) => ` // skilliton-audit: allow ${rule} ${why}`;

// The fixture project. Paths matter as much as text: a rule about how a program is written must not fire on prose
// that names a flag, and a rule about a leaked key must fire everywhere, prose included.
const FIXTURE = [
  { path: "docs/notes.md", text: ["# Notes", "", `The handover pasted ${JWT} into the ticket.`].join("\n") },
  { path: "docs/guide.md", text: ["# Guide", "", `Never run ${NO_VERIFY}: it skips the project's own checks.`].join("\n") },
  { path: "keys/id_rsa", text: [PRIVATE_KEY, "AAAA", "-----END RSA PRIVATE KEY-----"].join("\n") },
  { path: "src/config.json", text: ["{", `  "auth": "${TOKEN}"`, "}"].join("\n") },
  { path: "src/run.mjs", text: ["import { spawn, exec, execSync } from \"node:child_process\";", "", "spawn(cmd, args, {", SHELL_TRUE, "});", "", INTERPOLATED, CONCATENATED].join("\n") },
  { path: "src/clean.mjs", text: ["import { execFile } from \"node:child_process\";", "", "execFile(cmd, args, done);", "exec(command);"].join("\n") },
  { path: "scripts/deploy.sh", text: ["#!/bin/sh", "set -e", NO_VERIFY, TLS_OFF].join("\n") },
  { path: "src/allowed.mjs", text: ["spawn(cmd, args, {", SHELL_TRUE + MARKER("shell-true", "the fixture that proves an allowed line carries its reason"), "});"].join("\n") },
  { path: "src/mismarked.mjs", text: ["spawn(cmd, args, {", SHELL_TRUE + MARKER("verification-off", "a marker for another rule allows nothing here"), "});"].join("\n") },
  // Prose inside a program: the first two lines describe the flaws the rules look for, the third has a key pasted
  // into a comment, and the fourth is the real thing. Lines 1 and 2 must be silent, lines 3 and 4 must not.
  { path: "src/prose.mjs", text: [
    `// A push with ${NO_VERIFY} skips the project's own checks, which is why the rule looks for it.`,
    `// ${SHELL_TRUE.trim()} is the option that rule finds.`,
    `/* ${JWT} was pasted into this comment. */`,
    SHELL_TRUE,
  ].join("\n") },
];

const find = (r, path, line, rule) => r.findings.find((f) => f.path === path && f.line === line && f.rule === rule);
const on = (r, path) => r.findings.filter((f) => f.path === path);
const skip = (r, path) => r.skipped.find((s) => s.path === path);
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

// Each check returns null when it holds, or a sentence saying what it found instead. Each takes the audit function
// rather than calling auditFiles directly, which is what lets --self-test run the same checks against a mutant.
const CHECKS = [
  ["every rule has a planted flaw", (audit) => {
    const r = audit(FIXTURE);
    const missing = AUDIT_RULES.map((x) => x.rule).filter((rule) => !r.findings.some((f) => f.rule === rule));
    return missing.length ? `no fixture triggers ${missing.join(", ")}` : null;
  }],
  ["a private key block is found at its line, under the secrets control", (audit) => {
    const f = find(audit(FIXTURE), "keys/id_rsa", 1, "private-key-block");
    return f ? (f.control === "SG-SECRETS-IN-SOURCE" ? null : `control was ${f.control}`) : "not found at keys/id_rsa:1";
  }],
  ["an issued token shape is found in a data file", (audit) => {
    const f = find(audit(FIXTURE), "src/config.json", 2, "known-token-prefix");
    return f ? null : "not found at src/config.json:2";
  }],
  ["a web token is found in prose, because a key in a document is still a key", (audit) => {
    const f = find(audit(FIXTURE), "docs/notes.md", 3, "json-web-token");
    return f ? null : "not found at docs/notes.md:3";
  }],
  ["a shell child process is found, under the command injection control", (audit) => {
    const f = find(audit(FIXTURE), "src/run.mjs", 4, "shell-true");
    return f ? (f.control === "SG-COMMAND-INJECTION" ? null : `control was ${f.control}`) : "not found at src/run.mjs:4";
  }],
  ["an interpolated command line is found, and so is a concatenated one", (audit) => {
    const r = audit(FIXTURE);
    const tpl = find(r, "src/run.mjs", 7, "interpolated-exec");
    const cat = find(r, "src/run.mjs", 8, "interpolated-exec");
    if (!tpl) return "the template literal at src/run.mjs:7 was not found";
    if (!cat) return "the concatenation at src/run.mjs:8 was not found";
    return tpl.tag === "template" && cat.tag === "concatenation" ? null : `tags were ${tpl.tag} and ${cat.tag}`;
  }],
  ["a check being turned off is found in a shell script, under the policy control", (audit) => {
    const r = audit(FIXTURE);
    const f = find(r, "scripts/deploy.sh", 3, "verification-off");
    const tls = find(r, "scripts/deploy.sh", 4, "verification-off");
    if (!f || f.control !== "SG-POLICY-CHANGE-REVIEW") return "the skipped hook at scripts/deploy.sh:3 was not found under the policy control";
    if (!tls || tls.tag !== "tls-peer-unchecked") return "the unchecked peer at scripts/deploy.sh:4 was not found";
    return f.tag === "git-hooks-skipped" ? null : `tag was ${f.tag}`;
  }],
  ["prose naming a flag is not a finding", (audit) => {
    const hits = on(audit(FIXTURE), "docs/guide.md");
    return hits.length ? `docs/guide.md produced ${plural(hits.length, "finding")}: ${hits.map((f) => f.rule).join(", ")}` : null;
  }],
  ["a flag named in a comment is prose, and the same option one line down is not", (audit) => {
    const r = audit(FIXTURE);
    const quiet = on(r, "src/prose.mjs").filter((f) => f.line === 1 || f.line === 2);
    if (quiet.length) return `a comment produced ${quiet.map((f) => `${f.rule} at line ${f.line}`).join(", ")}`;
    return find(r, "src/prose.mjs", 4, "shell-true") ? null : "the option on line 4 is not a comment and was not found";
  }],
  ["a key pasted into a comment is still a key", (audit) => {
    return find(audit(FIXTURE), "src/prose.mjs", 3, "json-web-token") ? null : "not found at src/prose.mjs:3";
  }],
  ["a clean file produces nothing, and an argument list is not a shell command line", (audit) => {
    const hits = on(audit(FIXTURE), "src/clean.mjs");
    return hits.length ? `src/clean.mjs produced ${plural(hits.length, "finding")}: ${hits.map((f) => f.rule).join(", ")}` : null;
  }],
  ["an allowed line is reported as allowed, with its reason, and is not a finding", (audit) => {
    const r = audit(FIXTURE);
    if (on(r, "src/allowed.mjs").length) return "the allowed line was still reported as a finding";
    const a = r.allowed.find((f) => f.path === "src/allowed.mjs" && f.rule === "shell-true");
    if (!a) return "the allowed line was dropped instead of being reported as allowed";
    return /carries its reason/.test(a.allowedBecause) ? null : `the reason was ${JSON.stringify(a.allowedBecause)}`;
  }],
  ["a marker naming another rule allows nothing", (audit) => {
    const r = audit(FIXTURE);
    return find(r, "src/mismarked.mjs", 2, "shell-true") ? null : "the finding was suppressed by a marker for a different rule";
  }],
  ["a file that is not text is skipped and said to be skipped", (audit) => {
    const r = audit([...FIXTURE, { path: "build/app.bin", text: `head\0${TOKEN}` }]);
    const s = skip(r, "build/app.bin");
    if (!s) return "the binary file was not reported as skipped";
    return on(r, "build/app.bin").length ? "it was skipped and audited at the same time" : (/zero byte/.test(s.why) ? null : `the reason was ${JSON.stringify(s.why)}`);
  }],
  ["a file over the size bound is skipped and said to be skipped", (audit) => {
    const r = audit([...FIXTURE, { path: "vendor/big.js", text: "a".repeat(LIMITS.fileBytes + 1) }]);
    const s = skip(r, "vendor/big.js");
    return s ? (/larger than/.test(s.why) ? null : `the reason was ${JSON.stringify(s.why)}`) : "the oversized file was not reported as skipped";
  }],
  ["the order the files arrive in does not change the result", (audit) => {
    const forward = JSON.stringify(audit(FIXTURE).findings);
    const backward = JSON.stringify(audit([...FIXTURE].reverse()).findings);
    return forward === backward ? null : "the same files in a different order produced different findings";
  }],
  ["two runs over the same input are byte-identical", (audit) => {
    const once = JSON.stringify(audit(FIXTURE));
    const twice = JSON.stringify(audit(FIXTURE));
    return once === twice ? null : "two runs over the same input differed";
  }],
  ["findings are sorted by path and then by line", (audit) => {
    const r = audit(FIXTURE);
    for (let i = 1; i < r.findings.length; i++) {
      const a = r.findings[i - 1], b = r.findings[i];
      if (a.path > b.path) return `${a.path} came before ${b.path}`;
      if (a.path === b.path && a.line > b.line) return `${a.path}:${a.line} came before ${b.path}:${b.line}`;
    }
    return null;
  }],
  ["the matched text is never in the output", (audit) => {
    const r = audit(FIXTURE);
    const out = [JSON.stringify(r), ...r.findings.map(findingLine), auditSummary(r)].join("\n");
    const leaked = [["the private key header", PRIVATE_KEY], ["the token", TOKEN], ["the web token", JWT]].filter(([, v]) => out.includes(v));
    return leaked.length ? `${leaked.map(([n]) => n).join(" and ")} appeared in the output` : null;
  }],
  ["the summary names what was read as well as what was found", (audit) => {
    const r = audit([...FIXTURE, { path: "build/app.bin", text: "x\0y" }]);
    const s = auditSummary(r);
    if (!s.includes(`${r.findings.length} finding`)) return `the count is missing from ${JSON.stringify(s)}`;
    if (!/changed file/.test(s)) return `what was read is missing from ${JSON.stringify(s)}`;
    return /not read/.test(s) ? null : `the skipped file is missing from ${JSON.stringify(s)}`;
  }],
  // The property, not a count: every finding lands under exactly one control and under the right one. A count here
  // would have to be edited every time the fixture grows, and a check that has to be edited to stay green is a check
  // that will one day be edited to stay green.
  ["findings are grouped by the control that covers them, with none lost and none counted twice", (audit) => {
    const r = audit(FIXTURE);
    let total = 0;
    for (const control of AUDIT_CONTROLS) {
      const group = controlFindings(r, control);
      const wrong = group.find((f) => f.control !== control);
      if (wrong) return `${wrong.rule} carries ${wrong.control} and was grouped under ${control}`;
      if (!group.length) return `${control} has no finding in the fixture, so the grouping is not exercised for it`;
      total += group.length;
    }
    return total === r.findings.length ? null : `the groups hold ${total} of ${r.findings.length} findings`;
  }],
];

// One mutant per behavior the checks above are meant to hold. A mutant is a whole audit function, not a patch to the
// engine's source: each stands in for an engine that gets one thing wrong, and the engine itself is never edited to
// be tested. Each is a factory, so a mutant that counts its calls starts fresh.
const sorted = (findings) => [...findings].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
const after = (fn) => () => (files) => fn(auditFiles(files));
const extra = (finding) => after((r) => ({ ...r, findings: sorted([...r.findings, { tag: "x", reason: "x", ...finding }]) }));

const MUTANTS = [
  ["the secrets rules find nothing", after((r) => ({ ...r, findings: r.findings.filter((f) => f.control !== "SG-SECRETS-IN-SOURCE") }))],
  ["every finding is reported on line 1", after((r) => ({ ...r, findings: r.findings.map((f) => ({ ...f, line: 1 })) }))],
  ["an allowed line is dropped rather than reported", after((r) => ({ ...r, allowed: [] }))],
  ["a marker allows every rule on its line", after((r) => ({ ...r, findings: r.findings.filter((f) => f.path !== "src/mismarked.mjs") }))],
  ["a skipped file is passed over in silence", after((r) => ({ ...r, skipped: [] }))],
  ["findings come back reversed", after((r) => ({ ...r, findings: [...r.findings].reverse() }))],
  ["a finding carries the text it matched", after((r) => ({ ...r, findings: r.findings.map((f) => ({ ...f, matched: f.rule === "known-token-prefix" ? TOKEN : "" })) }))],
  ["the rule that spots a shell child process is removed", after((r) => ({ ...r, findings: r.findings.filter((f) => f.rule !== "shell-true") }))],
  ["prose is audited as though it were a program", extra({ path: "docs/guide.md", line: 3, rule: "verification-off", control: "SG-POLICY-CHANGE-REVIEW" })],
  ["any exec call is a finding, interpolated or not", extra({ path: "src/clean.mjs", line: 4, rule: "interpolated-exec", control: "SG-COMMAND-INJECTION" })],
  ["a comment in a program is audited as though it were code", extra({ path: "src/prose.mjs", line: 1, rule: "verification-off", control: "SG-POLICY-CHANGE-REVIEW" })],
  ["a secret in a comment is passed over with the rest of the prose",
    after((r) => ({ ...r, findings: r.findings.filter((f) => !(f.path === "src/prose.mjs" && f.line === 3)) }))],
  // The engine sorts its input before reading it. Without that sort it would audit each file where the caller put it,
  // which is what this mutant does: the findings are right and their order follows the caller.
  ["the files are audited in the order they arrived", () => (files) => {
    const parts = files.map((f) => auditFiles([f]));
    const join = (key) => parts.flatMap((p) => p[key]);
    return { findings: join("findings"), allowed: join("allowed"), skipped: join("skipped"),
      scanned: parts.reduce((n, p) => n + p.scanned, 0), bytes: parts.reduce((n, p) => n + p.bytes, 0), rules: AUDIT_RULES.length };
  }],
  // Determinism is a property of two runs, so a mutant for it has to differ between them rather than be wrong once.
  ["a second run over the same input differs from the first", () => { let n = 0; return (files) => { const r = auditFiles(files); return n++ % 2 ? { ...r, findings: [...r.findings].reverse() } : r; }; }],
];

// ---------------------------------------------------------------- repository checks
//
// The engine above is pure. These run the command itself over real git repositories, because the scope a range
// resolves to, the refusals, and the one claim this batch rests on (a recorded observation goes stale the moment a
// file it read changes) are not reachable from a pure function. They need git; when it is absent they are reported
// NOT RUN, never as passed.

const CLI = join(dirname(fileURLToPath(import.meta.url)), "skilliton.mjs");
const SECURITY = join(".skilliton", "security");
const TEMPS = [];

const fixtureControl = (id) => ({
  id,
  title: `Fixture control ${id}`,
  mappings: [{ framework: "Fixture", version: "1", reference: "A.1", url: "https://example.invalid/r", relationship: "related" }],
  expectedEvidence: ["The audit report and the manifest of the files it read"],
});

// A git repository in a temporary folder, its files committed, with a helper for each thing a check needs. HOME and
// the git config are redirected so nothing here reads or writes this machine's own settings.
function repository(files, { controls = null } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-audit-"));
  TEMPS.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(home, ".gitconfig"), "");
  const env = {
    ...process.env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    SKILLITON_BACKUPS: join(root, "backups"),
    PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter),
  };
  delete env.SKILLITON_DEBUG;
  const write = (rel, text) => {
    mkdirSync(dirname(join(project, rel)), { recursive: true });
    writeFileSync(join(project, rel), text);
  };
  const git = (...args) => spawnSync("git", ["-C", project, ...args], { encoding: "utf8", env });
  const commit = (message) => { git("add", "-A"); git("commit", "-q", "-m", message); };
  git("init", "-q", "-b", "main", ".");
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  if (controls) {
    mkdirSync(join(project, SECURITY, "records"), { recursive: true });
    write(join(SECURITY, "catalog.json"), `${JSON.stringify({ schemaVersion: 1, catalogVersion: "fixture-1", controls: controls.map(fixtureControl) }, null, 2)}\n`);
  }
  commit("the fixture tree");
  const call = (args, input) => {
    const r = spawnSync(process.execPath, [CLI, "audit", "--dir", project, ...args], { encoding: "utf8", env, input });
    if (r.error) throw r.error;
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const remote = () => {
    const bare = join(root, "remote.git");
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", bare], { encoding: "utf8", env });
    git("remote", "add", "origin", bare);
    return bare;
  };
  const push = (...args) => {
    const r = git("push", "origin", ...args);
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const hookPath = join(project, ".git", "hooks", "pre-push");
  return {
    root, project, env, write, git, commit, remote, push, hookPath,
    audit: (...args) => call(args, undefined),
    prePush: (input) => call(["--pre-push"], input),
    rows: () => evaluateSecurity(project).rows,
  };
}

const freshness = (repo, id) => repo.rows().find((row) => row.control.id === id)?.freshness ?? "no such control";
const listing = (dir) => { try { return readdirSync(dir); } catch { return []; } };
const recordFiles = (repo) => listing(join(repo.project, SECURITY, "records")).filter((n) => n.endsWith(".json"));
const evidenceFiles = (repo) => listing(join(repo.project, ".skilliton", "private-evidence"));
// docs/CONTRACTS.md section on exit codes: 2 is "invalid or refused ... nothing was written". The guarantee is the
// one worth checking, so this asserts the code and then that the project really is untouched, rather than matching
// the wording of a message. A refusal that had already written a record would pass a string check and fail this one.
function refused(repo, r, what) {
  if (r.code !== 2) return `${what} exited ${r.code}, not the refusal code 2:\n${r.out}`;
  if (!/refused/.test(r.out)) return `${what} exited 2 without saying it was refused:\n${r.out}`;
  const wrote = [...recordFiles(repo), ...evidenceFiles(repo)];
  return wrote.length ? `${what} was refused and still wrote ${wrote.join(", ")}` : "";
}

const REPO_CHECKS = [
  ["a range is read at the commit it names, not from the working tree", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    repo.write("src/a.mjs", `export const token = "${TOKEN}";\n`);
    repo.commit("the flaw");
    repo.write("src/a.mjs", "export const ok = 1;\n"); // the working tree is clean again
    const ranged = repo.audit("--range", "HEAD~1..HEAD");
    if (ranged.code !== 1) return `the range should have found the committed flaw, exited ${ranged.code}:\n${ranged.out}`;
    if (!/known-token-prefix/.test(ranged.out)) return `the range did not name the rule:\n${ranged.out}`;
    const working = repo.audit();
    if (working.code !== 0) return `the working tree is clean and the audit exited ${working.code}:\n${working.out}`;
    return "";
  }],

  ["a file that was never committed is in the working scope", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    repo.write("src/new.mjs", `const key = "${PRIVATE_KEY}";\n`);
    const r = repo.audit();
    return r.code === 1 && /src\/new\.mjs/.test(r.out) ? "" : `an untracked file was not read:\n${r.out}`;
  }],

  ["a revision git could read as an option or a command is refused, and never reaches git", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    // Two different guards: the option parser rejects a value that starts with a dash before the command sees it,
    // and the revision pattern rejects anything git would not read as a single revision.
    for (const [range, what] of [["--upload-pack=x..HEAD", "a range starting with a dash"], ["HEAD;rm -rf .." + "." , "a range carrying a command"], ["a b..HEAD", "a range with a space"]]) {
      const bad = refused(repo, repo.audit("--range", range), what);
      if (bad) return bad;
    }
    return "";
  }],

  ["--apply without --record is refused", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    return refused(repo, repo.audit("--apply"), "--apply on its own");
  }],

  ["--record with --range is refused, because the register re-reads the working tree", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" }, { controls: AUDIT_CONTROLS });
    return refused(repo, repo.audit("--range", "HEAD~1..HEAD", "--record", "--apply"), "--record with a range");
  }],

  ["--record over a scope that read no files is refused", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" }, { controls: AUDIT_CONTROLS });
    return refused(repo, repo.audit("--record", "--apply"), "--record on a clean tree");
  }],

  ["one record per control, and a control the catalog lacks is named, not skipped", () => {
    const kept = AUDIT_CONTROLS.slice(0, AUDIT_CONTROLS.length - 1);
    const absent = AUDIT_CONTROLS[AUDIT_CONTROLS.length - 1];
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" }, { controls: kept });
    repo.write("src/a.mjs", "export const ok = 2;\n");
    const r = repo.audit("--record", "--apply");
    if (r.code !== 0) return `a clean scope should record and exit 0, exited ${r.code}:\n${r.out}`;
    if (recordFiles(repo).length !== kept.length) return `wrote ${recordFiles(repo).length} record(s) for ${kept.length} control(s):\n${r.out}`;
    if (!r.out.includes(absent)) return `${absent} is not in the catalog and the run did not say so:\n${r.out}`;
    for (const id of kept) if (freshness(repo, id) !== "current") return `${id} recorded as ${freshness(repo, id)}, not current`;
    return "";
  }],

  ["a recorded observation goes stale the moment a file it read changes", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n", "src/b.mjs": "export const ok = 2;\n" }, { controls: AUDIT_CONTROLS });
    repo.write("src/a.mjs", "export const ok = 3;\n");
    const r = repo.audit("--record", "--apply");
    if (r.code !== 0) return `recording exited ${r.code}:\n${r.out}`;
    const control = AUDIT_CONTROLS[0];
    if (freshness(repo, control) !== "current") return `${control} was ${freshness(repo, control)} straight after recording`;
    repo.write("src/a.mjs", "export const ok = 4;\n"); // a file the manifest lists
    if (freshness(repo, control) !== "stale") return `${control} stayed ${freshness(repo, control)} after an audited file changed`;
    return "";
  }],

  ["a record's note carries counts and rule names, never a path", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" }, { controls: AUDIT_CONTROLS });
    repo.write("src/a.mjs", `const key = "${PRIVATE_KEY}";\n`);
    const r = repo.audit("--record", "--apply");
    if (r.code !== 1) return `a finding should exit 1, exited ${r.code}:\n${r.out}`;
    for (const name of recordFiles(repo)) {
      const note = JSON.parse(readFileSync(join(repo.project, SECURITY, "records", name), "utf8")).note ?? "";
      if (/src\/a\.mjs/.test(note)) return `a note names an audited path, which can itself read as a secret: ${note}`;
      if (secretShaped(note)) return `a note is secret shaped, which createRecord would refuse: ${note}`;
    }
    return "";
  }],

  ["the installed hook prints a finding and the push still goes through", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    repo.remote();
    const installed = repo.audit("install", "--pre-push", "--apply");
    if (installed.code !== 0) return `install exited ${installed.code}:\n${installed.out}`;
    if ((statSync(repo.hookPath).mode & 0o111) !== 0o111) return "the hook was written without the executable bit";
    repo.write("src/a.mjs", `const token = "${TOKEN}";\n`);
    repo.commit("the flaw");
    const pushed = repo.push("main");
    // The claim this check exists for: the finding is printed and the push is not stopped. A hook that blocked here
    // would teach the next person to pass --no-verify, which is the rule the audit's own policy control looks for.
    if (pushed.code !== 0) return `the hook stopped the push, which it must never do:\n${pushed.out}`;
    if (!/known-token-prefix/.test(pushed.out)) return `the push printed no finding:\n${pushed.out}`;
    if (pushed.out.includes(TOKEN)) return "the hook printed the planted value";
    return "";
  }],

  ["a second push reads only the commits it adds", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n", "src/old.mjs": `const key = "${PRIVATE_KEY}";\n` });
    repo.remote();
    repo.audit("install", "--pre-push", "--apply");
    const first = repo.push("main");
    if (first.code !== 0) return `the first push failed:\n${first.out}`;
    if (!/src\/old\.mjs/.test(first.out)) return `the first push did not read the files it carried:\n${first.out}`;
    repo.write("src/new.mjs", "export const clean = 2;\n");
    repo.commit("a clean commit");
    const second = repo.push("main");
    if (second.code !== 0) return `the second push failed:\n${second.out}`;
    if (/src\/old\.mjs/.test(second.out)) return `the second push read a file it did not carry:\n${second.out}`;
    if (!/nothing found/.test(second.out)) return `the second push carried nothing and did not say so:\n${second.out}`;
    return "";
  }],

  ["a ref being deleted, and a line that is not four fields, are named and not audited", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    const head = repo.git("rev-parse", "HEAD").stdout.trim();
    const zero = "0".repeat(head.length);
    const r = repo.prePush(`refs/heads/gone ${zero} refs/heads/gone ${head}\nrefs/heads/odd ${head}\n`);
    if (r.code !== 0) return `two unauditable lines should be reported and exit 0, exited ${r.code}:\n${r.out}`;
    if (!/being deleted/.test(r.out)) return `a deletion was not named:\n${r.out}`;
    if (!/four fields/.test(r.out)) return `a malformed line was not named:\n${r.out}`;
    return "";
  }],

  ["a pre-push hook this command did not write is refused and left alone", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    const theirs = "#!/bin/sh\n# somebody else's hook\nexit 0\n";
    mkdirSync(dirname(repo.hookPath), { recursive: true });
    writeFileSync(repo.hookPath, theirs, { mode: 0o755 });
    const bad = refused(repo, repo.audit("install", "--pre-push", "--apply"), "install over a hook it did not write");
    if (bad) return bad;
    return readFileSync(repo.hookPath, "utf8") === theirs ? "" : "the hook that was there was overwritten";
  }],

  ["core.hooksPath is refused, because a hook written to .git/hooks would never run", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    repo.git("config", "core.hooksPath", join(repo.root, "elsewhere"));
    const r = repo.audit("install", "--pre-push", "--apply");
    const bad = refused(repo, r, "install with core.hooksPath set");
    if (bad) return bad;
    if (!/core\.hooksPath/.test(r.out)) return `the refusal did not name core.hooksPath:\n${r.out}`;
    return listing(dirname(repo.hookPath)).includes("pre-push") ? "a hook was written anyway" : "";
  }],

  ["install without --apply writes no hook and sets no config", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" });
    const r = repo.audit("install", "--pre-push");
    if (r.code !== 0) return `a preview should exit 0, exited ${r.code}:\n${r.out}`;
    if (!/Nothing was written/.test(r.out)) return `the preview did not say nothing was written:\n${r.out}`;
    if (listing(dirname(repo.hookPath)).includes("pre-push")) return "the preview wrote the hook";
    return repo.git("config", "--get", "skilliton.auditRuntime").status === 0 ? "the preview set the config" : "";
  }],

  ["the report names the finding and never the planted value", () => {
    const repo = repository({ "src/a.mjs": "export const ok = 1;\n" }, { controls: AUDIT_CONTROLS });
    repo.write("src/a.mjs", `const token = "${TOKEN}";\n`);
    const r = repo.audit("--record", "--apply");
    if (r.out.includes(TOKEN)) return "the planted value was printed";
    const dir = join(repo.project, ".skilliton", "private-evidence");
    const reports = readdirSync(dir).filter((n) => n.endsWith("-audit.txt"));
    if (reports.length !== 1) return `expected one report, found ${reports.length}`;
    const report = readFileSync(join(dir, reports[0]), "utf8");
    if (!/known-token-prefix/.test(report)) return "the report does not name the rule";
    return report.includes(TOKEN) ? "the report carries the planted value" : "";
  }],
];

function runRepoChecks() {
  if (spawnSync("git", ["--version"], { encoding: "utf8" }).status !== 0) return { skipped: true, results: [] };
  const results = REPO_CHECKS.map(([name, check]) => {
    try { return { name, fail: check() }; } catch (e) { return { name, fail: `threw: ${e.message}` }; }
  });
  return { skipped: false, results };
}

function run(audit) {
  return CHECKS.map(([name, check]) => {
    try { return { name, fail: check(audit) }; } catch (e) { return { name, fail: `threw: ${e.message}` }; }
  });
}

function selfTest() {
  let unkilled = 0;
  const kills = new Set();
  for (const [name, mutant] of MUTANTS) {
    const killed = run(mutant()).filter((r) => r.fail);
    if (!killed.length) unkilled++;
    console.log(`${killed.length ? "ok  " : "FAIL"} ${name}`);
    for (const k of killed) { console.log(`       kills: ${k.name}`); kills.add(k.name); }
    if (!killed.length) console.log("       kills nothing: no check holds this behavior");
  }
  // Which checks no mutant kills is the measurement, not a gap to be rounded away. Such a check is a regression
  // guard: it names a behavior directly and does not lean on another check's exactness, which is worth keeping and
  // is a different claim from being mutant-justified. It is printed so the batch evidence can say which is which.
  const guards = CHECKS.map(([name]) => name).filter((name) => !kills.has(name));
  if (guards.length) {
    console.log(`\n${plural(guards.length, "check")} that no mutant kills, kept as regression guards:`);
    for (const name of guards) console.log(`       ${name}`);
  }
  console.log(unkilled
    ? `\naudit self-test FAILED: ${plural(unkilled, "mutant")} changed the result and no check noticed`
    : `\naudit self-test passed: each of ${plural(MUTANTS.length, "mutant")} is killed by at least one check, and ${guards.length ? `${kills.size} of ${CHECKS.length} checks are mutant-justified, the other ${guards.length} named above` : `all ${CHECKS.length} checks are mutant-justified`}`);
  return unkilled ? 1 : 0;
}

function main() {
  // The self-test mutates the pure engine, which is the only half a mutant can be written against; the repository
  // checks run the real command and are reported by the ordinary run.
  if (process.argv.includes("--self-test")) return selfTest();
  const results = run(auditFiles);
  for (const r of results) console.log(`${r.fail ? "FAIL" : "ok  "} ${r.name}${r.fail ? `: ${r.fail}` : ""}`);
  const repo = runRepoChecks();
  for (const r of repo.results) console.log(`${r.fail ? "FAIL" : "ok  "} ${r.name}${r.fail ? `: ${r.fail}` : ""}`);
  if (repo.skipped) console.log(`NOT RUN    ${plural(REPO_CHECKS.length, "repository check")}: git is not on the path, so the scope, the refusals and the staleness of a recorded observation were not checked`);
  for (const dir of TEMPS) rmSync(dir, { recursive: true, force: true });

  const failed = [...results, ...repo.results].filter((r) => r.fail).length;
  const total = results.length + repo.results.length;
  const measured = auditFiles(FIXTURE);
  if (failed) {
    console.log(`\naudit check FAILED: ${plural(failed, "check")} of ${total}`);
    return 1;
  }
  console.log(`\naudit check passed: ${results.length} engine checks over ${plural(AUDIT_RULES.length, "rule")} and ${repo.skipped ? "no repository check (git absent)" : plural(repo.results.length, "repository check")}; the fixture gives ${auditSummary(measured)}`);
  // A run that could not reach the repository checks has not proved the command, only the engine. It says so and
  // reports attention rather than success, because a skipped check read as a pass is the failure this repository
  // exists to stop.
  return repo.skipped ? 1 : 0;
}

process.exitCode = main();
