#!/usr/bin/env node
// migrate.test.mjs: `skilliton migrate` (the 0100-instructions refresh, receipts, rollback, and the refusal a project
// still below layout 3 gets), `node scripts/legacy-migrate.mjs` (migrations 0002-integrated-layout and
// 0003-skilliton-names, which moved out of the runtime so a pre-1.0 project runs them once by hand), and
// `skilliton remove`.
//
// A real layout-1 project is built in each test by running the prototype's own prepare.mjs (the byte-for-byte fixture
// copies in scripts/fixtures/prototype-v1/) with --apply in a temporary Git repository. Commands run the way a person
// runs them (node scripts/skilliton.mjs ...), with HOME and Git's global configuration pointed away from the real ones;
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
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");
const FIXTURE = join(here, "fixtures", "prototype-v1");
const RUNTIME = ".skillgate/bin/security-evidence.mjs";
const RECEIPT = ".skilliton/migrations/0002-integrated-layout.json";
const TEMPLATE = readFileSync(join(PLUGIN, "templates", "harness.md"), "utf8");
// The template names project record files as {{key}}. Every project in these tests uses the contract defaults
// (docs/CONTRACTS.md sections 2 and 4), written out here rather than imported from config.mjs.
const DEFAULT_VARS = {
  status: "docs/STATUS.md", backlog: "docs/BACKLOG.md", backlogArchive: "docs/BACKLOG_ARCHIVE.md", roadmap: "docs/ROADMAP.md",
  decisions: "DECISIONS.md", lessons: "docs/LESSONS.md", handoff: "docs/HANDOFF.md", handoffArchive: "docs/HANDOFF_ARCHIVE.md",
  maintain: "docs/MAINTAIN.md", tasksDir: "docs/tasks", decisionsDir: "docs/decisions", lessonsDir: "docs/lessons", integrationBranches: "main, master",
};
const RENDERED = TEMPLATE.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => { if (!Object.hasOwn(DEFAULT_VARS, key)) throw new Error(`test: template names unknown value {{${key}}}`); return DEFAULT_VARS[key]; });
const BLOCK = `<!-- skilliton:harness:start v1 -->\n${RENDERED.endsWith("\n") ? RENDERED : `${RENDERED}\n`}<!-- skilliton:harness:end -->\n`;
const VERSION = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const lib = (name) => import(pathToFileURL(join(PLUGIN, "runtime", "lib", name)).href);
const proto = await lib("prototype-v1.mjs");
const fixtureFiles = await import(pathToFileURL(join(FIXTURE, "project-files.mjs")).href);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

