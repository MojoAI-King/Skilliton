// join.mjs: set up one machine for a company's Skilliton, and take that setup back out (docs/CONTRACTS.md section 13).
//
// `skilliton join` runs from a full clone of the company skills repository. For each coding client found it adds the
// company marketplace and installs the plugins the team settings template enables; it records the release signers
// from a file the company hands out separately; it writes a small `skilliton` launcher into a folder meant for the
// terminal path; and it finishes with verify against that clone. Everything it adds goes into a receipt, one per
// company, so `join --undo` removes exactly that and keeps whatever was there before.
//
// Measured on 2026-09-16 (docs/CLIENTS.md): a marketplace added from GitHub is a shallow, single-branch clone on
// Claude Code 2.1.273, and neither client's copy holds release tags, so the clone join runs from is the verify source.
// Install state is read from each client's own files, as verify reads them (formats not documented), and a client
// binary runs only to make a change: every Codex invocation, even --version, writes scratch files into its home, so a
// preview, a repeat with nothing to do, and a refusal run no client at all. Clients are changed only through their
// plugin commands, with argument arrays and no shell.
//
// The receipt is treated as untrusted input: undo removes only the signers file at this company's trust path and a
// launcher whose text is exactly the one join writes, and it refuses a receipt that does not have the recorded shape.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { NAME_RE, isDir, isPlainObject, readJsonObject, refuse, tilde, which } from "./core.mjs";
import { TEAM_TEMPLATE, templateMarketplace, validateRepo } from "./fork.mjs";
import { readClaudeCatalog } from "./release.mjs";
import { runGit, trustFilePath, validateCompany } from "./trust.mjs";
import { claudeConfigDir, codexHome, readClaudeInstalls, readCodexInstalls } from "./verify.mjs";
import { LEGACY_COMMAND, legacyJoinDir } from "./legacy-names.mjs";

const RECEIPT_SCHEMA = "skilliton.join/1";
const LAUNCHER_NAME = "skilliton";
const LAUNCHER_CMD_NAME = "skilliton.cmd";
const CLIENT_TIMEOUT_MS = 300000;
const SHA256_RE = /^[0-9a-f]{64}$/;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const sameRepo = (a, b) => a.toLowerCase().replace(/\.git$/, "") === b.toLowerCase().replace(/\.git$/, "");

function lstatOrNull(path) {
  try { return lstatSync(path); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; }
}

function realpathOrNull(path) {
  try { return realpathSync(path); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; }
}

// ---------- receipts ----------

export function joinDir() {
  return resolve(process.env.SKILLITON_JOIN_DIR || join(homedir(), ".config", "skilliton", "joined"));
}

const receiptPath = (company) => join(joinDir(), `${company}.json`);

function receiptProblem(r, company) {
  if (!isPlainObject(r) || r.schema !== RECEIPT_SCHEMA) return `schema is not ${RECEIPT_SCHEMA}`;
  if (r.company !== company) return `it names company ${JSON.stringify(r.company)}`;
  if (typeof r.source !== "string" || !isAbsolute(r.source)) return "source is not an absolute path";
  const m = r.marketplace;
  if (!isPlainObject(m) || typeof m.name !== "string" || !NAME_RE.test(m.name) || !["github", "directory"].includes(m.kind) || typeof m.location !== "string") return "marketplace is not { name, kind, location }";
  if (r.trust !== null && !(isPlainObject(r.trust) && typeof r.trust.path === "string" && isAbsolute(r.trust.path) && SHA256_RE.test(r.trust.sha256 ?? ""))) return "trust is not null or { path, sha256 }";
  const l = r.launcher;
  if (l !== null && !(isPlainObject(l) && typeof l.path === "string" && isAbsolute(l.path) && basename(l.path) === LAUNCHER_NAME && typeof l.createdFolder === "boolean")) return "launcher is not null or { path to a file named skilliton, createdFolder }";
  const lc = r.launcherCmd;
  if (lc !== undefined && lc !== null && !(isPlainObject(lc) && typeof lc.path === "string" && isAbsolute(lc.path) && basename(lc.path) === LAUNCHER_CMD_NAME && typeof lc.createdFolder === "boolean")) return "launcherCmd is not absent, null or { path to a file named skilliton.cmd, createdFolder }";
  if (r.prepare !== undefined && !["auto", "offer"].includes(r.prepare)) return 'prepare is not "auto" or "offer"'; if (!isPlainObject(r.clients)) return "clients is not an object";
  for (const [id, c] of Object.entries(r.clients)) {
    if (!Object.hasOwn(DRIVERS, id)) return `clients names an unknown client ${JSON.stringify(id)}`;
    const ok = isPlainObject(c) && typeof c.home === "string" && isAbsolute(c.home) && typeof c.marketplaceAdded === "boolean"
      && Array.isArray(c.installed) && c.installed.every((p) => typeof p === "string" && NAME_RE.test(p))
      && (c.createdHome === undefined || typeof c.createdHome === "boolean");
    if (!ok) return `clients.${id} is not { home, marketplaceAdded, installed }`;
  }
  return null;
}

