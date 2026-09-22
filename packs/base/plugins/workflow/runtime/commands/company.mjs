// commands/company.mjs: `skilliton company init`, which gives a fork of the skills repository the company's own
// marketplace name, owner and team settings. The engine is lib/fork.mjs; the contract is docs/CONTRACTS.md section 6.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backupFile, newStamp, parseArgs, refuse, resolveSkillsRepo, say, selfCommand, tilde, unifiedDiff } from "../lib/core.mjs";
import { insideGitWorkTree, parseAllowedSigners, validateCompany } from "../lib/trust.mjs";
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

Preview by default; --apply backs up each changed file under $SKILLITON_BACKUPS/company-init/ and writes it. Running it
again with the same values changes nothing. A JSON file laid out differently from two-space JSON is refused, not
reformatted. --repo defaults to the skills repository this copy of skilliton is in.

  company join-file --name <company> --signers <allowed_signers file> --out <path> [--repo-url <url>] [--repo <skills repo>] [--prepare auto|offer] [--apply]

Writes the one file a developer's machine joins with (skilliton join --from <file>): the company name, the fork's
repository URL (default: the GitHub repository ${TEAM_TEMPLATE} names) and the signers text. It is refused inside any
Git working tree, because whom a machine trusts must never arrive through a pull; hand it out through device management
or an internal page, the same channel as the signers file. --prepare says what a joined machine does with a repository
that is not prepared when a session opens it: "auto" (the default, and the file's meaning when the field is absent)
prepares it then and there; "offer" only offers. Preview prints the file; --apply writes it (mode 0644).
Exit codes: 0 complete (or nothing to change); 2 refused, nothing written; 3 a write failed.`;

export function run(argv) {
  const [verb, ...rest] = argv;
  if (verb === "join-file") return joinFile(rest);
  if (verb !== "init") refuse(verb ? `unknown company command "${verb}"; the commands are: company init, company join-file. See: ${selfCommand()} company --help` : `company needs a command: company init or company join-file. See: ${selfCommand()} company --help`);
  const o = parseArgs(rest, { flags: ["apply"], options: ["name", "marketplace-repo", "marketplace-name", "owner-name", "repo"] }, "company");
  if (o._.length) refuse(`company init takes no plain arguments (got "${o._[0]}")`);
  if (o.name === undefined) refuse("company init needs --name <company>, the company's short name (lowercase letters, digits and hyphens)");
  if (o["marketplace-repo"] === undefined) refuse("company init needs --marketplace-repo <owner>/<repo>, where the company fork lives on GitHub; without it, projects would keep installing the upstream plugins");
  const repo = resolveSkillsRepo(o.repo);
  const plan = planCompanyInit(repo, { company: o.name, marketplaceRepo: o["marketplace-repo"], marketplaceName: o["marketplace-name"], ownerName: o["owner-name"] });

  say(`skilliton company init${o.apply ? "" : " (preview; nothing written)"}`);
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
  say(`Developers install from the ${plan.market} marketplace and trust your release signers with: skilliton trust add --company ${plan.company} --signers <file> --apply`);
  return 0;
}

const JOIN_FILE_SCHEMA = "skilliton.join/1";

function joinFile(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["name", "signers", "out", "repo-url", "repo", "prepare"] }, "company join-file");
  if (o.prepare !== undefined && o.prepare !== "auto" && o.prepare !== "offer") refuse(`--prepare must be auto or offer (got "${o.prepare}")`);
  if (o._.length) refuse(`company join-file takes no plain arguments (got "${o._[0]}")`);
  const missing = [];
  if (o.name === undefined) missing.push("--name <company>, the company's short name");
  if (o.signers === undefined) missing.push("--signers <allowed_signers file>, the release signers");
  if (o.out === undefined) missing.push("--out <path>, where to write the join file (outside every Git working tree)");
  if (missing.length) refuse(`company join-file needs ${missing.join(", and ")}`);
  validateCompany(o.name);
  const signersPath = resolve(o.signers);
  let text;
  try { text = readFileSync(signersPath, "utf8"); } catch (e) { refuse(`--signers ${tilde(signersPath)} could not be read (${e.code ?? e.message})`); }
  const parsed = parseAllowedSigners(text);
  if (parsed.problems.length) refuse(`--signers ${tilde(signersPath)} is not a valid allowed_signers file: ${parsed.problems.map((p) => `${p.line ? `line ${p.line}: ` : ""}${p.problem}`).join("; ")}`);
  if (!parsed.signers.length) refuse(`--signers ${tilde(signersPath)} lists no signers`);
  const out = resolve(o.out);
  if (insideGitWorkTree(dirname(out))) refuse(`--out ${tilde(out)} is inside a Git working tree. The join file names whom a machine trusts, so it never travels through a repository; write it outside and hand it out through device management or an internal page. Nothing was written.`);
  let repoUrl = o["repo-url"];
  if (repoUrl === undefined) {
    const repo = resolveSkillsRepo(o.repo);
    try {
      const t = JSON.parse(readFileSync(`${repo}/${TEAM_TEMPLATE}`, "utf8"));
      const gh = Object.values(t.extraKnownMarketplaces ?? {}).map((m) => m?.source?.repo).find((r) => typeof r === "string" && r.includes("/"));
      if (gh) repoUrl = `https://github.com/${gh}.git`;
    } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (!repoUrl) refuse(`no repository URL: pass --repo-url <url>, or run company init first so ${TEAM_TEMPLATE} names the fork`);
  }
  const body = `${JSON.stringify({ schema: JOIN_FILE_SCHEMA, company: o.name, repo: repoUrl, signers: text.endsWith("\n") ? text : `${text}\n`, ...(o.prepare === "offer" ? { prepare: "offer" } : {}) }, null, 2)}\n`;
  say(`skilliton company join-file${o.apply ? "" : " (preview; nothing written)"}`);
  say(`company: ${o.name}`);
  say(`repository: ${repoUrl}`);
  say(`signers: ${parsed.signers.length} from ${tilde(signersPath)}`);
  say(`prepare: ${o.prepare === "offer" ? "offer (a joined machine offers to prepare a repository it opens)" : "auto (a joined machine prepares a repository at its first session start)"}`);
  say(`file: ${tilde(out)}`);
  say("");
  if (!o.apply) { process.stdout.write(body); say(""); say("Next: run the same command with --apply, then hand the file out outside the repository. A machine joins with: skilliton join --from <file> --apply"); return 0; }
  if (existsSync(out) && readFileSync(out, "utf8") === body) { say("already says this; nothing written."); return 0; }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body, { mode: 0o644 });
  say(`wrote ${tilde(out)}`);
  say(`Hand it out through device management or an internal page, never through the repository. Each machine: git clone <fork> ~/company-skills && node ~/company-skills/scripts/skilliton.mjs join --from <file> --apply`);
  return 0;
}
