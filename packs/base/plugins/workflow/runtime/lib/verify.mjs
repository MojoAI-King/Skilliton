// verify.mjs: installed plugins checked against approved company releases (docs/CONTRACTS.md section 13).
//
// For each plugin a client has installed from the company marketplace:
//   VERIFIED         its version is in an approved, unwithdrawn release and every file matches that release
//   TAMPERED         its version is released, but the files differ (named: changed, added, missing, not regular)
//   UNKNOWN VERSION  no approved release has that version (for example a branch that moved past the last release)
//   WITHDRAWN        its files match a release that a signed tag withdrew
//   NOT INSTALLED    a plugin in the newest approved release that this client has no install record for
//
// Installed locations come from the client's own records, whose formats are not documented and are labelled so:
//   Claude Code: <config dir>/plugins/installed_plugins.json, { "version", "plugins": { "<plugin>@<marketplace>":
//                [ { "scope", "installPath", "version", ... } ] } }; config dir is --config-dir, $CLAUDE_CONFIG_DIR
//                or ~/.claude.
//   Codex:       folders $CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/ (CODEX_HOME defaults to
//                ~/.codex); a folder named "local" takes its version from the plugin's own manifest.
//
// Node built-ins only. Nothing here writes, and nothing here imports from outside the plugin folder.

import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Refused, cmpVersion, isPlainObject, refuse, tilde } from "./core.mjs";
import { VERSION_RE, openRepository, readClaudeCatalog, readCodexCatalog, readReleaseState } from "./release.mjs";
import { scanTree, treeSha256Of } from "./treehash.mjs";
import { resolveTrust, runGit } from "./trust.mjs";
import { LEGACY_MARKETPLACE, LEGACY_RELEASE_TAG } from "./legacy-names.mjs";

const CLIENTS = ["claude-code", "codex"];
const STATE_ORDER = ["VERIFIED", "TAMPERED", "UNKNOWN VERSION", "WITHDRAWN", "NOT INSTALLED"];
const MAX_RECORD_BYTES = 16 * 1024 * 1024;

export const claudeConfigDir = () => resolve(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"));
export const codexHome = () => resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));

const isInside = (child, parent) => { const r = relative(parent, child); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };

// ---------- client records ----------

