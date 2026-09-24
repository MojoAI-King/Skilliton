#!/usr/bin/env node
// rename.test.mjs: the move from the earlier Skillgate names to Skilliton (PLAN.md M9): migration 0003-skilliton-names
// on a project the earlier release really prepared, its refusals and rollback, and the reports for state left under
// the earlier names on a machine or a repository (docs/BRANDING.md).
//
// The earlier release is read from this repository's Git history (commit EARLIER, the last commit before the rename)
// and run from a temporary folder, the way migrate.test.mjs runs the prototype. Every home, trust, receipt and backup
// folder is inside a temporary folder, and Git's global configuration is pointed away from the real one.
//
//   node --test scripts/rename.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const CLI = join(here, "skilliton.mjs");
// 0003-skilliton-names itself now runs through this one-shot script (N19, B69), not skilliton migrate, which refuses
// a layout-2 project and names this script instead; skilliton migrate keeps the instructions refresh (0100-...) and
// 0004-security-findings-file. legacyMigrate below calls it the way sg calls CLI, minus the "migrate" subcommand
// token this script does not take (it is its own entry point, not a skilliton.mjs subcommand).
const LEGACY_CLI = join(here, "legacy-migrate.mjs");
const GUARD = join(REPO, "packs", "base", "plugins", "guardrails", "hooks", "guard-bash.sh");
// The last commit before the rename. It was e5900d5 until the history rewrite of 2026-09-23, which kept its tree and
// author date and gave it this hash; e5900d5 is in no clone made since.
const EARLIER = "62f21b6";
const HAS_EARLIER = spawnSync("git", ["-C", REPO, "cat-file", "-e", `${EARLIER}^{commit}`]).status === 0;
// A shallow clone is the one case where the commit may be missing and the tests may skip. Anywhere else a missing
// commit is a failure with its reason (earlierRelease), never a skip that lets the run read PASS.
const SHALLOW = spawnSync("git", ["-C", REPO, "rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).stdout?.trim() === "true";
const EARLIER_SKIP = !HAS_EARLIER && SHALLOW ? `NOT RUN: this clone is shallow, so commit ${EARLIER} (the earlier release) is not in it` : false;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };

function clean(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) if (/^SKILL(GATE|ITON)_/.test(key)) delete out[key];
  return out;
}

function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-rename-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "project"), home: join(base, "home"), earlier: join(base, "earlier-release") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d, { recursive: true });
  ctx.env = { ...clean(process.env), ...GIT_ENV, HOME: ctx.home, SKILLITON_SELF: "skilliton", SKILLITON_BACKUPS: join(base, "backups") };
  git(ctx, ctx.dir, "init", "-q", "-b", "main");
  return ctx;
}

const git = (ctx, dir, ...args) => execFileSync("git", ["-C", dir, ...args], { env: { ...process.env, ...GIT_ENV }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function sg(ctx, args, { env = {}, cli = CLI, cwd = ctx.dir } = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, env: { ...ctx.env, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}
// 0003-skilliton-names, previewed/applied/rolled back through scripts/legacy-migrate.mjs; same args as sg's "migrate"
// calls, minus the leading "migrate" token.
const legacyMigrate = (ctx, ...args) => sg(ctx, args, { cli: LEGACY_CLI });

// The earlier release's runtime, skills repository files and command line, extracted from Git history.
function earlierRelease(ctx) {
  if (!HAS_EARLIER) assert.fail(`commit ${EARLIER} (the last commit before the rename, e5900d5 before the 2026-09-23 history rewrite) is not in this clone, and the clone is not shallow, so the earlier release could not be built from history`);
  mkdirSync(ctx.earlier, { recursive: true });
  const archive = spawnSync("git", ["-C", REPO, "archive", "--format=tar", EARLIER, "packs/base/plugins/workflow", "scripts/skillgate.mjs", "templates", ".claude-plugin"], { maxBuffer: 256 * 1024 * 1024 });
  assert.equal(archive.status, 0, `fixture: git archive ${EARLIER}: ${archive.stderr}`);
  execFileSync("tar", ["-x", "-C", ctx.earlier], { input: archive.stdout });
  const cli = join(ctx.earlier, "scripts", "skillgate.mjs");
  const env = { ...clean(process.env), ...GIT_ENV, HOME: ctx.home, SKILLGATE_SELF: "skillgate", SKILLGATE_BACKUPS: join(ctx.base, "earlier-backups") };
  return (args) => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd: ctx.dir, env, encoding: "utf8" });
    assert.equal(r.status, 0, `fixture: the earlier release ran ${args.join(" ")}: ${r.stdout}${r.stderr}`);
    return r;
  };
}

