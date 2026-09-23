// doctor.mjs: what `skilliton doctor` reads. Claude Code's own files (~/.claude.json, its settings, the plugin
// cache) have an undocumented format, so everything here reports what it found and says when it could not tell,
// rather than assuming a layout. The command that prints the lines is commands/doctor.mjs. Node only, no dependencies.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { HOME, PLUGIN_ROOT, SKILLS_REPO, isDir, isFile, isPlainObject, listDirNames, readJsonMaybe, readPluginVersion, runProgram, tilde } from "./core.mjs";
import { claudeConfigDir } from "./verify.mjs";

// Where Claude Code keeps this user's configuration: CLAUDE_CONFIG_DIR when it is set, else ~/.claude (the same rule
// as lib/verify.mjs). Measured on Claude Code 2.1.278 with CLAUDE_CONFIG_DIR set: "claude plugin list" wrote
// .claude.json (and its backup) inside that folder and nothing under HOME, and the plugin records, the settings and
// the plugin cache all live there too. Without it, .claude.json is ~/.claude.json, beside the folder.
function claudeConfig() {
  const custom = Boolean(process.env.CLAUDE_CONFIG_DIR);
  const dir = claudeConfigDir();
  const label = custom ? tilde(dir) : "~/.claude";
  return { dir, custom, label, stateFile: custom ? join(dir, ".claude.json") : join(HOME, ".claude.json"), stateLabel: custom ? `${label}/.claude.json` : "~/.claude.json" };
}

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
  { label: `${claudeConfig().label}/settings.json`, path: join(claudeConfig().dir, "settings.json") },
  { label: ".claude/settings.json", path: join(dir, ".claude", "settings.json") },
  { label: ".claude/settings.local.json", path: join(dir, ".claude", "settings.local.json") },
];

// Claude Code's own record files. Their format is not documented; shapes below were read on 2.1.92.
function readLocalPluginFiles(dir) {
  const problems = [];
  const { dir: configDir } = claudeConfig();
  const knownPath = join(configDir, "plugins", "known_marketplaces.json");
  const installedPath = join(configDir, "plugins", "installed_plugins.json");
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
  else if (!isFile(claudeConfig().stateFile)) why.push(`Claude Code has not run ${claudeConfig().custom ? "with this configuration folder" : "under this home folder"} yet (no ${claudeConfig().stateLabel}), and "claude plugin list" would create that file`);
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

// The catalog doctor compares against: the skills repository's own when this runtime runs from a checkout, else the
// catalog of the marketplace this installed copy came from. { name, plugins, error, path, root, installed }.
function readCatalog() {
  if (!SKILLS_REPO) return readInstalledCatalog();
  return readCatalogFile(join(SKILLS_REPO, ".claude-plugin", "marketplace.json"), { installed: false });
}

function readCatalogFile(path, { installed, market = null }) {
  const none = (error) => ({ name: null, plugins: [], error, path, root: null, installed });
  const problems = [];
  const c = readJsonMaybe(path, problems);
  if (c === undefined) return none(problems[0] ?? `${tilde(path)} not found`);
  if (typeof c?.name !== "string") return none(`${tilde(path)} has no "name"`);
  if (market && c.name !== market) return none(`${tilde(path)} is the catalog of "${c.name}", not of the ${market} marketplace this copy was installed from`);
  return { name: c.name, plugins: Array.isArray(c.plugins) ? c.plugins.filter((p) => isPlainObject(p) && typeof p.name === "string") : [], error: null, path, root: dirname(dirname(path)), installed };
}

// An installed copy lives at <config dir>/plugins/cache/<marketplace>/<plugin>/<version>, so the folder names the
// marketplace. Its catalog is <config dir>/plugins/marketplaces/<marketplace>/.claude-plugin/marketplace.json (the
// clone Claude Code keeps of a GitHub marketplace); a marketplace added from a folder has no clone there (measured
// on 2.1.278), and its catalog is read where known_marketplaces.json says it is installed.
function readInstalledCatalog() {
  const config = claudeConfig();
  const none = (error) => ({ name: null, plugins: [], error, path: null, root: null, installed: true });
  const rel = relative(join(config.dir, "plugins", "cache"), PLUGIN_ROOT);
  const market = rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep)[0] : null;
  if (!market) return none(`this copy of skilliton is neither inside a company skills repository nor in Claude Code's plugin cache under ${config.label}, so there is no marketplace catalog to read`);
  const cloned = join(config.dir, "plugins", "marketplaces", market, ".claude-plugin", "marketplace.json");
  if (isFile(cloned)) return readCatalogFile(cloned, { installed: true, market });
  const location = readJsonMaybe(join(config.dir, "plugins", "known_marketplaces.json"), [])?.[market]?.installLocation;
  if (typeof location === "string" && isAbsolute(location)) return readCatalogFile(join(location, ".claude-plugin", "marketplace.json"), { installed: true, market });
  return none(`the ${market} marketplace this copy was installed from has no catalog at ${tilde(cloned)}, and ${config.label}/plugins/known_marketplaces.json names no folder for it`);
}

// The version a catalog's plugin entry has in the marketplace itself, read from its plugin.json; null when the entry
// is not a folder inside the marketplace (a relative "./..." source), or its manifest names no version.
function catalogPluginVersion(catalog, entry) {
  if (!catalog.root || typeof entry.source !== "string" || !entry.source.startsWith("./")) return null;
  const rel = entry.source.slice(2);
  if (!rel || rel.split("/").includes("..")) return null;
  return readPluginVersion(join(catalog.root, rel));
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
  claudeConfig, readCatalog, catalogPluginVersion, readTeamTemplate, basePluginDirs, listPluginHookFiles, listHookFiles, referencesTool,
};
