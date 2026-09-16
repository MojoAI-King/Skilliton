// prepare.mjs: the preparation engine (docs/CONTRACTS.md section 10).
//
// Two jobs, shared by the prepare, migrate, remove, record and index commands:
//   planPrepare()   what a layout-2 project needs: adopt every existing record untouched, create the missing ones as
//                   "not yet assessed", entry-folder READMEs, the security catalog and READMEs, the .gitignore lines,
//                   the harness blocks (only through core.mjs planHarnessFile), and the merged .skillgate/config.json.
//   applyChanges()  writes a planned change set transactionally: one lock (.skillgate/prepare.lock), every
//                   destination rechecked immediately before it is replaced or deleted, backups of every changed file
//                   in <git-dir>/skillgate-backups/<backup id>/ (never inside the work tree, so never addable), and on
//                   a failure a rollback that restores only files still holding what this run wrote, so an edit made
//                   by someone else meanwhile is kept.
//
// Adapted from the standalone prototype (commit 23aae41, scripts/prepare.mjs). Its independent review corrections
// are kept (evidence/autopilot-foundation/verification.md): the recheck before each replacement, Git-private backups,
// validation of an existing catalog by the security engine when this build has one, reserved and case-folded record
// paths (config.mjs), the recheck before each rollback restore, and fixed messages that never echo file contents.
//
// No argument parsing and no process exit here. Refusals throw Refused (exit 2) before anything is written; a failed
// write throws TransactionFailed after rolling back what it safely can; other failures throw OperationFailed (exit 3).
// Nothing here imports from outside the plugin folder.

import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import {
  PLUGIN_ROOT, HARNESS_FILES, Refused, refuse, isPlainObject, clone, sameJson, tilde, argPath, which, runProgram,
  cmpVersion, planHarnessFile, readHarnessTemplate, HARNESS_TEMPLATE, readPluginVersion, selfCommand,
} from "./core.mjs";
import { CONFIG_REL, ConfigError, LAYOUT_VERSION, ROLES, resolveProject, templateVars, validRelPath } from "./config.mjs";
import {
  CATALOG_REL, GITIGNORE_LINES, LOCK_REL, RECORDS_README_REL, ROLE_LABELS, SECURITY_README_REL,
  entryFolderReadme, gitignoreWithSkillgate, recordTemplate, recordsReadme, securityReadme,
} from "./project-files.mjs";
import { PROTOTYPE_RUNTIME_PATH } from "./prototype-v1.mjs";

export const MAX_BYTES = 1024 * 1024;
const PROTOTYPE_TEXT = "skillgate:project:";

// ---------- errors ----------

// A failure that is not a refusal and not a failed transaction: git missing, a damaged package, an unreadable file.
export class OperationFailed extends Error {}

// prepare on a layout-1 project: a refusal, except for --check, which reports it as attention.
export class NeedsMigration extends Refused {}

// A destination held something other than what the plan expected.
export class DestinationChanged extends Error {
  constructor(path, when) { super(`${path} changed ${when}`); this.path = path; this.when = when; }
}

