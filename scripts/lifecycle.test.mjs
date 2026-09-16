#!/usr/bin/env node
// lifecycle.test.mjs: tests for task records, checkpoints, the journal, `skillgate status` and the lifecycle hooks
// (packs/base/plugins/workflow/runtime: lib/tasks.mjs, lib/journal.mjs, lib/lifecycle.mjs, commands/task.mjs,
// commands/checkpoint.mjs, commands/status.mjs, commands/hook.mjs, and hooks/hooks.json).
//
// Commands run the way a person runs them: `node scripts/skillgate.mjs <command>` in the project folder. Hooks run the
// way Claude Code runs them: the shipped bin/skillgate executed by path with the hook JSON on stdin, and the exact
// hooks.json command strings through `sh -c` with CLAUDE_PLUGIN_ROOT set. Every test works in its own folder under
// os.tmpdir(), with HOME pointed inside it so no personal Git configuration applies, and removes it afterwards.
//
// Two kinds of test use a byte-for-byte copy of the plugin folder instead of the shipped path: the mutation checks
// (the copy has one deliberate defect, and the test proves a key assertion fails against it) and the checks of the
// cross-lane modules (the copy gains a fake lib/migrations.mjs and lib/security.mjs, which this lane does not ship).
//
//   node scripts/lifecycle.test.mjs

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const CLI = join(here, "skillgate.mjs");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");
// Whether the cross-lane modules status reads are in this build (they are optional to the lifecycle engine).
const HAS_MIGRATIONS = existsSync(join(PLUGIN, "runtime", "lib", "migrations.mjs"));
const HAS_SECURITY = existsSync(join(PLUGIN, "runtime", "lib", "security.mjs"));
const BIN = join(PLUGIN, "bin", "skillgate");
const HOOKS_JSON = join(PLUGIN, "hooks", "hooks.json");
const INSTALLED = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const RECORD_FILES = ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md"];

