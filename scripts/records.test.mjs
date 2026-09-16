#!/usr/bin/env node
// records.test.mjs: entry IDs, `skillgate record` and `skillgate index` (packs/base/plugins/workflow/runtime/lib/records.mjs).
//
// Commands run the way a person runs them (node scripts/skillgate.mjs ...) in a temporary Git repository under the
// system temp folder, with HOME and Git's global configuration pointed away from the real ones; each test removes its
// folder. Expected index text is written out here by hand rather than produced by the renderer under test. The
// mutation check edits a temporary copy of the plugin, never the shipped code.
//
//   node --test scripts/records.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skillgate.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const records = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "records.mjs")).href);
const ids = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "ids.mjs")).href);
const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{4}$/;

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLGATE_SELF: "skillgate", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skillgate Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skillgate Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLGATE_DEBUG;
  return env;
})();

const git = (ctx, ...args) => execFileSync("git", ["-C", ctx.dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const gitStatus = (ctx, ...args) => spawnSync("git", ["-C", ctx.dir, ...args], { env: BASE_ENV, encoding: "utf8" });
const commit = (ctx, message) => { git(ctx, "add", "-A"); git(ctx, "commit", "-q", "-m", message); };

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skillgate-records-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home"), outside: join(base, "outside") };
  for (const d of [ctx.dir, ctx.home, ctx.outside]) mkdirSync(d);
  git(ctx, "init", "-q", "-b", "main");
  return ctx;
}

function sg(ctx, args, { cli = CLI } = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const record = (ctx, ...args) => sg(ctx, ["record", ...args, "--dir", ctx.dir]);
const index = (ctx, ...args) => sg(ctx, ["index", "--dir", ctx.dir, ...args]);
function prepared(t) {
  const ctx = fixture(t);
  const r = sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]);
  assert.equal(r.code, 0, `fixture: prepare --apply: ${r.all}`);
  commit(ctx, "prepared");
  return ctx;
}

function snapshot(dir, { times = false } = {}) {
  const out = {};
  const walk = (rel) => {
    const entries = readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (!rel && e.name === ".git") continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) out[p] = `symlink to ${readlinkSync(join(dir, p))}`;
      else if (e.isDirectory()) { out[`${p}/`] = "folder"; walk(p); }
      else out[p] = readFileSync(join(dir, p)).toString("base64") + (times ? ` mtime ${statSync(join(dir, p)).mtimeMs}` : "");
    }
  };
  walk("");
  return out;
}
const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");
const write = (ctx, rel, text) => { mkdirSync(dirname(join(ctx.dir, rel)), { recursive: true }); writeFileSync(join(ctx.dir, rel), text); };
const created = (before, after) => Object.keys(after).filter((p) => !(p in before) && !p.endsWith("/")).sort();

const DECISION_SECTIONS = ["Decision", "Why", "Alternatives rejected", "Risk", "Reversibility", "Evidence"];
const LESSON_SECTIONS = ["What broke", "The mechanism", "The fix", "The rule", "What now enforces it"];
const entryText = (kind, title, id, status) => `# ${title}\n\nKind: Living. ${kind === "decision" ? "Decision" : "Lesson"} entry.\n\n- **ID:** ${id}\n- **Status:** ${status}\n- **Date:** ${id.slice(0, 10)}\n\n${(kind === "decision" ? DECISION_SECTIONS : LESSON_SECTIONS).map((s) => `## ${s}\n\nnot yet written`).join("\n\n")}\n`;

function taskFile(id, title, fields) {
  return `# Task: ${title}\n\nKind: Living. Task record.\n\n${Object.entries({ ID: id, ...fields }).map(([k, v]) => `- **${k}:** ${v}`).join("\n")}\n\n## Request\n\nA request.\n`;
}

const DECISIONS_INTRO = "Decision entries in `docs/decisions/`, sorted by ID. `skillgate index` writes this list from the entries; edit the entries, not the list.";
const LESSONS_INTRO = "Lesson entries in `docs/lessons/`, sorted by ID. `skillgate index` writes this list from the entries; edit the entries, not the list.";
const TASKS_INTRO = "Open tasks in `docs/tasks/` (every state except done-local, merged, released, verified and abandoned), sorted by ID. `skillgate index` writes this list from the task records; edit the task records, not the list.";
const section = (kind, lines) => [`<!-- skillgate:index:${kind}:start -->`, ...lines, `<!-- skillgate:index:${kind}:end -->`].join("\n") + "\n";