// A layout-2 project written by the earlier release: prepared, with a decision, its index, team settings, a private
// evidence file, a person's line outside the managed block, and one commit.
function earlierProject(ctx) {
  const old = earlierRelease(ctx);
  writeFileSync(join(ctx.dir, "CLAUDE.md"), "# Shop\n\nA rule the team wrote before any setup.\n");
  old(["prepare", "--dir", ctx.dir, "--apply"]);
  old(["record", "decision", "Keep orders in PostgreSQL", "--dir", ctx.dir, "--apply"]);
  old(["index", "--dir", ctx.dir, "--apply"]);
  old(["project-settings", "--dir", ctx.dir, "--apply"]);
  mkdirSync(join(ctx.dir, ".skillgate", "private-evidence"), { recursive: true });
  writeFileSync(join(ctx.dir, ".skillgate", "private-evidence", "run.txt"), "synthetic collector output\n");
  git(ctx, ctx.dir, "add", "-A");
  git(ctx, ctx.dir, "commit", "-q", "-m", "prepared by the earlier release");
  return old;
}

// Every file and folder under dir except .git, ignored files included.
function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    for (const e of readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!rel && e.name === ".git") continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) out[p] = "symbolic link";
      else if (e.isDirectory()) { out[`${p}/`] = "folder"; walk(p); } else out[p] = readFileSync(join(dir, p)).toString("base64");
    }
  };
  walk("");
  return out;
}
const read = (ctx, rel) => readFileSync(join(ctx.dir, rel), "utf8");

// ---------------------------------------------------------------- migration 0003

