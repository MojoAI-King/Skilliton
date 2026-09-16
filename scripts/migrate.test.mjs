#!/usr/bin/env node
// migrate.test.mjs: `skillgate migrate` (migration 0002-integrated-layout, receipts, rollback) and `skillgate remove`.
//
// A real layout-1 project is built in each test by running the prototype's own prepare.mjs (the byte-for-byte fixture
// copies in scripts/fixtures/prototype-v1/) with --apply in a temporary Git repository. Commands run the way a person
// runs them (node scripts/skillgate.mjs ...), with HOME and Git's global configuration pointed away from the real ones;
// each test removes its temporary folder. The mutation check edits a temporary copy of the plugin, never the shipped code.
//
//   node --test scripts/migrate.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const CLI = join(here, "skillgate.mjs");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");
const FIXTURE = join(here, "fixtures", "prototype-v1");
const RUNTIME = ".skillgate/bin/security-evidence.mjs";
const RECEIPT = ".skillgate/migrations/0002-integrated-layout.json";
const TEMPLATE = readFileSync(join(PLUGIN, "templates", "harness.md"), "utf8");
// The template names project record files as {{key}}. Every project in these tests uses the contract defaults
// (docs/CONTRACTS.md sections 2 and 4), written out here rather than imported from config.mjs.
const DEFAULT_VARS = {
  status: "docs/STATUS.md", backlog: "docs/BACKLOG.md", backlogArchive: "docs/BACKLOG_ARCHIVE.md", roadmap: "docs/ROADMAP.md",
  decisions: "DECISIONS.md", lessons: "docs/LESSONS.md", handoff: "docs/HANDOFF.md", handoffArchive: "docs/HANDOFF_ARCHIVE.md",
  maintain: "docs/MAINTAIN.md", tasksDir: "docs/tasks", decisionsDir: "docs/decisions", lessonsDir: "docs/lessons", integrationBranches: "main, master",
};
const RENDERED = TEMPLATE.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => { if (!Object.hasOwn(DEFAULT_VARS, key)) throw new Error(`test: template names unknown value {{${key}}}`); return DEFAULT_VARS[key]; });
const BLOCK = `<!-- skillgate:harness:start v1 -->\n${RENDERED.endsWith("\n") ? RENDERED : `${RENDERED}\n`}<!-- skillgate:harness:end -->\n`;
const VERSION = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const lib = (name) => import(pathToFileURL(join(PLUGIN, "runtime", "lib", name)).href);
const proto = await lib("prototype-v1.mjs");
const fixtureFiles = await import(pathToFileURL(join(FIXTURE, "project-files.mjs")).href);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLGATE_SELF: "skillgate", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skillgate Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skillgate Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLGATE_DEBUG;
  return env;
})();

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skillgate-migrate-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d);
  git(ctx.dir, "init", "-q", "-b", "main");
  return ctx;
}

// Layout 1, written by the prototype itself.
function prototypePrepare(ctx) {
  const r = spawnSync(process.execPath, [join(FIXTURE, "prepare.mjs"), "--dir", ctx.dir, "--apply"], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" });
  assert.equal(r.status, 0, `fixture: the prototype's prepare.mjs --apply ran: ${r.stdout}${r.stderr}`);
}

function sg(ctx, args, { preload = null, cli = CLI, env = {} } = {}) {
  const r = spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), cli, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const migrate = (ctx, ...args) => sg(ctx, ["migrate", "--dir", ctx.dir, ...args]);

// Every entry under dir except .git; with modes: true, each file's and folder's permission bits too.
function snapshot(dir, { modes = false } = {}) {
  const out = {};
  const walk = (rel) => {
    const entries = readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      if (!rel && e.name === ".git") continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      const mode = modes ? ` mode ${(statSync(join(dir, p)).mode & 0o777).toString(8)}` : "";
      if (e.isSymbolicLink()) out[p] = `symlink to ${readlinkSync(join(dir, p))}`;
      else if (e.isDirectory()) { out[`${p}/`] = `folder${mode}`; walk(p); }
      else out[p] = readFileSync(join(dir, p)).toString("base64") + mode;
    }
  };
  walk("");
  return out;
}
const files = (dir) => Object.keys(snapshot(dir)).filter((k) => !k.endsWith("/")).sort();
const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");
const write = (ctx, rel, text) => { mkdirSync(dirname(join(ctx.dir, rel)), { recursive: true }); writeFileSync(join(ctx.dir, rel), text); };
const replaceIn = (ctx, rel, from, to) => {
  const text = read(ctx, rel);
  assert.ok(text.includes(from), `fixture: ${rel} contains the text this test edits`);
  writeFileSync(join(ctx.dir, rel), text.replace(from, to));
};