// ---------------------------------------------------------------- IDs

test("the one ID rule (lib/ids.mjs): local date, a slug of at most 40 characters, four random hex digits", () => {
  const late = new Date(2026, 8, 16, 23, 59, 30);
  assert.match(ids.newId("Keep orders in PostgreSQL!", { date: late }), /^2026-09-16-keep-orders-in-postgresql-[0-9a-f]{4}$/);
  assert.equal(ids.newId("x", { date: new Date(2026, 0, 5, 0, 0, 1) }).slice(0, 10), "2026-01-05", "the local date, not the UTC date");
  assert.equal(ids.newId("Fix: the login page!", { date: new Date(2026, 0, 2), hex: () => "beef" }), "2026-01-02-fix-the-login-page-beef");
  const [eAcute, aGrave, uUmlaut, iDiaeresis] = [0xe9, 0xe0, 0xfc, 0xef].map((c) => String.fromCharCode(c));
  assert.equal(ids.slugify(`Caf${eAcute} d${eAcute}j${aGrave} vu, ${uUmlaut}ber na${iDiaeresis}ve`), "cafe-deja-vu-uber-naive");
  assert.equal(ids.slugify("An extremely long decision title that keeps going well past the forty character limit"), "an-extremely-long-decision-title-that-ke");
  assert.equal(ids.slugify(`${"a".repeat(39)} b`), "a".repeat(39), "a slug cut at 40 characters never ends with a hyphen");
  assert.equal(ids.slugify("!!! ???"), "entry");
  assert.equal(ids.newId("!!!", { date: new Date(2026, 0, 2), fallback: "task", hex: () => "0a0b" }), "2026-01-02-task-0a0b");
  const made = Array.from({ length: 200 }, () => ids.newId("Same title", { date: late }));
  for (const id of made) {
    assert.match(id, ID_RE);
    assert.ok(ids.isId(id));
  }
  assert.ok(new Set(made).size > 150, "the suffix is random, not a counter");
  assert.equal(ids.isId(`2026-09-16-${"a".repeat(40)}-abcd`), true, "a 40-character slug is an ID");
  for (const bad of [`2026-09-16-${"a".repeat(41)}-abcd`, "2026-09-16-a--b-abcd", "2026-09-16-ab--abcd", "2026-09-16--ab-abcd", "2026-09-16-ab-ABCD", "2026-09-16-ab-abc", null]) {
    assert.equal(ids.isId(bad), false, `${bad} is not an ID`);
  }
  assert.throws(() => ids.newId("x", { date: new Date(Number.NaN) }), TypeError);
});

test("the ID rule is defined once: no other runtime module makes or matches IDs with its own pattern", () => {
  const runtime = join(PLUGIN, "runtime");
  const own = [];
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith(".mjs") && p !== join(runtime, "lib", "ids.mjs")) {
        const text = readFileSync(p, "utf8");
        if (text.includes("[0-9a-f]{4}") || /function (slugify|localDate|newEntryId|newTaskId)\b/.test(text)) own.push(p.slice(runtime.length + 1));
      }
    }
  };
  walk(runtime);
  assert.deepEqual(own, [], "these modules define their own ID rule; import it from lib/ids.mjs instead");
});

// ---------------------------------------------------------------- record

