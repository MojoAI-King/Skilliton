// join.mjs: set up one machine for a company's Skillgate, and take that setup back out (docs/CONTRACTS.md section 13).
//
// `skillgate join` runs from a full clone of the company skills repository. For each coding client found it adds the
// company marketplace and installs the plugins the team settings template enables; it records the release signers
// from a file the company hands out separately; it writes a small `skillgate` launcher into a folder meant for the
// terminal path; and it finishes with verify against that clone. Everything it adds goes into a receipt, one per
// company, so `join --undo` removes exactly that and keeps whatever was there before.
//
// Measured on 2026-09-16 (docs/CLIENTS.md): a marketplace added from GitHub is a shallow, single-branch clone on
// Claude Code 2.1.273, and neither client's copy holds release tags, so the clone join runs from is the verify source.
// Install state is read from each client's own files, as verify reads them (formats not documented), and a client
// binary runs only to make a change: every Codex invocation, even --version, writes scratch files into its home, so a
// preview, a repeat with nothing to do, and a refusal run no client at all. Clients are changed only through their
// plugin commands, with argument arrays and no shell.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { isDir, isFile, isPlainObject, readJsonObject, refuse, tilde, validateName, which } from "./core.mjs";
import { CATALOG, TEAM_TEMPLATE, templateMarketplace } from "./fork.mjs";
import { runGit, validateCompany } from "./trust.mjs";
import { claudeConfigDir, codexHome, readClaudeInstalls, readCodexInstalls } from "./verify.mjs";

export const RECEIPT_SCHEMA = "skillgate.join/1";
const GITHUB_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CLIENT_TIMEOUT_MS = 300000;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const sameRepo = (a, b) => a.toLowerCase().replace(/\.git$/, "") === b.toLowerCase().replace(/\.git$/, "");

// ---------- where join keeps its receipts ----------

export function joinDir() {
  return resolve(process.env.SKILLGATE_JOIN_DIR || join(homedir(), ".config", "skillgate", "joined"));
}

export const receiptPath = (company) => join(joinDir(), `${company}.json`);

// The receipt for a company, or null when it has not joined on this machine. A receipt that cannot be trusted to say
// what join added is refused, never guessed around.
export function readReceipt(company) {
  const path = receiptPath(company);
  let st;
  try { st = lstatSync(path); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
  if (!st.isFile()) refuse(`${tilde(path)} is not a regular file; remove it by hand. Nothing was changed.`);
  let r;
  try { r = JSON.parse(readFileSync(path, "utf8")); } catch (e) { refuse(`${tilde(path)} is not valid JSON (${e.message}), so what join added is unknown; fix or remove it by hand. Nothing was changed.`); }
  const clientsOk = isPlainObject(r?.clients) && Object.entries(r.clients).every(([id, c]) => DRIVERS[id] && typeof c?.home === "string" && typeof c.marketplaceAdded === "boolean" && Array.isArray(c.installed) && c.installed.every((p) => typeof p === "string"));
  if (r?.schema !== RECEIPT_SCHEMA || r.company !== company || typeof r.source !== "string" || !isPlainObject(r.marketplace) || typeof r.marketplace.name !== "string" || !clientsOk) {
    refuse(`${tilde(path)} is not a ${RECEIPT_SCHEMA} receipt for company "${company}", so what join added is unknown; fix or remove it by hand. Nothing was changed.`);
  }
  return r;
}

// The clone a company joined from, for verify run from an installed copy: the named company's, or the only receipt.
export function joinedSource(company) {
  if (company !== undefined) return readReceipt(company)?.source;
  let names;
  try { names = readdirSync(joinDir()).filter((n) => n.endsWith(".json")); } catch (e) { if (e.code === "ENOENT") return undefined; throw e; }
  return names.length === 1 ? readReceipt(names[0].slice(0, -".json".length))?.source : undefined;
}

// Written to a temporary file and renamed, so a receipt is never half written.
function writeReceipt(receipt) {
  const path = receiptPath(receipt.company);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...receipt, updatedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

// ---------- clients ----------

// Codex keeps marketplaces in config.toml. Only the observed section shape is read: [marketplaces.<name>] followed by
// source_type = "..." and source = "..." lines. Anything else in the file is ignored.
function readCodexMarketplaces(home) {
  const path = join(home, "config.toml");
  if (!isFile(path)) return {};
  const out = {};
  let current = null;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[marketplaces\.(?:"((?:[^"\\]|\\.)*)"|([A-Za-z0-9_-]+))\]$/.exec(line);
    if (header) { current = header[1] ?? header[2]; out[current] = {}; continue; }
    if (line.startsWith("[")) { current = null; continue; }
    const kv = current && /^(source_type|source)\s*=\s*("(?:[^"\\]|\\.)*")$/.exec(line);
    if (kv) { try { out[current][kv[1]] = JSON.parse(kv[2]); } catch { out[current][kv[1]] = null; } }
  }
  return out;
}