// ---------------------------------------------------------------- harness

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skillgate-lifecycle-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  };
  for (const key of ["SKILLGATE_SELF", "SKILLGATE_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  try {
    await body({ dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (cwd, env, message) => { git(cwd, ["add", "-A"], env); git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message], env); };

function initRepo(dir, env, { branch = "main" } = {}) {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", `refs/heads/${branch}`], env);
  writeFileSync(join(dir, "README.md"), "# fixture\n");
  commit(dir, env, "init");
  return dir;
}

function writeConfig(dir, config) {
  mkdirSync(join(dir, ".skillgate"), { recursive: true });
  writeFileSync(join(dir, ".skillgate", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

// A prepared project with every record, a current handoff, and everything committed.
function preparedRepo(dir, env, { config = {}, written = new Date().toISOString() } = {}) {
  initRepo(dir, env);
  writeConfig(dir, { prepare: { version: 2, requires: { workflow: INSTALLED } }, ...config });
  for (const rel of RECORD_FILES) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `# ${rel}\n\nKind: Living.\n`);
  }
  writeHandoff(dir, written);
  commit(dir, env, "prepare");
  return dir;
}

function writeHandoff(dir, written) {
  writeFileSync(join(dir, "docs", "HANDOFF.md"), `# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: ${written}\n\n- **State:** fixture.\n- **Next:** nothing.\n- **Blocked:** nothing.\n- **Watch out:** nothing.\n`);
}

function cli(cwd, args, env, { entry = CLI } = {}) {
  const r = spawnSync(process.execPath, [entry, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

function hook(cwd, event, payload, env, { bin = BIN, raw = undefined } = {}) {
  const input = raw !== undefined ? raw : JSON.stringify({ cwd, hook_event_name: event, ...payload });
  const r = spawnSync(bin, ["hook", event], { cwd, env, input, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}`, error: r.error };
}

const gitDir = (dir, env) => git(dir, ["rev-parse", "--absolute-git-dir"], env).trim();
const journalFile = (dir, env) => join(gitDir(dir, env), "skillgate", "journal.jsonl");

function readEvents(dir, env) {
  const file = journalFile(dir, env);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}

function rewriteEvents(dir, env, edit) {
  const file = journalFile(dir, env);
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.stringify(edit(JSON.parse(line))));
  writeFileSync(file, `${lines.join("\n")}\n`);
}

const minutesEarlier = (iso, minutes) => new Date(Date.parse(iso) - minutes * 60000).toISOString();
const backdate = (dir, env, test, minutes) => rewriteEvents(dir, env, (e) => (test(e) ? { ...e, at: minutesEarlier(e.at, minutes) } : e));

// The fingerprint computed independently of the runtime: sha256 of HEAD, a newline, and the porcelain status.
function fingerprint(dir, env) {
  const head = spawnSync("git", ["rev-parse", "-q", "--verify", "HEAD^{commit}"], { cwd: dir, env, encoding: "utf8" }).stdout.trim();
  return createHash("sha256").update(`${head}\n${git(dir, ["status", "--porcelain=v1", "-uall"], env)}`).digest("hex");
}
const porcelainCount = (dir, env) => git(dir, ["status", "--porcelain=v1", "-uall"], env).split("\n").filter(Boolean).length;

function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function startTask(dir, env, title, extra = []) {
  const r = cli(dir, ["task", "start", title, ...extra, "--apply"], env);
  assert.equal(r.code, 0, r.all);
  const m = /created (\S+\/([^/\s]+))\.md/.exec(r.out);
  assert.ok(m, r.all);
  return { id: m[2], file: join(dir, `${m[1]}.md`) };
}

function copyPlugin(dir, mutate = null) {
  const copy = join(dir, "plugin-copy");
  cpSync(PLUGIN, copy, { recursive: true });
  if (mutate) mutate(copy);
  return { root: copy, bin: join(copy, "bin", "skillgate"), entry: join(copy, "runtime", "skillgate.mjs") };
}

// Replaces one exact snippet in a copied file and proves the replacement happened.
function mutateFile(file, from, to) {
  const text = readFileSync(file, "utf8");
  assert.ok(text.includes(from), `mutation target not found in ${file}: ${from}`);
  writeFileSync(file, text.split(from).join(to));
  assert.notEqual(readFileSync(file, "utf8"), text);
}

const statusJson = (dir, env, extraArgs = [], options = {}) => {
  const r = cli(dir, ["status", "--json", ...extraArgs], env, options);
  const trimmed = r.out.trim();
  assert.ok(trimmed.startsWith("{") && trimmed.endsWith("}"), `stdout is not one JSON object:\n${r.all}`);
  return { ...r, json: JSON.parse(trimmed) };
};
const checkStatus = (json, name) => json.details.checks.find((c) => c.name === name)?.status;

// ---------------------------------------------------------------- task records

test("task start, list, show, checkpoint and close round-trip with the exact file format", async () => withTemp("roundtrip", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  git(p, ["checkout", "-q", "-b", "feature/sign-in"], env);
  const args = ["task", "start", "Add a sign-in form", "--criteria", "Form validates email", "--criteria", "Tests cover it", "--owner", "dev-a"];

  const preview = cli(p, args, env);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /Preview only; nothing was written/);
  assert.match(preview.out, /^# Task: Add a sign-in form$/m);
  assert.equal(existsSync(join(p, "docs")), false, "a preview must not create the tasks folder");

  const before = localDate();
  const { id, file } = startTask(p, env, "Add a sign-in form", args.slice(3));
  const after = localDate();
  assert.match(id, new RegExp(`^(${before}|${after})-add-a-sign-in-form-[0-9a-f]{4}$`));
  assert.equal(file, join(p, "docs", "tasks", `${id}.md`));

  const created = readFileSync(file, "utf8");
  const updated = /^- \*\*Updated:\*\* (.+)$/m.exec(created)[1];
  assert.ok(!Number.isNaN(Date.parse(updated)) && updated.endsWith("Z"), updated);
  const expected = [
    "# Task: Add a sign-in form", "",
    "Kind: Living. Task record.", "",
    `- **ID:** ${id}`, "- **State:** in-progress", "- **Branch:** feature/sign-in", "- **Owner:** dev-a", `- **Updated:** ${updated}`, "",
    "## Request", "", "not yet written", "",
    "## Acceptance criteria", "", "- [ ] Form validates email", "- [ ] Tests cover it", "",
    "## Decisions", "", "not yet written", "",
    "## Checkpoints", "",
    "## Handoff", "",
    "- **State:** not yet written", "- **Next:** not yet written", "- **Blocked:** not yet written", "- **Watch out:** not yet written", "",
  ].join("\n");
  assert.equal(created, expected);

  const listed = cli(p, ["task", "list"], env);
  assert.equal(listed.code, 0, listed.all);
  assert.match(listed.out, new RegExp(`^\\* ${id}  in-progress  feature/sign-in  Add a sign-in form$`, "m"));
  const shown = cli(p, ["task", "show", id], env);
  assert.equal(shown.code, 0, shown.all);
  for (const line of ["Task: Add a sign-in form", `  ID:       ${id}`, "  Owner:    dev-a", "Acceptance criteria: 0 of 2 checked", "Checkpoints: 0", "Handoff: not yet written"]) assert.ok(shown.out.includes(line), `${line}\n${shown.out}`);
  const current = cli(p, ["task", "show"], env);
  assert.equal(current.code, 0, current.all);
  assert.ok(current.out.includes(`  ID:       ${id}`));

  writeFileSync(join(p, "src.js"), "work\n");
  const cpArgs = ["checkpoint", "--state", "Form renders", "--evidence", "npm test: 3 passed", "--next", "Add email validation"];
  const cpPreview = cli(p, cpArgs, env);
  assert.equal(cpPreview.code, 0, cpPreview.all);
  assert.match(cpPreview.out, /\+- \*\*Git:\*\* feature\/sign-in @ /);
  assert.equal(readFileSync(file, "utf8"), expected, "a checkpoint preview must not write");
  assert.equal(readEvents(p, env).length, 0, "a checkpoint preview must not record an event");

  const dirty = porcelainCount(p, env);
  const shortHead = git(p, ["rev-parse", "--short", "HEAD"], env).trim();
  const cp = cli(p, [...cpArgs, "--apply"], env);
  assert.equal(cp.code, 0, cp.all);
  const one = readFileSync(file, "utf8");
  const at = /^### (.+)$/m.exec(one)[1];
  const expectedOne = expected.replace(`- **Updated:** ${updated}`, `- **Updated:** ${at}`).replace("## Checkpoints\n\n",
    `## Checkpoints\n\n### ${at}\n\n- **State:** Form renders\n- **Evidence:** npm test: 3 passed\n- **Next:** Add email validation\n- **Git:** feature/sign-in @ ${shortHead}, ${dirty} uncommitted\n\n`);
  assert.equal(one, expectedOne);

  const events = readEvents(p, env);
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).slice(0, 7), ["at", "event", "session", "branch", "head", "dirty", "fingerprint"]);
  assert.equal(events[0].event, "checkpoint");
  assert.equal(events[0].task, id);
  assert.equal(events[0].session, null);
  assert.equal(events[0].branch, "feature/sign-in");
  assert.equal(events[0].head, git(p, ["rev-parse", "HEAD"], env).trim());
  assert.equal(events[0].dirty, porcelainCount(p, env));
  assert.equal(events[0].fingerprint, fingerprint(p, env), "the checkpoint event records the fingerprint after its own write");

  const cp2 = cli(p, ["checkpoint", "--task", id, "--state", "Validation added", "--next", "Open a pull request", "--apply"], env);
  assert.equal(cp2.code, 0, cp2.all);
  const two = readFileSync(file, "utf8");
  const at2 = [...two.matchAll(/^### (.+)$/gm)].map((m) => m[1])[1];
  const expectedTwo = expectedOne.replace(`- **Updated:** ${at}`, `- **Updated:** ${at2}`).replace(`uncommitted\n\n## Handoff`,
    `uncommitted\n\n### ${at2}\n\n- **State:** Validation added\n- **Evidence:** none given\n- **Next:** Open a pull request\n- **Git:** feature/sign-in @ ${shortHead}, ${porcelainCount(p, env)} uncommitted\n\n## Handoff`);
  assert.equal(two, expectedTwo);
  const shownTwo = cli(p, ["task", "show"], env);
  assert.ok(shownTwo.out.includes("Checkpoints: 2") && shownTwo.out.includes("    Next:     Open a pull request"), shownTwo.out);

  const closePreview = cli(p, ["task", "close", id, "--state", "done-local"], env);
  assert.equal(closePreview.code, 0, closePreview.all);
  assert.match(closePreview.out, /^-- \*\*State:\*\* in-progress$/m);
  assert.match(closePreview.out, /^\+- \*\*State:\*\* done-local$/m);
  assert.equal(readFileSync(file, "utf8"), expectedTwo, "a close preview must not write");
  const closed = cli(p, ["task", "close", id, "--state", "done-local", "--apply"], env);
  assert.equal(closed.code, 0, closed.all);
  const final = readFileSync(file, "utf8");
  const updated3 = /^- \*\*Updated:\*\* (.+)$/m.exec(final)[1];
  assert.equal(final, expectedTwo.replace("- **State:** in-progress", "- **State:** done-local").replace(`- **Updated:** ${at2}`, `- **Updated:** ${updated3}`));
  const again = cli(p, ["task", "close", id, "--state", "done-local", "--apply"], env);
  assert.ok(again.code === 0 && again.out.includes("is already done-local"), again.all);

  assert.doesNotMatch(cli(p, ["task", "list"], env).out, new RegExp(id));
  assert.match(cli(p, ["task", "list", "--all"], env).out, new RegExp(`^  ${id}  done-local`, "m"));
  assert.equal(cli(p, ["task", "show"], env).code, 1, "a closed task is no longer the current task");
  const backups = join(gitDir(p, env), "skillgate-backups");
  assert.ok(existsSync(backups), "writes that replace a task file back it up under the git dir");
  assert.equal(git(p, ["status", "--porcelain", "--ignored"], env).includes("skillgate-backups"), false);
}));

test("human edits outside the header bullets are tolerated and every other byte is kept", async () => withTemp("edits", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Tolerate edits");
  const original = readFileSync(file, "utf8");
  const edited = original
    .replace("Kind: Living. Task record.\n", "Kind: Living. Task record.\n\nA paragraph a person added, with trailing spaces   \n")
    .replace("## Checkpoints\n\n", "## Checkpoints\n\nA note above the checkpoints.\n\n")
    .replace("## Handoff", "## Notes\n\n```\n## Checkpoints\n- **State:** planned\n### not a checkpoint\n```\n\n## Handoff");
  writeFileSync(file, edited);
  const shown = cli(p, ["task", "show", id], env);
  assert.equal(shown.code, 0, shown.all);
  assert.ok(shown.out.includes("  State:    in-progress") && shown.out.includes("Checkpoints: 0"), shown.out);

  const cp = cli(p, ["checkpoint", "--state", "Edited by hand", "--next", "Keep going", "--apply"], env);
  assert.equal(cp.code, 0, cp.all);
  const text = readFileSync(file, "utf8");
  const at = /^### (\d{4}.+)$/m.exec(text)[1];
  const updated = /^- \*\*Updated:\*\* (.+)$/m.exec(edited)[1];
  const expected = edited.replace(`- **Updated:** ${updated}`, `- **Updated:** ${at}`).replace("A note above the checkpoints.\n\n",
    `A note above the checkpoints.\n\n### ${at}\n\n- **State:** Edited by hand\n- **Evidence:** none given\n- **Next:** Keep going\n- **Git:** main @ ${git(p, ["rev-parse", "--short", "HEAD"], env).trim()}, 1 uncommitted\n\n`);
  assert.equal(text, expected);
  assert.ok(cli(p, ["task", "show", id], env).out.includes("Checkpoints: 1"));

  const crlf = readFileSync(file, "utf8").replace(/\n/g, "\r\n");
  writeFileSync(file, crlf);
  const cpCrlf = cli(p, ["checkpoint", "--state", "Windows line endings", "--next", "Check them", "--apply"], env);
  assert.equal(cpCrlf.code, 0, cpCrlf.all);
  const crlfAfter = readFileSync(file, "utf8");
  assert.equal(/[^\r]\n/.test(crlfAfter), false, "every line of a CRLF file still ends in CRLF");
  assert.ok(crlfAfter.includes("\r\n- **State:** Windows line endings\r\n"), crlfAfter);
  assert.equal(crlfAfter.replace(/### \d{4}-\d\d-\d\dT[^\r]+\r\n\r\n- \*\*State:\*\* Windows line endings\r\n- \*\*Evidence:\*\* none given\r\n- \*\*Next:\*\* Check them\r\n- \*\*Git:\*\* [^\r]+\r\n\r\n/, "").replace(/Updated:\*\* [^\r]+/, "U"), crlf.replace(/Updated:\*\* [^\r]+/, "U"));
}));

test("corrupted task records are named as unreadable and never written", async () => withTemp("corrupt", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Break me");
  const good = readFileSync(file, "utf8");
  const rel = `docs/tasks/${id}.md`;
  const cases = [
    ["a missing State field", good.replace("- **State:** in-progress\n", ""), "the State field"],
    ["an unknown State", good.replace("- **State:** in-progress", "- **State:** finished"), 'the State "finished" is not one of'],
    ["a repeated ID field", good.replace(`- **ID:** ${id}\n`, `- **ID:** ${id}\n- **ID:** ${id}\n`), "the ID field appears more than once"],
    ["an ID that does not match the file name", good.replace(`- **ID:** ${id}`, "- **ID:** 2020-01-01-other-abcd"), "does not match the file name"],
    ["no title heading", good.replace("# Task: Break me\n", ""), '"# Task: <title>"'],
    ["an Updated value that is not a date", good.replace(/- \*\*Updated:\*\* .+/, "- **Updated:** yesterday"), 'the Updated value "yesterday"'],
    ["the header bullets only inside a code fence", good.replace(`- **ID:** ${id}`, `\`\`\`\n- **ID:** ${id}\n\`\`\``), "the ID field"],
  ];
  for (const [label, content, reason] of cases) {
    writeFileSync(file, content);
    const message = `unreadable task record: ${rel}: `;
    const listed = cli(p, ["task", "list"], env);
    assert.equal(listed.code, 1, `${label}: task list\n${listed.all}`);
    assert.ok(listed.out.includes(message) && listed.out.includes(reason), `${label}: task list names it\n${listed.all}`);
    const shown = cli(p, ["task", "show", id], env);
    assert.equal(shown.code, 2, `${label}: task show\n${shown.all}`);
    assert.ok(shown.err.includes(message) && shown.err.includes(reason), `${label}: task show names it\n${shown.all}`);
    const cp = cli(p, ["checkpoint", "--task", id, "--state", "x", "--next", "y", "--apply"], env);
    assert.equal(cp.code, 2, `${label}: checkpoint\n${cp.all}`);
    const closed = cli(p, ["task", "close", id, "--state", "abandoned", "--apply"], env);
    assert.equal(closed.code, 2, `${label}: close\n${closed.all}`);
    assert.equal(readFileSync(file, "utf8"), content, `${label}: the file is unchanged`);
  }
  assert.equal(readEvents(p, env).length, 0, "refused checkpoints record no event");
  assert.equal(existsSync(join(gitDir(p, env), "skillgate-backups")), false, "refused writes make no backup");

  writeFileSync(file, good);
  writeFileSync(join(p, "docs", "tasks", "README.md"), "# Tasks\n");
  writeFileSync(join(p, "docs", "tasks", "notes.md"), "scratch\n");
  const extra = cli(p, ["task", "list"], env);
  assert.equal(extra.code, 1, extra.all);
  assert.ok(extra.out.includes("unreadable task record: docs/tasks/notes.md: the file name is not a task id"), extra.all);
  assert.equal(extra.out.includes("README.md"), false, "README.md explains the folder and is not a task");
  unlinkSync(join(p, "docs", "tasks", "notes.md"));

  const outside = join(dir, "outside.md");
  writeFileSync(outside, good);
  unlinkSync(file);
  symlinkSync(outside, file);
  const linked = cli(p, ["checkpoint", "--task", id, "--state", "x", "--next", "y", "--apply"], env);
  assert.equal(linked.code, 2, linked.all);
  assert.match(linked.err, /symbolic link/);
  assert.equal(readFileSync(outside, "utf8"), good, "nothing is written through a symbolic link");
  assert.match(cli(p, ["task", "list"], env).out, /the file is a symbolic link, which Skillgate does not follow/);

  unlinkSync(file);
  writeFileSync(file, good);
  linkSync(file, join(dir, "hard-link.md"));
  const hard = cli(p, ["task", "close", id, "--state", "abandoned", "--apply"], env);
  assert.equal(hard.code, 2, hard.all);
  assert.match(hard.err, /hard-linked/);
  assert.equal(readFileSync(join(dir, "hard-link.md"), "utf8"), good);
}));

test("a file changed between planning and writing is refused, and the change a person made is kept", async () => withTemp("changed-file", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Race me");
  const tasks = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "tasks.mjs")).href);
  const config = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "config.mjs")).href);
  const project = config.resolveProject(p);
  const gitState = { branch: "main", shortHead: "abc1234", dirty: 0 };
  const backups = join(dir, "backups");

  const plan = tasks.appendCheckpoint(project, id, { at: "2026-09-16T12:00:00.000Z", state: "planned in memory", next: "write it", git: gitState });
  assert.equal(plan.written, false);
  const edited = `${readFileSync(file, "utf8")}\nA line a person added while the command was running.\n`;
  writeFileSync(file, edited);
  assert.throws(() => tasks.writeTaskPlan(project, plan, { backupDir: backups, command: "checkpoint" }),
    (e) => e instanceof tasks.TaskChangedError && e.message === `docs/tasks/${id}.md changed while this command was running, so nothing was written; run the command again`);
  assert.equal(readFileSync(file, "utf8"), edited, "the person's change is kept");
  assert.equal(existsSync(backups), false, "nothing was backed up for a write that did not happen");
  assert.deepEqual(readdirSync(dirname(file)).filter((name) => name.endsWith(".tmp")), [], "no temporary file is left behind");

  const closing = tasks.closeTask(project, id, "abandoned", { at: "2026-09-16T12:05:00.000Z" });
  writeFileSync(file, `${edited}More text.\n`);
  assert.throws(() => tasks.writeTaskPlan(project, closing, { backupDir: backups }), tasks.TaskChangedError);

  const fresh = tasks.appendCheckpoint(project, id, { at: "2026-09-16T12:10:00.000Z", state: "planned again", next: "write it", git: gitState });
  const written = tasks.writeTaskPlan(project, fresh, { backupDir: backups, command: "checkpoint" });
  assert.equal(written.written, true, "control: an unchanged file is written");
  assert.equal(readFileSync(file, "latin1"), fresh.after);
  assert.equal(readFileSync(written.backup, "utf8"), `${edited}More text.\n`, "the backup holds the bytes that were replaced");
}));

