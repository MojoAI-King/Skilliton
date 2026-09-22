#!/usr/bin/env node
// Tests scripts/skilliton.mjs and scripts/scrub-check.sh --path. Everything happens in a temp folder: every child
// process gets HOME, SKILLITON_BACKUPS, and SKILLITON_DENYLIST pointing into it, so the real home directory is never
// touched by the code under test. The harness and settings templates are read from the repo, never copied.
//
//   node scripts/skilliton.test.mjs
//
// Prints ok or FAIL for each check. Exit 0: all ok. Exit 1: at least one FAIL (temp files are kept for inspection).

import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const CLI = join(here, "skilliton.mjs");
const SCRUB = join(here, "scrub-check.sh");
const START = "<!-- skilliton:harness:start v1 -->";
const END = "<!-- skilliton:harness:end -->";
const TEMPLATE = readFileSync(join(repo, "packs", "base", "plugins", "workflow", "templates", "harness.md"), "utf8");
// The template names project record files as {{key}}. These are the contract defaults (docs/CONTRACTS.md sections 2
// and 4) for a project with no .skilliton/config.json and no existing records, written out here rather than imported,
// so a change to the defaults in config.mjs has to be made on purpose in both places.
const DEFAULT_VARS = {
  status: "docs/STATUS.md", backlog: "docs/BACKLOG.md", backlogArchive: "docs/BACKLOG_ARCHIVE.md", roadmap: "docs/ROADMAP.md",
  decisions: "DECISIONS.md", lessons: "docs/LESSONS.md", handoff: "docs/HANDOFF.md", handoffArchive: "docs/HANDOFF_ARCHIVE.md",
  maintain: "docs/MAINTAIN.md", tasksDir: "docs/tasks", decisionsDir: "docs/decisions", lessonsDir: "docs/lessons", integrationBranches: "main, master",
};
function render(template, vars) {
  return template.replace(/\{\{([A-Za-z]+)\}\}/g, (_, key) => { if (!Object.hasOwn(vars, key)) throw new Error(`test: template names unknown value {{${key}}}`); return vars[key]; });
}
const RENDERED = render(TEMPLATE, DEFAULT_VARS);
const BLOCK = `${START}\n${RENDERED.endsWith("\n") ? RENDERED : RENDERED + "\n"}${END}\n`;
const SETTINGS_TEMPLATE = JSON.parse(readFileSync(join(repo, "templates", "project-settings.json"), "utf8"));
const CATALOG = JSON.parse(readFileSync(join(repo, ".claude-plugin", "marketplace.json"), "utf8"));

const tmp = mkdtempSync(join(tmpdir(), "skilliton-test-"));
const HOME = join(tmp, "home");
mkdirSync(HOME);
const DENY = join(tmp, "denylist");
const DENIED = "qzxvexamplename"; // a made-up token standing in for a name that must never ship
writeFileSync(DENY, `# test denylist\n${DENIED}\n`);

const baseEnv = { ...process.env, HOME, SKILLITON_BACKUPS: join(tmp, "backups-unused"), SKILLITON_DENYLIST: DENY };
delete baseEnv.SKILLITON_DEBUG;
delete baseEnv.CLAUDE_CONFIG_DIR;

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: tmp, env: { ...baseEnv, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, all: `${r.stdout}${r.stderr}` };
}
function scrub(args, env = {}) {
  const r = spawnSync("bash", [SCRUB, ...args], { cwd: tmp, env: { ...baseEnv, ...env }, encoding: "utf8" });
  return { code: r.status, all: `${r.stdout}${r.stderr}` };
}

let fails = 0, passes = 0;
function check(name, condition, detail = "") {
  if (condition) { passes++; console.log(`ok   ${name}`); return; }
  fails++;
  console.log(`FAIL ${name}`);
  if (detail) console.log(String(detail).trimEnd().split("\n").map((l) => `       | ${l}`).join("\n"));
}
const section = (title) => console.log(`\n== ${title}`);
const bytes = (p) => readFileSync(p);
const sameBytes = (a, b) => Buffer.compare(a, b) === 0;
const folder = (...parts) => { const d = join(tmp, ...parts); mkdirSync(d, { recursive: true }); return d; };
const noStackTrace = (text) => !/\n\s+at .+:\d+:\d+\)?\n/.test(text) && !/unexpected internal error/.test(text);
// Every file under a folder with its size and modification time: equal snapshots mean nothing was written.
function snapshot(dir) {
  if (!existsSync(dir)) return "(absent)";
  return readdirSync(dir, { recursive: true }).sort().map((rel) => {
    const st = statSync(join(dir, rel));
    return st.isDirectory() ? `${rel}/` : `${rel} ${st.size} ${st.mtimeMs}`;
  }).join("\n");
}
const backupsOf = (root, command) => (existsSync(join(root, command)) ? readdirSync(join(root, command)).sort() : []);

// ---------------------------------------------------------------- command line
section("command line basics");
{
  const help = cli(["--help"]);
  const commands = ["doctor", "harness", "company", "new-plugin", "project-settings", "new-skill", "import"];
  check("--help exits 0 and lists each command on its own line", help.code === 0 && commands.every((c) => new RegExp(`^  ${c} +\\S`, "m").test(help.out)), help.out);
  const unknown = cli(["frobnicate"]);
  check("an unknown command is refused with exit 2", unknown.code === 2 && /unknown command "frobnicate"/.test(unknown.all), unknown.all);
  const inherited = cli(["toString"]);
  check("a command named like a built-in object property is refused, not crashed (regression)", inherited.code === 2 && /unknown command "toString"/.test(inherited.all), inherited.all);
  const emptyValue = cli(["harness", "--dir="]);
  check("an option with an empty value is refused instead of meaning the current folder (regression)", emptyValue.code === 2 && /--dir needs a value/.test(emptyValue.all), emptyValue.all);
  const badOption = cli(["harness", "--force"]);
  check("an unknown option is refused with exit 2", badOption.code === 2 && /unknown option --force/.test(badOption.all), badOption.all);
}

// ---------------------------------------------------------------- harness
section("harness: show writes nothing");
{
  const p = folder("h-show");
  const backups = join(tmp, "b-show");
  const original = Buffer.from("# My project\n\nKeep this line.\n");
  writeFileSync(join(p, "CLAUDE.md"), original);
  const r = cli(["harness", "--dir", p], { SKILLITON_BACKUPS: backups });
  check("show exits 0", r.code === 0, r.all);
  check("show prints the unified change, with the markers being added", r.out.includes(`+${START}`) && r.out.includes(`+${END}`) && r.out.includes("--- a/CLAUDE.md"), r.out);
  check("show leaves CLAUDE.md byte-identical", sameBytes(bytes(join(p, "CLAUDE.md")), original));
  check("show does not create AGENTS.md", !existsSync(join(p, "AGENTS.md")));
  check("show makes no backup", !existsSync(backups));
  check("show adds nothing to the project folder", snapshot(p).split("\n").length === 1);
}

