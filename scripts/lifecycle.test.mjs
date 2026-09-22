#!/usr/bin/env node
// lifecycle.test.mjs: tests for task records, checkpoints, the journal, `skilliton status` and the lifecycle hooks
// (packs/base/plugins/workflow/runtime: lib/tasks.mjs, lib/journal.mjs, lib/lifecycle.mjs, commands/task.mjs,
// commands/checkpoint.mjs, commands/status.mjs, commands/hook.mjs, and hooks/hooks.json).
//
// Commands run the way a person runs them: `node scripts/skilliton.mjs <command>` in the project folder. Hooks run the
// way Claude Code runs them: the shipped bin/skilliton executed by path with the hook JSON on stdin, and the exact
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
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");
// Whether the cross-lane modules status reads are in this build (they are optional to the lifecycle engine).
const HAS_MIGRATIONS = existsSync(join(PLUGIN, "runtime", "lib", "migrations.mjs"));
const HAS_SECURITY = existsSync(join(PLUGIN, "runtime", "lib", "security.mjs"));
const BIN = join(PLUGIN, "bin", "skilliton");
const HOOKS_JSON = join(PLUGIN, "hooks", "hooks.json");
const INSTALLED = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const RECORD_FILES = ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md", "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md"];

// ---------------------------------------------------------------- harness

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-lifecycle-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  try {
    await body({ dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
// A commit of named paths only, so a file left untracked on purpose stays untracked.
const commitPath = (cwd, env, message, rel) => { git(cwd, ["add", "--", rel], env); git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", message], env); };
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
  mkdirSync(join(dir, ".skilliton"), { recursive: true });
  writeFileSync(join(dir, ".skilliton", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

// A prepared project with every record, a current handoff, and everything committed.
function preparedRepo(dir, env, { config = {}, written = new Date().toISOString(), commitHandoff = true } = {}) {
  initRepo(dir, env);
  writeConfig(dir, { prepare: { version: 3, requires: { workflow: INSTALLED } }, ...config });
  for (const rel of RECORD_FILES) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), `# ${rel}\n\nKind: Living.\n`);
  }
  // commitHandoff: false leaves the handoff on disk and untracked, which is a real state (preparation wrote the
  // files, and only the rest of them was committed).
  if (commitHandoff) { writeHandoff(dir, written); commit(dir, env, "prepare"); return dir; }
  rmSync(join(dir, "docs", "HANDOFF.md"), { force: true }); // so the handoff is in no commit at all
  commit(dir, env, "prepare");
  writeHandoff(dir, written);
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
const journalFile = (dir, env) => join(gitDir(dir, env), "skilliton", "journal.jsonl");

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
  return { root: copy, bin: join(copy, "bin", "skilliton"), entry: join(copy, "runtime", "skilliton.mjs") };
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

  // M8's second increment: --request fills the Request section with the user's words; the criteria stay the assistant's.
  git(p, ["checkout", "-q", "-b", "feature/reset"], env);
  const withRequest = startTask(p, env, "Password reset", ["--request", "People keep asking how to reset their password", "--criteria", "A reset email arrives"]);
  const requested = readFileSync(withRequest.file, "utf8");
  assert.ok(requested.includes("## Request\n\nPeople keep asking how to reset their password\n\n## Acceptance criteria\n\n- [ ] A reset email arrives\n"), requested);
  assert.equal(requested.includes("not yet written\n\n## Acceptance"), false);
  git(p, ["checkout", "-q", "feature/sign-in"], env);

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
    `## Checkpoints\n\n### ${at}\n\n- **State:** Form renders\n- **Evidence:** npm test: 3 passed\n- **Next:** Add email validation\n- **Git:** feature/sign-in @ ${shortHead}, ${dirty} uncommitted\n\n`)
    .replace("- **State:** not yet written\n- **Next:** not yet written\n- **Blocked:** not yet written\n- **Watch out:** not yet written",
      "- **State:** Form renders. Evidence: npm test: 3 passed.\n- **Next:** Add email validation\n- **Blocked:** nothing\n- **Watch out:** nothing known");
  assert.equal(one, expectedOne, "the checkpoint also rewrites the Handoff section");
  assert.match(cp.out, /^handoff: Blocked not given and nothing to carry over; written as "nothing"$/m);
  assert.match(cp.out, /^handoff: Watch out not given and nothing to carry over; written as "nothing known"$/m);
  assert.match(cp.out, /^indexes: skipped; indexes are written on an integration branch \(main, master\), and this branch is feature\/sign-in$/m);

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
    `uncommitted\n\n### ${at2}\n\n- **State:** Validation added\n- **Evidence:** none given\n- **Next:** Open a pull request\n- **Git:** feature/sign-in @ ${shortHead}, ${porcelainCount(p, env)} uncommitted\n\n## Handoff`)
    .replace("- **State:** Form renders. Evidence: npm test: 3 passed.\n- **Next:** Add email validation", "- **State:** Validation added\n- **Next:** Open a pull request");
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
  const backups = join(gitDir(p, env), "skilliton-backups");
  assert.ok(existsSync(backups), "writes that replace a task file back it up under the git dir");
  assert.equal(git(p, ["status", "--porcelain", "--ignored"], env).includes("skilliton-backups"), false);
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
    `A note above the checkpoints.\n\n### ${at}\n\n- **State:** Edited by hand\n- **Evidence:** none given\n- **Next:** Keep going\n- **Git:** main @ ${git(p, ["rev-parse", "--short", "HEAD"], env).trim()}, 1 uncommitted\n\n`)
    .replace("- **State:** not yet written\n- **Next:** not yet written\n- **Blocked:** not yet written\n- **Watch out:** not yet written", "- **State:** Edited by hand\n- **Next:** Keep going\n- **Blocked:** nothing\n- **Watch out:** nothing known");
  assert.equal(text, expected);
  assert.ok(cli(p, ["task", "show", id], env).out.includes("Checkpoints: 1"));

  const crlf = readFileSync(file, "utf8").replace(/\n/g, "\r\n");
  writeFileSync(file, crlf);
  const cpCrlf = cli(p, ["checkpoint", "--state", "Windows line endings", "--next", "Check them", "--apply"], env);
  assert.equal(cpCrlf.code, 0, cpCrlf.all);
  const crlfAfter = readFileSync(file, "utf8");
  assert.equal(/[^\r]\n/.test(crlfAfter), false, "every line of a CRLF file still ends in CRLF");
  assert.ok(crlfAfter.includes("\r\n- **State:** Windows line endings\r\n"), crlfAfter);
  assert.equal(crlfAfter.replace(/### \d{4}-\d\d-\d\dT[^\r]+\r\n\r\n- \*\*State:\*\* Windows line endings\r\n- \*\*Evidence:\*\* none given\r\n- \*\*Next:\*\* Check them\r\n- \*\*Git:\*\* [^\r]+\r\n\r\n/, "").replace(/Updated:\*\* [^\r]+/, "U")
    .replace("- **State:** Windows line endings\r\n- **Next:** Check them\r\n", "- **State:** Edited by hand\r\n- **Next:** Keep going\r\n"), crlf.replace(/Updated:\*\* [^\r]+/, "U"), "the Handoff section is rewritten with CRLF kept");
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
  assert.equal(existsSync(join(gitDir(p, env), "skilliton-backups")), false, "refused writes make no backup");

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
  assert.match(cli(p, ["task", "list"], env).out, /the file is a symbolic link, which Skilliton does not follow/);

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
  const ids = await import(pathToFileURL(join(PLUGIN, "runtime", "lib", "ids.mjs")).href);

  const p = initRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Shape check");
  assert.ok(ids.isId(id) && /-shape-check-[0-9a-f]{4}$/.test(id), `task IDs follow the shared rule: ${id}`);
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

  const symbols = startTask(p, env, "!!!", ["--branch", "symbols"]);
  assert.match(symbols.id, /^\d{4}-\d{2}-\d{2}-task-[0-9a-f]{4}$/, "a title with no letter or digit gives the slug task");
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
    [["task", "list", "--request", "words"], /--request is not used by task list/],
    [["task", "start", "Bad request", "--request", "line one\nline two", "--apply"], /--request must be one line/],
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
  assert.equal(existsSync(join(gitDir(p, env), "skilliton")), false);

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

  // A repository git declines to open is not a folder that is not a repository, and saying so would send a person
  // looking for the wrong thing. git exits 128 for both, so what it says decides which one a caller is told about.
  const unopenable = join(dir, "unopenable");
  initRepo(unopenable, env);
  writeFileSync(join(unopenable, ".git", "config"), "this line is not a configuration\n");
  const control = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: unopenable, env, encoding: "utf8" });
  assert.equal(control.status, 128, `premise: git refuses this repository (${control.stderr?.trim().slice(0, 120)})`);
  const refused = cli(unopenable, ["status"], env);
  assert.equal(refused.code, 3, refused.all);
  assert.doesNotMatch(refused.all, /is not inside a Git repository/, "a repository git declined to open was reported as a folder that is not a repository");
  assert.match(refused.all, /bad config|config line/i, `git's own words are not in the message:\n${refused.all}`);

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
  assert.equal(lines[0], "[workflow] Project state (skilliton hook session-start):");
  const expectLine = (pattern) => assert.ok(lines.some((line) => pattern.test(line)), `${pattern}\n${full.out}`);
  expectLine(/^- Branch: main @ [0-9a-f]{7,}, 1 uncommitted$/);
  expectLine(/^- Layout \(needs attention\): not prepared by Skilliton \(no prepare\.version/);
  // M8's first increment: the offer is made in plain words in the hook output, because a never-prepared repository has
  // no managed block to instruct the assistant, and a yes has its commands spelled out.
  expectLine(/^- Not prepared \(needs attention\): offer it in plain words before other work: "This project is not set up for Skilliton yet\. .*Nothing is written until you say yes\." On a yes, in this order: skilliton prepare shows the change; skilliton prepare --apply shows it again and writes it, drafting dispatch\.laneTestCommand, laneRoot and hotspots and a delivery policy draft from what the repository shows; then turn the user's first request into the first task with two to six proposed criteria: skilliton task start "<title>" --request "<the user's words>" --criteria "<criterion>" --apply$/);
  expectLine(HAS_MIGRATIONS ? /^- Pending migrations: none pending \(layout unknown, target 3\)$/ : /^- Pending migrations \(not run\): not available in this build \(runtime\/lib\/migrations\.mjs is not present\)$/);
  expectLine(new RegExp(`^- Versions: workflow runtime ${escape(INSTALLED)} installed; the project names no minimum version`));
  expectLine(/^- Records \(needs attention\): 9 of 9 missing: docs\/STATUS\.md \(status\), .*\(maintain\); none of them is in Git; skilliton prepare --apply creates them and leaves every record that exists as it is$/);
  expectLine(/^- Current task: none \(no open task on branch main\); to start one: skilliton task start "<title>" --apply$/);
  expectLine(/^- Shared handoff: docs\/HANDOFF\.md is missing \(see records\)$/);
  expectLine(/^- Previous session: none recorded in this worktree's journal$/);
  expectLine(HAS_SECURITY ? /^- Security \(not run\): security evidence not available: no security catalog at \.skilliton\/security\/catalog\.json/ : /^- Security \(not run\): not available in this build \(runtime\/lib\/security\.mjs is not present\)$/);
  assert.equal(full.out.includes("truncated"), false);
  const recorded = readEvents(wide, env);
  assert.equal(recorded.length, 1);
  assert.deepEqual([recorded[0].event, recorded[0].session, recorded[0].source, recorded[0].fingerprint], ["session-start", "s1", "startup", fingerprint(wide, env)]);

  const cut = hook(narrow, "session-start", { session_id: "s1", source: "startup" }, env);
  assert.equal(cut.code, 0, cut.all);
  assert.ok(Buffer.byteLength(cut.out) <= 300, `${Buffer.byteLength(cut.out)} bytes:\n${cut.out}`);
  const cutLines = cut.out.trimEnd().split("\n");
  assert.equal(cutLines[cutLines.length - 1], "[workflow] Project state truncated at 300 bytes; for all of it run: skilliton status");
  const comparable = (line) => (line.startsWith("- Branch: ") ? "- Branch:" : line);
  for (const line of cutLines.slice(0, -1)) assert.ok(lines.map(comparable).includes(comparable(line)), `a truncated block keeps whole lines only: ${line}`);
  assert.equal(readEvents(narrow, env).length, 1, "a truncated block still records the session start");

  writeConfig(narrow, { handoff: { maxBytes: 200 } });
  const smallest = hook(narrow, "session-start", { session_id: "s2" }, env);
  assert.ok(smallest.code === 0 && Buffer.byteLength(smallest.out) <= 200, smallest.out);

  writeConfig(narrow, { handoff: { maxBytes: 5 } });
  const broken = hook(narrow, "session-start", { session_id: "s3" }, env);
  assert.equal(broken.code, 0, broken.all);
  assert.match(broken.out, /^- Configuration \(needs attention\): \.skilliton\/config\.json: handoff\.maxBytes must be a whole number from 200 to 100000$/m);
  assert.match(broken.out, /^- Records \(not run\): not evaluated, because \.skilliton\/config\.json cannot be used \(see the configuration problem\)$/m);
  assert.match(broken.out, /^- Previous session \(needs attention\): interrupted: session s2 \(started [^)]+\) has no session-end; 1 uncommitted change\(s\)/m);
  assert.ok(Buffer.byteLength(broken.out) <= 6000);

  const garbage = hook(wide, "session-start", {}, env, { raw: "this is not json" });
  assert.equal(garbage.code, 0, garbage.all);
  assert.match(garbage.out, /^- Hook input \(not usable\): the hook input on stdin was not JSON, so the current folder was used$/m);
}));

