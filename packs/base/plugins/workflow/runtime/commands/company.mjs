// commands/company.mjs: `skillgate company init`, which gives a fork of the skills repository the company's own
// marketplace name, owner and team settings. The engine is lib/fork.mjs; the contract is docs/CONTRACTS.md section 6.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { backupFile, newStamp, parseArgs, refuse, resolveSkillsRepo, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { CATALOG, TEAM_TEMPLATE, planCompanyInit } from "../lib/fork.mjs";

export const help = `company: make a fork of the skills repository the company's own.

  company init --name <company> --marketplace-repo <owner>/<repo> [--marketplace-name <name>] [--owner-name "<text>"]
               [--repo <skills repo>] [--apply]

Sets, in the skills repository:
  ${CATALOG}   "name" (the marketplace people install from; default: the company name) and "owner"
                                     (name, and the GitHub owner's page)
  ${TEAM_TEMPLATE}    the marketplace name, its GitHub repository, and the @<marketplace> ending of every
                                     enabled plugin, so projects install the company's plugins, not upstream's

--name is the company's short name, the same one developers pass to "trust add --company". --marketplace-repo is
required: without it, projects prepared from this fork would keep installing the upstream repository's plugins.
Only a GitHub repository can be named today. The base plugins keep their upstream author, homepage and repository,
because packs/base is upstream work a fork leaves unchanged.

Preview by default; --apply backs up each changed file under $SKILLGATE_BACKUPS/company-init/ and writes it. Running it
again with the same values changes nothing. A JSON file laid out differently from two-space JSON is refused, not
reformatted. --repo defaults to the skills repository this copy of skillgate is in.
Exit codes: 0 complete (or nothing to change); 2 refused, nothing written; 3 a write failed.`;

export function run(argv) {
  const [verb, ...rest] = argv;
  if (verb !== "init") refuse(verb ? `unknown company command "${verb}"; the only one is: company init. See: ${selfCommand()} company --help` : `company needs a command: company init. See: ${selfCommand()} company --help`);
  const o = parseArgs(rest, { flags: ["apply"], options: ["name", "marketplace-repo", "marketplace-name", "owner-name", "repo"] }, "company");
  if (o._.length) refuse(`company init takes no plain arguments (got "${o._[0]}")`);
  if (o.name === undefined) refuse("company init needs --name <company>, the company's short name (lowercase letters, digits and hyphens)");
  if (o["marketplace-repo"] === undefined) refuse("company init needs --marketplace-repo <owner>/<repo>, where the company fork lives on GitHub; without it, projects would keep installing the upstream plugins");
  const repo = resolveSkillsRepo(o.repo);
  const plan = planCompanyInit(repo, { company: o.name, marketplaceRepo: o["marketplace-repo"], marketplaceName: o["marketplace-name"], ownerName: o["owner-name"] });

  say(`skillgate company init${o.apply ? "" : " (preview; nothing written)"}`);
  say(`skills repository: ${tilde(repo)}`);
  say(`company: ${plan.company}`);
  say(`marketplace: ${plan.before.marketplace ?? "(none)"} -> ${plan.market}`);
  say(`projects install from: ${plan.before.template.repo ?? "(no GitHub repository)"} -> ${plan.marketplaceRepo}`);
  say("");
  const changed = plan.files.filter((f) => f.changed);
  if (!changed.length) {
    say(`${CATALOG} and ${TEAM_TEMPLATE} already say this; nothing to change, nothing written.`);
    return 0;
  }
  for (const f of changed) process.stdout.write(unifiedDiff(f.text, f.next, `a/${f.rel}`, `b/${f.rel}`));
  say("");
  say("The base plugin entries keep their upstream author, homepage and repository (packs/base is upstream work).");
  if (!o.apply) {
    say(`Next: run the same command with --apply.`);
    return 0;
  }
  const stamp = newStamp();
  for (const f of changed) {
    say(`backed up ${f.rel} to ${tilde(backupFile("company-init", f.path, stamp))}`);
    mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, f.next);
    say(`wrote ${f.rel}`);
  }
  const sg = selfCommand();
  say("");
  say("Next:");
  say(`  1. Create a plugin for the company's own skills: ${sg} new-plugin <plugin> --pack ${plan.company} --apply`);
  say(`  2. Add a skill to it: ${sg} new-skill <plugin> <skill> --pack ${plan.company} --description "<what it does and when to use it>"`);
  say(`  3. Commit, then release: ${sg} release create --version <x.y.z> --apply (docs/RELEASING.md)`);
  say(`Developers install from the ${plan.market} marketplace and trust your release signers with: skillgate trust add --company ${plan.company} --signers <file> --apply`);
  return 0;
}