section("harness: apply creates a missing file containing only the block");
{
  const p = folder("h-new");
  const backups = join(tmp, "b-new");
  const r = cli(["harness", "--apply", "--file", "AGENTS.md", "--dir", p], { SKILLITON_BACKUPS: backups });
  check("apply exits 0", r.code === 0, r.all);
  check("AGENTS.md holds exactly start marker + template + end marker", existsSync(join(p, "AGENTS.md")) && readFileSync(join(p, "AGENTS.md"), "utf8") === BLOCK);
  check("--file AGENTS.md leaves CLAUDE.md uncreated", !existsSync(join(p, "CLAUDE.md")));
  check("nothing to back up for a new file, so no backup", !existsSync(backups));
}

section("harness: apply keeps every byte outside the markers");
const keep = {};
{
  const p = folder("h-keep");
  const backups = join(tmp, "b-keep");
  // Awkward bytes on purpose: trailing spaces, a tab, a CRLF line, non-ASCII text, and bytes that are not valid UTF-8.
  const before = Buffer.concat([
    Buffer.from("# Team rules\nTrailing spaces   \n\tTabbed line\nA windows line\r\ncaf\u00e9 \u4e2d\u6587\n"),
    Buffer.from([0xff, 0xfe, 0x0a]),
    Buffer.from("\n"),
  ]);
  const oldBlock = Buffer.from(`${START}\nold instructions that must be replaced\n${END}\n`);
  const after = Buffer.from("\nText after the block.\nlast line has no newline");
  const original = Buffer.concat([before, oldBlock, after]);
  writeFileSync(join(p, "CLAUDE.md"), original);
  const r = cli(["harness", "--apply", "--file", "CLAUDE.md", "--dir", p], { SKILLITON_BACKUPS: backups });
  const got = bytes(join(p, "CLAUDE.md"));
  check("replace exits 0", r.code === 0, r.all);
  check("bytes before the start marker are identical", sameBytes(got.subarray(0, before.length), before));
  check("bytes after the end marker are identical", got.length >= after.length && sameBytes(got.subarray(got.length - after.length), after));
  check("between them sits exactly the rendered template", sameBytes(got.subarray(before.length, got.length - after.length), Buffer.from(BLOCK)), got.toString("utf8"));
  const stamps = backupsOf(backups, "harness");
  check("one backup was made, holding the original bytes", stamps.length === 1 && sameBytes(bytes(join(backups, "harness", stamps[0], "CLAUDE.md")), original));

  const p2 = folder("h-append");
  const original2 = Buffer.from("# Notes\n\nUser text stays exactly as written.\n");
  writeFileSync(join(p2, "CLAUDE.md"), original2);
  const r2 = cli(["harness", "--apply", "--file", "CLAUDE.md", "--dir", p2], { SKILLITON_BACKUPS: backups });
  check("append exits 0", r2.code === 0, r2.all);
  check("append result is the original bytes, one blank line, then the block", sameBytes(bytes(join(p2, "CLAUDE.md")), Buffer.concat([original2, Buffer.from("\n" + BLOCK)])));
  Object.assign(keep, { p, p2, before, after, original2, backups, firstApply: got, firstApply2: bytes(join(p2, "CLAUDE.md")) });
}

section("harness: a second apply is byte-identical");
{
  const stampsBefore = backupsOf(keep.backups, "harness").length;
  const r = cli(["harness", "--apply", "--file", "CLAUDE.md", "--dir", keep.p], { SKILLITON_BACKUPS: keep.backups });
  const r2 = cli(["harness", "--apply", "--file", "CLAUDE.md", "--dir", keep.p2], { SKILLITON_BACKUPS: keep.backups });
  check("second apply exits 0 for both files", r.code === 0 && r2.code === 0, r.all + r2.all);
  check("replaced file is byte-identical after the second apply", sameBytes(bytes(join(keep.p, "CLAUDE.md")), keep.firstApply));
  check("appended file is byte-identical after the second apply", sameBytes(bytes(join(keep.p2, "CLAUDE.md")), keep.firstApply2));
  check("second apply reports the block is already current", r.out.includes("already current") && r2.out.includes("already current"), r.out);
  check("second apply makes no new backup", backupsOf(keep.backups, "harness").length === stampsBefore);
}

section("harness: undo removes exactly the block");
{
  const backups = join(tmp, "b-undo");
  const beforeUndo = bytes(join(keep.p2, "CLAUDE.md"));
  const r = cli(["harness", "--undo", "--file", "CLAUDE.md", "--dir", keep.p2], { SKILLITON_BACKUPS: backups });
  check("undo exits 0", r.code === 0, r.all);
  check("undo after an append restores the original file byte for byte", sameBytes(bytes(join(keep.p2, "CLAUDE.md")), keep.original2), bytes(join(keep.p2, "CLAUDE.md")).toString("utf8"));
  const stamps = backupsOf(backups, "harness");
  check("undo backed up the file as it was just before the undo", stamps.length === 1 && sameBytes(bytes(join(backups, "harness", stamps[0], "CLAUDE.md")), beforeUndo));

  const r2 = cli(["harness", "--undo", "--file", "CLAUDE.md", "--dir", keep.p], { SKILLITON_BACKUPS: backups });
  const expected = Buffer.concat([keep.before.subarray(0, keep.before.length - 1), keep.after]);
  check("undo in the middle of a file removes the block and one blank line, and nothing else", r2.code === 0 && sameBytes(bytes(join(keep.p, "CLAUDE.md")), expected), r2.all);

  const r3 = cli(["harness", "--undo", "--file", "CLAUDE.md", "--dir", keep.p], { SKILLITON_BACKUPS: backups });
  check("a second undo finds nothing to remove and changes nothing", r3.code === 0 && r3.out.includes("nothing to remove") && sameBytes(bytes(join(keep.p, "CLAUDE.md")), expected), r3.all);

  const p3 = folder("h-top");
  writeFileSync(join(p3, "CLAUDE.md"), `${BLOCK}\nMy own notes\n`);
  const r4 = cli(["harness", "--undo", "--file", "CLAUDE.md", "--dir", p3], { SKILLITON_BACKUPS: backups });
  check("undo of a block at the top also removes the blank line after it", r4.code === 0 && readFileSync(join(p3, "CLAUDE.md"), "utf8") === "My own notes\n", r4.all);
}