// undefined: the file does not exist; null: it exists but could not be used (the reason is pushed to sink).
function readRecordJson(path, sink) {
  let st;
  try { st = lstatSync(path); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return undefined;
    sink.push(`${tilde(path)} could not be inspected (${e.code ?? e.message})`);
    return null;
  }
  if (!st.isFile()) { sink.push(`${tilde(path)} is not a regular file`); return null; }
  if (st.size > MAX_RECORD_BYTES) { sink.push(`${tilde(path)} is larger than 16 MB`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) {
    sink.push(`${tilde(path)} is not valid JSON (${e.message})`);
    return null;
  }
}

export function readClaudeInstalls(configDir) {
  const recordsPath = join(configDir, "plugins", "installed_plugins.json");
  const knownPath = join(configDir, "plugins", "known_marketplaces.json");
  const out = { recordsPath, label: "Claude Code's plugins/installed_plugins.json (format not documented; read as observed)", installs: [], invalid: [], notes: [], marketplaces: {} };
  const records = readRecordJson(recordsPath, out.invalid);
  if (records === undefined) out.notes.push(`${tilde(recordsPath)} was not found, so this Claude Code configuration has no plugin install records`);
  else if (records !== null) {
    if (!isPlainObject(records) || !isPlainObject(records.plugins)) {
      out.invalid.push(`${tilde(recordsPath)} does not have the shape Skilliton has observed ({ "version", "plugins": { "<plugin>@<marketplace>": [ ... ] } }); the format is not documented and may have changed`);
    } else {
      for (const [id, list] of Object.entries(records.plugins)) {
        const at = id.lastIndexOf("@");
        if (at <= 0 || at === id.length - 1) { out.invalid.push(`the install record key "${id}" is not <plugin>@<marketplace>`); continue; }
        if (!Array.isArray(list)) { out.invalid.push(`the install record "${id}" is not a list`); continue; }
        list.forEach((rec, i) => {
          if (!isPlainObject(rec) || typeof rec.installPath !== "string" || !isAbsolute(rec.installPath)) {
            out.invalid.push(`the install record "${id}" entry ${i + 1} has no absolute installPath`);
            return;
          }
          out.installs.push({
            id, plugin: id.slice(0, at), marketplace: id.slice(at + 1), scope: typeof rec.scope === "string" ? rec.scope : null,
            version: typeof rec.version === "string" ? rec.version : null, installPath: rec.installPath,
            gitCommitSha: typeof rec.gitCommitSha === "string" ? rec.gitCommitSha : null, notes: [],
          });
        });
      }
    }
  }
  const knownProblems = [];
  const known = readRecordJson(knownPath, knownProblems);
  if (known === undefined) out.notes.push(`${tilde(knownPath)} was not found, so marketplace sources are not shown`);
  else if (known === null || !isPlainObject(known)) out.notes.push(`${knownProblems[0] ?? `${tilde(knownPath)} does not have the observed shape`}; marketplace sources are not shown`);
  else {
    for (const [name, v] of Object.entries(known)) {
      out.marketplaces[name] = { source: v?.source?.source ?? null, location: v?.source?.repo ?? v?.source?.path ?? v?.source?.url ?? null };
    }
  }
  return out;
}

function versionFromOwnManifest(dir) {
  for (const rel of [[".codex-plugin", "plugin.json"], [".claude-plugin", "plugin.json"]]) {
    const sink = [];
    const m = readRecordJson(join(dir, ...rel), sink);
    if (isPlainObject(m) && typeof m.version === "string" && VERSION_RE.test(m.version)) return { version: m.version, from: rel.join("/") };
  }
  return { version: null, from: null };
}

export function readCodexInstalls(home, marketplaceNames) {
  const cache = join(home, "plugins", "cache");
  const out = { recordsPath: cache, label: "Codex's plugins/cache/<marketplace>/<plugin>/<version>/ folders (layout not documented; read as observed)", installs: [], invalid: [], notes: [], marketplaces: {} };
  let markets;
  try { markets = readdirSync(cache, { withFileTypes: true }); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") out.notes.push(`${tilde(cache)} was not found, so this Codex home has no cached plugins`);
    else out.invalid.push(`${tilde(cache)} could not be read (${e.code ?? e.message})`);
    return out;
  }
  const others = [];
  const listDir = (dir) => {
    try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.name !== ".DS_Store"); } catch (e) {
      out.invalid.push(`${tilde(dir)} could not be read (${e.code ?? e.message})`);
      return [];
    }
  };
  for (const m of markets.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (m.name === ".DS_Store") continue;
    if (!marketplaceNames.has(m.name)) { others.push(m.name); continue; }
    const marketDir = join(cache, m.name);
    if (!m.isDirectory()) { out.invalid.push(`${tilde(marketDir)} is not a plain folder`); continue; }
    for (const p of listDir(marketDir)) {
      const pluginDir = join(marketDir, p.name);
      if (!p.isDirectory()) { out.invalid.push(`${tilde(pluginDir)} is not a plain folder`); continue; }
      for (const v of listDir(pluginDir)) {
        const versionDir = join(pluginDir, v.name);
        if (!v.isDirectory() && !v.isSymbolicLink()) { out.notes.push(`${tilde(versionDir)} was ignored: it is a file, not a version folder`); continue; }
        const install = { id: `${p.name}@${m.name}`, plugin: p.name, marketplace: m.name, scope: null, version: v.name, installPath: versionDir, notes: [] };
        if (v.name === "local") {
          const own = versionFromOwnManifest(versionDir);
          install.version = own.version;
          install.notes.push(own.version ? `the version folder is "local"; version ${own.version} was read from its ${own.from}` : "the version folder is \"local\" and no readable version was found in its plugin manifests");
        }
        out.installs.push(install);
      }
    }
  }
  if (others.length) out.notes.push(`plugins cached from other marketplaces were not checked: ${others.join(", ")}`);
  return out;
}