test("record previews by default, writes with --apply, and sets the status from the branch", (t) => {
  const ctx = prepared(t);
  let before = snapshot(ctx.dir);
  const preview = record(ctx, "decision", "Keep orders in PostgreSQL");
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /Would create docs\/decisions\/\d{4}-\d{2}-\d{2}-keep-orders-in-postgresql-[0-9a-f]{4}\.md with the status accepted \(main is an integration branch\)\./);
  assert.match(preview.out, /\nSummary: nothing written\./);
  assert.deepEqual(snapshot(ctx.dir), before, "the preview wrote nothing");

  const applied = record(ctx, "decision", "Keep orders in PostgreSQL", "--apply");
  assert.equal(applied.code, 0, applied.all);
  let after = snapshot(ctx.dir);
  const [decision] = created(before, after);
  assert.deepEqual(created(before, after), [decision], "exactly one file was created");
  const decisionId = decision.slice("docs/decisions/".length, -3);
  assert.match(decision, /^docs\/decisions\/\d{4}-\d{2}-\d{2}-keep-orders-in-postgresql-[0-9a-f]{4}\.md$/);
  assert.equal(read(ctx, decision), entryText("decision", "Keep orders in PostgreSQL", decisionId, "accepted"));
  assert.ok(Math.abs(new Date(`${decisionId.slice(0, 10)}T12:00:00`).getTime() - Date.now()) < 2 * 86400000, "the ID carries today's date");

  git(ctx, "checkout", "-q", "-b", "feature/login");
  before = snapshot(ctx.dir);
  const lesson = record(ctx, "lesson", "Seeds must be fixed in tests", "--apply");
  assert.equal(lesson.code, 0, lesson.all);
  assert.match(lesson.out, /with the status proposed \(feature\/login is not an integration branch \(main, master\)\)/);
  after = snapshot(ctx.dir);
  const [lessonPath] = created(before, after);
  assert.match(lessonPath, /^docs\/lessons\/\d{4}-\d{2}-\d{2}-seeds-must-be-fixed-in-tests-[0-9a-f]{4}\.md$/);
  assert.equal(read(ctx, lessonPath), entryText("lesson", "Seeds must be fixed in tests", lessonPath.slice("docs/lessons/".length, -3), "proposed"));

  commit(ctx, "lesson");
  git(ctx, "checkout", "-q", "--detach");
  const detached = record(ctx, "decision", "Choose a queue", "--apply");
  assert.equal(detached.code, 0, detached.all);
  assert.match(detached.out, /with the status proposed \(HEAD is detached, so this is not an integration branch\)/);

  git(ctx, "checkout", "-q", "-b", "trunk");
  const config = JSON.parse(read(ctx, ".skillgate/config.json"));
  config.prepare.integrationBranches = ["trunk"];
  write(ctx, ".skillgate/config.json", `${JSON.stringify(config, null, 2)}\n`);
  const trunk = record(ctx, "decision", "Release weekly", "--apply");
  assert.equal(trunk.code, 0, trunk.all);
  assert.match(trunk.out, /with the status accepted \(trunk is an integration branch\)/);
});

test("record refuses bad input and unsafe folders without writing", (t) => {
  const ctx = prepared(t);
  const cases = [
    [[], /needs a kind and a title/],
    [["task", "A title"], /makes "decision" or "lesson" entries, not "task"/],
    [["decision"], /record decision needs a title/],
    [["decision", "   "], /the entry needs a title/],
    [["decision", "Two", "words"], /takes one title; put the whole title in quotes/],
    [["decision", "Line one\nLine two"], /one line of plain text/],
    [["lesson", "x".repeat(201)], /keep it to 200 or fewer/],
  ];
  const before = snapshot(ctx.dir);
  for (const [args, message] of cases) {
    const r = record(ctx, ...args, "--apply");
    assert.equal(r.code, 2, `${JSON.stringify(args)}: ${r.all}`);
    assert.match(r.err, message);
    assert.deepEqual(snapshot(ctx.dir), before);
  }
  rmSync(join(ctx.dir, "docs", "decisions"), { recursive: true });
  symlinkSync(ctx.outside, join(ctx.dir, "docs", "decisions"));
  const linked = record(ctx, "decision", "Through a link", "--apply");
  assert.equal(linked.code, 2, linked.all);
  assert.match(linked.err, /symbolic link/);
  assert.deepEqual(readdirSync(ctx.outside), []);
});

// ---------------------------------------------------------------- index

test("index leaves an adopted record without markers alone until there is an entry to list, then appends the section", (t) => {
  const ctx = prepared(t);
  const adopted = "# Decisions\n\nEarlier decisions, written by people before Skillgate.\n";
  write(ctx, "DECISIONS.md", adopted);
  const before = snapshot(ctx.dir);
  const preview = index(ctx);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /current\s+DECISIONS\.md\s+decisions index: 0 decision entries in docs\/decisions\/; nothing to list and no index section yet, so the record is left as it is; the section is added with the first entry/);
  assert.match(preview.out, /Summary: every index is current; nothing written\./);
  const applied = index(ctx, "--apply");
  assert.equal(applied.code, 0, applied.all);
  assert.deepEqual(snapshot(ctx.dir), before, "an index run with nothing to list writes nothing, so no empty section contradicts the record's own history");

  assert.equal(record(ctx, "decision", "Keep orders in PostgreSQL", "--apply").code, 0);
  const withEntry = index(ctx, "--apply");
  assert.equal(withEntry.code, 0, withEntry.all);
  assert.match(withEntry.out, /DECISIONS\.md\s+decisions index: 1 decision entry in docs\/decisions\/; section appended after a blank line \(the record had no markers\)/);
  assert.ok(read(ctx, "DECISIONS.md").startsWith(`${adopted}\n<!-- skillgate:index:decisions:start -->`), "the section follows the adopted text after one blank line");
});

