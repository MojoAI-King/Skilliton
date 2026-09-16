#!/usr/bin/env node
// prepare.test.mjs: `skillgate prepare` and the transactional writer in packs/base/plugins/workflow/runtime/lib/prepare.mjs.
//
// Adapted from the standalone prototype's 16 regression cases (commit 23aae41). Every protection they proved is kept
// in integrated form (their names are noted as "prototype case"), and the layout-2 acceptance checks are added.
// Each test runs the command the way a person does (node scripts/skillgate.mjs prepare ...) in its own temporary Git
// repository under the system temp folder, with HOME and Git's global configuration pointed away from the real ones,
// and removes that folder afterwards. Failures are injected with a --import preload that wraps one fs function. The
// mutation check edits a temporary copy of the plugin, never the shipped code, to prove a key assertion can fail.
//
//   node --test scripts/prepare.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skillgate.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const TEMPLATE = readFileSync(join(PLUGIN, "templates", "harness.md"), "utf8");
const START = "<!-- skillgate:harness:start v1 -->";
const END = "<!-- skillgate:harness:end -->";
const BLOCK = `${START}\n${TEMPLATE.endsWith("\n") ? TEMPLATE : `${TEMPLATE}\n`}${END}\n`;
const VERSION = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const CATALOG_CURRENT = JSON.parse(readFileSync(join(PLUGIN, "catalogs", "index.json"), "utf8")).current;
const CATALOG_BYTES = readFileSync(join(PLUGIN, "catalogs", `${CATALOG_CURRENT}.json`));
const ROLES = ["status", "backlog", "backlogArchive", "roadmap", "decisions", "lessons", "handoff", "handoffArchive", "maintain"];
const LAYOUT_2_FILES = [
  "docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md",
  "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md", "docs/tasks/README.md", "docs/decisions/README.md",
  "docs/lessons/README.md", "docs/security/README.md", ".skillgate/security/catalog.json",
  ".skillgate/security/records/README.md", ".gitignore", "CLAUDE.md", "AGENTS.md", ".skillgate/config.json",
];

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
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skillgate-prepare-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home"), outside: join(base, "outside") };
  for (const d of [ctx.dir, ctx.home, ctx.outside]) mkdirSync(d);
  git(ctx.dir, "init", "-q", "-b", "main");
  return ctx;
}