// ---------- evaluation ----------

const componentOf = (release, name) => release.manifest.components.find((c) => c.name === name) ?? null;
const newestFirst = (a, b) => cmpVersion(b.version, a.version);

function listSome(items, max = 10) {
  return items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");
}

function diffFiles(component, scan) {
  const expected = new Map(component.files.map((f) => [f.path, f.sha256]));
  const actual = new Map(scan.files.map((f) => [f.path, f.sha256]));
  return {
    changed: [...expected].filter(([p, s]) => actual.has(p) && actual.get(p) !== s).map(([p]) => p),
    missing: [...expected.keys()].filter((p) => !actual.has(p)),
    added: [...actual.keys()].filter((p) => !expected.has(p)),
    problems: scan.problems.map((p) => (p.path === "." ? `the install folder: ${p.problem}` : `${p.path} (${p.problem})`)),
  };
}

function describeDiff(d) {
  const parts = [];
  if (d.problems.length) parts.push(`not verifiable: ${listSome(d.problems)}`);
  if (d.changed.length) parts.push(`changed: ${listSome(d.changed)}`);
  if (d.added.length) parts.push(`added: ${listSome(d.added)}`);
  if (d.missing.length && !d.problems.some((p) => p.startsWith("the install folder"))) parts.push(`missing: ${listSome(d.missing)}`);
  return parts.join("; ");
}

function evaluateInstall(install, releases) {
  const line = {
    state: null, plugin: install.plugin, marketplace: install.marketplace, version: install.version, scope: install.scope,
    installPath: install.installPath, release: null, detail: "", files: null, notes: [...(install.notes ?? [])],
  };
  const scan = scanTree(install.installPath);
  const tree = scan.problems.length ? null : treeSha256Of(scan.files);
  const candidates = install.version ? releases.filter((r) => componentOf(r, install.plugin)?.version === install.version).sort(newestFirst) : [];
  if (!candidates.length) {
    line.state = "UNKNOWN VERSION";
    line.detail = install.version ? `no approved release has ${install.plugin} ${install.version}` : "the install record has no version";
    const same = tree === null ? null : releases.find((r) => componentOf(r, install.plugin)?.treeSha256 === tree);
    if (same) line.notes.push(`its files are exactly ${install.plugin} ${componentOf(same, install.plugin).version} of release ${same.version}, so the client's recorded version and its files disagree`);
    return line;
  }
  const live = candidates.filter((r) => r.state === "approved");
  const gone = candidates.filter((r) => r.state === "withdrawn");
  const matches = (r) => tree !== null && componentOf(r, install.plugin).treeSha256 === tree;
  const liveMatch = live.find(matches);
  if (liveMatch) {
    const c = componentOf(liveMatch, install.plugin);
    line.state = "VERIFIED";
    line.release = liveMatch.version;
    line.detail = `release ${liveMatch.version}; all ${c.files.length} files match`;
    // The content hash does not cover the executable bit. A file the release runs by path (a hook, bin/)
    // that lost its bit cannot run, so that is attention; a bit the release does not have is only a note.
    const flags = new Map(scan.files.map((f) => [f.path, f.executable]));
    line.notRunnable = c.files.filter((f) => f.executable && flags.get(f.path) === false).map((f) => f.path);
    const gained = c.files.filter((f) => !f.executable && flags.get(f.path) === true).map((f) => f.path);
    if (line.notRunnable.length) line.notes.push(`not executable although the release marks it executable, so the client cannot run it: ${listSome(line.notRunnable)}; reinstall the plugin`);
    if (gained.length) line.notes.push(`executable although the release does not mark it so (the content hash does not cover the bit): ${listSome(gained)}`);
    return line;
  }
  const goneMatch = gone.find(matches);
  if (goneMatch) {
    line.state = "WITHDRAWN";
    line.release = goneMatch.version;
    line.detail = `its files match release ${goneMatch.version}, which was withdrawn${goneMatch.withdrawal?.date ? ` on ${goneMatch.withdrawal.date}` : ""}: ${goneMatch.withdrawal?.withdrawReason ?? "no reason recorded"}`;
    return line;
  }
  const reference = live[0] ?? gone[0];
  line.state = "TAMPERED";
  line.release = reference.version;
  line.files = diffFiles(componentOf(reference, install.plugin), scan);
  line.detail = `files differ from release ${reference.version}: ${describeDiff(line.files)}`;
  if (!live.length) line.notes.push(`every release that has ${install.plugin} ${install.version} is withdrawn`);
  return line;
}

