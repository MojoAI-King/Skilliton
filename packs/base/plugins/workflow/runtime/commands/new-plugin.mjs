// commands/new-plugin.mjs: `skilliton new-plugin`, which creates a plugin for a company's own skills and lists it where
// clients and projects find it. The engine is lib/fork.mjs; the contract is docs/CONTRACTS.md section 6.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { backupFile, linkedFileProblem, newStamp, parseArgs, refuse, resolveSkillsRepo, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { CATALOG, CODEX_CATALOG, TEAM_TEMPLATE, planNewPlugin } from "../lib/fork.mjs";

export const help = `new-plugin: create a plugin for the company's own skills.

  new-plugin <plugin> --pack <pack> [--description "<text>"] [--license <id>] [--repo <skills repo>] [--apply]

Creates packs/<pack>/plugins/<plugin>/.claude-plugin/plugin.json (version 0.1.0; author from the catalog owner;
homepage and repository from the team template's GitHub repository), adds the plugin to ${CATALOG} so clients can
install it, and enables <plugin>@<marketplace> in ${TEAM_TEMPLATE} so prepared projects turn it on.
Then add skills with: new-skill <plugin> <skill> --pack <pack> --description "<text>".

Names use lowercase letters, digits and hyphens, and a plugin name must be unique across packs. A company fork uses
its own pack and leaves packs/base unchanged. --license defaults to UNLICENSED (a private plugin); pass an identifier
such as MIT to share it. Without --description the description is a TODO(skilliton) placeholder to replace.
The catalog and the template must name the same marketplace (company init makes them agree). A Codex catalog
(${CODEX_CATALOG}) is not edited: add the plugin there by hand.

Preview by default; --apply writes the manifest and backs up the two shared files under $SKILLITON_BACKUPS/new-plugin/
before changing them. --repo defaults to the skills repository this copy of skilliton is in.
Exit codes: 0 complete; 2 refused, nothing written; 3 a write failed.`;

export function run(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["pack", "description", "license", "repo"] }, "new-plugin");
  if (o._.length !== 1) refuse(`new-plugin needs exactly one name, the new plugin's: new-plugin <plugin> --pack <pack> (got ${o._.length})`);
  const repo = resolveSkillsRepo(o.repo);
  const plan = planNewPlugin(repo, { plugin: o._[0], pack: o.pack, description: o.description, license: o.license });

  say(`skilliton new-plugin${o.apply ? "" : " (preview; nothing written)"}`);
  say(`skills repository: ${tilde(repo)}`);
  say(`will create ${plan.manifest.rel}:`);
  process.stdout.write(plan.manifest.next);
  for (const f of plan.files) process.stdout.write(unifiedDiff(f.text, f.next, `a/${f.rel}`, `b/${f.rel}`));
  say("");
  if (plan.pack === "base") say("note: packs/base is the upstream base pack. A company fork leaves it unchanged and creates its plugins in its own pack (docs/CONTRACTS.md).");
  if (plan.license === "UNLICENSED") say("note: the license is UNLICENSED, which marks a private plugin; pass --license <id> to share it under an open license.");
  if (plan.codexCatalog) say(`note: ${CODEX_CATALOG} exists and is not edited by this command; add the plugin to it by hand so Codex lists it.`);
  if (!o.apply) {
    say("Next: run the same command with --apply.");
    return 0;
  }
  for (const f of [plan.manifest, ...plan.files]) {
    const linked = linkedFileProblem(f);
    if (linked) refuse(`${linked}. Nothing was written.`);
  }
  // Back up the shared files before creating anything, so a failed backup leaves no plugin folder behind.
  const stamp = newStamp();
  for (const f of plan.files) say(`backed up ${f.rel} to ${tilde(backupFile("new-plugin", f.path, stamp))}`);
  mkdirSync(dirname(plan.manifest.path), { recursive: true });
  writeFileSync(plan.manifest.path, plan.manifest.next, { flag: "wx" });
  say(`created ${plan.manifest.rel}`);
  for (const f of plan.files) {
    writeFileSync(f.path, f.next);
    say(`wrote ${f.rel}`);
  }
  const sg = selfCommand();
  say("");
  say(`Next: add a skill: ${sg} new-skill ${plan.plugin} <skill> --pack ${plan.pack} --description "<what it does and when to use it>"`);
  say(`${plan.placeholder ? "Replace the TODO(skilliton) description in plugin.json and the catalog, then c" : "C"}heck the plugin with: claude plugin validate --strict ${plan.rel}, and commit.`);
  return 0;
}