// A transaction stopped part way. Fields: cause (plain text), destinationChanged (bool), changedPath, written
// (paths this run wrote before stopping), restored (paths put back), kept ([{ path, reason }] not put back),
// rollbackComplete (bool), backupDir (absolute path or null).
export class TransactionFailed extends Error {
  constructor(message, details) { super(message); Object.assign(this, details); }
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => (a === null || b === null ? a === b : a.equals(b));
const errorCode = (e) => e?.code ?? (e instanceof Error ? e.message : String(e));

// ---------- the project and its repository ----------

// The Git repository whose root is dirInput. Refused unless it is the root; backups need its Git folder.
export function resolveGitRoot(dirInput) {
  let root;
  try { root = realpathSync(resolve(dirInput)); } catch { refuse(`the folder ${argPath(resolve(dirInput))} does not exist or cannot be opened`); }
  if (!lstatSync(root).isDirectory()) refuse(`${argPath(root)} is not a folder`);
  if (!which("git")) throw new OperationFailed("git is not on PATH. Skillgate needs it to confirm the repository root and to keep backups in the Git folder; install git, then run again. Nothing was written");
  const r = runProgram("git", ["-C", root, "rev-parse", "--show-toplevel", "--absolute-git-dir"], 15000);
  if (!r.ok) refuse(`${argPath(root)} is not a Git repository (git rev-parse ${r.failure}${r.stderr.trim() ? `: ${r.stderr.trim().split("\n")[0]}` : ""}). Skillgate works on a Git repository root, because its backups live in the Git folder`);
  const [top, gitDir] = r.stdout.split("\n");
  let topReal;
  try { topReal = realpathSync(top); } catch { refuse(`git reported the repository root ${argPath(top)}, which cannot be opened`); }
  if (topReal !== root) refuse(`${argPath(root)} is inside the Git repository ${argPath(topReal)} but is not its root. Run again with --dir ${argPath(topReal)}`);
  let gitReal = null;
  try { gitReal = realpathSync(gitDir); } catch { /* reported below */ }
  if (gitReal !== gitDir || !lstatSync(gitDir).isDirectory()) refuse(`the Git folder ${argPath(gitDir)} is not a plain folder (it goes through a symbolic link or cannot be opened), and Skillgate keeps its private backups there`);
  return { root, gitDir };
}

export function currentBranch(root) {
  const r = runProgram("git", ["-C", root, "symbolic-ref", "--short", "-q", "HEAD"], 15000);
  const name = r.ok ? r.stdout.trim() : "";
  return name || null;
}

// resolveProject with its errors turned into this runtime's exit meanings. A JSON parser message is not repeated,
// because some Node versions quote the start of the file in it.
export function loadProject(root) {
  try { return resolveProject(root); } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    if (e.kind === "failed") throw new OperationFailed(`${e.message}; nothing was written`);
    if (e.message.startsWith(`${CONFIG_REL} is not valid JSON`)) {
      const where = /line \d+ column \d+|position \d+/.exec(e.message);
      refuse(`${CONFIG_REL} is not valid JSON${where ? ` (near ${where[0]})` : ""}; nothing was written. The parser's own message is not shown because it can quote the file. Fix the file, then run again`);
    }
    refuse(`${e.message}; nothing was written`);
  }
}

// ---------- paths ----------

// Inspect base/rel without following links. Refused unless rel is a simple relative path whose existing parts are
// real folders and whose last part, when present, is a regular file with one link. Returns { abs, exists, stat }.
export function inspectPath(base, rel, what = rel) {
  if (!validRelPath(rel)) refuse(`${what}: "${rel}" is not a simple repository-relative path (letters, digits, . _ - and /; no .. or .git)`);
  const parts = rel.split("/");
  const abs = join(base, ...parts);
  let cursor = base;
  for (let i = 0; i < parts.length; i++) {
    cursor = join(cursor, parts[i]);
    let st;
    try { st = lstatSync(cursor); } catch (e) {
      if (e.code === "ENOENT") return { abs, exists: false, stat: null };
      throw new OperationFailed(`${rel} could not be inspected (${e.code ?? "error"}); nothing was written`);
    }
    const shown = parts.slice(0, i + 1).join("/");
    if (st.isSymbolicLink()) refuse(`${what} goes through a symbolic link (${shown}), which Skillgate does not follow; nothing was written`);
    if (i < parts.length - 1) {
      if (!st.isDirectory()) refuse(`${what}: ${shown} is not a folder; nothing was written`);
      continue;
    }
    if (!st.isFile()) refuse(`${what} exists but is not a regular file; nothing was written`);
    if (st.nlink !== 1) refuse(`${what} is a hard-linked file, which Skillgate does not write through; nothing was written`);
    return { abs, exists: true, stat: st };
  }
  return { abs, exists: false, stat: null };
}