function git(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-migrate-"));
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
const LEGACY_CLI = join(here, "legacy-migrate.mjs");
const legacyMigrate = (ctx, ...args) => sg(ctx, ["--dir", ctx.dir, ...args], { cli: LEGACY_CLI });

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

// The fixtures are the snapshot: their sha256 is pinned here, so they are checked in every checkout, history or not.
// They were copied from the prototype release, 0bc2a05 until the history rewrite of 2026-09-23, which kept its tree and
// author date and gave it the hash below; 0bc2a05 is in no clone made since.
const SNAPSHOT_COMMIT = "0bc2a05";
const SNAPSHOT_SHA256 = {
  "prepare.mjs": "a0cc78b368c6d51ece535908096edf98f7b5c29334668d06ac013c3fcc954de6",
  "project-files.mjs": "b423e0f58fb0c33a0d520de9fb22a98a96f81d7c9895f933601bf55b9448b3c6",
  "security-evidence.mjs": "6467f1a0230c687f2448d82b0623c91d9d80f24a33d6a467f6269f5e23807daf",
};

test("the fixture files hold the bytes snapshotted from the prototype release", () => {
  assert.equal(SNAPSHOT_SHA256["security-evidence.mjs"], proto.PROTOTYPE_RUNTIME_SHA256, "the pinned runtime digest is the one migration 0002 recognises");
  for (const [name, digest] of Object.entries(SNAPSHOT_SHA256)) assert.equal(sha256(readFileSync(join(FIXTURE, name))), digest, `scripts/fixtures/prototype-v1/${name} is not the snapshot`);
});

test(`the fixture files are byte-for-byte copies of commit ${SNAPSHOT_COMMIT}`, (t) => {
  const available = spawnSync("git", ["-C", REPO, "cat-file", "-e", `${SNAPSHOT_COMMIT}^{commit}`], { env: BASE_ENV }).status === 0;
  if (!available) {
    // A shallow clone is the one case that may skip; anywhere else the history the fixtures came from is missing, which is a failure.
    const shallow = spawnSync("git", ["-C", REPO, "rev-parse", "--is-shallow-repository"], { env: BASE_ENV, encoding: "utf8" }).stdout?.trim() === "true";
    if (shallow) { t.skip(`NOT RUN: this clone is shallow, so commit ${SNAPSHOT_COMMIT} is not in it; the pinned digests above still checked the fixtures`); return; }
    assert.fail(`commit ${SNAPSHOT_COMMIT} (the prototype release, 0bc2a05 before the 2026-09-23 history rewrite) is not in this clone, and the clone is not shallow`);
  }
  for (const name of Object.keys(SNAPSHOT_SHA256)) {
    const original = execFileSync("git", ["-C", REPO, "show", `${SNAPSHOT_COMMIT}:scripts/${name}`], { env: BASE_ENV });
    assert.ok(original.equals(readFileSync(join(FIXTURE, name))), `scripts/fixtures/prototype-v1/${name} differs from ${SNAPSHOT_COMMIT}`);
  }
});

// ---------------------------------------------------------------- migration 0002

test("a real layout-1 project migrates to layout 3: runtime and prototype blocks removed, harness blocks added, human text kept, moved to the Skilliton names, receipts written", (t) => {
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

  const preview = legacyMigrate(ctx);
  assert.equal(preview.code, 1, preview.all);
  assert.match(preview.out, /0002-integrated-layout \(layout 1 to 2\)/);
  assert.match(preview.out, /delete\s+\.skillgate\/bin\/security-evidence\.mjs\s+the copied prototype runtime; its sha256 matches the release at 0bc2a05/);
  assert.match(preview.out, /update\s+docs\/MAINTAIN\.md\s+remove the prototype skillgate:project block/);
  assert.match(preview.out, /\+<!-- skilliton:harness:start v1 -->/, "the preview shows the change as a diff");
  assert.match(preview.out, /Then, planned from the result of the one before: 0003-skilliton-names\./);
  assert.match(preview.out, /\nSummary: 2 migration\(s\) pending \(0002-integrated-layout, 0003-skilliton-names\); nothing written\. To apply: node scripts\/legacy-migrate\.mjs --dir .* --apply/);
  assert.deepEqual(snapshot(ctx.dir), layout1, "preview wrote nothing");

  const applied = legacyMigrate(ctx, "--apply");
  assert.equal(applied.code, 0, applied.all);
  assert.match(applied.out, /\nSummary: layout 3; 2 migration\(s\) applied \(0002-integrated-layout, 0003-skilliton-names\)/);
  assert.match(applied.out, /Note: docs\/security\/README\.md still tells people to run \.skillgate\/bin\/security-evidence\.mjs/);
  assert.equal(existsSync(join(ctx.dir, RUNTIME)), false, "the copied runtime is removed");
  assert.equal(existsSync(join(ctx.dir, ".skillgate")), false, "the earlier folder is moved and removed");
  for (const rel of files(ctx.dir)) assert.doesNotMatch(read(ctx, rel), /skillgate:project/, `${rel} holds no prototype marker`);
  assert.equal(read(ctx, "CLAUDE.md"), `# Team rules\nKeep this line.\n\n${BLOCK}`);
  assert.equal(read(ctx, "AGENTS.md"), `Team note written after the prototype block.\n\n${BLOCK}`);
  assert.equal(read(ctx, "docs/MAINTAIN.md"), fixtureFiles.projectDocuments(artifacts)[artifacts.maintain], "the maintain record is the prototype's text without its block");
  for (const rel of Object.values(artifacts).filter((p) => p !== artifacts.maintain)) assert.equal(snapshot(ctx.dir)[rel], layout1[rel], `${rel} unchanged`);

  const config = JSON.parse(read(ctx, ".skilliton/config.json"));
  assert.equal(config.prepare.version, 3);
  assert.equal(config.prepare.requires.workflow, VERSION);
  assert.deepEqual(config.prepare.artifacts, artifacts);
  assert.deepEqual(config.handoff, config1.handoff, "other keys are kept");

  const receipt = JSON.parse(read(ctx, RECEIPT));
  assert.equal(receipt.schema, "skilliton.migration-receipt/1");
  assert.equal(receipt.id, "0002-integrated-layout");
  assert.equal(receipt.from, 1);
  assert.equal(receipt.to, 2);
  assert.equal(JSON.parse(read(ctx, ".skilliton/migrations/0003-skilliton-names.json")).to, 3, "0003 left its receipt beside the moved 0002 receipt");
  assert.equal(receipt.runtime, VERSION);
  assert.equal(new Date(receipt.appliedAt).toISOString(), receipt.appliedAt);
  assert.match(receipt.backup, /^\d{8}T\d{6}Z-migrate-[0-9a-f]{8}$/, "applyMigration is the runtime's own, imported unchanged, so the backup id looks the same as skilliton migrate's");
  assert.deepEqual(receipt.files.map((f) => f.path).sort(), [RUNTIME, ".skillgate/config.json", "AGENTS.md", "CLAUDE.md", "docs/MAINTAIN.md"].sort());
  for (const f of receipt.files) {
    const before = Buffer.from(layout1[f.path], "base64");
    assert.equal(f.beforeSha256, sha256(before), `${f.path} beforeSha256`);
    // 0003 then moved .skillgate/config.json, so its content after 0002 is the backup 0003 kept.
    const now = f.path === ".skillgate/config.json" ? null : existsSync(join(ctx.dir, f.path)) ? sha256(readFileSync(join(ctx.dir, f.path))) : null;
    if (f.path !== ".skillgate/config.json") assert.equal(f.afterSha256, now, `${f.path} afterSha256`);
    assert.ok(readFileSync(join(ctx.dir, ".git", "skilliton-backups", receipt.backup, f.path)).equals(before), `${f.path} is backed up in the Git folder`);
  }
  assert.deepEqual(receipt.files.find((f) => f.path === RUNTIME), { path: RUNTIME, action: "delete", beforeSha256: proto.PROTOTYPE_RUNTIME_SHA256, afterSha256: null });

  const again = migrate(ctx);
  assert.equal(again.code, 0, again.all);
  assert.match(again.out, /Summary: layout 3 is current; no migration is pending\./);
  const check = sg(ctx, ["prepare", "--dir", ctx.dir, "--check"]);
  assert.equal(check.code, 1, "layout 3 also records the entry folders, which the prototype did not");
  assert.match(check.out, /current\s+CLAUDE\.md/);
  assert.match(check.out, /update\s+\.skilliton\/config\.json\s+prepare\.directories lists the entry folders/);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--check"]).code, 0);
});

test("a modified copied runtime refuses the migration and changes nothing", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  appendFileSync(join(ctx.dir, RUNTIME), "// a local change\n");
  const before = snapshot(ctx.dir);
  const r = legacyMigrate(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /\.skillgate\/bin\/security-evidence\.mjs does not match the prototype runtime released at 0bc2a05/);
  assert.match(r.err, /Nothing was changed\. To reconcile: keep any change you need outside \.skillgate\/bin\/security-evidence\.mjs, delete it/);
  assert.deepEqual(snapshot(ctx.dir), before);
  assert.equal(existsSync(join(ctx.dir, ".git", "skilliton-backups")), false);
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
    const r = legacyMigrate(ctx, "--apply");
    assert.equal(r.code, 2, `${rel}: ${r.all}`);
    assert.match(r.err, message);
    assert.match(r.err, /Nothing was changed\. To reconcile: /);
    assert.deepEqual(snapshot(ctx.dir), before, `${rel}: nothing changed`);
    writeFileSync(join(ctx.dir, rel), original);
  }
  assert.equal(legacyMigrate(ctx, "--apply").code, 0, "with every block restored, the same project migrates");
});