// ---------- the whole check ----------

// The clone to read releases from: --source, or defaultSource when it is not given. Refuses a URL (not a path) and
// a client name verify does not know.
function resolveVerifySource({ client, source, defaultSource, sourceHint }) {
  if (!CLIENTS.includes(client)) refuse(`--client must be one of ${CLIENTS.join(", ")} (got "${client}")`);
  let sourceInput = source;
  if (sourceInput === undefined) {
    if (!defaultSource) refuse(`verify needs --source <path of a clone of the company skills repository>: this copy of skilliton is not inside one${sourceHint ? `, and ${sourceHint}` : ""}. The client's own marketplace copy is not assumed to hold every release tag.`);
    sourceInput = defaultSource;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(sourceInput) || /^[^/\s]+@[^/\s]+:/.test(sourceInput)) refuse("--source as a URL is not built in this version; clone the company skills repository (with its tags) and pass the clone's path");
  return openRepository(sourceInput, "--source").dir;
}

// --config-dir, checked as an existing folder, or the client's own default location.
function resolveVerifyConfigDir(client, configDir) {
  if (configDir === undefined) return client === "claude-code" ? claudeConfigDir() : codexHome();
  const dir = resolve(configDir);
  let st;
  try { st = statSync(dir); } catch { st = null; }
  if (!st?.isDirectory()) refuse(`--config-dir ${tilde(dir)} is not an existing folder`);
  return dir;
}

// The release state and the marketplace name(s) installs are checked against: from the manifests already read, and
// from the source's own catalog when it has one. notes is mutated in place; every step below adds to the same list.
function gatherReleaseNames(repo, trust, client) {
  const state = readReleaseState(repo, trust);
  const releases = state.versions.filter((v) => v.manifest && (v.state === "approved" || v.state === "withdrawn"));
  const names = new Set();
  const notes = [...state.notes];
  if (!state.versions.some((v) => v.releaseRef)) {
    notes.push(`${tilde(repo)} has no skilliton-release/<version> tags at all, so nothing can be approved; if it is a shallow or single-branch clone, fetch its tags (git fetch --tags) and run verify again`);
    const earlier = runGit(repo, ["tag", "--list", `${LEGACY_RELEASE_TAG}*`]);
    const count = earlier.ok ? earlier.stdout.split("\n").filter(Boolean).length : 0;
    if (count) notes.push(`${count} release tag(s) use the earlier prefix ${LEGACY_RELEASE_TAG}, which is no longer read; an approver re-creates each release under the Skilliton names (release create, then the signed tag it prints)`);
  }
  for (const r of releases) names.add(client === "codex" ? (r.manifest.clients?.codex?.marketplace ?? r.manifest.marketplace) : r.manifest.marketplace);
  try {
    // Codex reads .claude-plugin/marketplace.json when there is no Codex catalog (measured on 0.154.0-alpha.6.2), the
    // same fallback a release manifest records for its codex client.
    const catalog = client === "codex" ? readCodexCatalog(repo) ?? readClaudeCatalog(repo) : readClaudeCatalog(repo);
    if (catalog) names.add(catalog.name);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    notes.push(`the source's own catalog was not used for marketplace names: ${e.message}`);
  }
  return { state, releases, names, notes };
}

