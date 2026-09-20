#!/usr/bin/env node
// packs.test.mjs: packaging checks that `claude plugin validate` does not make.
//
// Found on 2026-09-16: `validate --strict` passed a plugin skill with no `name` in its frontmatter,
// although plugin skills require one. This test holds every pack to docs/CONTRACTS.md:
//   - every plugin under packs/*/plugins/ is listed in .claude-plugin/marketplace.json, and every
//     listed source exists (an unlisted plugin cannot be installed; a dangling entry breaks install)
//   - plugin.json has name (matching its folder), version (x.y.z), description, license
//   - every skills/<dir>/SKILL.md has frontmatter `name` equal to <dir>, matching ^[a-z0-9-]{1,64}$,
//     and a `description` of at most 1024 characters (the Agent Skills limit Codex also applies)
//   - every agents/<name>.md has frontmatter name equal to <name>, a description, and a model and an
//     effort from the documented sets (an agent with no model runs on whatever the caller had)
//   - no frontmatter value contains an unquoted ": " (YAML drops the whole block; found 2026-09-20)
//   - every command a hooks.json runs from ${CLAUDE_PLUGIN_ROOT} exists and is executable
//
//   node scripts/packs.test.mjs            check this repository
//   node scripts/packs.test.mjs --root D   check another checkout (used by the self-test)
//   node scripts/packs.test.mjs --self-test   prove each check can fail

import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, chmodSync, rmSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootArg = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : null;
if (argv.includes("--root") && (!rootArg || rootArg.startsWith("--"))) { console.error("--root needs a folder; nothing was checked"); process.exit(2); }