// ---------------------------------------------------------------- the frozen prototype

test("the frozen prototype values agree with the byte-for-byte fixture copies", () => {
  assert.equal(sha256(readFileSync(join(FIXTURE, "security-evidence.mjs"))), proto.PROTOTYPE_RUNTIME_SHA256);
  const defaults = { status: "docs/STATUS.md", backlog: "docs/BACKLOG.md", backlogArchive: "docs/BACKLOG_ARCHIVE.md", roadmap: "docs/ROADMAP.md", decisions: "DECISIONS.md", lessons: "docs/LESSONS.md", handoff: "docs/HANDOFF.md", handoffArchive: "docs/HANDOFF_ARCHIVE.md", maintain: "docs/MAINTAIN.md" };
  const custom = { ...defaults, status: "STATUS.md", handoff: "notes/HANDOFF.md", maintain: "MAINTAIN.md" };
  for (const artifacts of [defaults, custom]) assert.equal(proto.projectInstructions(artifacts), fixtureFiles.projectInstructions(artifacts));
  assert.equal(proto.maintenanceInstructions(), fixtureFiles.maintenanceInstructions());
  const prepareSource = readFileSync(join(FIXTURE, "prepare.mjs"), "utf8");
  assert.ok(prepareSource.includes(`const markerStart = '${proto.PROJECT_MARKER_START}';`));
  assert.ok(prepareSource.includes(`const markerEnd = '${proto.PROJECT_MARKER_END}';`));
  assert.ok(prepareSource.includes("const block = `${markerStart}\\n${content.trimEnd()}\\n${markerEnd}`;"));
  assert.equal(proto.prototypeBlock("text\n\n"), `${proto.PROJECT_MARKER_START}\ntext\n${proto.PROJECT_MARKER_END}`);
});

test("the fixture files are byte-for-byte copies of commit 23aae41", (t) => {
  const available = spawnSync("git", ["-C", REPO, "cat-file", "-e", "23aae41^{commit}"], { env: BASE_ENV }).status === 0;
  if (!available) { t.skip("NOT RUN: commit 23aae41 is not in this clone (for example a shallow checkout), so the fixtures could not be compared with it"); return; }
  for (const name of ["prepare.mjs", "project-files.mjs", "security-evidence.mjs"]) {
    const original = execFileSync("git", ["-C", REPO, "show", `23aae41:scripts/${name}`], { env: BASE_ENV });
    assert.ok(original.equals(readFileSync(join(FIXTURE, name))), `scripts/fixtures/prototype-v1/${name} differs from 23aae41`);
  }
});

// ---------------------------------------------------------------- migration 0002