function sg(ctx, args, { preload = null, cli = CLI, cwd = ctx.dir, env = {} } = {}) {
  const r = spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), cli, ...args], { cwd, env: { ...BASE_ENV, HOME: ctx.home, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
const prepare = (ctx, ...args) => sg(ctx, ["prepare", "--dir", ctx.dir, ...args]);

// Every entry under dir except .git: folders, symbolic links (with their target) and files (with their bytes, and
// with times: true their modification time). Equal snapshots mean nothing was written.
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
const files = (dir) => Object.keys(snapshot(dir)).filter((k) => !k.endsWith("/")).sort();
const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");
const write = (ctx, rel, text) => { mkdirSync(dirname(join(ctx.dir, rel)), { recursive: true }); writeFileSync(join(ctx.dir, rel), text); };

function preloader(ctx, source) {
  const path = join(ctx.base, `inject-${readdirSync(ctx.base).length}.mjs`);
  writeFileSync(path, source);
  return path;
}

const RENAME_FAILS_FOR_CONFIG = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const rename = fs.renameSync;
fs.renameSync = (a, b) => { if (String(b).endsWith('/.skillgate/config.json')) { const e = new Error('injected'); e.code = 'EACCES'; throw e; } return rename(a, b); };
syncBuiltinESMExports();`;

const EDIT_AFTER_AGENTS_BACKUP = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const write = fs.writeFileSync; let fired = false;
fs.writeFileSync = (p, ...a) => { const out = write(p, ...a); if (!fired && String(p).includes('/skillgate-backups/') && String(p).endsWith('/AGENTS.md')) { fired = true; write(process.env.SKILLGATE_TEST_TARGET + '/AGENTS.md', '# Concurrent edit\\n'); } return out; };
syncBuiltinESMExports();`;

// ---------------------------------------------------------------- preview, apply, check, repeat

test("preview writes nothing and names a concrete plan (prototype case: dry-run creates nothing)", (t) => {
  const ctx = fixture(t);
  const r = prepare(ctx);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /create\s+docs\/STATUS\.md\s+status record, created as "not yet assessed"/);
  assert.match(r.out, /create\s+\.skillgate\/config\.json/);
  assert.match(r.out, /\nSummary: 19 to create, .*nothing written\. To write it: skillgate prepare --apply/);
  assert.deepEqual(snapshot(ctx.dir), {});
  assert.equal(existsSync(join(ctx.dir, ".git", "skillgate-backups")), false);
});

test("apply creates the full layout-2 set; check is read-only (prototype cases: apply prepares core records; archives exist)", (t) => {
  const ctx = fixture(t);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /\nSummary: prepared \(layout 2\): 19 created, 0 updated/);
  assert.deepEqual(files(ctx.dir), [...LAYOUT_2_FILES].sort(), "exactly the layout-2 set: no copied runtime, no lock left behind");
  assert.equal(existsSync(join(ctx.dir, ".skillgate", "bin")), false);

  const config = JSON.parse(read(ctx, ".skillgate/config.json"));
  assert.equal(config.prepare.version, 2);
  assert.deepEqual(Object.keys(config.prepare.artifacts), ROLES);
  assert.deepEqual(config.prepare.directories, { tasks: "docs/tasks", decisions: "docs/decisions", lessons: "docs/lessons" });
  assert.deepEqual(config.prepare.requires, { workflow: VERSION });
  assert.equal(config.handoff.file, "docs/HANDOFF.md");

  assert.equal(read(ctx, "CLAUDE.md"), BLOCK);
  assert.equal(read(ctx, "AGENTS.md"), BLOCK);
  assert.ok(readFileSync(join(ctx.dir, ".skillgate/security/catalog.json")).equals(CATALOG_BYTES), "the catalog is the package's current catalog, byte for byte");
  assert.match(read(ctx, ".gitignore"), /^\/\.skillgate\/prepare\.lock$/m);
  assert.match(read(ctx, ".gitignore"), /^\/\.skillgate\/private-evidence\/$/m);
  assert.match(read(ctx, "docs/STATUS.md"), /Current state: not yet assessed\./);
  assert.match(read(ctx, "docs/HANDOFF.md"), /## RESUME HERE\n\nWritten: not yet assessed\n/);
  assert.match(read(ctx, "docs/security/README.md"), /skillgate security status/);
  assert.match(read(ctx, ".skillgate/security/records/README.md"), /skillgate security status/);
  for (const rel of LAYOUT_2_FILES) {
    const text = read(ctx, rel);
    assert.doesNotMatch(text, /skillgate:project/, `${rel} has no prototype markers`);
    assert.doesNotMatch(text, /security-evidence\.mjs/, `${rel} names no copied runtime`);
  }
  for (const rel of LAYOUT_2_FILES.slice(0, 9)) assert.doesNotMatch(read(ctx, rel), /\b20\d\d-\d\d-\d\d\b/, `${rel} invents no date`);
  assert.doesNotMatch(read(ctx, "docs/MAINTAIN.md"), /<!-- skillgate:/, "the maintain record has no managed block");

  const before = snapshot(ctx.dir, { times: true });
  const check = prepare(ctx, "--check");
  assert.equal(check.code, 0, check.all);
  assert.match(check.out, /\nSummary: prepared \(layout 2\); nothing missing or outdated\./);
  assert.deepEqual(snapshot(ctx.dir, { times: true }), before);
});

test("a repeat apply changes zero bytes and keeps human edits (prototype case: reapply is byte-for-byte idempotent)", (t) => {
  const ctx = fixture(t);
  assert.equal(prepare(ctx, "--apply").code, 0);
  writeFileSync(join(ctx.dir, "docs/STATUS.md"), "# Real progress\nA decision made by a person.\n");
  const before = snapshot(ctx.dir, { times: true });
  const backupCount = () => (existsSync(join(ctx.dir, ".git", "skillgate-backups")) ? readdirSync(join(ctx.dir, ".git", "skillgate-backups")).length : 0);
  const backups = backupCount();
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /\nSummary: already prepared \(layout 2\); nothing to change, nothing written/);
  assert.deepEqual(snapshot(ctx.dir, { times: true }), before, "no file was rewritten, not even with the same bytes");
  assert.equal(backupCount(), backups, "no new backup");
});

