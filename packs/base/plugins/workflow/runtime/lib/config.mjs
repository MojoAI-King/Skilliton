// config.mjs: the project configuration contract, .skilliton/config.json, and the adopted record map.
// docs/CONTRACTS.md ("Project config") is the prose version of this file; change both together, with tests.
//
// Every reader goes through resolveProject(), so prepare, doctor, status, the hooks and the skills agree on where a
// project keeps its records. Nothing here writes. Nothing here imports from outside the plugin folder.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { LEGACY_CONFIG_REL, LEGACY_NAME, LEGACY_PROJECT_DIR } from "./legacy-names.mjs";

export const PROJECT_DIR = ".skilliton";
export const CONFIG_REL = `${PROJECT_DIR}/config.json`;

// The prepared-project layout this runtime writes. 1 was the standalone prototype (copied runtime, skillgate:project
// markers); 2 is the integrated layout (package-owned runtime, one harness block per instruction file); 3 is layout 2
// under the Skilliton names (.skilliton/, skilliton markers). Layouts 1 and 2 keep their configuration in the earlier
// project folder (legacy-names.mjs), and only migrate, status, doctor and the hooks open such a project.
export const LAYOUT_VERSION = 3;
export const SUPPORTED_LAYOUTS = [1, 2, 3];
export const LEGACY_LAYOUTS = [1, 2];

export const KNOWN_SECTIONS = ["prepare", "handoff", "maintain", "dispatch", "guardrails", "checkpoints", "security"];

// Record roles and the conventional places a project may already keep them, in the order they are adopted.
export const ROLE_CANDIDATES = {
  status: ["docs/STATUS.md", "STATUS.md"],
  backlog: ["docs/BACKLOG.md", "BACKLOG.md", "TODO.md"],
  backlogArchive: ["docs/BACKLOG_ARCHIVE.md", "BACKLOG_ARCHIVE.md"],
  roadmap: ["docs/ROADMAP.md", "ROADMAP.md"],
  decisions: ["DECISIONS.md", "docs/DECISIONS.md"],
  lessons: ["docs/LESSONS.md", "LESSONS.md"],
  handoff: ["docs/HANDOFF.md", "HANDOFF.md"],
  handoffArchive: ["docs/HANDOFF_ARCHIVE.md", "HANDOFF_ARCHIVE.md"],
  maintain: ["docs/MAINTAIN.md", "MAINTAIN.md"],
};
export const ROLES = Object.keys(ROLE_CANDIDATES);

// One file per entry lives in these folders, so parallel contributors never edit the same file to add one.
export const DIRECTORY_DEFAULTS = { tasks: "docs/tasks", decisions: "docs/decisions", lessons: "docs/lessons" };

// Files a record role may never point at: instruction files and the READMEs prepare writes into entry folders.
export const RESERVED_PATHS = ["AGENTS.md", "CLAUDE.md", "README.md", "docs/tasks/README.md", "docs/decisions/README.md", "docs/lessons/README.md", "docs/security/README.md"];

export const DEFAULTS = {
  handoffMaxBytes: 6000,
  handoffKeepEarlier: 5,
  integrationBranches: ["main", "master"],
  checkpoints: { stopReminder: true, minMinutes: 20, holdFirstStop: true },
  security: { maxAgeDays: null },
  recordHeader: "Kind: {kind}",
};

// The header line every record writer opens with, in place of the earlier fixed "Kind: {kind}". header must contain
// the literal token "{kind}"; every occurrence is replaced with the record's own kind text (for example
// "Living. Task record."). Callers pass project.recordHeader (or DEFAULTS.recordHeader with no project in hand).
export function formatRecordHeader(header, kind) {
  return header.replaceAll("{kind}", kind);
}

// The fixed text before "{kind}" in a header template, for a reader that only needs to recognize the header line (not
// the kind sentence it carries): a line "looks like" the header when it starts with this. "Kind:" is a safe fallback
// for a caller with no header in hand, matching the header this runtime wrote before it was configurable.
export function recordHeaderPrefix(header = DEFAULTS.recordHeader) {
  const at = header.indexOf("{kind}");
  return at < 0 ? header : header.slice(0, at);
}