test("the contract shapes of readTask, currentTask and the task id rule", async () => withTemp("shapes", async ({ dir, env }) => {
  const tasks = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "tasks.mjs")).href);
  const config = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "config.mjs")).href);
  assert.equal(tasks.newTaskId("Fix: the login page!", { date: new Date(2026, 0, 2), hex: () => "beef" }), "2026-01-02-fix-the-login-page-beef");
  assert.equal(tasks.newTaskId("!!!", { date: new Date(2026, 0, 2), hex: () => "0a0b" }), "2026-01-02-task-0a0b");
  const long = tasks.slugify("An extremely long task title that keeps going well past forty characters");
  assert.ok(long.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(long), long);
  assert.equal(tasks.slugify(`Caf${String.fromCharCode(0xe9)} menu`), "cafe-menu");
  for (let i = 0; i < 20; i++) assert.match(tasks.newTaskId("Same title"), tasks.TASK_ID_RE);

  const p = initRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Shape check");
  const task = tasks.readTask(file);
  for (const key of ["id", "title", "state", "branch", "owner", "updated", "checkpoints", "handoff"]) assert.ok(Object.prototype.hasOwnProperty.call(task, key), key);
  assert.deepEqual([task.id, task.title, task.state, task.branch, task.owner, task.checkpoints, task.handoff], [id, "Shape check", "in-progress", "main", "unassigned", 0, null]);
  writeFileSync(file, readFileSync(file, "utf8").replace("- **Blocked:** not yet written", "- **Blocked:** waiting for review"));
  assert.deepEqual(tasks.readTask(file).handoff, { state: "not yet written", next: "not yet written", blocked: "waiting for review", watchOut: "not yet written" });

  const project = config.resolveProject(p);
  const current = tasks.currentTask(project, "main");
  assert.equal(current.task.id, id);
  assert.deepEqual(current.ambiguous, []);
  assert.deepEqual([tasks.currentTask(project, "other").task, tasks.currentTask(project, null).task], [null, null]);
}));

test("non-ASCII text is written as UTF-8 and bytes that are not valid UTF-8 survive an edit", async () => withTemp("bytes", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const e = String.fromCharCode(0xe9);
  const title = `Caf${e} r${e}sum${e} for the ${String.fromCharCode(0x65e5, 0x672c)} team`;
  const { id, file } = startTask(p, env, title);
  assert.match(id, /-cafe-resume-for-the-team-[0-9a-f]{4}$/);
  assert.ok(readFileSync(file).includes(Buffer.from(`# Task: ${title}\n`, "utf8")));
  const original = readFileSync(file);
  const oddBytes = Buffer.concat([Buffer.from("\n## Notes\n\nraw bytes: "), Buffer.from([0xff, 0xfe, 0x80]), Buffer.from("\n")]);
  writeFileSync(file, Buffer.concat([original, oddBytes]));
  const state = `r${e}sum${e} ${String.fromCharCode(0x2713)} done`;
  const r = cli(p, ["checkpoint", "--state", state, "--next", "ship", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  const after = readFileSync(file);
  assert.ok(after.includes(Buffer.from([0xff, 0xfe, 0x80])), "invalid UTF-8 bytes outside the edit are unchanged");
  assert.ok(after.includes(Buffer.from(`- **State:** ${state}\n`, "utf8")), "the new text is UTF-8");
  assert.ok(after.subarray(after.length - oddBytes.length).equals(oddBytes), "the tail after the Checkpoints section is byte-identical");
}));

test("a tasks folder named in prepare.directories is used", async () => withTemp("tasks-folder", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  writeConfig(p, { prepare: { directories: { tasks: "work/items" } } });
  const { id, file } = startTask(p, env, "Custom folder");
  assert.equal(file, join(p, "work", "items", `${id}.md`));
  assert.equal(existsSync(join(p, "docs")), false);
  assert.match(cli(p, ["task", "list"], env).out, new RegExp(`^task list: 1 open task\\(s\\) in work/items;`, "m"));
  assert.equal(statusJson(p, env).json.details.tasks.folder, "work/items");
}));