test("records in conventional and configured locations are adopted untouched; unknown config keys survive (prototype case: adopts established paths)", (t) => {
  const ctx = fixture(t);
  write(ctx, "STATUS.md", "# Existing status\n");
  write(ctx, "TODO.md", "# Our todo list\n- ship it\n");
  write(ctx, "docs/DECISIONS.md", "# Decisions we made\n");
  write(ctx, "notes/lessons-learned.md", "# Lessons, our way\n");
  write(ctx, "HANDOFF.md", "# Existing handoff\n");
  write(ctx, "CLAUDE.md", "# Existing rules\nKeep these instructions.\n");
  const config = {
    dispatch: { minItemsForLanes: 9 },
    handoff: { file: "HANDOFF.md", maxBytes: 3000 },
    prepare: { artifacts: { lessons: "notes/lessons-learned.md" }, futureOption: { keep: true } },
    customTeamSection: { anything: [1, 2, 3] },
  };
  write(ctx, ".skillgate/config.json", `${JSON.stringify(config, null, 4)}\n`);
  const adopted = ["STATUS.md", "TODO.md", "docs/DECISIONS.md", "notes/lessons-learned.md", "HANDOFF.md"];
  const before = Object.fromEntries(adopted.map((rel) => [rel, { bytes: readFileSync(join(ctx.dir, rel)), mtime: statSync(join(ctx.dir, rel)).mtimeMs }]));
  const originalConfig = readFileSync(join(ctx.dir, ".skillgate/config.json"));

  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all);
  for (const rel of adopted) {
    assert.match(r.out, new RegExp(`adopted\\s+${rel.replace(/[.]/g, "\\.")}\\s`), `${rel} is reported as adopted`);
    assert.ok(readFileSync(join(ctx.dir, rel)).equals(before[rel].bytes), `${rel} bytes unchanged`);
    assert.equal(statSync(join(ctx.dir, rel)).mtimeMs, before[rel].mtime, `${rel} not rewritten`);
  }
  for (const rel of ["docs/STATUS.md", "docs/BACKLOG.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md"]) assert.equal(existsSync(join(ctx.dir, rel)), false, `${rel} not created beside an adopted record`);

  const next = JSON.parse(read(ctx, ".skillgate/config.json"));
  assert.deepEqual(next.dispatch, { minItemsForLanes: 9 });
  assert.deepEqual(next.handoff, { file: "HANDOFF.md", maxBytes: 3000 });
  assert.deepEqual(next.customTeamSection, { anything: [1, 2, 3] });
  assert.deepEqual(next.prepare.futureOption, { keep: true });
  assert.equal(next.prepare.artifacts.status, "STATUS.md");
  assert.equal(next.prepare.artifacts.backlog, "TODO.md");
  assert.equal(next.prepare.artifacts.decisions, "docs/DECISIONS.md");
  assert.equal(next.prepare.artifacts.lessons, "notes/lessons-learned.md");
  assert.equal(next.prepare.artifacts.handoff, "HANDOFF.md");
  for (const role of ROLES) assert.ok(existsSync(join(ctx.dir, next.prepare.artifacts[role])), `${role} record exists`);
  assert.ok(read(ctx, "CLAUDE.md").startsWith("# Existing rules\nKeep these instructions.\n\n"), "human text in CLAUDE.md kept");

  const [backup] = readdirSync(join(ctx.dir, ".git", "skillgate-backups"));
  assert.ok(readFileSync(join(ctx.dir, ".git", "skillgate-backups", backup, "CLAUDE.md")).equals(Buffer.from("# Existing rules\nKeep these instructions.\n")));
  assert.ok(readFileSync(join(ctx.dir, ".git", "skillgate-backups", backup, ".skillgate", "config.json")).equals(originalConfig));
  const again = prepare(ctx, "--check");
  assert.equal(again.code, 0, again.all);
});