// The dispatch section (docs/CONTRACTS.md sections 2 and 15). laneRoot null means "beside the repository, named after
// its folder"; dispatch resolves it, because only it knows the folder name. laneSetup is never run by Skilliton: it is
// printed and written into each lane's brief for a person to run.
export const DISPATCH_DEFAULTS = {
  laneRoot: null,
  hotspots: [],
  mainOnlyPaths: ["docs/", "DECISIONS.md"],
  laneSetup: [],
  laneTestCommand: null,
  mainOnlyChecks: [],
  maxItemsPerLane: 8,
  minItemsForLanes: 6,
  contextCeiling: null, // the context bound dispatch close measures each lane against; null is 200000
};

// kind: "invalid" (the configuration or a path in it is wrong; exit 2) or "failed" (it could not be read; exit 3).
// legacy: true when the project still uses the earlier names and only migrate can open it; callers add the command.
export class ConfigError extends Error {
  constructor(message, kind = "invalid", { legacy = false } = {}) { super(message); this.kind = kind; this.legacy = legacy; }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const BRANCH_RE = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._/-]{1,100}$/;

// A simple repository-relative path: letters, digits, dot, underscore, hyphen and slash; no empty, "." or ".."
// segments; never inside .git. Syntax only; checkRecordPath() also inspects the file system.
export function validRelPath(path) {
  return typeof path === "string" && path.length > 0 && path.length <= 240 && /^[A-Za-z0-9._/-]+$/.test(path) && !isAbsolute(path)
    && path.split("/").every((part) => part && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

// Throws ConfigError unless rel is a safe path inside root whose existing parts are real folders (and, for the last
// part, a regular file with one link). Symbolic links and hard links are refused: a write through one would land
// outside the file the project named.
export function checkRecordPath(root, rel, what = "a record path") {
  if (!validRelPath(rel)) throw new ConfigError(`${what} "${rel}" is not a simple repository-relative path (letters, digits, . _ - and /; no .. or .git)`);
  const target = resolve(root, rel);
  const back = relative(root, target);
  if (back.startsWith("..") || isAbsolute(back)) throw new ConfigError(`${what} "${rel}" leaves the project folder`);
  let cursor = root;
  const parts = rel.split("/");
  for (let i = 0; i < parts.length; i++) {
    cursor = join(cursor, parts[i]);
    let st;
    try { st = lstatSync(cursor); } catch (e) {
      if (e.code === "ENOENT") return target;
      throw new ConfigError(`${what} "${rel}" could not be inspected (${e.code ?? "error"})`, "failed");
    }
    if (st.isSymbolicLink()) throw new ConfigError(`${what} "${rel}" goes through a symbolic link, which Skilliton does not follow`);
    const last = i === parts.length - 1;
    if (!last && !st.isDirectory()) throw new ConfigError(`${what} "${rel}" has a part that is not a folder`);
    if (last && st.isFile() && st.nlink !== 1) throw new ConfigError(`${what} "${rel}" is a hard-linked file, which Skilliton does not write through`);
  }
  return target;
}

// Whether a configuration file exists at root/rel, without following links. A path that cannot be inspected throws.
function configPresent(root, rel) {
  try { lstatSync(join(root, rel)); return true; } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return false;
    throw new ConfigError(`${rel} could not be inspected (${e.code ?? "error"})`, "failed");
  }
}

// { exists, text, config, rel, legacy }. rel is the configuration file this project uses: .skilliton/config.json, or
// the earlier project folder's config.json when only that exists (legacy: true). A missing file is an empty configuration; a
// file that does not parse, or does not hold a JSON object, throws ConfigError, because every default below would
// otherwise hide the mistake. Both files at once throws, because either one could be the project's real settings.
export function readProjectConfig(root) {
  const current = configPresent(root, CONFIG_REL);
  const legacy = configPresent(root, LEGACY_CONFIG_REL);
  if (current && legacy) throw new ConfigError(`both ${CONFIG_REL} and ${LEGACY_CONFIG_REL} exist, so it is not clear which holds this project's settings. Nothing was read. Keep the one you want (a migrated project keeps ${CONFIG_REL}), move the other folder out of the project, then run again`);
  const rel = legacy ? LEGACY_CONFIG_REL : CONFIG_REL;
  if (!current && !legacy) return { exists: false, text: null, config: {}, rel, legacy: false };
  const path = join(root, rel);
  const st = lstatSync(path);
  if (st.isSymbolicLink() || !st.isFile()) throw new ConfigError(`${rel} is not a regular file`);
  if (st.size > 256 * 1024) throw new ConfigError(`${rel} is larger than 256 KB, which is not a configuration file`);
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) { throw new ConfigError(`${rel} could not be read (${e.code ?? "error"})`, "failed"); }
  let config;
  // The parser's own message can quote the file, which may hold a value that should not be printed; only its position is kept.
  try { config = JSON.parse(text); } catch (e) {
    const where = /line \d+ column \d+|position \d+/.exec(e.message);
    throw new ConfigError(`${rel} is not valid JSON${where ? ` (near ${where[0]})` : ""}`);
  }
  if (!isObject(config)) throw new ConfigError(`${rel} must hold a JSON object`);
  return { exists: true, text, config, rel, legacy };
}