// The receipt for a company, or null when it has not joined this machine. A receipt that does not have the recorded
// shape is refused rather than acted on, because undo deletes what it names.
function readReceipt(company) {
  validateCompany(company);
  const path = receiptPath(company);
  const st = lstatOrNull(path);
  if (!st) return null;
  if (!st.isFile()) refuse(`${tilde(path)} is not a regular file; remove it by hand. Nothing was changed.`);
  let r;
  try { r = JSON.parse(readFileSync(path, "utf8")); } catch (e) { refuse(`${tilde(path)} is not valid JSON (${e.message}), so what join added is unknown; fix or remove it by hand. Nothing was changed.`); }
  const problem = receiptProblem(r, company);
  if (problem) refuse(`${tilde(path)} is not a valid join receipt for company ${company} (${problem}), so what join added is unknown; fix or remove it by hand. Nothing was changed.`);
  return r;
}

// Which clone verify should read when it runs from an installed copy: { source } for the named company, or for the
// only company that joined; otherwise { reason } saying why there is no default.
export function joinedSource(company) {
  if (company !== undefined) {
    const r = readReceipt(company);
    return r ? { source: r.source } : { reason: `company ${company} has not joined this machine with skilliton join` };
  }
  let names;
  try { names = readdirSync(joinDir()).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length)).filter((n) => NAME_RE.test(n)).sort(); } catch (e) {
    if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
    names = [];
  }
  if (names.length === 1) return { source: readReceipt(names[0]).source };
  return { reason: names.length ? `several companies joined this machine (${names.join(", ")}); pass --company <name>` : "no company has joined this machine with skilliton join" };
}

