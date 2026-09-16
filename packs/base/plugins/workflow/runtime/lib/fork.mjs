// fork.mjs: the engine of `company init` and `new-plugin`, which make a fork of the skills repository the company's own.
//
// Both commands edit two shared files of a skills repository:
//   .claude-plugin/marketplace.json   the catalog clients install from (its name is the marketplace name)
//   templates/project-settings.json   the team settings projects receive (marketplace, source repo, enabled plugins)
// They must agree, or projects enable plugins from a marketplace the catalog does not name. The contract is
// docs/CONTRACTS.md section 6.
//
// JSON is rewritten only when the file is already in the layout JSON.stringify(value, null, 2) produces, so a rewrite
// changes exactly the keys it reports and nothing else. A file in any other layout is refused, never reformatted.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTeamSettings, isDir, isFile, isPlainObject, listDirNames, refuse, sameJson, tilde, validateName } from "./core.mjs";

export const CATALOG = ".claude-plugin/marketplace.json";
export const TEAM_TEMPLATE = "templates/project-settings.json";
export const CODEX_CATALOG = ".agents/plugins/marketplace.json";
export const DESCRIPTION_PLACEHOLDER = "TODO(skillgate) Replace this line. Say what this plugin gives the team; people read it when they choose what to install.";
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LICENSE_RE = /^[A-Za-z0-9.+-]{1,64}$/;

const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Read a JSON object file that can be rewritten without changing anything but the keys a command sets.
export function readCanonicalJson(repo, rel) {
  const path = join(repo, rel);
  if (!isFile(path)) refuse(`${rel} not found in ${tilde(repo)}, so this is not a complete skills repository`);
  const text = readFileSync(path, "utf8");
  let value;
  try { value = JSON.parse(text); } catch (e) { refuse(`${rel} is not valid JSON (${e.message}); fix it first. Nothing was written.`); }
  if (!isPlainObject(value)) refuse(`${rel} does not hold a JSON object. Nothing was written.`);
  if (canonical(value) !== text) refuse(`${rel} is not laid out the way this command writes JSON (two-space indent, one trailing newline), so a rewrite would also change its formatting. Reformat it with: node -e 'const f=process.argv[1],fs=require("fs");fs.writeFileSync(f,JSON.stringify(JSON.parse(fs.readFileSync(f,"utf8")),null,2)+"\\n")' ${rel}, commit that, then run again. Nothing was written.`);
  return { path, rel, text, value };
}

// The one marketplace the team template declares, with its GitHub repository.
function templateMarketplace(template) {
  const markets = isPlainObject(template.value.extraKnownMarketplaces) ? Object.entries(template.value.extraKnownMarketplaces) : [];
  if (markets.length !== 1) refuse(`${TEAM_TEMPLATE} declares ${markets.length} marketplaces under extraKnownMarketplaces; a company template declares exactly one. Nothing was written.`);
  const [name, entry] = markets[0];
  const repo = entry?.source?.source === "github" && typeof entry.source.repo === "string" ? entry.source.repo : null;
  return { name, repo };
}

export function validateRepo(value, what = "--marketplace-repo") {
  if (!REPO_RE.test(value ?? "")) refuse(`${what} must look like owner/repo, the company fork on GitHub (got "${value}"). Other hosts are not built yet: the team settings template can only name a GitHub source.`);
}

// company init: plan the catalog identity and the matching team template.
export function planCompanyInit(repo, { company, marketplaceRepo, marketplaceName, ownerName }) {
  validateName(company, "--name");
  validateRepo(marketplaceRepo);
  const market = marketplaceName ?? company;
  validateName(market, "--marketplace-name");
  if (ownerName !== undefined && (!ownerName.trim() || /[\r\n]/.test(ownerName) || ownerName.length > 200)) refuse("--owner-name must be one line of at most 200 characters");
  const catalog = readCanonicalJson(repo, CATALOG);
  const template = readCanonicalJson(repo, TEAM_TEMPLATE);
  const before = { marketplace: typeof catalog.value.name === "string" ? catalog.value.name : null, template: templateMarketplace(template) };

  const nextCatalog = structuredClone(catalog.value);
  nextCatalog.name = market;
  nextCatalog.owner = { ...(isPlainObject(catalog.value.owner) ? catalog.value.owner : {}), name: ownerName ?? company, url: `https://github.com/${marketplaceRepo.split("/")[0]}` };
  // Company plugins created before a rename carry the old marketplace in nothing but the template, so only the
  // template's enabledPlugins endings change; catalog plugin entries are left as they are.
  const { settings } = buildTeamSettings(template.value, marketplaceRepo, market);
  const files = [
    { ...catalog, next: canonical(nextCatalog) },
    { ...template, next: canonical(settings) },
  ].map((f) => ({ ...f, changed: f.next !== f.text }));
  return { company, market, marketplaceRepo, before, files };
}

