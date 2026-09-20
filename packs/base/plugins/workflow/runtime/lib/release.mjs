// release.mjs: company release manifests and their approval tags (docs/CONTRACTS.md section 13, releases/SCHEMA.md).
//
// A manifest, releases/<version>.json in the company skills repository, names every plugin in the repository's
// .claude-plugin/marketplace.json with its version and the hash of every file. Approval is an annotated tag
// skilliton-release/<version>, signed with SSH, on the commit that holds the manifest, whose message carries
// "manifest-sha256: <hex>". Withdrawal is a signed tag skilliton-withdrawn/<version> carrying "reason: <text>".
// This module builds and checks manifests and reads tags; the commands print and write.
//
// Node built-ins only; shells out to git only (through trust.mjs), with argument arrays. Nothing here imports from
// outside the plugin folder; the migrations module is read only from the running runtime (see releaseMigrations).

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { LAYOUT_VERSION, validRelPath } from "./config.mjs";
import { NAME_RE, PLUGIN_ROOT, cmpVersion, isPlainObject, refuse, tilde } from "./core.mjs";
import { TreeError, filePathProblem, scanTree, sha256Hex, treeSha256Of } from "./treehash.mjs";
import { requireGitAvailable, runGit, verifyTagSignature } from "./trust.mjs";

const MANIFEST_SCHEMA = "skilliton.release/1";
export const RELEASE_TAG = "skilliton-release/";
const WITHDRAWN_TAG = "skilliton-withdrawn/";
export const VERSION_RE = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const MIGRATION_ID_RE = /^\d{4}-[a-z0-9][a-z0-9-]*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CLAUDE_CATALOG = ".claude-plugin/marketplace.json";
const CODEX_CATALOG = ".agents/plugins/marketplace.json";
const MAX_JSON_BYTES = 16 * 1024 * 1024;

export const manifestRel = (version) => `releases/${version}.json`;
export const short = (oid) => (typeof oid === "string" ? oid.slice(0, 12) : "unknown");

function validateVersion(version, what = "version") {
  if (typeof version !== "string" || !VERSION_RE.test(version)) refuse(`${what} "${version}" is not a plain MAJOR.MINOR.PATCH version (for example 1.2.0)`);
}

// ---------- repository ----------

// The repository's top folder, or a refusal. Returns { dir (as given, resolved), real (realpath) }.
export function openRepository(input, what = "--repo") {
  requireGitAvailable();
  const dir = resolve(input);
  let st;
  try { st = statSync(dir); } catch { refuse(`${what} ${tilde(dir)} is not an existing folder`); }
  if (!st.isDirectory()) refuse(`${what} ${tilde(dir)} is not a folder`);
  const top = runGit(dir, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) refuse(`${what} ${tilde(dir)} is not inside a Git repository${top.stderr.trim() ? ` (git says: ${top.stderr.trim().split("\n").pop()})` : ""}`);
  const real = realpathSync(dir);
  if (realpathSync(top.stdout.trim()) !== real) refuse(`${what} must be the repository's top folder (${tilde(top.stdout.trim())}), not a folder inside it`);
  return { dir, real };
}

function headCommit(repo) {
  const r = runGit(repo, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  if (!r.ok) refuse(`${tilde(repo)} has no commits yet; commit the plugins first`);
  return r.stdout.trim();
}

function objectFormat(repo, sampleOid) {
  const r = runGit(repo, ["rev-parse", "--show-object-format"]);
  const value = r.ok ? r.stdout.trim() : "";
  if (value === "sha1" || value === "sha256") return value;
  return sampleOid.length === 64 ? "sha256" : "sha1";
}

export function tagExists(repo, name) {
  return runGit(repo, ["show-ref", "--verify", "--quiet", `refs/tags/${name}`]).ok;
}

// ---------- JSON files ----------

function readJsonFile(path, label) {
  let st;
  try { st = lstatSync(path); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
    throw e;
  }
  if (st.isSymbolicLink()) refuse(`${label} is a symbolic link, which Skilliton does not follow`);
  if (!st.isFile()) refuse(`${label} is not a regular file`);
  if (st.size > MAX_JSON_BYTES) refuse(`${label} is larger than 16 MB`);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) { refuse(`${label} is not valid JSON (${e.message})`); }
}

// ---------- the catalog and its components ----------

export function readClaudeCatalog(repo) {
  const catalog = readJsonFile(join(repo, CLAUDE_CATALOG), CLAUDE_CATALOG);
  if (catalog === undefined) refuse(`${tilde(repo)} has no ${CLAUDE_CATALOG}, so it is not a company skills repository`);
  if (!isPlainObject(catalog)) refuse(`${CLAUDE_CATALOG} does not hold a JSON object`);
  if (typeof catalog.name !== "string" || !NAME_RE.test(catalog.name)) refuse(`${CLAUDE_CATALOG} needs a "name" made of lowercase letters, digits and hyphens`);
  if (isPlainObject(catalog.metadata) && catalog.metadata.pluginRoot !== undefined) refuse(`${CLAUDE_CATALOG} sets metadata.pluginRoot, which release create does not support in this version; write each plugin's source as a full ./ path`);
  if (!Array.isArray(catalog.plugins) || !catalog.plugins.length) refuse(`${CLAUDE_CATALOG} lists no plugins, so there is nothing to release`);
  const seen = new Set();
  const plugins = catalog.plugins.map((p, i) => {
    if (!isPlainObject(p) || typeof p.name !== "string" || !NAME_RE.test(p.name)) refuse(`${CLAUDE_CATALOG} plugins[${i}] needs a "name" made of lowercase letters, digits and hyphens`);
    if (seen.has(p.name)) refuse(`${CLAUDE_CATALOG} lists the plugin "${p.name}" twice`);
    seen.add(p.name);
    return { name: p.name, source: p.source, version: p.version };
  });
  return { name: catalog.name, plugins };
}