section("harness: the block names this project's own record files");
{
  const backups = join(tmp, "b-vars");
  const p = folder("h-vars-config");
  mkdirSync(join(p, ".skilliton"));
  writeFileSync(join(p, ".skilliton", "config.json"), JSON.stringify({ prepare: { artifacts: { handoff: "notes/HANDOFF.md" } }, handoff: { file: "notes/HANDOFF.md" } }));
  const r = cli(["harness", "--apply", "--file", "CLAUDE.md", "--dir", p], { SKILLITON_BACKUPS: backups });
  const got = existsSync(join(p, "CLAUDE.md")) ? readFileSync(join(p, "CLAUDE.md"), "utf8") : "";
  check("a configured handoff path is rendered into the block", r.code === 0 && got.includes("`notes/HANDOFF.md`") && !got.includes("docs/HANDOFF.md"), r.all);
  check("positive control: the default rendering names docs/HANDOFF.md", BLOCK.includes("`docs/HANDOFF.md`"));

  const d = cli(["doctor", "--dir", p], { SKILLITON_BACKUPS: backups });
  check("doctor calls the configured rendering current", /^OK +CLAUDE\.md: harness block present and matches the current template/m.test(d.out), d.out);
  writeFileSync(join(p, "CLAUDE.md"), BLOCK);
  const d2 = cli(["doctor", "--dir", p], { SKILLITON_BACKUPS: backups });
  check("doctor flags a default rendering in a project whose handoff lives elsewhere", /^WARN +CLAUDE\.md: harness block differs from the current template/m.test(d2.out), d2.out);

  const q = folder("h-vars-adopt");
  writeFileSync(join(q, "HANDOFF.md"), "# Handoff\n");
  const r2 = cli(["harness", "--apply", "--file", "AGENTS.md", "--dir", q], { SKILLITON_BACKUPS: backups });
  const got2 = existsSync(join(q, "AGENTS.md")) ? readFileSync(join(q, "AGENTS.md"), "utf8") : "";
  check("an existing root HANDOFF.md is adopted by the rendering", r2.code === 0 && got2.includes("handoff `HANDOFF.md`"), r2.all);

  const bad = folder("h-vars-badconfig");
  mkdirSync(join(bad, ".skilliton"));
  writeFileSync(join(bad, ".skilliton", "config.json"), JSON.stringify({ prepare: { artifacts: { handoff: "../outside.md" } } }));
  const r3 = cli(["harness", "--apply", "--dir", bad], { SKILLITON_BACKUPS: backups });
  check("an unusable project configuration refuses with exit 2 and writes nothing", r3.code === 2 && /configuration cannot be used/.test(r3.all) && !existsSync(join(bad, "CLAUDE.md")) && !existsSync(join(bad, "AGENTS.md")), r3.all);

  const custom = join(tmp, "custom-template.md");
  writeFileSync(custom, "## Rules\n\nRead {{nope}} first.\n");
  const e = folder("h-vars-unknown");
  const r4 = cli(["harness", "--apply", "--dir", e, "--template", custom], { SKILLITON_BACKUPS: backups });
  check("a template naming an unknown value refuses with exit 2 and writes nothing", r4.code === 2 && r4.all.includes("{{nope}}") && !existsSync(join(e, "CLAUDE.md")), r4.all);
}

section("harness: malformed markers are refused with exit 2, and nothing is written");
{
  const cases = [
    ["two start markers", `${START}\na\n${END}\n${START}\nb\n${END}\n`, /more than one harness start marker \(lines 1, 4\)/],
    ["an end without a start", `intro\n${END}\n`, /end marker \(line 2\) without a start marker/],
    ["a start without an end", `intro\n${START}\nno end here\n`, /start marker \(line 2\) without an end marker/],
    ["an end before the start", `${END}\nx\n${START}\n`, /end marker \(line 1\) before its start marker \(line 3\)/],
    ["a marker line with extra text", `${START} extra words\nx\n${END}\n`, /line 1 starts like a harness start marker but is not exactly/],
  ];
  for (const [label, content, reason] of cases) {
    const p = folder("h-bad", label.replace(/\W+/g, "-"));
    const backups = join(tmp, "b-bad");
    writeFileSync(join(p, "CLAUDE.md"), content);
    for (const mode of ["--apply", "--undo"]) {
      const r = cli(["harness", mode, "--dir", p], { SKILLITON_BACKUPS: backups });
      check(`${label}: ${mode} exits 2 and names the reason`, r.code === 2 && reason.test(r.all), r.all);
    }
    check(`${label}: CLAUDE.md unchanged`, readFileSync(join(p, "CLAUDE.md"), "utf8") === content);
    check(`${label}: AGENTS.md not created (a refusal in one file stops both)`, !existsSync(join(p, "AGENTS.md")));
    check(`${label}: no backup made`, !existsSync(backups));
  }
}

// ---------------------------------------------------------------- team settings template pins
section("team settings template: the keys a team relies on are pinned");
{
  // The window is owner-chosen (decision 2026-09-18, the team compaction window is 600000), unmeasured, inside the
  // documented range 100000 to 1000000; the two output caps are the documented defaults (settings reference retrieved
  // 2026-09-18: both keys need 2.1.261 or later and are clamped to 4000 to 128000).
  check("autoCompactWindow is 600000", SETTINGS_TEMPLATE.autoCompactWindow === 600000, String(SETTINGS_TEMPLATE.autoCompactWindow));
  check("autoCompactWindow is inside the documented range", SETTINGS_TEMPLATE.autoCompactWindow >= 100000 && SETTINGS_TEMPLATE.autoCompactWindow <= 1000000);
  check("bashOutputMaxChars is 30000, the documented default", SETTINGS_TEMPLATE.bashOutputMaxChars === 30000, String(SETTINGS_TEMPLATE.bashOutputMaxChars));
  check("taskOutputMaxChars is 32000, the documented default", SETTINGS_TEMPLATE.taskOutputMaxChars === 32000, String(SETTINGS_TEMPLATE.taskOutputMaxChars));
  check("both caps are inside the documented clamp range", [SETTINGS_TEMPLATE.bashOutputMaxChars, SETTINGS_TEMPLATE.taskOutputMaxChars].every((v) => v >= 4000 && v <= 128000));
  check("the template carries only the keys docs/CONTRACTS.md section 5 names", JSON.stringify(Object.keys(SETTINGS_TEMPLATE).sort()) === JSON.stringify(["autoCompactWindow", "bashOutputMaxChars", "enabledPlugins", "extraKnownMarketplaces", "taskOutputMaxChars"]), Object.keys(SETTINGS_TEMPLATE).join(","));
  const dir = folder("ps-pins");
  const r = cli(["project-settings", "--apply", "--dir", dir], { SKILLITON_BACKUPS: join(tmp, "b-pins") });
  const got = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
  check("apply writes the window and both caps into a fresh project", r.code === 0 && got.autoCompactWindow === 600000 && got.bashOutputMaxChars === 30000 && got.taskOutputMaxChars === 32000, r.all);
}

// ---------------------------------------------------------------- project-settings
section("project-settings: merge into an existing file");
{
  const p = folder("ps-merge", ".claude");
  const dir = dirname(p);
  const file = join(p, "settings.json");
  const backups = join(tmp, "b-ps");
  const existing = {
    permissions: { allow: ["Bash(ls:*)"] },
    model: "some-model",
    extraKnownMarketplaces: { other: { source: { source: "github", repo: "someone/other-skills" } } },
    enabledPlugins: { "tool@other": true, "workflow@skilliton": false },
  };
  const original = Buffer.from(JSON.stringify(existing, null, 4) + "\n");
  writeFileSync(file, original);

  const show = cli(["project-settings", "--dir", dir], { SKILLITON_BACKUPS: backups });
  check("show exits 0 and prints the resulting file", show.code === 0 && show.out.includes("Resulting .claude/settings.json:"), show.all);
  check("show leaves the file byte-identical and makes no backup", sameBytes(bytes(file), original) && !existsSync(backups));

  const r = cli(["project-settings", "--apply", "--dir", dir], { SKILLITON_BACKUPS: backups });
  const got = JSON.parse(readFileSync(file, "utf8"));
  check("apply exits 0", r.code === 0, r.all);
  check("other top-level keys are kept", JSON.stringify(got.permissions) === JSON.stringify(existing.permissions) && got.model === "some-model");
  check("an existing marketplace is kept unchanged", JSON.stringify(got.extraKnownMarketplaces.other) === JSON.stringify(existing.extraKnownMarketplaces.other));
  check("an existing plugin entry is kept", got.enabledPlugins["tool@other"] === true);
  for (const [name, entry] of Object.entries(SETTINGS_TEMPLATE.extraKnownMarketplaces)) {
    check(`template marketplace ${name} is added as the template declares it`, JSON.stringify(got.extraKnownMarketplaces[name]) === JSON.stringify(entry));
  }
  for (const [id, on] of Object.entries(SETTINGS_TEMPLATE.enabledPlugins)) check(`template plugin ${id} is set to ${on}`, got.enabledPlugins[id] === on);
  check("a value the template overrides is listed before it is written", r.out.includes('change enabledPlugins["workflow@skilliton"]: false -> true'), r.out);
  const stamps = backupsOf(backups, "project-settings");
  check("the original file was backed up byte for byte", stamps.length === 1 && sameBytes(bytes(join(backups, "project-settings", stamps[0], "settings.json")), original));

  const afterFirst = bytes(file);
  const again = cli(["project-settings", "--apply", "--dir", dir], { SKILLITON_BACKUPS: backups });
  check("a second apply changes nothing and says so", again.code === 0 && again.out.includes("nothing to change") && sameBytes(bytes(file), afterFirst), again.all);
}