// new-plugin: plan the plugin manifest, its catalog entry and its enabled entry in the team template.
export function planNewPlugin(repo, { plugin, pack, description, license }) {
  validateName(plugin, "plugin name");
  if (pack === undefined) refuse("new-plugin needs --pack <pack>: the folder under packs/ the plugin goes in. A company fork uses its own pack (for example --pack acme) and leaves packs/base unchanged.");
  validateName(pack, "--pack");
  if (description !== undefined) {
    if (!description.trim()) refuse("--description is empty; leave it out to get a clearly marked TODO placeholder instead");
    if (/[\r\n]/.test(description)) refuse("--description must be a single line");
    if (description.length > 1024) refuse(`--description is ${description.length} characters; keep it to 1024 or fewer`);
  }
  const lic = license ?? "UNLICENSED";
  if (!LICENSE_RE.test(lic)) refuse(`--license "${lic}" is not a license identifier (for example MIT, Apache-2.0, or UNLICENSED for a private plugin)`);

  const taken = listDirNames(join(repo, "packs")).filter((p) => isDir(join(repo, "packs", p, "plugins", plugin)));
  if (taken.length) refuse(`a plugin named "${plugin}" already exists (packs/${taken[0]}/plugins/${plugin}); plugin names must be unique across packs, because clients install them by name. Choose another name. Nothing was written.`);
  const catalog = readCanonicalJson(repo, CATALOG);
  const template = readCanonicalJson(repo, TEAM_TEMPLATE);
  const market = catalog.value.name;
  if (typeof market !== "string") refuse(`${CATALOG} has no "name". Nothing was written.`);
  const plugins = Array.isArray(catalog.value.plugins) ? catalog.value.plugins : refuse(`${CATALOG} has no "plugins" list. Nothing was written.`);
  if (plugins.some((p) => p?.name === plugin)) refuse(`${CATALOG} already lists a plugin named "${plugin}". Nothing was written.`);
  const tm = templateMarketplace(template);
  if (tm.name !== market) refuse(`${CATALOG} names the marketplace "${market}", but ${TEAM_TEMPLATE} names "${tm.name}", so the new plugin would be enabled under a marketplace clients do not install from. Make them agree first with: company init --name <company> --marketplace-repo <owner>/<repo>${market === tm.name ? "" : ` --marketplace-name ${market}`}. Nothing was written.`);

  const rel = `packs/${pack}/plugins/${plugin}`;
  const author = isPlainObject(catalog.value.owner) && typeof catalog.value.owner.name === "string" ? { name: catalog.value.owner.name } : null;
  const url = tm.repo ? `https://github.com/${tm.repo}` : null;
  const text = description ?? DESCRIPTION_PLACEHOLDER;
  const manifest = {
    name: plugin, description: text, version: "0.1.0",
    ...(author ? { author } : {}), ...(url ? { homepage: url, repository: url } : {}), license: lic,
  };
  const entry = {
    name: plugin, source: `./${rel}`, description: text,
    ...(author ? { author } : {}), ...(url ? { homepage: url, repository: url } : {}), license: lic,
  };
  const nextCatalog = structuredClone(catalog.value);
  nextCatalog.plugins.push(entry);
  const nextTemplate = structuredClone(template.value);
  if (!isPlainObject(nextTemplate.enabledPlugins)) nextTemplate.enabledPlugins = {};
  nextTemplate.enabledPlugins[`${plugin}@${market}`] = true;
  if (sameJson(nextTemplate, template.value)) refuse(`${TEAM_TEMPLATE} already enables ${plugin}@${market}, although no such plugin exists; remove that entry first. Nothing was written.`);
  return {
    plugin, pack, market, rel, license: lic, placeholder: description === undefined,
    manifest: { rel: `${rel}/.claude-plugin/plugin.json`, path: join(repo, rel, ".claude-plugin", "plugin.json"), next: canonical(manifest) },
    files: [{ ...catalog, next: canonical(nextCatalog) }, { ...template, next: canonical(nextTemplate) }],
    codexCatalog: isFile(join(repo, CODEX_CATALOG)),
  };
}