// Like inspectPath, for a folder: { abs, exists }. The folder itself must not be a link.
export function inspectFolder(base, rel, what = rel) {
  if (!validRelPath(rel)) refuse(`${what}: "${rel}" is not a simple repository-relative path`);
  const parts = rel.split("/");
  let cursor = base;
  for (let i = 0; i < parts.length; i++) {
    cursor = join(cursor, parts[i]);
    let st;
    try { st = lstatSync(cursor); } catch (e) {
      if (e.code === "ENOENT") return { abs: join(base, ...parts), exists: false };
      throw new OperationFailed(`${rel} could not be inspected (${e.code ?? "error"})`);
    }
    if (st.isSymbolicLink()) refuse(`${what} goes through a symbolic link (${parts.slice(0, i + 1).join("/")}), which Skillgate does not follow`);
    if (!st.isDirectory()) refuse(`${what}: ${parts.slice(0, i + 1).join("/")} is not a folder`);
  }
  return { abs: cursor, exists: true };
}

// The bytes at base/rel, or null when it does not exist. Same refusals as inspectPath, plus a size limit.
export function readPath(base, rel, what = rel) {
  const info = inspectPath(base, rel, what);
  if (!info.exists) return null;
  if (info.stat.size > MAX_BYTES) refuse(`${what} is larger than 1 MB, which is not a file Skillgate manages; nothing was written`);
  try { return readFileSync(info.abs); } catch (e) { throw new OperationFailed(`${what} could not be read (${e.code ?? "error"}); nothing was written`); }
}

// ---------- transactional writes ----------

export function newBackupId(command) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${stamp}-${command}-${randomBytes(4).toString("hex")}`;
}

// Create each missing folder on rel's path, one level at a time, recording the ones created.
function ensureParents(base, rel, created, mode = undefined) {
  const parts = rel.split("/").slice(0, -1);
  let cursor = base;
  for (const part of parts) {
    cursor = join(cursor, part);
    let st = null;
    try { st = lstatSync(cursor); } catch (e) { if (e.code !== "ENOENT") throw e; }
    if (!st) { mkdirSync(cursor, mode === undefined ? undefined : { mode }); if (created) created.push(cursor); }
    else if (st.isSymbolicLink() || !st.isDirectory()) throw new DestinationChanged(rel, "while it was being written (a folder on its path was replaced)");
  }
}

// Current bytes for a recheck. A path that became a link, a folder or a hard link counts as changed.
function currentBytes(root, rel) {
  try { return readPath(root, rel); } catch (e) {
    if (e instanceof Refused) return Buffer.from(`unusable: ${e.message}`);
    throw e;
  }
}

// mode is null for a new file (the process umask applies) or the permission bits an existing file had, which are kept
// exactly: a temporary file's mode would otherwise be reduced by the umask.
function writeAtomically(abs, bytes, mode, beforeRename) {
  const temp = join(dirname(abs), `.skillgate-${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, bytes, { flag: "wx", mode: mode ?? 0o644 });
    if (mode !== null) chmodSync(temp, mode);
    beforeRename();
    renameSync(temp, abs);
  } finally {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* the caller reports the failure that left it */ }
  }
}

function acquireLock(root, command, created) {
  const info = inspectPath(root, LOCK_REL, "the Skillgate lock file");
  ensureParents(root, LOCK_REL, created);
  let fd;
  try { fd = openSync(info.abs, "wx", 0o600); } catch (e) {
    removeCreatedFolders(created);
    if (e.code === "EEXIST") refuse(`${LOCK_REL} exists, so another prepare, migrate, remove, record or index run may be writing this project. Nothing was written. If no other run is active (for example after a crash), delete ${LOCK_REL} and run again`);
    throw new OperationFailed(`the lock file ${LOCK_REL} could not be created (${e.code ?? "error"}); nothing was written`);
  }
  try { writeFileSync(fd, `skillgate ${command}, process ${process.pid}, started ${new Date().toISOString()}\n`); } catch { /* the lock holds by existing */ }
  return { fd, abs: info.abs };
}