test("a record or the configuration removed by hand is named at session start with the command that restores it, and never restored", async () => withTemp("removed", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const start = (id) => hook(p, "session-start", { session_id: id, source: "startup" }, env);

  // Two tracked records deleted from the working tree: named as removed by hand, with git checkout.
  rmSync(join(p, "docs", "STATUS.md"));
  rmSync(join(p, "docs", "HANDOFF.md"));
  const two = start("r1");
  assert.equal(two.code, 0, two.all);
  assert.match(two.out, /^- Records \(needs attention\): 2 of 9 missing: docs\/STATUS\.md \(status\), docs\/HANDOFF\.md \(handoff\); both are tracked in Git and missing from the working tree, so they were removed here by hand; restore them with: git checkout -- docs\/STATUS\.md docs\/HANDOFF\.md$/m);
  assert.equal(existsSync(join(p, "docs", "STATUS.md")), false, "the hook restores nothing itself");
  git(p, ["checkout", "--", "docs/STATUS.md", "docs/HANDOFF.md"], env);

  // A record that was never committed: not in Git, so prepare --apply is the command.
  rmSync(join(p, "docs", "LESSONS.md"));
  git(p, ["rm", "-q", "--cached", "docs/LESSONS.md"], env);
  commit(p, env, "Stop tracking the lessons record");
  const never = start("r2");
  assert.match(never.out, /^- Records \(needs attention\): 1 of 9 missing: docs\/LESSONS\.md \(lessons\); docs\/LESSONS\.md is not in Git; skilliton prepare --apply creates it and leaves every record that exists as it is$/m);
  const status = statusJson(p, env);
  assert.equal(checkStatus(status.json, "records"), "attention");
  assert.deepEqual(status.json.details.records.never, ["docs/LESSONS.md"]);

  // The whole folder gone while tracked: the layout line names the removal and both routes, and the offer to prepare a
  // never-prepared project is not made.
  rmSync(join(p, ".skilliton"), { recursive: true });
  const gone = start("r3");
  assert.equal(gone.code, 0, gone.all);
  assert.match(gone.out, /^- Layout \(needs attention\): not prepared now, but \.skilliton\/config\.json is tracked in Git and missing from the working tree, so Skilliton's files were removed here by hand \(1 tracked file\(s\) missing\); restore them with: git checkout -- \.skilliton\/config\.json; to take Skilliton out on purpose instead: skilliton remove --apply$/m);
  assert.doesNotMatch(gone.out, /Not prepared \(needs attention\)/);
  assert.equal(existsSync(join(p, ".skilliton")), false, "the hook restores nothing itself");
}));

test("on a joined machine, session start prepares a repository that is not prepared, once, and says so; the offer setting, both opt-out files and SKILLITON_AUTO_PREPARE=off leave it alone and say why; the stop reminder is silent in an unprepared repository", async () => withTemp("auto-prepare", async ({ dir, env }) => {
  const joined = join(dir, "joined");
  mkdirSync(joined);
  const receipt = (extra = {}) => writeFileSync(join(joined, "acme.json"), JSON.stringify({ schema: "skilliton.join/1", company: "acme", source: dir, ...extra }));
  const jenv = { ...env, SKILLITON_JOIN_DIR: joined };
  const start = (p, id, e = jenv) => hook(p, "session-start", { session_id: id, source: "startup" }, e);

  // Not joined: the offer, and nothing written.
  const p = initRepo(join(dir, "p"), env);
  const offer = start(p, "a0", env);
  assert.match(offer.out, /^- Not prepared \(needs attention\): offer it/m);
  assert.equal(existsSync(join(p, ".skilliton")), false);

  // Joined: prepared at session start, the block describes the prepared project, the files are left uncommitted.
  receipt();
  const first = start(p, "a1");
  assert.equal(first.code, 0, first.all);
  assert.match(first.out, /^- Prepared just now \(this machine joined acme\): \d+ file\(s\) written, uncommitted: the records, \.skilliton\/config\.json, the managed block in CLAUDE\.md and AGENTS\.md, the security register\. Commit them with your next commit; an empty \.skilliton-off at the root keeps a repository out\.$/m);
  assert.doesNotMatch(first.out, /Not prepared \(needs attention\)/);
  assert.match(first.out, /^- Layout: layout 3 \(current for this runtime\)$/m);
  assert.match(first.out, /^- Records: all 9 present$/m);
  assert.match(first.out, /^- Branch: main @ [0-9a-f]{7,}, [1-9]\d* uncommitted$/m);
  assert.ok(existsSync(join(p, ".skilliton", "config.json")) && existsSync(join(p, "docs", "HANDOFF.md")), "the prepared files exist");
  assert.match(readFileSync(join(p, "CLAUDE.md"), "utf8"), /<!-- skilliton:harness:start/);
  const second = start(p, "a2");
  assert.equal(second.code, 0, second.all);
  assert.doesNotMatch(second.out, /Prepared just now/, "a prepared project is not prepared again");

  // The opt-out at the root: left alone, said so, and no offer either.
  const q = initRepo(join(dir, "q"), env);
  writeFileSync(join(q, ".skilliton-off"), "");
  const opted = start(q, "b1");
  assert.match(opted.out, /^- Not prepared on purpose: \.skilliton-off is present at the repository root, so this repository is left as it is \(delete that file to have it prepared at the next session start\)$/m);
  assert.doesNotMatch(opted.out, /Not prepared \(needs attention\)/);
  assert.equal(existsSync(join(q, ".skilliton")), false);
  rmSync(join(q, ".skilliton-off"));

  // The opt-out inside the Git folder, for a repository that must carry nothing of ours.
  writeFileSync(join(gitDir(q, env), "skilliton-off"), "");
  const inGit = start(q, "b2");
  assert.match(inGit.out, /^- Not prepared on purpose: skilliton-off is present inside the Git folder/m);
  assert.equal(existsSync(join(q, ".skilliton")), false);
  // The stop reminder says nothing in an unprepared repository, even when a reminder would otherwise be due.
  writeFileSync(join(q, "notes.md"), "changed\n");
  backdate(q, env, (e) => e.event === "session-start" && e.session === "b2", 30);
  const stop = hook(q, "stop", { session_id: "b2" }, jenv);
  assert.equal(stop.code, 0, stop.all);
  assert.equal(stop.out, "", "no block and no text in an unprepared repository");
  rmSync(join(gitDir(q, env), "skilliton-off"));

  // Off for the session: said so, the offer stands.
  const off = start(q, "b3", { ...jenv, SKILLITON_AUTO_PREPARE: "off" });
  assert.match(off.out, /^- Auto-prepare: off for this session \(SKILLITON_AUTO_PREPARE\), so the offer below stands$/m);
  assert.match(off.out, /Not prepared \(needs attention\)/);
  assert.equal(existsSync(join(q, ".skilliton")), false);

  // The join file said offer: said so, the offer stands.
  receipt({ prepare: "offer" });
  const offered = start(q, "b4");
  assert.match(offered.out, /^- Not prepared, and auto-prepare is off for acme \(its join file said "offer"\), so the offer below stands$/m);
  assert.match(offered.out, /Not prepared \(needs attention\)/);
  assert.equal(existsSync(join(q, ".skilliton")), false);

  // A prepared project whose managed block is behind the template: the instruction migration is applied at session
  // start under the same conditions, said in the block, and left uncommitted; with the offer setting it is only named.
  const stale = readFileSync(join(p, "CLAUDE.md"), "utf8").replace(/(<!-- skilliton:harness:start v1 -->\n)[\s\S]*?(<!-- skilliton:harness:end -->)/, "$1stale text\n$2");
  writeFileSync(join(p, "CLAUDE.md"), stale);
  const onlyNamed = start(p, "a3");
  assert.match(onlyNamed.out, /^- Pending migrations \(needs attention\): 1 pending: 0100-instructions-/m);
  assert.doesNotMatch(onlyNamed.out, /Migrated just now/);
  receipt();
  const migrated = start(p, "a4");
  assert.equal(migrated.code, 0, migrated.all);
  assert.match(migrated.out, /^- Migrated just now \(this machine joined acme\): 0100-instructions-[0-9a-f]{12} applied; the managed block in CLAUDE\.md and AGENTS\.md follows the current template, the receipt is under \.skilliton\/migrations\/ and the earlier text is in the backup, all uncommitted\. Commit them with your next commit\.$/m);
  assert.match(migrated.out, /^- Pending migrations: none pending/m);
  assert.doesNotMatch(readFileSync(join(p, "CLAUDE.md"), "utf8"), /stale text/);
  assert.ok(readdirSync(join(p, ".skilliton", "migrations")).some((f) => f.startsWith("0100-instructions-")), "the receipt was written");
}));