test("human text around an existing harness block is kept byte for byte", (t) => {
  const ctx = fixture(t);
  const before = Buffer.concat([
    Buffer.from(`# Team rules\nTrailing spaces   \n\tTabbed line\nA windows line\r\ncaf${String.fromCharCode(0xe9)} ${String.fromCharCode(0x4e2d, 0x6587)}\n`),
    Buffer.from([0xff, 0xfe, 0x0a]),
    Buffer.from("\n"),
  ]);
  const after = Buffer.from("\nText after the block.\nlast line has no newline");
  const original = Buffer.concat([before, Buffer.from(`${START}\nold instructions that must be replaced\n${END}\n`), after]);
  writeFileSync(join(ctx.dir, "CLAUDE.md"), original);
  chmodSync(join(ctx.dir, "CLAUDE.md"), 0o664);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 0, r.all);
  assert.equal(statSync(join(ctx.dir, "CLAUDE.md")).mode & 0o777, 0o664, "the replaced file keeps its permission bits");
  const got = readFileSync(join(ctx.dir, "CLAUDE.md"));
  assert.ok(got.subarray(0, before.length).equals(before), "bytes before the start marker are identical");
  assert.ok(got.subarray(got.length - after.length).equals(after), "bytes after the end marker are identical");
  assert.ok(got.subarray(before.length, got.length - after.length).equals(Buffer.from(BLOCK)), "between them sits exactly the rendered template");
  const again = snapshot(ctx.dir, { times: true });
  assert.equal(prepare(ctx, "--apply").code, 0);
  assert.deepEqual(snapshot(ctx.dir, { times: true }), again);
});

// ---------------------------------------------------------------- refusals before any write