function removeCreatedFolders(created) {
  for (const dir of [...created].reverse()) {
    try { rmdirSync(dir); } catch (e) { if (!["ENOTEMPTY", "EEXIST", "ENOENT"].includes(e.code)) process.stderr.write(`skillgate: note: an empty folder this run created could not be removed (${e.code ?? "error"})\n`); }
  }
  created.length = 0;
}

// After a file under .skillgate/ is deleted, remove folders it leaves empty, up to .skillgate itself.
function pruneEmptySkillgateFolders(root, rel) {
  const parts = rel.split("/").slice(0, -1);
  while (parts.length && parts[0] === ".skillgate") {
    try { rmdirSync(join(root, ...parts)); } catch { return; }
    parts.pop();
  }
}

// Put back every written change that still holds exactly what this run wrote, newest first.
function rollBack(root, written) {
  const restored = [], kept = [];
  for (const change of [...written].reverse()) {
    try {
      if (!same(currentBytes(root, change.path), change.after)) {
        kept.push({ path: change.path, reason: "it changed after this run wrote it, so the newer content was kept" });
        continue;
      }
      const abs = join(root, ...change.path.split("/"));
      if (change.before === null) unlinkSync(abs);
      else {
        ensureParents(root, change.path, null);
        writeAtomically(abs, change.before, change.mode, () => {
          if (!same(currentBytes(root, change.path), change.after)) throw new DestinationChanged(change.path, "during the rollback");
        });
      }
      restored.push(change.path);
    } catch (e) {
      kept.push({ path: change.path, reason: e instanceof DestinationChanged ? "it changed during the rollback, so the newer content was kept" : `it could not be restored (${errorCode(e)})` });
    }
  }
  return { restored, kept };
}

// changes: [{ path, before: Buffer | null, after: Buffer | null }] in write order (null means absent). Every path is
// written at most once. Returns { backupId, backupDir (null when nothing was backed up), written: [paths] }.
export function applyChanges({ root, gitDir, command, changes, backupId = newBackupId(command) }) {
  const seen = new Set();
  for (const c of changes) {
    const key = c.path.toLowerCase();
    if (seen.has(key)) throw new Error(`internal: ${c.path} appears twice in one change set`);
    seen.add(key);
  }
  inspectFolder(gitDir, "skillgate-backups", "the backup folder in the Git folder");
  const created = [];
  const lock = acquireLock(root, command, created);
  const backupRoot = `skillgate-backups/${backupId}`;
  const written = [], deleted = [];
  let backedUp = 0, succeeded = false;
  try {
    for (const planned of changes) {
      let info;
      try { info = inspectPath(root, planned.path); } catch (e) {
        if (e instanceof Refused) throw new DestinationChanged(planned.path, "after the plan was made (it is now a link, a folder or a hard link)");
        throw e;
      }
      const change = { ...planned, mode: info.exists ? info.stat.mode & 0o777 : null };
      const recheck = (when) => {
        if (!same(currentBytes(root, change.path), change.before)) throw new DestinationChanged(change.path, when);
      };
      recheck("after the plan was made");
      if (change.before !== null) {
        const backupRel = `${backupRoot}/${change.path}`;
        const target = inspectPath(gitDir, backupRel, "a backup file");
        if (target.exists) throw new Error(`internal: the backup ${backupRel} already exists`);
        ensureParents(gitDir, backupRel, null, 0o700);
        writeFileSync(target.abs, change.before, { flag: "wx", mode: 0o600 });
        backedUp++;
      }
      if (change.after === null) {
        recheck("while it was being backed up");
        unlinkSync(info.abs);
        deleted.push(change.path);
      } else {
        ensureParents(root, change.path, created);
        writeAtomically(info.abs, change.after, change.mode, () => recheck("while its replacement was being staged"));
      }
      written.push(change);
    }
    succeeded = true;
    return { backupId, backupDir: backedUp ? join(gitDir, ...backupRoot.split("/")) : null, written: written.map((c) => c.path) };
  } catch (error) {
    const { restored, kept } = rollBack(root, written);
    const changed = error instanceof DestinationChanged;
    const cause = changed ? `${error.path} changed ${error.when}, so it was not replaced and the external edit was preserved`
      : error instanceof Refused ? error.message
      : `a write failed (${errorCode(error)})`;
    throw new TransactionFailed(cause, {
      cause, destinationChanged: changed, changedPath: changed ? error.path : null,
      written: written.map((c) => c.path), restored, kept, rollbackComplete: kept.length === 0,
      backupDir: backedUp ? join(gitDir, ...backupRoot.split("/")) : null,
    });
  } finally {
    try { closeSync(lock.fd); } catch { /* already closed */ }
    try { unlinkSync(lock.abs); } catch (e) { if (e.code !== "ENOENT") process.stderr.write(`skillgate: note: the lock file ${LOCK_REL} could not be removed (${e.code ?? "error"}); delete it by hand\n`); }
    removeCreatedFolders(created);
    if (succeeded) for (const rel of deleted) pruneEmptySkillgateFolders(root, rel);
  }
}