test("bad invocations are refused with exit 2 and write nothing", async () => withTemp("refusals", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const refusals = [
    [["task"], /task needs a subcommand/],
    [["task", "frobnicate"], /unknown task subcommand "frobnicate"/],
    [["task", "start", "--apply"], /task start needs a title/],
    [["task", "start", "Two", "words", "--apply"], /takes one title, in quotes/],
    [["task", "start", "First line\nsecond line", "--apply"], /must be one line/],
    [["task", "start", "Bad branch", "--branch", "has..dots", "--apply"], /not a usable branch name/],
    [["task", "start", "No criteria value", "--criteria"], /--criteria needs a value/],
    [["task", "list", "--owner", "someone"], /--owner is not used by task list/],
    [["task", "show", "not-an-id"], /is not a task id/],
    [["task", "show", "2026-01-01-nothing-here-abcd"], /there is no task 2026-01-01-nothing-here-abcd/],
    [["task", "close", "2026-01-01-nothing-here-abcd"], /task close needs --state/],
    [["task", "close", "2026-01-01-nothing-here-abcd", "--state", "in-progress", "--apply"], /does not close a task/],
    [["task", "close", "2026-01-01-nothing-here-abcd", "--state", "done-local", "--apply"], /there is no task/],
    [["checkpoint", "--state", "only a state"], /checkpoint needs --next/],
    [["checkpoint", "--next", "only a next"], /checkpoint needs --state/],
    [["checkpoint", "--state", "two\nlines", "--next", "y", "--apply"], /--state must be one line/],
    [["checkpoint", "--state", "x", "--next", "y", "--apply"], /there is no current task: no open task record has Branch main/],
    [["checkpoint", "stray", "--state", "x", "--next", "y"], /takes no plain arguments/],
    [["status", "--verbose"], /unknown option --verbose/],
  ];
  for (const [args, reason] of refusals) {
    const r = cli(p, args, env);
    assert.equal(r.code, 2, `${args.join(" ")}\n${r.all}`);
    assert.match(r.err, reason, args.join(" "));
  }
  assert.equal(existsSync(join(p, "docs")), false);
  assert.equal(existsSync(join(gitDir(p, env), "skillgate")), false);

  const plain = join(dir, "not-a-repo");
  mkdirSync(plain);
  assert.notEqual(spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: plain, env }).status, 0, "premise: the folder is outside any Git repository");
  for (const args of [["task", "list"], ["task", "start", "Outside", "--apply"], ["checkpoint", "--state", "x", "--next", "y", "--apply"], ["status"]]) {
    const r = cli(plain, args, env);
    assert.equal(r.code, 2, r.all);
    assert.match(r.err, /is not inside a Git repository/);
  }
  const missingDir = cli(p, ["status", "--dir", join(dir, "no-such-folder")], env);
  assert.equal(missingDir.code, 2, missingDir.all);

  git(p, ["checkout", "-q", "--detach"], env);
  const detached = cli(p, ["task", "start", "Detached", "--apply"], env);
  assert.equal(detached.code, 2, detached.all);
  assert.match(detached.err, /HEAD is detached/);
  git(p, ["checkout", "-q", "main"], env);

  writeConfig(p, { checkpoints: { minMinutes: "soon" } });
  const invalid = cli(p, ["task", "list"], env);
  assert.equal(invalid.code, 2, invalid.all);
  assert.match(invalid.err, /checkpoints\.minMinutes must be a whole number/);
}));

test("two tasks on two branches in two git worktrees never collide, and the current task follows the branch", async () => withTemp("worktrees", async ({ dir, env }) => {
  const main = initRepo(join(dir, "main"), env);
  git(main, ["checkout", "-q", "-b", "feature-a"], env);
  const other = join(dir, "wt-b");
  git(main, ["worktree", "add", "-q", "-b", "feature-b", other, "main"], env);

  const a = startTask(main, env, "Build the shared part");
  const b = startTask(other, env, "Build the shared part");
  assert.notEqual(a.id, b.id, "the random suffix keeps two tasks with the same title apart");
  assert.equal(existsSync(join(main, "docs", "tasks", `${b.id}.md`)), false);
  assert.equal(existsSync(join(other, "docs", "tasks", `${a.id}.md`)), false);
  assert.match(cli(main, ["task", "show"], env).out, new RegExp(`ID:       ${a.id}`));
  assert.match(cli(other, ["task", "show"], env).out, new RegExp(`ID:       ${b.id}`));

  for (const [where, state] of [[main, "part A done"], [other, "part B done"]]) {
    const r = cli(where, ["checkpoint", "--state", state, "--next", "merge", "--apply"], env);
    assert.equal(r.code, 0, r.all);
  }
  assert.match(readFileSync(a.file, "utf8"), /- \*\*State:\*\* part A done/);
  assert.match(readFileSync(b.file, "utf8"), /- \*\*State:\*\* part B done/);
  assert.notEqual(journalFile(main, env), journalFile(other, env), "each worktree has its own journal");
  assert.deepEqual(readEvents(main, env).map((e) => e.task), [a.id]);
  assert.deepEqual(readEvents(other, env).map((e) => e.task), [b.id]);

  commit(main, env, "task A");
  commit(other, env, "task B");
  git(main, ["-c", "commit.gpgsign=false", "merge", "-q", "--no-edit", "feature-b"], env);
  assert.ok(existsSync(join(main, "docs", "tasks", `${a.id}.md`)) && existsSync(join(main, "docs", "tasks", `${b.id}.md`)), "the merge keeps both task files");
  const listed = cli(main, ["task", "list"], env);
  assert.equal(listed.code, 0, listed.all);
  assert.match(listed.out, new RegExp(`^\\* ${a.id}  in-progress  feature-a`, "m"));
  assert.match(listed.out, new RegExp(`^  ${b.id}  in-progress  feature-b`, "m"));
}));

test("an ambiguous current task is reported and never picked", async () => withTemp("ambiguous", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  writeConfig(p, { checkpoints: { minMinutes: 0 } });
  commit(p, env, "config");
  const one = startTask(p, env, "First task");
  const second = cli(p, ["task", "start", "Second task", "--apply"], env);
  assert.equal(second.code, 0, second.all);
  assert.match(second.out, /already has 1 open task/);
  const two = { id: /created docs\/tasks\/(\S+)\.md/.exec(second.out)[1] };
  const ids = [one.id, two.id].sort();

  const shown = cli(p, ["task", "show"], env);
  assert.equal(shown.code, 1, shown.all);
  assert.ok(shown.out.includes("ambiguous") && ids.every((id) => shown.out.includes(id)), shown.out);
  const listed = cli(p, ["task", "list"], env);
  assert.equal(listed.code, 1, listed.all);
  assert.equal(listed.out.includes("* "), false, "no task is marked current");
  const before = [one.id, two.id].map((id) => readFileSync(join(p, "docs", "tasks", `${id}.md`), "utf8"));
  const cp = cli(p, ["checkpoint", "--state", "x", "--next", "y", "--apply"], env);
  assert.equal(cp.code, 2, cp.all);
  assert.ok(cp.err.includes("ambiguous") && ids.every((id) => cp.err.includes(id)), cp.err);
  assert.deepEqual([one.id, two.id].map((id) => readFileSync(join(p, "docs", "tasks", `${id}.md`), "utf8")), before);

  const status = statusJson(p, env);
  assert.equal(checkStatus(status.json, "tasks"), "attention");
  assert.deepEqual(status.json.details.tasks.ambiguous, ids);
  assert.equal(status.json.details.tasks.current, null);

  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  writeFileSync(join(p, "change.txt"), "changed\n");
  const blocked = hook(p, "stop", { session_id: "s1" }, env);
  assert.equal(blocked.code, 0, blocked.all);
  const decision = JSON.parse(blocked.out);
  assert.equal(decision.decision, "block");
  assert.ok(ids.every((id) => decision.reason.includes(id)) && decision.reason.includes("checkpoint --task <id>"), decision.reason);
}));

// ---------------------------------------------------------------- journal

test("the journal survives corrupt lines, and lastEvents counts them", async () => withTemp("journal", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.equal(hook(p, "session-start", { session_id: "s1", source: "startup" }, env).code, 0);
  const file = journalFile(p, env);
  writeFileSync(file, `${readFileSync(file, "utf8")}this is not json\n{"event":"session-start"}\n{"at":"2026-09-16T10:00:00Z","event":"session-`, { flag: "w" });

  const ended = hook(p, "session-end", { session_id: "s1", reason: "other" }, env);
  assert.equal(ended.code, 0, ended.all);
  const lines = readFileSync(file, "utf8").split("\n");
  assert.equal(JSON.parse(lines[lines.length - 2]).event, "session-end", "an event appended after a cut-off line starts on its own line");

  const started = hook(p, "session-start", { session_id: "s2", source: "startup" }, env);
  assert.equal(started.code, 0, started.all);
  assert.match(started.out, /^- Previous session: session s1 \(started [^)]+\) ended normally; 3 corrupt journal line\(s\) ignored$/m);

  const status = statusJson(p, env);
  assert.notEqual(status.code, 3, status.all);
  assert.equal(status.json.details.sessions.journal.corrupt, 3);

  const journal = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "journal.mjs")).href);
  const last = journal.lastEvents(p, 2);
  assert.ok(Array.isArray(last));
  assert.deepEqual(last.map((e) => [e.event, e.session]), [["session-end", "s1"], ["session-start", "s2"]]);
  assert.equal(last.corrupt, 3);
  assert.equal(journal.lastEvents(p, 50).length, 3, "only valid events are returned");
}));

test("pre-compact and session-end record the mechanical Git state", async () => withTemp("events", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  git(p, ["checkout", "-q", "-b", "work"], env);
  writeFileSync(join(p, "one.txt"), "1\n");
  writeFileSync(join(p, "README.md"), "# changed\n");
  const compact = hook(p, "pre-compact", { session_id: "s9", trigger: "manual", custom_instructions: null }, env);
  assert.equal(compact.code, 0, compact.all);
  assert.equal(compact.out, "");
  const end = hook(p, "session-end", { session_id: "s9", reason: "prompt_input_exit" }, env);
  assert.equal(end.code, 0, end.all);
  const noId = hook(p, "pre-compact", {}, env);
  assert.equal(noId.code, 0, noId.all);
  const events = readEvents(p, env);
  const head = git(p, ["rev-parse", "HEAD"], env).trim();
  const fp = fingerprint(p, env);
  assert.deepEqual(events.map((e) => [e.event, e.session, e.branch, e.head, e.dirty, e.fingerprint]), [
    ["pre-compact", "s9", "work", head, 2, fp],
    ["session-end", "s9", "work", head, 2, fp],
    ["pre-compact", null, "work", head, 2, fp],
  ]);
  assert.equal(events[0].trigger, "manual");
  assert.equal(events[1].reason, "prompt_input_exit");
  for (const e of events) assert.ok(!Number.isNaN(Date.parse(e.at)));
}));