test("skilliton maintain does the mechanical half and records it; the stop hook holds the session when a merge landed or a day of commits passed since, once per commit, alone or before the checkpoint reminder, and never on a lane branch or in an unprepared repository", async () => withTemp("maintain", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const stop = (id) => hook(p, "stop", { session_id: id }, env);
  const start = (id) => hook(p, "session-start", { session_id: id, source: "startup" }, env);
  const events = (name) => readEvents(p, env).filter((e) => e.event === name);

  // The command: preview writes nothing; --apply records the event; an entry file reaches its index through it.
  const preview = cli(p, ["maintain"], env);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /would write +journal +a maintain event/);
  assert.equal(events("maintain").length, 0);
  const entry = cli(p, ["record", "decision", "Keep the ledger", "--apply"], env);
  assert.equal(entry.code, 0, entry.all);
  const applied = cli(p, ["maintain", "--apply"], env);
  assert.equal(applied.code, 0, applied.all);
  assert.match(applied.out, /wrote +indexes +decisions index in DECISIONS\.md/);
  assert.match(applied.out, /not run +security findings +no security register/);
  assert.match(applied.out, /wrote +journal +maintain event recorded/);
  assert.match(applied.out, /Summary: the mechanical half is done and recorded\./);
  assert.match(readFileSync(join(p, "DECISIONS.md"), "utf8"), /Keep the ledger/);
  assert.equal(events("maintain").length, 1);
  const again = cli(p, ["maintain", "--apply"], env);
  assert.match(again.out, /current +indexes/);

  // Not due: nothing merged and no day passed since the maintain event.
  commit(p, env, "the entry and the index");
  start("s1");
  const quiet = stop("s1");
  assert.equal(quiet.code, 0, quiet.all);
  assert.equal(quiet.out, "", "not due");

  // A merge lands in the session: both reminders are due, maintenance first, once for that commit.
  git(p, ["checkout", "-q", "-b", "feature"], env);
  writeFileSync(join(p, "feature.md"), "x\n");
  commit(p, env, "feature work");
  git(p, ["checkout", "-q", "main"], env);
  git(p, ["-c", "commit.gpgsign=false", "merge", "-q", "--no-ff", "-m", "merge feature", "feature"], env);
  backdate(p, env, (e) => e.event === "session-start" && e.session === "s1", 30);
  const held = stop("s1");
  assert.equal(held.code, 0, held.all);
  const both = JSON.parse(held.out);
  assert.equal(both.decision, "block");
  assert.match(both.reason, /^Skilliton maintenance is due: 1 merge commit\(s\) landed \([0-9a-f]{7,}\) since the last maintenance\. Before finishing, run: skilliton maintain --apply \(it regenerates the indexes, refreshes the security findings and records the maintenance; nothing a person has to read\)\. Then the part only you can do: /);
  assert.match(both.reason, /This is asked once for this commit; if maintenance should not run now, tell the user why and stop\. Skilliton checkpoint reminder: the working tree has changed since this session started/);
  assert.equal(events("maintain-reminded").length, 1);
  assert.equal(events("stop-reminded").length, 1);
  // A new session at the same commit: the checkpoint reminder is not due, and maintenance was asked for this commit.
  start("s2");
  const once = stop("s2");
  assert.equal(once.out, "", "asked once for this commit");
  const done = cli(p, ["maintain", "--apply"], env);
  assert.equal(done.code, 0, done.all);
  assert.equal(stop("s2").out, "", "not due once maintenance is recorded after the merge");

  // A day passes: due only when a commit landed in it, and on its own when the checkpoint reminder has nothing to say.
  backdate(p, env, (e) => e.event === "maintain", 25 * 60);
  assert.equal(stop("s2").out, "", "a day with no commit is not due");
  writeFileSync(join(p, "later.md"), "y\n");
  commit(p, env, "a commit the next day");
  start("s3");
  const aged = JSON.parse(stop("s3").out);
  assert.equal(aged.decision, "block");
  assert.match(aged.reason, /^Skilliton maintenance is due: 2[45] hours and 1 commit\(s\) have passed since the last maintenance\./);
  assert.doesNotMatch(aged.reason, /checkpoint reminder/, "maintenance is the whole reason");
  assert.equal(events("maintain-reminded").length, 2);
  assert.equal(stop("s3").out, "", "asked once for this commit");

  // A lane branch: neither the command nor the reminder.
  git(p, ["checkout", "-q", "-b", "lane/one"], env);
  writeFileSync(join(p, "lane.md"), "z\n");
  commit(p, env, "lane work");
  const lane = cli(p, ["maintain", "--apply"], env);
  assert.equal(lane.code, 2, lane.all);
  assert.match(lane.all, /written on an integration branch \(main, master\) only; this is branch lane\/one\. Nothing was written/);
  start("s4");
  assert.equal(stop("s4").out, "", "no maintenance reminder on a lane branch");

  // An unprepared repository: refused, nothing written.
  const q = initRepo(join(dir, "q"), env);
  const bare = cli(q, ["maintain", "--apply"], env);
  assert.equal(bare.code, 2, bare.all);
  assert.match(bare.all, /is not prepared by Skilliton .* so there are no records to maintain\. Nothing was written/);
}));

test("session-start shows the current task, its last checkpoint and its handoff", async () => withTemp("session-task", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Resume me");
  assert.equal(cli(p, ["checkpoint", "--state", "Half done", "--evidence", "unit tests pass", "--next", "Finish the form", "--apply"], env).code, 0);
  writeFileSync(file, readFileSync(file, "utf8").replace("- **State:** Half done. Evidence: unit tests pass.", "- **State:** paused mid-form").replace("- **Next:** Finish the form\n- **Blocked:**", "- **Next:** wire the submit button\n- **Blocked:**"));
  const r = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, new RegExp(`^- Current task: ${id} "Resume me" \\(in-progress, 1 checkpoint\\(s\\)\\); last checkpoint [^:]+:\\d\\d:[^:]+: State: Half done; Evidence: unit tests pass; Next: Finish the form$`, "m"));
  assert.match(r.out, /^- Task handoff: State: paused mid-form; Next: wire the submit button; Blocked: nothing; Watch out: nothing known$/m);
  assert.match(r.out, /^- Layout: layout 3 \(current for this runtime\)$/m);
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
  assert.match(decision.reason, /No open task record matches branch main; otherwise start one, then record a checkpoint, by running: skilliton task start "<short title of this work>" --criteria "<what done means>" --apply and then: skilliton checkpoint --state "/);
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
  assert.match(withTask, new RegExp(`Otherwise record where task ${id} stands \\(each value one line\\) by running: skilliton checkpoint --task ${id} --state "<what is done and what is not>" --evidence "<checks or tests you ran, with their results>" --next "<the next concrete step>" --apply$`));
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

// A repository where a lane branch was merged back after the session started, with the working tree left clean, so the
// merge commit is the only thing that changed. A merge moves HEAD, and HEAD is part of the fingerprint, which is why a
// Stop reminder can be due in a tree with nothing uncommitted in it.
function mergedFixture(dir, env) {
  const p = stopFixture(dir, env, { change: false });
  git(p, ["checkout", "-q", "-b", "lane"], env);
  writeFileSync(join(p, "lane.txt"), "lane work\n");
  commit(p, env, "lane: one item");
  git(p, ["checkout", "-q", "main"], env);
  git(p, ["-c", "commit.gpgsign=false", "merge", "-q", "--no-ff", "-m", "merge lane", "lane"], env);
  return { p, merged: git(p, ["rev-parse", "--short", "HEAD"], env).trim() };
}

const stopReasonOf = (p, env, bin = BIN) => {
  const r = hook(p, "stop", { session_id: "s1" }, env, { bin });
  assert.equal(r.code, 0, r.all);
  assert.notEqual(r.out, "", "the reminder is due, so there is a reason to read");
  return JSON.parse(r.out).reason;
};

test("stop names maintain when a merge landed in the window it measures", async () => withTemp("stop-merged", async ({ dir, env }) => {
  const { p, merged } = mergedFixture(dir, env);
  assert.equal(git(p, ["status", "--porcelain"], env), "", "the tree is clean, so the merge alone is what the reminder saw");
  const reason = stopReasonOf(p, env);
  assert.ok(reason.includes(`1 merge commit landed in that window (${merged}), so a batch of work has just come in: run /workflow:maintain on an integration branch as well, which reconciles the records and the indexes against what merged.`), reason);
  assert.ok(!reason.includes("is unknown"), "the window was readable, so the reminder reports what it found");
}));

test("stop does not name maintain for an ordinary commit in the window", async () => withTemp("stop-committed", async ({ dir, env }) => {
  const p = stopFixture(dir, env, { change: false });
  writeFileSync(join(p, "work.txt"), "committed\n");
  commit(p, env, "ordinary work");
  const reason = stopReasonOf(p, env);
  assert.ok(!reason.includes("/workflow:maintain"), `a commit that is not a merge is not a batch coming in:\n${reason}`);
  assert.ok(!reason.includes("is unknown"), "the window was readable");
}));

test("stop says so when it cannot tell whether a batch merged", async () => withTemp("stop-merge-unknown", async ({ dir, env }) => {
  // A session that started before this repository had any commit: the baseline event recorded no commit id, so there
  // is no range to count merges over. The reminder says that, rather than reading an empty list as "nothing merged".
  const p = join(dir, "p");
  mkdirSync(p, { recursive: true });
  git(p, ["init", "-q"], env);
  git(p, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
  writeConfig(p, { checkpoints: { minMinutes: 20 } });
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  backdate(p, env, (e) => e.event === "session-start", 30);
  writeFileSync(join(p, "README.md"), "# fixture\n");
  commit(p, env, "first");
  const reason = stopReasonOf(p, env);
  assert.match(reason, /Whether a batch merged in that window is unknown: the baseline event recorded no commit id, so there is nothing to measure from\./);
  assert.ok(!reason.includes("/workflow:maintain"), "an unreadable window is not a merge");
}));

// The planted shape is written in pieces, so this test file does not carry the shape it plants: the repository audits
// its own changed files, and a fixture that trips its own gate teaches everyone to ignore the finding.
const FLAW = `const options = { ${["shell", ": true"].join("")} };\n`;

test("stop names the audit when a file this tree changed carries a finding, and says nothing when none does", async () => withTemp("stop-audit", async ({ dir, env }) => {
  const p = stopFixture(dir, env, { change: false });
  writeFileSync(join(p, "runner.mjs"), FLAW);
  const found = stopReasonOf(p, env);
  assert.ok(found.includes("The audit found 1 finding(s) in 1 of the file(s) this tree changed (runner.mjs)"), found);
  assert.ok(found.includes("skilliton audit"), `the reminder names the command that shows each finding:\n${found}`);
  assert.ok(found.includes("This is a report and not a block"), found);
  assert.ok(!found.includes("the audit did not run"), "the audit ran, so nothing is unknown");

  // The same tree with the line marked: allowed is not found, and a reminder over a clean tree carries no audit
  // sentence at all. An announcement on every stop is how a sentence stops being read.
  writeFileSync(join(p, "runner.mjs"), `${FLAW.trimEnd()} // skilliton-audit: allow ${["shell-", "true"].join("")} a fixture line that is never run\n`);
  writeFileSync(join(p, "work.txt"), "changed\n"); // a second change, so the reminder is due for a new tree state
  const clean = stopReasonOf(p, env);
  assert.ok(!clean.includes("The audit found"), `a tree with nothing to report says nothing:\n${clean}`);
  assert.ok(!clean.includes("the audit did not run"), clean);
}));

test("mutation check: without the audit sentence, the assertion above fails", async () => withTemp("mutant-audit", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "session-hooks.mjs"),
    "  if (audit?.result?.findings.length) {", "  if (false) {"));
  const shipped = stopFixture(join(dir, "shipped"), env, { change: false });
  const broken = stopFixture(join(dir, "mutated"), env, { change: false });
  for (const p of [shipped, broken]) writeFileSync(join(p, "runner.mjs"), FLAW);
  assert.ok(stopReasonOf(shipped, env).includes("The audit found"));
  assert.ok(!stopReasonOf(broken, env, mutant.bin).includes("The audit found"), "the mutant drops the sentence, so the assertion above can fail");
}));