// Written to a new temporary file and renamed, so a receipt is never half written.
function writeReceipt(receipt) {
  const path = receiptPath(receipt.company);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  try { unlinkSync(tmp); } catch (e) { if (e.code !== "ENOENT") throw e; }
  writeFileSync(tmp, `${JSON.stringify({ ...receipt, updatedAt: new Date().toISOString() }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(tmp, path);
}

// ---------- clients ----------

// Claude Code's known_marketplaces.json, strictly: a record that exists but cannot be read is refused, so a
// marketplace is never mistaken for absent.
function readClaudeMarketplaces(home) {
  const path = join(home, "plugins", "known_marketplaces.json");
  const st = lstatOrNull(path);
  if (!st) return new Map();
  if (!st.isFile()) refuse(`${tilde(path)} is not a regular file, so Claude Code's marketplaces cannot be read. Nothing was changed.`);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch (e) { refuse(`${tilde(path)} is not valid JSON (${e.message}), so Claude Code's marketplaces cannot be read. Nothing was changed.`); }
  if (!isPlainObject(value)) refuse(`${tilde(path)} does not hold an object, so Claude Code's marketplaces cannot be read. Nothing was changed.`);
  return new Map(Object.entries(value).map(([name, m]) => {
    const source = m?.source?.source;
    return [name, { kind: source === "github" ? "github" : source === "directory" ? "directory" : String(source ?? "unknown"), location: m?.source?.repo ?? m?.source?.path ?? m?.source?.url ?? null }];
  }));
}

// Codex's marketplaces from config.toml, in the section shape Codex was measured to write: [marketplaces.<name>] with
// source_type = "..." and source = "..." lines. Any other way of declaring a marketplace is refused rather than
// skipped, so a marketplace is never mistaken for absent.
function readCodexMarketplaces(home) {
  const path = join(home, "config.toml");
  const st = lstatOrNull(path);
  if (!st) return new Map();
  if (!st.isFile()) refuse(`${tilde(path)} is not a regular file, so Codex's marketplaces cannot be read. Nothing was changed.`);
  const out = new Map();
  let current = null;
  const unreadable = (i, what) => refuse(`${tilde(path)} line ${i + 1} ${what}, which join cannot read safely. Write it as [marketplaces.<name>] with source_type and source lines, or remove it. Nothing was changed.`);
  readFileSync(path, "utf8").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const header = /^\[marketplaces\.(?:"([a-z0-9][a-z0-9-]*)"|([a-z0-9][a-z0-9-]*))\]\s*(?:#.*)?$/.exec(line);
    if (header) {
      current = header[1] ?? header[2];
      if (out.has(current)) unreadable(i, `declares the marketplace ${current} a second time`);
      out.set(current, {});
      return;
    }
    if (line.startsWith("[")) {
      if (/marketplaces/.test(line)) unreadable(i, "declares a marketplaces table in another form");
      current = null;
      return;
    }
    if (/^["']?marketplaces["']?\s*[.=]/.test(line)) unreadable(i, "sets marketplaces with a dotted key or an inline table");
    if (!current || !line || line.startsWith("#")) return;
    const kv = /^(source_type|source)\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(line);
    if (kv) {
      try { out.get(current)[kv[1]] = JSON.parse(kv[2]); } catch { unreadable(i, `has a ${kv[1]} value`); }
    } else if (/^(source_type|source)\s*=/.test(line)) unreadable(i, "has a source value in another form");
  });
  return new Map([...out].map(([name, m]) => {
    const github = m.source_type === "git" && typeof m.source === "string" ? /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(m.source)?.[1] : null;
    return [name, { kind: github ? "github" : m.source_type === "local" ? "directory" : String(m.source_type ?? "unknown"), location: github ?? m.source ?? null }];
  }));
}

// Each driver says how to read a client's state and which plugin commands change it (measured 2026-09-16 on Claude
// Code 2.1.273 and Codex 0.154.0-alpha.6.2). Claude Code creates a missing configuration folder itself; Codex exits 1
// when CODEX_HOME names a folder that does not exist, so join creates that one first.
//
// state() returns { marketplaces: Map, marketplace, installed, installs }: `installs` lists every install from the
// marketplace as { plugin, joinScope }, where joinScope marks the scope join installs into (Claude Code's user scope;
// Codex has one), and `installed` names the plugins present in that scope.
const DRIVERS = {
  "claude-code": {
    label: "Claude Code", binaryName: "claude", flag: "--claude", homeVariable: "CLAUDE_CONFIG_DIR", home: claudeConfigDir, createsHome: true,
    addMarketplace: (source) => ["plugin", "marketplace", "add", source],
    removeMarketplace: (name) => ["plugin", "marketplace", "remove", name],
    install: (id) => ["plugin", "install", id],
    uninstall: (id) => ["plugin", "uninstall", id],
    state(home, market) {
      const r = readClaudeInstalls(home);
      if (r.invalid.length) refuse(`Claude Code's plugin records in ${tilde(home)} cannot be read as observed (${r.invalid.join("; ")}). Nothing was changed.`);
      const marketplaces = readClaudeMarketplaces(home);
      const installs = r.installs.filter((i) => i.marketplace === market).map((i) => ({ plugin: i.plugin, joinScope: i.scope === "user" }));
      return { marketplaces, marketplace: marketplaces.get(market) ?? null, installs, installed: [...new Set(installs.filter((i) => i.joinScope).map((i) => i.plugin))] };
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
      const marketplaces = readCodexMarketplaces(home);
      const installs = r.installs.map((i) => ({ plugin: i.plugin, joinScope: true }));
      return { marketplaces, marketplace: marketplaces.get(market) ?? null, installs, installed: [...new Set(installs.map((i) => i.plugin))] };
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
  const st = lstatOrNull(path);
  let executable = Boolean(st) && !st.isDirectory();
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
const clientFailure = (binary, driver, args, r) => ({ step: describeCommand(binary, driver, args), detail: `${r.failure}: ${r.output.slice(-600)}` });

// ---------- the source clone, marketplace and plugins ----------

function inspectClone(repo) {
  const top = runGit(repo, ["rev-parse", "--show-toplevel"]);
  if (!top.ok || realpathOrNull(top.stdout.trim()) !== realpathSync(repo)) {
    refuse(`${tilde(repo)} is not the top of a Git clone of the company skills repository. Clone it first (git clone <company skills repository>), then run join from the clone. Nothing was changed.`);
  }
  const shallow = runGit(repo, ["rev-parse", "--is-shallow-repository"]);
  if (shallow.ok && shallow.stdout.trim() === "true") {
    refuse(`${tilde(repo)} is a shallow clone, which can miss the signed release tags verify checks against. Run: git -C ${tilde(repo)} fetch --unshallow --tags, then join again. Nothing was changed.`);
  }
  const head = runGit(repo, ["rev-parse", "--short", "HEAD"]);
  const tags = runGit(repo, ["tag", "--list", "skilliton-release/*"]);
  return { head: head.ok ? head.stdout.trim() : null, releaseTags: tags.ok ? tags.stdout.split("\n").filter(Boolean).length : 0 };
}

function planMarketplace(repo, requested) {
  const catalog = readClaudeCatalog(repo);
  const template = readJsonObject(join(repo, TEAM_TEMPLATE), TEAM_TEMPLATE);
  const tm = templateMarketplace({ value: template });
  if (tm.name !== catalog.name) refuse(`the catalog names the marketplace "${catalog.name}", but ${TEAM_TEMPLATE} names "${tm.name}"; the company fixes that with company init before anyone joins. Nothing was changed.`);
  let source;
  if (requested === undefined) {
    if (!tm.repo) refuse(`${TEAM_TEMPLATE} names no GitHub repository for the marketplace; pass --marketplace <owner>/<repo> or --marketplace <folder>. Nothing was changed.`);
    validateRepo(tm.repo, `the repository in ${TEAM_TEMPLATE}`);
    source = { kind: "github", location: tm.repo };
  } else if (isDir(resolve(requested))) {
    const location = realpathSync(resolve(requested));
    const theirs = readClaudeCatalog(location);
    if (theirs.name !== catalog.name) refuse(`the marketplace in ${tilde(location)} is named "${theirs.name}", but this clone's catalog names "${catalog.name}"; join installs from the company's own marketplace. Nothing was changed.`);
    source = { kind: "directory", location };
  } else if (/^[A-Za-z][A-Za-z0-9+.-]*:|^[^/\s]+@[^/\s]+:/.test(requested)) {
    refuse(`--marketplace must be a GitHub owner/repo or an existing folder (got "${requested}"); URL sources are not built. Nothing was changed.`);
  } else {
    validateRepo(requested, "--marketplace");
    source = { kind: "github", location: requested };
  }
  return { name: catalog.name, source, catalogPlugins: catalog.plugins.map((p) => p.name), enabled: isPlainObject(template.enabledPlugins) ? template.enabledPlugins : {} };
}

function planPlugins(market, requested) {
  let plugins;
  if (requested === undefined) {
    const ending = `@${market.name}`;
    plugins = Object.entries(market.enabled).filter(([id, on]) => on === true && id.endsWith(ending)).map(([id]) => id.slice(0, -ending.length));
    if (!plugins.length) refuse(`${TEAM_TEMPLATE} enables no plugin from ${market.name}; pass --plugins <a,b>. Nothing was changed.`);
  } else {
    plugins = [...new Set(requested.split(",").map((p) => p.trim()).filter(Boolean))];
    if (!plugins.length) refuse("--plugins is empty");
  }
  const unknown = plugins.filter((p) => !market.catalogPlugins.includes(p));
  if (unknown.length) refuse(`the catalog does not list ${unknown.join(", ")}, so it cannot be installed. Nothing was changed.`);
  if (!plugins.includes("workflow")) refuse("the plugins to install do not include workflow, which carries the skilliton runtime and verify; add it. Nothing was changed.");
  return plugins;
}

const sourceLabel = (source) => (source.kind === "github" ? `GitHub ${source.location}` : `folder ${tilde(source.location)}`);

function sameSource(present, wanted) {
  if (!present || present.kind !== wanted.kind || typeof present.location !== "string") return false;
  if (wanted.kind === "github") return sameRepo(present.location, wanted.location);
  return realpathOrNull(present.location) === wanted.location;
}

// ---------- the terminal launcher ----------

const shellQuote = (text) => `'${text.replace(/'/g, `'\\''`)}'`;

function launcherText(company, repo) {
  return [
    "#!/bin/sh",
    `# skilliton launcher for company ${company}, written by \`skilliton join\`; \`skilliton join --undo --company ${company}\` removes it.`,
    `# It runs the Skilliton command line from the company skills repository clone ${repo.replace(/[\r\n]/g, " ")}.`,
    "if ! command -v node >/dev/null 2>&1; then",
    "  echo \"skilliton: node was not found on PATH. Install Node.js 18 or later, then run the command again. Nothing was run.\" >&2",
    "  exit 3",
    "fi",
    `SKILLITON_SELF="\${SKILLITON_SELF:-skilliton}" exec node ${shellQuote(join(repo, "scripts", "skilliton.mjs"))} "$@"`,
    "",
  ].join("\n");
}

// The Windows launcher, for PowerShell and the Command Prompt, where a POSIX shell script does not run. Written by
// join on Windows only (docs/WINDOWS.md); CRLF line endings, as cmd.exe expects.
export function launcherCmdText(company, repo) {
  const script = join(repo, "scripts", "skilliton.mjs").replace(/\//g, "\\").replace(/[\r\n]/g, " ");
  return [
    "@echo off",
    `rem skilliton launcher for company ${company}, written by \`skilliton join\`; \`skilliton join --undo --company ${company}\` removes it.`,
    "where node >nul 2>nul || (echo skilliton: node was not found on PATH. Install Node.js 18 or later, then run the command again. Nothing was run. 1>&2 & exit /b 3)",
    'if "%SKILLITON_SELF%"=="" set "SKILLITON_SELF=skilliton"',
    `node "${script}" %*`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

// True when the file at path is a regular file holding exactly the given text.
function holdsExactly(path, text) {
  const st = lstatOrNull(path);
  return Boolean(st?.isFile()) && readFileSync(path, "utf8") === text;
}

// True when the file at path is a regular file holding exactly this company's launcher for this clone.
const isOurLauncher = (path, company, repo) => holdsExactly(path, launcherText(company, repo));

function planOneLauncher(dir, name, text, what) {
  const path = join(dir, name);
  if (holdsExactly(path, text)) return { action: "present", path, text };
  if (lstatOrNull(path)) return { action: "skip", path, reason: `${tilde(path)} already exists and is not this company's ${what}, so it is left as it is` };
  return { action: "write", path, text, sha256: sha256(text) };
}

// On win32 the plan also carries cmd, the skilliton.cmd launcher next to the POSIX one, under the same rules; elsewhere
// cmd is null. platform is injectable so the Windows plan is tested on every platform.
function planLauncher(company, repo, binDir, disabled, platform = process.platform) {
  if (disabled) return { action: "none", cmd: null };
  const dir = resolve(binDir ?? join(homedir(), ".local", "bin"));
  const onPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean).some((p) => resolve(p) === dir);
  const posix = planOneLauncher(dir, LAUNCHER_NAME, launcherText(company, repo), "launcher");
  const cmd = platform === "win32" ? planOneLauncher(dir, LAUNCHER_CMD_NAME, launcherCmdText(company, repo), "launcher") : null;
  const createFolder = posix.action === "write" ? !isDir(dir) : undefined;
  return { ...posix, dir, onPath, ...(createFolder === undefined ? {} : { createFolder }), cmd };
}

// ---------- join ----------

// A machine set up for this company before the rename has a receipt under the earlier name. Joining again would add a
// second marketplace and launcher and record the first setup's changes as already present, so its undo could never
// remove them. Only the release that wrote the receipt reads it, so it is named, not read.
export function refuseLegacySetup(company) {
  const path = join(legacyJoinDir(), `${company}.json`);
  let present = false;
  try { lstatSync(path); present = true; } catch (e) { if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e; }
  if (!present) return;
  refuse(`company ${company} was set up on this machine before the rename to Skilliton (its receipt is ${tilde(path)}). Remove that setup first with the release that wrote it: in a clone of the company skills repository checked out at a commit from before the rename, run node scripts/${LEGACY_COMMAND}.mjs join --undo --company ${company} --apply, then run join here again. Nothing was changed.`);
}

export function planJoin({ repo, company, client = "all", marketplace, plugins, binDir, noLauncher, claude, codex, trustPlan, prepare, platform = process.platform }) {
  validateCompany(company);
  refuseLegacySetup(company);
  if (!["all", ...Object.keys(DRIVERS)].includes(client)) refuse(`--client must be all, claude-code or codex (got "${client}")`);
  const clone = inspectClone(repo);
  const market = planMarketplace(repo, marketplace);
  const pluginList = planPlugins(market, plugins);
  const launcher = planLauncher(company, repo, binDir, noLauncher, platform);
  const previous = readReceipt(company);
  if (previous) {
    const again = `Run join --undo --company ${company} --apply first, then join again. Nothing was changed.`;
    if (realpathOrNull(previous.source) !== realpathSync(repo) || previous.marketplace.name !== market.name || !sameSource(previous.marketplace, market.source)) {
      refuse(`company ${company} already joined this machine from ${tilde(previous.source)} (marketplace ${previous.marketplace.name} from ${sourceLabel(previous.marketplace)}). ${again}`);
    }
    if (previous.trust && previous.trust.path !== trustPlan.dest) refuse(`company ${company} trusted its signers at ${tilde(previous.trust.path)}, but the trust folder is now ${tilde(trustPlan.dir)}; set SKILLITON_TRUST_DIR as it was, or undo first. ${again}`);
    if (previous.launcher && launcher.action !== "none" && previous.launcher.path !== launcher.path) refuse(`company ${company} wrote its terminal command at ${tilde(previous.launcher.path)}, not ${tilde(launcher.path)}; pass --bin-dir ${tilde(dirname(previous.launcher.path))}, or undo first. ${again}`);
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
      marketplaceNames: new Set(state.marketplaces.keys()),
      installs: pluginList.map((plugin) => ({ plugin, present: state.installed.includes(plugin) })),
    });
  }
  if (!clients.length) refuse("neither Claude Code nor Codex was found on PATH; install one, or pass --claude <path> or --codex <path>. Nothing was changed.");

  return { company, repo, clone, market, plugins: pluginList, clients, previous, trust: trustPlan, launcher, prepare, receipt: receiptPath(company) };
}

// Applies a join plan step by step. After every change the receipt is rewritten, so a failure part way leaves an
// accurate record that `join --undo` can act on. Returns { failed: null | { step, detail } }.
export function applyJoin(plan, { say, writeTrust }) {
  const receipt = plan.previous ?? {
    schema: RECEIPT_SCHEMA, company: plan.company, source: plan.repo, joinedAt: new Date().toISOString(),
    marketplace: { name: plan.market.name, kind: plan.market.source.kind, location: plan.market.source.location },
    trust: null, clients: {}, launcher: null, launcherCmd: null, prepare: plan.prepare ?? "auto",
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
      const failed = addMarketplace(plan, c, entry, receipt, say);
      if (failed) return { failed };
    }
    for (const i of c.installs.filter((x) => !x.present)) {
      const args = c.driver.install(`${i.plugin}@${plan.market.name}`);
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: clientFailure(c.binary, c.driver, args, r) };
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
  if (l.cmd?.action === "write") {
    mkdirSync(l.dir, { recursive: true });
    writeFileSync(l.cmd.path, l.cmd.text, { flag: "wx" });
    receipt.launcherCmd = { path: l.cmd.path, sha256: l.cmd.sha256, createdFolder: false };
    writeReceipt(receipt);
    say(`wrote the Windows terminal command ${tilde(l.cmd.path)}`);
  }
  return { failed: null };
}

// Adds the marketplace, then checks the client now has it under the company's name and from the planned source, so
// the receipt never records a marketplace that is not there. Returns a failure or null.
function addMarketplace(plan, c, entry, receipt, say) {
  const { name, source } = plan.market;
  const args = c.driver.addMarketplace(source.location);
  const r = runClient(c.binary, args);
  if (!r.ok) return clientFailure(c.binary, c.driver, args, r);
  let after;
  try { after = c.driver.state(c.home, name); } catch (e) {
    return { step: describeCommand(c.binary, c.driver, args), detail: `the command succeeded, but the client's records could not be read afterwards: ${e.message}` };
  }
  if (!after.marketplace || !sameSource(after.marketplace, source)) {
    const added = [...after.marketplaces.keys()].filter((n) => !c.marketplaceNames.has(n));
    const cleanup = added.map((n) => describeCommand(c.binary, c.driver, c.driver.removeMarketplace(n))).join("; ");
    return { step: describeCommand(c.binary, c.driver, args), detail: `the command succeeded, but ${c.driver.label} has no marketplace named ${name} from ${sourceLabel(source)} afterwards${added.length ? `; it added ${added.join(", ")} instead, which join did not record. Remove it with: ${cleanup}` : ""}` };
  }
  entry.marketplaceAdded = true;
  writeReceipt(receipt);
  say(`${c.driver.label}: added marketplace ${name} (${sourceLabel(source)})`);
  return null;
}

// ---------- undo ----------

export function planUndo({ company, claude, codex }) {
  const receipt = readReceipt(company);
  if (!receipt) refuse(`company ${company} has not joined this machine (no ${tilde(receiptPath(company))}); nothing to undo.`);
  const market = receipt.marketplace;
  const explicit = { "claude-code": claude, codex };
  const clients = [];
  for (const [id, recorded] of Object.entries(receipt.clients)) {
    const driver = DRIVERS[id];
    const home = driver.home();
    if (resolve(recorded.home) !== home) refuse(`company ${company} joined ${driver.label} at ${tilde(recorded.home)}, but ${driver.homeVariable} now points at ${tilde(home)}; set it as it was when joining. Nothing was changed.`);
    const state = driver.state(home, market.name);
    const uninstall = recorded.installed.filter((p) => state.installed.includes(p));
    const gone = recorded.installed.filter((p) => !state.installed.includes(p));
    const others = [...new Set(state.installs.filter((i) => !(i.joinScope && uninstall.includes(i.plugin))).map((i) => i.plugin))];
    let removeMarketplace = false, keepReason = null;
    if (recorded.marketplaceAdded && state.marketplace) {
      if (!sameSource(state.marketplace, market)) keepReason = `it now comes from ${state.marketplace.kind} ${state.marketplace.location ?? "(unknown location)"}, not the source join added`;
      else if (others.length) keepReason = `${others.join(", ")} from it ${others.length === 1 ? "is" : "are"} installed apart from join (in another scope or separately)`;
      else removeMarketplace = true;
    }
    const needsBinary = uninstall.length > 0 || removeMarketplace;
    const binary = needsBinary ? findBinary(driver, explicit[id]) : null;
    if (needsBinary && !binary) refuse(`${driver.label} is needed to remove what join installed, but it was not found on PATH; pass ${driver.flag} <path>. Nothing was changed.`);
    clients.push({ id, driver, binary, home, uninstall, gone, removeMarketplace, keepReason });
  }

  // Only the signers file at this company's trust path, and only a launcher holding exactly join's text, are removed.
  let trust = { action: "none" };
  if (receipt.trust) {
    const path = trustFilePath(company);
    if (receipt.trust.path !== path) refuse(`the receipt records the signers file at ${tilde(receipt.trust.path)}, but company ${company}'s trust file is ${tilde(path)}; set SKILLITON_TRUST_DIR as it was when joining. Nothing was changed.`);
    const st = lstatOrNull(path);
    if (!st) trust = { action: "gone", path };
    else if (st.isFile() && sha256(readFileSync(path)) === receipt.trust.sha256) trust = { action: "remove", path };
    else trust = { action: "changed", path };
  }
  let launcher = { action: "none" };
  if (receipt.launcher) {
    const { path, createdFolder } = receipt.launcher;
    if (!lstatOrNull(path)) launcher = { action: "gone", path, createdFolder };
    else if (isOurLauncher(path, company, receipt.source)) launcher = { action: "remove", path, createdFolder };
    else launcher = { action: "changed", path, createdFolder };
  }
  let launcherCmd = { action: "none" };
  if (receipt.launcherCmd) {
    const { path, createdFolder } = receipt.launcherCmd;
    if (!lstatOrNull(path)) launcherCmd = { action: "gone", path, createdFolder };
    else if (holdsExactly(path, launcherCmdText(company, receipt.source))) launcherCmd = { action: "remove", path, createdFolder };
    else launcherCmd = { action: "changed", path, createdFolder };
  }
  return { company, receipt, clients, trust, launcher, launcherCmd, path: receiptPath(company) };
}

// Returns { failed, kept }, where kept lists what was deliberately left and why.
export function applyUndo(plan, { say, backup }) {
  const kept = [];
  const name = plan.receipt.marketplace.name;
  for (const c of plan.clients) {
    for (const plugin of c.uninstall) {
      const args = c.driver.uninstall(`${plugin}@${name}`);
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: clientFailure(c.binary, c.driver, args, r), kept };
      say(`${c.driver.label}: uninstalled ${plugin}@${name}`);
    }
    if (c.removeMarketplace) {
      const args = c.driver.removeMarketplace(name);
      const r = runClient(c.binary, args);
      if (!r.ok) return { failed: clientFailure(c.binary, c.driver, args, r), kept };
      say(`${c.driver.label}: removed marketplace ${name}`);
    }
    if (c.keepReason) kept.push(`${c.driver.label} marketplace ${name}, because ${c.keepReason}`);
  }
  if (plan.trust.action === "remove") {
    say(`backed up ${tilde(plan.trust.path)} to ${tilde(backup(plan.trust.path))}`);
    unlinkSync(plan.trust.path);
    say(`removed the trusted release signers ${tilde(plan.trust.path)}`);
  } else if (plan.trust.action === "changed") kept.push(`${tilde(plan.trust.path)}, because it changed after join (remove it with trust remove)`);
  if (plan.launcherCmd.action === "remove") {
    unlinkSync(plan.launcherCmd.path);
    say(`removed the Windows terminal command ${tilde(plan.launcherCmd.path)}`);
  } else if (plan.launcherCmd.action === "changed") kept.push(`${tilde(plan.launcherCmd.path)}, because it changed after join (remove it by hand)`);
  if (plan.launcher.action === "remove") {
    unlinkSync(plan.launcher.path);
    say(`removed the terminal command ${tilde(plan.launcher.path)}`);
    if (plan.launcher.createdFolder) removeEmptyFolder(dirname(plan.launcher.path), say);
  } else if (plan.launcher.action === "changed") kept.push(`${tilde(plan.launcher.path)}, because it changed after join (remove it by hand)`);
  say(`backed up ${tilde(plan.path)} to ${tilde(backup(plan.path))}`);
  unlinkSync(plan.path);
  say(`removed ${tilde(plan.path)}`);
  return { failed: null, kept };
}

function removeEmptyFolder(folder, say) {
  try {
    rmdirSync(folder);
    say(`removed the folder ${tilde(folder)}, which join created and is now empty`);
  } catch (e) {
    if (e.code !== "ENOTEMPTY" && e.code !== "EEXIST" && e.code !== "ENOENT") throw e;
  }
}