// Plain-language lines describing a TransactionFailed, and the exit code it means: 2 when a destination changed and
// everything this run wrote was put back (nothing from the run remains), 3 otherwise.
export function describeFailure(command, e) {
  const lines = [`skillgate ${command} did not complete: ${e.cause}.`];
  if (!e.written.length) lines.push("Nothing had been written yet.");
  else if (e.rollbackComplete) lines.push(`Every file this run wrote was rolled back: ${e.restored.join(", ")}.`);
  if (e.destinationChanged && e.rollbackComplete) lines.push(`Nothing from this run remains. Check the change to ${e.changedPath} (another program or person may still be editing it), then run the command again to see a fresh plan.`);
  else {
    lines.push(`Rollback is incomplete. Rolled back: ${e.restored.length ? e.restored.join(", ") : "nothing"}.`);
    for (const k of e.kept) lines.push(`Not rolled back: ${k.path} (${k.reason}).`);
    lines.push("Inspect those files before running again.");
  }
  if (e.backupDir) lines.push(`Backups of the files this run replaced or deleted: ${tilde(e.backupDir)} (inside the Git folder, never committed).`);
  const exit = e.destinationChanged && e.rollbackComplete ? 2 : 3;
  return { lines, exit, result: exit === 2 ? "invalid" : "operation-failed" };
}

export function resultJson(command, result, summary, details) {
  return JSON.stringify({ schema: "skillgate.result/1", command, result, summary, details });
}

// ---------- catalogs ----------

const CATALOG_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/;
const CONTROL_ID_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

// A reason the catalog bytes are unusable, or null. Basic shape only; the security engine owns the full rules. The
// reason never quotes the file.
export function catalogShapeProblem(bytes) {
  let c;
  try { c = JSON.parse(bytes.toString("utf8")); } catch { return "is not valid JSON"; }
  if (!isPlainObject(c)) return "does not hold a JSON object";
  if (c.schemaVersion !== 1) return "does not have schemaVersion 1";
  if (typeof c.catalogVersion !== "string" || !CATALOG_VERSION_RE.test(c.catalogVersion)) return "has no usable catalogVersion";
  if (!Array.isArray(c.controls) || !c.controls.length) return "lists no controls";
  const ids = new Set();
  for (let i = 0; i < c.controls.length; i++) {
    const ctrl = c.controls[i];
    const complete = isPlainObject(ctrl) && typeof ctrl.id === "string" && CONTROL_ID_RE.test(ctrl.id) && typeof ctrl.title === "string" && ctrl.title.trim() !== ""
      && Array.isArray(ctrl.mappings) && ctrl.mappings.length > 0 && Array.isArray(ctrl.expectedEvidence) && ctrl.expectedEvidence.length > 0;
    if (!complete) return `has an incomplete control (number ${i + 1} of ${c.controls.length})`;
    if (ids.has(ctrl.id)) return `lists the same control ID twice (control number ${i + 1})`;
    ids.add(ctrl.id);
  }
  return null;
}