section("project-settings: a fork's marketplace name and repo");
{
  const dir = folder("ps-fork");
  const [originalName] = Object.keys(SETTINGS_TEMPLATE.extraKnownMarketplaces);
  const r = cli(["project-settings", "--apply", "--dir", dir, "--marketplace-name", "acme-skills", "--marketplace-repo", "acme/skills"], { SKILLITON_BACKUPS: join(tmp, "b-fork") });
  check("apply with a new name and repo exits 0", r.code === 0, r.all);
  const got = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8"));
  const wantIds = Object.keys(SETTINGS_TEMPLATE.enabledPlugins).map((id) => id.replace(new RegExp(`@${originalName}$`), "@acme-skills")).sort();
  check("every enabled plugin now ends in @acme-skills", JSON.stringify(Object.keys(got.enabledPlugins).sort()) === JSON.stringify(wantIds), JSON.stringify(got.enabledPlugins));
  check(`no key still ends in @${originalName}`, !Object.keys(got.enabledPlugins).some((id) => id.endsWith(`@${originalName}`)));
  check("the marketplace is renamed and points at the fork's repo", !(originalName in got.extraKnownMarketplaces) && got.extraKnownMarketplaces["acme-skills"]?.source?.repo === "acme/skills");
  check("auto-update stays as the template sets it", got.extraKnownMarketplaces["acme-skills"]?.autoUpdate === SETTINGS_TEMPLATE.extraKnownMarketplaces[originalName].autoUpdate);

  const bad = cli(["project-settings", "--dir", dir, "--marketplace-name", "Acme Skills"]);
  check("a marketplace name with capitals and a space is refused with the rule", bad.code === 2 && /lowercase letters, digits, and hyphens/.test(bad.all), bad.all);
}

section("project-settings: a marketplace source is replaced whole, never mixed");
{
  const [name] = Object.keys(SETTINGS_TEMPLATE.extraKnownMarketplaces);
  const p = folder("ps-source", ".claude");
  writeFileSync(join(p, "settings.json"), JSON.stringify({ extraKnownMarketplaces: { [name]: { source: { source: "directory", path: "/tmp/local-checkout" } } } }));
  const r = cli(["project-settings", "--apply", "--dir", dirname(p)], { SKILLITON_BACKUPS: join(tmp, "b-source") });
  const got = JSON.parse(readFileSync(join(p, "settings.json"), "utf8"));
  check("the old source's extra keys do not survive into the new source", r.code === 0 && JSON.stringify(got.extraKnownMarketplaces[name].source) === JSON.stringify(SETTINGS_TEMPLATE.extraKnownMarketplaces[name].source), JSON.stringify(got));
}

section("project-settings: invalid JSON is refused");
{
  const p = folder("ps-invalid", ".claude");
  const backups = join(tmp, "b-invalid");
  const content = '{ "model": "x", }\n';
  writeFileSync(join(p, "settings.json"), content);
  const r = cli(["project-settings", "--apply", "--dir", dirname(p)], { SKILLITON_BACKUPS: backups });
  check("exit 2 with the reason", r.code === 2 && /is not valid JSON, so it was left untouched/.test(r.all), r.all);
  check("the file is untouched and nothing was backed up", readFileSync(join(p, "settings.json"), "utf8") === content && !existsSync(backups));
}

// ---------------------------------------------------------------- new-skill
const PLUGIN_JSON = '{\n  "name": "workflow",\n  "description": "test plugin",\n  "version": "0.1.0",\n  "author": { "name": "MojoAI" }\n}\n';
function skillsRepo(name) {
  const root = folder(name);
  mkdirSync(join(root, "packs", "base", "plugins", "workflow", ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, "packs", "base", "plugins", "workflow", ".claude-plugin", "plugin.json"), PLUGIN_JSON);
  return root;
}
const versionIn = (root, pack = "base") => JSON.parse(readFileSync(join(root, "packs", pack, "plugins", "workflow", ".claude-plugin", "plugin.json"), "utf8")).version;

