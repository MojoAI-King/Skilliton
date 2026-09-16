// config.mjs: the project configuration contract, .skillgate/config.json, and the adopted record map.
// docs/CONTRACTS.md ("Project config") is the prose version of this file; change both together, with tests.
//
// Every reader goes through resolveProject(), so prepare, doctor, status, the hooks and the skills agree on where a
// project keeps its records. Nothing here writes. Nothing here imports from outside the plugin folder.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const CONFIG_REL = ".skillgate/config.json";

// The prepared-project layout this runtime writes. 1 was the standalone prototype (copied runtime, skillgate:project
// markers); 2 is the integrated layout (package-owned runtime, one harness block per instruction file).
export const LAYOUT_VERSION = 2;
export const SUPPORTED_LAYOUTS = [1, 2];

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
  integrationBranches: ["main", "master"],
  checkpoints: { stopReminder: true, minMinutes: 20 },
  security: { maxAgeDays: null },
};

// kind: "invalid" (the configuration or a path in it is wrong; exit 2) or "failed" (it could not be read; exit 3).
export class ConfigError extends Error {
  constructor(message, kind = "invalid") { super(message); this.kind = kind; }
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
    if (st.isSymbolicLink()) throw new ConfigError(`${what} "${rel}" goes through a symbolic link, which Skillgate does not follow`);
    const last = i === parts.length - 1;
    if (!last && !st.isDirectory()) throw new ConfigError(`${what} "${rel}" has a part that is not a folder`);
    if (last && st.isFile() && st.nlink !== 1) throw new ConfigError(`${what} "${rel}" is a hard-linked file, which Skillgate does not write through`);
  }
  return target;
}

// { exists, text, config }. A missing file is an empty configuration; a file that does not parse, or does not hold a
// JSON object, throws ConfigError, because every default below would otherwise hide the mistake.
export function readProjectConfig(root) {
  const path = join(root, CONFIG_REL);
  let st;
  try { st = lstatSync(path); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return { exists: false, text: null, config: {} };
    throw new ConfigError(`${CONFIG_REL} could not be inspected (${e.code ?? "error"})`, "failed");
  }
  if (st.isSymbolicLink() || !st.isFile()) throw new ConfigError(`${CONFIG_REL} is not a regular file`);
  if (st.size > 256 * 1024) throw new ConfigError(`${CONFIG_REL} is larger than 256 KB, which is not a configuration file`);
  let text;
  try { text = readFileSync(path, "utf8"); } catch (e) { throw new ConfigError(`${CONFIG_REL} could not be read (${e.code ?? "error"})`, "failed"); }
  let config;
  try { config = JSON.parse(text); } catch (e) { throw new ConfigError(`${CONFIG_REL} is not valid JSON (${e.message})`); }
  if (!isObject(config)) throw new ConfigError(`${CONFIG_REL} must hold a JSON object`);
  return { exists: true, text, config };
}

// Problems with the shape of known sections, as plain sentences. An unknown section is reported separately by
// doctor as a warning, because a misspelled section is ignored silently by every component.
export function configProblems(config) {
  const problems = [];
  for (const key of KNOWN_SECTIONS) if (config[key] !== undefined && !isObject(config[key])) problems.push(`section "${key}" must be an object`);
  const prepare = isObject(config.prepare) ? config.prepare : {};
  if (prepare.version !== undefined && !SUPPORTED_LAYOUTS.includes(prepare.version)) problems.push(`prepare.version ${JSON.stringify(prepare.version)} is not a layout this runtime knows (${SUPPORTED_LAYOUTS.join(", ")}); a newer Skillgate prepared this project, or the value was edited`);
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
  const handoff = isObject(config.handoff) ? config.handoff : {};
  if (handoff.file !== undefined && (!validRelPath(handoff.file) || !handoff.file.endsWith(".md"))) problems.push("handoff.file must be a repository-relative .md path");
  if (handoff.maxBytes !== undefined && !(Number.isInteger(handoff.maxBytes) && handoff.maxBytes >= 200 && handoff.maxBytes <= 100000)) problems.push("handoff.maxBytes must be a whole number from 200 to 100000");
  const checkpoints = isObject(config.checkpoints) ? config.checkpoints : {};
  if (checkpoints.stopReminder !== undefined && typeof checkpoints.stopReminder !== "boolean") problems.push("checkpoints.stopReminder must be true or false");
  if (checkpoints.minMinutes !== undefined && !(Number.isInteger(checkpoints.minMinutes) && checkpoints.minMinutes >= 0 && checkpoints.minMinutes <= 1440)) problems.push("checkpoints.minMinutes must be a whole number from 0 to 1440");
  const security = isObject(config.security) ? config.security : {};
  if (security.maxAgeDays !== undefined && security.maxAgeDays !== null && !(Number.isInteger(security.maxAgeDays) && security.maxAgeDays >= 1 && security.maxAgeDays <= 3650)) problems.push("security.maxAgeDays must be null or a whole number from 1 to 3650");
  return problems;
}

// The project as every component sees it. Throws ConfigError when the configuration is unusable: invalid shapes, a
// record path that is unsafe, two roles on one file, or handoff.file disagreeing with prepare.artifacts.handoff.
export function resolveProject(rootInput) {
  const root = resolve(rootInput);
  const { exists, text, config } = readProjectConfig(root);
  const problems = configProblems(config);
  if (problems.length) throw new ConfigError(`${CONFIG_REL}: ${problems.join("; ")}`);
  const prepare = isObject(config.prepare) ? config.prepare : {};
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
      if (configured.toLowerCase().startsWith(".skillgate/") || reserved.has(configured.toLowerCase())) throw new ConfigError(`the ${role} record cannot be ${configured}: that path belongs to Skillgate or to the instruction files`);
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
    config,
    layoutVersion: prepare.version ?? null,
    requires: isObject(prepare.requires) ? { ...prepare.requires } : {},
    artifacts,
    artifactSource: source,
    directories,
    integrationBranches: prepare.integrationBranches ?? DEFAULTS.integrationBranches,
    handoff: { file: artifacts.handoff, maxBytes: handoffSection.maxBytes ?? DEFAULTS.handoffMaxBytes },
    checkpoints: { ...DEFAULTS.checkpoints, ...(isObject(config.checkpoints) ? config.checkpoints : {}) },
    security: { ...DEFAULTS.security, ...(isObject(config.security) ? config.security : {}) },
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