// The Codex catalog, when the repository has one: { name, plugins: [{ name, path }] } or null.
export function readCodexCatalog(repo) {
  const catalog = readJsonFile(join(repo, CODEX_CATALOG), CODEX_CATALOG);
  if (catalog === undefined) return null;
  if (!isPlainObject(catalog) || typeof catalog.name !== "string" || !NAME_RE.test(catalog.name)) refuse(`${CODEX_CATALOG} needs a JSON object with a plain "name"`);
  if (!Array.isArray(catalog.plugins)) refuse(`${CODEX_CATALOG} needs a "plugins" list`);
  const plugins = catalog.plugins.map((p, i) => {
    if (!isPlainObject(p) || typeof p.name !== "string" || !NAME_RE.test(p.name)) refuse(`${CODEX_CATALOG} plugins[${i}] needs a plain "name"`);
    const path = isPlainObject(p.source) && p.source.source === "local" && typeof p.source.path === "string" ? p.source.path : null;
    return { name: p.name, source: path ?? p.source };
  });
  return { name: catalog.name, plugins };
}

// A catalog source as a repository-relative folder, or a refusal: no .., no absolute paths, no links, inside the repo.
function componentPath(repo, source, pluginName) {
  const label = `plugin "${pluginName}"`;
  if (typeof source !== "string") refuse(`${label} has a source outside this repository (${JSON.stringify(source)?.slice(0, 120)}); a release covers plugins stored in the repository only`);
  if (source.includes("\\")) refuse(`${label} has the path "${source}", which uses a backslash; write it with / separators`);
  if (isAbsolute(source) || /^[A-Za-z]:/.test(source)) refuse(`${label} has the absolute path "${source}", which escapes the repository; use a path inside it such as ./packs/<pack>/plugins/${pluginName}`);
  const parts = source.split("/");
  if (parts.includes("..")) refuse(`${label} has the path "${source}", which uses .. and so escapes the repository; use a plain path inside it such as ./packs/<pack>/plugins/${pluginName}`);
  const kept = parts.filter((p, i) => !(i === 0 && p === ".") && !(i === parts.length - 1 && p === ""));
  const rel = kept.join("/");
  if (!rel) refuse(`${label} points at the repository's top folder; a plugin must live in its own folder`);
  if (!validRelPath(rel)) refuse(`${label} has the path "${source}", which is not a simple repository-relative path (letters, digits, . _ - and /)`);
  let cursor = repo;
  for (const part of kept) {
    cursor = join(cursor, part);
    let st;
    try { st = lstatSync(cursor); } catch { refuse(`${label} has the path "${source}", which does not exist`); }
    if (st.isSymbolicLink()) refuse(`${label} has the path "${source}", which goes through a symbolic link that could lead outside the repository`);
    if (!st.isDirectory()) refuse(`${label} has the path "${source}", which is not a folder`);
  }
  const back = relative(realpathSync(repo), realpathSync(cursor));
  if (!back || back.startsWith("..") || isAbsolute(back)) refuse(`${label} has the path "${source}", which escapes the repository`);
  return rel;
}

// The plugin's version, with its Claude Code and Codex manifests checked against each other and the catalog entry.
function pluginVersion(repo, rel, entry) {
  const claudeLabel = `${rel}/.claude-plugin/plugin.json`;
  const claude = readJsonFile(join(repo, rel, ".claude-plugin", "plugin.json"), claudeLabel);
  if (claude === undefined) refuse(`${rel} has no .claude-plugin/plugin.json, so plugin "${entry.name}" has no version to release`);
  if (!isPlainObject(claude)) refuse(`${claudeLabel} does not hold a JSON object`);
  if (claude.name !== entry.name) refuse(`${claudeLabel} names the plugin ${JSON.stringify(claude.name)}, but the catalog calls it "${entry.name}"`);
  if (typeof claude.version !== "string" || !VERSION_RE.test(claude.version)) refuse(`${claudeLabel} has version ${JSON.stringify(claude.version)}, which is not MAJOR.MINOR.PATCH`);
  if (entry.version !== undefined && entry.version !== claude.version) refuse(`the catalog entry for "${entry.name}" says version ${JSON.stringify(entry.version)}, but ${claudeLabel} says ${claude.version}; make them agree`);
  const codexLabel = `${rel}/.codex-plugin/plugin.json`;
  const codex = readJsonFile(join(repo, rel, ".codex-plugin", "plugin.json"), codexLabel);
  if (codex !== undefined) {
    if (!isPlainObject(codex)) refuse(`${codexLabel} does not hold a JSON object`);
    if (codex.version !== claude.version) refuse(`plugin "${entry.name}" has two versions: ${claudeLabel} says ${claude.version} and ${codexLabel} says ${JSON.stringify(codex.version)}. Make them agree (every change bumps both), then run again. Nothing was written.`);
    if (codex.name !== undefined && codex.name !== entry.name) refuse(`${codexLabel} names the plugin ${JSON.stringify(codex.name)}, not "${entry.name}"`);
  }
  return claude.version;
}

