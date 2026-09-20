// doctor.mjs: what `skilliton doctor` reads. Claude Code's own files (~/.claude.json, its settings, the plugin
// cache) have an undocumented format, so everything here reports what it found and says when it could not tell,
// rather than assuming a layout. The command that prints the lines is commands/doctor.mjs. Node only, no dependencies.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { HOME, SKILLS_REPO, isDir, isFile, isPlainObject, listDirNames, readJsonMaybe, runProgram, tilde } from "./core.mjs";

const versionOf = (text) => /^(\d+\.\d+\.\d+)/.exec(String(text).trim())?.[1] ?? null;
// Copies of Claude Code bundled inside editor extensions. The resources/native-binary layout was measured for
// VS Code only; the other editor folders are checked the same way and reported as unknown when it differs.
function findEditorCopies() {
  const copies = [];
  for (const editor of [".vscode", ".vscode-insiders", ".cursor", ".windsurf"]) {
    const ext = join(HOME, editor, "extensions");
    for (const name of listDirNames(ext).filter((n) => n.startsWith("anthropic.claude-code-"))) {
      const where = join(ext, name);
      const bin = ["claude", "claude.exe"].map((b) => join(where, "resources", "native-binary", b)).find(isFile);
      if (!bin) { copies.push({ where, path: null, version: null, failure: "no resources/native-binary/claude inside it" }); continue; }
      const r = runProgram(bin, ["--version"]);
      copies.push({ where, path: bin, version: r.ok ? versionOf(r.stdout) : null, failure: r.ok ? (versionOf(r.stdout) ? null : "printed no version") : r.failure });
    }
  }
  return copies;
}

function parseJsonArray(stdout) {
  const attempts = [stdout.trim(), stdout.slice(stdout.indexOf("["), stdout.lastIndexOf("]") + 1)];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try { const v = JSON.parse(attempt); if (Array.isArray(v)) return v; } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
  }
  return null;
}

const settingsFiles = (dir) => [
  { label: "~/.claude/settings.json", path: join(HOME, ".claude", "settings.json") },
  { label: ".claude/settings.json", path: join(dir, ".claude", "settings.json") },
  { label: ".claude/settings.local.json", path: join(dir, ".claude", "settings.local.json") },
];

// Claude Code's own record files. Their format is not documented; shapes below were read on 2.1.92.
function readLocalPluginFiles(dir) {
  const problems = [];
  const knownPath = join(HOME, ".claude", "plugins", "known_marketplaces.json");
  const installedPath = join(HOME, ".claude", "plugins", "installed_plugins.json");
  for (const p of [knownPath, installedPath]) if (!isFile(p)) problems.push(`${tilde(p)} not found`);
  const known = readJsonMaybe(knownPath, problems);
  const installed = readJsonMaybe(installedPath, problems);
  const marketplaces = isPlainObject(known) ? Object.entries(known).map(([name, v]) => ({
    name, source: v?.source?.source ?? null, repo: v?.source?.repo ?? null, path: v?.source?.path ?? null,
    autoUpdate: typeof v?.autoUpdate === "boolean" ? v.autoUpdate : null,
  })) : [];
  // Enabled state lives in settings files (measured: installing writes enabledPlugins; installed_plugins.json has no
  // enabled field). Later files override earlier ones: user, then project, then local. Managed settings are not read.
  const enabled = {};
  for (const f of settingsFiles(dir)) {
    const s = readJsonMaybe(f.path, problems);
    if (isPlainObject(s?.enabledPlugins)) Object.assign(enabled, s.enabledPlugins);
  }
  const plugins = isPlainObject(installed?.plugins) ? Object.entries(installed.plugins).map(([id, installs]) => {
    const list = Array.isArray(installs) ? installs : [];
    return { id, version: list[0]?.version ?? null, scope: list.map((x) => x?.scope).filter(Boolean).join("+") || null, enabled: typeof enabled[id] === "boolean" ? enabled[id] : null };
  }) : [];
  return { marketplaces, plugins, problems, knownRaw: isPlainObject(known) ? known : {} };
}