section("new-skill");
{
  const root = skillsRepo("repo-new");
  const backups = join(tmp, "b-new-skill");
  const skill = join(root, "packs", "base", "plugins", "workflow", "skills", "release-notes", "SKILL.md");
  const description = "Write release notes from merged work. Use when someone asks for release notes.";

  const before = snapshot(root);
  const preview = cli(["new-skill", "workflow", "release-notes", "--repo", root, "--description", description], { SKILLITON_BACKUPS: backups });
  check("preview exits 0 and names the file it would create", preview.code === 0 && preview.out.includes(`will create packs/base/plugins/workflow/skills/release-notes/SKILL.md`), preview.all);
  check("preview shows the SKILL.md it would write and the version bump", preview.out.includes(`name: release-notes`) && preview.out.includes(`description: ${description}`) && preview.out.includes("will bump") && preview.out.includes("0.1.0 -> 0.1.1"), preview.all);
  check("preview says to add --apply", /Next: run the same command with --apply/.test(preview.out), preview.all);
  check("preview writes nothing and makes no backup", snapshot(root) === before && !existsSync(backups));

  const r = cli(["new-skill", "workflow", "release-notes", "--repo", root, "--description", description, "--apply"], { SKILLITON_BACKUPS: backups });
  check("new-skill --apply exits 0", r.code === 0, r.all);
  const text = existsSync(skill) ? readFileSync(skill, "utf8") : "";
  check("SKILL.md starts with frontmatter holding name and description", text.startsWith(`---\nname: release-notes\ndescription: ${description}\n---\n`), text);
  check("SKILL.md has the body skeleton", ["## When to use", "## Steps", "## What done looks like"].every((h) => text.includes(h)), text);
  check("plugin version bumped 0.1.0 -> 0.1.1", versionIn(root) === "0.1.1");
  check("plugin.json changed only in its version", readFileSync(join(root, "packs", "base", "plugins", "workflow", ".claude-plugin", "plugin.json"), "utf8") === PLUGIN_JSON.replace("0.1.0", "0.1.1"));
  const stamps = backupsOf(backups, "new-skill");
  check("plugin.json was backed up before the bump", stamps.length === 1 && readFileSync(join(backups, "new-skill", stamps[0], "plugin.json"), "utf8") === PLUGIN_JSON);

  const dup = cli(["new-skill", "workflow", "release-notes", "--repo", root], { SKILLITON_BACKUPS: backups });
  check("a duplicate skill is refused with exit 2", dup.code === 2 && /release-notes already exists; nothing was changed/.test(dup.all), dup.all);
  check("the refused duplicate did not bump the version again", versionIn(root) === "0.1.1");

  const badName = cli(["new-skill", "workflow", "Release_Notes", "--repo", root], { SKILLITON_BACKUPS: backups });
  check("a bad skill name is refused with exit 2 and the naming rule", badName.code === 2 && /lowercase letters, digits, and hyphens/.test(badName.all), badName.all);
  check("the bad name created nothing and bumped nothing", !existsSync(join(root, "packs", "base", "plugins", "workflow", "skills", "Release_Notes")) && versionIn(root) === "0.1.1");

  const todo = cli(["new-skill", "workflow", "draft-skill", "--repo", root, "--apply"], { SKILLITON_BACKUPS: backups });
  const todoText = readFileSync(join(root, "packs", "base", "plugins", "workflow", "skills", "draft-skill", "SKILL.md"), "utf8");
  check("without --description the description is a marked TODO placeholder", todo.code === 0 && /^description: TODO\(skilliton\) /m.test(todoText), todo.all + todoText);

  const quoted = cli(["new-skill", "workflow", "quoted-skill", "--repo", root, "--description", "Use when: the text has a colon", "--apply"], { SKILLITON_BACKUPS: backups });
  const quotedText = readFileSync(join(root, "packs", "base", "plugins", "workflow", "skills", "quoted-skill", "SKILL.md"), "utf8");
  check("a description that YAML would misread is quoted", quoted.code === 0 && quotedText.includes('description: "Use when: the text has a colon"'), quotedText);
  const boolish = cli(["new-skill", "workflow", "boolish-skill", "--repo", root, "--description", "true", "--apply"], { SKILLITON_BACKUPS: backups });
  const boolishText = readFileSync(join(root, "packs", "base", "plugins", "workflow", "skills", "boolish-skill", "SKILL.md"), "utf8");
  check("a description YAML would read as a boolean stays text (regression)", boolish.code === 0 && boolishText.includes('description: "true"'), boolishText);
  check("each created skill bumped the version once (0.1.4 after four)", versionIn(root) === "0.1.4");

  const missing = cli(["new-skill", "nope", "x", "--repo", root]);
  check("an unknown plugin is refused and the existing plugins are named", missing.code === 2 && /no plugin "nope"/.test(missing.all) && /workflow \(pack base\)/.test(missing.all), missing.all);

  mkdirSync(join(root, "packs", "acme", "plugins", "workflow", ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, "packs", "acme", "plugins", "workflow", ".claude-plugin", "plugin.json"), PLUGIN_JSON);
  const ambiguous = cli(["new-skill", "workflow", "other-skill", "--repo", root]);
  check("a plugin name in two packs is refused, asking for --pack", ambiguous.code === 2 && /more than one pack \(acme, base\); add --pack/.test(ambiguous.all), ambiguous.all);
  const chosen = cli(["new-skill", "workflow", "other-skill", "--repo", root, "--pack", "acme", "--apply"], { SKILLITON_BACKUPS: backups });
  check("--pack picks the plugin", chosen.code === 0 && versionIn(root, "acme") === "0.1.1" && versionIn(root) === "0.1.4", chosen.all);
}