// Each driver says how to read a client's state and which plugin commands change it (measured 2026-09-16 on Claude
// Code 2.1.273 and Codex 0.154.0-alpha.6.2). Claude Code creates a missing configuration folder itself; Codex exits 1
// when CODEX_HOME names a folder that does not exist, so join creates that one first.
export const DRIVERS = {
  "claude-code": {
    label: "Claude Code", binaryName: "claude", flag: "--claude", homeVariable: "CLAUDE_CONFIG_DIR", home: claudeConfigDir, createsHome: true,
    addMarketplace: (source) => ["plugin", "marketplace", "add", source],
    removeMarketplace: (name) => ["plugin", "marketplace", "remove", name],
    install: (id) => ["plugin", "install", id],
    uninstall: (id) => ["plugin", "uninstall", id],
    state(home, market) {
      const r = readClaudeInstalls(home);
      if (r.invalid.length) refuse(`Claude Code's plugin records in ${tilde(home)} cannot be read as observed (${r.invalid.join("; ")}). Nothing was changed.`);
      const m = r.marketplaces[market];
      return {
        marketplace: m ? { kind: m.source === "github" ? "github" : m.source === "directory" ? "directory" : m.source ?? "unknown", location: m.location } : null,
        installed: r.installs.filter((i) => i.marketplace === market).map((i) => i.plugin),
      };
    },
  },
  codex: {
    label: "Codex", binaryName: "codex", flag: "--codex", homeVariable: "CODEX_HOME", home: codexHome, createsHome: false,
    addMarketplace: (source) => ["plugin", "marketplace", "add", source, "--json"],
    removeMarketplace: (name) => ["plugin", "marketplace", "remove", name, "--json"],
    install: (id) => ["plugin", "add", id, "--json"],
    uninstall: (id) => ["plugin", "remove", id, "--json"],
    state(home, market) {
      const r = readCodexInstalls(home, new Set([market]));
      if (r.invalid.length) refuse(`Codex's plugin cache in ${tilde(home)} cannot be read as observed (${r.invalid.join("; ")}). Nothing was changed.`);
      const m = readCodexMarketplaces(home)[market];
      const github = m?.source_type === "git" && typeof m.source === "string" ? /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(m.source)?.[1] : null;
      return {
        marketplace: m ? { kind: github ? "github" : m.source_type === "local" ? "directory" : m.source_type ?? "unknown", location: github ?? m.source ?? null } : null,
        installed: [...new Set(r.installs.map((i) => i.plugin))],
      };
    },
  },
};

// The client binary to drive: the executable given with --claude or --codex, else the one on PATH, else null. It is
// not run here (see the note at the top of this file).
function findBinary(driver, explicit) {
  if (explicit === undefined) {
    const path = which(driver.binaryName);
    return path ? { path, explicit: false } : null;
  }
  const path = resolve(explicit);
  let executable = isFile(path);
  if (executable) { try { accessSync(path, fsConstants.X_OK); } catch { executable = false; } }
  if (!executable) refuse(`${driver.flag} ${tilde(path)} is not an executable file. Nothing was changed.`);
  return { path, explicit: true };
}