function check(root) {
  const failures = [];
  const oks = [];
  const fail = (m) => failures.push(m);
  const ok = (m) => oks.push(m);
  const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { fail(`${rel(p)}: not valid JSON (${e.message})`); return null; } };
  const rel = (p) => p.startsWith(root) ? p.slice(root.length + 1) : p;
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  // Read one frontmatter block the way YAML does for the fields we care about, and report the one
  // mistake that is invisible otherwise. Found on 2026-09-20: an unquoted description containing
  // ": " is a nested mapping in a compact mapping, so the whole block fails to parse and the agent
  // or skill loads with EMPTY metadata. A naive "split on the first colon" reader sees nothing wrong.
  const frontmatter = (text, label) => {
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m) { fail(`${label}: no YAML frontmatter at the top`); return null; }
    const fm = {};
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
      if (!kv) continue;
      let value = kv[2].trim();
      const quoted = /^"[^"]*"$/.test(value) || /^'[^']*'$/.test(value);
      if (quoted) value = value.slice(1, -1);
      else if (/:\s/.test(value)) fail(`${label}: ${kv[1]} contains ": " and is not quoted, so YAML reads it as a nested mapping and the whole frontmatter is dropped; wrap the value in double quotes`);
      fm[kv[1]] = value;
    }
    return fm;
  };

  const plugins = [];
  const packsDir = join(root, "packs");
  for (const pack of isDir(packsDir) ? readdirSync(packsDir) : []) {
    const pdir = join(packsDir, pack, "plugins");
    if (!isDir(pdir)) continue;
    for (const plugin of readdirSync(pdir)) if (isDir(join(pdir, plugin))) plugins.push({ pack, plugin, dir: join(pdir, plugin) });
  }
  if (!plugins.length) fail("no plugins found under packs/*/plugins/");
  else ok(`${plugins.length} plugin(s) found`);

  const mpPath = join(root, ".claude-plugin", "marketplace.json");
  const mp = existsSync(mpPath) ? readJson(mpPath) : (fail(".claude-plugin/marketplace.json missing"), null);
  const listed = new Map();
  for (const entry of mp?.plugins ?? []) {
    const src = typeof entry.source === "string" ? entry.source : null;
    listed.set(entry.name, src);
    if (src && !isDir(resolve(root, src))) fail(`marketplace entry ${entry.name}: source ${src} does not exist`);
  }
  for (const { plugin, dir } of plugins) {
    if (!listed.has(plugin)) fail(`plugin ${rel(dir)} is not listed in .claude-plugin/marketplace.json`);
    else if (listed.get(plugin) && resolve(root, listed.get(plugin)) !== dir) fail(`marketplace entry ${plugin} points at ${listed.get(plugin)}, not ${rel(dir)}`);
  }
  for (const name of listed.keys()) if (!plugins.some((p) => p.plugin === name)) fail(`marketplace lists ${name}, but no packs/*/plugins/${name} exists`);

  for (const { plugin, dir } of plugins) {
    const manifest = readJson(join(dir, ".claude-plugin", "plugin.json"));
    if (manifest) {
      if (manifest.name !== plugin) fail(`${plugin}: plugin.json name is ${JSON.stringify(manifest.name)}, folder is ${plugin}`);
      if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) fail(`${plugin}: plugin.json version ${JSON.stringify(manifest.version)} is not x.y.z`);
      if (!manifest.description) fail(`${plugin}: plugin.json has no description`);
      if (!manifest.license) fail(`${plugin}: plugin.json has no license`);
    }

    const skillsDir = join(dir, "skills");
    for (const skill of isDir(skillsDir) ? readdirSync(skillsDir) : []) {
      const sdir = join(skillsDir, skill);
      if (!isDir(sdir)) continue;
      const sfile = join(sdir, "SKILL.md");
      if (!existsSync(sfile)) { fail(`${rel(sdir)}: no SKILL.md`); continue; }
      const fm = frontmatter(readFileSync(sfile, "utf8"), rel(sfile));
      if (!fm) continue;
      if (!fm.name) fail(`${rel(sfile)}: frontmatter has no name (plugin skills require it)`);
      else {
        if (fm.name !== skill) fail(`${rel(sfile)}: name ${fm.name} does not match its folder ${skill}`);
        if (!/^[a-z0-9-]{1,64}$/.test(fm.name)) fail(`${rel(sfile)}: name ${fm.name} must be lowercase letters, digits, and hyphens, at most 64 characters`);
      }
      if (!fm.description) fail(`${rel(sfile)}: frontmatter has no description`);
      else if (fm.description.length > 1024) fail(`${rel(sfile)}: description is ${fm.description.length} characters; the limit is 1024`);
      else ok(`${plugin}:${skill} frontmatter ok (${fm.description.length} character description)`);
    }

    // Agents shipped in a plugin are namespaced <plugin>:<name> and are picked by their description.
    // `claude plugin validate` does not read them at all, so model and effort are held here: an agent
    // with no model runs on whatever model the calling session happened to be using (docs/CONTRACTS.md
    // section 18). The value sets are the documented ones, retrieved 2026-09-20.
    const AGENT_MODELS = ["sonnet", "opus", "haiku", "fable", "inherit"];
    const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
    const agentsDir = join(dir, "agents");
    for (const file of isDir(agentsDir) ? readdirSync(agentsDir) : []) {
      if (!file.endsWith(".md")) { fail(`${plugin}: agents/${file} is not a .md file`); continue; }
      const apath = join(agentsDir, file);
      const name = file.slice(0, -3);
      const fm = frontmatter(readFileSync(apath, "utf8"), rel(apath));
      if (!fm) continue;
      if (fm.name !== name) fail(`${rel(apath)}: frontmatter name ${JSON.stringify(fm.name ?? null)} does not match its file name ${name}`);
      else if (!/^[a-z0-9-]{1,64}$/.test(fm.name)) fail(`${rel(apath)}: name ${fm.name} must be lowercase letters, digits and hyphens, at most 64 characters`);
      if (!fm.description) fail(`${rel(apath)}: frontmatter has no description (it is how the model picks the agent)`);
      else if (fm.description.length > 1024) fail(`${rel(apath)}: description is ${fm.description.length} characters; the limit is 1024`);
      if (!fm.model) fail(`${rel(apath)}: frontmatter has no model; a shipped agent names the model it is meant to run on`);
      else if (!AGENT_MODELS.includes(fm.model) && !/^claude-[a-z0-9][a-z0-9.-]*$/.test(fm.model)) fail(`${rel(apath)}: model ${fm.model} is not one of ${AGENT_MODELS.join(", ")} or a claude- model id`);
      if (!fm.effort) fail(`${rel(apath)}: frontmatter has no effort; a shipped agent names how hard it is meant to think`);
      else if (!AGENT_EFFORTS.includes(fm.effort)) fail(`${rel(apath)}: effort ${fm.effort} is not one of ${AGENT_EFFORTS.join(", ")}`);
      if (fm.maxTurns !== undefined && !/^[1-9][0-9]*$/.test(fm.maxTurns)) fail(`${rel(apath)}: maxTurns ${fm.maxTurns} is not a positive integer`);
      if (!failures.some((x) => x.includes(rel(apath)))) ok(`${plugin}:${name} agent frontmatter ok (model ${fm.model}, effort ${fm.effort})`);
    }

    // Every shell script shipped under hooks/ must be executable: hooks.json and setup.mjs run them by
    // path, and a test that runs them through `bash <script>` cannot see a missing executable bit.
    const hookDir = join(dir, "hooks");
    for (const f of isDir(hookDir) ? readdirSync(hookDir) : []) {
      if (!f.endsWith(".sh")) continue;
      if (!(statSync(join(hookDir, f)).mode & 0o111)) fail(`${plugin}: hooks/${f} is not executable (it is run by path)`);
    }

    const hooksPath = join(dir, "hooks", "hooks.json");
    if (existsSync(hooksPath)) {
      const hooks = readJson(hooksPath);
      for (const groups of Object.values(hooks?.hooks ?? {})) {
        for (const group of groups) for (const h of group.hooks ?? []) {
          if (h.type !== "command" || typeof h.command !== "string") continue;
          const mm = h.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}"?\/([^\s"]+)/);
          if (!mm) continue;
          const script = join(dir, mm[1]);
          if (!existsSync(script)) fail(`${plugin}: hooks.json runs ${mm[1]}, which does not exist`);
          else if (!(statSync(script).mode & 0o111)) fail(`${plugin}: hooks.json runs ${mm[1]}, which is not executable`);
          else ok(`${plugin}: hook ${mm[1]} exists and is executable`);
        }
      }
    }
  }
  return { failures, oks };
}

