#!/usr/bin/env node
// standin.mjs: a stand-in for the Claude Code and Codex plugin commands that `skilliton join` drives, used by
// scripts/join.test.mjs so the tests run without either client. Invoked as `standin.mjs <claude|codex> <args...>`.
//
// It acts out the files each client was measured to write on 2026-09-16 (Claude Code 2.1.273, Codex 0.154.0-alpha.6.2;
// docs/CLIENTS.md), for local-folder marketplaces only:
//   claude  $CLAUDE_CONFIG_DIR/plugins/known_marketplaces.json, plugins/installed_plugins.json, settings.json, and
//           plugins/cache/<marketplace>/<plugin>/<version>/ (kept after uninstall, as measured)
//   codex   $CODEX_HOME/config.toml [marketplaces.<name>] and [plugins."<id>"] sections, and
//           plugins/cache/<marketplace>/<plugin>/<version>/ (removed on plugin remove); exits 1 when $CODEX_HOME
//           does not exist, as measured
// Every call is appended to $STANDIN_LOG as one JSON line. A call whose arguments, joined by spaces, contain
// $STANDIN_FAIL exits 1 without changing anything. It refuses to run without an explicit client home, so it can never
// write to a real configuration, and it never uses the network.

import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// The client home to act on: the variable each client reads, or, only when STANDIN_DEFAULT_HOME is set, the folder
// each client uses when that variable is unset. scripts/allowlist.test.mjs sets it to measure where an unconfigured
// machine is written, with HOME pointing inside its own temporary folder.
const clientHome = (variable, fallback) => process.env[variable] || (process.env.STANDIN_DEFAULT_HOME ? join(homedir(), fallback) : "");

const [client, ...args] = process.argv.slice(2);
const fail = (message) => { process.stderr.write(`standin ${client}: ${message}\n`); process.exit(1); };
if (process.env.STANDIN_LOG) appendFileSync(process.env.STANDIN_LOG, `${JSON.stringify({ client, args })}\n`);
if (args[0] === "--version") { process.stdout.write(`0.0.0-standin (${client})\n`); process.exit(0); }
if (process.env.STANDIN_FAIL && args.join(" ").includes(process.env.STANDIN_FAIL)) fail(`failing on purpose (STANDIN_FAIL=${process.env.STANDIN_FAIL})`);

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const writeJson = (path, value) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };

// The plugin folder and version a local marketplace lists for a plugin.
function pluginSource(marketRoot, plugin) {
  const catalog = readJson(join(marketRoot, ".claude-plugin", "marketplace.json"), null);
  const entry = catalog?.plugins?.find((p) => p.name === plugin);
  if (!entry) fail(`plugin ${plugin} is not in the marketplace at ${marketRoot}`);
  const dir = resolve(marketRoot, entry.source);
  return { dir, version: readJson(join(dir, ".claude-plugin", "plugin.json"), {}).version };
}

function localMarketplace(source) {
  if (!isAbsolute(source) || !existsSync(join(source, ".claude-plugin", "marketplace.json"))) fail(`only local marketplace folders are supported (got ${source})`);
  return { root: source, name: readJson(join(source, ".claude-plugin", "marketplace.json"), {}).name };
}