test("a project the earlier release prepared is refused by other commands, migrates to the Skilliton names, and rolls back exactly", { skip: EARLIER_SKIP }, (t) => {
  const ctx = fixture(t);
  earlierProject(ctx);
  assert.match(read(ctx, "CLAUDE.md"), /^<!-- skillgate:harness:start v1 -->$/m, "fixture: the earlier release wrote its markers");
  assert.ok(existsSync(join(ctx.dir, ".skillgate", "config.json")), "fixture: the earlier release wrote .skillgate/");
  const before = snapshot(ctx.dir);

  const status = sg(ctx, ["status", "--dir", ctx.dir]);
  assert.equal(status.code, 1, status.all);
  assert.match(status.out, /layout: layout 2 under the earlier Skillgate names \(\.skillgate\/\).*only migrate, status and doctor work/);
  assert.match(status.out, /security: not evaluated: the evidence is under the earlier Skillgate names/);
  for (const args of [["security", "status"], ["task", "start", "Add login", "--apply"], ["index", "--apply"], ["prepare", "--apply"]]) {
    const r = sg(ctx, [...args, "--dir", ctx.dir]);
    assert.equal(r.code, 2, `${args.join(" ")}: ${r.all}`);
    assert.match(r.err, /earlier Skillgate names/, `${args.join(" ")} names the reason`);
    assert.match(r.err, /skilliton migrate/, `${args.join(" ")} names the migration`);
  }
  assert.deepEqual(snapshot(ctx.dir), before, "refused commands wrote nothing");

  const preview = legacyMigrate(ctx, "--dir", ctx.dir);
  assert.equal(preview.code, 1, preview.all);
  assert.match(preview.out, /0003-skilliton-names \(layout 2 to 3\)/);
  assert.match(preview.out, /create\s+\.skilliton\/private-evidence\/run\.txt/);
  assert.match(preview.out, /update\s+\.claude\/settings\.json\s+the marketplace "skillgate" and its plugin keys renamed to "skilliton"/);
  assert.deepEqual(snapshot(ctx.dir), before, "the preview wrote nothing");

  const applied = legacyMigrate(ctx, "--dir", ctx.dir, "--apply");
  assert.equal(applied.code, 0, applied.all);
  assert.equal(existsSync(join(ctx.dir, ".skillgate")), false, "the earlier folder is gone");
  const config = JSON.parse(read(ctx, ".skilliton/config.json"));
  assert.equal(config.prepare.version, 3);
  assert.equal(read(ctx, ".skilliton/private-evidence/run.txt"), "synthetic collector output\n", "ignored private evidence moved with the project");
  const claude = read(ctx, "CLAUDE.md");
  assert.ok(claude.startsWith("# Shop\n\nA rule the team wrote before any setup.\n"), "text outside the block is kept");
  assert.match(claude, /^<!-- skilliton:harness:start v1 -->$/m);
  assert.doesNotMatch(claude, /skillgate/i);
  assert.match(read(ctx, "DECISIONS.md"), /^<!-- skilliton:index:decisions:start -->$/m);
  assert.match(read(ctx, ".gitignore"), /^\/\.skilliton\/private-evidence\/$/m);
  assert.match(read(ctx, ".gitignore"), /^\/\.skillgate\/private-evidence\/$/m, "the earlier line stays for clones and branches not yet migrated");
  assert.equal(spawnSync("git", ["-C", ctx.dir, "check-ignore", "-q", ".skilliton/private-evidence/run.txt"]).status, 0, "moved private evidence is ignored");
  const modes = (rel) => (statSync(join(ctx.dir, rel)).mode & 0o777).toString(8);
  assert.deepEqual([modes(".skilliton/private-evidence"), modes(".skilliton/private-evidence/run.txt")], ["700", "600"], "private evidence stays readable by its owner only");
  const settings = JSON.parse(read(ctx, ".claude/settings.json"));
  assert.ok(Object.hasOwn(settings.extraKnownMarketplaces, "skilliton") && !Object.hasOwn(settings.extraKnownMarketplaces, "skillgate"));
  assert.ok(Object.keys(settings.enabledPlugins).every((k) => k.endsWith("@skilliton")));

  const fresh = fixture(t);
  assert.equal(sg(fresh, ["prepare", "--dir", fresh.dir, "--apply"]).code, 0);
  for (const rel of ["docs/tasks/README.md", "docs/decisions/README.md", "docs/lessons/README.md", "docs/security/README.md", ".skilliton/security/records/README.md"]) {
    assert.equal(read(ctx, rel), read(fresh, rel), `${rel} is what prepare generates under the Skilliton names`);
  }
  const check = sg(ctx, ["prepare", "--dir", ctx.dir, "--check"]);
  assert.equal(check.code, 0, `nothing else is missing or outdated after the migration: ${check.all}`);
  assert.doesNotMatch(Object.entries(snapshot(ctx.dir)).filter(([p]) => !p.endsWith("/") && !p.startsWith("docs/decisions/2") && !p.startsWith(".skilliton/migrations/") && p !== ".gitignore").map(([p, b]) => `${p}\n${Buffer.from(b, "base64").toString("utf8")}`).join("\n"), /skillgate:harness|skillgate:index|\.skillgate\//, "no generated marker or path under the earlier names is left");

  const rolled = legacyMigrate(ctx, "--dir", ctx.dir, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(rolled.code, 0, rolled.all);
  assert.deepEqual(snapshot(ctx.dir), before, "every file, including the ignored evidence, is back as the earlier release left it");
});

test("migration 0003 refuses what it cannot move safely, and changes nothing", { skip: EARLIER_SKIP }, (t) => {
  const ctx = fixture(t);
  earlierProject(ctx);
  const attempt = (label, setup, message, undo) => {
    setup();
    const before = snapshot(ctx.dir);
    const r = legacyMigrate(ctx, "--dir", ctx.dir, "--apply");
    assert.equal(r.code, 2, `${label}: ${r.all}`);
    assert.match(r.err, message, label);
    assert.deepEqual(snapshot(ctx.dir), before, `${label}: nothing changed`);
    undo();
  };
  attempt("a .skilliton folder that already holds files", () => { mkdirSync(join(ctx.dir, ".skilliton")); writeFileSync(join(ctx.dir, ".skilliton", "notes.txt"), "x\n"); },
    /\.skilliton\/ already holds files/, () => rmSync(join(ctx.dir, ".skilliton"), { recursive: true }));
  attempt("a symbolic link inside .skillgate", () => symlinkSync(ctx.home, join(ctx.dir, ".skillgate", "private-evidence", "outside")),
    /private-evidence\/outside is a symbolic link/, () => rmSync(join(ctx.dir, ".skillgate", "private-evidence", "outside")));
  attempt("a lock left by another run", () => writeFileSync(join(ctx.dir, ".skillgate", "prepare.lock"), "another run\n"),
    /prepare\.lock exists, so another Skilliton run may be writing this project/, () => rmSync(join(ctx.dir, ".skillgate", "prepare.lock")));
  attempt("a private evidence file over 1 MB", () => writeFileSync(join(ctx.dir, ".skillgate", "private-evidence", "large.log"), Buffer.alloc(1024 * 1024 + 1, 97)),
    /large\.log .*files over 1 MB are moved by hand/, () => rmSync(join(ctx.dir, ".skillgate", "private-evidence", "large.log")));
  const settingsPath = join(ctx.dir, ".claude", "settings.json");
  const settings = readFileSync(settingsPath);
  attempt("team settings in a layout the migration would reformat", () => writeFileSync(settingsPath, JSON.stringify(JSON.parse(settings))),
    /\.claude\/settings\.json names the earlier marketplace "skillgate", and the file is not in the two-space JSON layout/, () => writeFileSync(settingsPath, settings));

  // A block edited inside its markers after the earlier runtime recorded what it wrote.
  const text = read(ctx, "CLAUDE.md");
  const start = text.indexOf("<!-- skillgate:harness:start v1 -->\n") + "<!-- skillgate:harness:start v1 -->\n".length;
  const inner = text.slice(start, text.indexOf("<!-- skillgate:harness:end -->"));
  const receiptRel = ".skillgate/migrations/0100-instructions-aaaaaaaaaaaa.json";
  const receipt = { schema: "skillgate.migration-receipt/1", id: "0100-instructions-aaaaaaaaaaaa", from: 2, to: 2, appliedAt: "2026-09-01T00:00:00.000Z", runtime: "0.5.1", files: [], backup: "earlier", blocks: { "CLAUDE.md": sha256(Buffer.from(inner, "latin1")), "AGENTS.md": null } };
  mkdirSync(join(ctx.dir, ".skillgate", "migrations"), { recursive: true });
  writeFileSync(join(ctx.dir, receiptRel), `${JSON.stringify(receipt, null, 2)}\n`);
  attempt("a managed block a person edited", () => writeFileSync(join(ctx.dir, "CLAUDE.md"), text.replace(inner, `${inner}A line a person added inside the block.\n`)),
    /managed instruction block in CLAUDE\.md is neither what the earlier release writes for the current template nor what its last instructions receipt/, () => writeFileSync(join(ctx.dir, "CLAUDE.md"), text));

  const applied = legacyMigrate(ctx, "--dir", ctx.dir, "--apply");
  assert.equal(applied.code, 0, `with every obstacle removed the project migrates: ${applied.all}`);
  // A receipt the earlier runtime wrote moves with the project, is listed as applied, and is never rolled back by this one.
  for (const stage of ["after the move", "after rolling the move back"]) {
    if (stage === "after rolling the move back") { const back = legacyMigrate(ctx, "--dir", ctx.dir, "--rollback", "0003-skilliton-names", "--apply"); assert.equal(back.code, 0, back.all); }
    const before = snapshot(ctx.dir);
    const legacy = sg(ctx, ["migrate", "--dir", ctx.dir, "--rollback", "0100-instructions-aaaaaaaaaaaa", "--apply"]);
    assert.equal(legacy.code, 2, `${stage}: ${legacy.all}`);
    assert.match(legacy.err, /was written by the runtime before the rename to Skilliton .* only that release can roll it back/, stage);
    assert.deepEqual(snapshot(ctx.dir), before, `${stage}: nothing changed`);
  }
});

test("review regressions: evidence stays out of Git, receipts cannot be bent, and nothing is silently replaced", { skip: EARLIER_SKIP }, (t) => {
  // A hand edit inside the earlier block, with no instructions receipt to compare against, is refused.
  const edited = fixture(t);
  earlierProject(edited);
  const claude = read(edited, "CLAUDE.md");
  writeFileSync(join(edited.dir, "CLAUDE.md"), claude.replace("<!-- skillgate:harness:end -->", "A rule a person added inside the block.\n<!-- skillgate:harness:end -->"));
  const beforeEdit = snapshot(edited.dir);
  const refusedEdit = legacyMigrate(edited, "--dir", edited.dir, "--apply");
  assert.equal(refusedEdit.code, 2, refusedEdit.all);
  assert.match(refusedEdit.err, /CLAUDE\.md is neither what the earlier release writes for the current template nor what an earlier instructions receipt recorded/);
  assert.deepEqual(snapshot(edited.dir), beforeEdit);

  // Team settings that already name the current marketplace beside the earlier one are refused, not merged.
  const both = fixture(t);
  earlierProject(both);
  const settingsPath = join(both.dir, ".claude", "settings.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  settings.extraKnownMarketplaces.skilliton = { source: { source: "github", repo: "example/other" } };
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  const collision = legacyMigrate(both, "--dir", both.dir, "--apply");
  assert.equal(collision.code, 2, collision.all);
  assert.match(collision.err, /already has the marketplace key "skilliton" beside the earlier "skillgate" entries/);
  const settingsBefore = sg(both, ["project-settings", "--dir", both.dir, "--template", join(REPO, "templates", "project-settings.json"), "--apply"]);
  assert.equal(settingsBefore.code, 2, `project-settings refuses a project under the earlier names: ${settingsBefore.all}`);

  // A .gitignore that lists the earlier folder another way still ends up ignoring the moved evidence.
  const ignore = fixture(t);
  earlierProject(ignore);
  writeFileSync(join(ignore.dir, ".gitignore"), ".skillgate/private-evidence\n.skillgate/prepare.lock\n");
  assert.equal(legacyMigrate(ignore, "--dir", ignore.dir, "--apply").code, 0);
  assert.equal(spawnSync("git", ["-C", ignore.dir, "check-ignore", "-q", ".skilliton/private-evidence/run.txt"]).status, 0, "the moved evidence is ignored");

  // A rule that re-includes the moved evidence makes the migration stop short of saying "commit".
  const negated = fixture(t);
  earlierProject(negated);
  writeFileSync(join(negated.dir, ".gitignore"), `${read(negated, ".gitignore")}/.skilliton/private-evidence/\n!/.skilliton/private-evidence/\n`);
  const exposed = legacyMigrate(negated, "--dir", negated.dir, "--apply");
  assert.equal(exposed.code, 1, exposed.all);
  assert.match(exposed.out, /\.skilliton\/private-evidence\/ is not ignored by Git in this project after the move, so evidence there could be committed\. Do not commit yet/);

  // Evidence written after the migration blocks the rollback that would leave it outside every ignore line.
  writeFileSync(join(ignore.dir, ".skilliton", "private-evidence", "later.txt"), "collected after the move\n");
  const leftBehind = legacyMigrate(ignore, "--dir", ignore.dir, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(leftBehind.code, 2, leftBehind.all);
  assert.match(leftBehind.err, /1 file\(s\) were added under \.skilliton\/ after the migration \(\.skilliton\/private-evidence\/later\.txt\)/);
  rmSync(join(ignore.dir, ".skilliton", "private-evidence", "later.txt"));

  // An edited receipt that adds a file the migration never moved is refused.
  const receiptPath = join(ignore.dir, ".skilliton", "migrations", "0003-skilliton-names.json");
  const original = readFileSync(receiptPath);
  const receipt = JSON.parse(original);
  writeFileSync(join(ignore.dir, ".skilliton", "delivery.json"), "{}\n");
  receipt.files.push({ path: ".skilliton/delivery.json", action: "create", beforeSha256: null, afterSha256: sha256(Buffer.from("{}\n")) });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const bent = legacyMigrate(ignore, "--dir", ignore.dir, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(bent.code, 2, bent.all);
  assert.match(bent.err, /lists \.skilliton\/delivery\.json without the matching move from \.skillgate\//);
  assert.ok(existsSync(join(ignore.dir, ".skilliton", "delivery.json")), "the file the migration never created was not deleted");
  rmSync(join(ignore.dir, ".skilliton", "delivery.json"));
  writeFileSync(receiptPath, original);

  // A receipt from before the rename, moved by the migration, never blocks rolling the migration back, whatever time
  // it records.
  const dated = fixture(t);
  earlierProject(dated);
  const future = { schema: "skillgate.migration-receipt/1", id: "0100-instructions-bbbbbbbbbbbb", from: 2, to: 2, appliedAt: "2099-01-01T00:00:00.000Z", runtime: "0.5.1", files: [], backup: "earlier" };
  mkdirSync(join(dated.dir, ".skillgate", "migrations"), { recursive: true });
  writeFileSync(join(dated.dir, ".skillgate", "migrations", "0100-instructions-bbbbbbbbbbbb.json"), `${JSON.stringify(future, null, 2)}\n`);
  const datedBefore = snapshot(dated.dir);
  assert.equal(legacyMigrate(dated, "--dir", dated.dir, "--apply").code, 0);
  const undone = legacyMigrate(dated, "--dir", dated.dir, "--rollback", "0003-skilliton-names", "--apply");
  assert.equal(undone.code, 0, undone.all);
  assert.deepEqual(snapshot(dated.dir), datedBefore);
});

test("an unreadable earlier configuration is never quoted, and the stop reminder still runs before the migration", { skip: EARLIER_SKIP }, (t) => {
  const ctx = fixture(t);
  earlierProject(ctx);
  writeFileSync(join(ctx.dir, ".skillgate", "config.json"), '{"prepare": {"version": 2}, "apiToken": FAKE-SECRET-VALUE-0000}\n');
  for (const args of [["migrate"], ["prepare", "--check"], ["status"], ["security", "status"]]) {
    const r = sg(ctx, [...args, "--dir", ctx.dir]);
    assert.notEqual(r.code, 0, `${args.join(" ")}: ${r.all}`);
    assert.match(r.all, /\.skillgate\/config\.json is not valid JSON/, args.join(" "));
    assert.doesNotMatch(r.all, /FAKE-SECRET/, `${args.join(" ")} does not print the file's contents`);
  }

  const fresh = fixture(t);
  earlierProject(fresh);
  writeFileSync(join(fresh.dir, "src.txt"), "an unrecorded change\n");
  const stop = spawnSync(process.execPath, [CLI, "hook", "stop"], { cwd: fresh.dir, input: JSON.stringify({ cwd: fresh.dir, session_id: "s1" }), env: fresh.env, encoding: "utf8" });
  assert.doesNotMatch(stop.stderr, /not evaluated/, `the reminder is evaluated on a project under the earlier names: ${stop.stderr}`);
});

test("harness refuses a block written under the earlier names instead of adding a second one", { skip: EARLIER_SKIP }, (t) => {
  const ctx = fixture(t);
  const old = earlierRelease(ctx);
  writeFileSync(join(ctx.dir, "CLAUDE.md"), "# Notes\n");
  old(["harness", "--dir", ctx.dir, "--apply"]);
  const before = snapshot(ctx.dir);
  for (const args of [["harness", "--apply"], ["harness", "--undo"], ["prepare", "--apply"]]) {
    const r = sg(ctx, [...args, "--dir", ctx.dir]);
    assert.equal(r.code, 2, `${args.join(" ")}: ${r.all}`);
    assert.match(r.err, /holds a harness block written under the earlier Skillgate names/, args.join(" "));
  }
  assert.deepEqual(snapshot(ctx.dir), before, "nothing was added or removed");
});

test("files under .skillgate whose names differ only in letter case are refused, where the file system allows both", { skip: EARLIER_SKIP }, (t) => {
  const ctx = fixture(t);
  earlierProject(ctx);
  writeFileSync(join(ctx.dir, ".skillgate", "Notes.txt"), "one\n");
  writeFileSync(join(ctx.dir, ".skillgate", "notes.txt"), "two\n");
  if (readdirSync(join(ctx.dir, ".skillgate")).filter((n) => n.toLowerCase() === "notes.txt").length < 2) { t.skip("NOT RUN: this file system ignores letter case, so both files cannot exist"); return; }
  const r = legacyMigrate(ctx, "--dir", ctx.dir, "--apply");
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /differ only in letter case/);
});

test("both configuration folders at once are refused before anything is read", (t) => {
  const ctx = fixture(t);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  mkdirSync(join(ctx.dir, ".skillgate"));
  writeFileSync(join(ctx.dir, ".skillgate", "config.json"), "{}\n");
  const before = snapshot(ctx.dir);
  for (const args of [["status"], ["migrate"], ["prepare", "--check"]]) {
    const r = sg(ctx, [...args, "--dir", ctx.dir]);
    assert.equal(r.code, 2, `${args.join(" ")}: ${r.all}`);
    assert.match(r.all, /both \.skilliton\/config\.json and \.skillgate\/config\.json exist/);
  }
  assert.deepEqual(snapshot(ctx.dir), before);
});

// ---------------------------------------------------------------- a machine and a repository

test("setting variables under the earlier names are reported, never read", (t) => {
  const ctx = fixture(t);
  const r = sg(ctx, ["--version"], { env: { SKILLGATE_TRUST_DIR: join(ctx.base, "earlier-trust") } });
  assert.equal(r.code, 0, r.all);
  assert.match(r.err, /SKILLGATE_TRUST_DIR is set, but Skilliton no longer reads it; the variable is now SKILLITON_TRUST_DIR/);
  assert.equal(sg(ctx, ["prepare", "--dir", ctx.dir, "--apply"]).code, 0);
  const hook = spawnSync(process.execPath, [CLI, "hook", "session-start"], { cwd: ctx.dir, input: JSON.stringify({ cwd: ctx.dir }), env: { ...ctx.env, SKILLGATE_GUARDRAILS: "off" }, encoding: "utf8" });
  assert.match(hook.stdout, /Environment \(needs attention\): SKILLGATE_GUARDRAILS is set but no longer read; the variable is now SKILLITON_GUARDRAILS/);
});

test("join refuses a machine set up for the company under the earlier name, and changes nothing", (t) => {
  const ctx = fixture(t);
  const receipt = join(ctx.home, ".config", "skillgate", "joined", "acme.json");
  mkdirSync(dirname(receipt), { recursive: true });
  writeFileSync(receipt, "{}\n");
  const keys = join(ctx.base, "keys");
  mkdirSync(keys);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(keys, "approver")]);
  const pub = readFileSync(join(keys, "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
  writeFileSync(join(keys, "allowed_signers"), `approver@example.invalid namespaces="git" ${pub}\n`);
  const trust = join(ctx.base, "trust"), joined = join(ctx.base, "joined");
  const r = sg(ctx, ["join", "--company", "acme", "--signers", join(keys, "allowed_signers"), "--repo", REPO, "--apply"], { env: { SKILLITON_TRUST_DIR: trust, SKILLITON_JOIN_DIR: joined, SKILLITON_CLAUDE: "", SKILLITON_CODEX: "" } });
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /company acme was set up on this machine before the rename to Skilliton \(its receipt is ~\/\.config\/skillgate\/joined\/acme\.json\)/);
  assert.match(r.err, /node scripts\/skillgate\.mjs join --undo --company acme --apply/);
  assert.equal(existsSync(trust) || existsSync(joined), false, "nothing was written");
});

test("verify names signers, installs and release tags left under the earlier names", (t) => {
  const ctx = fixture(t);
  const earlierTrust = join(ctx.home, ".config", "skillgate", "trust", "acme.allowed_signers");
  mkdirSync(dirname(earlierTrust), { recursive: true });
  writeFileSync(earlierTrust, "approver@example.invalid ssh-ed25519 AAAA\n");
  const trust = join(ctx.base, "trust");
  const missing = sg(ctx, ["verify", "--company", "acme", "--source", REPO, "--client", "claude-code", "--config-dir", join(ctx.base, "claude")], { env: { SKILLITON_TRUST_DIR: trust } });
  assert.equal(missing.code, 2, missing.all);
  assert.match(missing.err, /trusted company acme's signers before the rename to Skilliton, at ~\/\.config\/skillgate\/trust\/acme\.allowed_signers, which is no longer read/);

  const keys = join(ctx.base, "keys");
  mkdirSync(keys);
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(keys, "approver")]);
  const pub = readFileSync(join(keys, "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
  writeFileSync(join(keys, "allowed_signers"), `approver@example.invalid namespaces="git" ${pub}\n`);
  assert.equal(sg(ctx, ["trust", "add", "--company", "acme", "--signers", join(keys, "allowed_signers"), "--apply"], { env: { SKILLITON_TRUST_DIR: trust } }).code, 0);

  const skills = join(ctx.base, "skills");
  mkdirSync(join(skills, ".claude-plugin"), { recursive: true });
  writeFileSync(join(skills, ".claude-plugin", "marketplace.json"), `${JSON.stringify({ name: "skilliton", owner: { name: "acme" }, plugins: [] }, null, 2)}\n`);
  git(ctx, skills, "init", "-q", "-b", "main");
  git(ctx, skills, "add", "-A");
  git(ctx, skills, "commit", "-q", "-m", "skills");
  git(ctx, skills, "tag", "skillgate-release/1.0.0");
  const claude = join(ctx.base, "claude");
  mkdirSync(join(claude, "plugins"), { recursive: true });
  writeFileSync(join(claude, "plugins", "installed_plugins.json"), `${JSON.stringify({ version: 2, plugins: { "workflow@skillgate": [{ scope: "user", installPath: join(claude, "plugins", "cache", "skillgate", "workflow", "0.5.1"), version: "0.5.1" }] } }, null, 2)}\n`);
  const r = sg(ctx, ["verify", "--company", "acme", "--source", skills, "--client", "claude-code", "--config-dir", claude], { env: { SKILLITON_TRUST_DIR: trust } });
  assert.equal(r.code, 1, r.all);
  assert.match(r.all, /1 release tag\(s\) use the earlier prefix skillgate-release\/, which is no longer read/);
  assert.match(r.all, /workflow@skillgate came from the marketplace's earlier name "skillgate"/);
});

test("delivery install leaves a hook written under the earlier name in place and says how to replace it", (t) => {
  const ctx = fixture(t);
  const bare = join(ctx.base, "server.git");
  execFileSync("git", ["init", "-q", "--bare", bare], { env: { ...process.env, ...GIT_ENV } });
  const hook = join(bare, "hooks", "pre-receive");
  const earlier = "#!/bin/sh\n# skillgate:delivery-hook v1\nexit 0\n";
  writeFileSync(hook, earlier);
  chmodSync(hook, 0o755);
  const approvers = join(ctx.base, "approvers");
  writeFileSync(approvers, "approver@example.invalid ssh-ed25519 AAAA\n");
  const r = sg(ctx, ["delivery", "install", "--bare", bare, "--approvers", approvers, "--runtime", join(REPO, "packs", "base", "plugins", "workflow", "bin", "skilliton"), "--apply"]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /was written by delivery install before the rename to Skilliton; it was left untouched/);
  assert.match(r.err, /git config --unset skillgate\.approvers; git config --unset skillgate\.runtime/);
  assert.equal(readFileSync(hook, "utf8"), earlier);
});

test("guardrails keep an unmigrated project's protected branches, and say where they came from", (t) => {
  const ctx = fixture(t);
  mkdirSync(join(ctx.dir, ".skillgate"));
  writeFileSync(join(ctx.dir, ".skillgate", "config.json"), `${JSON.stringify({ guardrails: { protectedBranches: ["release/*"] }, prepare: { version: 2 } }, null, 2)}\n`);
  const env = { ...ctx.env, CLAUDE_PROJECT_DIR: ctx.dir, SKILLITON_GUARDRAILS_CLIENT: "claude-code" };
  const push = spawnSync("bash", [GUARD], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force origin release/1.2" }, cwd: ctx.dir }), env, encoding: "utf8" });
  assert.match(push.stdout, /"permissionDecision":"deny"/, `a force-push to a branch the unmigrated project protects is blocked: ${push.stdout}${push.stderr}`);
  const start = spawnSync("bash", [GUARD, "--session-start"], { input: JSON.stringify({ cwd: ctx.dir }), env, encoding: "utf8" });
  assert.match(start.stdout, /settings come from \.skillgate\/config\.json until the project is migrated/);
});

test("the scrub check and the status line setup name files left at the earlier default locations", (t) => {
  const ctx = fixture(t);
  mkdirSync(join(ctx.home, ".config", "skillgate"), { recursive: true });
  writeFileSync(join(ctx.home, ".config", "skillgate", "denylist"), "# names\n");
  const scanned = join(ctx.base, "scanned");
  mkdirSync(scanned);
  writeFileSync(join(scanned, "a.md"), "plain text\n");
  const scrub = spawnSync("bash", [join(here, "scrub-check.sh"), "--path", scanned], { env: { ...ctx.env }, encoding: "utf8" });
  assert.equal(scrub.status, 2, `${scrub.stdout}${scrub.stderr}`);
  assert.match(scrub.stdout, /A denylist exists at the earlier default, ~\/\.config\/skillgate\/denylist, which is no longer read/);

  const backup = join(ctx.home, ".claude", "backups", "skillgate", "2026-09-01T00-00-00");
  mkdirSync(backup, { recursive: true });
  writeFileSync(join(backup, "settings.json"), "{}\n");
  const env = { ...ctx.env };
  delete env.SKILLITON_BACKUPS;
  const undo = spawnSync(process.execPath, [join(here, "setup.mjs"), "--undo"], { env, encoding: "utf8" });
  assert.equal(undo.status, 1, `${undo.stdout}${undo.stderr}`);
  assert.match(undo.stdout, /holds backups made before the rename to Skilliton, which this version does not read/);
});

// The template frozen for migration 0003 is the one the last release before the rename shipped (commit 214eb17), and
// the current template differs from it, which is the case the frozen copy exists for: without it, the first template
// change after the rename made every block that release wrote look hand-edited (found 2026-09-18).
test("the frozen template migration 0003 recognises is the earlier release's own, and the current template has moved on", async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync: read } = await import("node:fs");
  const { LEGACY_TEMPLATE, LEGACY_TEMPLATE_SHA12 } = await import("../packs/base/plugins/workflow/runtime/lib/legacy-template.mjs");
  const sha12 = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
  assert.equal(LEGACY_TEMPLATE_SHA12, "a340107f1258");
  assert.equal(sha12(LEGACY_TEMPLATE), LEGACY_TEMPLATE_SHA12);
  const current = read(new URL("../packs/base/plugins/workflow/templates/harness.md", import.meta.url), "utf8");
  assert.notEqual(sha12(current.replace(/skilliton/g, "skillgate")), LEGACY_TEMPLATE_SHA12, "the current template under the earlier names is no longer the earlier release's, so the frozen copy is load-bearing");
});
