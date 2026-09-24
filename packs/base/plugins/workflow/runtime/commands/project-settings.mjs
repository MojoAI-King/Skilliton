// commands/project-settings.mjs: `skilliton project-settings` (docs/CONTRACTS.md section 6). Builds the team
// .claude/settings.json from the company template and merges it into the project, template values winning.
// buildTeamSettings stays in lib/core.mjs because lib/fork.mjs builds the same file when a company forks.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ConfigError, readProjectConfig } from "../lib/config.mjs";
import { LEGACY_NAME } from "../lib/legacy-names.mjs";
import { argPath, backupFile, buildTeamSettings, clone, isFile, isPlainObject, linkedWriteProblem, newStamp, parseArgs, readJsonObject, refuse, requireSkillsRepo, resolveExistingDir, sameJson, say, selfCommand, statOrNull, tilde } from "../lib/core.mjs";

export const help = `project-settings: show or write the team .claude/settings.json, which declares the company marketplace
(auto-update on) and enables the base plugins for the project.

  project-settings            list every key it would add or change, and print the resulting file; writes nothing
  project-settings --apply    back up an existing file, then write the merged result

Options:
  --dir <folder>                  the project folder (default: the current folder)
  --marketplace-repo owner/repo   point the marketplace at a fork's GitHub repository
  --marketplace-name <name>       rename the marketplace, including the @<name> ending of every enabled plugin
  --template <file>               default: templates/project-settings.json in the skills repo

Merging keeps every key already in the file, including other marketplaces and plugins, and never removes one.
Keys the template sets take the template's value (each change is listed first); a marketplace "source" is replaced
as a whole. An existing file that is not valid JSON is refused (exit 2) and left untouched.`;

const keyPath = (parts) => parts.map((k, i) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? `${i ? "." : ""}${k}` : `[${JSON.stringify(k)}]`)).join("");
const isAtomicSettingsPath = (parts) => parts.length === 3 && parts[0] === "extraKnownMarketplaces" && parts[2] === "source";

// Merge source into target in place, template values winning; returns one line per added or changed key.
function mergeSettings(target, source, parts = [], changes = []) {
  for (const [key, value] of Object.entries(source)) {
    const here = [...parts, key];
    const has = Object.prototype.hasOwnProperty.call(target, key);
    if (isPlainObject(value) && !isAtomicSettingsPath(here)) {
      if (!has) target[key] = {};
      else if (!isPlainObject(target[key])) refuse(`the existing ${keyPath(here)} is ${JSON.stringify(target[key])}, not an object, so the template cannot be merged into it; fix it by hand`);
      mergeSettings(target[key], value, here, changes);
    } else if (!has) {
      target[key] = clone(value);
      changes.push(`add    ${keyPath(here)} = ${JSON.stringify(value)}`);
    } else if (!sameJson(target[key], value)) {
      changes.push(`change ${keyPath(here)}: ${JSON.stringify(target[key])} -> ${JSON.stringify(value)}`);
      target[key] = clone(value);
    }
  }
  return changes;
}

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["dir", "marketplace-repo", "marketplace-name", "template"] }, "project-settings");
  if (o.help) { say(help); return 0; }
  if (o._.length) refuse(`project-settings takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} project-settings --help`);
  const dir = resolveExistingDir(o.dir, "--dir");
  // A project under the earlier names has marketplace keys that its migration renames; merging the current template
  // first would leave two entries for the migration to choose between.
  let config;
  try { config = readProjectConfig(dir); } catch (e) { if (e instanceof ConfigError) refuse(e.message); throw e; }
  if (config.legacy) refuse(`this project still uses the earlier ${LEGACY_NAME} names (${config.rel}). Nothing was written. Move it first: ${selfCommand()} migrate --dir ${argPath(dir)}, then run project-settings again`);
  const templatePath = resolve(o.template ?? join(requireSkillsRepo("pass --template <file>"), "templates", "project-settings.json"));
  const template = readJsonObject(templatePath, "settings template");
  const { settings: team, marketplace, original } = buildTeamSettings(template, o["marketplace-repo"], o["marketplace-name"]);

  const path = join(dir, ".claude", "settings.json");
  const linked = linkedWriteProblem(dir, ".claude/settings.json");
  if (linked) refuse(`${linked}. Nothing was read or written. Replace it with the file itself, then run again.`);
  const st = statOrNull(path);
  if (st && !st.isFile()) refuse(`${tilde(path)} exists but is not a regular file`);
  const beforeText = st ? readFileSync(path, "utf8") : "";
  let existing = {};
  if (beforeText.trim()) {
    try { existing = JSON.parse(beforeText); } catch (e) { refuse(`${tilde(path)} is not valid JSON, so it was left untouched (${e.message}). Fix it by hand, then run again.`); }
    if (!isPlainObject(existing)) refuse(`${tilde(path)} does not hold a JSON object, so it was left untouched`);
  }
  const merged = clone(existing);
  const changes = mergeSettings(merged, team);
  const resultText = changes.length ? JSON.stringify(merged, null, 2) + "\n" : beforeText;
  const again = `${o.dir ? ` --dir ${argPath(dir)}` : ""}${o["marketplace-repo"] ? ` --marketplace-repo ${o["marketplace-repo"]}` : ""}${o["marketplace-name"] ? ` --marketplace-name ${o["marketplace-name"]}` : ""}${o.template ? ` --template ${argPath(templatePath)}` : ""}`;

  say(`project-settings (${o.apply ? "apply" : "show"}): ${tilde(path)} ${st ? "exists" : "does not exist yet"}`);
  say(`template: ${tilde(templatePath)}; marketplace: ${marketplace ?? "(none declared)"}`);
  if (original && marketplace !== original) {
    const leftovers = [
      ...(isPlainObject(existing.extraKnownMarketplaces) && Object.hasOwn(existing.extraKnownMarketplaces, original) ? [keyPath(["extraKnownMarketplaces", original])] : []),
      ...(isPlainObject(existing.enabledPlugins) ? Object.keys(existing.enabledPlugins).filter((id) => id.endsWith(`@${original}`)).map((id) => keyPath(["enabledPlugins", id])) : []),
    ];
    if (leftovers.length) say(`note: the existing ${leftovers.join(", ")} stay (this command never removes entries). If ${marketplace} replaces ${original}, delete them by hand.`);
  }
  say("");
  if (!changes.length) {
    say("The file already has every key the template sets; nothing to change, nothing written.");
    return 0;
  }
  say(`${changes.length} key(s) to add or change:`);
  for (const c of changes) say(`  ${c}`);
  say("");
  say("Resulting .claude/settings.json:");
  process.stdout.write(resultText);
  say("");
  if (!o.apply) { say(`Nothing written. To write it: ${selfCommand()} project-settings --apply${again}`); return 0; }
  mkdirSync(dirname(path), { recursive: true });
  if (st) say(`backed up to ${tilde(backupFile("project-settings", path, newStamp()))}`);
  writeFileSync(path, resultText);
  say(`wrote ${tilde(path)}`);
  say("Commit this file so the project carries these settings for everyone. How Claude Code offers the marketplace on a machine that has never added it is not verified yet.");
  return 0;
}