function runClient(binary, args) {
  const r = spawnSync(binary.path, args, { encoding: "utf8", timeout: CLIENT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const failure = r.error ? (r.error.code === "ETIMEDOUT" ? `timed out after ${CLIENT_TIMEOUT_MS / 1000}s` : r.error.message) : r.status !== 0 ? `exit ${r.status ?? `by signal ${r.signal}`}` : null;
  return { ok: failure === null, failure, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

const describeCommand = (binary, driver, args) => `${binary.explicit ? tilde(binary.path) : driver.binaryName} ${args.join(" ")}`;

// ---------- the source clone, marketplace and plugins ----------

function inspectClone(repo) {
  const top = runGit(repo, ["rev-parse", "--show-toplevel"]);
  if (!top.ok || realpathSync(top.stdout.trim()) !== realpathSync(repo)) {
    refuse(`${tilde(repo)} is not the top of a Git clone of the company skills repository. Clone it first (git clone <company skills repository>), then run join from the clone. Nothing was changed.`);
  }
  const shallow = runGit(repo, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.ok && shallow.stdout.trim() === "true") {
    refuse(`${tilde(repo)} is a shallow clone, which can miss the signed release tags verify checks against. Run: git -C ${tilde(repo)} fetch --unshallow --tags, then join again. Nothing was changed.`);
  }
  const head = runGit(repo, ["rev-parse", "--short", "HEAD"]);
  const tags = runGit(repo, ["tag", "--list", "skillgate-release/*"]);
  return { head: head.ok ? head.stdout.trim() : null, releaseTags: tags.ok ? tags.stdout.split("\n").filter(Boolean).length : 0 };
}

// The skills repository's catalog and team template, read as they are (join never rewrites them).
function readSharedFiles(repo) {
  return { catalog: readJsonObject(join(repo, CATALOG), CATALOG), template: readJsonObject(join(repo, TEAM_TEMPLATE), TEAM_TEMPLATE) };
}

function planMarketplace(repo, requested) {
  const { catalog, template } = readSharedFiles(repo);
  const tm = templateMarketplace({ value: template });
  if (typeof catalog.name !== "string") refuse(`${CATALOG} has no "name". Nothing was changed.`);
  if (tm.name !== catalog.name) refuse(`${CATALOG} names the marketplace "${catalog.name}", but ${TEAM_TEMPLATE} names "${tm.name}"; the company fixes that with company init before anyone joins. Nothing was changed.`);
  let source;
  if (requested === undefined) {
    if (!tm.repo) refuse(`${TEAM_TEMPLATE} names no GitHub repository for the marketplace; pass --marketplace <owner>/<repo> or --marketplace <folder>. Nothing was changed.`);
    source = { kind: "github", location: tm.repo };
  } else if (isDir(resolve(requested))) {
    source = { kind: "directory", location: realpathSync(resolve(requested)) };
  } else if (GITHUB_RE.test(requested)) {
    source = { kind: "github", location: requested };
  } else {
    refuse(`--marketplace must be a GitHub owner/repo or an existing folder (got "${requested}"); other sources are not built. Nothing was changed.`);
  }
  const catalogPlugins = Array.isArray(catalog.plugins) ? catalog.plugins.map((p) => p?.name).filter((n) => typeof n === "string") : [];
  return { name: catalog.name, source, catalogPlugins, enabled: isPlainObject(template.enabledPlugins) ? template.enabledPlugins : {} };
}

function planPlugins(market, requested) {
  let plugins;
  if (requested === undefined) {
    plugins = Object.entries(market.enabled).filter(([id, on]) => on === true && id.endsWith(`@${market.name}`)).map(([id]) => id.slice(0, -`@${market.name}`.length));
    if (!plugins.length) refuse(`${TEAM_TEMPLATE} enables no plugin from ${market.name}; pass --plugins <a,b>. Nothing was changed.`);
  } else {
    plugins = [...new Set(requested.split(",").map((p) => p.trim()).filter(Boolean))];
    if (!plugins.length) refuse("--plugins is empty");
    for (const p of plugins) validateName(p, "--plugins entry");
  }
  const unknown = plugins.filter((p) => !market.catalogPlugins.includes(p));
  if (unknown.length) refuse(`${CATALOG} does not list ${unknown.join(", ")}, so it cannot be installed. Nothing was changed.`);
  if (!plugins.includes("workflow")) refuse(`the plugins to install do not include workflow, which carries the skillgate runtime and verify; add it. Nothing was changed.`);
  return plugins;
}

const sourceArgument = (source) => source.location;
const sourceLabel = (source) => (source.kind === "github" ? `GitHub ${source.location}` : `folder ${tilde(source.location)}`);

function sameSource(present, wanted) {
  if (!present || present.kind !== wanted.kind || typeof present.location !== "string") return false;
  if (wanted.kind === "github") return sameRepo(present.location, wanted.location);
  try { return realpathSync(present.location) === wanted.location; } catch { return false; }
}

// ---------- the terminal launcher ----------

const shellQuote = (text) => `'${text.replace(/'/g, `'\\''`)}'`;

export function launcherText(company, repo) {
  return [
    "#!/bin/sh",
    `# skillgate launcher for company ${company}, written by \`skillgate join\`; \`skillgate join --undo --company ${company}\` removes it.`,
    `# It runs the Skillgate command line from the company skills repository clone ${repo.replace(/\n/g, " ")}.`,
    "if ! command -v node >/dev/null 2>&1; then",
    "  echo \"skillgate: node was not found on PATH. Install Node.js 18 or later, then run the command again. Nothing was run.\" >&2",
    "  exit 3",
    "fi",
    `SKILLGATE_SELF="\${SKILLGATE_SELF:-skillgate}" exec node ${shellQuote(join(repo, "scripts", "skillgate.mjs"))} "$@"`,
    "",
  ].join("\n");
}

function planLauncher(company, repo, binDir, disabled) {
  if (disabled) return { action: "none" };
  const dir = resolve(binDir ?? join(homedir(), ".local", "bin"));
  const path = join(dir, "skillgate");
  const text = launcherText(company, repo);
  const onPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean).some((p) => resolve(p) === dir);
  let st = null;
  try { st = lstatSync(path); } catch (e) { if (e.code !== "ENOENT") throw e; }
  if (!st) return { action: "write", dir, path, text, sha256: sha256(text), onPath, createFolder: !isDir(dir) };
  if (st.isFile() && !st.isSymbolicLink() && readFileSync(path, "utf8") === text) return { action: "present", dir, path, text, sha256: sha256(text), onPath };
  return { action: "skip", dir, path, onPath, reason: `${tilde(path)} already exists and is not this company's launcher, so it is left as it is` };
}

// ---------- join ----------

export function planJoin({ repo, company, signers, client = "all", marketplace, plugins, binDir, noLauncher, claude, codex, trustPlan }) {
  validateCompany(company);
  if (!["all", ...Object.keys(DRIVERS)].includes(client)) refuse(`--client must be all, claude-code or codex (got "${client}")`);
  const clone = inspectClone(repo);
  const market = planMarketplace(repo, marketplace);
  const pluginList = planPlugins(market, plugins);
  const previous = readReceipt(company);
  if (previous && (realpathSync(previous.source) !== realpathSync(repo) || previous.marketplace.name !== market.name)) {
    refuse(`company ${company} already joined this machine from ${tilde(previous.source)} (marketplace ${previous.marketplace.name}). Run join --undo --company ${company} first, then join from the new clone. Nothing was changed.`);
  }

  const explicit = { "claude-code": claude, codex };
  const clients = [];
  for (const [id, driver] of Object.entries(DRIVERS)) {
    if (client !== "all" && client !== id) continue;
    const binary = findBinary(driver, explicit[id]);
    if (!binary) {
      if (client === id) refuse(`${driver.label} was not found on PATH; install it or pass ${driver.flag} <path>. Nothing was changed.`);
      continue;
    }
    const home = driver.home();
    const recorded = previous?.clients?.[id];
    if (recorded && resolve(recorded.home) !== home) refuse(`company ${company} joined ${driver.label} at ${tilde(recorded.home)}, but ${driver.homeVariable} now points at ${tilde(home)}; set it as it was, or undo first. Nothing was changed.`);
    const state = driver.state(home, market.name);
    if (state.marketplace && !sameSource(state.marketplace, market.source)) {
      refuse(`${driver.label} already has a marketplace named ${market.name} from ${state.marketplace.kind} ${state.marketplace.location ?? "(unknown location)"}, not ${sourceLabel(market.source)}. Remove it with: ${describeCommand(binary, driver, driver.removeMarketplace(market.name))}, or pass --marketplace for that source. Nothing was changed.`);
    }
    clients.push({
      id, driver, binary, home,
      createHome: !driver.createsHome && !isDir(home),
      addMarketplace: !state.marketplace,
      installs: pluginList.map((plugin) => ({ plugin, present: state.installed.includes(plugin) })),
    });
  }
  if (!clients.length) refuse("neither Claude Code nor Codex was found on PATH; install one, or pass --claude <path> or --codex <path>. Nothing was changed.");

  return {
    company, repo, clone, market, plugins: pluginList, clients, previous, trust: trustPlan,
    launcher: planLauncher(company, repo, binDir, noLauncher),
    receipt: receiptPath(company),
  };
}

// Applies a join plan step by step. After every change the receipt is rewritten, so a failure part way leaves an
// accurate record that `join --undo` can act on. Returns { failed: null | { step, detail } }.
export function applyJoin(plan, { say, writeTrust }) {
  const now = new Date().toISOString();
  const receipt = plan.previous ?? {
    schema: RECEIPT_SCHEMA, company: plan.company, source: plan.repo, joinedAt: now,
    marketplace: { name: plan.market.name, kind: plan.market.source.kind, location: plan.market.source.location },
    trust: null, clients: {}, launcher: null,
  };
  writeReceipt(receipt);
  say(`recorded ${tilde(plan.receipt)}`);

  if (!plan.trust.present) {
    writeTrust(plan.trust);
    receipt.trust = { path: plan.trust.dest, sha256: plan.trust.sha256 };
    writeReceipt(receipt);
    say(`trusted the release signers: ${tilde(plan.trust.dest)}`);
  }

  for (const c of plan.clients) {
    const entry = receipt.clients[c.id] ?? (receipt.clients[c.id] = { home: c.home, marketplaceAdded: false, installed: [] });
    if (c.createHome) {
      mkdirSync(c.home, { recursive: true, mode: 0o700 });
      entry.createdHome = true;
      writeReceipt(receipt);
      say(`${c.driver.label}: created its home folder ${tilde(c.home)}`);
    }
    if (c.addMarketplace) {
      const args = c.driver.addMarketplace(sourceArgument(plan.market.source));
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: { step: describeCommand(c.binary, c.driver, args), detail: `${r.failure}: ${r.output.slice(-600)}` } };
      entry.marketplaceAdded = true;
      writeReceipt(receipt);
      say(`${c.driver.label}: added marketplace ${plan.market.name} (${sourceLabel(plan.market.source)})`);
    }
    for (const i of c.installs.filter((x) => !x.present)) {
      const args = c.driver.install(`${i.plugin}@${plan.market.name}`);
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: { step: describeCommand(c.binary, c.driver, args), detail: `${r.failure}: ${r.output.slice(-600)}` } };
      if (!entry.installed.includes(i.plugin)) entry.installed.push(i.plugin);
      writeReceipt(receipt);
      say(`${c.driver.label}: installed ${i.plugin}@${plan.market.name}`);
    }
  }

  const l = plan.launcher;
  if (l.action === "write") {
    mkdirSync(l.dir, { recursive: true });
    writeFileSync(l.path, l.text, { flag: "wx", mode: 0o755 });
    receipt.launcher = { path: l.path, sha256: l.sha256, createdFolder: l.createFolder };
    writeReceipt(receipt);
    say(`wrote the terminal command ${tilde(l.path)}`);
  }
  return { failed: null };
}

