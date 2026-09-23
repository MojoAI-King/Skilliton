// commands/doctor.mjs: `skilliton doctor` (docs/CONTRACTS.md section 6). One line per check, writes nothing.
// What it reads is lib/doctor.mjs; this file decides what is required, prints the lines, and returns the verdict.
//
// What doctor runs, and why it sometimes does not: `claude --version`, then `claude plugin list --help` to see
// whether `--json` exists, then `claude plugin list --json` and `claude plugin marketplace list --json`.
// Measured on Claude Code 2.1.92: under a home directory where Claude Code has never run, the first
// `claude plugin list` creates ~/.claude.json (and a backup of it); where it has run, a repeat changed nothing,
// and `claude --version` wrote nothing either way. So doctor calls the plugin commands only when ~/.claude.json
// already exists, and otherwise reads Claude Code's local files, labelled as an undocumented format.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, KNOWN_SECTIONS, LAYOUT_VERSION, configProblems, readProjectConfig, resolveProject, templateVars } from "../lib/config.mjs";
import { LEGACY_NAME } from "../lib/legacy-names.mjs";
import { PLUGIN_ROOT, Refused, SKILLS_REPO, argPath, cmpVersion, isFile, isPlainObject, listDirNames, parseArgs, readBytes, readJsonMaybe, readPluginVersion, refuse, resolveExistingDir, runProgram, say, selfCommand, sha12, tilde, which } from "../lib/core.mjs";
import { HARNESS_FILES, HARNESS_TEMPLATE, findBlock, legacyBlockLine, readHarnessTemplate, templateBody } from "../lib/harness.mjs";
import { basePluginDirs, catalogPluginVersion, claudeConfig, findEditorCopies, gatherPluginRecords, listHookFiles, listPluginHookFiles, readCatalog, readTeamTemplate, referencesTool, settingsFiles, versionOf } from "../lib/doctor.mjs";

export const help = `doctor: check this machine and one project for Skilliton, one line per check. Writes nothing.

  doctor [--dir <project folder>]

Checks: Claude Code on PATH and its version, plus any copy inside a VS Code, Cursor, or Windsurf extension (the
two can differ); whether the marketplace named in this repo's .claude-plugin/marketplace.json is added, and which
base plugins are installed and enabled (run from an installed copy, the catalog is that of the marketplace the copy
came from, and each base plugin's installed version is compared with the marketplace's); Claude Code's files are
read from CLAUDE_CONFIG_DIR when it is set, else ~/.claude, and the header says which; whether auto-update is on for it; whether CLAUDE.md and AGENTS.md hold
the current harness block; whether .skilliton/config.json parses; whether .claude/settings.json declares the
marketplace and plugins; and the tools the hooks call (jq, node, python3, git).

Each line starts with OK, MISSING, WARN, or UNVERIFIED. A line ending in [required] is a required check that is
not OK. Exit 0 when every required check is OK, 1 otherwise; the last line says what to do next.`;

// The checks, in the order doctor prints them. Each is a named function of one shared context: the project folder,
// report(), and what an earlier check found (the claude command, the plugin records, the catalog). An entry with a
// label is guarded: a check that throws is reported as a check that could not run, never skipped. An entry without
// one is a step that only gathers or prints what later checks read, and its own failures are handled inside it.
const CHECKS = [
  { run: findEditors },
  { label: "Claude Code (terminal)", required: true, run: checkTerminal },
  { run: reportEditors },
  { run: readMarketplaceInputs },
  { label: "plugin records", required: false, run: checkPluginRecords },
  { label: (c) => `marketplace ${c.market}`, required: true, run: checkMarketplace },
  { label: "base plugins", required: true, run: checkBasePlugins },
  { label: "skills repo catalog", required: false, run: checkSkillsRepoCatalog },
  { label: (c) => `auto-update (${c.market})`, required: false, run: checkAutoUpdate },
  { label: "harness template", required: true, run: (c) => { c.harnessTemplate = readHarnessTemplate(HARNESS_TEMPLATE); } },
  { run: readHarnessVars },
  ...HARNESS_FILES.map((name) => ({ label: name, required: true, run: (c) => checkHarnessFile(c, name) })),
  { label: ".skilliton/config.json", required: true, run: checkConfig },
  { label: "project layout", required: false, run: checkLayout },
  { label: ".claude/settings.json", required: false, run: checkProjectSettings },
  { label: "hook tools", required: true, run: checkHookTools },
];