// ---------------------------------------------------------------- the dispatch suggestion (UserPromptSubmit)

const SESSION_HOOKS_LIB = async (root = PLUGIN) => import(pathToFileURL(join(root, "runtime", "lib", "session-hooks.mjs")).href);

// `prompt` is the field Claude Code 2.1.278 sends (measured 2026-09-22); `user_prompt` is still accepted.
const promptHook = (cwd, prompt, env, options = {}) => hook(cwd, "user-prompt-submit", { session_id: "s1", prompt }, env, options);

const SIX_NUMBERED = "1. Fix the login bug\n2. Add a retry\n3. Rename the module\n4. Update the docs\n5. Bump the version\n6. Run the tests";
const SIX_BULLETED = "- fix the login bug\n- add a retry\n- rename the module\n- update the docs\n- bump the version\n- run the tests";
const SIX_SENTENCES = "Fix the login bug. Then add a retry to the client. Please rename the module. Also update the docs. We should bump the version. Finally run the tests.";
const FIVE_AND_PROSE = "Here is what I need.\n- fix the login bug\n- add a retry\n- rename the module\n- update the docs\n- bump the version\nAlso, run the tests when you are done.";
const SIX_EXPLAINING = "I tried the new build. It failed on startup. The error says the port is in use. I am not sure what changed. Do you think it is the config? Something is off.";
const FENCED = "Run this:\n```\nrun a\nrun b\nrun c\nrun d\nrun e\nrun f\n```\nwhat does it print";

// The counting table: the same six tasks reach six however they are written, and six sentences of explanation are
// not six tasks. One case per shape, because each shape is a separate rule in countPromptItems.
test("a prompt's items are counted the same as a list and as prose", async () => {
  const { countPromptItems } = await SESSION_HOOKS_LIB();
  const items = (text) => countPromptItems(text).items;
  assert.equal(items(SIX_NUMBERED), 6);
  assert.equal(items(SIX_BULLETED), 6);
  assert.equal(items(SIX_SENTENCES), 6);
  assert.equal(items(FIVE_AND_PROSE), 6, "five bullets and one further instruction are six items");
  assert.equal(items(SIX_EXPLAINING), 0, "six sentences about what went wrong are not six orders");
  assert.equal(items("keep going"), 0);
  assert.equal(items("how many waves do we have"), 0);
  assert.equal(items("The android build is broken."), 0, "a word starting with a lead-in is not a lead-in");
  assert.equal(items("- Fix the login bug. Add a retry. Run the tests."), 1, "one bullet is one item however many sentences it holds");
  assert.equal(items(FENCED), 1, "a pasted script is not a list of tasks: only the line before the fence counts");
  assert.equal(items(""), 0);
  assert.equal(items(null), 0);
});

test("user-prompt-submit suggests dispatch at the threshold and says nothing below it", async () => withTemp("prompt-suggest", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  writeConfig(p, { dispatch: { minItemsForLanes: 6 } });

  const fired = promptHook(p, SIX_NUMBERED, env);
  assert.equal(fired.code, 0, fired.all);
  const payload = JSON.parse(fired.out);
  assert.deepEqual(Object.keys(payload), ["hookSpecificOutput"], "only the documented UserPromptSubmit field is printed");
  assert.equal(payload.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(payload.hookSpecificOutput.additionalContext, /^\[workflow\] This prompt reads as 6 separate items \(6 numbered or bulleted lines\), at or above the dispatch threshold of 6 \(dispatch\.minItemsForLanes\)\. Run \/workflow:dispatch now, before writing any code: it verifies each item against the code and splits the work into lanes/);
  const legacy = hook(p, "user-prompt-submit", { session_id: "s0", user_prompt: SIX_NUMBERED }, env);
  assert.match(JSON.parse(legacy.out).hookSpecificOutput.additionalContext, /reads as 6 separate items/, "the field name the hooks reference gave is still read");
  const events = readEvents(p, env).filter((e) => e.event === "dispatch-suggested");
  assert.equal(events.length, 2, "each suggestion is recorded, so a live sighting can be filed from the journal");
  events.shift();
  assert.deepEqual([events[0].items, events[0].listItems, events[0].sentenceItems, events[0].promptTruncated], [6, 6, 0, false]);

  for (const [label, prompt] of [["five items", SIX_NUMBERED.split("\n").slice(0, 5).join("\n")], ["an explanation", SIX_EXPLAINING], ["one task", "run the tests"], ["no prompt field", null]]) {
    const quiet = prompt === null ? hook(p, "user-prompt-submit", { session_id: "s1" }, env) : promptHook(p, prompt, env);
    assert.equal(quiet.code, 0, quiet.all);
    assert.equal(quiet.out, "", `${label} adds nothing to the conversation`);
  }
  assert.equal(readEvents(p, env).filter((e) => e.event === "dispatch-suggested").length, 2, "only the suggestions that were given were recorded");
  // A prompt longer than the cap is counted over the part that was read, and the journal says the text was cut.
  const huge = promptHook(p, `${SIX_BULLETED}\n${"filler words with no orders in them. ".repeat(2000)}`, env);
  assert.match(JSON.parse(huge.out).hookSpecificOutput.additionalContext, /reads as 6 separate items/);
  const afterHuge = readEvents(p, env).filter((e) => e.event === "dispatch-suggested");
  assert.equal(afterHuge.at(-1).promptTruncated, true, "the cap was reached, and the record says so");

}));

test("the stop hook asks once more when this session's prompt named dispatch and no lane plan was written since, alone or before the checkpoint reminder", async () => withTemp("dispatch-hold", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const start = (id) => hook(p, "session-start", { session_id: id, source: "startup" }, env);
  const stop = (id) => hook(p, "stop", { session_id: id }, env);
  const prompt = (id, text) => hook(p, "user-prompt-submit", { session_id: id, prompt: text }, env);
  const events = (name) => readEvents(p, env).filter((e) => e.event === name);
  cli(p, ["maintain", "--apply"], env);
  commit(p, env, "maintained");

  // No suggestion in the session: nothing to ask.
  start("d1");
  assert.equal(stop("d1").out, "");
  // A suggestion, no plan: held alone (the tree is clean, so no checkpoint is due), once for that prompt.
  prompt("d1", SIX_NUMBERED);
  const held = JSON.parse(stop("d1").out);
  assert.equal(held.decision, "block");
  assert.equal(held.reason, "Skilliton dispatch was named for a prompt in this session that read as 6 separate items, and no lane plan has been written since (LANES.md at the repository root does not exist). Before finishing, run /workflow:dispatch: it verifies each item against the code and writes the lane plan, with one lane when that is what the items need. If those were not separate pieces of work, tell the user so in one line and stop. This is asked once for that prompt.");
  assert.equal(events("dispatch-reminded").length, 1);
  assert.equal(stop("d1").out, "", "asked once for that prompt");
  // Another session's suggestion is not this session's business.
  start("d2");
  assert.equal(stop("d2").out, "");
  // A second list in the same session is a new prompt: asked again; a plan written after it clears it.
  prompt("d2", SIX_BULLETED);
  writeFileSync(join(p, "LANES.md"), "Base commit: 0000000\n");
  assert.equal(stop("d2").out, "", "a lane plan written after the prompt means dispatch ran");
  prompt("d2", SIX_NUMBERED);
  utimesSync(join(p, "LANES.md"), new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  const older = JSON.parse(stop("d2").out);
  assert.match(older.reason, /\(LANES\.md at the repository root is older than that prompt\)/);
  rmSync(join(p, "LANES.md"));

  // With a checkpoint also due, dispatch comes first and the checkpoint command stays last.
  start("d3");
  prompt("d3", SIX_NUMBERED);
  writeFileSync(join(p, "work.md"), "changed\n");
  backdate(p, env, (e) => e.event === "session-start" && e.session === "d3", 30);
  const both = JSON.parse(stop("d3").out);
  assert.match(both.reason, /^Skilliton dispatch was named .* This is asked once for that prompt\. Skilliton checkpoint reminder: /);
  assert.match(both.reason, /--apply$/, "the checkpoint command is the last thing in the reason");

  // Off with the stop reminder.
  const config = JSON.parse(readFileSync(join(p, ".skilliton", "config.json"), "utf8"));
  writeConfig(p, { ...config, checkpoints: { ...(config.checkpoints ?? {}), stopReminder: false } });
  start("d4");
  prompt("d4", SIX_NUMBERED);
  assert.equal(stop("d4").out, "", "checkpoints.stopReminder false turns this off too");
}));

test("the dispatch suggestion's threshold comes from the project's configuration", async () => withTemp("prompt-threshold", async ({ dir, env }) => {
  const three = initRepo(join(dir, "three"), env);
  writeConfig(three, { dispatch: { minItemsForLanes: 3 } });
  const fired = promptHook(three, "- fix the bug\n- add a retry\n- run the tests", env);
  assert.match(JSON.parse(fired.out).hookSpecificOutput.additionalContext, /reads as 3 separate items \(3 numbered or bulleted lines\), at or above the dispatch threshold of 3/);

  const twenty = initRepo(join(dir, "twenty"), env);
  writeConfig(twenty, { dispatch: { minItemsForLanes: 20 } });
  assert.equal(promptHook(twenty, SIX_BULLETED, env).out, "", "six items are below a threshold of twenty");
}));