// Differences between a scanned folder (scanTree with blobFormat) and the same folder in the HEAD commit: files that
// are untracked or ignored, changed, deleted, or have a changed executable bit. Compares blob ids rather than asking
// `git status`, so files hidden from status (ignored, assume-unchanged, skip-worktree) still count.
function uncommittedUnder(repo, rel, scan) {
  const r = runGit(repo, ["--literal-pathspecs", "ls-tree", "-r", "-z", "--full-tree", "HEAD", "--", rel], { buffer: true });
  if (!r.ok) throw new Error(`git ls-tree failed for ${rel} (${r.failure}: ${r.stderr.trim()})`);
  const expected = new Map(), special = [];
  for (const record of r.stdout.toString("utf8").split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    const [mode, type, oid] = record.slice(0, tab).split(" ");
    const full = record.slice(tab + 1);
    if (!full.startsWith(`${rel}/`)) continue;
    const path = full.slice(rel.length + 1);
    if (path.split("/").pop() === ".DS_Store") continue;
    if (type !== "blob" || (mode !== "100644" && mode !== "100755")) {
      special.push(`${path} (${mode === "120000" ? "a symbolic link" : type === "commit" ? "a submodule" : `mode ${mode}`} in the commit)`);
      continue;
    }
    expected.set(path, { oid, executable: mode === "100755" });
  }
  const changes = [];
  const seen = new Set();
  for (const f of scan.files) {
    seen.add(f.path);
    const want = expected.get(f.path);
    if (!want) changes.push(`${f.path} (not in the commit: untracked or ignored)`);
    else if (want.oid !== f.blob) changes.push(`${f.path} (changed since the commit)`);
    else if (want.executable !== f.executable) changes.push(`${f.path} (executable bit changed since the commit)`);
  }
  for (const path of expected.keys()) if (!seen.has(path)) changes.push(`${path} (deleted since the commit)`);
  return [...special, ...changes];
}

// The Git blob id of some bytes, to compare a working file with the committed one.
const createBlobId = (bytes, format) => createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

function evidenceKind(rel) {
  if (rel.startsWith("evidence/releases/")) return "release";
  if (rel.startsWith("evidence/rehearsals/")) return "rehearsal";
  if (/^evidence\/[0-9a-f]{7,64}\//.test(rel)) return "skill-evaluation";
  return "other";
}

// One --evidence file: inside the repository, a regular file, committed exactly as it is.
function evidenceEntry(repo, repoReal, input, format) {
  const abs = resolve(input);
  let parentReal;
  try { parentReal = realpathSync(dirname(abs)); } catch { refuse(`--evidence ${input}: the file does not exist`); }
  const rel = relative(repoReal, join(parentReal, basename(abs))).split(sep).join("/");
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) refuse(`--evidence ${input} is outside the repository; evidence must be committed in the skills repository so others can check it`);
  if (!validRelPath(rel)) refuse(`--evidence ${input} is not a simple repository path (letters, digits, . _ - and /)`);
  let st;
  try { st = lstatSync(join(repoReal, rel)); } catch { refuse(`--evidence ${input}: the file does not exist`); }
  if (st.isSymbolicLink()) refuse(`--evidence ${rel} is a symbolic link`);
  if (!st.isFile()) refuse(`--evidence ${rel} is not a regular file`);
  const bytes = readFileSync(join(repoReal, rel));
  const tree = runGit(repo, ["--literal-pathspecs", "ls-tree", "-z", "--full-tree", "HEAD", "--", rel], { buffer: true });
  const record = tree.ok ? tree.stdout.toString("utf8").split("\0").find(Boolean) : null;
  const oid = record ? record.slice(0, record.indexOf("\t")).split(" ")[2] : null;
  const blob = createBlobId(bytes, format);
  if (!oid) refuse(`--evidence ${rel} is not committed; commit it first, so the manifest names content others can read. Nothing was written.`);
  if (oid !== blob) refuse(`--evidence ${rel} has uncommitted changes; commit them first. Nothing was written.`);
  return { kind: evidenceKind(rel), path: rel, sha256: sha256Hex(bytes) };
}