// ---------- undo ----------

export function planUndo({ company, claude, codex }) {
  validateCompany(company);
  const receipt = readReceipt(company);
  if (!receipt) refuse(`company ${company} has not joined this machine (no ${tilde(receiptPath(company))}); nothing to undo.`);
  const explicit = { "claude-code": claude, codex };
  const clients = [];
  for (const [id, recorded] of Object.entries(receipt.clients)) {
    const driver = DRIVERS[id];
    const home = driver.home();
    if (resolve(recorded.home) !== home) refuse(`company ${company} joined ${driver.label} at ${tilde(recorded.home)}, but ${driver.homeVariable} now points at ${tilde(home)}; set it as it was when joining. Nothing was changed.`);
    const state = driver.state(home, receipt.marketplace.name);
    const uninstall = recorded.installed.filter((p) => state.installed.includes(p));
    const gone = recorded.installed.filter((p) => !state.installed.includes(p));
    const others = state.installed.filter((p) => !recorded.installed.includes(p));
    const removeMarketplace = recorded.marketplaceAdded && state.marketplace !== null && others.length === 0;
    const needsBinary = uninstall.length > 0 || removeMarketplace;
    const binary = needsBinary ? findBinary(driver, explicit[id]) : null;
    if (needsBinary && !binary) refuse(`${driver.label} is needed to remove what join installed, but it was not found on PATH; pass ${driver.flag} <path>. Nothing was changed.`);
    clients.push({ id, driver, binary, home, uninstall, gone, others, removeMarketplace, keptMarketplace: recorded.marketplaceAdded && state.marketplace !== null && others.length > 0 });
  }

  let trust = { action: "none" };
  if (receipt.trust) {
    const t = receipt.trust;
    if (!isFile(t.path)) trust = { action: "gone", path: t.path };
    else if (sha256(readFileSync(t.path)) === t.sha256) trust = { action: "remove", path: t.path };
    else trust = { action: "changed", path: t.path };
  }
  let launcher = { action: "none" };
  if (receipt.launcher) {
    const l = receipt.launcher;
    let st = null;
    try { st = lstatSync(l.path); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (!st) launcher = { action: "gone", ...l };
    else if (st.isFile() && !st.isSymbolicLink() && sha256(readFileSync(l.path)) === l.sha256) launcher = { action: "remove", ...l };
    else launcher = { action: "changed", ...l };
  }
  return { company, receipt, clients, trust, launcher, path: receiptPath(company) };
}

// Returns { failed, kept } where kept lists what was deliberately left because it changed after join.
export function applyUndo(plan, { say, backup }) {
  const kept = [];
  for (const c of plan.clients) {
    for (const plugin of c.uninstall) {
      const args = c.driver.uninstall(`${plugin}@${plan.receipt.marketplace.name}`);
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: { step: describeCommand(c.binary, c.driver, args), detail: `${r.failure}: ${r.output.slice(-600)}` }, kept };
      say(`${c.driver.label}: uninstalled ${plugin}@${plan.receipt.marketplace.name}`);
    }
    if (c.removeMarketplace) {
      const args = c.driver.removeMarketplace(plan.receipt.marketplace.name);
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: { step: describeCommand(c.binary, c.driver, args), detail: `${r.failure}: ${r.output.slice(-600)}` }, kept };
      say(`${c.driver.label}: removed marketplace ${plan.receipt.marketplace.name}`);
    }
    if (c.keptMarketplace) kept.push(`${c.driver.label} marketplace ${plan.receipt.marketplace.name}, because ${c.others.join(", ")} from it were installed separately`);
  }
  if (plan.trust.action === "remove") {
    say(`backed up ${tilde(plan.trust.path)} to ${tilde(backup(plan.trust.path))}`);
    unlinkSync(plan.trust.path);
    say(`removed the trusted release signers ${tilde(plan.trust.path)}`);
  } else if (plan.trust.action === "changed") kept.push(`${tilde(plan.trust.path)}, because it changed after join (remove it with trust remove)`);
  if (plan.launcher.action === "remove") {
    unlinkSync(plan.launcher.path);
    say(`removed the terminal command ${tilde(plan.launcher.path)}`);
    if (plan.launcher.createdFolder) {
      const folder = dirname(plan.launcher.path);
      try {
        rmdirSync(folder);
        say(`removed the folder ${tilde(folder)}, which join created and is now empty`);
      } catch (e) {
        if (e.code !== "ENOTEMPTY" && e.code !== "EEXIST" && e.code !== "ENOENT") throw e;
      }
    }
  } else if (plan.launcher.action === "changed") kept.push(`${tilde(plan.launcher.path)}, because it changed after join (remove it by hand)`);
  say(`backed up ${tilde(plan.path)} to ${tilde(backup(plan.path))}`);
  unlinkSync(plan.path);
  say(`removed ${tilde(plan.path)}`);
  return { failed: null, kept };
}