test("user-prompt-submit says nothing at all outside a project, because it runs on every prompt", async () => withTemp("prompt-quiet", async ({ dir, env }) => {
  const outside = join(dir, "not-a-repo");
  mkdirSync(outside, { recursive: true });
  const r = promptHook(outside, SIX_NUMBERED, env);
  assert.equal(r.code, 0, r.all);
  assert.equal(r.out, "", "no project state line: this hook would print it on every prompt of the session");

  // The folder named in the hook JSON is gone, while the hook itself runs somewhere that exists.
  const gone = hook(outside, "user-prompt-submit", {}, env, { raw: JSON.stringify({ cwd: join(dir, "does-not-exist"), hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: SIX_NUMBERED }) });
  assert.equal(gone.code, 0, gone.all);
  assert.equal(gone.out, "");

  // A repository with no configuration is a real state, and the plugin's other hooks speak there too; the note is
  // worded so it never claims the threshold is a setting somebody made.
  const bare = initRepo(join(dir, "bare"), env);
  assert.match(JSON.parse(promptHook(bare, SIX_NUMBERED, env).out).hookSpecificOutput.additionalContext, /at or above the dispatch threshold of 6 \(dispatch\.minItemsForLanes\)/);
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
  assert.match(stopped.err, /^\[workflow\] Skilliton stop hook failed \(the journal .+ could not be read \(EISDIR\)\); nothing was blocked and the session continues\.\n$/);

  for (const event of ["pre-compact", "session-end"]) {
    const r = hook(p, event, { session_id: "s1" }, env);
    assert.equal(r.code, 0, r.all);
    assert.equal(r.out, "");
    assert.equal(r.err.trimEnd().split("\n").length, 1, r.err);
    assert.match(r.err, new RegExp(`^\\[workflow\\] Skilliton ${event} hook failed \\(the journal .+ could not be written \\(EISDIR\\)\\)`));
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
    assert.equal(r.out, `[workflow] Skilliton project state is unavailable: ${plain} is not inside a Git repository.\n`);
    const noCwd = hook(plain, event, {}, env, { raw: '{"session_id":"s1"}' });
    assert.equal(noCwd.code, 0, noCwd.all);
    assert.equal(noCwd.out, `[workflow] Skilliton project state is unavailable: ${realpathSync(plain)} is not inside a Git repository.\n`, "without cwd in the JSON the current folder is used");
    const gone = hook(plain, event, {}, env, { raw: JSON.stringify({ cwd: join(dir, "deleted") }) });
    assert.equal(gone.code, 0);
    assert.equal(gone.out, `[workflow] Skilliton project state is unavailable: the folder ${join(dir, "deleted")} does not exist.\n`);
  }
  // The one hook that says nothing: it runs on every prompt, so an "unavailable" line here would repeat all session.
  const quiet = hook(plain, "user-prompt-submit", { session_id: "s1", user_prompt: "- a\n- b\n- c\n- d\n- e\n- f" }, env);
  assert.equal(quiet.code, 0, quiet.all);
  assert.equal(quiet.out, "", "user-prompt-submit outside a repository adds nothing to the conversation");

  const wrongEvent = spawnSync(BIN, ["hook", "pre-tool-use"], { cwd: plain, env, input: "{}", encoding: "utf8" });
  assert.equal(wrongEvent.status, 0, "an unknown event never exits 2, which would block the client");
  assert.match(wrongEvent.stderr, /expects exactly one of session-start, stop, pre-compact, session-end, user-prompt-submit/);
}));

// ---------------------------------------------------------------- status