// Migration ids for the manifest. Only the running runtime's own module is imported (runtime code never loads code
// from outside its plugin folder), so it is used only when the running runtime is the release's workflow plugin.
async function releaseMigrations(repo, components) {
  const workflow = components.find((c) => c.name === "workflow");
  if (!workflow) return { ids: [], note: "migrations: this release has no workflow plugin, which carries the migrations, so none are recorded" };
  if (!existsSync(join(repo, workflow.path, "runtime", "lib", "migrations.mjs"))) {
    return { ids: [], note: "migrations: the migrations module is not available in this build (the workflow plugin has no runtime/lib/migrations.mjs), so none are recorded" };
  }
  let same = false;
  try { same = realpathSync(PLUGIN_ROOT) === realpathSync(join(repo, workflow.path)); } catch { same = false; }
  if (!same) {
    const running = scanTree(PLUGIN_ROOT);
    same = running.problems.length === 0 && treeSha256Of(running.files) === workflow.treeSha256;
  }
  if (!same) refuse(`the release's workflow plugin has a migrations module, and only the runtime inside that plugin may read it, but this command is running from ${tilde(PLUGIN_ROOT)}, which differs. Run it from the release's own checkout: node ${tilde(join(repo, "scripts", "skilliton.mjs"))} release create ... Nothing was written.`);
  const mod = await import(new URL("./migrations.mjs", import.meta.url).href);
  const list = Array.isArray(mod.MIGRATIONS) ? mod.MIGRATIONS : typeof mod.listMigrations === "function" ? await mod.listMigrations() : null;
  if (!Array.isArray(list)) return { ids: [], note: "migrations: the migrations module is not available in this build (it exports neither MIGRATIONS nor listMigrations()), so none are recorded" };
  const ids = list.map((m) => (typeof m === "string" ? m : m?.id));
  const bad = ids.filter((id) => typeof id !== "string" || !MIGRATION_ID_RE.test(id));
  if (bad.length) refuse(`the migrations module lists ids that are not NNNN-slug: ${bad.map((b) => JSON.stringify(b)).join(", ")}`);
  if (new Set(ids).size !== ids.length) refuse("the migrations module lists the same migration id twice");
  return { ids, note: null };
}

// ---------- building a manifest ----------

// Everything release create needs, checked before anything is written. Throws Refused with the reason.
export async function planRelease({ repoInput, version, evidence = [], now = new Date() }) {
  validateVersion(version, "--version");
  const { dir: repo, real: repoReal } = openRepository(repoInput);
  const head = headCommit(repo);
  const format = objectFormat(repo, head);
  const rel = manifestRel(version);
  if (existsSync(join(repo, rel)) || runGit(repo, ["cat-file", "-e", `HEAD:${rel}`]).ok) refuse(`version ${version} already has a manifest (${rel}); every release needs a new version. Nothing was written.`);
  for (const tag of [`${RELEASE_TAG}${version}`, `${WITHDRAWN_TAG}${version}`]) {
    if (tagExists(repo, tag)) refuse(`version ${version} already has the tag ${tag}; every release needs a new version. Nothing was written.`);
  }
  let releasesDir;
  try { releasesDir = lstatSync(join(repo, "releases")); } catch { releasesDir = null; }
  if (releasesDir && (releasesDir.isSymbolicLink() || !releasesDir.isDirectory())) refuse("releases/ is not a plain folder (it is a file or a symbolic link); nothing was written");

  const catalog = readClaudeCatalog(repo);
  const codex = readCodexCatalog(repo);
  const components = [], dirty = [];
  for (const entry of catalog.plugins) {
    const path = componentPath(repo, entry.source, entry.name);
    const pluginVer = pluginVersion(repo, path, entry);
    const scan = scanTree(join(repo, path), { blobFormat: format });
    if (scan.problems.length) refuse(`${new TreeError(path, scan.problems).message}. Nothing was written.`);
    const changes = uncommittedUnder(repo, path, scan);
    if (changes.length) dirty.push({ path, changes });
    components.push({
      kind: "plugin", name: entry.name, version: pluginVer, path, treeSha256: treeSha256Of(scan.files),
      files: scan.files.map((f) => ({ path: f.path, sha256: f.sha256, executable: f.executable })),
    });
  }
  for (const a of components) for (const b of components) {
    if (a !== b && b.path.startsWith(`${a.path}/`)) refuse(`plugin "${b.name}" (${b.path}) is inside plugin "${a.name}" (${a.path}), so its files would be released twice`);
    if (a !== b && a.path === b.path) refuse(`plugins "${a.name}" and "${b.name}" share the folder ${a.path}`);
  }
  if (dirty.length) {
    const lines = dirty.flatMap((d) => d.changes.slice(0, 20).map((c) => `${d.path}/${c}`).concat(d.changes.length > 20 ? [`${d.path}: and ${d.changes.length - 20} more`] : []));
    refuse(`uncommitted changes under the release's plugin folders, so the manifest would not describe commit ${short(head)}:\n  ${lines.join("\n  ")}\nCommit or remove them, then run again. Nothing was written.`);
  }

  const notes = [];
  const clients = {
    "claude-code": { catalog: CLAUDE_CATALOG, marketplace: catalog.name, plugins: components.map((c) => c.name) },
  };
  if (codex) {
    const listed = [];
    for (const p of codex.plugins) {
      const claudeSide = components.find((c) => c.name === p.name);
      if (!claudeSide) { notes.push(`clients: the Codex catalog lists "${p.name}", which ${CLAUDE_CATALOG} does not, so it is not part of this release`); continue; }
      const codexPath = componentPath(repo, p.source, p.name);
      if (codexPath !== claudeSide.path) refuse(`the Codex catalog points "${p.name}" at ${codexPath}, but ${CLAUDE_CATALOG} points it at ${claudeSide.path}; one release cannot hold both`);
      listed.push(p.name);
    }
    clients.codex = { catalog: CODEX_CATALOG, marketplace: codex.name, plugins: listed };
  } else {
    clients.codex = { catalog: null, marketplace: null, plugins: [], note: `this repository has no ${CODEX_CATALOG}` };
  }

  const evidenceEntries = [];
  for (const input of evidence) {
    const entry = evidenceEntry(repo, repoReal, input, format);
    if (evidenceEntries.some((e) => e.path === entry.path)) refuse(`--evidence ${entry.path} was given twice`);
    evidenceEntries.push(entry);
  }

  const migrations = await releaseMigrations(repo, components);
  if (migrations.note) notes.push(migrations.note);

  const manifest = {
    schema: MANIFEST_SCHEMA,
    release: version,
    sourceCommit: head,
    createdAt: now.toISOString(),
    marketplace: catalog.name,
    components,
    projectLayout: LAYOUT_VERSION,
    migrations: migrations.ids,
    clients,
    evidence: evidenceEntries,
    notes,
  };
  const problems = validateManifest(manifest, version);
  if (problems.length) throw new Error(`the manifest built for ${version} fails its own validation (a bug): ${problems.join("; ")}`);
  return { repo, head, rel, manifest, text: `${JSON.stringify(manifest, null, 2)}\n` };
}

