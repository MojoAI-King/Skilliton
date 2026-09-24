// skill-drift.test.mjs: two kinds of drift between a skill's text and what the harness does.
//
// N18 (backlog B73): the maintain skill's first step is the one command every maintenance runs, so the journal sees
// each one, and the stop hook's maintenance-due sentence names that same command. If either side changes alone, the
// skill and the reminder send a person two different ways.
//
// N15 (backlog B76): a repository that keeps its own copy of a skill under .claude/skills/ with the name of an
// installed plugin's skill gets one line in the session-start block when the two SKILL.md files differ, and nothing
// when they are the same or when there are no copies; the hook writes nothing into the project for it. The fixture is
// scripts/fixtures/skill-drift/ (its README says what each skill stands for).
//
//   node scripts/skill-drift.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { maintainReason } from "../packs/base/plugins/workflow/runtime/lib/maintain.mjs";
import { skillCopyDrift } from "../packs/base/plugins/workflow/runtime/lib/skill-drift.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "packs", "base", "plugins", "workflow");

test("the maintain skill's first step and the stop hook's maintenance sentence name the same command", () => {
  const skill = readFileSync(join(PLUGIN, "skills", "maintain", "SKILL.md"), "utf8");
  const body = skill.slice(skill.indexOf("\n---", 3) + 4);
  const firstSection = body.slice(body.indexOf("\n## "), body.indexOf("\n## ", body.indexOf("\n## ") + 1));
  assert.match(firstSection, /^\n## First step: run skilliton maintain --apply and read its output\n/, "the first section of the skill is that step");
  assert.ok(firstSection.includes("run skilliton maintain --apply and read its output."), "the step says it in those words");
  const reason = maintainReason({ why: "a merge commit landed", baseline: { kind: "maintain" } }, { command: "skilliton" });
  assert.match(reason, /Before finishing, run: skilliton maintain --apply \(/, "the stop hook names the same command");
});

// ---------------------------------------------------------------- N15

const CLI = join(REPO, "scripts", "skilliton.mjs");
const FIXTURE = join(REPO, "scripts", "fixtures", "skill-drift");
const base = mkdtempSync(join(tmpdir(), "skilliton-skill-drift-"));
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
let count = 0;

// A repository with the named copies under .claude/skills/ (committed, so any write would show in git status), and a
// Claude Code configuration folder whose one installed plugin holds the fixture's installed skills.
function fixture(copies) {
  const dir = join(base, `r${++count}`), home = join(base, `home${count}`), claude = join(base, `claude${count}`);
  const plugin = join(claude, "plugins", "cache", "acme", "tools", "1.0.0");
  for (const d of [dir, home, plugin]) mkdirSync(d, { recursive: true });
  cpSync(join(FIXTURE, "installed", "skills"), join(plugin, "skills"), { recursive: true });
  writeFileSync(join(claude, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "tools@acme": [{ scope: "user", installPath: plugin, version: "1.0.0" }] } }));
  for (const name of copies) cpSync(join(FIXTURE, "project", "claude-skills", name), join(dir, ".claude", "skills", name), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# r\n");
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: claude, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };
  for (const key of ["SKILLITON_SELF", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE"]) delete env[key];
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "first"]]) execFileSync("git", ["-C", dir, ...args], { env, stdio: "ignore" });
  return { dir, env, claude };
}
const status = (f) => execFileSync("git", ["-C", f.dir, "status", "--porcelain=v1", "-uall"], { env: f.env, encoding: "utf8" });
function sessionStart(f) {
  const r = spawnSync(process.execPath, [CLI, "hook", "session-start"], { cwd: f.dir, env: f.env, encoding: "utf8", input: JSON.stringify({ cwd: f.dir, session_id: "s1" }) });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  return r.stdout;
}
const LINE = /^- skill copy differs from the installed one: (\S+)$/gm;
const named = (out) => [...out.matchAll(LINE)].map((m) => m[1]);

test("a copy that differs from the installed skill is named at session start, and only that one", () => {
  const f = fixture(["alpha", "beta", "own"]);
  const before = status(f);
  const out = sessionStart(f);
  assert.match(out, /^\[workflow\] Project state/m, out);
  assert.deepEqual(named(out), ["alpha"], `alpha differs; beta is the same; own is no plugin's skill:\n${out}`);
  assert.equal(status(f), before, "the hook wrote nothing into the project");
  assert.deepEqual(skillCopyDrift(f.dir, { claudeDir: f.claude }), { differs: [{ name: "alpha", plugins: ["tools@acme"] }], problem: null });
});

test("a copy that is the same as the installed skill says nothing", () => {
  const f = fixture(["beta"]);
  const out = sessionStart(f);
  assert.match(out, /^\[workflow\] Project state/m, out);
  assert.deepEqual(named(out), []);
  assert.doesNotMatch(out, /skill cop/i);
});

test("a project with no skill copies says nothing, and a plugin record that does not parse is said, not taken for a match", () => {
  const f = fixture([]);
  const before = status(f);
  const out = sessionStart(f);
  assert.match(out, /^\[workflow\] Project state/m, out);
  assert.doesNotMatch(out, /skill cop/i);
  assert.equal(status(f), before);
  const g = fixture(["alpha"]);
  writeFileSync(join(g.claude, "plugins", "installed_plugins.json"), "{ not json");
  assert.match(sessionStart(g), /^- Skill copies \(not compared\): \S*installed_plugins\.json does not parse$/m);
});