// ---------------------------------------------------------------- company init and new-plugin
// A fork fixture: this repository's packs, catalog and team template, copied, so the commands meet the real files.
function forkRepo(name) {
  const root = folder(name);
  for (const part of ["packs", ".claude-plugin", "templates"]) cpSync(join(repo, part), join(root, part), { recursive: true });
  return root;
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const INIT = ["company", "init", "--name", "acme", "--marketplace-repo", "acme/skills", "--marketplace-name", "acme-skills"];

section("company init: preview, apply, repeat");
{
  const root = forkRepo("fork-init");
  const backups = join(tmp, "b-company");
  const before = snapshot(root);
  const catalogPath = join(root, ".claude-plugin", "marketplace.json");
  const templatePath = join(root, "templates", "project-settings.json");
  const catalogBytes = bytes(catalogPath), templateBytes = bytes(templatePath);
  const preview = cli([...INIT, "--repo", root], { SKILLITON_BACKUPS: backups });
  check("preview exits 0 and shows both files changing", preview.code === 0 && preview.out.includes("+  \"name\": \"acme-skills\",") && preview.out.includes("+        \"repo\": \"acme/skills\""), preview.all);
  check("preview writes nothing and makes no backup", snapshot(root) === before && !existsSync(backups));

  const r = cli([...INIT, "--repo", root, "--apply"], { SKILLITON_BACKUPS: backups });
  check("apply exits 0", r.code === 0, r.all);
  const catalog = readJson(catalogPath), template = readJson(templatePath);
  check("the catalog is named acme-skills and owned by acme", catalog.name === "acme-skills" && catalog.owner?.name === "acme" && catalog.owner?.url === "https://github.com/acme");
  check("the catalog's plugin entries are unchanged", JSON.stringify(catalog.plugins) === JSON.stringify(CATALOG.plugins));
  check("the template names acme-skills at acme/skills and enables every base plugin under it",
    Object.keys(template.extraKnownMarketplaces).join() === "acme-skills" && template.extraKnownMarketplaces["acme-skills"].source.repo === "acme/skills"
    && Object.keys(template.enabledPlugins).sort().join() === Object.keys(SETTINGS_TEMPLATE.enabledPlugins).map((id) => id.replace(/@skilliton$/, "@acme-skills")).sort().join(), JSON.stringify(template));
  const stamps = backupsOf(backups, "company-init");
  check("both files were backed up byte for byte", stamps.length === 1 && sameBytes(bytes(join(backups, "company-init", stamps[0], "marketplace.json")), catalogBytes) && sameBytes(bytes(join(backups, "company-init", stamps[0], "project-settings.json")), templateBytes));
  check("apply names the next commands and the trust command developers run", /new-plugin <plugin> --pack acme --apply/.test(r.out) && /trust add --company acme/.test(r.out), r.out);

  const after = snapshot(root);
  const again = cli([...INIT, "--repo", root, "--apply"], { SKILLITON_BACKUPS: backups });
  check("repeating it changes nothing and says so", again.code === 0 && /nothing to change, nothing written/.test(again.out) && snapshot(root) === after && backupsOf(backups, "company-init").length === 1, again.all);
}

section("company init: refusals");
{
  const root = forkRepo("fork-refuse");
  const before = snapshot(root);
  const noRepo = cli(["company", "init", "--name", "acme", "--repo", root]);
  check("without --marketplace-repo it is refused, naming the upstream risk", noRepo.code === 2 && /projects would keep installing the upstream plugins/.test(noRepo.all), noRepo.all);
  const badRepo = cli(["company", "init", "--name", "acme", "--marketplace-repo", "https://example.com/acme.git", "--repo", root]);
  check("a repository that is not owner/repo is refused", badRepo.code === 2 && /must look like owner\/repo/.test(badRepo.all), badRepo.all);
  const badName = cli(["company", "init", "--name", "Acme Corp", "--marketplace-repo", "acme/skills", "--repo", root]);
  check("a company name outside the naming rule is refused", badName.code === 2 && /lowercase letters, digits, and hyphens/.test(badName.all), badName.all);
  const noVerb = cli(["company", "--repo", root]);
  check("company without init is refused with the command to use", noVerb.code === 2 && /company init/.test(noVerb.all), noVerb.all);
  check("no refusal wrote anything", snapshot(root) === before);
  const catalogPath = join(root, ".claude-plugin", "marketplace.json");
  writeFileSync(catalogPath, JSON.stringify(readJson(catalogPath)) + "\n");
  const squeezed = snapshot(root);
  const layout = cli([...INIT, "--repo", root, "--apply"]);
  check("a catalog in another JSON layout is refused, not reformatted", layout.code === 2 && /not laid out the way this command writes JSON/.test(layout.all) && snapshot(root) === squeezed, layout.all);
}

section("new-plugin: a company plugin a fresh fork can add skills to");
{
  const root = forkRepo("fork-plugin");
  const backups = join(tmp, "b-new-plugin");
  check("a fork set up with company init", cli([...INIT, "--repo", root, "--apply"], { SKILLITON_BACKUPS: backups }).code === 0);
  const missing = cli(["new-skill", "acme-review", "billing-check", "--pack", "acme", "--repo", root]);
  check("new-skill into a plugin that does not exist yet names new-plugin", missing.code === 2 && /To create it: .* new-plugin acme-review --pack acme --apply/.test(missing.all), missing.all);

  const before = snapshot(root);
  const preview = cli(["new-plugin", "acme-review", "--pack", "acme", "--description", "Company review rules.", "--repo", root], { SKILLITON_BACKUPS: backups });
  check("preview exits 0, shows the manifest and notes the private license", preview.code === 0 && preview.out.includes('"name": "acme-review"') && /UNLICENSED, which marks a private plugin/.test(preview.out), preview.all);
  check("preview writes nothing", snapshot(root) === before);

  const r = cli(["new-plugin", "acme-review", "--pack", "acme", "--description", "Company review rules.", "--repo", root, "--apply"], { SKILLITON_BACKUPS: backups });
  check("apply exits 0", r.code === 0, r.all);
  const manifest = readJson(join(root, "packs", "acme", "plugins", "acme-review", ".claude-plugin", "plugin.json"));
  check("plugin.json has name, description, version 0.1.0, the catalog owner, the fork's repository and a license",
    manifest.name === "acme-review" && manifest.description === "Company review rules." && manifest.version === "0.1.0" && manifest.author?.name === "acme"
    && manifest.repository === "https://github.com/acme/skills" && manifest.license === "UNLICENSED", JSON.stringify(manifest));
  const catalog = readJson(join(root, ".claude-plugin", "marketplace.json"));
  check("the catalog lists the plugin at its folder, after the base plugins", catalog.plugins.length === CATALOG.plugins.length + 1 && catalog.plugins.at(-1).name === "acme-review" && catalog.plugins.at(-1).source === "./packs/acme/plugins/acme-review");
  check("the team template enables acme-review@acme-skills", readJson(join(root, "templates", "project-settings.json")).enabledPlugins["acme-review@acme-skills"] === true);
  check("the catalog and template were backed up", backupsOf(backups, "new-plugin").length === 1);

  const skill = cli(["new-skill", "acme-review", "billing-check", "--pack", "acme", "--repo", root, "--description", "Use when a change touches billing.", "--apply"], { SKILLITON_BACKUPS: backups });
  check("new-skill --pack acme now works and bumps the new plugin to 0.1.1", skill.code === 0 && readJson(join(root, "packs", "acme", "plugins", "acme-review", ".claude-plugin", "plugin.json")).version === "0.1.1", skill.all);
  const packs = spawnSync(process.execPath, [join(here, "packs.test.mjs"), "--root", root], { encoding: "utf8" });
  check("the packaging checks pass on the fork the two commands made", packs.status === 0, `${packs.stdout}${packs.stderr}`);

  const settled = snapshot(root);
  const taken = cli(["new-plugin", "workflow", "--pack", "acme", "--repo", root, "--apply"]);
  check("a name another pack already uses is refused", taken.code === 2 && /already exists \(packs\/base\/plugins\/workflow\)/.test(taken.all), taken.all);
  const noPack = cli(["new-plugin", "acme-other", "--repo", root, "--apply"]);
  check("a plugin without --pack is refused", noPack.code === 2 && /needs --pack/.test(noPack.all), noPack.all);
  const badLicense = cli(["new-plugin", "acme-other", "--pack", "acme", "--license", "MIT OR other", "--repo", root, "--apply"]);
  check("a license that is not an identifier is refused", badLicense.code === 2 && /not a license identifier/.test(badLicense.all), badLicense.all);
  check("no refusal wrote anything", snapshot(root) === settled);
}

section("new-plugin: the catalog and template must name the same marketplace");
{
  const root = forkRepo("fork-mismatch");
  const catalogPath = join(root, ".claude-plugin", "marketplace.json");
  writeFileSync(catalogPath, JSON.stringify({ ...readJson(catalogPath), name: "acme-skills" }, null, 2) + "\n");
  const before = snapshot(root);
  const r = cli(["new-plugin", "acme-review", "--pack", "acme", "--repo", root, "--apply"]);
  check("a catalog renamed by hand without the template is refused, pointing at company init", r.code === 2 && /names the marketplace "acme-skills", but templates\/project-settings.json names "skilliton"/.test(r.all) && /company init/.test(r.all), r.all);
  check("nothing was written", snapshot(root) === before);
}

// ---------------------------------------------------------------- import
section("import: a clean skill is copied, named, and versioned");
const importRoot = skillsRepo("repo-import");
{
  const src = folder("src", "helper-skill");
  mkdirSync(join(src, "notes"));
  const skillText = "---\ndescription: Helps with a task. Use when asked for help with it.\n---\n\n# Helper\n\nDo the thing.\n";
  writeFileSync(join(src, "SKILL.md"), skillText);
  writeFileSync(join(src, "notes", "extra.md"), "More detail.\n");
  const dest = join(importRoot, "packs", "base", "plugins", "workflow", "skills", "helper-skill");

  const before = snapshot(importRoot);
  const preview = cli(["import", src, "--into", "workflow", "--repo", importRoot], { SKILLITON_BACKUPS: join(tmp, "b-import-preview") });
  check("preview exits 0", preview.code === 0, preview.all);
  check("preview still runs the scan", preview.out.includes("scanned files: 2") && preview.out.includes("scrub-check: PASS") && preview.out.includes("0 hits in 2 text file(s)"), preview.out);
  check("preview names the files it would copy and where", preview.out.includes(`would copy 2 file(s) to packs/base/plugins/workflow/skills/helper-skill`) && preview.out.includes("SKILL.md") && preview.out.includes(join("notes", "extra.md")), preview.out);
  check("preview names the version bump and says to add --apply", /would bump .* version 0\.1\.0 -> 0\.1\.1/.test(preview.out) && /Next: run the same command with --apply/.test(preview.out), preview.out);
  check("preview writes nothing, makes no backup, and does not bump the version", snapshot(importRoot) === before && !existsSync(join(tmp, "b-import-preview")) && versionIn(importRoot) === "0.1.0" && !existsSync(dest));

  const r = cli(["import", src, "--into", "workflow", "--repo", importRoot, "--apply"], { SKILLITON_BACKUPS: join(tmp, "b-import") });
  check("import --apply exits 0", r.code === 0, r.all);
  check("the scan ran on both files and passed", r.out.includes("scanned files: 2") && r.out.includes("scrub-check: PASS") && r.out.includes("0 hits in 2 text file(s)"), r.out);
  check("every file was copied", existsSync(join(dest, "SKILL.md")) && readFileSync(join(dest, "notes", "extra.md"), "utf8") === "More detail.\n");
  const copied = existsSync(join(dest, "SKILL.md")) ? readFileSync(join(dest, "SKILL.md"), "utf8") : "";
  check("the missing name was added from the folder name, and nothing else changed", copied === skillText.replace("---\n", "---\nname: helper-skill\n"), copied);
  check("the source folder was not modified", readFileSync(join(src, "SKILL.md"), "utf8") === skillText);
  check("plugin version bumped 0.1.0 -> 0.1.1", versionIn(importRoot) === "0.1.1");
  check("the output lists what was copied and asks for a review", r.out.includes("copied 2 file(s)") && r.out.includes("Before committing: read the skill's text"), r.out);
}

section("import: a fake AWS key refuses the import without printing the key");
{
  const fakeKey = ["AKIA", "TESTFAKEKEY", "00000"].join(""); // assembled at runtime so no key-shaped literal exists in this file
  check("positive control: the fake key has the shape the rule looks for", /^AKIA[0-9A-Z]{16}$/.test(fakeKey));
  const src = folder("src", "leaky-skill");
  writeFileSync(join(src, "SKILL.md"), "---\nname: leaky-skill\ndescription: A skill. Use when testing.\n---\n\nBody.\n");
  writeFileSync(join(src, "config.md"), `first line\naws_access_key_id = ${fakeKey}\n`);
  const r = cli(["import", src, "--into", "workflow", "--repo", importRoot], { SKILLITON_BACKUPS: join(tmp, "b-leak") });
  check("exit 2", r.code === 2, r.all);
  check("the hit is listed as file:line and rule", r.all.includes("config.md:2  aws-access-key-id"), r.all);
  check("the key itself is not printed anywhere", !r.all.includes(fakeKey) && !r.all.includes("TESTFAKEKEY"), r.all);
  check("the refusal says nothing was copied", /import stopped before copying anything/.test(r.all), r.all);
  check("nothing was copied and the version did not change", !existsSync(join(importRoot, "packs", "base", "plugins", "workflow", "skills", "leaky-skill")) && versionIn(importRoot) === "0.1.1");
}

section("import: scrub-check findings, a missing denylist, links, and home paths also refuse");
{
  const make = (name, extra) => {
    const src = folder("src", name);
    writeFileSync(join(src, "SKILL.md"), `---\nname: ${name}\ndescription: A skill. Use when testing.\n---\n\n${extra}\n`);
    return src;
  };
  const skillsDir = join(importRoot, "packs", "base", "plugins", "workflow", "skills");
  const dashed = `a${String.fromCharCode(0x2014)}b`;
  const dash = cli(["import", make("dash-skill", dashed), "--into", "workflow", "--repo", importRoot]);
  check("an em dash is caught by the scrub check (exit 2, FAIL dashes, file:line)", dash.code === 2 && dash.all.includes("FAIL dashes") && dash.all.includes("SKILL.md:6") && !existsSync(join(skillsDir, "dash-skill")), dash.all);
  check("the dashed text itself is not printed", !dash.all.includes(dashed), dash.all);
  const named = cli(["import", make("named-skill", `ask ${DENIED} first`), "--into", "workflow", "--repo", importRoot]);
  check("a denylisted name is caught by the scrub check (exit 2, FAIL names, file:line)", named.code === 2 && named.all.includes("FAIL names") && named.all.includes("SKILL.md:6") && !existsSync(join(skillsDir, "named-skill")), named.all);
  check("the denylisted name itself is not printed", !named.all.includes(DENIED), named.all);
  const homePath = cli(["import", make("path-skill", "see /Us" + "ers/somebody/notes.md"), "--into", "workflow", "--repo", importRoot]);
  check("a home path is caught by both scans", homePath.code === 2 && homePath.all.includes("FAIL home paths") && homePath.all.includes("SKILL.md:6  home-directory-path"), homePath.all);
  check("the home path itself is not printed", !homePath.all.includes("somebody"), homePath.all);
  const windowsPath = cli(["import", make("windows-skill", "see C:\\Users\\somebody\\notes.md"), "--into", "workflow", "--repo", importRoot]);
  check("a Windows home path is caught by the secret and path scan", windowsPath.code === 2 && windowsPath.all.includes("SKILL.md:6  home-directory-path"), windowsPath.all);

  const clean = make("clean-skill", "Nothing to find here.");
  const noDeny = cli(["import", clean, "--into", "workflow", "--repo", importRoot], { SKILLITON_DENYLIST: join(tmp, "no-such-denylist") });
  check("without a denylist the import is refused, because names were not scanned", noDeny.code === 2 && noDeny.all.includes("NAME SCAN NOT RUN") && /names were not scanned/.test(noDeny.all) && !existsSync(join(skillsDir, "clean-skill")), noDeny.all);
  const commentsOnly = join(tmp, "denylist-comments-only");
  writeFileSync(commentsOnly, "# no names to block\n");
  const optedOut = cli(["import", clean, "--into", "workflow", "--repo", importRoot, "--apply"], { SKILLITON_DENYLIST: commentsOnly, SKILLITON_BACKUPS: join(tmp, "b-optout") });
  check("a denylist holding only comments is an explicit opt-out: import proceeds and shows 0 patterns", optedOut.code === 0 && optedOut.all.includes("0 patterns") && existsSync(join(skillsDir, "clean-skill", "SKILL.md")), optedOut.all);

  const linked = make("linked-skill", "Body.");
  symlinkSync(join(tmp, "denylist"), join(linked, "pointer.md"));
  const link = cli(["import", linked, "--into", "workflow", "--repo", importRoot]);
  check("a symbolic link is refused and named", link.code === 2 && /pointer\.md \(a symbolic link\)/.test(link.all) && !existsSync(join(skillsDir, "linked-skill")), link.all);
  check("refused imports left the version where the one successful import put it", versionIn(importRoot) === "0.1.2");
}

// ---------------------------------------------------------------- scrub-check --path
section("scrub-check --path");
{
  const d = folder("scrub-named");
  writeFileSync(join(d, "a.md"), `hello ${DENIED} there\n`);
  writeFileSync(join(d, "b.md"), "clean\n");
  const withDeny = scrub(["--path", d]);
  check("with a denylist configured, a denylisted name fails (exit 1) at file:line", withDeny.code === 1 && withDeny.all.includes("FAIL names: 1 line(s)") && withDeny.all.includes("a.md:1") && withDeny.all.includes("scanned files: 2"), withDeny.all);
  const withoutDeny = scrub(["--path", d], { SKILLITON_DENYLIST: join(tmp, "no-such-denylist") });
  check("without a denylist the same folder does not fail on names: exit 2, NAME SCAN NOT RUN, INCOMPLETE", withoutDeny.code === 2 && withoutDeny.all.includes("NAME SCAN NOT RUN") && withoutDeny.all.includes("scrub-check: INCOMPLETE") && !withoutDeny.all.includes("FAIL names"), withoutDeny.all);

  const one = folder("scrub-one-file");
  writeFileSync(join(one, "only.md"), `x\nhello ${DENIED} there\n`);
  const single = scrub(["--path", one]);
  check("a folder holding one file still reports file:line, not the matched text", single.code === 1 && single.all.includes("only.md:2") && !single.all.includes(DENIED), single.all);

  const c = folder("scrub-clean");
  writeFileSync(join(c, "ok.md"), "clean\n");
  mkdirSync(join(c, ".git"));
  writeFileSync(join(c, ".git", "config"), `${DENIED}\n`);
  writeFileSync(join(c, ".DS_Store"), `${DENIED}\n`);
  const clean = scrub(["--path", c]);
  check("a clean folder passes, skipping .git/ and .DS_Store (scanned files: 1)", clean.code === 0 && clean.all.includes("scrub-check: PASS") && clean.all.includes("scanned files: 1"), clean.all);
  const missing = scrub(["--path", join(tmp, "no-such-folder")]);
  check("a missing folder is NOT RUN with exit 2, never a pass", missing.code === 2 && missing.all.includes("NOT RUN"), missing.all);

  const selfTest = scrub(["--self-test"]);
  check("scrub-check --self-test still passes", selfTest.code === 0 && selfTest.all.includes("self-test passed"), selfTest.all);
}

// ---------------------------------------------------------------- doctor
section("doctor: temp home, real PATH");
{
  const dir = folder("doctor-plain");
  const homeBefore = snapshot(HOME), dirBefore = snapshot(dir);
  const r = cli(["doctor", "--dir", dir]);
  check("doctor exits 0 or 1", r.code === 0 || r.code === 1, `exit ${r.code}\n${r.all}`);
  check("doctor prints no stack trace", noStackTrace(r.all), r.all);
  check("doctor ends with a Summary line", /\nSummary: .+\n$/.test(r.out), r.out);
  check("doctor wrote nothing under HOME", snapshot(HOME) === homeBefore, snapshot(HOME));
  check("doctor wrote nothing in the project folder", snapshot(dir) === dirBefore);
}

section("doctor: no claude on PATH");
{
  const bin = folder("bin-node-only");
  symlinkSync(process.execPath, join(bin, "node"));
  const r = cli(["doctor", "--dir", folder("doctor-plain")], { PATH: bin });
  check("exit 1, saying claude is not on PATH, without a stack trace", r.code === 1 && r.all.includes('"claude" is not on PATH') && noStackTrace(r.all), r.all);
}

section("doctor: a complete setup exits 0, and one disabled plugin exits 1");
{
  const home = folder("home-complete");
  writeFileSync(join(home, ".claude.json"), "{}\n"); // Claude Code has run here, so doctor may ask the command line
  const fake = folder("fake-claude");
  const market = CATALOG.name;
  const baseDirs = readdirSync(join(repo, "packs", "base", "plugins"));
  const basePlugins = CATALOG.plugins.map((p) => p.name).filter((n) => baseDirs.includes(n));
  const repoName = Object.values(SETTINGS_TEMPLATE.extraKnownMarketplaces)[0].source.repo;
  const writeRecords = (enabled) => writeFileSync(join(fake, "plugins.json"), JSON.stringify(basePlugins.map((name, i) => ({ id: `${name}@${market}`, version: "0.1.0", scope: "user", enabled: enabled(i) }))));
  writeRecords(() => true);
  writeFileSync(join(fake, "marketplaces.json"), JSON.stringify([{ name: market, source: "github", repo: repoName }]));
  writeFileSync(join(fake, "claude"), [
    "#!/usr/bin/env bash",
    'here="$(cd "$(dirname "$0")" && pwd)"',
    'case "$*" in',
    '  "--version") echo "9.9.9 (Claude Code)";;',
    '  "plugin list --help"|"plugin marketplace list --help") printf "Usage: fake\\n  --json  Output as JSON\\n";;',
    '  "plugin list --json") cat "$here/plugins.json";;',
    '  "plugin marketplace list --json") cat "$here/marketplaces.json";;',
    '  *) echo "fake claude: unexpected arguments: $*" >&2; exit 64;;',
    "esac",
    "",
  ].join("\n"));
  chmodSync(join(fake, "claude"), 0o755);
  const env = { HOME: home, PATH: `${fake}${delimiter}${process.env.PATH}`, SKILLITON_BACKUPS: join(tmp, "b-doctor") };

  const dir = folder("doctor-complete");
  const setup = [cli(["harness", "--apply", "--dir", dir], env), cli(["project-settings", "--apply", "--dir", dir], env)];
  check("setup: harness and project-settings applied with exit 0", setup.every((s) => s.code === 0), setup.map((s) => s.all).join("\n"));
  check(`fixture: the catalog lists at least one base plugin (${basePlugins.join(", ") || "none"})`, basePlugins.length > 0);

  const jqPresent = spawnSync("bash", ["-c", "command -v jq"], { env: { ...baseEnv, ...env } }).status === 0;
  const homeBefore = snapshot(home);
  const ok = cli(["doctor", "--dir", dir], env);
  check("doctor read the plugin records from the command line, not the fallback", ok.all.includes("from claude plugin list --json and claude plugin marketplace list --json (Claude Code 9.9.9)"), ok.all);
  if (jqPresent) check("with everything in place doctor exits 0 and says so", ok.code === 0 && ok.out.includes("Summary: everything required is in place."), ok.all);
  else check("NOT RUN here: the exit 0 case needs jq on PATH, because a shipped hook calls it", false, "install jq and run again");
  check("doctor harness lines report the block as current", ok.all.includes("OK         CLAUDE.md: harness block present and matches the current template") && ok.all.includes("OK         AGENTS.md: harness block present and matches the current template"), ok.all);

  writeRecords((i) => i !== 0);
  const broken = cli(["doctor", "--dir", dir], env);
  check("one disabled base plugin makes doctor exit 1 and mark the line [required]", broken.code === 1 && new RegExp(`WARN\\s+${basePlugins[0]}@${market}: installed 0\\.1\\.0 but disabled.*\\[required\\]`).test(broken.all), broken.all);
  check("the summary names the fix for the disabled plugin", /Summary: 1 required check\(s\) need attention\. Next: enable the disabled base plugins/.test(broken.out), broken.out);
  check("doctor wrote nothing under that HOME either", snapshot(home) === homeBefore);
}

// ---------------------------------------------------------------- this file
section("this test file");
check("no key-shaped literal exists in this file", !/AKIA[0-9A-Z]{16}/.test(readFileSync(fileURLToPath(import.meta.url), "utf8")));

if (fails) {
  console.log(`\n${fails} FAILED, ${passes} ok. Temp files kept for inspection: ${tmp}`);
  process.exit(1);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\nall ${passes} checks passed`);