// ---------- validating a manifest ----------

// Every problem with a parsed manifest, as sentences; [] when it is valid.
function validateManifest(m, expectedVersion) {
  const p = [];
  if (!isPlainObject(m)) return ["the manifest is not a JSON object"];
  if (m.schema !== MANIFEST_SCHEMA) p.push(`schema is ${JSON.stringify(m.schema)}, not "${MANIFEST_SCHEMA}"`);
  if (typeof m.release !== "string" || !VERSION_RE.test(m.release)) p.push("release is not a MAJOR.MINOR.PATCH version");
  else if (expectedVersion !== undefined && m.release !== expectedVersion) p.push(`release says ${m.release}, but the file and tag are for ${expectedVersion}`);
  if (typeof m.sourceCommit !== "string" || !COMMIT_RE.test(m.sourceCommit)) p.push("sourceCommit is not a full commit id");
  if (typeof m.createdAt !== "string" || Number.isNaN(Date.parse(m.createdAt))) p.push("createdAt is not a date and time");
  if (typeof m.marketplace !== "string" || !NAME_RE.test(m.marketplace)) p.push("marketplace is not a plain name");
  if (!Array.isArray(m.components) || !m.components.length) p.push("components is not a non-empty list");
  else {
    const names = new Set(), paths = [];
    m.components.forEach((c, i) => {
      const at = `components[${i}]`;
      if (!isPlainObject(c)) { p.push(`${at} is not an object`); return; }
      if (c.kind !== "plugin") p.push(`${at}.kind is not "plugin"`);
      if (typeof c.name !== "string" || !NAME_RE.test(c.name)) p.push(`${at}.name is not a plain name`);
      else if (names.has(c.name)) p.push(`${at}.name "${c.name}" appears twice`);
      else names.add(c.name);
      if (typeof c.version !== "string" || !VERSION_RE.test(c.version)) p.push(`${at}.version is not MAJOR.MINOR.PATCH`);
      const pathProblem = typeof c.path === "string" ? filePathProblem(c.path) : "not text";
      if (pathProblem) p.push(`${at}.path is ${pathProblem}`);
      else paths.push(c.path);
      const treeOk = typeof c.treeSha256 === "string" && HEX64.test(c.treeSha256);
      if (!treeOk) p.push(`${at}.treeSha256 is not a sha256`);
      if (!Array.isArray(c.files) || !c.files.length) { p.push(`${at}.files is not a non-empty list`); return; }
      const seen = new Set();
      let filesOk = true;
      c.files.forEach((f, j) => {
        const fat = `${at}.files[${j}]`;
        if (!isPlainObject(f)) { p.push(`${fat} is not an object`); filesOk = false; return; }
        const fp = typeof f.path === "string" ? filePathProblem(f.path) : "not text";
        if (fp) { p.push(`${fat}.path is ${fp}`); filesOk = false; }
        else if (seen.has(f.path)) { p.push(`${fat}.path "${f.path}" appears twice`); filesOk = false; }
        else if (f.path.split("/").pop() === ".DS_Store") { p.push(`${fat}.path is a .DS_Store file, which the tree hash leaves out`); filesOk = false; }
        else seen.add(f.path);
        if (typeof f.sha256 !== "string" || !HEX64.test(f.sha256)) { p.push(`${fat}.sha256 is not a sha256`); filesOk = false; }
        if (typeof f.executable !== "boolean") p.push(`${fat}.executable is not true or false`);
      });
      if (filesOk && treeOk && treeSha256Of(c.files) !== c.treeSha256) p.push(`${at}.treeSha256 does not match its own file list`);
    });
    for (const a of paths) for (const b of paths) if (a !== b && b.startsWith(`${a}/`)) p.push(`component path ${b} is inside component path ${a}`);
    if (new Set(paths).size !== paths.length) p.push("two components share a path");
  }
  if (!Number.isInteger(m.projectLayout) || m.projectLayout < 1) p.push("projectLayout is not a positive whole number");
  if (!Array.isArray(m.migrations) || !m.migrations.every((id) => typeof id === "string" && MIGRATION_ID_RE.test(id))) p.push("migrations is not a list of NNNN-slug ids");
  if (!isPlainObject(m.clients)) p.push("clients is not an object");
  if (!Array.isArray(m.evidence)) p.push("evidence is not a list");
  else m.evidence.forEach((e, i) => {
    if (!isPlainObject(e) || typeof e.kind !== "string" || !e.kind || typeof e.path !== "string" || filePathProblem(e.path) || typeof e.sha256 !== "string" || !HEX64.test(e.sha256)) p.push(`evidence[${i}] needs kind, a plain relative path and a sha256`);
  });
  if (m.notes !== undefined && (!Array.isArray(m.notes) || !m.notes.every((n) => typeof n === "string"))) p.push("notes is not a list of text");
  return p;
}

