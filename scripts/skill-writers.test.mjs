// skill-writers.test.mjs: `skilliton new-skill` and `skilliton import` write only inside the skills repository. A
// symbolic link anywhere between the repository root and the new skill's folder (a pack, a plugin, its `skills`
// folder, the skill's own folder) refuses with exit 2 and "Nothing was written", naming the linked component; nothing
// outside changes and the plugin's version does not move. With no link, both still create the skill and bump it.
//   node --test scripts/skill-writers.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "skilliton.mjs");
const tmp = mkdtempSync(join(tmpdir(), "skilliton-skill-writers-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
mkdirSync(join(tmp, "home"));
const DENY = join(tmp, "denylist");
writeFileSync(DENY, "# no names to block in this test\n");
const ENV = { ...process.env, HOME: join(tmp, "home"), SKILLITON_DENYLIST: DENY };
delete ENV.SKILLITON_DEBUG;
delete ENV.CLAUDE_CONFIG_DIR;

const PLUGIN_JSON = '{\n  "name": "review",\n  "description": "test plugin",\n  "version": "0.1.0"\n}\n';
let count = 0;
const folder = (...parts) => { const d = join(tmp, ...parts); mkdirSync(d, { recursive: true }); return d; };
const pluginDir = (root) => join(root, "packs", "company", "plugins", "review");
function companyRepo() {
  const root = folder(`repo${++count}`);
  mkdirSync(join(pluginDir(root), ".claude-plugin"), { recursive: true });
  writeFileSync(join(pluginDir(root), ".claude-plugin", "plugin.json"), PLUGIN_JSON);
  return root;
}
const versionOf = (root) => JSON.parse(readFileSync(join(pluginDir(root), ".claude-plugin", "plugin.json"), "utf8")).version;
function cli(args, backups) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: tmp, env: { ...ENV, SKILLITON_BACKUPS: backups }, encoding: "utf8" });
  return { code: r.status, all: `${r.stdout}${r.stderr}` };
}
// Every entry under a folder with its size and modification time: equal snapshots mean nothing was written there.
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((rel) => {
  const st = statSync(join(dir, rel));
  return st.isDirectory() ? `${rel}/` : `${rel} ${st.size} ${st.mtimeMs}`;
}).join("\n");
function assertRefused(r, component) {
  assert.equal(r.code, 2, r.all);
  assert.ok(r.all.includes(`${component} is a symbolic link`), r.all);
  assert.match(r.all, /Nothing was written/);
  assert.doesNotMatch(r.all, /\n\s+at .+:\d+:\d+\)?\n|unexpected internal error/, "a refusal, not a crash");
}
function sourceSkill(name) {
  const src = folder(`src${++count}`, name);
  writeFileSync(join(src, "SKILL.md"), `---\nname: ${name}\ndescription: A probe. Use when testing.\n---\n\n# Probe\n`);
  return src;
}

test("a linked skills folder: new-skill (preview and --apply) and import refuse, and nothing outside changes", () => {
  const root = companyRepo();
  const outside = folder(`outside${count}`);
  writeFileSync(join(outside, "keep.md"), "outside\n");
  symlinkSync(outside, join(pluginDir(root), "skills"));
  const before = snapshot(outside);
  const backups = join(tmp, `backups${count}`);
  for (const apply of [[], ["--apply"]]) {
    assertRefused(cli(["new-skill", "review", "review-probe", "--pack", "company", "--repo", root, ...apply], backups), "packs/company/plugins/review/skills");
  }
  assertRefused(cli(["import", sourceSkill("probe-skill"), "--into", "review", "--pack", "company", "--repo", root, "--apply"], backups), "packs/company/plugins/review/skills");
  assert.equal(snapshot(outside), before, "the folder the link points at is unchanged");
  assert.equal(versionOf(root), "0.1.0", "the version did not move");
  assert.ok(!existsSync(backups), "no backup was made, because nothing was about to be written");
});

test("a linked pack folder is refused and named, and the plugin it points at gains nothing", () => {
  const real = companyRepo();
  const root = folder(`repo${++count}`, "packs");
  symlinkSync(join(real, "packs", "company"), join(root, "company"));
  assertRefused(cli(["new-skill", "review", "review-probe", "--pack", "company", "--repo", dirname(root), "--apply"], join(tmp, "b-pack")), "packs/company");
  assertRefused(cli(["import", sourceSkill("probe-skill"), "--into", "review", "--repo", dirname(root), "--apply"], join(tmp, "b-pack")), "packs/company");
  assert.ok(!existsSync(join(pluginDir(real), "skills")));
  assert.equal(versionOf(real), "0.1.0");
});

test("a destination skill folder that is a link, even one pointing nowhere, is refused", () => {
  const root = companyRepo();
  mkdirSync(join(pluginDir(root), "skills"));
  const target = join(tmp, `nowhere${count}`);
  symlinkSync(target, join(pluginDir(root), "skills", "review-probe"));
  assertRefused(cli(["new-skill", "review", "review-probe", "--pack", "company", "--repo", root, "--apply"], join(tmp, "b-dest")), "packs/company/plugins/review/skills/review-probe");
  assertRefused(cli(["import", sourceSkill("review-probe"), "--into", "review", "--repo", root, "--apply"], join(tmp, "b-dest")), "packs/company/plugins/review/skills/review-probe");
  assert.ok(!existsSync(target), "nothing was created where the link points");
  assert.equal(versionOf(root), "0.1.0");
});

test("a linked plugin.json is refused before the version bump could write through it", () => {
  const root = companyRepo();
  const outsideJson = join(folder(`outside${++count}`), "plugin.json");
  writeFileSync(outsideJson, PLUGIN_JSON);
  rmSync(join(pluginDir(root), ".claude-plugin", "plugin.json"));
  symlinkSync(outsideJson, join(pluginDir(root), ".claude-plugin", "plugin.json"));
  assertRefused(cli(["new-skill", "review", "review-probe", "--pack", "company", "--repo", root, "--apply"], join(tmp, "b-json")), "packs/company/plugins/review/.claude-plugin/plugin.json");
  assert.equal(readFileSync(outsideJson, "utf8"), PLUGIN_JSON);
  assert.ok(!existsSync(join(pluginDir(root), "skills")));
});

test("with no link, new-skill and import still create the skill and bump the version", () => {
  const root = companyRepo();
  const backups = join(tmp, "b-normal");
  const made = cli(["new-skill", "review", "review-probe", "--pack", "company", "--repo", root, "--apply"], backups);
  assert.equal(made.code, 0, made.all);
  assert.ok(existsSync(join(pluginDir(root), "skills", "review-probe", "SKILL.md")));
  assert.equal(versionOf(root), "0.1.1");
  const copied = cli(["import", sourceSkill("probe-skill"), "--into", "review", "--pack", "company", "--repo", root, "--apply"], backups);
  assert.equal(copied.code, 0, copied.all);
  assert.ok(existsSync(join(pluginDir(root), "skills", "probe-skill", "SKILL.md")));
  assert.equal(versionOf(root), "0.1.2");
});