// ---------------------------------------------------------------- session start

test("session-start names every missing piece and stays within handoff.maxBytes", async () => withTemp("session-start", async ({ dir, env }) => {
  const wide = initRepo(join(dir, "wide"), env);
  const narrow = initRepo(join(dir, "narrow"), env);
  writeConfig(wide, { handoff: { maxBytes: 100000 } });
  writeConfig(narrow, { handoff: { maxBytes: 300 } });

  const full = hook(wide, "session-start", { session_id: "s1", source: "startup" }, env);
  assert.equal(full.code, 0, full.all);
  assert.equal(full.err, "");
  const lines = full.out.trimEnd().split("\n");
  assert.equal(lines[0], "[workflow] Project state (skillgate hook session-start):");
  const expectLine = (pattern) => assert.ok(lines.some((line) => pattern.test(line)), `${pattern}\n${full.out}`);
  expectLine(/^- Branch: main @ [0-9a-f]{7,}, 1 uncommitted$/);
  expectLine(/^- Layout \(needs attention\): not prepared by Skillgate \(no prepare\.version/);
  expectLine(HAS_MIGRATIONS ? /^- Pending migrations: none pending \(layout unknown, target 2\)$/ : /^- Pending migrations \(not run\): not available in this build \(runtime\/lib\/migrations\.mjs is not present\)$/);
  expectLine(new RegExp(`^- Versions: workflow runtime ${escape(INSTALLED)} installed; the project names no minimum version`));
  expectLine(/^- Records \(needs attention\): 9 of 9 missing: docs\/STATUS\.md \(status\), /);
  expectLine(/^- Current task: none \(no open task on branch main\); to start one: skillgate task start "<title>" --apply$/);
  expectLine(/^- Shared handoff: docs\/HANDOFF\.md is missing \(see records\)$/);
  expectLine(/^- Previous session: none recorded in this worktree's journal$/);
  expectLine(HAS_SECURITY ? /^- Security \(not run\): security evidence not available: no security catalog at \.skillgate\/security\/catalog\.json/ : /^- Security \(not run\): not available in this build \(runtime\/lib\/security\.mjs is not present\)$/);
  assert.equal(full.out.includes("truncated"), false);
  const recorded = readEvents(wide, env);
  assert.equal(recorded.length, 1);
  assert.deepEqual([recorded[0].event, recorded[0].session, recorded[0].source, recorded[0].fingerprint], ["session-start", "s1", "startup", fingerprint(wide, env)]);

  const cut = hook(narrow, "session-start", { session_id: "s1", source: "startup" }, env);
  assert.equal(cut.code, 0, cut.all);
  assert.ok(Buffer.byteLength(cut.out) <= 300, `${Buffer.byteLength(cut.out)} bytes:\n${cut.out}`);
  const cutLines = cut.out.trimEnd().split("\n");
  assert.equal(cutLines[cutLines.length - 1], "[workflow] Project state truncated at 300 bytes; for all of it run: skillgate status");
  const comparable = (line) => (line.startsWith("- Branch: ") ? "- Branch:" : line);
  for (const line of cutLines.slice(0, -1)) assert.ok(lines.map(comparable).includes(comparable(line)), `a truncated block keeps whole lines only: ${line}`);
  assert.equal(readEvents(narrow, env).length, 1, "a truncated block still records the session start");

  writeConfig(narrow, { handoff: { maxBytes: 200 } });
  const smallest = hook(narrow, "session-start", { session_id: "s2" }, env);
  assert.ok(smallest.code === 0 && Buffer.byteLength(smallest.out) <= 200, smallest.out);

  writeConfig(narrow, { handoff: { maxBytes: 5 } });
  const broken = hook(narrow, "session-start", { session_id: "s3" }, env);
  assert.equal(broken.code, 0, broken.all);
  assert.match(broken.out, /^- Configuration \(needs attention\): \.skillgate\/config\.json: handoff\.maxBytes must be a whole number from 200 to 100000$/m);
  assert.match(broken.out, /^- Records \(not run\): not evaluated, because \.skillgate\/config\.json cannot be used \(see the configuration problem\)$/m);
  assert.match(broken.out, /^- Previous session \(needs attention\): interrupted: session s2 \(started [^)]+\) has no session-end; 1 uncommitted change\(s\)/m);
  assert.ok(Buffer.byteLength(broken.out) <= 6000);

  const garbage = hook(wide, "session-start", {}, env, { raw: "this is not json" });
  assert.equal(garbage.code, 0, garbage.all);
  assert.match(garbage.out, /^- Hook input \(not usable\): the hook input on stdin was not JSON, so the current folder was used$/m);
}));

test("session-start shows the current task, its last checkpoint and its handoff", async () => withTemp("session-task", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Resume me");
  assert.equal(cli(p, ["checkpoint", "--state", "Half done", "--evidence", "unit tests pass", "--next", "Finish the form", "--apply"], env).code, 0);
  writeFileSync(file, readFileSync(file, "utf8").replace("- **State:** not yet written", "- **State:** paused mid-form").replace("- **Next:** not yet written", "- **Next:** wire the submit button"));
  const r = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, new RegExp(`^- Current task: ${id} "Resume me" \\(in-progress, 1 checkpoint\\(s\\)\\); last checkpoint [^:]+:\\d\\d:[^:]+: State: Half done; Evidence: unit tests pass; Next: Finish the form$`, "m"));
  assert.match(r.out, /^- Task handoff: State: paused mid-form; Next: wire the submit button; Blocked: not yet written; Watch out: not yet written$/m);
  assert.match(r.out, /^- Layout: layout 2 \(current for this runtime\)$/m);
  assert.match(r.out, /^- Records: all 9 present$/m);
}));

test("an interrupted previous session is detected", async () => withTemp("interrupted", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  assert.match(hook(p, "session-start", { session_id: "s1" }, env).out, /^- Previous session: none recorded/m);
  const second = hook(p, "session-start", { session_id: "s2" }, env);
  assert.match(second.out, /^- Previous session: interrupted: session s1 \(started [^)]+\) has no session-end; 0 uncommitted change\(s\) in the working tree now$/m);

  writeFileSync(join(p, "unsaved.txt"), "work in progress\n");
  const third = hook(p, "session-start", { session_id: "s3" }, env);
  assert.match(third.out, /^- Previous session \(needs attention\): interrupted: session s2 \(started [^)]+\) has no session-end; 1 uncommitted change\(s\) in the working tree now$/m);

  assert.equal(hook(p, "session-end", { session_id: "s3", reason: "prompt_input_exit" }, env).code, 0);
  const fourth = hook(p, "session-start", { session_id: "s4", source: "startup" }, env);
  assert.match(fourth.out, /^- Previous session: session s3 \(started [^)]+\) ended normally$/m);
  const compacted = hook(p, "session-start", { session_id: "s4", source: "compact" }, env);
  assert.match(compacted.out, /^- Previous session: session s3 \(started [^)]+\) ended normally$/m, "a compaction restart of the same session is not a previous session");

  const running = statusJson(p, env);
  assert.equal(running.json.details.sessions.latest.session, "s4");
  assert.equal(running.json.details.sessions.latest.ended, false);
  assert.equal(running.json.details.sessions.interrupted, false);
  assert.notEqual(checkStatus(running.json, "sessions"), "attention", "status cannot tell a running session from an interrupted one, so the latest session is not attention");

  assert.equal(hook(p, "session-start", { session_id: "s5" }, env).code, 0);
  const after = statusJson(p, env);
  assert.equal(after.json.details.sessions.previous.session, "s4");
  assert.equal(after.json.details.sessions.interrupted, true);
  assert.equal(checkStatus(after.json, "sessions"), "attention");
  const plain = cli(p, ["status"], env);
  assert.match(plain.out, /^ATTENTION  sessions: latest session s5 \(started [^)]+\) has not ended \(still running, or interrupted; status cannot tell which\); the session s4 \(started [^)]+\) before it was interrupted: no session-end, and a later session started; 1 uncommitted change\(s\) in the working tree now$/m);
}));

// ---------------------------------------------------------------- stop

// A repository whose session started minutesAgo minutes ago and whose working tree has changed since.
function stopFixture(dir, env, { config = { checkpoints: { minMinutes: 20 } }, minutesAgo = 30, change = true } = {}) {
  const p = initRepo(join(dir, "p"), env);
  writeConfig(p, config);
  commit(p, env, "config");
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  if (minutesAgo) backdate(p, env, (e) => e.event === "session-start", minutesAgo);
  if (change) writeFileSync(join(p, "work.txt"), "changed\n");
  return p;
}

function stopTwice(p, env, bin) {
  const first = hook(p, "stop", { session_id: "s1", stop_hook_active: false }, env, { bin });
  const eventsAfterFirst = readEvents(p, env);
  const second = hook(p, "stop", { session_id: "s1", stop_hook_active: false }, env, { bin });
  return { first, second, eventsAfterFirst, eventsAfterSecond: readEvents(p, env) };
}