test("status exits 0 for a clean prepared project, and --json is exactly one result object", async () => withTemp("status-clean", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const r = cli(p, ["status"], env);
  assert.equal(r.code, 0, r.all);
  for (const pattern of [
    /^OK         layout: layout 3 \(current for this runtime\)$/m,
    HAS_MIGRATIONS ? /^OK         migrations: none pending \(layout 3, target 3\)$/m : /^NOT RUN    migrations: not available in this build \(runtime\/lib\/migrations\.mjs is not present\)$/m,
    new RegExp(`^OK         versions: workflow runtime ${escape(INSTALLED)} installed; the project requires workflow ${escape(INSTALLED)} or later: met$`, "m"),
    /^OK         records: all 9 present$/m,
    /^OK         tasks: no task records yet \(docs\/tasks does not exist\); no open task on main$/m,
    /^OK         handoff: docs\/HANDOFF\.md was written .+; no later commit or uncommitted change \(0 uncommitted path\(s\)\)$/m,
    /^NOTE       sessions: no session recorded in this worktree's journal/m,
    HAS_SECURITY ? /^NOT RUN    security: security evidence not available: no security catalog at \.skilliton\/security\/catalog\.json/m : /^NOT RUN    security: not available in this build \(runtime\/lib\/security\.mjs is not present\)$/m,
    /^NOT RUN    enrollment: not evaluated: .*\.claude\/settings\.json enables no plugins, so there is nothing to compare/m,
    new RegExp("^Summary: Nothing needs attention among the checks that ran\\. Not run: " + [HAS_MIGRATIONS ? null : "migrations", "enrollment", "security"].filter(Boolean).join(", ") + "\\.$", "m"),
  ]) assert.match(r.out, pattern);

  const j = statusJson(p, env);
  assert.equal(j.code, 0);
  assert.equal(j.err, "");
  assert.deepEqual(Object.keys(j.json), ["schema", "command", "result", "summary", "details"]);
  assert.deepEqual([j.json.schema, j.json.command, j.json.result], ["skilliton.result/1", "status", "complete"]);
  assert.deepEqual(j.json.details.checks.map((c) => c.name), ["layout", "migrations", "versions", "enrollment", "records", "tasks", "handoff", "sessions", "security"]);
  assert.equal(j.json.details.layout.version, 3);
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

  const version = fresh({ config: { prepare: { version: 3, requires: { workflow: "99.0.0" } } } });
  attentionOnly(version, "versions", /requires workflow 99\.0\.0 or later: NOT MET/);

  // A commit after the handoff makes the handoff stale on main, which is not what these cases test, so each case that
  // commits also rewrites the handoff in that same commit (a handoff committed with the work is not older than it).
  const missing = fresh();
  git(missing, ["rm", "-q", "docs/ROADMAP.md"], env);
  writeHandoff(missing, new Date().toISOString());
  const later = new Date(Date.now() + 5000).toISOString();
  commit(missing, { ...env, GIT_AUTHOR_DATE: later, GIT_COMMITTER_DATE: later }, "remove a record, committed 5 seconds after the handoff was written");
  attentionOnly(missing, "records", /^1 of 9 missing: docs\/ROADMAP\.md \(roadmap\); docs\/ROADMAP\.md is not in Git; .* prepare --apply creates it and leaves every record that exists as it is$/);

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

  // A Written time two hours ahead hid a stale handoff: status called it current although newer changes existed.
  const future = fresh({ written: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
  writeFileSync(join(future, "README.md"), "# edited after the handoff was really written\n");
  const f = attentionOnly(future, "handoff", /^docs\/HANDOFF\.md says it was written .+, which is later than this machine's clock \(.+\), so its freshness cannot be judged; set the Written line to the time the note was written$/);
  assert.equal(f.json.details.handoff.problem, "written in the future");
  const ahead = fresh({ written: new Date(Date.now() + 60 * 1000).toISOString() });
  assert.equal(statusJson(ahead, env).code, 0, "a Written time one minute ahead is within the allowed clock difference");

  // A project that was just prepared carries the placeholder preparation wrote. That is "no handoff yet", not a
  // handoff whose time cannot be read, and it must not ask for attention at the first session.
  const placeholder = "# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: not yet assessed\n\n- **State:** Skilliton created this project's records.\n\n## Earlier\n";
  const justPrepared = fresh();
  writeFileSync(join(justPrepared, "docs", "HANDOFF.md"), placeholder);
  commit(justPrepared, env, "the handoff preparation writes");
  const prepared = statusJson(justPrepared, env);
  assert.equal(prepared.code, 0, `a freshly prepared project needs no action:\n${prepared.out}`);
  assert.equal(prepared.json.details.handoff.problem, "not written yet");
  assert.match(prepared.out, /no session has written a handoff yet/);

  // The same placeholder on a project that has moved on is a handoff nobody wrote, not a new project: it must not
  // hide later work. One commit after the handoff's own commit is enough.
  const movedOn = fresh();
  writeFileSync(join(movedOn, "docs", "HANDOFF.md"), placeholder);
  commit(movedOn, env, "the handoff preparation writes");
  writeFileSync(join(movedOn, "README.md"), "# worked on for weeks\n");
  commit(movedOn, env, "work after the handoff");
  const placeholderStale = attentionOnly(movedOn, "handoff", /still carries the line preparation wrote \("not yet assessed"\), and the project has moved on since \(1 commit\(s\) that changed something else since it was committed\)/);
  assert.equal(placeholderStale.json.details.handoff.problem, "not written yet");

  // A handoff that was never committed has no commit to measure from, so its own time on disk is the mark, and the
  // sentence says which it is. Without this the placeholder hid every later commit for ever, and a project worked on
  // for weeks read as one prepared a minute ago.
  const neverCommitted = fresh({ written: "not yet assessed", commitHandoff: false });
  writeFileSync(join(neverCommitted, "README.md"), "# weeks of work\n");
  // Dated two minutes on, so the work is plainly after the time the file was written: everything else in this
  // fixture happens inside the same second, where no order can be known.
  const twoMinutesOn = new Date(Date.now() + 120000).toISOString();
  commitPath(neverCommitted, { ...env, GIT_AUTHOR_DATE: twoMinutesOn, GIT_COMMITTER_DATE: twoMinutesOn }, "work after preparation", "README.md");
  const fromDisk = attentionOnly(neverCommitted, "handoff", /still carries the line preparation wrote \("not yet assessed"\), and the project has moved on since \(1 commit\(s\) that changed something else since the time this file was last written on this machine \(it has never been committed\)\)/);
  assert.equal(fromDisk.json.details.handoff.measuredFrom, "the time this file was last written on this machine (it has never been committed)");

  // And the other way round: the work came first and the handoff was written after it. Counting those commits would
  // be attributing them to a time the file did not exist, so this is "no handoff yet", not "the project moved on".
  const writtenLast = fresh({ written: "not yet assessed", commitHandoff: false });
  rmSync(join(writtenLast, "docs", "HANDOFF.md"), { force: true });
  writeFileSync(join(writtenLast, "README.md"), "# weeks of work\n");
  commitPath(writtenLast, env, "work before the handoff was written", "README.md");
  writeHandoff(writtenLast, "not yet assessed");
  const justWritten = statusJson(writtenLast, env);
  assert.equal(justWritten.code, 0, `a handoff written after the work is not a handoff the work is behind:\n${justWritten.out}`);
  assert.match(justWritten.out, /no session has written a handoff yet/);

  // A shallow clone (a CI checkout with --depth) may not carry the commit that added the handoff at all, so a count
  // of none means nothing. Saying "no session has written a handoff yet" there would be a guess presented as a fact.
  const deep = fresh({ written: "not yet assessed" });
  writeFileSync(join(deep, "README.md"), "# later work\n");
  commit(deep, env, "work after the handoff");
  const shallow = join(dir, "shallow-clone");
  execFileSync("git", ["clone", "-q", "--depth", "1", `file://${deep}`, shallow], { env });
  const truncated = attentionOnly(shallow, "handoff", /whether the project has moved on since cannot be judged here: the history in this clone is shallow/);
  assert.equal(truncated.json.details.handoff.shallowHistory, true);

  // A placeholder handoff deleted and written again is still a handoff nobody has written, and the work before it is
  // still work no handoff describes. Measuring from the newest commit that added the file (tried, and wrong) resets
  // the count to none and hides that work: the project reads as one prepared a minute ago.
  const reAdded = fresh({ written: "not yet assessed" });
  writeFileSync(join(reAdded, "README.md"), "# weeks of work\n");
  commit(reAdded, env, "work");
  rmSync(join(reAdded, "docs", "HANDOFF.md"), { force: true });
  commit(reAdded, env, "the handoff is taken out");
  writeHandoff(reAdded, "not yet assessed");
  commit(reAdded, env, "the handoff preparation writes, again");
  const again = attentionOnly(reAdded, "handoff", /still carries the line preparation wrote \("not yet assessed"\), and the project has moved on since \(1 commit\(s\) that changed something else since it was committed\)/);
  assert.equal(again.json.details.handoff.commitsSinceHandoffCommit, 1, "the count is taken from the first time this project had a handoff, not from the newest copy of the file; the two commits that only moved the handoff itself are not work it is behind");

  // And the other way of losing the date: the records folder is moved, so the handoff's path has exactly one commit
  // that added it, which is the move. Without --follow that move becomes the mark and the work before it is gone.
  const moved = fresh({ written: "not yet assessed" });
  writeFileSync(join(moved, "README.md"), "# weeks of work\n");
  commit(moved, env, "work");
  git(moved, ["mv", "docs/HANDOFF.md", "docs/HANDOFF-NOTES.md"], env);
  const movedConfig = JSON.parse(readFileSync(join(moved, ".skilliton", "config.json"), "utf8"));
  movedConfig.prepare = { ...movedConfig.prepare, artifacts: { ...(movedConfig.prepare?.artifacts ?? {}), handoff: "docs/HANDOFF-NOTES.md" } };
  writeFileSync(join(moved, ".skilliton", "config.json"), `${JSON.stringify(movedConfig, null, 2)}\n`);
  commit(moved, env, "the handoff is renamed");
  // Two: the work, and the rename itself, which also changed the project's configuration.
  const afterMove = attentionOnly(moved, "handoff", /still carries the line preparation wrote \("not yet assessed"\), and the project has moved on since \(2 commit\(s\)/);
  assert.equal(afterMove.json.details.handoff.file, "docs/HANDOFF-NOTES.md");

  // Preparation that replaces a document the project already had: git pairs them, so following renames walks into
  // the older file's history. The mark stops at the commit that made this a Skilliton project, or a project
  // prepared a minute ago would be told it has years of work behind a handoff nobody has written.
  const replaced = join(dir, `p${n++}`);
  initRepo(replaced, env);
  // Close enough to what preparation writes that git pairs the two as a rename, which is what makes --follow walk
  // into this file's history at all.
  writeFileSync(join(replaced, "NOTES.md"), "# Notes\n\nKind: Living.\n\n## RESUME HERE\n\nWritten: by hand, before any of this\n\n- **State:** fixture.\n- **Next:** nothing.\n- **Blocked:** nothing.\n- **Watch out:** nothing.\n");
  commit(replaced, env, "notes");
  for (const i of [1, 2, 3]) { writeFileSync(join(replaced, `work${i}.md`), `# work ${i}\n`); commit(replaced, env, `work ${i}`); }
  writeConfig(replaced, { prepare: { version: 3, requires: { workflow: INSTALLED } } });
  for (const rel of RECORD_FILES.filter((f) => f !== "docs/HANDOFF.md")) {
    mkdirSync(dirname(join(replaced, rel)), { recursive: true });
    writeFileSync(join(replaced, rel), `# ${rel}\n\nKind: Living.\n`);
  }
  mkdirSync(join(replaced, "docs"), { recursive: true });
  git(replaced, ["mv", "NOTES.md", "docs/HANDOFF.md"], env);
  writeHandoff(replaced, "not yet assessed");
  commit(replaced, env, "prepare");
  const justPreparedOverNotes = statusJson(replaced, env);
  assert.equal(justPreparedOverNotes.code, 0, `a project prepared over a document it already had is not one that has moved on:\n${justPreparedOverNotes.out}`);
  assert.match(justPreparedOverNotes.out, /no session has written a handoff yet/);

  // A later commit that only tidies the handoff resets nothing: the work before it still counts.
  const tidied = fresh();
  writeFileSync(join(tidied, "docs", "HANDOFF.md"), placeholder);
  commit(tidied, env, "the handoff preparation writes");
  writeFileSync(join(tidied, "README.md"), "# weeks of work\n");
  commit(tidied, env, "work after the handoff");
  writeFileSync(join(tidied, "docs", "HANDOFF.md"), `${placeholder}\n`);
  commit(tidied, env, "tidy the handoff");
  attentionOnly(tidied, "handoff", /the project has moved on since \(1 commit\(s\)/);

  // And the first minute with the tool: preparation writes its files and commits nothing, so its own output must not
  // read as work the handoff is behind. This is the case the placeholder state exists for.
  const justPreparedDirty = fresh();
  writeFileSync(join(justPreparedDirty, "docs", "HANDOFF.md"), placeholder.replace("not yet assessed", "  Not Yet Assessed"));
  writeFileSync(join(justPreparedDirty, ".skilliton", "config.json"), readFileSync(join(justPreparedDirty, ".skilliton", "config.json"), "utf8"));
  writeFileSync(join(justPreparedDirty, "NEW-RECORD.md"), "written by preparation, not committed yet\n");
  const firstMinute = statusJson(justPreparedDirty, env);
  assert.equal(firstMinute.code, 0, `a project prepared a minute ago needs no action:\n${firstMinute.out}`);
  assert.match(firstMinute.out, /no session has written a handoff yet/);

  const noWritten = fresh();
  writeFileSync(join(noWritten, "docs", "HANDOFF.md"), "# Handoff\n\nKind: Living.\n\n## RESUME HERE\n\n- **State:** no date.\n");
  commit(noWritten, env, "handoff without a date");
  attentionOnly(noWritten, "handoff", /has no "Written:" line under "## RESUME HERE", so its freshness cannot be judged/);
  writeHandoff(noWritten, "2026-09-16 14:41 CEST");
  commit(noWritten, env, "handoff with an unknown zone");
  attentionOnly(noWritten, "handoff", /the time zone "CEST" is not one Skilliton reads/);

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
  // Every command names bash, so a Windows machine without Git Bash fails loudly instead of handing a shell script
  // to PowerShell (docs/decisions/2026-09-17-windows-is-supported-through-git-for-win-cb9e.md).
  assert.deepEqual(sessionStart[1], { type: "command", command: '"${CLAUDE_PLUGIN_ROOT}"/bin/skilliton hook session-start', shell: "bash", timeout: 15 });
  for (const [event, arg] of [["Stop", "stop"], ["PreCompact", "pre-compact"], ["SessionEnd", "session-end"]]) {
    assert.deepEqual(commands(event), [{ type: "command", command: `"\${CLAUDE_PLUGIN_ROOT}"/bin/skilliton hook ${arg}`, shell: "bash", timeout: 15 }]);
  }
  // A shorter budget than the others: this one runs on every prompt, and a prompt waits for it.
  assert.deepEqual(commands("UserPromptSubmit"), [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}"/bin/skilliton hook user-prompt-submit', shell: "bash", timeout: 10 }]);
  for (const hook of Object.values(config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks))) {
    assert.equal(hook.shell, "bash", `${hook.command} names the shell it needs`);
  }
  assert.deepEqual(Object.keys(config.hooks).sort(), ["PreCompact", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"]);

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
      if (arg === "hook session-start") assert.match(r.stdout, /^\[workflow\] Project state \(skilliton hook session-start\):$/m);
    }
  }
  assert.deepEqual(readEvents(p, env).map((e) => e.event).sort(), ["pre-compact", "session-end", "session-start"]);
}));

// ---------------------------------------------------------------- checkpoint writes the handoff and the indexes (workflow 0.9.0)

const HANDOFF_LIB = async () => import(pathToFileURL(join(PLUGIN, "runtime", "lib", "handoff.mjs")).href);
const LIFECYCLE_LIB = async () => import(pathToFileURL(join(PLUGIN, "runtime", "lib", "lifecycle.mjs")).href);
const handoffText = (p) => readFileSync(join(p, "docs", "HANDOFF.md"), "utf8");
const resumeWritten = (text) => /^Written: (.+)$/m.exec(text)[1];

test("checkpoint --handoff on main rewrites RESUME HERE byte for byte, the task Handoff, the tasks index, and reads back as current", async () => withTemp("handoff-main", async ({ dir, env }) => {
  const { parseWritten } = await LIFECYCLE_LIB();
  const fixtureWritten = "2026-09-18T20:00:00.000Z";
  const p = preparedRepo(join(dir, "p"), env, { written: fixtureWritten });
  const { id, file } = startTask(p, env, "Resume on main");
  const original = handoffText(p);
  const status = readFileSync(join(p, "docs", "STATUS.md"), "utf8");
  const args = ["checkpoint", "--handoff", "--state", "Half done", "--evidence", "tests pass", "--next", "Finish the form", "--blocked", "waiting on review"];

  const preview = cli(p, args, env);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /^\+Written: /m);
  assert.match(preview.out, /^\+### 2026-09-18T20:00:00\.000Z$/m);
  assert.match(preview.out, /^indexes: would write docs\/STATUS\.md \(tasks index: 1 open task\(s\) of 1\)$/m);
  assert.match(preview.out, /^Preview only; nothing was written/m);
  assert.equal(handoffText(p), original, "a preview must not write the handoff");
  assert.equal(readFileSync(join(p, "docs", "STATUS.md"), "utf8"), status, "a preview must not write the index");
  assert.equal(readEvents(p, env).length, 0);
  assert.equal(existsSync(join(gitDir(p, env), "skilliton-backups")), false, "a preview makes no backups");

  const shortHead = git(p, ["rev-parse", "--short", "HEAD"], env).trim();
  const r = cli(p, [...args, "--apply"], env);
  assert.equal(r.code, 0, r.all);
  const text = handoffText(p);
  const written = resumeWritten(text);
  const parsed = parseWritten(written);
  assert.ok(parsed.ok, `${written}: ${parsed.reason}`);
  assert.ok(Math.abs(parsed.at.getTime() - Date.now()) < 5 * 60 * 1000, `Written ${written} is the clock, not a typed time`);
  const task = readFileSync(file, "utf8");
  const dirty = /- \*\*Git:\*\* main @ \w+, (\d+) uncommitted/.exec(task)[1];
  assert.equal(text, [
    "# Handoff", "", "Kind: Living.", "", "## RESUME HERE", "", `Written: ${written}`, "",
    "- **State:** Half done. Evidence: tests pass.", "- **Next:** Finish the form", "- **Blocked:** waiting on review", "- **Watch out:** nothing.", `- **Git:** main @ ${shortHead}, ${dirty} uncommitted`, "",
    "## Earlier", "", `### ${fixtureWritten}`, "- **State:** fixture.", "- **Next:** nothing.", "- **Blocked:** nothing.", "- **Watch out:** nothing.", "",
  ].join("\n"));
  assert.match(r.out, /^handoff: Watch out carried over from the previous note$/m);
  assert.match(r.out, /^handoff: the previous note \(Written: 2026-09-18T20:00:00\.000Z\) moves to the top of Earlier$/m);
  assert.match(r.out, /^handoff: written to docs\/HANDOFF\.md; backups of the previous versions are under /m);
  assert.ok(task.includes("- **State:** Half done. Evidence: tests pass.\n- **Next:** Finish the form\n- **Blocked:** waiting on review\n- **Watch out:** nothing.\n"), task);
  const index = readFileSync(join(p, "docs", "STATUS.md"), "utf8");
  const updated = /^- \*\*Updated:\*\* (.+)$/m.exec(task)[1];
  assert.ok(index.includes("<!-- skilliton:index:tasks:start -->"), index);
  assert.ok(index.includes(`| [${id}](tasks/${id}.md) | Resume on main | in-progress | main | unassigned | ${updated} |`), `the index carries the Updated the checkpoint wrote\n${index}`);
  assert.match(r.out, /^indexes: written docs\/STATUS\.md \(tasks index: 1 open task\(s\) of 1\)$/m);
  assert.equal(readEvents(p, env).filter((e) => e.event === "checkpoint").length, 1);
  assert.equal(readEvents(p, env)[0].fingerprint, fingerprint(p, env), "the event records the fingerprint after every write");

  const j = statusJson(p, env);
  assert.equal(checkStatus(j.json, "handoff"), "ok", JSON.stringify(j.json.details.checks.find((c) => c.name === "handoff")));
  const start = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(start.code, 0, start.all);
  assert.match(start.out, /^- Task handoff: State: Half done\. Evidence: tests pass\.; Next: Finish the form; Blocked: waiting on review; Watch out: nothing\.$/m);
  assert.match(start.out, new RegExp(`^- Shared handoff: docs/HANDOFF\\.md was written ${escape(written)}; no later commit or uncommitted change`, "m"));

  // A second note carries Blocked over and keeps the first note under Earlier.
  const r2 = cli(p, ["checkpoint", "--handoff", "--state", "Done", "--next", "Open a pull request", "--apply"], env);
  assert.equal(r2.code, 0, r2.all);
  assert.match(r2.out, /^handoff: Blocked carried over from the previous note$/m);
  const two = handoffText(p);
  assert.ok(two.includes("- **State:** Done\n- **Next:** Open a pull request\n- **Blocked:** waiting on review\n- **Watch out:** nothing.\n"), two);
  assert.deepEqual([...two.matchAll(/^### (.+)$/gm)].map((m) => m[1]), [written, fixtureWritten]);
}));

// The handoff's Written line is printed to the minute; the files one checkpoint writes carry millisecond times. When a
// run straddles a minute boundary the index lands after the end of the minute the handoff names, and without a window
// the handoff a command just wrote reads as older than the files the same command wrote. Seen once in CI on
// 2026-09-20 (run 35491126289), where the same test passed on the run before it.
test("a file the same checkpoint wrote, landing in the next minute, is not newer than the handoff", async () => withTemp("handoff-boundary", async ({ dir, env }) => {
  const { parseWritten } = await LIFECYCLE_LIB();
  const p = preparedRepo(join(dir, "p"), env, { written: "2026-09-18T20:00:00.000Z" });
  startTask(p, env, "Boundary");
  const r = cli(p, ["checkpoint", "--handoff", "--state", "Half done", "--evidence", "tests pass", "--next", "Finish", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  const written = resumeWritten(handoffText(p));
  const parsed = parseWritten(written);
  assert.ok(parsed.ok, `${written}: ${parsed.reason}`);
  const end = parsed.end.getTime();
  const index = join(p, "docs", "STATUS.md");

  utimesSync(index, new Date(end + 1), new Date(end + 1));
  const ok = statusJson(p, env).json;
  assert.equal(checkStatus(ok, "handoff"), "ok", JSON.stringify(ok.details.checks.find((c) => c.name === "handoff")));

  // The window is short on purpose: work done half a minute later is still work done after the handoff.
  utimesSync(index, new Date(end + 30000), new Date(end + 30000));
  const late = statusJson(p, env).json;
  const check = late.details.checks.find((c) => c.name === "handoff");
  assert.equal(check.status, "attention", JSON.stringify(check));
  assert.match(check.summary, /uncommitted change\(s\) modified after it \(for example docs\/STATUS\.md\)/);
}));

test("checkpoint --handoff keeps five Earlier entries and moves the rest to the top of a created archive", async () => withTemp("handoff-archive", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env, { written: "2026-09-01T09:00:00.000Z" });
  rmSync(join(p, "docs", "HANDOFF_ARCHIVE.md"));
  startTask(p, env, "Rotate");
  const writtens = [];
  for (let i = 1; i <= 7; i++) {
    const r = cli(p, ["checkpoint", "--handoff", "--state", `Note ${i}`, "--next", "n", "--apply"], env);
    assert.equal(r.code, 0, r.all);
    writtens.push(resumeWritten(handoffText(p)));
    const entries = [...handoffText(p).matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    assert.ok(entries.length <= 5, `${i}: ${entries.length} entries`);
    if (i < 6) assert.equal(existsSync(join(p, "docs", "HANDOFF_ARCHIVE.md")), false, `${i}: nothing archived yet`);
    if (i === 6) {
      assert.match(r.out, /^handoff: 1 older note\(s\) beyond the five kept move to the top of docs\/HANDOFF_ARCHIVE\.md \(created from the record template\)$/m);
      assert.equal(readFileSync(join(p, "docs", "HANDOFF_ARCHIVE.md"), "utf8"), "# Handoff archive\n\nKind: Reference. The current handoff is `docs/HANDOFF.md`.\n\n### 2026-09-01T09:00:00.000Z\n- **State:** fixture.\n- **Next:** nothing.\n- **Blocked:** nothing.\n- **Watch out:** nothing.\n");
    }
  }
  const archive = readFileSync(join(p, "docs", "HANDOFF_ARCHIVE.md"), "utf8");
  assert.deepEqual([...archive.matchAll(/^### (.+)$/gm)].map((m) => m[1]), [writtens[0], "2026-09-01T09:00:00.000Z"], "the seventh note archives the first, above the fixture");
  assert.ok(archive.includes(`### ${writtens[0]}\n- **State:** Note 1\n`), archive);
  assert.deepEqual([...handoffText(p).matchAll(/^### (.+)$/gm)].map((m) => m[1]), writtens.slice(1, 6).reverse());
}));

test("checkpoint --handoff off an integration branch writes only the task record, and says why", async () => withTemp("handoff-branch", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  git(p, ["checkout", "-q", "-b", "feature/x"], env);
  const { file } = startTask(p, env, "Branch work");
  const original = handoffText(p);
  const status = readFileSync(join(p, "docs", "STATUS.md"), "utf8");
  const r = cli(p, ["checkpoint", "--handoff", "--state", "On a branch", "--next", "Merge", "--watch-out", "the flaky test", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  assert.equal(handoffText(p), original, "the shared handoff is never touched off an integration branch");
  assert.equal(readFileSync(join(p, "docs", "STATUS.md"), "utf8"), status, "no index off an integration branch");
  assert.match(r.out, /^handoff: the shared handoff is written on an integration branch \(main, master\), and this branch is feature\/x; the note went to the task record's Handoff section only$/m);
  assert.match(r.out, /^indexes: skipped; indexes are written on an integration branch \(main, master\), and this branch is feature\/x$/m);
  assert.ok(readFileSync(file, "utf8").includes("- **State:** On a branch\n- **Next:** Merge\n- **Blocked:** nothing\n- **Watch out:** the flaky test\n"));
  const again = cli(p, ["checkpoint", "--state", "Still on a branch", "--next", "Merge", "--apply"], env);
  assert.equal(again.code, 0, again.all);
  assert.match(again.out, /^handoff: Watch out carried over from the previous note$/m);
  assert.ok(readFileSync(file, "utf8").includes("- **Blocked:** nothing\n- **Watch out:** the flaky test\n"), "the task record's own previous value carries over");
}));

test("checkpoint on an unprepared main says the index is skipped because a record does not exist", async () => withTemp("handoff-unprepared", async ({ dir, env }) => {
  const p = initRepo(join(dir, "p"), env);
  startTask(p, env, "Unprepared");
  const r = cli(p, ["checkpoint", "--state", "x", "--next", "y", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^indexes: skipped; the [a-z ]+ record [A-Za-z/_.]+ does not exist \(run .*prepare --apply to create the records\)$/m);
  assert.equal(existsSync(join(p, "docs", "STATUS.md")), false);
}));

test("checkpoint refuses with nothing written: a handoff ahead of the clock, without RESUME HERE, without or with an unreadable Written, and a task Updated ahead of the clock", async () => withTemp("handoff-refusals", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const { file } = startTask(p, env, "Refuse me");
  const task = readFileSync(file, "utf8");
  const status = readFileSync(join(p, "docs", "STATUS.md"), "utf8");
  const cases = [
    ["written ahead", () => writeHandoff(p, "2999-01-01 09:00 EDT"), ["--handoff"], /docs\/HANDOFF\.md says it was written 2999-01-01 09:00 EDT, which is later than this machine's clock .* by more than 5 minutes/],
    ["no RESUME HERE", () => writeFileSync(join(p, "docs", "HANDOFF.md"), "# Handoff\n\nKind: Living.\n\nWritten: 2026-09-01 09:00 EDT\n"), ["--handoff"], /docs\/HANDOFF\.md has no "## RESUME HERE" section/],
    ["no Written", () => writeFileSync(join(p, "docs", "HANDOFF.md"), "# Handoff\n\n## RESUME HERE\n\n- **State:** x\n"), ["--handoff"], /docs\/HANDOFF\.md has no "Written:" line/],
    ["unreadable Written", () => writeFileSync(join(p, "docs", "HANDOFF.md"), "# Handoff\n\n## RESUME HERE\n\nWritten: yesterday\n"), ["--handoff"], /docs\/HANDOFF\.md: the Written value could not be read/],
    ["task Updated ahead", () => { writeHandoff(p, "2026-09-01 09:00 EDT"); writeFileSync(file, task.replace(/^- \*\*Updated:\*\* .+$/m, "- **Updated:** 2999-01-01T00:00:00.000Z")); }, [], /says it was updated 2999-01-01T00:00:00\.000Z, which is later than this machine's clock/],
  ];
  for (const [label, arrange, extra, pattern] of cases) {
    arrange();
    const handoffBefore = handoffText(p);
    const taskBefore = readFileSync(file, "utf8");
    const r = cli(p, ["checkpoint", ...extra, "--state", "x", "--next", "y", "--apply"], env);
    assert.equal(r.code, 2, `${label}\n${r.all}`);
    assert.match(r.all, pattern, label);
    assert.match(r.all, /Nothing was written/, label);
    assert.equal(handoffText(p), handoffBefore, `${label}: the handoff is untouched`);
    assert.equal(readFileSync(file, "utf8"), taskBefore, `${label}: the task record is untouched`);
    assert.equal(readFileSync(join(p, "docs", "STATUS.md"), "utf8"), status, `${label}: the index is untouched`);
    assert.equal(readEvents(p, env).length, 0, `${label}: no journal event`);
    assert.equal(existsSync(join(gitDir(p, env), "skilliton-backups")), false, `${label}: no backups`);
  }
}));

test("mutation check: without the skew bound, the written-ahead refusal does not happen", async () => withTemp("mutant-skew", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "lifecycle.mjs"), "export const WRITTEN_AHEAD_MS = 5 * 60 * 1000;", "export const WRITTEN_AHEAD_MS = Infinity;"));
  const p = preparedRepo(join(dir, "p"), env, { written: "2999-01-01 09:00 EDT" });
  startTask(p, env, "Skew");
  const shipped = cli(p, ["checkpoint", "--handoff", "--state", "x", "--next", "y"], env);
  assert.equal(shipped.code, 2, shipped.all);
  const broken = cli(p, ["checkpoint", "--handoff", "--state", "x", "--next", "y"], env, { entry: mutant.entry });
  assert.equal(broken.code, 0, `the mutant accepts the note written ahead, so the assertion above can fail\n${broken.all}`);
}));

// ---------------------------------------------------------------- mutation checks

test("mutation check: without the once-per-fingerprint rule, the blocks-exactly-once assertion fails", async () => withTemp("mutant-once", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "session-hooks.mjs"),
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
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "session-hooks.mjs"),
    "if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false };", "return { text, truncated: false };"));
  const p = initRepo(join(dir, "p"), env);
  writeConfig(p, { handoff: { maxBytes: 300 } });
  assert.ok(Buffer.byteLength(hook(p, "session-start", { session_id: "s1" }, env).out) <= 300);
  assert.ok(Buffer.byteLength(hook(p, "session-start", { session_id: "s2" }, env, { bin: mutant.bin }).out) > 300, "the mutant exceeds the bound");
}));

test("mutation check: without the merge sentence, the maintain assertion fails", async () => withTemp("mutant-merge", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "session-hooks.mjs"),
    '    parts.push(`${n} merge commit${n === 1 ? "" : "s"} landed in that window (${named}), so a batch of work has just come in: run /workflow:maintain on an integration branch as well, which reconciles the records and the indexes against what merged.`);', ""));
  const shipped = mergedFixture(join(dir, "shipped"), env);
  const broken = mergedFixture(join(dir, "mutated"), env);
  // The maintenance paragraph (workflow 0.19.0) names /workflow:maintain too, so the check is on the merge sentence itself.
  assert.ok(stopReasonOf(shipped.p, env).includes("so a batch of work has just come in: run /workflow:maintain"));
  assert.ok(!stopReasonOf(broken.p, env, mutant.bin).includes("so a batch of work has just come in"), "the mutant drops the sentence, so the assertion above can fail");
}));

test("mutation check: without --merges, the ordinary-commit assertion fails", async () => withTemp("mutant-merges-flag", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "journal.mjs"),
    '"rev-list", "--merges", ', '"rev-list", '));
  const commitOnly = (at) => {
    const p = stopFixture(at, env, { change: false });
    writeFileSync(join(p, "work.txt"), "committed\n");
    commit(p, env, "ordinary work");
    return p;
  };
  assert.ok(!stopReasonOf(commitOnly(join(dir, "shipped")), env).includes("/workflow:maintain"));
  assert.ok(stopReasonOf(commitOnly(join(dir, "mutated")), env, mutant.bin).includes("/workflow:maintain"), "the mutant counts an ordinary commit as a merge, so the assertion above can fail");
}));

test("mutation check: without the problem field, the unknown-window assertion fails", async () => withTemp("mutant-merge-unknown", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "journal.mjs"),
    "const none = (problem) => ({ merges: [], problem });", "const none = () => ({ merges: [], problem: null });"));
  const noBaselineHead = (at) => {
    const p = join(at, "p");
    mkdirSync(p, { recursive: true });
    git(p, ["init", "-q"], env);
    git(p, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
    writeConfig(p, { checkpoints: { minMinutes: 20 } });
    assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
    backdate(p, env, (e) => e.event === "session-start", 30);
    writeFileSync(join(p, "README.md"), "# fixture\n");
    commit(p, env, "first");
    return p;
  };
  assert.ok(stopReasonOf(noBaselineHead(join(dir, "shipped")), env).includes("is unknown"));
  assert.ok(!stopReasonOf(noBaselineHead(join(dir, "mutated")), env, mutant.bin).includes("is unknown"), "the mutant reads an unreadable window as silence, so the assertion above can fail");
}));