if (argv.includes("--self-test")) {
  const repo = resolve(here, "..");
  const tmp = mkdtempSync(join(tmpdir(), "packs-selftest-"));
  const cases = [
    ["skill without name", (d) => { const f = join(d, "packs/base/plugins/workflow/skills/review/SKILL.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^name: review\n/m, "")); }, /has no name/],
    ["description over 1024", (d) => { const f = join(d, "packs/base/plugins/workflow/skills/review/SKILL.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^description: /m, "description: " + "x".repeat(1100) + " ")); }, /limit is 1024/],
    ["unlisted plugin", (d) => { mkdirSync(join(d, "packs/acme/plugins/extra/.claude-plugin"), { recursive: true }); writeFileSync(join(d, "packs/acme/plugins/extra/.claude-plugin/plugin.json"), '{"name":"extra","version":"0.1.0","description":"x","license":"MIT"}'); }, /not listed/],
    ["hook not executable", (d) => { chmodSync(join(d, "packs/base/plugins/context-hygiene/hooks/session-start-checklist.sh"), 0o644); }, /not executable/],
    ["unquoted colon in a description", (d) => { const f = join(d, "packs/base/plugins/workflow/agents/lane.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^description: /m, "description: One lane: ")); }, /is not quoted/],
    ["agent without model", (d) => { const f = join(d, "packs/base/plugins/workflow/agents/locate.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^model: .*\n/m, "")); }, /has no model/],
    ["agent with an unknown effort", (d) => { const f = join(d, "packs/base/plugins/workflow/agents/lane.md"); writeFileSync(f, readFileSync(f, "utf8").replace(/^effort: .*$/m, "effort: maximum")); }, /effort maximum is not one of/],
    ["bad version", (d) => { const f = join(d, "packs/base/plugins/workflow/.claude-plugin/plugin.json"); writeFileSync(f, readFileSync(f, "utf8").replace(/"version": "[^"]*"/, '"version": "next"')); }, /not x\.y\.z/],
  ];
  let pass = 0;
  const clean = check(repo);
  if (clean.failures.length) { console.log(`SELF-TEST NOT RUN: this repository fails its own checks first:\n  ${clean.failures.join("\n  ")}`); process.exit(1); }
  for (const [label, mutate, expect] of cases) {
    const d = join(tmp, label.replace(/\W+/g, "-"));
    // Filter on the path inside the repository, not the absolute path: a checkout that itself lives under
    // .claude/worktrees/ (an agent lane) must still copy its own files.
    cpSync(repo, d, { recursive: true, filter: (s) => {
      const parts = relative(repo, s).split(sep);
      return !parts.includes(".git") && !parts.includes("node_modules") && !(parts[0] === ".claude" && parts[1] === "worktrees");
    } });
    mutate(d);
    const r = check(d);
    const caught = r.failures.some((f) => expect.test(f));
    console.log(`${caught ? "ok  " : "FAIL"} self-test: ${label} is ${caught ? "caught" : "NOT caught"}`);
    if (caught) pass++;
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(pass === cases.length ? "self-test passed: every packaging check can fail" : `SELF-TEST FAIL: ${cases.length - pass} check(s) could not fail`);
  process.exit(pass === cases.length ? 0 : 1);
}

const root = resolve(rootArg ?? join(here, ".."));
const { failures, oks } = check(root);
for (const m of oks) console.log(`ok   ${m}`);
for (const m of failures) console.log(`FAIL ${m}`);
console.log(failures.length ? `\n${failures.length} packaging failure(s)` : "\npackaging checks passed");
process.exit(failures.length ? 1 : 0);