// The catalog this package ships as current: { version, bytes }.
export function readPackageCatalog() {
  const dir = join(PLUGIN_ROOT, "catalogs");
  let index;
  try { index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")); } catch (e) {
    throw new OperationFailed(`the workflow package's catalogs/index.json could not be read (${e instanceof SyntaxError ? "not valid JSON" : e.code ?? "error"}); reinstall the workflow plugin. Nothing was written`);
  }
  const version = index?.current;
  if (typeof version !== "string" || !CATALOG_VERSION_RE.test(version)) throw new OperationFailed("the workflow package's catalogs/index.json does not name a current catalog; reinstall the workflow plugin. Nothing was written");
  let bytes;
  try { bytes = readFileSync(join(dir, `${version}.json`)); } catch (e) {
    throw new OperationFailed(`the workflow package's catalog ${version} could not be read (${e.code ?? "error"}); reinstall the workflow plugin. Nothing was written`);
  }
  const problem = catalogShapeProblem(bytes);
  if (problem) throw new OperationFailed(`the workflow package's catalog ${version} ${problem}; reinstall the workflow plugin. Nothing was written`);
  if (JSON.parse(bytes.toString("utf8")).catalogVersion !== version) throw new OperationFailed(`the workflow package's catalog file ${version}.json holds a different catalogVersion; reinstall the workflow plugin. Nothing was written`);
  return { version, bytes };
}

// The security engine (runtime/lib/security.mjs) belongs to another part of the runtime. When this build has it, an
// existing catalog is checked by the same code that reads it later; otherwise that is said, never assumed.
async function securityEngine() {
  const file = new URL("./security.mjs", import.meta.url);
  if (!existsSync(file)) return null;
  const mod = await import(file.href);
  return typeof mod.securitySummary === "function" ? mod : null;
}

// ---------- the prepare plan ----------

// Content left by the standalone prototype. prepare writes layout 2 only; migrate removes this after checking it.
export function prototypeContent(root, project) {
  const found = [];
  if (inspectPath(root, PROTOTYPE_RUNTIME_PATH).exists) found.push(`${PROTOTYPE_RUNTIME_PATH} (the copied prototype runtime)`);
  for (const rel of [...HARNESS_FILES, project.artifacts.maintain]) {
    const bytes = readPath(root, rel);
    if (bytes && bytes.includes(PROTOTYPE_TEXT)) found.push(`${rel} (a skillgate:project block)`);
  }
  return found;
}

const describeSource = (source) => (source === "config" ? "named in .skillgate/config.json" : "found at a conventional path");

// The next .skillgate/config.json object: existing keys kept in place, unknown keys kept, and the prepare keys set.
function nextConfig(project, runtimeVersion) {
  const config = clone(project.config);
  const prepare = isPlainObject(config.prepare) ? config.prepare : (config.prepare = {});
  prepare.version = LAYOUT_VERSION;
  const artifacts = isPlainObject(prepare.artifacts) ? prepare.artifacts : (prepare.artifacts = {});
  for (const role of ROLES) artifacts[role] = project.artifacts[role];
  const directories = isPlainObject(prepare.directories) ? prepare.directories : (prepare.directories = {});
  for (const [role, dir] of Object.entries(project.directories)) directories[role] = dir;
  const requires = isPlainObject(prepare.requires) ? prepare.requires : (prepare.requires = {});
  const existing = requires.workflow;
  if (existing === undefined || (project.layoutVersion !== LAYOUT_VERSION && cmpVersion(existing, runtimeVersion) < 0)) requires.workflow = runtimeVersion;
  // The shipped session-start hook reads handoff.file; config.mjs requires it to agree with prepare.artifacts.handoff.
  const handoff = isPlainObject(config.handoff) ? config.handoff : (config.handoff = {});
  handoff.file = project.artifacts.handoff;
  return config;
}