// Problems with the shape of known sections, as plain sentences. An unknown section is reported separately by
// doctor as a warning, because a misspelled section is ignored silently by every component.
export function configProblems(config) {
  const problems = [];
  for (const key of KNOWN_SECTIONS) if (config[key] !== undefined && !isObject(config[key])) problems.push(`section "${key}" must be an object`);
  const prepare = isObject(config.prepare) ? config.prepare : {};
  if (prepare.version !== undefined && !SUPPORTED_LAYOUTS.includes(prepare.version)) problems.push(`prepare.version ${JSON.stringify(prepare.version)} is not a layout this runtime knows (${SUPPORTED_LAYOUTS.join(", ")}); a newer Skilliton prepared this project, or the value was edited`);
  if (prepare.artifacts !== undefined && !isObject(prepare.artifacts)) problems.push("prepare.artifacts must be an object mapping record roles to files");
  if (isObject(prepare.artifacts)) {
    for (const [role, path] of Object.entries(prepare.artifacts)) {
      if (!ROLES.includes(role)) problems.push(`prepare.artifacts has the unknown role "${role}" (known: ${ROLES.join(", ")})`);
      else if (!validRelPath(path) || !path.endsWith(".md")) problems.push(`prepare.artifacts.${role} must be a repository-relative .md path`);
    }
  }
  if (prepare.directories !== undefined && !isObject(prepare.directories)) problems.push("prepare.directories must be an object");
  if (isObject(prepare.directories)) {
    for (const [role, path] of Object.entries(prepare.directories)) {
      if (!Object.hasOwn(DIRECTORY_DEFAULTS, role)) problems.push(`prepare.directories has the unknown role "${role}" (known: ${Object.keys(DIRECTORY_DEFAULTS).join(", ")})`);
      else if (!validRelPath(path)) problems.push(`prepare.directories.${role} must be a repository-relative folder path`);
    }
  }
  if (prepare.integrationBranches !== undefined && (!Array.isArray(prepare.integrationBranches) || !prepare.integrationBranches.length || !prepare.integrationBranches.every((b) => typeof b === "string" && BRANCH_RE.test(b)))) problems.push("prepare.integrationBranches must be a non-empty list of branch names");
  if (prepare.requires !== undefined && (!isObject(prepare.requires) || !Object.entries(prepare.requires).every(([k, v]) => /^[a-z0-9][a-z0-9-]*$/.test(k) && typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v)))) problems.push("prepare.requires must map plugin names to MAJOR.MINOR.PATCH versions");
  if (prepare.recordHeader !== undefined && !(typeof prepare.recordHeader === "string" && prepare.recordHeader.length > 0 && prepare.recordHeader.length <= 200 && !/[\x00-\x1f\x7f]/.test(prepare.recordHeader) && prepare.recordHeader.includes("{kind}") && !/^\s*(#|[-*+] )/.test(prepare.recordHeader))) problems.push("prepare.recordHeader must be one line with no control characters, at most 200 characters, containing {kind}, and not starting like a heading (#) or a list item (- ), which the record readers take for the start of a section or a field");
  const handoff = isObject(config.handoff) ? config.handoff : {};
  if (handoff.file !== undefined && (!validRelPath(handoff.file) || !handoff.file.endsWith(".md"))) problems.push("handoff.file must be a repository-relative .md path");
  if (handoff.maxBytes !== undefined && !(Number.isInteger(handoff.maxBytes) && handoff.maxBytes >= 200 && handoff.maxBytes <= 100000)) problems.push("handoff.maxBytes must be a whole number from 200 to 100000");
  if (handoff.keepEarlier !== undefined && !(Number.isInteger(handoff.keepEarlier) && handoff.keepEarlier >= 0 && handoff.keepEarlier <= 20)) problems.push("handoff.keepEarlier must be a whole number from 0 to 20");
  const checkpoints = isObject(config.checkpoints) ? config.checkpoints : {};
  if (checkpoints.stopReminder !== undefined && typeof checkpoints.stopReminder !== "boolean") problems.push("checkpoints.stopReminder must be true or false");
  if (checkpoints.minMinutes !== undefined && !(Number.isInteger(checkpoints.minMinutes) && checkpoints.minMinutes >= 0 && checkpoints.minMinutes <= 1440)) problems.push("checkpoints.minMinutes must be a whole number from 0 to 1440");
  if (checkpoints.holdFirstStop !== undefined && typeof checkpoints.holdFirstStop !== "boolean") {
    problems.push("checkpoints.holdFirstStop must be true or false");
  }
  const security = isObject(config.security) ? config.security : {};
  if (security.maxAgeDays !== undefined && security.maxAgeDays !== null && !(Number.isInteger(security.maxAgeDays) && security.maxAgeDays >= 1 && security.maxAgeDays <= 3650)) problems.push("security.maxAgeDays must be null or a whole number from 1 to 3650");
  // The same rule the findings writer applies (lib/security.mjs findingsFileRel), said at read time so a bad value is
  // named by validate and doctor before a maintenance run trips on it. The value itself is never echoed.
  const findings = security.findingsFile;
  const findingsOk = typeof findings === "string" && findings.endsWith(".md") && !findings.startsWith("/") && !findings.split(/[\\/]/).includes("..");
  if (findings !== undefined && !findingsOk) problems.push("security.findingsFile must be a repository-relative .md path");
  const dispatch = isObject(config.dispatch) ? config.dispatch : {};
  for (const key of Object.keys(dispatch)) if (!Object.hasOwn(DISPATCH_DEFAULTS, key)) problems.push(`dispatch has the unknown key "${key}" (known: ${Object.keys(DISPATCH_DEFAULTS).join(", ")})`);
  for (const key of ["laneRoot", "laneTestCommand"]) {
    const v = dispatch[key];
    if (v !== undefined && v !== null && !(typeof v === "string" && v.trim() !== "" && v.length <= 300)) problems.push(`dispatch.${key} must be null or a non-empty string of at most 300 characters`);
  }
  for (const key of ["hotspots", "mainOnlyPaths", "laneSetup", "mainOnlyChecks"]) {
    const v = dispatch[key];
    if (v !== undefined && (!Array.isArray(v) || !v.every((entry) => typeof entry === "string" && entry.trim() !== "" && entry.length <= 300))) problems.push(`dispatch.${key} must be a list of non-empty strings of at most 300 characters each`);
  }
  for (const key of ["maxItemsPerLane", "minItemsForLanes"]) {
    const v = dispatch[key];
    if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= 100)) problems.push(`dispatch.${key} must be a whole number from 1 to 100`);
  }
  const ceiling = dispatch.contextCeiling;
  if (ceiling !== undefined && ceiling !== null && !(Number.isInteger(ceiling) && ceiling >= 10000 && ceiling <= 2000000)) {
    problems.push("dispatch.contextCeiling must be null or a whole number of tokens from 10000 to 2000000");
  }
  return problems;
}