// ---------- tags ----------

const SIGNATURE_MARKERS = ["-----BEGIN PGP SIGNATURE-----", "-----BEGIN PGP MESSAGE-----", "-----BEGIN SIGNED MESSAGE-----", "-----BEGIN SSH SIGNATURE-----"];

// A raw tag object (git cat-file tag) split the way git splits it: headers, message, and the signature that starts at
// the last line beginning with a signature marker.
export function parseTagObject(bytes) {
  const text = bytes.toString("latin1");
  const blank = text.indexOf("\n\n");
  if (blank < 0) return { problem: "the tag object has no message" };
  const headers = {};
  for (const line of text.slice(0, blank).split("\n")) {
    const space = line.indexOf(" ");
    const key = space < 0 ? line : line.slice(0, space);
    if (Object.hasOwn(headers, key)) return { problem: `the tag object repeats its "${key}" header` };
    headers[key] = space < 0 ? "" : line.slice(space + 1);
  }
  const body = text.slice(blank + 2);
  let start = -1, marker = null, markers = 0;
  for (let pos = 0; pos < body.length;) {
    const eol = body.indexOf("\n", pos);
    const line = body.slice(pos, eol < 0 ? body.length : eol);
    const found = SIGNATURE_MARKERS.find((m) => line.startsWith(m));
    if (found) { start = pos; marker = found; markers++; }
    if (eol < 0) break;
    pos = eol + 1;
  }
  const signature = start < 0 ? null : body.slice(start);
  return {
    object: headers.object ?? null,
    type: headers.type ?? null,
    tag: headers.tag ?? null,
    tagger: headers.tagger ?? null,
    message: Buffer.from(start < 0 ? body : body.slice(0, start), "latin1").toString("utf8"),
    signatureKind: marker === null ? null : marker === "-----BEGIN SSH SIGNATURE-----" ? "ssh" : "other",
    signatureMarkers: markers,
    signatureComplete: signature !== null && /\n-----END SSH SIGNATURE-----\n?$/.test(signature),
  };
}

function taggerDate(tagger) {
  const m = /\s(\d{1,12}) [+-]\d{4}$/.exec(tagger ?? "");
  return m ? new Date(Number(m[1]) * 1000).toISOString() : null;
}

// Reads one release or withdrawal tag and checks it. trust null means signatures are not checked (reported as such).
// Returns { tag, verified, unchecked, reason, commit, signer, manifestSha256, withdrawReason, date }.
function inspectTag(repo, ref, kind, version, trust) {
  const name = `${kind === "release" ? RELEASE_TAG : WITHDRAWN_TAG}${version}`;
  const out = { tag: name, verified: false, unchecked: false, reason: null, commit: null, signer: null, manifestSha256: null, withdrawReason: null, date: null };
  if (ref.type !== "tag") { out.reason = "it is a lightweight tag, which cannot carry a signature"; return out; }
  const raw = runGit(repo, ["cat-file", "tag", ref.oid], { buffer: true });
  if (!raw.ok) throw new Error(`git cat-file tag ${ref.oid} failed (${raw.failure}: ${raw.stderr.trim()})`);
  const t = parseTagObject(raw.stdout);
  if (t.problem) { out.reason = t.problem; return out; }
  out.commit = t.object;
  out.date = taggerDate(t.tagger);
  if (t.tag !== name) { out.reason = `the tag object calls itself "${t.tag}", not "${name}"`; return out; }
  if (t.type !== "commit" || !COMMIT_RE.test(t.object ?? "")) { out.reason = `it points at a ${t.type ?? "missing object"}, not a commit`; return out; }
  if (t.signatureKind === null) { out.reason = "it has no signature"; return out; }
  if (t.signatureKind !== "ssh") { out.reason = "it is signed some other way than with an SSH key, so it is not verifiable here and is never treated as approved"; return out; }
  if (t.signatureMarkers !== 1 || !t.signatureComplete) { out.reason = "its signature block is malformed or repeated"; return out; }
  if (!trust) { out.unchecked = true; out.reason = "its signature was not checked, because trust is not configured"; return out; }
  const sig = verifyTagSignature(repo, ref.oid, trust.path);
  if (!sig.verified) { out.reason = sig.reason; return out; }
  out.signer = { principal: sig.principal, keyType: sig.keyType, fingerprint: sig.fingerprint };
  const lines = t.message.split("\n").map((l) => l.replace(/\r$/, ""));
  const first = kind === "release" ? `skilliton release ${version}` : `skilliton withdrawn ${version}`;
  if (lines[0] !== first) { out.reason = `its signed message does not start with "${first}"`; return out; }
  if (kind === "release") {
    const found = lines.filter((l) => l.startsWith("manifest-sha256:"));
    if (found.length !== 1 || !/^manifest-sha256: [0-9a-f]{64}$/.test(found[0])) { out.reason = "its signed message needs exactly one line \"manifest-sha256: <64 hex digits>\""; return out; }
    out.manifestSha256 = found[0].slice("manifest-sha256: ".length);
  } else {
    const found = lines.filter((l) => l.startsWith("reason:"));
    if (found.length !== 1 || !found[0].slice("reason:".length).trim()) { out.reason = "its signed message needs exactly one line \"reason: <text>\""; return out; }
    out.withdrawReason = found[0].slice("reason:".length).trim();
  }
  out.verified = true;
  return out;
}

