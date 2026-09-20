// skills-repo.mjs: finding a plugin inside a company skills repository and bumping its version. Shared by
// commands/new-skill.mjs and commands/import.mjs, which both add a skill to a plugin and then bump it, so an
// installed copy of that plugin updates. Node only, no dependencies.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupFile, isDir, isFile, listDirNames, newStamp, refuse, sameJson, say, selfCommand, tilde, validateName } from "./core.mjs";

const BASE_NOTE = "note: packs/base is the upstream base pack. A company fork leaves packs/base unchanged and adds its own skills under packs/<company>/plugins/, so upstream updates merge cleanly (docs/CONTRACTS.md).";

function findPlugin(repo, plugin, pack) {
  validateName(plugin, "plugin name");
  if (pack !== undefined) validateName(pack, "--pack");
  const packs = pack !== undefined ? [pack] : listDirNames(join(repo, "packs"));
  const hits = packs.filter((p) => isDir(join(repo, "packs", p, "plugins", plugin)));
  if (!hits.length) {
    const known = listDirNames(join(repo, "packs")).flatMap((p) => listDirNames(join(repo, "packs", p, "plugins")).map((n) => `${n} (pack ${p})`));
    refuse(`no plugin "${plugin}" under packs/${pack ?? "*"}/plugins/ in ${tilde(repo)}. Plugins that exist: ${known.length ? known.join(", ") : "none"}. To create it: ${selfCommand()} new-plugin ${plugin} --pack ${pack ?? "<pack>"} --apply`);
  }
  if (hits.length > 1) refuse(`plugin "${plugin}" exists in more than one pack (${hits.join(", ")}); add --pack <pack> to choose one`);
  const rel = `packs/${hits[0]}/plugins/${plugin}`;
  const dir = join(repo, "packs", hits[0], "plugins", plugin);
  const manifest = join(dir, ".claude-plugin", "plugin.json");
  if (!isFile(manifest)) refuse(`${rel} has no .claude-plugin/plugin.json, so its version cannot be bumped`);
  return { name: plugin, pack: hits[0], dir, rel, manifest, manifestRel: `${rel}/.claude-plugin/plugin.json` };
}

// Plan a patch bump that changes only the version characters of plugin.json, so its formatting survives.
function planVersionBump(manifest, label) {
  const text = readFileSync(manifest, "utf8");
  let obj;
  try { obj = JSON.parse(text); } catch (e) { refuse(`${label} is not valid JSON (${e.message}); fix it first`); }
  const version = obj?.version;
  if (typeof version !== "string") refuse(`${label} has no "version" string; add one (for example "version": "0.1.0") first`);
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) refuse(`${label} has version "${version}", which is not plain MAJOR.MINOR.PATCH, so it cannot be bumped automatically; bump it by hand`);
  const to = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  const re = new RegExp(`("version"\\s*:\\s*")${version.replace(/\./g, "\\.")}(")`, "g");
  const count = (text.match(re) || []).length;
  if (count !== 1) refuse(`${label} has ${count} "version": "${version}" entries; expected exactly one, so a bump would be a guess. Bump it by hand.`);
  const nextText = text.replace(re, (_, open, close) => `${open}${to}${close}`);
  const check = JSON.parse(nextText);
  if (check.version !== to || !sameJson({ ...check, version }, obj)) refuse(`bumping ${label} did not produce the expected file; bump it by hand`);
  return { from: version, to, nextText };
}

function writeVersionBump(command, plugin, bump) {
  say(`backed up ${plugin.manifestRel} to ${tilde(backupFile(command, plugin.manifest, newStamp()))}`);
  writeFileSync(plugin.manifest, bump.nextText);
  say(`bumped ${plugin.name} version ${bump.from} -> ${bump.to} (installed copies only update when the version changes)`);
}

export { BASE_NOTE, findPlugin, planVersionBump, writeVersionBump };