// The project as every component sees it. Throws ConfigError when the configuration is unusable: invalid shapes, a
// record path that is unsafe, two roles on one file, or handoff.file disagreeing with prepare.artifacts.handoff.
//
// A project still under the earlier names (only the earlier config.json) is refused unless allowLegacy is set, because
// every file this runtime reads or writes lives under .skilliton/, so any other command would report the project's
// evidence as missing or start a second folder beside the first. migrate, status, doctor and the hooks pass
// allowLegacy to report the pending migration; the returned project then has legacyNames: true.
export function resolveProject(rootInput, { allowLegacy = false } = {}) {
  const root = resolve(rootInput);
  const { exists, text, config, rel, legacy } = readProjectConfig(root);
  const problems = configProblems(config);
  if (problems.length) throw new ConfigError(`${rel}: ${problems.join("; ")}`);
  const prepare = isObject(config.prepare) ? config.prepare : {};
  if (legacy && !LEGACY_LAYOUTS.includes(prepare.version ?? 2)) throw new ConfigError(`${rel} says layout ${prepare.version}, which is only ever written to ${CONFIG_REL}. Move the file to ${CONFIG_REL} by hand, or restore it from Git history, then run again`);
  if (!legacy && exists && prepare.version !== undefined && LEGACY_LAYOUTS.includes(prepare.version)) throw new ConfigError(`${rel} says layout ${prepare.version}, which keeps its configuration in ${LEGACY_CONFIG_REL}; restore the file from Git history, then run migrate`);
  if (legacy && !allowLegacy) throw new ConfigError(`this project still uses the earlier ${LEGACY_NAME} names (${LEGACY_PROJECT_DIR}/, layout ${prepare.version ?? "unknown"}), and this runtime works only with ${PROJECT_DIR}/. Nothing was read or written.`, "invalid", { legacy: true });
  const overrides = isObject(prepare.artifacts) ? prepare.artifacts : {};
  const handoffSection = isObject(config.handoff) ? config.handoff : {};
  const reserved = new Set(RESERVED_PATHS.map((p) => p.toLowerCase()));

  const artifacts = {}, source = {};
  for (const role of ROLES) {
    const companion = role === "backlogArchive" ? artifacts.backlog : role === "handoffArchive" ? artifacts.handoff : null;
    const candidates = companion ? [...new Set([companion.replace(/\.md$/, "_ARCHIVE.md"), ...ROLE_CANDIDATES[role]])] : ROLE_CANDIDATES[role];
    const configured = overrides[role] ?? (role === "handoff" ? handoffSection.file : undefined);
    if (configured !== undefined) {
      checkRecordPath(root, configured, `the ${role} record`);
      const lowered = configured.toLowerCase();
      if (lowered.startsWith(`${PROJECT_DIR}/`) || lowered.startsWith(`${LEGACY_PROJECT_DIR}/`) || reserved.has(lowered)) throw new ConfigError(`the ${role} record cannot be ${configured}: that path belongs to Skilliton or to the instruction files`);
      artifacts[role] = configured;
      source[role] = "config";
    } else {
      for (const candidate of candidates) checkRecordPath(root, candidate, `the ${role} record candidate`);
      const found = candidates.find((candidate) => existsSync(join(root, candidate)));
      artifacts[role] = found ?? candidates[0];
      source[role] = found ? "found" : "default";
    }
  }
  const lower = Object.values(artifacts).map((p) => p.toLowerCase());
  if (new Set(lower).size !== lower.length) throw new ConfigError("two record roles point at the same file; give each role its own file in prepare.artifacts");
  if (handoffSection.file !== undefined && overrides.handoff !== undefined && handoffSection.file !== overrides.handoff) {
    throw new ConfigError(`handoff.file (${handoffSection.file}) and prepare.artifacts.handoff (${overrides.handoff}) disagree; make them the same file`);
  }

  const dirOverrides = isObject(prepare.directories) ? prepare.directories : {};
  const directories = {};
  for (const [role, fallback] of Object.entries(DIRECTORY_DEFAULTS)) {
    const dir = dirOverrides[role] ?? fallback;
    checkRecordPath(root, dir, `the ${role} folder`);
    directories[role] = dir;
  }

  return {
    root,
    configExists: exists,
    configText: text,
    configRel: rel,
    legacyNames: legacy,
    config,
    layoutVersion: prepare.version ?? null,
    requires: isObject(prepare.requires) ? { ...prepare.requires } : {},
    artifacts,
    artifactSource: source,
    directories,
    integrationBranches: prepare.integrationBranches ?? DEFAULTS.integrationBranches,
    recordHeader: prepare.recordHeader ?? DEFAULTS.recordHeader,
    handoff: { file: artifacts.handoff, maxBytes: handoffSection.maxBytes ?? DEFAULTS.handoffMaxBytes, keepEarlier: handoffSection.keepEarlier ?? DEFAULTS.handoffKeepEarlier },
    checkpoints: { ...DEFAULTS.checkpoints, ...(isObject(config.checkpoints) ? config.checkpoints : {}) },
    security: { ...DEFAULTS.security, ...(isObject(config.security) ? config.security : {}) },
    dispatch: { ...DISPATCH_DEFAULTS, ...(isObject(config.dispatch) ? config.dispatch : {}) },
  };
}

// Values the harness template may name as {{key}}. Keys are stable contract names; renaming one is a template change
// that needs a project migration.
export function templateVars(project) {
  const a = project.artifacts, d = project.directories;
  return {
    status: a.status, backlog: a.backlog, backlogArchive: a.backlogArchive, roadmap: a.roadmap, decisions: a.decisions,
    lessons: a.lessons, handoff: a.handoff, handoffArchive: a.handoffArchive, maintain: a.maintain,
    tasksDir: d.tasks, decisionsDir: d.decisions, lessonsDir: d.lessons,
    integrationBranches: project.integrationBranches.join(", "),
  };
}