// Every version the repository knows (manifest files in the working tree, release and withdrawal tags), newest
// first, each with { version, manifestFile, approval, withdrawal, manifest, manifestSha256, manifestProblems, state }.
// state: "approved" | "withdrawn" | "unapproved". problems: signatures that do not verify and invalid manifests.
export function readReleaseState(repo, trust) {
  const refs = runGit(repo, ["for-each-ref", "--format=%(refname)%09%(objecttype)%09%(objectname)", `refs/tags/${RELEASE_TAG}`, `refs/tags/${WITHDRAWN_TAG}`]);
  if (!refs.ok) throw new Error(`git for-each-ref failed (${refs.failure}: ${refs.stderr.trim()})`);
  const byVersion = new Map(), notes = [], problems = [];
  const entry = (version) => {
    if (!byVersion.has(version)) byVersion.set(version, { version, manifestFile: null, releaseRef: null, withdrawnRef: null });
    return byVersion.get(version);
  };
  for (const line of refs.stdout.split("\n")) {
    if (!line) continue;
    const [refname, type, oid] = line.split("\t");
    const name = refname.slice("refs/tags/".length);
    const kind = name.startsWith(RELEASE_TAG) ? "release" : "withdrawn";
    const version = name.slice((kind === "release" ? RELEASE_TAG : WITHDRAWN_TAG).length);
    if (!VERSION_RE.test(version)) { notes.push(`the tag ${name} was ignored: "${version}" is not a MAJOR.MINOR.PATCH version`); continue; }
    entry(version)[kind === "release" ? "releaseRef" : "withdrawnRef"] = { name, type, oid };
  }
  let names = [];
  try { names = readdirSync(join(repo, "releases")); } catch (e) { if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e; }
  for (const name of names) {
    const m = /^(.+)\.json$/.exec(name);
    if (m && VERSION_RE.test(m[1])) entry(m[1]).manifestFile = `releases/${name}`;
  }

  const versions = [...byVersion.values()].sort((a, b) => cmpVersion(b.version, a.version));
  for (const v of versions) {
    v.approval = v.releaseRef ? inspectTag(repo, v.releaseRef, "release", v.version, trust) : null;
    v.withdrawal = v.withdrawnRef ? inspectTag(repo, v.withdrawnRef, "withdrawn", v.version, trust) : null;
    v.manifest = null;
    v.manifestSha256 = null;
    v.manifestProblems = [];
    if (v.approval?.verified) {
      const blob = runGit(repo, ["cat-file", "blob", `${v.approval.commit}:${manifestRel(v.version)}`], { buffer: true });
      if (!blob.ok) v.manifestProblems.push(`the commit ${short(v.approval.commit)} that ${v.approval.tag} approves has no ${manifestRel(v.version)}`);
      else {
        const sha = sha256Hex(blob.stdout);
        if (sha !== v.approval.manifestSha256) v.manifestProblems.push(`${manifestRel(v.version)} at commit ${short(v.approval.commit)} has sha256 ${short(sha)}, but the signed tag approves ${short(v.approval.manifestSha256)}`);
        else {
          let parsed;
          try { parsed = JSON.parse(blob.stdout.toString("utf8")); } catch (e) { v.manifestProblems.push(`${manifestRel(v.version)} is not valid JSON (${e.message})`); }
          if (parsed !== undefined) {
            const found = validateManifest(parsed, v.version);
            if (found.length) v.manifestProblems.push(...found.map((f) => `${manifestRel(v.version)}: ${f}`));
            else { v.manifest = parsed; v.manifestSha256 = sha; }
          }
        }
      }
    }
    if (v.withdrawal?.verified) v.state = "withdrawn";
    else if (v.approval?.verified && v.manifest) v.state = "approved";
    else v.state = "unapproved";
    for (const t of [v.approval, v.withdrawal]) if (t && !t.verified && !t.unchecked) problems.push(`${t.tag} does not verify: ${t.reason}`);
    for (const mp of v.manifestProblems) problems.push(`release ${v.version} has an invalid manifest: ${mp}`);
  }
  const unchecked = versions.some((v) => v.approval?.unchecked || v.withdrawal?.unchecked);
  return { versions, problems, notes, unchecked };
}

// ---------- signing and withdrawing ----------