test("a real layout-1 project migrates to layout 2: runtime and prototype blocks removed, harness blocks added, human text kept, receipt written", (t) => {
  const ctx = fixture(t);
  write(ctx, "CLAUDE.md", "# Team rules\nKeep this line.\n");
  prototypePrepare(ctx);
  appendFileSync(join(ctx.dir, "AGENTS.md"), "\nTeam note written after the prototype block.\n");
  const config1 = JSON.parse(read(ctx, ".skillgate/config.json"));
  const artifacts = config1.prepare.artifacts;
  assert.equal(config1.prepare.version, 1, "fixture: the prototype wrote layout 1");
  assert.equal(sha256(readFileSync(join(ctx.dir, RUNTIME))), proto.PROTOTYPE_RUNTIME_SHA256, "fixture: the prototype copied its runtime");
  for (const rel of ["CLAUDE.md", "AGENTS.md", "docs/MAINTAIN.md"]) assert.match(read(ctx, rel), /^<!-- skillgate:project:start v1 -->$/m, `fixture: ${rel} has a prototype block`);
  const layout1 = snapshot(ctx.dir);

  const preview = migrate(ctx);
  assert.equal(preview.code, 1, preview.all);
  assert.match(preview.out, /0002-integrated-layout \(layout 1 to 2\)/);
  assert.match(preview.out, /delete\s+\.skillgate\/bin\/security-evidence\.mjs\s+the copied prototype runtime; its sha256 matches the release at 23aae41/);
  assert.match(preview.out, /update\s+docs\/MAINTAIN\.md\s+remove the prototype skillgate:project block/);
  assert.match(preview.out, /\+<!-- skillgate:harness:start v1 -->/, "the preview shows the change as a diff");
  assert.match(preview.out, /\nSummary: 1 migration\(s\) pending \(0002-integrated-layout\); nothing written\. To apply: skillgate migrate --apply/);
  assert.deepEqual(snapshot(ctx.dir), layout1, "preview wrote nothing");

  const applied = migrate(ctx, "--apply");
  assert.equal(applied.code, 0, applied.all);
  assert.match(applied.out, /\nSummary: layout 2; 1 migration\(s\) applied \(0002-integrated-layout\)/);
  assert.match(applied.out, /Note: docs\/security\/README\.md still tells people to run \.skillgate\/bin\/security-evidence\.mjs/);
  assert.equal(existsSync(join(ctx.dir, RUNTIME)), false, "the copied runtime is removed");
  assert.equal(existsSync(join(ctx.dir, ".skillgate", "bin")), false, "its emptied folder is removed");
  for (const rel of files(ctx.dir)) assert.doesNotMatch(read(ctx, rel), /skillgate:project/, `${rel} holds no prototype marker`);
  assert.equal(read(ctx, "CLAUDE.md"), `# Team rules\nKeep this line.\n\n${BLOCK}`);
  assert.equal(read(ctx, "AGENTS.md"), `Team note written after the prototype block.\n\n${BLOCK}`);
  assert.equal(read(ctx, "docs/MAINTAIN.md"), fixtureFiles.projectDocuments(artifacts)[artifacts.maintain], "the maintain record is the prototype's text without its block");
  for (const rel of Object.values(artifacts).filter((p) => p !== artifacts.maintain)) assert.equal(snapshot(ctx.dir)[rel], layout1[rel], `${rel} unchanged`);

  const config = JSON.parse(read(ctx, ".skillgate/config.json"));
  assert.equal(config.prepare.version, 2);
  assert.equal(config.prepare.requires.workflow, VERSION);
  assert.deepEqual(config.prepare.artifacts, artifacts);
  assert.deepEqual(config.handoff, config1.handoff, "other keys are kept");

  const receipt = JSON.parse(read(ctx, RECEIPT));
  assert.equal(receipt.schema, "skillgate.migration-receipt/1");
  assert.equal(receipt.id, "0002-integrated-layout");
  assert.equal(receipt.from, 1);
  assert.equal(receipt.to, 2);
  assert.equal(receipt.runtime, VERSION);
  assert.equal(new Date(receipt.appliedAt).toISOString(), receipt.appliedAt);
  assert.match(receipt.backup, /^\d{8}T\d{6}Z-migrate-[0-9a-f]{8}$/);
  assert.deepEqual(receipt.files.map((f) => f.path).sort(), [RUNTIME, ".skillgate/config.json", "AGENTS.md", "CLAUDE.md", "docs/MAINTAIN.md"].sort());
  for (const f of receipt.files) {
    const before = Buffer.from(layout1[f.path], "base64");
    assert.equal(f.beforeSha256, sha256(before), `${f.path} beforeSha256`);
    assert.equal(f.afterSha256, existsSync(join(ctx.dir, f.path)) ? sha256(readFileSync(join(ctx.dir, f.path))) : null, `${f.path} afterSha256`);
    assert.ok(readFileSync(join(ctx.dir, ".git", "skillgate-backups", receipt.backup, f.path)).equals(before), `${f.path} is backed up in the Git folder`);
  }
  assert.deepEqual(receipt.files.find((f) => f.path === RUNTIME), { path: RUNTIME, action: "delete", beforeSha256: proto.PROTOTYPE_RUNTIME_SHA256, afterSha256: null });

  const again = migrate(ctx);
  assert.equal(again.code, 0, again.all);
  assert.match(again.out, /Summary: layout 2 is current; no migration is pending\./);
  const check = sg(ctx, ["prepare", "--dir", ctx.dir, "--check"]);
  assert.equal(check.code, 1, "layout 2 also records the entry folders, which the prototype did not");
  assert.match(check.out, /current\s+CLAUDE\.md/);
  assert.match(check.out, /update\s+\.skillgate\/config\.json\s+prepare\.directories lists the entry folders/);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--check"]).code, 0);
});