export async function run(argv) {
  const o = parseArgs(argv, { flags: [], options: ["dir"] }, "doctor");
  if (o.help) { say(help); return 0; }
  if (o._.length) refuse(`doctor takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} doctor --help`);
  const dir = resolveExistingDir(o.dir, "--dir");
  const checks = [];
  const report = (status, label, detail, { required = false, next = null } = {}) => {
    checks.push({ status, label, required, next });
    say(`${status.padEnd(10)} ${label}: ${detail}${required && status !== "OK" ? " [required]" : ""}`);
  };
  const ctx = { dir, dirArg: o.dir ? ` --dir ${argPath(dir)}` : "", report, editors: [], editorsError: null, cli: null, records: null, harnessTemplate: null, harnessVars: null, varsProblem: null };

  say("skilliton doctor (writes nothing)");
  say(`project: ${tilde(dir)}`);
  say(`skills repo: ${SKILLS_REPO ? tilde(SKILLS_REPO) : "none (this is an installed copy of the runtime)"}`);
  say(`runtime: workflow ${readPluginVersion(PLUGIN_ROOT) ?? "(version unreadable)"} at ${tilde(PLUGIN_ROOT)}`);
  const config = claudeConfig();
  say(`claude config: ${config.custom ? `${config.label} (from CLAUDE_CONFIG_DIR)` : "~/.claude (CLAUDE_CONFIG_DIR is not set)"}`);
  say("");

  for (const check of CHECKS) {
    if (!check.label) { check.run(ctx); continue; }
    const label = typeof check.label === "function" ? check.label(ctx) : check.label;
    try { check.run(ctx); } catch (e) {
      report("UNVERIFIED", label, `this check could not run (${e.message})`, { required: check.required, next: `rerun doctor with SKILLITON_DEBUG=1 and report the "${label}" failure` });
      if (process.env.SKILLITON_DEBUG) console.error(e.stack);
    }
  }

  const failing = checks.filter((c) => c.required && c.status !== "OK");
  const notes = checks.filter((c) => !c.required && c.status !== "OK").length;
  say("");
  if (!failing.length) {
    say(`Summary: everything required is in place.${notes ? ` ${notes} other line(s) above are WARN or UNVERIFIED; they do not block anything, but read them.` : ""}`);
    return 0;
  }
  const steps = [...new Set(failing.map((c) => c.next).filter(Boolean))];
  say(`Summary: ${failing.length} required check(s) need attention. Next: ${steps.length ? steps.join("; then ") : "read the lines marked [required]"}; then run doctor again.`);
  return 1;
}

// ---------------------------------------------------------------- Claude Code, in the terminal and inside editors

function findEditors(c) {
  try { c.editors = findEditorCopies(); } catch (e) { c.editorsError = e.message; }
}

function checkTerminal(c) {
  const path = which("claude");
  if (path) {
    const r = runProgram(path, ["--version"]);
    const version = r.ok ? versionOf(r.stdout) : null;
    if (version) { c.cli = { path, version }; c.report("OK", "Claude Code (terminal)", `${version} at ${tilde(path)}`, { required: true }); }
    else c.report("WARN", "Claude Code (terminal)", `${tilde(path)} exists, but "claude --version" ${r.ok ? "printed no version" : `failed: ${r.failure}`}`, { required: true, next: "reinstall Claude Code" });
  } else if (c.editors.some((e) => e.version)) {
    c.report("WARN", "Claude Code (terminal)", `"claude" is not on PATH, so terminal commands such as "claude plugin" are unavailable; an editor extension has its own copy`);
  } else {
    c.report("MISSING", "Claude Code", `"claude" is not on PATH and no editor extension copy was found`, { required: true, next: "install Claude Code" });
  }
}