test("mutation check: without the fenced-code skip, the pasted-script assertion fails", async () => withTemp("mutant-fence", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "lib", "session-hooks.mjs"),
    'if (/^[ \\t]{0,3}(?:```|~~~)/.test(line)) { fenced = !fenced; continue; }', ""));
  const { countPromptItems } = await SESSION_HOOKS_LIB();
  const broken = await SESSION_HOOKS_LIB(mutant.root);
  const fenced = "Run this:\n```\nrun a\nrun b\nrun c\nrun d\nrun e\nrun f\n```\nwhat does it print";
  assert.equal(countPromptItems(fenced).items, 1);
  assert.equal(broken.countPromptItems(fenced).items, 7, "the mutant counts the pasted script, so the assertion above can fail");
}));

test("mutation check: with the threshold hardcoded, the configured-threshold assertion fails", async () => withTemp("mutant-threshold", async ({ dir, env }) => {
  const mutant = copyPlugin(dir, (root) => mutateFile(join(root, "runtime", "commands", "hook.mjs"),
    "dispatchSuggestion(counts, project.dispatch.minItemsForLanes)", "dispatchSuggestion(counts, 6)"));
  const three = (at) => { const p = initRepo(at, env); writeConfig(p, { dispatch: { minItemsForLanes: 3 } }); return p; };
  assert.notEqual(promptHook(three(join(dir, "shipped")), "- fix the bug\n- add a retry\n- run the tests", env).out, "");
  assert.equal(promptHook(three(join(dir, "mutated")), "- fix the bug\n- add a retry\n- run the tests", env, { bin: mutant.bin }).out, "", "the mutant ignores the project's threshold, so the assertion above can fail");
}));