test("a modified copied runtime refuses the migration and changes nothing", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  appendFileSync(join(ctx.dir, RUNTIME), "// a local change\n");
  const before = snapshot(ctx.dir);
  const r = migrate(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /\.skillgate\/bin\/security-evidence\.mjs does not match the prototype runtime released at 23aae41/);
  assert.match(r.err, /Nothing was changed\. To reconcile: .*delete \.skillgate\/bin\/security-evidence\.mjs/);
  assert.deepEqual(snapshot(ctx.dir), before);
  assert.equal(existsSync(join(ctx.dir, ".git", "skillgate-backups")), false);
});

test("a hand-edited prototype block refuses the migration and changes nothing", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  const cases = [
    ["CLAUDE.md", "Preserve unrelated changes.", "Preserve unrelated changes, always.", /CLAUDE\.md lines \d+ to \d+ hold a skillgate:project block that differs from what the prototype wrote/],
    ["docs/MAINTAIN.md", "Refreshing a report must not re-stamp an assessment.", "Refresh reports weekly.", /docs\/MAINTAIN\.md lines \d+ to \d+ hold a skillgate:project block that differs/],
    ["AGENTS.md", "<!-- skillgate:project:end -->", "<!-- skillgate:project:start v1 -->\n<!-- skillgate:project:end -->", /AGENTS\.md has skillgate:project marker text on line\(s\) .* not one well-formed prototype block/],
  ];
  for (const [rel, from, to, message] of cases) {
    const original = readFileSync(join(ctx.dir, rel));
    replaceIn(ctx, rel, from, to);
    const before = snapshot(ctx.dir);
    const r = migrate(ctx, "--apply");
    assert.equal(r.code, 2, `${rel}: ${r.all}`);
    assert.match(r.err, message);
    assert.match(r.err, /Nothing was changed\. To reconcile: /);
    assert.deepEqual(snapshot(ctx.dir), before, `${rel}: nothing changed`);
    writeFileSync(join(ctx.dir, rel), original);
  }
  assert.equal(migrate(ctx, "--apply").code, 0, "with every block restored, the same project migrates");
});