test("stop blocks exactly once for a changed fingerprint after minMinutes", async () => withTemp("stop-once", async ({ dir, env }) => {
  const p = stopFixture(dir, env);
  const { first, second, eventsAfterFirst, eventsAfterSecond } = stopTwice(p, env, BIN);
  assert.equal(first.code, 0, first.all);
  assert.equal(first.err, "");
  const decision = JSON.parse(first.out);
  assert.deepEqual(Object.keys(decision), ["decision", "reason"]);
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /changed since this session started \(30 minutes ago\), and no checkpoint has been recorded/);
  assert.match(decision.reason, /No open task record matches branch main; otherwise start one, then record a checkpoint, by running: skillgate task start "<short title of this work>" --criteria "<what done means>" --apply and then: skillgate checkpoint --state "/);
  assert.match(decision.reason, /This reminder is given once for this working tree state; if this work should not be recorded, tell the user why and stop\./);
  assert.ok(decision.reason.endsWith("--apply"), "the command is the last thing in the reason, so it can be copied as it is");
  const reminded = eventsAfterFirst.filter((e) => e.event === "stop-reminded");
  assert.equal(reminded.length, 1);
  assert.equal(reminded[0].fingerprint, fingerprint(p, env));
  assert.equal(reminded[0].session, "s1");

  assert.equal(second.code, 0, second.all);
  assert.equal(second.out, "", "the second stop for the same working tree state is allowed");
  assert.equal(eventsAfterSecond.length, eventsAfterFirst.length, "an allowed stop records nothing");

  writeFileSync(join(p, "more.txt"), "a new change\n");
  const third = hook(p, "stop", { session_id: "s1" }, env);
  assert.equal(JSON.parse(third.out).decision, "block", "a new working tree state gets its own single reminder");

  const { id } = startTask(p, env, "Record the work");
  const withTask = JSON.parse(hook(p, "stop", { session_id: "s1" }, env).out).reason;
  assert.match(withTask, new RegExp(`Otherwise record where task ${id} stands \\(each value one line\\) by running: skillgate checkpoint --task ${id} --state "<what is done and what is not>" --evidence "<checks or tests you ran, with their results>" --next "<the next concrete step>" --apply$`));
}));

test("stop allows when stop_hook_active is true", async () => withTemp("stop-active", async ({ dir, env }) => {
  const p = stopFixture(dir, env);
  const before = readEvents(p, env).length;
  const r = hook(p, "stop", { session_id: "s1", stop_hook_active: true }, env);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, "");
  assert.equal(readEvents(p, env).length, before);
  assert.equal(JSON.parse(hook(p, "stop", { session_id: "s1", stop_hook_active: false }, env).out).decision, "block", "control: the same state blocks without stop_hook_active");
}));

test("stop allows after a checkpoint, and measures minMinutes from it", async () => withTemp("stop-checkpoint", async ({ dir, env }) => {
  const p = stopFixture(dir, env);
  startTask(p, env, "Checkpointed work");
  assert.equal(cli(p, ["checkpoint", "--state", "recorded", "--next", "continue", "--apply"], env).code, 0);
  const right = hook(p, "stop", { session_id: "s1" }, env);
  assert.equal(right.out, "", "nothing changed since the checkpoint");

  writeFileSync(join(p, "after-checkpoint.txt"), "new\n");
  assert.equal(hook(p, "stop", { session_id: "s1" }, env).out, "", "a change less than minMinutes after the checkpoint is allowed");

  backdate(p, env, (e) => e.event === "checkpoint", 25);
  const due = hook(p, "stop", { session_id: "s1" }, env);
  assert.match(JSON.parse(due.out).reason, /changed since the last checkpoint \(25 minutes ago\)/);
}));

test("stop measures from this session's start when it is later than the last checkpoint, and a compaction does not reset it", async () => withTemp("stop-baseline", async ({ dir, env }) => {
  // A checkpoint from an earlier session, then a commit made between sessions, then a new session that changes nothing.
  const p = stopFixture(dir, env, { change: false });
  startTask(p, env, "Earlier work");
  assert.equal(cli(p, ["checkpoint", "--state", "recorded", "--next", "continue", "--apply"], env).code, 0);
  backdate(p, env, (e) => e.event === "checkpoint", 60);
  writeFileSync(join(p, "between-sessions.txt"), "committed in a terminal\n");
  commit(p, env, "a commit between sessions");
  assert.equal(hook(p, "session-start", { session_id: "s2", source: "startup" }, env).code, 0);
  backdate(p, env, (e) => e.event === "session-start" && e.session === "s2", 30);
  const quiet = hook(p, "stop", { session_id: "s2" }, env);
  assert.equal(quiet.out, "", "nothing changed since this session started, so no reminder for the earlier commit");

  // A change in this session, then a compaction (another start with the same session ID) before the stop.
  writeFileSync(join(p, "this-session.txt"), "new work\n");
  assert.equal(hook(p, "session-start", { session_id: "s2", source: "compact" }, env).code, 0);
  const due = hook(p, "stop", { session_id: "s2" }, env);
  assert.equal(JSON.parse(due.out).decision, "block", "the compaction's start did not reset the baseline, so the change still gets its reminder");
  assert.match(JSON.parse(due.out).reason, /changed since this session started \(30 minutes ago\)/);
}));

test("stop allows when checkpoints.stopReminder is false", async () => withTemp("stop-off", async ({ dir, env }) => {
  const p = stopFixture(dir, env, { config: { checkpoints: { stopReminder: false, minMinutes: 20 } } });
  const r = hook(p, "stop", { session_id: "s1" }, env);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, "");
  writeConfig(p, { checkpoints: { stopReminder: true, minMinutes: 20 } });
  assert.equal(JSON.parse(hook(p, "stop", { session_id: "s1" }, env).out).decision, "block", "control: turning the reminder on blocks the same state");
}));

test("stop allows when nothing changed, and before minMinutes", async () => withTemp("stop-unchanged", async ({ dir, env }) => {
  const unchanged = stopFixture(join(dir, "a"), env, { change: false });
  const r = hook(unchanged, "stop", { session_id: "s1" }, env);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, "");
  writeFileSync(join(unchanged, "now-changed.txt"), "x\n");
  assert.equal(JSON.parse(hook(unchanged, "stop", { session_id: "s1" }, env).out).decision, "block", "control: a change makes the same session block");

  const early = stopFixture(join(dir, "b"), env, { minutesAgo: 5 });
  assert.equal(hook(early, "stop", { session_id: "s1" }, env).out, "", "5 of 20 minutes is too early");

  const unknown = stopFixture(join(dir, "c"), env);
  assert.equal(hook(unknown, "stop", { session_id: "another-session" }, env).out, "", "with no checkpoint and no recorded start for this session there is nothing to measure from");
}));

// ---------------------------------------------------------------- failures and outside Git

test("an internal failure exits 0 with a one-line notice and never blocks (unreadable journal)", async () => withTemp("failure", async ({ dir, env }) => {
  const p = stopFixture(dir, env);
  const file = journalFile(p, env);
  const saved = readFileSync(file);
  unlinkSync(file);
  mkdirSync(file);

  const stopped = hook(p, "stop", { session_id: "s1" }, env);
  assert.equal(stopped.code, 0, stopped.all);
  assert.equal(stopped.out, "", "a failing Stop hook prints no decision");
  assert.deepEqual(stopped.err.trimEnd().split("\n").length, 1, stopped.err);
  assert.match(stopped.err, /^\[workflow\] Skillgate stop hook failed \(the journal .+ could not be read \(EISDIR\)\); nothing was blocked and the session continues\.\n$/);

  for (const event of ["pre-compact", "session-end"]) {
    const r = hook(p, event, { session_id: "s1" }, env);
    assert.equal(r.code, 0, r.all);
    assert.equal(r.out, "");
    assert.equal(r.err.trimEnd().split("\n").length, 1, r.err);
    assert.match(r.err, new RegExp(`^\\[workflow\\] Skillgate ${event} hook failed \\(the journal .+ could not be written \\(EISDIR\\)\\)`));
  }

  const started = hook(p, "session-start", { session_id: "s2" }, env);
  assert.equal(started.code, 0, started.all);
  assert.match(started.out, /^- Previous session \(failed\): could not be evaluated: the journal .+ could not be read \(EISDIR\)$/m);
  assert.match(started.out, /^- Journal \(failed\): this session start was not recorded/m);
  assert.equal(started.err.trimEnd().split("\n").length, 1, started.err);

  const status = cli(p, ["status"], env);
  assert.equal(status.code, 3, status.all);
  assert.match(status.out, /^FAILED     sessions: could not be evaluated: the journal/m);

  rmSync(file, { recursive: true });
  writeFileSync(file, saved);
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    chmodSync(file, 0o000);
    try {
      const denied = hook(p, "stop", { session_id: "s1" }, env);
      assert.equal(denied.code, 0, denied.all);
      assert.equal(denied.out, "");
      assert.match(denied.err, /could not be read \(EACCES\)/);
    } finally {
      chmodSync(file, 0o644);
    }
  }
  assert.equal(JSON.parse(hook(p, "stop", { session_id: "s1" }, env).out).decision, "block", "control: with the journal readable again the same state blocks");
}));