// This client's install records, narrowed to the plugins that came from a marketplace name gatherReleaseNames
// found; notes (from the caller) gets a line about everything filtered out or otherwise worth a note.
function gatherInstalls(client, dir, names, notes) {
  const records = client === "claude-code" ? readClaudeInstalls(dir) : readCodexInstalls(dir, names);
  notes.push(...records.notes);
  const installs = records.installs.filter((i) => names.has(i.marketplace));
  const otherIds = [...new Set(records.installs.filter((i) => !names.has(i.marketplace)).map((i) => i.id))];
  if (otherIds.length) notes.push(`plugins from other marketplaces were not checked: ${otherIds.join(", ")}`);
  const earlierIds = otherIds.filter((id) => id.endsWith(`@${LEGACY_MARKETPLACE}`));
  if (earlierIds.length && !names.has(LEGACY_MARKETPLACE)) notes.push(`${earlierIds.join(", ")} came from the marketplace's earlier name "${LEGACY_MARKETPLACE}"; set this machine up again with join (after undoing the earlier setup) so the plugins come from the current marketplace`);
  if (client === "claude-code") {
    const cache = join(dir, "plugins", "cache");
    for (const i of installs) if (!isInside(resolve(i.installPath), cache)) i.notes.push(`its install path is outside ${tilde(cache)}, where Claude Code has been observed to keep installed plugins`);
  }
  return { records, installs };
}

// One line per install, plus a NOT INSTALLED line for anything the newest approved release has that this client
// does not.
function evaluateAllInstalls(installs, releases) {
  const lines = installs.map((i) => evaluateInstall(i, releases));
  const newest = releases.filter((r) => r.state === "approved").sort(newestFirst)[0];
  if (newest) {
    for (const c of newest.manifest.components) {
      if (!installs.some((i) => i.plugin === c.name)) {
        lines.push({ state: "NOT INSTALLED", plugin: c.name, marketplace: null, version: null, scope: null, installPath: null, release: newest.version, detail: `release ${newest.version} has ${c.name} ${c.version}; this client has no install record for it`, files: null, notes: [] });
      }
    }
  }
  return lines;
}

// The exit code and the one-line summary: invalid beats everything, then all-VERIFIED, then nothing installed,
// then a mix.
function summarizeVerify(lines, invalid, names) {
  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, lines.filter((l) => l.state === s).length]));
  let exitCode, summary;
  if (invalid.length) {
    exitCode = 2;
    summary = `INVALID: ${invalid.length} problem(s) mean this cannot count as a verification (${invalid[0]}${invalid.length > 1 ? "; see the other problems above" : ""}). Nothing is approved on a signature or record that does not check out.`;
  } else if (lines.length && lines.every((l) => l.state === "VERIFIED")) {
    const notRunnable = lines.flatMap((l) => (l.notRunnable ?? []).map((p) => `${l.plugin}/${p}`));
    if (notRunnable.length) {
      exitCode = 1;
      summary = `all ${lines.length} company plugin install(s) match approved releases, but ${notRunnable.length} file(s) the release marks executable are not executable, so the client cannot run them (${listSome(notRunnable)}). Reinstall the plugin, then run verify again.`;
    } else {
      exitCode = 0;
      summary = `all ${lines.length} company plugin install(s) on this client are VERIFIED against approved releases.`;
    }
  } else if (!lines.length) {
    exitCode = 1;
    summary = `nothing was verified: this client has no plugins from the company marketplace (${[...names].join(", ") || "no name known"}) and no approved release lists any plugin.`;
  } else {
    exitCode = 1;
    const parts = STATE_ORDER.filter((s) => s !== "VERIFIED" && counts[s]).map((s) => `${counts[s]} ${s}`);
    summary = `not every company plugin is VERIFIED (${counts.VERIFIED} VERIFIED; ${parts.join(", ")}). Install or update from an approved release, then run verify again.`;
  }
  return { counts, exitCode, summary };
}