test("malformed config refuses without partial output or quoting the file (prototype case)", (t) => {
  const ctx = fixture(t);
  write(ctx, ".skillgate/config.json", "{ private-invalid-content");
  const before = snapshot(ctx.dir);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /config\.json is not valid JSON/);
  assert.doesNotMatch(r.all, /private-invalid/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

test("malformed harness markers and prototype markers refuse all writes (prototype case: unclosed or duplicate managed blocks)", (t) => {
  const ctx = fixture(t);
  const cases = [
    [`${START}\n`, /without an end marker/],
    [`${START}\none\n${END}\n${START}\ntwo\n${END}\n`, /more than one harness start marker/],
    ["<!-- skillgate:project:start v1 -->\n", /standalone prototype/],
  ];
  for (const [text, message] of cases) {
    write(ctx, "AGENTS.md", text);
    const before = snapshot(ctx.dir);
    const r = prepare(ctx, "--apply");
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, message);
    assert.deepEqual(snapshot(ctx.dir), before);
  }
});

test("symlinked, hard-linked and traversal paths refuse with no writes (prototype cases: symlinked destination, traversal)", (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.outside, "target.md"), "outside\n");
  const outsideBefore = snapshot(ctx.outside, { times: true });
  const attempt = (setup, message, label) => {
    setup();
    const before = snapshot(ctx.dir);
    const r = prepare(ctx, "--apply");
    assert.equal(r.code, 2, `${label}: ${r.all}`);
    assert.match(r.err, message, label);
    assert.deepEqual(snapshot(ctx.dir), before, `${label}: nothing written in the project`);
    assert.deepEqual(snapshot(ctx.outside, { times: true }), outsideBefore, `${label}: nothing written outside`);
    assert.equal(existsSync(join(ctx.dir, ".git", "skillgate-backups")), false, `${label}: no backup made`);
    rmSync(join(ctx.dir), { recursive: true, force: true });
    mkdirSync(ctx.dir);
    git(ctx.dir, "init", "-q", "-b", "main");
  };
  attempt(() => symlinkSync(ctx.outside, join(ctx.dir, "docs")), /symbolic link/, "docs folder is a link");
  attempt(() => symlinkSync(ctx.outside, join(ctx.dir, ".skillgate")), /symbolic link/, ".skillgate folder is a link");
  attempt(() => symlinkSync(join(ctx.outside, "target.md"), join(ctx.dir, "CLAUDE.md")), /symbolic link/, "CLAUDE.md is a link");
  attempt(() => symlinkSync(join(ctx.outside, "target.md"), join(ctx.dir, ".gitignore")), /symbolic link/, ".gitignore is a link");
  attempt(() => { write(ctx, "elsewhere.md", "# shared\n"); mkdirSync(join(ctx.dir, "docs")); linkSync(join(ctx.dir, "elsewhere.md"), join(ctx.dir, "docs", "STATUS.md")); }, /hard-linked/, "a hard-linked record");
  attempt(() => { write(ctx, "notes.md", "# notes\n"); linkSync(join(ctx.dir, "notes.md"), join(ctx.dir, "AGENTS.md")); }, /hard-linked/, "a hard-linked AGENTS.md");
  attempt(() => write(ctx, ".skillgate/config.json", JSON.stringify({ prepare: { artifacts: { status: "../outside.md" } } })), /repository-relative/, "a traversal path");
  attempt(() => write(ctx, ".skillgate/config.json", JSON.stringify({ prepare: { artifacts: { status: "same.md", backlog: "same.md" } } })), /two record roles/, "two roles on one file");
});

test("a linked backup folder inside the Git folder is refused before anything is written", (t) => {
  const ctx = fixture(t);
  symlinkSync(ctx.outside, join(ctx.dir, ".git", "skillgate-backups"));
  write(ctx, "CLAUDE.md", "# Rules\n");
  const before = snapshot(ctx.dir);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /the backup folder in the Git folder goes through a symbolic link/);
  assert.deepEqual(snapshot(ctx.dir), before);
  assert.deepEqual(readdirSync(ctx.outside), []);
});

test("reserved and case-alias record paths cannot replace instruction files (prototype case)", (t) => {
  const ctx = fixture(t);
  for (const artifacts of [{ status: "docs/security/README.md" }, { status: "agents.md" }, { status: "same.md", backlog: "SAME.md" }, { status: ".GIT/config.md" }]) {
    write(ctx, ".skillgate/config.json", JSON.stringify({ prepare: { artifacts } }));
    const before = snapshot(ctx.dir);
    const r = prepare(ctx, "--apply");
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, /belongs to Skillgate|two record roles|repository-relative/);
    assert.deepEqual(snapshot(ctx.dir), before);
  }
});

test("lock contention refuses; a subfolder or a folder outside Git is refused (prototype case)", (t) => {
  const ctx = fixture(t);
  write(ctx, ".skillgate/prepare.lock", "another process");
  const before = snapshot(ctx.dir);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /prepare\.lock exists/);
  assert.deepEqual(snapshot(ctx.dir), before);
  rmSync(join(ctx.dir, ".skillgate"), { recursive: true });

  mkdirSync(join(ctx.dir, "sub"));
  const sub = sg(ctx, ["prepare", "--dir", join(ctx.dir, "sub"), "--apply"]);
  assert.equal(sub.code, 2, sub.all);
  assert.match(sub.err, /is not its root/);
  const outsideGit = sg(ctx, ["prepare", "--apply"], { cwd: ctx.outside });
  assert.equal(outsideGit.code, 2, outsideGit.all);
  assert.match(outsideGit.err, /not a Git repository/);
  assert.deepEqual(snapshot(ctx.dir), { "sub/": "folder" });
  assert.deepEqual(snapshot(ctx.outside), {});
});

