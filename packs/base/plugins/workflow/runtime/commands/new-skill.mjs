// commands/new-skill.mjs: `skilliton new-skill` (docs/CONTRACTS.md section 6). Writes a SKILL.md skeleton into a
// plugin and bumps that plugin's version. The repository and version machinery is lib/skills-repo.mjs.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, refuse, resolveSkillsRepo, say, tilde, validateName } from "../lib/core.mjs";
import { BASE_NOTE, findPlugin, planVersionBump, writeVersionBump } from "../lib/skills-repo.mjs";

export const help = `new-skill: create a skill inside a plugin, and bump the plugin's version.

  new-skill <plugin> <skill> [--pack <pack>] [--description "<text>"] [--repo <skills repo>]

Creates packs/<pack>/plugins/<plugin>/skills/<skill>/SKILL.md with frontmatter (name, description) and a short body
to fill in (When to use, Steps, What done looks like), then bumps the patch number of "version" in the plugin's
.claude-plugin/plugin.json: installed copies only update when that version changes (docs/CONTRACTS.md).
Names use lowercase letters, digits, and hyphens. Without --description the description is a TODO(skilliton)
placeholder; replace it, because Claude reads that line to decide when to use the skill.
--pack picks between plugins with the same name in different packs. --repo defaults to the repo this script is in.
Refuses (exit 2), changing nothing, if the skill already exists or a name is not allowed.`;

const DESCRIPTION_PLACEHOLDER = "TODO(skilliton) Replace this line. Say what this skill does and exactly when Claude should use it; Claude reads this line to decide whether to load the skill.";

// One-line YAML value: plain when that is unambiguous, otherwise double-quoted (JSON string syntax is valid YAML).
// Words YAML reads as booleans or null, and anything numeric, are quoted so they stay text.
function yamlScalar(text) {
  const special = /^(?:true|false|yes|no|on|off|y|n|null)$/i.test(text) || (/^[-+.\d]/.test(text) && !Number.isNaN(Number(text)));
  const plain = !special && /^[A-Za-z0-9(]/.test(text) && !/[\x00-\x1f\x7f]/.test(text) && !text.includes(": ") && !text.includes(" #") && !text.endsWith(":") && !/\s$/.test(text);
  return plain ? text : JSON.stringify(text);
}

function validateDescription(text) {
  if (!text.trim()) refuse("--description is empty; leave it out to get a clearly marked TODO placeholder instead");
  if (/[\r\n]/.test(text)) refuse("--description must be a single line");
  if (text.length > 1024) refuse(`--description is ${text.length} characters; keep it to 1024 or fewer`);
}

function skillSkeleton(name, description) {
  return [
    "---",
    `name: ${name}`,
    `description: ${yamlScalar(description ?? DESCRIPTION_PLACEHOLDER)}`,
    "---",
    "",
    `# ${name}`,
    "",
    "## When to use",
    "",
    "TODO(skilliton) The situations where this skill applies, and the ones where it does not.",
    "",
    "## Steps",
    "",
    "1. TODO(skilliton) The first thing to do.",
    "2. TODO(skilliton) The next thing to do.",
    "",
    "## What done looks like",
    "",
    "TODO(skilliton) The result that shows the work is finished, and how to check it.",
    "",
  ].join("\n");
}

export async function run(argv) {
  const o = parseArgs(argv, { flags: [], options: ["pack", "description", "repo"] }, "new-skill");
  if (o.help) { say(help); return 0; }
  if (o._.length !== 2) refuse(`new-skill needs exactly two names, the plugin and the new skill: new-skill <plugin> <skill> (got ${o._.length})`);
  const [pluginName, skillName] = o._;
  validateName(skillName, "skill name");
  if (o.description !== undefined) validateDescription(o.description);
  const repo = resolveSkillsRepo(o.repo);
  const plugin = findPlugin(repo, pluginName, o.pack);
  const skillRel = `${plugin.rel}/skills/${skillName}`;
  const skillDir = join(plugin.dir, "skills", skillName);
  if (existsSync(skillDir)) refuse(`${skillRel} already exists; nothing was changed. Choose another name, or edit the existing skill.`);
  const bump = planVersionBump(plugin.manifest, plugin.manifestRel);

  say(`new-skill: in ${tilde(repo)}`);
  say(`  will create ${skillRel}/SKILL.md`);
  say(`  will bump   ${plugin.manifestRel} version ${bump.from} -> ${bump.to}`);
  if (plugin.pack === "base") say(BASE_NOTE);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillSkeleton(skillName, o.description), { flag: "wx" });
  say(`created ${skillRel}/SKILL.md`);
  writeVersionBump("new-skill", plugin, bump);
  say("");
  say(o.description === undefined
    ? "Next: replace every TODO(skilliton) line in the new SKILL.md, starting with the description in its frontmatter."
    : "Next: replace the TODO(skilliton) lines in the body of the new SKILL.md.");
  return 0;
}
