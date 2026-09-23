#!/usr/bin/env node
// record-header.test.mjs: prepare.recordHeader (packs/base/plugins/workflow/runtime/lib/config.mjs formatRecordHeader
// and recordHeaderPrefix), the one place every record writer gets its opening "Kind: {kind}" line from, and the one
// reader (lib/handoff.mjs prependArchive) that has to recognize that line without knowing the kind text it carries.
//
// Unit tests exercise config.mjs directly; the end-to-end test runs `skilliton prepare`, `task start` and `record`
// the way a person runs them, in a temporary Git repository, and checks a configured header ("> {kind}") reaches
// every generated file and every new record, while the unconfigured default stays byte for byte what it always was.
//
//   node --test scripts/record-header.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const config = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "config.mjs")).href);
const projectFiles = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "project-files.mjs")).href);
const tasksLib = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "tasks.mjs")).href);
const handoffLib = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "handoff.mjs")).href);

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

const git = (ctx, ...args) => execFileSync("git", ["-C", ctx.dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (ctx, message) => { git(ctx, "add", "-A"); git(ctx, "commit", "-q", "-m", message); };

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-record-header-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d);
  git(ctx, "init", "-q", "-b", "main");
  return ctx;
}

function sg(ctx, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

function writeConfig(ctx, section) {
  mkdirSync(join(ctx.dir, ".skilliton"), { recursive: true });
  writeFileSync(join(ctx.dir, ".skilliton", "config.json"), JSON.stringify({ prepare: section }, null, 2));
}

const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");

// ---------------------------------------------------------------- config.mjs: formatRecordHeader, recordHeaderPrefix

test("formatRecordHeader replaces every {kind} token; recordHeaderPrefix is the fixed text before it", () => {
  assert.equal(config.formatRecordHeader("Kind: {kind}", "Living."), "Kind: Living.");
  assert.equal(config.formatRecordHeader("> {kind}", "Reference. See docs/BACKLOG.md."), "> Reference. See docs/BACKLOG.md.");
  assert.equal(config.formatRecordHeader("{kind} {kind}", "X"), "X X", "every occurrence is replaced, not only the first");
  assert.equal(config.recordHeaderPrefix(), "Kind: ", "the default prefix matches the header this runtime always wrote");
  assert.equal(config.recordHeaderPrefix("Kind: {kind}"), "Kind: ");
  assert.equal(config.recordHeaderPrefix("> {kind}"), "> ");
  assert.equal(config.recordHeaderPrefix("no token here"), "no token here", "a header with no {kind} is its own prefix, never a crash");
  assert.equal(config.DEFAULTS.recordHeader, "Kind: {kind}");
});

// ---------------------------------------------------------------- configProblems / resolveProject

test("prepare.recordHeader is validated: one line, no control characters, at most 200 characters, must contain {kind}", () => {
  const bad = [
    [undefined, false], // absent is fine, not a problem
    ["", true], ["Kind: Living.", true], // no {kind} token
    ["Kind: {kind}\nSecond line", true], // a real embedded newline
    ["Kind: {kind}\r", true], // a control character
    [`Kind: {kind} ${"x".repeat(200)}`, true], // over 200 characters
    [123, true], [null, true],
  ];
  for (const [value, wantsProblem] of bad) {
    const config_ = value === undefined ? {} : { recordHeader: value };
    const problems = config.configProblems({ prepare: config_ });
    const found = problems.some((p) => p.includes("prepare.recordHeader"));
    assert.equal(found, wantsProblem, `recordHeader ${JSON.stringify(value)}: expected a problem to be ${wantsProblem}, problems: ${JSON.stringify(problems)}`);
  }
  for (const good of ["Kind: {kind}", "> {kind}", "{kind}", "# {kind} #"]) {
    const problems = config.configProblems({ prepare: { recordHeader: good } });
    assert.equal(problems.some((p) => p.includes("prepare.recordHeader")), false, `${JSON.stringify(good)} should be accepted: ${JSON.stringify(problems)}`);
  }
});

test("resolveProject defaults recordHeader to Kind: {kind} and picks up a configured override", (t) => {
  const ctx = fixture(t);
  writeConfig(ctx, {});
  let project = config.resolveProject(ctx.dir);
  assert.equal(project.recordHeader, "Kind: {kind}");

  writeConfig(ctx, { recordHeader: "> {kind}" });
  project = config.resolveProject(ctx.dir);
  assert.equal(project.recordHeader, "> {kind}");

  writeConfig(ctx, { recordHeader: "no token" });
  assert.throws(() => config.resolveProject(ctx.dir), /prepare\.recordHeader/);
});

// ---------------------------------------------------------------- every doc() template honors the configured header

test("recordTemplate, entryFolderReadme, entryTemplate, securityReadme and recordsReadme all open with the configured header, and the unconfigured default is unchanged", () => {
  const fakeProject = {
    artifacts: {
      status: "docs/STATUS.md", backlog: "docs/BACKLOG.md", backlogArchive: "docs/BACKLOG_ARCHIVE.md", roadmap: "docs/ROADMAP.md",
      decisions: "DECISIONS.md", lessons: "docs/LESSONS.md", handoff: "docs/HANDOFF.md", handoffArchive: "docs/HANDOFF_ARCHIVE.md", maintain: "docs/MAINTAIN.md",
    },
    directories: { tasks: "docs/tasks", decisions: "docs/decisions", lessons: "docs/lessons" },
    integrationBranches: ["main"],
    recordHeader: "Kind: {kind}",
  };
  const custom = { ...fakeProject, recordHeader: "> {kind}" };
  // Every doc()-based template opens "# <title>\n\n<header>\n\n...": the header line is always index 2.
  const firstLine = (text) => text.split("\n")[2];

  for (const role of ["status", "backlog", "backlogArchive", "roadmap", "decisions", "lessons", "handoff", "handoffArchive", "maintain"]) {
    const defaultText = projectFiles.recordTemplate(role, fakeProject);
    assert.match(firstLine(defaultText), /^Kind: /, `${role}: default header`);
    const customText = projectFiles.recordTemplate(role, custom);
    assert.match(firstLine(customText), /^> /, `${role}: configured header`);
    // Nothing but the header line itself differs between the two renders.
    const defaultLines = defaultText.split("\n"), customLines = customText.split("\n");
    assert.equal(defaultLines.length, customLines.length, role);
    for (let i = 0; i < defaultLines.length; i++) if (i !== 2) assert.equal(customLines[i], defaultLines[i], `${role} line ${i}`);
  }

  for (const kind of ["tasks", "decisions", "lessons"]) {
    assert.match(firstLine(projectFiles.entryFolderReadme(kind, fakeProject)), /^Kind: /, kind);
    assert.match(firstLine(projectFiles.entryFolderReadme(kind, custom)), /^> /, kind);
    // The example record shape shown inside the README (indented four spaces) reflects the same configured header.
    assert.match(projectFiles.entryFolderReadme(kind, custom), /\n {4}> Living\./, `${kind}: the sample record inside the README also uses the configured header`);
    assert.doesNotMatch(projectFiles.entryFolderReadme(kind, custom), /\n {4}Kind: Living\./, `${kind}: the sample no longer shows the old default once configured`);
  }

  const entryDefault = projectFiles.entryTemplate("decision", { title: "T", id: "x", status: "accepted", date: "2026-09-23" });
  assert.match(firstLine(entryDefault), /^Kind: Living\. Decision entry\.$/);
  const entryCustom = projectFiles.entryTemplate("lesson", { title: "T", id: "x", status: "accepted", date: "2026-09-23", header: "> {kind}" });
  assert.match(firstLine(entryCustom), /^> Living\. Lesson entry\.$/);

  assert.match(firstLine(projectFiles.securityReadme()), /^Kind: /);
  assert.match(firstLine(projectFiles.securityReadme(custom)), /^> /);
  assert.match(firstLine(projectFiles.recordsReadme()), /^Kind: /);
  assert.match(firstLine(projectFiles.recordsReadme(custom)), /^> /);
});

test("renderTask honors recordHeader and defaults to Kind: {kind} when none is given", () => {
  const base = { id: "2026-09-23-x-aaaa", title: "T", branch: "main", owner: "me", updated: "2026-09-23T00:00:00.000Z" };
  assert.match(tasksLib.renderTask(base).split("\n")[2], /^Kind: Living\. Task record\.$/);
  assert.match(tasksLib.renderTask({ ...base, recordHeader: "> {kind}" }).split("\n")[2], /^> Living\. Task record\.$/);
});

test("prependArchive recognizes a configured header's prefix, not only the literal word Kind", () => {
  const entries = [{ heading: "2026-09-19 01:00 EDT", lines: ["- **State:** One."] }];
  const defaultArchive = "# Handoff archive\n\nKind: Reference. text.\n\nNo earlier handoffs have been archived.\n";
  assert.match(handoffLib.prependArchive(defaultArchive, entries), /^# Handoff archive\n\nKind: Reference\. text\.\n\n### /);
  const customArchive = "# Handoff archive\n\n> Reference. text.\n\nNo earlier handoffs have been archived.\n";
  assert.match(handoffLib.prependArchive(customArchive, entries, config.recordHeaderPrefix("> {kind}")), /^# Handoff archive\n\n> Reference\. text\.\n\n### /);
  // Without the matching prefix (the caller still thinks it is "Kind:"), the entry lands after the title instead,
  // because the header line is never recognized as the header.
  const missed = handoffLib.prependArchive(customArchive, entries);
  assert.doesNotMatch(missed, /^# Handoff archive\n\n> Reference\. text\.\n\n### /, "a caller that never passes the configured prefix cannot find the header line");
});

// ---------------------------------------------------------------- end to end: a configured header reaches every new record

test("a project configuring prepare.recordHeader gets it on every scaffolded record, every new task, decision and lesson, and the unconfigured default is byte-identical to before", (t) => {
  const plain = fixture(t);
  const p1 = sg(plain, ["prepare", "--apply"]);
  assert.equal(p1.code, 0, p1.all);
  commit(plain, "prepared");
  for (const rel of ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md", "docs/tasks/README.md", "docs/decisions/README.md", "docs/lessons/README.md", "docs/security/README.md", ".skilliton/security/records/README.md"]) {
    assert.match(read(plain, rel), /^Kind: /m, `${rel} keeps the unconfigured default header`);
  }

  const ctx = fixture(t);
  writeConfig(ctx, { recordHeader: "> {kind}" });
  const p2 = sg(ctx, ["prepare", "--apply"]);
  assert.equal(p2.code, 0, p2.all);
  commit(ctx, "prepared");
  for (const rel of ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md", "docs/tasks/README.md", "docs/decisions/README.md", "docs/lessons/README.md", "docs/security/README.md", ".skilliton/security/records/README.md"]) {
    const text = read(ctx, rel);
    assert.match(text, /^> /m, `${rel} opens with the configured header`);
    assert.doesNotMatch(text, /^Kind: /m, `${rel} no longer carries the old default`);
  }

  const started = sg(ctx, ["task", "start", "Configured header task", "--branch", "main", "--apply"]);
  assert.equal(started.code, 0, started.all);
  const taskId = /created \S+\/([^/\s]+)\.md/.exec(started.out)[1];
  assert.match(read(ctx, `docs/tasks/${taskId}.md`), /^> Living\. Task record\.$/m);
  commit(ctx, "task started");

  const decision = sg(ctx, ["record", "decision", "Configured header decision", "--apply"]);
  assert.equal(decision.code, 0, decision.all);
  const decisionRel = /Created (\S+\.md)/.exec(decision.out)[1];
  assert.match(read(ctx, decisionRel), /^> Living\. Decision entry\.$/m);

  const lesson = sg(ctx, ["record", "lesson", "Configured header lesson", "--apply"]);
  assert.equal(lesson.code, 0, lesson.all);
  const lessonRel = /Created (\S+\.md)/.exec(lesson.out)[1];
  assert.match(read(ctx, lessonRel), /^> Living\. Lesson entry\.$/m);

  // Existing records (written before the configuration was set, or under the old default) keep reading and indexing.
  writeConfig(plain, { recordHeader: "> {kind}" });
  const indexAfterConfigChange = sg(plain, ["index", "--apply"]);
  assert.equal(indexAfterConfigChange.code, 0, indexAfterConfigChange.all, "a record written under the old default is still readable once the project reconfigures its header");
});

test("an invalid prepare.recordHeader is refused by prepare, and nothing is written", (t) => {
  const ctx = fixture(t);
  writeConfig(ctx, { recordHeader: "no kind token here" });
  const r = sg(ctx, ["prepare", "--apply"]);
  assert.notEqual(r.code, 0, r.all);
  assert.match(r.all, /prepare\.recordHeader/);
});

test("this test file holds no forbidden dash characters or home paths", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(text.includes(String.fromCharCode(0x2014)) || text.includes(String.fromCharCode(0x2013)), false);
  assert.equal(new RegExp(["/Us", "ers/[A-Za-z0-9._-]+/|/ho", "me/[A-Za-z0-9._-]+/"].join("")).test(text), false);
});