test("a destination that changes during the migration is refused, and everything written is rolled back", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  const layout1 = snapshot(ctx.dir);
  const inject = join(ctx.base, "inject.mjs");
  writeFileSync(inject, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync; let fired = false;
fs.writeFileSync = (p, ...a) => { const out = write(p, ...a); if (!fired && String(p).includes('/skillgate-backups/') && String(p).endsWith('/CLAUDE.md')) { fired = true; write(process.env.SKILLGATE_TEST_TARGET + '/AGENTS.md', '# Changed during the migration\\n'); } return out; };
syncBuiltinESMExports();`);
  const r = sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { preload: inject, env: { SKILLGATE_TEST_TARGET: ctx.dir } });
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /AGENTS\.md changed after the plan was made, so it was not replaced and the external edit was preserved/);
  assert.match(r.err, /Every file this run wrote was rolled back/);
  assert.equal(read(ctx, "AGENTS.md"), "# Changed during the migration\n");
  const now = snapshot(ctx.dir);
  delete now["AGENTS.md"];
  const expected = { ...layout1 };
  delete expected["AGENTS.md"];
  assert.deepEqual(now, expected, "the runtime, CLAUDE.md and the config are back as they were; no receipt");
});

test("rollback restores exactly, and refuses after a later edit", (t) => {
  const ctx = fixture(t);
  write(ctx, "CLAUDE.md", "# Team rules\nKeep this line.\n");
  prototypePrepare(ctx);
  const layout1 = snapshot(ctx.dir, { modes: true });
  assert.equal(migrate(ctx, "--apply").code, 0);
  const migrated = snapshot(ctx.dir, { modes: true });

  const preview = migrate(ctx, "--rollback", "0002-integrated-layout");
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /restore\s+CLAUDE\.md/);
  assert.match(preview.out, /create\s+\.skillgate\/bin\/security-evidence\.mjs\s+deleted by 0002-integrated-layout; recreated from the backup/);
  assert.match(preview.out, /delete\s+\.skillgate\/migrations\/0002-integrated-layout\.json/);
  assert.deepEqual(snapshot(ctx.dir, { modes: true }), migrated, "the rollback preview wrote nothing");

  const rolled = migrate(ctx, "--rollback", "0002-integrated-layout", "--apply");
  assert.equal(rolled.code, 0, rolled.all);
  assert.match(rolled.out, /Summary: rolled back 0002-integrated-layout; the project is at layout 1 again and the receipt was removed/);
  assert.deepEqual(snapshot(ctx.dir, { modes: true }), layout1, "every file, folder and permission is as it was before the migration");
  assert.equal(migrate(ctx).code, 1, "the migration is pending again");

  assert.equal(migrate(ctx, "--apply").code, 0);
  appendFileSync(join(ctx.dir, "CLAUDE.md"), "A line added after the migration.\n");
  rmSync(join(ctx.dir, "docs/MAINTAIN.md"));
  const edited = snapshot(ctx.dir);
  const refused = migrate(ctx, "--rollback", "0002-integrated-layout", "--apply");
  assert.equal(refused.code, 2, refused.all);
  assert.match(refused.err, /rollback of 0002-integrated-layout refused: 2 file\(s\) changed since the migration was applied: CLAUDE\.md \(edited\); docs\/MAINTAIN\.md \(deleted\)\. Nothing was changed/);
  assert.deepEqual(snapshot(ctx.dir), edited);

  const unknown = migrate(ctx, "--rollback", "0009-not-applied", "--apply");
  assert.equal(unknown.code, 2, unknown.all);
  assert.match(unknown.err, /there is no receipt \.skillgate\/migrations\/0009-not-applied\.json/);
  assert.deepEqual(snapshot(ctx.dir), edited);

  write(ctx, "src/app.js", "export const app = 1;\n");
  const receipt = JSON.parse(read(ctx, RECEIPT));
  receipt.files.push({ path: "src/app.js", action: "create", beforeSha256: null, afterSha256: sha256(readFileSync(join(ctx.dir, "src/app.js"))) });
  write(ctx, RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  const tampered = snapshot(ctx.dir);
  const foreign = migrate(ctx, "--rollback", "0002-integrated-layout", "--apply");
  assert.equal(foreign.code, 2, foreign.all);
  assert.match(foreign.err, /lists src\/app\.js, which 0002-integrated-layout never changes, so the receipt was edited/);
  assert.deepEqual(snapshot(ctx.dir), tampered, "an edited receipt cannot make rollback delete a file the migration never touched");
});

test("migrationState reports the layout, pending migrations and applied receipts", async (t) => {
  const ctx = fixture(t);
  const { migrationState } = await lib("migrations.mjs");
  const { resolveProject } = await lib("config.mjs");
  assert.deepEqual(migrationState(resolveProject(ctx.dir)), { layoutVersion: null, target: 2, pending: [], applied: [], instructions: null });
  prototypePrepare(ctx);
  const one = migrationState(resolveProject(ctx.dir));
  assert.equal(one.layoutVersion, 1);
  assert.equal(one.target, 2);
  assert.deepEqual(one.applied, []);
  assert.equal(one.pending.length, 1);
  assert.deepEqual({ ...one.pending[0], summary: typeof one.pending[0].summary }, { id: "0002-integrated-layout", from: 1, to: 2, summary: "string" });
  assert.equal(migrate(ctx, "--apply").code, 0);
  const after = migrationState(resolveProject(ctx.dir));
  assert.deepEqual({ ...after, instructions: { ...after.instructions, id: typeof after.instructions.id } }, { layoutVersion: 2, target: 2, pending: [], applied: ["0002-integrated-layout"], instructions: { id: "string", templateSha12: sha256(Buffer.from(TEMPLATE, "latin1")).slice(0, 12), outdated: [], applied: false } });
  assert.equal(after.instructions.id, `0100-instructions-${sha256(Buffer.from(TEMPLATE, "latin1")).slice(0, 12)}`);
});

// ---------------------------------------------------------------- 0100-instructions-<template sha>

// A byte copy of the workflow plugin whose harness template was changed, run through its own runtime entry point.
function pluginWithTemplate(ctx, name, transform) {
  const copy = join(ctx.base, name);
  cpSync(PLUGIN, copy, { recursive: true });
  const t = join(copy, "templates", "harness.md");
  const text = transform(readFileSync(t, "utf8"));
  writeFileSync(t, text);
  return { cli: join(copy, "runtime", "skillgate.mjs"), id: `0100-instructions-${sha256(Buffer.from(text, "latin1")).slice(0, 12)}`, template: text };
}
const RULE_A = "- **Instructed:** a company rule added after this project was prepared.\n";
const RULE_B = "- **Instructed:** a second company rule.\n";
const addRule = (rule) => (t) => { assert.ok(t.includes("### Before committing\n"), "fixture: the template has the section this test extends"); return t.replace("### Before committing\n", "### Before committing\n" + rule); };

test("a changed template is a pending instructions migration: prepare leaves it to migrate; apply writes a receipt; rollback and apply again", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  write(ctx, "CLAUDE.md", read(ctx, "CLAUDE.md") + "\nA note a person added after the block.\n");
  git(ctx.dir, "add", "-A"); git(ctx.dir, "commit", "-q", "-m", "prepared");
  const next = pluginWithTemplate(ctx, "plugin-rule-a", addRule(RULE_A));
  const claudeBefore = readFileSync(join(ctx.dir, "CLAUDE.md"));

  const check = sg(ctx, ["prepare", "--dir", ctx.dir, "--check"], { cli: next.cli });
  assert.equal(check.code, 1, check.all);
  assert.match(check.out, /migrate\s+CLAUDE\.md/);
  assert.match(check.out, /instruction block\(s\) wait for: skillgate migrate/);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"], { cli: next.cli }).code, 0);
  assert.ok(readFileSync(join(ctx.dir, "CLAUDE.md")).equals(claudeBefore), "prepare --apply leaves an outdated block to migrate");

  const preview = sg(ctx, ["migrate", "--dir", ctx.dir], { cli: next.cli });
  assert.equal(preview.code, 1, preview.all);
  assert.ok(preview.out.includes(next.id), preview.out);
  assert.ok(readFileSync(join(ctx.dir, "CLAUDE.md")).equals(claudeBefore), "the preview wrote nothing");

  const apply = sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: next.cli });
  assert.equal(apply.code, 0, apply.all);
  for (const f of ["CLAUDE.md", "AGENTS.md"]) assert.ok(read(ctx, f).includes(RULE_A), `${f} has the new rule`);
  assert.ok(read(ctx, "CLAUDE.md").includes("A note a person added after the block."), "text outside the markers is kept");
  const receipt = JSON.parse(read(ctx, `.skillgate/migrations/${next.id}.json`));
  assert.equal(receipt.templateSha256, sha256(Buffer.from(next.template, "latin1")));
  assert.deepEqual(Object.keys(receipt.blocks).sort(), ["AGENTS.md", "CLAUDE.md"]);
  assert.deepEqual([receipt.from, receipt.to], [2, 2]);
  assert.equal(sg(ctx, ["migrate", "--dir", ctx.dir], { cli: next.cli }).code, 0, "nothing pending after the refresh");
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--check"], { cli: next.cli }).code, 0);

  const back = sg(ctx, ["migrate", "--dir", ctx.dir, "--rollback", next.id, "--apply"], { cli: next.cli });
  assert.equal(back.code, 0, back.all);
  assert.ok(readFileSync(join(ctx.dir, "CLAUDE.md")).equals(claudeBefore), "rollback restores the block exactly");
  assert.equal(existsSync(join(ctx.dir, `.skillgate/migrations/${next.id}.json`)), false);
  assert.equal(sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: next.cli }).code, 0);
  assert.ok(read(ctx, "CLAUDE.md").includes(RULE_A), "applied again after the rollback");
});

test("a block edited inside the markers after Skillgate wrote it refuses the next template refresh and changes nothing", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  const first = pluginWithTemplate(ctx, "plugin-rule-a", addRule(RULE_A));
  assert.equal(sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: first.cli }).code, 0);
  replaceIn(ctx, "CLAUDE.md", RULE_A, RULE_A.replace("company rule", "company rule, reworded by a person inside the block"));
  const before = snapshot(ctx.dir);
  const second = pluginWithTemplate(ctx, "plugin-rule-b", (t) => addRule(RULE_B)(addRule(RULE_A)(t)));
  const refused = sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: second.cli });
  assert.equal(refused.code, 2, refused.all);
  assert.match(refused.err, /CLAUDE\.md was edited by hand after Skillgate last wrote it/);
  assert.deepEqual(snapshot(ctx.dir), before, "nothing changed");
});

test("migrate --json prints one result object for a pending migration and for a refusal", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  const pending = migrate(ctx, "--json");
  assert.equal(pending.code, 1, pending.all);
  assert.equal(pending.out.trim().split("\n").length, 1);
  const p = JSON.parse(pending.out);
  assert.equal(p.schema, "skillgate.result/1");
  assert.equal(p.command, "migrate");
  assert.equal(p.result, "attention");
  assert.deepEqual(p.details.state.pending.map((m) => m.id), ["0002-integrated-layout"]);
  assert.deepEqual(p.details.migrations[0].files.find((f) => f.path === RUNTIME), { path: RUNTIME, action: "delete", description: "the copied prototype runtime; its sha256 matches the release at 23aae41", beforeSha256: proto.PROTOTYPE_RUNTIME_SHA256, afterSha256: null });
  appendFileSync(join(ctx.dir, RUNTIME), "// changed\n");
  const refused = migrate(ctx, "--apply", "--json");
  assert.equal(refused.code, 2, refused.all);
  const r = JSON.parse(refused.out);
  assert.equal(r.result, "invalid");
  assert.match(r.summary, /does not match the prototype runtime/);
});

// ---------------------------------------------------------------- remove

test("remove keeps every record, entry, observation and receipt", (t) => {
  const ctx = fixture(t);
  write(ctx, "CLAUDE.md", "# Team rules\nKeep this line.\n");
  prototypePrepare(ctx);
  assert.equal(migrate(ctx, "--apply").code, 0);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  assert.equal(sg(ctx, ["record", "decision", "Keep orders in PostgreSQL", "--dir", ctx.dir, "--apply"]).code, 0);
  assert.equal(sg(ctx, ["record", "lesson", "A piped gate hid a failure", "--dir", ctx.dir, "--apply"]).code, 0);
  write(ctx, "docs/tasks/2026-09-16-add-login-ab12.md", "# Task: Add login\n\nKind: Living. Task record.\n\n- **ID:** 2026-09-16-add-login-ab12\n- **State:** in-progress\n");
  write(ctx, ".skillgate/security/records/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d.json", "{\"schemaVersion\": 1}\n");
  write(ctx, ".skillgate/security/applicability.json", "{\"schemaVersion\": 1, \"decisions\": []}\n");
  write(ctx, ".skillgate/security/REPORT.md", "<!-- skillgate-security-evidence-report:v1 -->\n\n# Security evidence status\n");
  const managed = ["CLAUDE.md", "AGENTS.md", ".skillgate/security/REPORT.md", ".skillgate/config.json"];
  const before = snapshot(ctx.dir);
  const kept = Object.fromEntries(Object.entries(before).filter(([p]) => !managed.includes(p)));
  assert.ok(Object.keys(kept).includes(RECEIPT) && Object.keys(kept).some((p) => p.startsWith("docs/decisions/2026-")), "fixture: a receipt and an entry exist");

  const preview = sg(ctx, ["remove", "--dir", ctx.dir, "--config"]);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /Kept, never touched by remove: 9 record\(s\)/);
  assert.match(preview.out, /1 migration receipt\(s\)/);
  assert.match(preview.out, /1 observation record\(s\)/);
  assert.deepEqual(snapshot(ctx.dir), before, "the preview wrote nothing");

  const r = sg(ctx, ["remove", "--dir", ctx.dir, "--apply", "--config"]);
  assert.equal(r.code, 0, r.all);
  assert.equal(read(ctx, "CLAUDE.md"), "# Team rules\nKeep this line.\n", "the harness block and its blank line are gone; the human text stays");
  assert.equal(read(ctx, "AGENTS.md"), "");
  assert.equal(existsSync(join(ctx.dir, ".skillgate/security/REPORT.md")), false);
  assert.equal(existsSync(join(ctx.dir, ".skillgate/config.json")), false);
  const after = snapshot(ctx.dir);
  for (const [path, value] of Object.entries(kept)) assert.equal(after[path], value, `${path} is kept unchanged`);

  write(ctx, ".skillgate/security/REPORT.md", "# Our own security report\n");
  const personal = sg(ctx, ["remove", "--dir", ctx.dir, "--apply"]);
  assert.equal(personal.code, 0, personal.all);
  assert.match(personal.out, /keep\s+\.skillgate\/security\/REPORT\.md\s+its first line is not the generated-report marker/);
  assert.equal(read(ctx, ".skillgate/security/REPORT.md"), "# Our own security report\n");
});

test("remove refuses a layout-1 project", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  const before = snapshot(ctx.dir);
  const r = sg(ctx, ["remove", "--dir", ctx.dir, "--apply", "--config"]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /layout 1 .*Migrate it first: skillgate migrate/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

// ---------------------------------------------------------------- mutation check

test("mutation: without the prototype block comparison, a hand-edited block would be migrated away", (t) => {
  const ctx = fixture(t);
  const copy = join(ctx.base, "plugin-copy", "workflow");
  cpSync(PLUGIN, copy, { recursive: true });
  const engine = join(copy, "runtime", "lib", "migrations.mjs");
  const source = readFileSync(engine, "utf8");
  const target = "    if (proto) checkPrototypeBlock(text, proto, projectBlock, name);\n";
  assert.ok(source.includes(target), "the mutation target is no longer in lib/migrations.mjs; update this mutation check");
  writeFileSync(engine, source.replace(target, ""));

  prototypePrepare(ctx);
  replaceIn(ctx, "CLAUDE.md", "Preserve unrelated changes.", "Preserve unrelated changes. A hand-written rule the team relies on.");
  const r = sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: join(copy, "runtime", "skillgate.mjs") });
  assert.equal(r.code, 0, `the mutated runtime migrates the edited block: ${r.all}`);
  assert.doesNotMatch(read(ctx, "CLAUDE.md"), /A hand-written rule the team relies on/, "the mutant deleted the hand edit, so the unmutated refusal test's assertion can fail");
});