function reportEditors(c) {
  const { editors, cli, report } = c;
  if (c.editorsError) report("UNVERIFIED", "Claude Code (editor)", `could not look for editor copies (${c.editorsError})`);
  else if (!editors.length) report("OK", "Claude Code (editor)", "no VS Code, Cursor, or Windsurf extension copy found; nothing to compare");
  for (const e of editors) {
    if (!e.version) report("UNVERIFIED", "Claude Code (editor)", `${tilde(e.where)}: version unknown (${e.failure})`);
    else if (cli && e.version !== cli.version) report("WARN", "Claude Code (editor)", `${e.version} in ${tilde(e.where)}, but the terminal has ${cli.version}; features and plugin commands can differ between the two, so update whichever is older`);
    else report("OK", "Claude Code (editor)", `${e.version} in ${tilde(e.where)}${cli ? " (same as the terminal)" : ""}`);
  }
  if (!cli) {
    const newest = editors.filter((e) => e.version).sort((a, b) => cmpVersion(a.version, b.version)).pop();
    if (newest) c.cli = { path: newest.path, version: newest.version };
  }
}

// ---------------------------------------------------------------- marketplace, base plugins, auto-update

function readMarketplaceInputs(c) {
  c.catalog = readCatalog();
  c.market = c.catalog.name ?? "skilliton";
  c.template = readTeamTemplate();
  c.templateRepo = c.template ? Object.values(c.template.extraKnownMarketplaces ?? {}).map((m) => m?.source?.repo).find((r) => typeof r === "string") : null;
}

function checkPluginRecords(c) {
  c.records = gatherPluginRecords(c.cli, c.dir);
  c.report(c.records.status, "plugin records", c.records.detail);
}

function checkMarketplace(c) {
  const { catalog, market, records, report } = c;
  if (catalog.error) report("WARN", "marketplace catalog", `${catalog.error}; assuming the marketplace is named "skilliton"`);
  else if (catalog.installed) report("OK", "marketplace catalog", `read from ${tilde(catalog.path)}, the ${market} marketplace this copy was installed from`);
  if (!records) { report("UNVERIFIED", `marketplace ${market}`, "not checked: plugin records could not be read", { required: true, next: "fix the plugin records problem above" }); return; }
  const m = records.marketplaces.find((x) => x.name === market);
  const source = m && (m.repo ? `github ${m.repo}` : m.path ? `folder ${tilde(m.path)}` : `source ${m.source ?? "not reported"}`);
  if (m) report("OK", `marketplace ${market}`, `added (${source})`, { required: true });
  else report("MISSING", `marketplace ${market}`, "not added on this machine", { required: true, next: `add the ${market} marketplace: ${c.templateRepo ? `claude plugin marketplace add ${c.templateRepo}` : "/plugin inside Claude Code"}` });
}