function claude() {
  const home = clientHome("CLAUDE_CONFIG_DIR", ".claude");
  if (!home) fail("CLAUDE_CONFIG_DIR is not set");
  const knownPath = join(home, "plugins", "known_marketplaces.json");
  const installedPath = join(home, "plugins", "installed_plugins.json");
  const settingsPath = join(home, "settings.json");
  const known = readJson(knownPath, {});
  const installed = readJson(installedPath, { version: 2, plugins: {} });
  const settings = readJson(settingsPath, {});
  const cmd = args.slice(0, 3).join(" ");
  if (cmd === "plugin marketplace add") {
    const m = localMarketplace(args[3]);
    known[m.name] = { source: { source: "directory", path: m.root }, installLocation: m.root, lastUpdated: new Date().toISOString() };
    settings.extraKnownMarketplaces = { ...settings.extraKnownMarketplaces, [m.name]: { source: { source: "directory", path: m.root } } };
    writeJson(knownPath, known);
    writeJson(settingsPath, settings);
  } else if (cmd === "plugin marketplace remove") {
    if (!known[args[3]]) fail(`marketplace ${args[3]} is not added`);
    delete known[args[3]];
    if (settings.extraKnownMarketplaces) delete settings.extraKnownMarketplaces[args[3]];
    writeJson(knownPath, known);
    writeJson(settingsPath, settings);
  } else if (args[0] === "plugin" && args[1] === "install") {
    const [plugin, market] = args[2].split("@");
    if (!known[market]) fail(`marketplace ${market} is not added`);
    const src = pluginSource(known[market].source.path, plugin);
    const dest = join(home, "plugins", "cache", market, plugin, src.version);
    cpSync(src.dir, dest, { recursive: true });
    installed.plugins[args[2]] = [{ scope: "user", installPath: dest, version: src.version, installedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() }];
    settings.enabledPlugins = { ...settings.enabledPlugins, [args[2]]: true };
    writeJson(installedPath, installed);
    writeJson(settingsPath, settings);
  } else if (args[0] === "plugin" && args[1] === "uninstall") {
    if (!installed.plugins[args[2]]) fail(`${args[2]} is not installed`);
    delete installed.plugins[args[2]];
    if (settings.enabledPlugins) delete settings.enabledPlugins[args[2]];
    writeJson(installedPath, installed);
    writeJson(settingsPath, settings);
  } else fail(`unsupported command: ${args.join(" ")}`);
}

// config.toml as an ordered list of [header, lines] sections, enough for the sections this stand-in writes.
function readToml(path) {
  const sections = [];
  if (!existsSync(path)) return sections;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("[")) sections.push([line, []]);
    else if (line.trim() && sections.length) sections.at(-1)[1].push(line);
  }
  return sections;
}
const writeToml = (path, sections) => writeFileSync(path, sections.map(([h, lines]) => [h, ...lines, ""].join("\n")).join("\n"));

function codex() {
  const home = clientHome("CODEX_HOME", ".codex");
  if (!home) fail("CODEX_HOME is not set");
  if (!existsSync(home)) fail(`CODEX_HOME points to "${home}", but that path does not exist`);
  const configPath = join(home, "config.toml");
  const sections = readToml(configPath);
  const without = (header) => sections.filter(([h]) => h !== header);
  const marketRoot = (name) => {
    const s = sections.find(([h]) => h === `[marketplaces.${name}]`);
    const source = s?.[1].find((l) => l.startsWith("source = "));
    return source ? JSON.parse(source.slice("source = ".length)) : null;
  };
  const cmd = args.slice(0, 3).join(" ");
  const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
  if (cmd === "plugin marketplace add") {
    const m = localMarketplace(args[3]);
    writeToml(configPath, [...without(`[marketplaces.${m.name}]`), [`[marketplaces.${m.name}]`, ['source_type = "local"', `source = ${JSON.stringify(m.root)}`]]]);
    reply({ marketplaceName: m.name, installedRoot: m.root, alreadyAdded: false });
  } else if (cmd === "plugin marketplace remove") {
    if (!marketRoot(args[3])) fail(`marketplace ${args[3]} is not added`);
    writeToml(configPath, without(`[marketplaces.${args[3]}]`));
    reply({ marketplaceName: args[3] });
  } else if (args[0] === "plugin" && args[1] === "add") {
    const [plugin, market] = args[2].split("@");
    const root = marketRoot(market);
    if (!root) fail(`marketplace ${market} is not added`);
    const src = pluginSource(root, plugin);
    cpSync(src.dir, join(home, "plugins", "cache", market, plugin, src.version), { recursive: true });
    writeToml(configPath, [...without(`[plugins."${args[2]}"]`), [`[plugins."${args[2]}"]`, ["enabled = true"]]]);
    reply({ pluginId: args[2], version: src.version });
  } else if (args[0] === "plugin" && args[1] === "remove") {
    const [plugin, market] = args[2].split("@");
    rmSync(join(home, "plugins", "cache", market, plugin), { recursive: true, force: true });
    writeToml(configPath, without(`[plugins."${args[2]}"]`));
    reply({ pluginId: args[2] });
  } else fail(`unsupported command: ${args.join(" ")}`);
}

if (client === "claude") claude();
else if (client === "codex") codex();
else fail("the first argument must be claude or codex");