test("session start says enrollment comes first when the plugins this project enables are not installed", async () => withTemp("enrollment", async ({ dir, env }) => {
  const teamSettings = (p, enabled) => {
    mkdirSync(join(p, ".claude"), { recursive: true });
    writeFileSync(join(p, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: enabled }, null, 2) + "\n");
  };
  const installRecord = (plugins) => {
    const at = join(env.HOME, ".claude", "plugins");
    mkdirSync(at, { recursive: true });
    writeFileSync(join(at, "installed_plugins.json"), JSON.stringify({ plugins }, null, 2) + "\n");
    return join(at, "installed_plugins.json");
  };
  const enabled = { "workflow@acme-skills": true, "guardrails@acme-skills": true };

  // Nothing installed at all, which is what a machine that has never been enrolled looks like.
  const none = preparedRepo(join(dir, "none"), env);
  teamSettings(none, enabled);
  const r1 = cli(none, ["status"], env);
  assert.equal(r1.code, 1, r1.all);
  assert.match(r1.out, /^ATTENTION  enrollment: this project enables 2 plugin\(s\) \(workflow@acme-skills, guardrails@acme-skills\) and Claude Code has no install record on this machine/m);
  assert.match(r1.out, /Enrollment comes first: run .*skilliton\S* join --company <name> --signers <file> --apply/);
  assert.match(r1.out, /Codex records its installs elsewhere and is not read here/);
  assert.deepEqual(statusJson(none, env).json.details.enrollment.missing, ["workflow@acme-skills", "guardrails@acme-skills"]);

  // One of the two installed: the gap is named, not rounded to either answer.
  const recordPath = installRecord({ "workflow@acme-skills": [{ scope: "user", version: "0.15.0" }] });
  const half = preparedRepo(join(dir, "half"), env);
  teamSettings(half, enabled);
  const r2 = cli(half, ["status"], env);
  assert.equal(r2.code, 1, r2.all);
  assert.match(r2.out, /^ATTENTION  enrollment: 1 of the 2 plugin\(s\) this project enables are not installed for this user \(guardrails@acme-skills\), so their hooks cannot run\./m);

  // Both installed. It says what it did not check, because an installed plugin is not a hook that ran.
  writeFileSync(recordPath, JSON.stringify({ plugins: { "workflow@acme-skills": [{ scope: "user" }], "guardrails@acme-skills": [{ scope: "user" }] } }) + "\n");
  const all = preparedRepo(join(dir, "all"), env);
  teamSettings(all, enabled);
  const r3 = cli(all, ["status"], env);
  assert.equal(r3.code, 0, r3.all);
  assert.match(r3.out, /^OK         enrollment: all 2 plugin\(s\) this project enables are installed for this user .*whether a hook then ran is a separate question this does not answer$/m);

  // A plugin the settings switch off is not one this project enables, so it is not missing.
  const off = preparedRepo(join(dir, "off"), env);
  teamSettings(off, { "workflow@acme-skills": true, "notes@acme-skills": false });
  assert.equal(checkStatus(statusJson(off, env).json, "enrollment"), "ok");

  // Unreadable is not absent: an install record that is not Claude Code's shape is NOT RUN, never a clean bill.
  writeFileSync(recordPath, "not json at all\n");
  const broken = preparedRepo(join(dir, "broken"), env);
  teamSettings(broken, enabled);
  const r4 = cli(broken, ["status"], env);
  assert.equal(r4.code, 0, r4.all);
  assert.match(r4.out, /^NOT RUN    enrollment: not evaluated: .*installed_plugins\.json is there but could not be read as Claude Code's install record/m);
}));

test("this test file holds no forbidden dash characters or home paths", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(text.includes(String.fromCharCode(0x2014)) || text.includes(String.fromCharCode(0x2013)), false);
  assert.equal(new RegExp(["/Us", "ers/[A-Za-z0-9._-]+/|/ho", "me/[A-Za-z0-9._-]+/"].join("")).test(text), false);
});

// B37: one OperationFailed for both engines, so guardCommand's catch of the lifecycle one is a catch of prepare's too.
test("OperationFailed is one class, imported by lifecycle from prepare", async () => {
  const lib = (f) => new URL(`../packs/base/plugins/workflow/runtime/lib/${f}`, import.meta.url);
  const a = await import(lib("prepare.mjs"));
  const b = await import(lib("lifecycle.mjs"));
  assert.equal(a.OperationFailed, b.OperationFailed, "two classes of the same name would let one engine's failure fall through the other's catch");
  assert.equal(new a.OperationFailed("x") instanceof b.OperationFailed, true);
});