function requireSshSigning(repo) {
  const format = runGit(repo, ["config", "--get", "gpg.format"]).stdout.trim();
  if (format !== "ssh") refuse(`git is not set up to sign with an SSH key here (gpg.format is ${format ? `"${format}"` : "not set"}). Releases are verified against an SSH allowed_signers file, so a tag signed any other way would never be approved. Configure your own key, for example: git config gpg.format ssh and git config user.signingkey <your key>. Nothing was tagged.`);
  const key = runGit(repo, ["config", "--get", "user.signingkey"]).stdout.trim();
  const keyCommand = runGit(repo, ["config", "--get", "gpg.ssh.defaultKeyCommand"]).stdout.trim();
  if (!key && !keyCommand) refuse("git has no SSH signing key configured (user.signingkey or gpg.ssh.defaultKeyCommand). Configure your own key first; Skilliton never passes keys itself. Nothing was tagged.");
}

// Checks for release sign: the manifest is committed at HEAD, valid, unsigned, and still describes the plugins.
export function planSign(repoInput, version) {
  validateVersion(version);
  const { dir: repo } = openRepository(repoInput);
  const head = headCommit(repo);
  const format = objectFormat(repo, head);
  const rel = manifestRel(version);
  const committed = runGit(repo, ["cat-file", "blob", `HEAD:${rel}`], { buffer: true });
  if (!committed.ok) refuse(`${rel} is not in the current commit ${short(head)}. Run release create --version ${version} --apply, commit the file, then sign. Nothing was tagged.`);
  let working;
  try {
    const st = lstatSync(join(repo, rel));
    working = st.isFile() && !st.isSymbolicLink() ? readFileSync(join(repo, rel)) : null;
  } catch { working = null; }
  if (!working || Buffer.compare(working, committed.stdout) !== 0) refuse(`${rel} differs from the committed copy (changed or deleted since the commit); commit or restore it first. Nothing was tagged.`);
  let manifest;
  try { manifest = JSON.parse(committed.stdout.toString("utf8")); } catch (e) { refuse(`${rel} is not valid JSON (${e.message}). Nothing was tagged.`); }
  const problems = validateManifest(manifest, version);
  if (problems.length) refuse(`${rel} is not a valid release manifest: ${problems.join("; ")}. Nothing was tagged.`);
  for (const tag of [`${RELEASE_TAG}${version}`, `${WITHDRAWN_TAG}${version}`]) if (tagExists(repo, tag)) refuse(`the tag ${tag} already exists; a version is signed once. Nothing was tagged.`);
  const ancestor = runGit(repo, ["merge-base", "--is-ancestor", manifest.sourceCommit, head]);
  if (ancestor.status === 1) refuse(`the manifest was built from commit ${short(manifest.sourceCommit)}, which is not part of the current branch's history. Nothing was tagged.`);
  if (!ancestor.ok) refuse(`the manifest's sourceCommit ${short(manifest.sourceCommit)} is not in this repository. Nothing was tagged.`);
  for (const c of manifest.components) {
    const path = componentPath(repo, `./${c.path}`, c.name);
    const scan = scanTree(join(repo, path), { blobFormat: format });
    if (scan.problems.length) refuse(`${new TreeError(path, scan.problems).message}. Nothing was tagged.`);
    const changes = uncommittedUnder(repo, path, scan);
    if (changes.length) refuse(`uncommitted changes under ${path}: ${changes.slice(0, 10).join("; ")}. Nothing was tagged.`);
    const now = treeSha256Of(scan.files);
    if (now !== c.treeSha256) refuse(`plugin "${c.name}" (${path}) has changed since the manifest was created (tree ${short(now)} now, ${short(c.treeSha256)} in the manifest). Create a new version instead. Nothing was tagged.`);
  }
  requireSshSigning(repo);
  const manifestSha256 = sha256Hex(committed.stdout);
  const tag = `${RELEASE_TAG}${version}`;
  return { repo, head, tag, manifestSha256, args: ["tag", "-s", tag, "-m", `skilliton release ${version}`, "-m", `manifest-sha256: ${manifestSha256}`, head] };
}

function validateReason(reason) {
  if (typeof reason !== "string" || !reason.trim()) refuse("release withdraw needs --reason <text>, one line saying why");
  if (/[\x00-\x1f\x7f]/.test(reason)) refuse("--reason must be a single line without control characters");
  if (reason.length > 500) refuse(`--reason is ${reason.length} characters; keep it to 500 or fewer`);
  return reason.trim();
}

export function planWithdraw(repoInput, version, reasonInput) {
  validateVersion(version);
  const reason = validateReason(reasonInput);
  const { dir: repo } = openRepository(repoInput);
  const tag = `${RELEASE_TAG}${version}`;
  if (!tagExists(repo, tag)) refuse(`there is no ${tag} tag, so version ${version} was never approved and there is nothing to withdraw. Nothing was tagged.`);
  const withdrawn = `${WITHDRAWN_TAG}${version}`;
  if (tagExists(repo, withdrawn)) refuse(`${withdrawn} already exists. Nothing was tagged.`);
  const commit = runGit(repo, ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`]);
  if (!commit.ok) refuse(`${tag} does not point at a commit. Nothing was tagged.`);
  requireSshSigning(repo);
  const target = commit.stdout.trim();
  return { repo, tag: withdrawn, target, reason, args: ["tag", "-s", withdrawn, "-m", `skilliton withdrawn ${version}`, "-m", `reason: ${reason}`, target] };
}

// A command as a person could paste it into a POSIX shell.
export function shellLine(args) {
  return args.map((a) => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`)).join(" ");
}