function configChanges(before, after) {
  const notes = [];
  const b = isPlainObject(before.prepare) ? before.prepare : {}, a = after.prepare;
  if (b.version !== a.version) notes.push(`prepare.version ${b.version ?? "absent"} to ${a.version}`);
  if (!sameJson(b.artifacts, a.artifacts)) notes.push("prepare.artifacts lists every record role");
  if (!sameJson(b.directories, a.directories)) notes.push("prepare.directories lists the entry folders");
  if (!sameJson(b.requires, a.requires)) notes.push(`prepare.requires.workflow ${a.requires.workflow}`);
  if (!sameJson(before.handoff, after.handoff)) notes.push(`handoff.file ${after.handoff.file}`);
  return notes.join("; ");
}

// Everything prepare would do, without writing. items: [{ path, action: "create" | "update" | "adopt" | "current",
// what, before, after }] in write order; changes: the create and update items. notes: facts the person should read.
export async function planPrepare(root, { runtimeVersion = readPluginVersion(PLUGIN_ROOT) } = {}) {
  const project = loadProject(root);
  if (project.layoutVersion === 1) {
    throw new NeedsMigration(`this project uses layout 1, written by the standalone prototype (copied runtime, skillgate:project blocks), and prepare writes layout 2 only. Nothing was written. Preview the migration: ${selfCommand()} migrate --dir ${argPath(root)}; then apply it: ${selfCommand()} migrate --apply --dir ${argPath(root)}`);
  }
  if (!runtimeVersion) throw new OperationFailed("the workflow plugin's version could not be read from its .claude-plugin/plugin.json; reinstall the plugin. Nothing was written");
  const required = project.requires.workflow;
  if (required && cmpVersion(required, runtimeVersion) > 0) {
    refuse(`this project requires workflow ${required} or later (prepare.requires.workflow), and this runtime is ${runtimeVersion}. Update the workflow plugin, then run again. Nothing was written`);
  }
  const leftovers = prototypeContent(root, project);
  if (leftovers.length) {
    refuse(`this project still holds content from the standalone prototype: ${leftovers.join("; ")}. prepare does not remove it, and two instruction writers must not share a project. To migrate it, set "prepare": { "version": 1 } in ${CONFIG_REL} and run ${selfCommand()} migrate --dir ${argPath(root)}. Nothing was written`);
  }

  const items = [], notes = [];
  const add = (path, action, what, before = null, after = null) => items.push({ path, action, what, before, after });
  const createOrAdopt = (path, what, adoptWhat, render) => {
    const info = inspectPath(root, path);
    if (info.exists) add(path, "adopt", adoptWhat);
    else add(path, "create", what, null, Buffer.from(render(), "utf8"));
  };

  for (const role of ROLES) {
    const path = project.artifacts[role];
    createOrAdopt(path, `${ROLE_LABELS[role]}, created as "not yet assessed"`, `${ROLE_LABELS[role]}, ${describeSource(project.artifactSource[role])}; left exactly as it is`, () => recordTemplate(role, project));
  }
  for (const kind of ["tasks", "decisions", "lessons"]) {
    const dir = project.directories[kind];
    inspectFolder(root, dir, `the ${kind} folder`);
    createOrAdopt(`${dir}/README.md`, `explains the ${kind.replace(/s$/, "")} entry format`, "entry folder README already present; left exactly as it is", () => entryFolderReadme(kind, project));
  }
  createOrAdopt(SECURITY_README_REL, "explains the security evidence register and skillgate security status", "already present; left exactly as it is", securityReadme);

  const catalog = readPath(root, CATALOG_REL, "the project's security catalog");
  if (catalog === null) {
    const shipped = readPackageCatalog();
    add(CATALOG_REL, "create", `security catalog ${shipped.version}, copied from the workflow package`, null, shipped.bytes);
  } else {
    const problem = catalogShapeProblem(catalog);
    if (problem) refuse(`${CATALOG_REL} ${problem}. It was preserved and nothing was written. Fix it, or move it out of the project so prepare copies the package's catalog, then run again`);
    const engine = await securityEngine();
    if (engine) {
      const summary = await engine.securitySummary(root);
      if (!summary || summary.available !== true) refuse(`the security engine cannot use ${CATALOG_REL} or its records (${summary?.reason ?? "no reason given"}). They were preserved and nothing was written. Run skillgate security status for details`);
      if (summary.invalid > 0) refuse(`the security engine found ${summary.invalid} invalid observation record(s) under .skillgate/security/records. They were preserved and nothing was written. Run skillgate security status for details`);
      add(CATALOG_REL, "adopt", `security catalog ${summary.catalogVersion ?? "(version not reported)"}, read by the security engine; left exactly as it is`);
    } else {
      add(CATALOG_REL, "adopt", "security catalog already present; left exactly as it is");
      notes.push(`The security engine (runtime/lib/security.mjs) is not available in this build, so the existing ${CATALOG_REL} was checked for its basic shape only, not by the code that reads it.`);
    }
  }
  createOrAdopt(RECORDS_README_REL, "explains the immutable observation records", "already present; left exactly as it is", recordsReadme);

  const ignore = readPath(root, ".gitignore");
  const ignoreText = ignore === null ? "" : ignore.toString("latin1");
  const ignoreNext = gitignoreWithSkillgate(ignoreText);
  if (ignore !== null && ignoreNext === ignoreText) add(".gitignore", "current", `already lists ${GITIGNORE_LINES.join(" and ")}`);
  else add(".gitignore", ignore === null ? "create" : "update", `${ignore === null ? "lists" : "add"} ${GITIGNORE_LINES.join(" and ")} (the lock and private evidence stay out of Git)`, ignore, Buffer.from(ignoreNext, "latin1"));

  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  for (const name of HARNESS_FILES) {
    inspectPath(root, name);
    const plan = planHarnessFile(root, name, template, false, vars);
    // In a prepared project, a block that exists but differs from the template is a template update: it goes through
    // migrate (receipt, rollback, hand-edit check), never a silent rewrite here.
    const refresh = plan.changed && plan.exists && project.layoutVersion === LAYOUT_VERSION && /^replace the harness block/.test(plan.summary);
    if (!plan.changed) add(name, "current", plan.summary);
    else if (refresh) add(name, "migrate", `the managed instruction block differs from the current template; refresh it with a receipt and a rollback: ${selfCommand()} migrate`);
    else add(name, plan.exists ? "update" : "create", plan.summary, plan.exists ? Buffer.from(plan.text, "latin1") : null, Buffer.from(plan.next, "latin1"));
  }

  const configInfo = inspectPath(root, CONFIG_REL);
  const next = nextConfig(project, runtimeVersion);
  if (project.configExists && sameJson(next, project.config)) add(CONFIG_REL, "current", `layout ${LAYOUT_VERSION}, every record role, the entry folders and requires workflow ${next.prepare.requires.workflow} are already set`);
  else {
    const what = project.configExists ? `${configChanges(project.config, next)}; every other key is kept` : `layout ${LAYOUT_VERSION}, every record role, the entry folders, requires workflow ${next.prepare.requires.workflow}`;
    add(CONFIG_REL, project.configExists ? "update" : "create", what, configInfo.exists ? readPath(root, CONFIG_REL) : null, Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8"));
  }

  const seen = new Map();
  for (const item of items) {
    const key = item.path.toLowerCase();
    if (seen.has(key)) refuse(`two files prepare manages resolve to the same path, ${item.path} (${seen.get(key)}; ${item.what}). Give them separate paths in ${CONFIG_REL}. Nothing was written`);
    seen.set(key, item.what);
  }

  for (const rel of [SECURITY_README_REL, RECORDS_README_REL, ...["tasks", "decisions", "lessons"].map((k) => `${project.directories[k]}/README.md`)]) {
    const bytes = items.some((i) => i.path === rel && i.action === "adopt") ? readPath(root, rel) : null;
    if (bytes && bytes.includes(PROTOTYPE_RUNTIME_PATH)) notes.push(`${rel} still tells people to run ${PROTOTYPE_RUNTIME_PATH}, which layout 2 does not have; replace that text by hand with skillgate security status (prepare never rewrites a file it adopted).`);
  }

  return { project, root, runtimeVersion, items, notes, changes: items.filter((i) => i.action === "create" || i.action === "update") };
}