// The human-readable report: client/records, source/releases, trust, notes, problems, one line per plugin, summary.
function buildVerifyText({ client, records, repo, trust, state, notes, invalid, lines, summary }) {
  const text = [];
  const approved = state.versions.filter((v) => v.state === "approved").map((v) => v.version);
  const withdrawn = state.versions.filter((v) => v.state === "withdrawn").map((v) => v.version);
  const unapproved = state.versions.filter((v) => v.state === "unapproved").map((v) => v.version);
  text.push(`client: ${client}; install records: ${records.label} at ${tilde(records.recordsPath)}`);
  text.push(`source: ${tilde(repo)}; releases: approved ${approved.join(", ") || "none"}; withdrawn ${withdrawn.join(", ") || "none"}; unapproved ${unapproved.join(", ") || "none"}`);
  text.push(`trust: company ${trust.company}${trust.inferred ? " (the only company configured)" : ""}, ${tilde(trust.path)}, ${trust.signers.length} signer(s)`);
  for (const n of notes) text.push(`note: ${n}`);
  for (const p of invalid) text.push(`problem: ${p}`);
  const width = Math.max(...STATE_ORDER.map((s) => s.length)) + 2;
  for (const l of lines) {
    const who = l.version ? `${l.plugin} ${l.version}` : l.plugin;
    text.push(`${l.state.padEnd(width)}${who}${l.scope ? ` [${l.scope}]` : ""}: ${l.detail}`);
    for (const n of l.notes) text.push(`${" ".repeat(width)}note: ${n}`);
  }
  text.push(`Summary: ${summary}`);
  return text;
}

// The --json details object (docs/CONTRACTS.md section 13).
function buildVerifyDetails({ client, configDir, records, repo, trust, state, lines, counts, invalid, notes }) {
  return {
    client, configDir,
    records: { path: records.recordsPath, format: "not documented; read as observed", description: records.label },
    source: repo, company: trust.company, trustFile: trust.path,
    releases: state.versions.map((v) => ({
      version: v.version, state: v.state, manifestFile: v.manifestFile, manifestSha256: v.manifestSha256,
      approval: v.approval && { tag: v.approval.tag, verified: v.approval.verified, reason: v.approval.reason, signer: v.approval.signer, commit: v.approval.commit },
      withdrawal: v.withdrawal && { tag: v.withdrawal.tag, verified: v.withdrawal.verified, reason: v.withdrawal.reason, withdrawReason: v.withdrawal.withdrawReason, date: v.withdrawal.date },
      manifestProblems: v.manifestProblems,
    })),
    plugins: lines, counts, problems: invalid, notes,
  };
}

// Returns { exitCode, result, summary, details, text: [lines] }. Throws Refused for invalid input or missing trust.
export function runVerify({ client = "claude-code", configDir, source, company, defaultSource, sourceHint }) {
  const repo = resolveVerifySource({ client, source, defaultSource, sourceHint });
  const trust = resolveTrust(company);
  const dir = resolveVerifyConfigDir(client, configDir);
  const { state, releases, names, notes } = gatherReleaseNames(repo, trust, client);
  const { records, installs } = gatherInstalls(client, dir, names, notes);
  const lines = evaluateAllInstalls(installs, releases);
  const invalid = [...state.problems, ...records.invalid];
  const { counts, exitCode, summary } = summarizeVerify(lines, invalid, names);
  const text = buildVerifyText({ client, records, repo, trust, state, notes, invalid, lines, summary });
  const details = buildVerifyDetails({ client, configDir: dir, records, repo, trust, state, lines, counts, invalid, notes });
  const result = exitCode === 0 ? "complete" : exitCode === 1 ? "attention" : "invalid";
  return { exitCode, result, summary, details, text };
}
