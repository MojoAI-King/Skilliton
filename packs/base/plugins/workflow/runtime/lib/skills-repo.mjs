// skills-repo.mjs: finding a plugin inside a company skills repository and bumping its version. Shared by
// commands/new-skill.mjs and commands/import.mjs, which both add a skill to a plugin and then bump it, so an
// installed copy of that plugin updates. Node only, no dependencies.

import { lstatSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { backupFile, isDir, isFile, listDirNames, newStamp, refuse, sameJson, say, selfCommand, tilde, validateName } from "./core.mjs";

const BASE_NOTE = "note: packs/base is the upstream base pack. A company fork leaves packs/base unchanged and adds its own skills under packs/<company>/plugins/, so upstream updates merge cleanly (docs/CONTRACTS.md).";

const isInside = (child, parent) => { const r = relative(parent, child); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

// Refuses (exit 2) unless every existing component of `parts`, walked from the repository root down, is a real entry
// (lstat, never a symbolic link) whose real path is inside the repository. A writer that followed a linked `skills`
// folder would create the skill wherever the link points while printing the in-repository path, then bump the
// version for a skill the repository does not hold. The walk stops at the first component that does not exist yet:
// whatever is created below it is created inside a folder already proved to be in the repository. The root itself
// may be reached through a link (a temporary folder often is); only what is below it is checked.
function proveInside(repo, parts, command) {
  const rootReal = realpathSync(repo);
  let at = repo, rel = "";
  for (const part of parts) {
    at = join(at, part);
    rel = rel ? `${rel}/${part}` : part;
    let st;
    try { st = lstatSync(at); } catch (e) { if (e.code === "ENOENT") return; throw e; }
    if (st.isSymbolicLink()) {
      let target = "an unreadable target";
      try { target = readlinkSync(at); } catch { /* keep the fallback */ }
      refuse(`${rel} is a symbolic link (to ${tilde(target)}), and ${command} writes only inside the repository, never through a link. `
        + "Nothing was written. Replace the link with the folder itself, then run again.");
    }
    const real = realpathSync(at);
    if (!isInside(real, rootReal)) {
      refuse(`${rel} resolves to ${tilde(real)}, outside the repository ${tilde(rootReal)}, and ${command} writes only inside it. Nothing was written.`);
    }
  }
}

// The folder a new skill goes to, proved inside the repository at every component, with the plugin's manifest (the
// file the version bump writes) proved the same way. Call before writing anything, in preview and --apply alike.
function skillDestination(repo, plugin, skillName, command) {
  const parts = ["packs", plugin.pack, "plugins", plugin.name];
  proveInside(repo, [...parts, ".claude-plugin", "plugin.json"], command);
  proveInside(repo, [...parts, "skills", skillName], command);
  return { dir: join(plugin.dir, "skills", skillName), rel: `${plugin.rel}/skills/${skillName}` };
}

function findPlugin(repo, plugin, pack, command = "this command") {
  validateName(plugin, "plugin name");
  if (pack !== undefined) validateName(pack, "--pack");
  const packs = pack !== undefined ? [pack] : listDirNames(join(repo, "packs"));
  const hits = packs.filter((p) => isDir(join(repo, "packs", p, "plugins", plugin)));
  if (!hits.length) {
    const known = listDirNames(join(repo, "packs")).flatMap((p) => listDirNames(join(repo, "packs", p, "plugins")).map((n) => `${n} (pack ${p})`));
    refuse(`no plugin "${plugin}" under packs/${pack ?? "*"}/plugins/ in ${tilde(repo)}. Plugins that exist: ${known.length ? known.join(", ") : "none"}. To create it: ${selfCommand()} new-plugin ${plugin} --pack ${pack ?? "<pack>"} --apply`);
  }
  if (hits.length > 1) refuse(`plugin "${plugin}" exists in more than one pack (${hits.join(", ")}); add --pack <pack> to choose one`);
  proveInside(repo, ["packs", hits[0], "plugins", plugin, ".claude-plugin", "plugin.json"], command);
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

export { BASE_NOTE, findPlugin, planVersionBump, skillDestination, writeVersionBump };