test("a hook whose stdin is never closed stops waiting and still records its event", async () => withTemp("open-stdin", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  const started = Date.now();
  const outcome = await new Promise((resolveOutcome, rejectOutcome) => {
    const child = spawn(BIN, ["hook", "pre-compact"], { cwd: p, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    const guard = setTimeout(() => { child.kill("SIGKILL"); rejectOutcome(new Error("the hook was still waiting for stdin after 10 seconds")); }, 10000);
    child.on("error", rejectOutcome);
    child.on("exit", (code) => { clearTimeout(guard); child.stdin.destroy(); resolveOutcome({ code, out, err }); });
    child.stdin.write('{"session_id":"half-written"'); // never ended
  });
  assert.equal(outcome.code, 0, outcome.err);
  assert.ok(Date.now() - started < 9000);
  const events = readEvents(p, env);
  assert.deepEqual(events.map((e) => [e.event, e.session]), [["pre-compact", null]], "input that never completed is treated as missing, and the event is still recorded");
}));

test("outside a git repository every hook prints one line and exits 0", async () => withTemp("outside", async ({ dir, env }) => {
  const plain = join(dir, "plain");
  mkdirSync(plain);
  assert.notEqual(spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: plain, env }).status, 0, "premise: the folder is outside any Git repository");
  for (const event of ["session-start", "stop", "pre-compact", "session-end"]) {
    const r = hook(plain, event, { session_id: "s1" }, env);
    assert.equal(r.code, 0, r.all);
    assert.equal(r.err, "");
    assert.equal(r.out, `[workflow] Skillgate project state is unavailable: ${plain} is not inside a Git repository.\n`);
    const noCwd = hook(plain, event, {}, env, { raw: '{"session_id":"s1"}' });
    assert.equal(noCwd.code, 0, noCwd.all);
    assert.equal(noCwd.out, `[workflow] Skillgate project state is unavailable: ${realpathSync(plain)} is not inside a Git repository.\n`, "without cwd in the JSON the current folder is used");
    const gone = hook(plain, event, {}, env, { raw: JSON.stringify({ cwd: join(dir, "deleted") }) });
    assert.equal(gone.code, 0);
    assert.equal(gone.out, `[workflow] Skillgate project state is unavailable: the folder ${join(dir, "deleted")} does not exist.\n`);
  }
  const wrongEvent = spawnSync(BIN, ["hook", "user-prompt-submit"], { cwd: plain, env, input: "{}", encoding: "utf8" });
  assert.equal(wrongEvent.status, 0, "an unknown event never exits 2, which would block the client");
  assert.match(wrongEvent.stderr, /expects exactly one of session-start, stop, pre-compact, session-end/);
}));

// ---------------------------------------------------------------- status

test("status exits 0 for a clean prepared project, and --json is exactly one result object", async () => withTemp("status-clean", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const r = cli(p, ["status"], env);
  assert.equal(r.code, 0, r.all);
  for (const pattern of [
    /^OK         layout: layout 2 \(current for this runtime\)$/m,
    HAS_MIGRATIONS ? /^OK         migrations: none pending \(layout 2, target 2\)$/m : /^NOT RUN    migrations: not available in this build \(runtime\/lib\/migrations\.mjs is not present\)$/m,
    new RegExp(`^OK         versions: workflow runtime ${escape(INSTALLED)} installed; the project requires workflow ${escape(INSTALLED)} or later: met$`, "m"),
    /^OK         records: all 9 present$/m,
    /^OK         tasks: no task records yet \(docs\/tasks does not exist\); no open task on main$/m,
    /^OK         handoff: docs\/HANDOFF\.md was written .+; no later commit or uncommitted change \(0 uncommitted path\(s\)\)$/m,
    /^NOTE       sessions: no session recorded in this worktree's journal/m,
    HAS_SECURITY ? /^NOT RUN    security: security evidence not available: no security catalog at \.skillgate\/security\/catalog\.json/m : /^NOT RUN    security: not available in this build \(runtime\/lib\/security\.mjs is not present\)$/m,
    new RegExp("^Summary: Nothing needs attention among the checks that ran\\. Not run: " + [HAS_MIGRATIONS ? null : "migrations", "security"].filter(Boolean).join(", ") + "\\.$", "m"),
  ]) assert.match(r.out, pattern);

  const j = statusJson(p, env);
  assert.equal(j.code, 0);
  assert.equal(j.err, "");
  assert.deepEqual(Object.keys(j.json), ["schema", "command", "result", "summary", "details"]);
  assert.deepEqual([j.json.schema, j.json.command, j.json.result], ["skillgate.result/1", "status", "complete"]);
  assert.deepEqual(j.json.details.checks.map((c) => c.name), ["layout", "migrations", "versions", "records", "tasks", "handoff", "sessions", "security"]);
  assert.equal(j.json.details.layout.version, 2);
  assert.equal(j.json.details.migrations.available, HAS_MIGRATIONS);
  assert.equal(j.json.details.versions.installed, INSTALLED);
  assert.equal(j.json.details.records.missing.length, 0);
  assert.equal(j.json.details.handoff.stale, false);
  assert.equal(j.json.details.security.available, false);

  const elsewhere = cli(dir, ["status", "--dir", join(p, "docs")], env);
  assert.equal(elsewhere.code, 0, elsewhere.all);
}));

test("status exits 1 for each attention condition and names it", async () => withTemp("status-attention", async ({ dir, env }) => {
  let n = 0;
  const fresh = (options) => preparedRepo(join(dir, `p${n++}`), env, options);
  const attentionOnly = (p, name, pattern) => {
    const j = statusJson(p, env);
    assert.equal(j.code, 1, `${name}\n${JSON.stringify(j.json.details.checks, null, 2)}`);
    assert.equal(j.json.result, "attention");
    assert.deepEqual(j.json.details.checks.filter((c) => c.status === "attention").map((c) => c.name), [name]);
    assert.match(j.json.details.checks.find((c) => c.name === name).summary, pattern);
    return j;
  };

  const version = fresh({ config: { prepare: { version: 2, requires: { workflow: "99.0.0" } } } });
  attentionOnly(version, "versions", /requires workflow 99\.0\.0 or later: NOT MET/);

  // A commit after the handoff makes the handoff stale on main, which is not what these cases test, so each case that
  // commits also rewrites the handoff in that same commit (a handoff committed with the work is not older than it).
  const missing = fresh();
  git(missing, ["rm", "-q", "docs/ROADMAP.md"], env);
  writeHandoff(missing, new Date().toISOString());
  const later = new Date(Date.now() + 5000).toISOString();
  commit(missing, { ...env, GIT_AUTHOR_DATE: later, GIT_COMMITTER_DATE: later }, "remove a record, committed 5 seconds after the handoff was written");
  attentionOnly(missing, "records", /^1 of 9 missing: docs\/ROADMAP\.md \(roadmap\)$/);

  const unprepared = initRepo(join(dir, "unprepared"), env);
  const u = statusJson(unprepared, env);
  assert.equal(u.code, 1);
  assert.equal(checkStatus(u.json, "layout"), "attention");

  const stale = fresh({ written: "2020-01-01 09:00 EDT" });
  writeFileSync(join(stale, "feature.js"), "code\n");
  commit(stale, env, "code after the handoff");
  const s = attentionOnly(stale, "handoff", /^docs\/HANDOFF\.md was written 2020-01-01 09:00 EDT, which is older than the latest commit \(.+, 1 commit\(s\) after the handoff was last committed\)$/);
  assert.equal(s.json.details.handoff.writtenAt, "2020-01-01T13:00:00.000Z");
  git(stale, ["checkout", "-q", "-b", "feature/elsewhere"], env);
  const off = statusJson(stale, env);
  assert.equal(off.code, 0, "off an integration branch the shared handoff is not written, so staleness is a note");
  assert.equal(checkStatus(off.json, "handoff"), "note");

  const committedTogether = fresh({ written: "2020-01-01T00:00:00Z" });
  assert.equal(statusJson(committedTogether, env).code, 0, "a handoff committed in the latest commit is not older than that commit");
  writeFileSync(join(committedTogether, "README.md"), "# edited after the handoff\n");
  attentionOnly(committedTogether, "handoff", /older than 1 uncommitted change\(s\) modified after it \(for example README\.md\)/);
  utimesSync(join(committedTogether, "README.md"), new Date("2019-01-01T00:00:00Z"), new Date("2019-01-01T00:00:00Z"));
  assert.equal(statusJson(committedTogether, env).code, 0, "control: the same uncommitted change dated before the handoff is not newer");

  const noWritten = fresh();
  writeFileSync(join(noWritten, "docs", "HANDOFF.md"), "# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\n- **State:** no date.\n");
  commit(noWritten, env, "handoff without a date");
  attentionOnly(noWritten, "handoff", /has no "Written:" line under "## RESUME HERE", so its freshness cannot be judged/);
  writeHandoff(noWritten, "2026-09-16 14:41 CEST");
  commit(noWritten, env, "handoff with an unknown zone");
  attentionOnly(noWritten, "handoff", /the time zone "CEST" is not one Skillgate reads/);

  const interrupted = fresh();
  assert.equal(hook(interrupted, "session-start", { session_id: "a" }, env).code, 0);
  assert.equal(hook(interrupted, "session-start", { session_id: "b" }, env).code, 0);
  assert.equal(statusJson(interrupted, env).code, 0, "an interrupted session with a clean tree needs no action");
  writeFileSync(join(interrupted, "left-behind.txt"), "unsaved\n");
  utimesSync(join(interrupted, "left-behind.txt"), new Date("2019-01-01T00:00:00Z"), new Date("2019-01-01T00:00:00Z"));
  attentionOnly(interrupted, "sessions", /session a \(started [^)]+\) before it was interrupted/);

  const unreadable = fresh();
  const { file } = startTask(unreadable, env, "Will break");
  writeFileSync(file, readFileSync(file, "utf8").replace(/- \*\*Branch:\*\* .+\n/, ""));
  writeHandoff(unreadable, new Date().toISOString());
  commit(unreadable, env, "broken task");
  attentionOnly(unreadable, "tasks", /unreadable task record: docs\/tasks\/.+: the Branch field/);
}));