function gatherPluginRecords(cli, dir) {
  const why = [], via = [];
  let plugins = null, marketplaces = null;
  if (!cli) why.push("no working claude command to ask");
  else if (!isFile(join(HOME, ".claude.json"))) why.push(`Claude Code has not run under this home folder yet (no ~/.claude.json), and "claude plugin list" would create that file`);
  else {
    const ask = (args, label, valid, map) => {
      const help = runProgram(cli.path, [...args, "--help"]);
      if (!/--json\b/.test(help.stdout + help.stderr)) { why.push(`"claude ${args.join(" ")}" on ${cli.version} has no --json option`); return null; }
      const r = runProgram(cli.path, [...args, "--json"], 60000);
      const list = r.ok ? parseJsonArray(r.stdout) : null;
      if (!list || !list.every(valid)) { why.push(`"claude ${args.join(" ")} --json" ${r.ok ? "printed something other than the expected list" : `failed: ${r.failure}`}`); return null; }
      via.push(`claude ${args.join(" ")} --json`);
      return list.map(map);
    };
    plugins = ask(["plugin", "list"], "plugins", (p) => isPlainObject(p) && typeof p.id === "string",
      (p) => ({ id: p.id, version: p.version ?? null, scope: p.scope ?? null, enabled: typeof p.enabled === "boolean" ? p.enabled : null }));
    marketplaces = ask(["plugin", "marketplace", "list"], "marketplaces", (m) => isPlainObject(m) && typeof m.name === "string",
      (m) => ({ name: m.name, source: m.source ?? null, repo: m.repo ?? null, path: m.path ?? null, autoUpdate: typeof m.autoUpdate === "boolean" ? m.autoUpdate : null }));
  }
  const local = readLocalPluginFiles(dir);
  const fromFiles = !plugins || !marketplaces;
  const result = { plugins: plugins ?? local.plugins, marketplaces: marketplaces ?? local.marketplaces, marketplacesFromCli: !!marketplaces, local };
  if (!fromFiles) return { ...result, status: "OK", detail: `from ${via.join(" and ")} (Claude Code ${cli.version})` };
  const partly = via.length ? `${via.join(" and ")} answered; the rest was ` : "";
  const missing = local.problems.length ? `; ${local.problems.join("; ")}` : "";
  return { ...result, status: "UNVERIFIED", detail: `${partly}read from Claude Code's local files; format not documented (${why.join("; ")})${missing}` };
}

function readCatalog() {
  if (!SKILLS_REPO) return { name: null, plugins: [], error: "this copy of skilliton is not inside a company skills repository, so there is no marketplace catalog to read" };
  const path = join(SKILLS_REPO, ".claude-plugin", "marketplace.json");
  const problems = [];
  const c = readJsonMaybe(path, problems);
  if (c === undefined) return { name: null, plugins: [], error: problems[0] ?? `${tilde(path)} not found` };
  if (typeof c?.name !== "string") return { name: null, plugins: [], error: `${tilde(path)} has no "name"` };
  return { name: c.name, plugins: Array.isArray(c.plugins) ? c.plugins.filter((p) => isPlainObject(p) && typeof p.name === "string") : [], error: null };
}

function readTeamTemplate() {
  if (!SKILLS_REPO) return null;
  const v = readJsonMaybe(join(SKILLS_REPO, "templates", "project-settings.json"), []);
  return isPlainObject(v) ? v : null;
}

const basePluginDirs = () => (SKILLS_REPO ? listDirNames(join(SKILLS_REPO, "packs", "base", "plugins")) : []);

// Hook files of one plugin folder (an installed copy has only itself to inspect).
function listPluginHookFiles(pluginDir) {
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) out.push({ rel: relative(pluginDir, p), name: ent.name, text: readFileSync(p, "utf8") });
    }
  };
  if (isDir(join(pluginDir, "hooks"))) walk(join(pluginDir, "hooks"));
  return out;
}

function listHookFiles(repo) {
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) out.push({ rel: relative(repo, p), name: ent.name, text: readFileSync(p, "utf8") });
    }
  };
  for (const pack of listDirNames(join(repo, "packs"))) {
    for (const plugin of listDirNames(join(repo, "packs", pack, "plugins"))) {
      const hooks = join(repo, "packs", pack, "plugins", plugin, "hooks");
      if (isDir(hooks)) walk(hooks);
    }
  }
  return out;
}

// Does a hook file call this tool? Comment lines are ignored, except a #! first line.
function referencesTool(text, tool) {
  const code = text.split("\n").filter((line, i) => !(/^\s*#/.test(line) && !(i === 0 && line.startsWith("#!")))).join("\n");
  return new RegExp(`(^|[\\s;|&(\`$"'/])${tool}($|[\\s;|&)"'])`, "m").test(code);
}


export {
  versionOf, findEditorCopies, parseJsonArray, settingsFiles, readLocalPluginFiles, gatherPluginRecords,
  readCatalog, readTeamTemplate, basePluginDirs, listPluginHookFiles, listHookFiles, referencesTool,
};