function checkBasePlugins(c) {
  const { catalog, market, records, report } = c;
  const baseDirs = basePluginDirs();
  const base = catalog.plugins.filter((p) => baseDirs.includes(p.name) || (typeof p.source === "string" && p.source.replace(/^\.\//, "").startsWith("packs/base/")));
  if (!records || !base.length) {
    if (records && catalog.installed && catalog.error) { report("UNVERIFIED", "base plugins", `not checked: ${catalog.error}`, { required: true, next: `add the marketplace this copy came from (claude plugin marketplace add <owner>/<repo>, or /plugin inside Claude Code), or run doctor from the company skills repository checkout` }); return; }
    report("UNVERIFIED", "base plugins", !records ? "not checked: plugin records could not be read" : !SKILLS_REPO ? "not checked from an installed copy: run doctor from the company skills repository checkout to compare against its catalog" : "the catalog lists no plugin from packs/base, so there is nothing to check", { required: true, next: "list the base plugins in .claude-plugin/marketplace.json of the skills repo" });
    return;
  }
  for (const bp of base) {
    const id = `${bp.name}@${market}`;
    const rec = records.plugins.find((p) => p.id === id);
    const checkout = SKILLS_REPO ? readPluginVersion(join(SKILLS_REPO, "packs", "base", "plugins", bp.name)) : null;
    // From an installed copy the comparison is with the marketplace it came from, and a difference is a finding: the
    // marketplace has a version this machine has not installed. A checkout may be ahead of what is installed on
    // purpose (it is where plugins are developed), so there its version is shown and not held against the install.
    const offered = catalog.installed ? catalogPluginVersion(catalog, bp) : null;
    const here = checkout ? `; this checkout has ${checkout}` : offered ? `; the ${market} marketplace has ${offered}` : "";
    if (!rec) report("MISSING", id, `not installed${here}`, { required: true, next: `install the missing base plugins: claude plugin install <plugin>@${market} (or /plugin inside Claude Code)` });
    else if (rec.enabled === true && offered && rec.version && rec.version !== offered) report("WARN", id, `installed ${rec.version}, enabled, but the ${market} marketplace has ${offered}`, { required: true, next: `update the base plugins to the marketplace's versions: claude plugin update <plugin>@${market}` });
    else if (rec.enabled === true) report("OK", id, `installed ${rec.version ?? "(version not reported)"}${rec.scope ? ` (${rec.scope} scope)` : ""}, enabled${here}`, { required: true });
    else report("WARN", id, `installed ${rec.version ?? "(version not reported)"} but ${rec.enabled === false ? "disabled" : "not enabled in any settings file doctor reads"}${here}`, { required: true, next: `enable the disabled base plugins: claude plugin enable <plugin>@${market} (or /plugin inside Claude Code)` });
  }
}

function checkSkillsRepoCatalog(c) {
  const { catalog, market, template } = c;
  if (!SKILLS_REPO) { c.report("OK", "skills repo catalog", "not applicable: an installed copy has no skills repository checkout whose plugin folders could go unlisted"); return; }
  const listed = catalog.plugins.map((p) => p.name);
  const pluginDirs = SKILLS_REPO ? listDirNames(join(SKILLS_REPO, "packs")).flatMap((pack) => listDirNames(join(SKILLS_REPO, "packs", pack, "plugins")).map((name) => ({ pack, name }))) : [];
  const enabledByTemplate = isPlainObject(template?.enabledPlugins) ? Object.keys(template.enabledPlugins).map((id) => id.split("@")[0]) : [];
  const templateMarkets = isPlainObject(template?.extraKnownMarketplaces) ? Object.keys(template.extraKnownMarketplaces) : [];
  const problems = [];
  const unlisted = pluginDirs.filter((d) => !listed.includes(d.name));
  const notInCatalog = enabledByTemplate.filter((n) => !listed.includes(n));
  if (unlisted.length) problems.push(`${unlisted.map((d) => `packs/${d.pack}/plugins/${d.name}`).join(", ")} ${unlisted.length === 1 ? "is" : "are"} not listed in .claude-plugin/marketplace.json, so ${unlisted.length === 1 ? "it cannot" : "they cannot"} be installed`);
  if (notInCatalog.length) problems.push(`templates/project-settings.json enables ${notInCatalog.join(", ")}, which the catalog does not list`);
  if (templateMarkets.length && !templateMarkets.includes(market)) problems.push(`templates/project-settings.json names the marketplace ${templateMarkets.join(", ")}, but the catalog is named ${market}`);
  if (problems.length) c.report("WARN", "skills repo catalog", problems.join("; "));
  else c.report("OK", "skills repo catalog", `lists all ${pluginDirs.length} plugin folder(s) under packs/ and every plugin the team template enables`);
}

function checkAutoUpdate(c) {
  const { market, records, report } = c;
  const label = `auto-update (${market})`;
  const how = `open /plugin inside Claude Code and look at the ${market} marketplace's auto-update setting`;
  const m = records?.marketplaces.find((x) => x.name === market);
  if (!m) { report("UNVERIFIED", label, "the marketplace is not added, so there is nothing to check yet"); return; }
  if (records.marketplacesFromCli && typeof m.autoUpdate === "boolean") { report(m.autoUpdate ? "OK" : "WARN", label, `${m.autoUpdate ? "on" : "off"} (reported by claude plugin marketplace list)`); return; }
  const local = records.local.knownRaw[market];
  if (typeof local?.autoUpdate === "boolean") { report(local.autoUpdate ? "OK" : "WARN", label, `${local.autoUpdate ? "on" : "off"} (read from Claude Code's local files; format not documented)`); return; }
  const declared = settingsFiles(c.dir).flatMap((f) => {
    const v = readJsonMaybe(f.path, [])?.extraKnownMarketplaces?.[market]?.autoUpdate;
    return typeof v === "boolean" ? [`${f.label} declares autoUpdate: ${v}`] : [];
  });
  report("UNVERIFIED", label, `not recorded anywhere doctor can read${declared.length ? `; ${declared.join(", ")}, but whether Claude Code applied it is not confirmed` : ""}. To check: ${how}`);
}

// ---------------------------------------------------------------- the harness block in this project

function readHarnessVars(c) {
  try { c.harnessVars = templateVars(resolveProject(c.dir, { allowLegacy: true })); } catch (e) { if (!(e instanceof ConfigError)) throw e; c.varsProblem = e.message; }
}

function checkHarnessFile(c, name) {
  const { report, dirArg } = c;
  const writeHarness = `write the harness block: ${selfCommand()} harness --apply${dirArg}`;
  if (!c.harnessTemplate) { report("UNVERIFIED", name, "not compared: the harness template could not be read", { required: true, next: "reinstall the workflow plugin, or restore packs/base/plugins/workflow/templates/harness.md in the skills repo" }); return; }
  if (!c.harnessVars) { report("UNVERIFIED", name, `not compared: the block names this project's record files, and the project configuration cannot be used (${c.varsProblem})`, { required: true, next: "fix .skilliton/config.json as described, then run doctor again" }); return; }
  const path = join(c.dir, name);
  if (!isFile(path)) { report("MISSING", name, "does not exist, so it has no harness block", { required: true, next: writeHarness }); return; }
  const text = readBytes(path);
  const legacyLine = legacyBlockLine(text);
  if (legacyLine) { report("WARN", name, `line ${legacyLine} holds a harness block written under the earlier ${LEGACY_NAME} names`, { required: true, next: `move the project to the Skilliton names: ${selfCommand()} migrate${dirArg}` }); return; }
  let found;
  try { found = findBlock(text, name); } catch (e) {
    if (!(e instanceof Refused)) throw e;
    report("WARN", name, e.message, { required: true, next: `fix the harness markers by hand as described, then ${writeHarness}` });
    return;
  }
  if (!found) { report("MISSING", name, "has no harness block", { required: true, next: writeHarness }); return; }
  const have = sha12(text.slice(found.innerStart, found.innerEnd).replace(/\r\n/g, "\n")), want = sha12(templateBody(c.harnessTemplate, c.harnessVars));
  if (have === want && found.version === "1") report("OK", name, `harness block present and matches the current template (sha256 ${have})`, { required: true });
  else report("WARN", name, `harness block differs from the current template (block sha256 ${have}${found.version !== "1" ? `, marker v${found.version}` : ""}; template sha256 ${want})`, { required: true, next: writeHarness });
}

// ---------------------------------------------------------------- project configuration

function checkConfig(c) {
  const { dir, dirArg, report } = c;
  const label = ".skilliton/config.json";
  let read;
  try { read = readProjectConfig(dir); } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    report(e.kind === "failed" ? "UNVERIFIED" : "WARN", label, e.message, { required: true, next: "fix .skilliton/config.json as described" });
    return;
  }
  if (read.legacy) { report("WARN", label, `not present: this project keeps its configuration in the earlier ${read.rel} until it is migrated`, { required: true, next: `move it to the Skilliton names: ${selfCommand()} migrate --apply${dirArg}` }); return; }
  if (!read.exists) { report("OK", label, "not present; every key has a default (a prepared project has one; see the project layout line)"); return; }
  const problems = configProblems(read.config);
  const sections = Object.keys(read.config);
  if (problems.length) report("WARN", label, `parses, but: ${problems.join("; ")}`, { required: true, next: "fix .skilliton/config.json as described" });
  else {
    try { resolveProject(dir, { allowLegacy: true }); report("OK", label, `parses and every record path is usable; sections: ${sections.length ? sections.join(", ") : "none"}`); }
    catch (e) { if (!(e instanceof ConfigError)) throw e; report("WARN", label, e.message, { required: true, next: "fix .skilliton/config.json as described" }); }
  }
  const unknown = sections.filter((x) => !KNOWN_SECTIONS.includes(x));
  if (unknown.length) report("WARN", label, `unknown section(s) ${unknown.join(", ")} (known: ${KNOWN_SECTIONS.join(", ")}); a misspelled section is ignored silently by the components`);
}

function checkLayout(c) {
  const { dir, dirArg, report } = c;
  let project;
  try { project = resolveProject(dir, { allowLegacy: true }); } catch (e) { if (!(e instanceof ConfigError)) throw e; report("UNVERIFIED", "project layout", "not checked: the project configuration cannot be used (see above)"); return; }
  const installed = readPluginVersion(PLUGIN_ROOT);
  if (project.legacyNames) report("WARN", "project layout", `layout ${project.layoutVersion ?? "unknown"} under the earlier ${LEGACY_NAME} names (${project.configRel}); until it is migrated, only migrate, status and doctor work in this project`, { required: true, next: `move it to the Skilliton names: ${selfCommand()} migrate --apply${dirArg}` });
  else if (project.layoutVersion === null) report("WARN", "project layout", `not prepared by Skilliton (no prepare.version). To adopt this project's records and add the missing ones: ${selfCommand()} prepare${dirArg}`);
  else if (project.layoutVersion < LAYOUT_VERSION) report("WARN", "project layout", `layout ${project.layoutVersion}, and this runtime writes layout ${LAYOUT_VERSION}; preview the migration: ${selfCommand()} migrate${dirArg}`, { required: true, next: `migrate the project layout: ${selfCommand()} migrate --apply${dirArg}` });
  else report("OK", "project layout", `layout ${project.layoutVersion} (current for this runtime)`);
  for (const [plugin, minimum] of Object.entries(project.requires)) {
    const have = plugin === "workflow" ? installed : null;
    if (!have) report("UNVERIFIED", `requires ${plugin}`, `the project needs ${plugin} ${minimum} or later; this check can read only the workflow runtime it runs from`);
    else if (cmpVersion(have, minimum) < 0) report("WARN", `requires ${plugin}`, `the project needs ${plugin} ${minimum} or later, and this runtime is ${have}`, { required: true, next: `update the ${plugin} plugin (claude plugin update ${plugin}@<marketplace>)` });
    else report("OK", `requires ${plugin}`, `the project needs ${minimum} or later; this runtime is ${have}`);
  }
}

function checkProjectSettings(c) {
  const { dir, dirArg, market, template, report } = c;
  const path = join(dir, ".claude", "settings.json");
  const expected = isPlainObject(template?.enabledPlugins) ? Object.keys(template.enabledPlugins).map((id) => `${id.split("@")[0]}@${market}`) : [];
  const fix = `to write it: ${selfCommand()} project-settings --apply${dirArg}`;
  if (!isFile(path)) { report("WARN", ".claude/settings.json", `not present, so this project does not declare the ${market} marketplace or enable its plugins for the people who open it (${fix})`); return; }
  let s;
  try { s = JSON.parse(readFileSync(path, "utf8")); } catch (e) { report("WARN", ".claude/settings.json", `does not parse (${e.message})`); return; }
  const hasMarket = isPlainObject(s?.extraKnownMarketplaces?.[market]);
  const notEnabled = expected.filter((id) => s?.enabledPlugins?.[id] !== true);
  if (hasMarket && !notEnabled.length) report("OK", ".claude/settings.json", `declares the ${market} marketplace and enables ${expected.length ? expected.join(", ") : "every plugin the template enables (none)"}`);
  else report("WARN", ".claude/settings.json", [hasMarket ? null : `does not declare the ${market} marketplace`, notEnabled.length ? `does not enable ${notEnabled.join(", ")}` : null].filter(Boolean).join("; ") + ` (${fix})`);
}

// ---------------------------------------------------------------- tools the hooks call

// A tool is required only when a hook file in this repo calls it.
function checkHookTools(c) {
  const hookFiles = SKILLS_REPO ? listHookFiles(SKILLS_REPO) : listPluginHookFiles(PLUGIN_ROOT);
  for (const tool of ["jq", "node", "python3", "git"]) {
    const found = which(tool);
    const users = hookFiles.filter((f) => referencesTool(f.text, tool)).map((f) => f.name);
    const usage = users.length ? `called by ${users.length} hook file(s): ${users.join(", ")}` : `no hook file in this repo calls it today (checked ${hookFiles.length})`;
    if (found) c.report("OK", tool, `${tilde(found)}; ${usage}`);
    else if (users.length) c.report("MISSING", tool, `not found on PATH; ${usage}`, { required: true, next: `install ${tool}` });
    else c.report("WARN", tool, `not found on PATH; ${usage}`);
  }
}