test("a destination that changes during the migration is refused, and everything written is rolled back", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  const layout1 = snapshot(ctx.dir);
  const inject = join(ctx.base, "inject.mjs");
  writeFileSync(inject, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync; let fired = false;
fs.writeFileSync = (p, ...a) => { const out = write(p, ...a); if (!fired && String(p).includes('/skilliton-backups/') && String(p).endsWith('/CLAUDE.md')) { fired = true; write(process.env.SKILLITON_TEST_TARGET + '/AGENTS.md', '# Changed during the migration\\n'); } return out; };
syncBuiltinESMExports();`);
  const r = sg(ctx, ["--dir", ctx.dir, "--apply"], { cli: LEGACY_CLI, preload: inject, env: { SKILLITON_TEST_TARGET: ctx.dir } });
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

test("rollback restores exactly, in order, and refuses after a later edit", (t) => {
  const ctx = fixture(t);
  write(ctx, "CLAUDE.md", "# Team rules\nKeep this line.\n");
  prototypePrepare(ctx);
  const layout1 = snapshot(ctx.dir, { modes: true });
  assert.equal(legacyMigrate(ctx, "--apply").code, 0);
  const migrated = snapshot(ctx.dir, { modes: true });

  const first = legacyMigrate(ctx, "--rollback", "0002-integrated-layout", "--apply");
  assert.equal(first.code, 2, first.all);
  assert.match(first.err, /roll back the later migration\(s\) first: 0003-skilliton-names\. Nothing was changed/);
  assert.deepEqual(snapshot(ctx.dir, { modes: true }), migrated);

  const preview = legacyMigrate(ctx, "--rollback", "0003-skilliton-names");
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /create\s+\.skillgate\/config\.json\s+deleted by 0003-skilliton-names; recreated from the backup/);
  assert.match(preview.out, /delete\s+\.skilliton\/migrations\/0003-skilliton-names\.json/);
  assert.deepEqual(snapshot(ctx.dir, { modes: true }), migrated, "the rollback preview wrote nothing");

  const names = legacyMigrate(ctx, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(names.code, 0, names.all);
  assert.match(names.out, /Summary: rolled back 0003-skilliton-names; the project is at layout 2 again/);
  assert.equal(existsSync(join(ctx.dir, ".skilliton")), false, "the Skilliton folder is removed again");
  // skilliton migrate itself no longer plans 0003 (it moved to legacy-migrate.mjs): it now refuses a layout-2
  // project outright, naming the exact command; legacy-migrate.mjs still shows 0003 pending.
  const stuck = migrate(ctx);
  assert.equal(stuck.code, 2, stuck.all);
  assert.match(stuck.out, /Project: layout 2;.*Pending: none\./);
  assert.match(stuck.out, /Summary: this project is at layout 2.*node scripts\/legacy-migrate\.mjs --dir .* to preview it, then the same with --apply/);
  assert.match(legacyMigrate(ctx).out, /0003-skilliton-names \(layout 2 to 3\)/);

  const preview2 = legacyMigrate(ctx, "--rollback", "0002-integrated-layout");
  assert.equal(preview2.code, 0, preview2.all);
  assert.match(preview2.out, /restore\s+CLAUDE\.md/);
  assert.match(preview2.out, /create\s+\.skillgate\/bin\/security-evidence\.mjs\s+deleted by 0002-integrated-layout; recreated from the backup/);
  assert.match(preview2.out, /delete\s+\.skillgate\/migrations\/0002-integrated-layout\.json/);
  const rolled = legacyMigrate(ctx, "--rollback", "0002-integrated-layout", "--apply");
  assert.equal(rolled.code, 0, rolled.all);
  assert.match(rolled.out, /Summary: rolled back 0002-integrated-layout; the project is at layout 1 again and the receipt was removed/);
  assert.deepEqual(snapshot(ctx.dir, { modes: true }), layout1, "every file, folder and permission is as it was before the migrations");
  assert.equal(migrate(ctx).code, 2, "skilliton migrate refuses a layout-1 project outright now");
  assert.equal(legacyMigrate(ctx).code, 1, "the migrations are pending again, for legacy-migrate.mjs");

  assert.equal(legacyMigrate(ctx, "--apply").code, 0);
  appendFileSync(join(ctx.dir, ".skilliton/config.json"), " ");
  rmSync(join(ctx.dir, "docs/tasks/README.md"), { force: true });
  write(ctx, ".skilliton/security/catalog.json", "{}\n");
  const edited = snapshot(ctx.dir);
  const refused = legacyMigrate(ctx, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(refused.code, 2, refused.all);
  assert.match(refused.err, /rollback of 0003-skilliton-names refused: 2 file\(s\) changed since the migration was applied: \.skilliton\/config\.json \(edited\); \.skilliton\/security\/catalog\.json \(edited\)\. Nothing was changed/);
  assert.deepEqual(snapshot(ctx.dir), edited);

  const unknown = migrate(ctx, "--rollback", "0009-not-applied", "--apply");
  assert.equal(unknown.code, 2, unknown.all);
  assert.match(unknown.err, /there is no receipt \.skilliton\/migrations\/0009-not-applied\.json/);
  assert.deepEqual(snapshot(ctx.dir), edited);

  const receiptRel = ".skilliton/migrations/0003-skilliton-names.json";
  write(ctx, "src/app.js", "export const app = 1;\n");
  const receipt = JSON.parse(read(ctx, receiptRel));
  receipt.files.push({ path: "src/app.js", action: "create", beforeSha256: null, afterSha256: sha256(readFileSync(join(ctx.dir, "src/app.js"))) });
  write(ctx, receiptRel, `${JSON.stringify(receipt, null, 2)}\n`);
  const tampered = snapshot(ctx.dir);
  const foreign = legacyMigrate(ctx, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(foreign.code, 2, foreign.all);
  assert.match(foreign.err, /lists src\/app\.js, which 0003-skilliton-names never changes, so the receipt was edited/);
  assert.deepEqual(snapshot(ctx.dir), tampered, "an edited receipt cannot make rollback delete a file the migration never touched");
});

test("migrationState reports the layout and applied receipts; a layout-1 or layout-2 project has nothing pending here (legacy-migrate.mjs plans that now)", async (t) => {
  const ctx = fixture(t);
  const { migrationState, MIGRATIONS } = await lib("migrations.mjs");
  const { resolveProject } = await lib("config.mjs");
  assert.ok(MIGRATIONS.every((m) => m.from === m.to), "the runtime plans no layout migration of its own; scripts/legacy-migrate.mjs plans 0002 and 0003");
  assert.deepEqual(MIGRATIONS.map((m) => m.id), ["0004-security-findings-file"], "the one entry MIGRATIONS holds is the same-layout security findings migration (B78)");
  assert.deepEqual(migrationState(resolveProject(ctx.dir)), { layoutVersion: null, target: 3, pending: [], applied: [], instructions: null });
  prototypePrepare(ctx);
  assert.throws(() => resolveProject(ctx.dir), /still uses the earlier Skillgate names/, "only callers that allow it open a project under the earlier names");
  const one = migrationState(resolveProject(ctx.dir, { allowLegacy: true }));
  assert.equal(one.layoutVersion, 1);
  assert.equal(one.target, 3);
  assert.deepEqual(one.applied, []);
  assert.deepEqual(one.pending, [], "the layout migrations are not in MIGRATIONS any more; commands/migrate.mjs refuses this case itself");
  assert.equal(legacyMigrate(ctx, "--apply").code, 0);
  const after = migrationState(resolveProject(ctx.dir));
  assert.deepEqual({ ...after, instructions: { ...after.instructions, id: typeof after.instructions.id } }, { layoutVersion: 3, target: 3, pending: [], applied: ["0002-integrated-layout", "0003-skilliton-names"], instructions: { id: "string", templateSha12: sha256(Buffer.from(TEMPLATE, "latin1")).slice(0, 12), outdated: [], applied: false } });
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
  return { cli: join(copy, "runtime", "skilliton.mjs"), id: `0100-instructions-${sha256(Buffer.from(text, "latin1")).slice(0, 12)}`, template: text };
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
  assert.match(check.out, /instruction block\(s\) wait for: skilliton migrate/);
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
  const receipt = JSON.parse(read(ctx, `.skilliton/migrations/${next.id}.json`));
  assert.equal(receipt.templateSha256, sha256(Buffer.from(next.template, "latin1")));
  assert.deepEqual(Object.keys(receipt.blocks).sort(), ["AGENTS.md", "CLAUDE.md"]);
  assert.deepEqual([receipt.from, receipt.to], [3, 3]);
  assert.equal(sg(ctx, ["migrate", "--dir", ctx.dir], { cli: next.cli }).code, 0, "nothing pending after the refresh");
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--check"], { cli: next.cli }).code, 0);

  const back = sg(ctx, ["migrate", "--dir", ctx.dir, "--rollback", next.id, "--apply"], { cli: next.cli });
  assert.equal(back.code, 0, back.all);
  assert.ok(readFileSync(join(ctx.dir, "CLAUDE.md")).equals(claudeBefore), "rollback restores the block exactly");
  assert.equal(existsSync(join(ctx.dir, `.skilliton/migrations/${next.id}.json`)), false);
  assert.equal(sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: next.cli }).code, 0);
  assert.ok(read(ctx, "CLAUDE.md").includes(RULE_A), "applied again after the rollback");
});

test("a block edited inside the markers after Skilliton wrote it refuses the next template refresh and changes nothing", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  const first = pluginWithTemplate(ctx, "plugin-rule-a", addRule(RULE_A));
  assert.equal(sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: first.cli }).code, 0);
  replaceIn(ctx, "CLAUDE.md", RULE_A, RULE_A.replace("company rule", "company rule, reworded by a person inside the block"));
  const before = snapshot(ctx.dir);
  const second = pluginWithTemplate(ctx, "plugin-rule-b", (t) => addRule(RULE_B)(addRule(RULE_A)(t)));
  const refused = sg(ctx, ["migrate", "--dir", ctx.dir, "--apply"], { cli: second.cli });
  assert.equal(refused.code, 2, refused.all);
  assert.match(refused.err, /CLAUDE\.md was edited by hand after Skilliton last wrote it/);
  assert.deepEqual(snapshot(ctx.dir), before, "nothing changed");
});

test("migrate --json prints one result object refusing a project still below layout 3, and for an ordinary refusal", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  // skilliton migrate no longer plans 0002/0003 (scripts/legacy-migrate.mjs does, run by hand, without --json); it
  // refuses a layout-1 project outright and names the exact command.
  const stuck = migrate(ctx, "--json");
  assert.equal(stuck.code, 2, stuck.all);
  assert.equal(stuck.out.trim().split("\n").length, 1);
  const p = JSON.parse(stuck.out);
  assert.equal(p.schema, "skilliton.result/1");
  assert.equal(p.command, "migrate");
  assert.equal(p.result, "invalid");
  assert.match(p.summary, /this project is at layout 1.*node scripts\/legacy-migrate\.mjs --dir .* to preview it, then the same with --apply/);

  assert.equal(legacyMigrate(ctx, "--apply").code, 0);
  const refused = migrate(ctx, "--rollback", "0009-not-applied", "--apply", "--json");
  assert.equal(refused.code, 2, refused.all);
  const r = JSON.parse(refused.out);
  assert.equal(r.result, "invalid");
  assert.match(r.summary, /there is no receipt/);
});

// ---------------------------------------------------------------- remove

test("remove keeps every record, entry, observation and receipt", (t) => {
  const ctx = fixture(t);
  write(ctx, "CLAUDE.md", "# Team rules\nKeep this line.\n");
  prototypePrepare(ctx);
  assert.equal(legacyMigrate(ctx, "--apply").code, 0);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  assert.equal(sg(ctx, ["record", "decision", "Keep orders in PostgreSQL", "--dir", ctx.dir, "--apply"]).code, 0);
  assert.equal(sg(ctx, ["record", "lesson", "A piped gate hid a failure", "--dir", ctx.dir, "--apply"]).code, 0);
  write(ctx, "docs/tasks/2026-09-16-add-login-ab12.md", "# Task: Add login\n\nKind: Living. Task record.\n\n- **ID:** 2026-09-16-add-login-ab12\n- **State:** in-progress\n");
  write(ctx, ".skilliton/security/records/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d.json", "{\"schemaVersion\": 1}\n");
  write(ctx, ".skilliton/security/applicability.json", "{\"schemaVersion\": 1, \"decisions\": []}\n");
  write(ctx, ".skilliton/security/REPORT.md", "<!-- skilliton-security-evidence-report:v1 -->\n\n# Security evidence status\n");
  const managed = ["CLAUDE.md", "AGENTS.md", ".skilliton/security/REPORT.md", ".skilliton/config.json"];
  const before = snapshot(ctx.dir);
  const kept = Object.fromEntries(Object.entries(before).filter(([p]) => !managed.includes(p)));
  assert.ok(Object.keys(kept).includes(RECEIPT) && Object.keys(kept).some((p) => p.startsWith("docs/decisions/2026-")), "fixture: a receipt and an entry exist");

  const preview = sg(ctx, ["remove", "--dir", ctx.dir, "--config"]);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /Kept, never touched by remove: 9 record\(s\)/);
  assert.match(preview.out, /2 migration receipt\(s\)/);
  assert.match(preview.out, /1 observation record\(s\)/);
  assert.deepEqual(snapshot(ctx.dir), before, "the preview wrote nothing");

  const r = sg(ctx, ["remove", "--dir", ctx.dir, "--apply", "--config"]);
  assert.equal(r.code, 0, r.all);
  assert.equal(read(ctx, "CLAUDE.md"), "# Team rules\nKeep this line.\n", "the harness block and its blank line are gone; the human text stays");
  assert.equal(read(ctx, "AGENTS.md"), "");
  assert.equal(existsSync(join(ctx.dir, ".skilliton/security/REPORT.md")), false);
  assert.equal(existsSync(join(ctx.dir, ".skilliton/config.json")), false);
  const after = snapshot(ctx.dir);
  for (const [path, value] of Object.entries(kept)) assert.equal(after[path], value, `${path} is kept unchanged`);

  write(ctx, ".skilliton/security/REPORT.md", "# Our own security report\n");
  const personal = sg(ctx, ["remove", "--dir", ctx.dir, "--apply"]);
  assert.equal(personal.code, 0, personal.all);
  assert.match(personal.out, /keep\s+\.skilliton\/security\/REPORT\.md\s+its first line is not the generated-report marker/);
  assert.equal(read(ctx, ".skilliton/security/REPORT.md"), "# Our own security report\n");
});

test("remove refuses a layout-1 project", (t) => {
  const ctx = fixture(t);
  prototypePrepare(ctx);
  const before = snapshot(ctx.dir);
  const r = sg(ctx, ["remove", "--dir", ctx.dir, "--apply", "--config"]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /layout 1 .*Migrate it first: skilliton migrate/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

// ---------------------------------------------------------------- mutation check

test("mutation: without the prototype block comparison, a hand-edited block would be migrated away", (t) => {
  const ctx = fixture(t);
  // scripts/legacy-migrate.mjs and scripts/legacy-migrate-plans.mjs import the plugin's lib/ by a relative path
  // (../packs/base/plugins/workflow/runtime/lib/...), so the mutant needs that same shape around it: a copy of the
  // plugin at that relative depth under a "scripts" sibling, not just a copy of the script files by themselves.
  const copyRoot = join(ctx.base, "legacy-migrate-mutant");
  cpSync(PLUGIN, join(copyRoot, "packs", "base", "plugins", "workflow"), { recursive: true });
  mkdirSync(join(copyRoot, "scripts"), { recursive: true });
  cpSync(LEGACY_CLI, join(copyRoot, "scripts", "legacy-migrate.mjs"));
  const plansPath = join(here, "legacy-migrate-plans.mjs");
  const source = readFileSync(plansPath, "utf8");
  const target = "    if (proto) checkPrototypeBlock(text, proto, projectBlock, name);\n";
  assert.ok(source.includes(target), "the mutation target is no longer in scripts/legacy-migrate-plans.mjs; update this mutation check");
  const mutant = join(copyRoot, "scripts", "legacy-migrate-plans.mjs");
  writeFileSync(mutant, source.replace(target, ""));

  prototypePrepare(ctx);
  replaceIn(ctx, "CLAUDE.md", "Preserve unrelated changes.", "Preserve unrelated changes. A hand-written rule the team relies on.");
  const r = sg(ctx, ["--dir", ctx.dir, "--apply"], { cli: join(copyRoot, "scripts", "legacy-migrate.mjs") });
  assert.equal(r.code, 0, `the mutated script migrates the edited block: ${r.all}`);
  assert.doesNotMatch(read(ctx, "CLAUDE.md"), /A hand-written rule the team relies on/, "the mutant deleted the hand edit, so the unmutated refusal test's assertion can fail");
});