test("index regenerates the three managed sections, lists open tasks only, and never changes text outside the markers", (t) => {
  const ctx = prepared(t);
  const emptyDecisions = section("decisions", [DECISIONS_INTRO, "", "No decision entries yet."]);
  const decisionsRecord = read(ctx, "DECISIONS.md");
  assert.ok(decisionsRecord.includes(emptyDecisions), "fixture: prepare created the empty decisions section");
  assert.ok(read(ctx, "docs/STATUS.md").includes(section("tasks", [TASKS_INTRO, "", "No open tasks."])), "fixture: prepare created the empty tasks section");
  const clean = index(ctx);
  assert.equal(clean.code, 0, clean.all);
  assert.match(clean.out, /Summary: every index is current; nothing written\./, "a freshly prepared project's indexes are already current");

  write(ctx, "DECISIONS.md", `Human preface.\n${decisionsRecord}\nHuman footer with trailing spaces   \n`);
  write(ctx, "docs/LESSONS.md", "# Our lessons\r\nWritten by people.\r\n");
  const titles = { a: "Keep orders in PostgreSQL", b: "Retry | payments twice" };
  for (const title of Object.values(titles)) assert.equal(record(ctx, "decision", title, "--apply").code, 0);
  assert.equal(record(ctx, "lesson", "A piped gate hid a failure", "--apply").code, 0);
  write(ctx, "docs/tasks/2026-09-01-open-work-aa11.md", taskFile("2026-09-01-open-work-aa11", "Open work", { State: "in-progress", Branch: "main", Owner: "dev", Updated: "2026-09-01T10:00:00Z" }));
  write(ctx, "docs/tasks/2026-09-02-blocked-work-bb22.md", taskFile("2026-09-02-blocked-work-bb22", "Blocked work", { State: "blocked" }));
  write(ctx, "docs/tasks/2026-09-03-merged-work-cc33.md", taskFile("2026-09-03-merged-work-cc33", "Merged work", { State: "merged" }));
  write(ctx, "docs/tasks/2026-09-04-dropped-work-dd44.md", taskFile("2026-09-04-dropped-work-dd44", "Dropped work", { State: "abandoned" }));
  write(ctx, "docs/tasks/2026-09-05-odd-state-ee55.md", taskFile("2026-09-05-odd-state-ee55", "Odd state", { State: "someday" }));
  write(ctx, "docs/tasks/notes.md", "# Loose notes\n");

  const before = snapshot(ctx.dir);
  const preview = index(ctx);
  assert.equal(preview.code, 1, preview.all);
  assert.match(preview.out, /Problem: docs\/tasks\/2026-09-05-odd-state-ee55\.md has the state "someday", which is not one of .*, so it is listed as open/);
  assert.match(preview.out, /Problem: docs\/tasks\/notes\.md was not indexed: its name is not an entry ID/);
  assert.match(preview.out, /update\s+docs\/STATUS\.md\s+tasks index: 3 open task\(s\) of 5 in docs\/tasks\//);
  assert.deepEqual(snapshot(ctx.dir), before, "the preview wrote nothing");

  const applied = index(ctx, "--apply");
  assert.equal(applied.code, 1, `written, with the problems still reported: ${applied.all}`);
  assert.match(applied.out, /Summary: 3 index section\(s\) written\. 2 entry file\(s\) need attention/);

  const decisionIds = readdirSync(join(ctx.dir, "docs/decisions")).filter((n) => n !== "README.md").map((n) => n.slice(0, -3)).sort();
  const titleOf = (id) => (id.includes("postgresql") ? titles.a : "Retry \\| payments twice");
  const decisionsSection = section("decisions", [DECISIONS_INTRO, "", "| ID | Title | Status | Date |", "|---|---|---|---|",
    ...decisionIds.map((id) => `| [${id}](docs/decisions/${id}.md) | ${titleOf(id)} | accepted | ${id.slice(0, 10)} |`)]);
  assert.equal(read(ctx, "DECISIONS.md"), `Human preface.\n${decisionsRecord.replace(emptyDecisions, decisionsSection)}\nHuman footer with trailing spaces   \n`);

  const [lessonId] = readdirSync(join(ctx.dir, "docs/lessons")).filter((n) => n !== "README.md").map((n) => n.slice(0, -3));
  const lessonsSection = section("lessons", [LESSONS_INTRO, "", "| ID | Title | Status | Date |", "|---|---|---|---|", `| [${lessonId}](lessons/${lessonId}.md) | A piped gate hid a failure | accepted | ${lessonId.slice(0, 10)} |`]);
  assert.equal(read(ctx, "docs/LESSONS.md"), `# Our lessons\r\nWritten by people.\r\n\r\n${lessonsSection.replace(/\n/g, "\r\n")}`, "a record without markers gets the section appended, in its own line endings");

  const tasksSection = section("tasks", [TASKS_INTRO, "", "| ID | Title | State | Branch | Owner | Updated |", "|---|---|---|---|---|---|",
    "| [2026-09-01-open-work-aa11](tasks/2026-09-01-open-work-aa11.md) | Open work | in-progress | main | dev | 2026-09-01T10:00:00Z |",
    "| [2026-09-02-blocked-work-bb22](tasks/2026-09-02-blocked-work-bb22.md) | Blocked work | blocked | (missing) | (missing) | (missing) |",
    "| [2026-09-05-odd-state-ee55](tasks/2026-09-05-odd-state-ee55.md) | Odd state | someday | (missing) | (missing) | (missing) |"]);
  const status = read(ctx, "docs/STATUS.md");
  assert.ok(status.endsWith(tasksSection), status);
  assert.doesNotMatch(status, /merged-work|dropped-work/, "closed tasks are not listed");

  const settled = snapshot(ctx.dir, { times: true });
  const repeat = index(ctx, "--apply");
  assert.equal(repeat.code, 1, repeat.all);
  assert.match(repeat.out, /Summary: every index is current; nothing written\./);
  assert.deepEqual(snapshot(ctx.dir, { times: true }), settled, "a repeat run rewrites nothing");
});

test("index refuses malformed markers, a missing record, and writing on a branch that is not an integration branch", (t) => {
  const ctx = prepared(t);
  const original = read(ctx, "DECISIONS.md");
  const start = "<!-- skillgate:index:decisions:start -->", end = "<!-- skillgate:index:decisions:end -->";
  const cases = [
    [`${original}\n${start}\n${end}\n`, /more than one decisions index start marker/],
    [original.replace(`${start}\n`, ""), /decisions index end marker \(line \d+\) without its partner/],
    [original.replace(start, "<!-- skillgate:index:decisions:begin -->"), /starts like a decisions index marker but is not exactly/],
  ];
  for (const [text, message] of cases) {
    write(ctx, "DECISIONS.md", text);
    const before = snapshot(ctx.dir);
    const r = index(ctx, "--apply");
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, message);
    assert.deepEqual(snapshot(ctx.dir), before);
  }
  write(ctx, "DECISIONS.md", original);
  rmSync(join(ctx.dir, "docs/STATUS.md"));
  let before = snapshot(ctx.dir);
  const missing = index(ctx, "--apply");
  assert.equal(missing.code, 2, missing.all);
  assert.match(missing.err, /the status record docs\/STATUS\.md does not exist/);
  assert.deepEqual(snapshot(ctx.dir), before);
  git(ctx, "checkout", "-q", "--", "docs/STATUS.md");

  git(ctx, "checkout", "-q", "-b", "feature/x");
  assert.equal(record(ctx, "decision", "A lane decision", "--apply").code, 0);
  before = snapshot(ctx.dir);
  const preview = index(ctx);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /\(branch feature\/x, not an integration branch\)/);
  assert.match(preview.out, /Summary: 1 index section\(s\) would change; nothing written\. --apply writes indexes only on an integration branch \(main, master\)\./);
  const refused = index(ctx, "--apply");
  assert.equal(refused.code, 2, refused.all);
  assert.match(refused.err, /indexes are written on an integration branch \(main, master\), and this branch is feature\/x\. Nothing was written/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

test("entries created on two branches never collide, and index regeneration after merging both is deterministic", (t) => {
  const ctx = prepared(t);
  const base = git(ctx, "rev-parse", "HEAD").trim();
  const entryNames = () => ["docs/decisions", "docs/lessons"].flatMap((d) => readdirSync(join(ctx.dir, d)).filter((n) => n !== "README.md").map((n) => `${d}/${n}`));

  git(ctx, "checkout", "-q", "-b", "lane-a");
  assert.equal(record(ctx, "decision", "Use PostgreSQL for orders", "--apply").code, 0);
  assert.equal(record(ctx, "lesson", "Fixtures need fixed seeds", "--apply").code, 0);
  const laneA = entryNames();
  commit(ctx, "lane a entries");
  git(ctx, "checkout", "-q", "-b", "lane-b", base);
  assert.equal(record(ctx, "decision", "Cache sessions in Redis", "--apply").code, 0);
  assert.equal(record(ctx, "decision", "Retry payments twice", "--apply").code, 0);
  const laneB = entryNames();
  commit(ctx, "lane b entries");
  assert.equal(laneA.length, 2);
  assert.equal(laneB.length, 2);
  assert.deepEqual(laneA.filter((p) => laneB.includes(p)), [], "no entry file is shared between the branches");
  for (const p of [...laneA, ...laneB]) assert.match(p.split("/").pop().slice(0, -3), ID_RE);

  const indexRecords = () => Object.fromEntries(["DECISIONS.md", "docs/LESSONS.md", "docs/STATUS.md"].map((p) => [p, read(ctx, p)]));
  const mergeClean = (branch) => { const r = gitStatus(ctx, "merge", "-q", "--no-edit", branch); assert.equal(r.status, 0, `merge ${branch}: ${r.stdout}${r.stderr}`); };

  git(ctx, "checkout", "-q", "main");
  mergeClean("lane-a");
  mergeClean("lane-b");
  assert.deepEqual(entryNames().sort(), [...laneA, ...laneB].sort(), "both branches' entries are present after merging");
  assert.equal(index(ctx, "--apply").code, 0);
  const orderAB = indexRecords();
  assert.match(orderAB["DECISIONS.md"], /Use PostgreSQL for orders \| proposed/);
  commit(ctx, "index after merging a then b");

  git(ctx, "checkout", "-q", "-b", "master", base);
  mergeClean("lane-b");
  mergeClean("lane-a");
  assert.equal(index(ctx, "--apply").code, 0);
  assert.deepEqual(indexRecords(), orderAB, "merging in the other order produces the same bytes");
  commit(ctx, "index after merging b then a");

  git(ctx, "checkout", "-q", "main");
  git(ctx, "reset", "-q", "--hard", base);
  mergeClean("lane-a");
  assert.equal(index(ctx, "--apply").code, 0);
  commit(ctx, "index with lane a only");
  git(ctx, "checkout", "-q", "master");
  git(ctx, "reset", "-q", "--hard", base);
  mergeClean("lane-b");
  assert.equal(index(ctx, "--apply").code, 0);
  commit(ctx, "index with lane b only");
  git(ctx, "checkout", "-q", "main");
  const conflicted = gitStatus(ctx, "merge", "--no-edit", "master");
  assert.notEqual(conflicted.status, 0, "fixture: both integration branches rewrote the decisions index, so the merge conflicts");
  assert.match(read(ctx, "DECISIONS.md"), /^<<<<<<< /m);
  const resolved = index(ctx, "--apply");
  assert.equal(resolved.code, 0, resolved.all);
  assert.deepEqual(indexRecords(), orderAB, "rerunning index after the merge resolves the conflict to the same bytes");
  git(ctx, "add", "-A");
  const finished = gitStatus(ctx, "commit", "-q", "--no-edit");
  assert.equal(finished.status, 0, `${finished.stdout}${finished.stderr}`);
});

// ---------------------------------------------------------------- mutation check

test("mutation: without the closed-state filter, the open-tasks assertion fails", (t) => {
  const ctx = prepared(t);
  const copy = join(ctx.base, "plugin-copy", "workflow");
  cpSync(PLUGIN, copy, { recursive: true });
  const engine = join(copy, "runtime", "lib", "records.mjs");
  const source = readFileSync(engine, "utf8");
  const target = "      if (state !== null && CLOSED_TASK_STATES.includes(state)) continue;\n";
  assert.ok(source.includes(target), "the mutation target is no longer in lib/records.mjs; update this mutation check");
  writeFileSync(engine, source.replace(target, ""));
  write(ctx, "docs/tasks/2026-09-03-merged-work-cc33.md", taskFile("2026-09-03-merged-work-cc33", "Merged work", { State: "merged" }));
  const r = sg(ctx, ["index", "--dir", ctx.dir, "--apply"], { cli: join(copy, "runtime", "skillgate.mjs") });
  assert.equal(r.code, 0, r.all);
  assert.match(read(ctx, "docs/STATUS.md"), /merged-work/, "the mutant lists a merged task as open, so the unmutated test's assertion can fail");
  assert.equal(existsSync(join(ctx.dir, "docs/tasks/2026-09-03-merged-work-cc33.md")), true);
});
