// skill-drift.mjs: a skill a repository keeps its own copy of, beside an installed plugin's skill of the same name
// (backlog B76). The session-start block names each copy whose SKILL.md differs from every installed copy, so a
// project that copied a skill into .claude/skills/ and then fell behind a release is noticed, rather than the older
// copy quietly answering instead of the plugin's.
//
// Read only: nothing here writes, and a project with no .claude/skills/ folder costs one stat. The installed plugins
// are resolved the way doctor resolves them (lib/doctor.mjs): Claude Code's configuration folder is CLAUDE_CONFIG_DIR
// when it is set, else ~/.claude (the rule in lib/verify.mjs, restated here so a session start does not load the
// release and trust modules), and plugins/installed_plugins.json there names each install with its installPath. That
// file's format is not documented; its shape was read on Claude Code 2.1.92 and 2.1.278 (doctor's note).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { isFile, isPlainObject, listDirNames, tilde } from "./core.mjs";

const SKILL_COPY_LINE = "skill copy differs from the installed one";

const configDir = () => resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"));
const hashOf = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

// Each install's folder: [{ plugin, path }] from installed_plugins.json, or { problem } when the file is there and
// cannot be used. A missing file means no plugin is installed, which is not a problem.
function installedPlugins(dir) {
  const file = join(dir, "plugins", "installed_plugins.json");
  if (!isFile(file)) return { installs: [] };
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) {
    return { problem: `${tilde(file)} ${e instanceof SyntaxError ? "does not parse" : `could not be read (${e.code ?? e.message})`}` };
  }
  const installs = [];
  for (const [plugin, list] of Object.entries(isPlainObject(data?.plugins) ? data.plugins : {})) {
    for (const entry of Array.isArray(list) ? list : []) {
      if (typeof entry?.installPath === "string" && entry.installPath) installs.push({ plugin, path: entry.installPath });
    }
  }
  return { installs };
}

// { differs: [{ name, plugins }], problem }. A copy is named when an installed plugin has a skill of that name and no
// installed copy of it has the same SKILL.md bytes; a name no installed plugin has is the project's own skill.
export function skillCopyDrift(root, { claudeDir = configDir() } = {}) {
  const skills = typeof root === "string" ? join(root, ".claude", "skills") : null;
  const names = skills ? listDirNames(skills).filter((name) => isFile(join(skills, name, "SKILL.md"))) : [];
  if (!names.length) return { differs: [], problem: null };
  const { installs, problem } = installedPlugins(claudeDir);
  if (problem) return { differs: [], problem };
  const differs = [];
  for (const name of names) {
    const theirs = installs.map((i) => ({ plugin: i.plugin, file: join(i.path, "skills", name, "SKILL.md") })).filter((i) => isFile(i.file));
    if (!theirs.length) continue;
    const mine = hashOf(join(skills, name, "SKILL.md"));
    if (!theirs.some((i) => hashOf(i.file) === mine)) differs.push({ name, plugins: [...new Set(theirs.map((i) => i.plugin))] });
  }
  return { differs, problem: null };
}

// The lines the session-start block adds: one per differing copy, one when the comparison could not be made, and
// none at all when every copy matches or there are no copies. A failure to read is said, never taken for a match.
export function skillCopyLines(root, options) {
  let result;
  try { result = skillCopyDrift(root, options); } catch (e) {
    return [`Skill copies (not compared): ${e.code ?? e.message}`];
  }
  if (result.problem) return [`Skill copies (not compared): ${result.problem}`];
  return result.differs.map((d) => `${SKILL_COPY_LINE}: ${d.name}`);
}