test("a layout-1 project is refused with the migrate command; check reports it as attention", (t) => {
  const ctx = fixture(t);
  write(ctx, ".skillgate/config.json", JSON.stringify({ prepare: { version: 1 } }));
  const before = snapshot(ctx.dir);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /layout 1/);
  assert.match(r.err, /skillgate migrate --dir /);
  const check = prepare(ctx, "--check");
  assert.equal(check.code, 1, check.all);
  assert.match(check.out, /Summary: setup incomplete: .*skillgate migrate/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

test("a project requiring a newer workflow runtime is refused", (t) => {
  const ctx = fixture(t);
  write(ctx, ".skillgate/config.json", JSON.stringify({ prepare: { requires: { workflow: "99.0.0" } } }));
  const before = snapshot(ctx.dir);
  const r = prepare(ctx, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /requires workflow 99\.0\.0 or later/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

// ---------------------------------------------------------------- existing managed files

test("a missing or outdated managed file makes check incomplete, and apply repairs only that (prototype case: missing runtime)", (t) => {
  const ctx = fixture(t);
  assert.equal(prepare(ctx, "--apply").code, 0);
  rmSync(join(ctx.dir, ".skillgate/security/catalog.json"));
  writeFileSync(join(ctx.dir, "AGENTS.md"), "# Local notes\n");
  const records = Object.fromEntries(LAYOUT_2_FILES.slice(0, 9).map((rel) => [rel, readFileSync(join(ctx.dir, rel))]));
  const before = snapshot(ctx.dir, { times: true });
  const check = prepare(ctx, "--check");
  assert.equal(check.code, 1, check.all);
  assert.match(check.out, /create\s+\.skillgate\/security\/catalog\.json/);
  assert.match(check.out, /update\s+AGENTS\.md/);
  assert.match(check.out, /Summary: setup incomplete: 1 missing, 1 outdated/);
  assert.deepEqual(snapshot(ctx.dir, { times: true }), before, "check wrote nothing");
  assert.equal(prepare(ctx, "--apply").code, 0);
  assert.equal(prepare(ctx, "--check").code, 0);
  assert.equal(read(ctx, "AGENTS.md"), `# Local notes\n\n${BLOCK}`);
  for (const [rel, bytes] of Object.entries(records)) assert.ok(readFileSync(join(ctx.dir, rel)).equals(bytes), `${rel} unchanged`);
});

test("an existing catalog is kept when usable and refused when not; a copied runtime is refused (prototype cases: incompatible catalog and runtime; invalid catalog)", (t) => {
  const ctx = fixture(t);
  assert.equal(prepare(ctx, "--apply").code, 0);
  const catalogPath = join(ctx.dir, ".skillgate/security/catalog.json");
  const team = `${JSON.stringify({ schemaVersion: 1, catalogVersion: "team-1", controls: [{ id: "TEAM-1", title: "A team control", mappings: [{ framework: "Team practice", version: "1", reference: "T1", url: "https://example.invalid/t1", relationship: "related" }], expectedEvidence: ["A reviewed record"] }] }, null, 2)}\n`;
  writeFileSync(catalogPath, team);
  const kept = prepare(ctx, "--apply");
  assert.equal(kept.code, 0, kept.all);
  assert.match(kept.out, /adopted\s+\.skillgate\/security\/catalog\.json/);
  assert.equal(readFileSync(catalogPath, "utf8"), team);

  writeFileSync(catalogPath, "{ not json private-catalog-text");
  let before = snapshot(ctx.dir);
  const unparseable = prepare(ctx, "--apply");
  assert.equal(unparseable.code, 2, unparseable.all);
  assert.match(unparseable.err, /catalog\.json is not valid JSON\. It was preserved/);
  assert.doesNotMatch(unparseable.all, /private-catalog-text/);
  assert.deepEqual(snapshot(ctx.dir), before);

  writeFileSync(catalogPath, JSON.stringify({ schemaVersion: 1, catalogVersion: "bad", controls: [{}] }));
  before = snapshot(ctx.dir);
  const incomplete = prepare(ctx, "--check");
  assert.equal(incomplete.code, 2, incomplete.all);
  assert.match(incomplete.err, /has an incomplete control/);
  assert.deepEqual(snapshot(ctx.dir), before);

  writeFileSync(catalogPath, team);
  write(ctx, ".skillgate/bin/security-evidence.mjs", "// a locally changed copied runtime\n");
  before = snapshot(ctx.dir);
  const runtime = prepare(ctx, "--apply");
  assert.equal(runtime.code, 2, runtime.all);
  assert.match(runtime.err, /standalone prototype: \.skillgate\/bin\/security-evidence\.mjs/);
  assert.deepEqual(snapshot(ctx.dir), before);
});

// ---------------------------------------------------------------- failures during apply

test("an injected write failure rolls back and leaves no addable backup files (prototype case)", (t) => {
  const ctx = fixture(t);
  write(ctx, ".skillgate/config.json", "{}\n");
  write(ctx, ".gitignore", "/.skillgate/config.json\n");
  const before = snapshot(ctx.dir);
  const r = sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"], { preload: preloader(ctx, RENAME_FAILS_FOR_CONFIG) });
  assert.equal(r.code, 3, r.all);
  assert.match(r.err, /a write failed \(EACCES\)/);
  assert.match(r.err, /Every file this run wrote was rolled back/);
  assert.deepEqual(snapshot(ctx.dir), before);
  const untracked = git(ctx.dir, "ls-files", "--others", "--exclude-standard");
  assert.doesNotMatch(untracked, /backup|config\.json|\.tmp/);
  const backups = readdirSync(join(ctx.dir, ".git", "skillgate-backups"));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(ctx.dir, ".git", "skillgate-backups", backups[0], ".gitignore"), "utf8"), "/.skillgate/config.json\n");
});

test("an edit arriving during backup is preserved and prepare refuses (prototype case)", (t) => {
  const ctx = fixture(t);
  write(ctx, "AGENTS.md", "# Original\n");
  const r = sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"], { preload: preloader(ctx, EDIT_AFTER_AGENTS_BACKUP), env: { SKILLGATE_TEST_TARGET: ctx.dir } });
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /AGENTS\.md changed while its replacement was being staged, so it was not replaced and the external edit was preserved/);
  assert.match(r.err, /Nothing from this run remains\. Check the change to AGENTS\.md/);
  assert.equal(read(ctx, "AGENTS.md"), "# Concurrent edit\n");
  assert.equal(existsSync(join(ctx.dir, "docs/STATUS.md")), false, "files written before it were rolled back");
  assert.deepEqual(files(ctx.dir), ["AGENTS.md"]);
});

test("an edit arriving during rollback is preserved and reported incomplete (prototype case)", (t) => {
  const ctx = fixture(t);
  write(ctx, "AGENTS.md", "# Original\n");
  const inject = preloader(ctx, `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
let rollingBack = false; const rename = fs.renameSync;
fs.renameSync = (a, b) => { if (String(b).endsWith('/.skillgate/config.json')) { rollingBack = true; const e = new Error('injected'); e.code = 'EACCES'; throw e; } return rename(a, b); };
const write = fs.writeFileSync;
fs.writeFileSync = (p, ...a) => { const out = write(p, ...a); if (rollingBack && String(p).endsWith('.tmp') && Buffer.from(a[0]).toString() === '# Original\\n') write(process.env.SKILLGATE_TEST_TARGET + '/AGENTS.md', '# Concurrent rollback edit\\n'); return out; };
syncBuiltinESMExports();`);
  const r = sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"], { preload: inject, env: { SKILLGATE_TEST_TARGET: ctx.dir } });
  assert.equal(r.code, 3, r.all);
  assert.match(r.err, /Rollback is incomplete/);
  assert.match(r.err, /Not rolled back: AGENTS\.md \(it changed during the rollback, so the newer content was kept\)/);
  assert.equal(read(ctx, "AGENTS.md"), "# Concurrent rollback edit\n");
  assert.equal(existsSync(join(ctx.dir, "docs/STATUS.md")), false);
  assert.equal(existsSync(join(ctx.dir, ".skillgate/prepare.lock")), false, "the lock is released after a failure");
});

// ---------------------------------------------------------------- output contract

test("--json prints exactly one result object with the exit code's meaning", (t) => {
  const ctx = fixture(t);
  const parse = (r) => { assert.equal(r.out.trim().split("\n").length, 1, r.all); return JSON.parse(r.out); };
  const preview = prepare(ctx, "--json");
  assert.equal(preview.code, 0, preview.all);
  const p = parse(preview);
  assert.equal(p.schema, "skillgate.result/1");
  assert.equal(p.command, "prepare");
  assert.equal(p.result, "complete");
  assert.equal(p.details.mode, "preview");
  assert.equal(p.details.written, false);
  assert.deepEqual(p.details.files.find((f) => f.path === "docs/STATUS.md"), { path: "docs/STATUS.md", action: "create", description: 'status record, created as "not yet assessed"' });

  const check = prepare(ctx, "--check", "--json");
  assert.equal(check.code, 1);
  assert.equal(parse(check).result, "attention");

  const applied = prepare(ctx, "--apply", "--json");
  assert.equal(applied.code, 0, applied.all);
  const a = parse(applied);
  assert.equal(a.result, "complete");
  assert.equal(a.details.written, true);

  write(ctx, ".skillgate/config.json", "[1, 2]");
  const invalid = prepare(ctx, "--json");
  assert.equal(invalid.code, 2);
  const i = parse(invalid);
  assert.equal(i.result, "invalid");
  assert.match(i.summary, /must hold a JSON object/);
  assert.deepEqual(snapshot(ctx.dir)[".skillgate/config.json"], Buffer.from("[1, 2]").toString("base64"));
});

// ---------------------------------------------------------------- mutation check

test("mutation: without the recheck before replacing a file, the concurrent-edit assertion fails", (t) => {
  const ctx = fixture(t);
  const copy = join(ctx.base, "plugin-copy", "workflow");
  cpSync(PLUGIN, copy, { recursive: true });
  const engine = join(copy, "runtime", "lib", "prepare.mjs");
  const source = readFileSync(engine, "utf8");
  const target = 'writeAtomically(info.abs, change.after, change.mode, () => recheck("while its replacement was being staged"));';
  assert.ok(source.includes(target), "the mutation target is no longer in lib/prepare.mjs; update this mutation check");
  writeFileSync(engine, source.replace(target, "writeAtomically(info.abs, change.after, change.mode, () => {});"));

  write(ctx, "AGENTS.md", "# Original\n");
  const r = sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"], { cli: join(copy, "runtime", "skillgate.mjs"), preload: preloader(ctx, EDIT_AFTER_AGENTS_BACKUP), env: { SKILLGATE_TEST_TARGET: ctx.dir } });
  assert.equal(r.code, 0, `the mutated runtime completes without noticing: ${r.all}`);
  assert.notEqual(read(ctx, "AGENTS.md"), "# Concurrent edit\n", "the mutant overwrote the concurrent edit, so the unmutated test's assertion can fail");
});