test("status refuses an unusable configuration or a folder outside Git with exit 2, in --json too", async () => withTemp("status-invalid", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env, { config: { handoff: { maxBytes: "big" } } });
  const plain = cli(p, ["status"], env);
  assert.equal(plain.code, 2, plain.all);
  assert.match(plain.err, /handoff\.maxBytes must be a whole number/);
  const j = statusJson(p, env);
  assert.equal(j.code, 2);
  assert.equal(j.json.result, "invalid");
  assert.match(j.json.summary, /^refused: /);

  const outside = join(dir, "outside");
  mkdirSync(outside);
  const o = statusJson(outside, env);
  assert.equal(o.code, 2);
  assert.equal(o.json.result, "invalid");
  const bad = statusJson(p, env, ["--frobnicate"]);
  assert.equal(bad.code, 2);
}));

test("status and session-start use migrationState and securitySummary when the build has them", async () => withTemp("cross-lane", async ({ dir, env }) => {
  const copy = copyPlugin(dir, (root) => {
    writeFileSync(join(root, "runtime", "lib", "migrations.mjs"), [
      "export function migrationState(project) {",
      "  if (process.env.FAKE_MIGRATIONS === 'throw') throw new Error('fake migration failure');",
      "  const pending = process.env.FAKE_MIGRATIONS === 'pending' ? [{ id: '0003-example', from: 2, to: 3, summary: 'an example migration' }] : [];",
      "  return { layoutVersion: project.layoutVersion, target: 2, pending, applied: [] };",
      "}",
      "",
    ].join("\n"));
    writeFileSync(join(root, "runtime", "lib", "security.mjs"), [
      "export async function securitySummary() {",
      "  const mode = process.env.FAKE_SECURITY;",
      "  if (mode === 'unavailable') return { available: false, reason: 'no security register in this project' };",
      "  const base = { available: true, catalogVersion: 'fake-1', total: 7, applicable: 5, current: 5, missing: 0, stale: 0, expired: 0, invalid: 0, gaps: 0, needsHuman: 0, undecided: 0 };",
      "  if (mode === 'attention') return { ...base, current: 3, missing: 1, stale: 1 };",
      "  if (mode === 'bad') return { ...base, total: 'seven' };",
      "  return base;",
      "}",
      "",
    ].join("\n"));
  });
  const p = preparedRepo(join(dir, "p"), env);
  const run = (extraEnv) => statusJson(p, { ...env, ...extraEnv }, [], { entry: copy.entry });

  const clean = run({});
  assert.equal(clean.code, 0, JSON.stringify(clean.json, null, 2));
  assert.equal(checkStatus(clean.json, "migrations"), "ok");
  assert.equal(checkStatus(clean.json, "security"), "ok");
  assert.equal(clean.json.details.security.catalogVersion, "fake-1");

  const pending = run({ FAKE_MIGRATIONS: "pending" });
  assert.equal(pending.code, 1);
  assert.match(pending.json.details.checks.find((c) => c.name === "migrations").summary, /^1 pending: 0003-example \(an example migration\)/);
  const security = run({ FAKE_SECURITY: "attention" });
  assert.equal(security.code, 1);
  assert.match(security.json.details.checks.find((c) => c.name === "security").summary, /7 control\(s\) in catalog fake-1, 5 applicable: 3 current, 1 missing, 1 stale/);
  const unavailable = run({ FAKE_SECURITY: "unavailable" });
  assert.equal(unavailable.code, 0);
  assert.equal(checkStatus(unavailable.json, "security"), "not-run");
  const thrown = run({ FAKE_MIGRATIONS: "throw" });
  assert.equal(thrown.code, 3);
  assert.equal(thrown.json.result, "operation-failed");
  assert.match(thrown.json.details.checks.find((c) => c.name === "migrations").summary, /could not be evaluated: fake migration failure/);
  assert.equal(run({ FAKE_SECURITY: "bad" }).code, 3);

  const started = hook(p, "session-start", { session_id: "s1" }, { ...env, FAKE_MIGRATIONS: "pending", FAKE_SECURITY: "attention" }, { bin: copy.bin });
  assert.equal(started.code, 0, started.all);
  assert.match(started.out, /^- Pending migrations \(needs attention\): 1 pending: 0003-example/m);
  assert.match(started.out, /^- Security \(needs attention\): 7 control\(s\) in catalog fake-1/m);

  writeFileSync(join(copy.root, "runtime", "lib", "security.mjs"), "export const somethingElse = 1;\n");
  const noExport = run({});
  assert.equal(noExport.code, 0);
  assert.match(noExport.json.details.checks.find((c) => c.name === "security").summary, /not available in this build \(runtime\/lib\/security\.mjs has no securitySummary export\)/);
  writeFileSync(join(copy.root, "runtime", "lib", "security.mjs"), "export function securitySummary( {\n");
  const broken = run({});
  assert.equal(broken.code, 3, "a module that is present but does not load is a failure, not an absence");
}));

// ---------------------------------------------------------------- packaging

test("hooks.json parses, keeps the handoff hook first, and every command it names exists, is executable and runs", async () => withTemp("hooks-json", async ({ dir, env }) => {
  const config = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
  const commands = (event) => config.hooks[event].flatMap((group) => group.hooks);
  const sessionStart = commands("SessionStart");
  assert.equal(sessionStart[0].command, '"${CLAUDE_PLUGIN_ROOT}"/hooks/session-start-handoff.sh');
  assert.deepEqual(sessionStart[1], { type: "command", command: '"${CLAUDE_PLUGIN_ROOT}"/bin/skillgate hook session-start', timeout: 15 });
  for (const [event, arg] of [["Stop", "stop"], ["PreCompact", "pre-compact"], ["SessionEnd", "session-end"]]) {
    assert.deepEqual(commands(event), [{ type: "command", command: `"\${CLAUDE_PLUGIN_ROOT}"/bin/skillgate hook ${arg}`, timeout: 15 }]);
  }
  assert.deepEqual(Object.keys(config.hooks).sort(), ["PreCompact", "SessionEnd", "SessionStart", "Stop"]);

  const p = initRepo(join(dir, "p"), env);
  for (const [event, handlers] of Object.entries(config.hooks)) {
    for (const h of handlers.flatMap((group) => group.hooks)) {
      const m = /^"\$\{CLAUDE_PLUGIN_ROOT\}"\/(\S+)(.*)$/.exec(h.command);
      assert.ok(m, `${event}: ${h.command} runs a file inside the plugin`);
      const target = join(PLUGIN, m[1]);
      assert.ok(existsSync(target), `${event}: ${m[1]} exists`);
      assert.ok(statSync(target).mode & 0o111, `${event}: ${m[1]} is executable`);
      const tracked = git(REPO, ["ls-files", "-s", `packs/base/plugins/workflow/${m[1]}`], env);
      assert.match(tracked, /^100755 /, `${event}: ${m[1]} is executable in Git, not only on this disk`);
      const arg = m[2].trim();
      if (arg) {
        assert.equal(arg, `hook ${event.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`, `${event} runs the matching hook`);
        assert.ok(existsSync(join(PLUGIN, "runtime", "commands", "hook.mjs")));
      }
      const r = spawnSync("sh", ["-c", h.command], { cwd: p, env: { ...env, CLAUDE_PLUGIN_ROOT: PLUGIN }, input: JSON.stringify({ session_id: "sh-1", cwd: p, hook_event_name: event }), encoding: "utf8" });
      assert.equal(r.status, 0, `${event}: ${h.command}\n${r.stdout}${r.stderr}`);
      if (arg === "hook session-start") assert.match(r.stdout, /^\[workflow\] Project state \(skillgate hook session-start\):$/m);
    }
  }
  assert.deepEqual(readEvents(p, env).map((e) => e.event).sort(), ["pre-compact", "session-end", "session-start"]);
}));

// ---------------------------------------------------------------- mutation checks

test("mutation check: without the once-per-fingerprint rule, the blocks-exactly-once assertion fails", async () => withTemp("mutant-once", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "lifecycle.mjs"),
    'events.some((e) => e.event === "stop-reminded" && e.fingerprint === state.fingerprint)', "false"));
  const p = stopFixture(join(dir, "shipped"), env);
  const q = stopFixture(join(dir, "mutated"), env);
  const shipped = stopTwice(p, env, BIN);
  const broken = stopTwice(q, env, mutant.bin);
  assert.equal(JSON.parse(shipped.first.out).decision, "block");
  assert.equal(shipped.second.out, "", "the shipped hook allows the second stop");
  assert.equal(JSON.parse(broken.first.out).decision, "block");
  assert.notEqual(broken.second.out, "", "the mutant blocks again, so the assertion above can fail");
}));

test("mutation check: without the byte bound, the session-start size assertion fails", async () => withTemp("mutant-bound", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "lifecycle.mjs"),
    "if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false };", "return { text, truncated: false };"));
  const p = initRepo(join(dir, "p"), env);
  writeConfig(p, { handoff: { maxBytes: 300 } });
  assert.ok(Buffer.byteLength(hook(p, "session-start", { session_id: "s1" }, env).out) <= 300);
  assert.ok(Buffer.byteLength(hook(p, "session-start", { session_id: "s2" }, env, { bin: mutant.bin }).out) > 300, "the mutant exceeds the bound");
}));

test("this test file holds no forbidden dash characters or home paths", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(text.includes(String.fromCharCode(0x2014)) || text.includes(String.fromCharCode(0x2013)), false);
  assert.equal(new RegExp(["/Us", "ers/[A-Za-z0-9._-]+/|/ho", "me/[A-Za-z0-9._-]+/"].join("")).test(text), false);
});
