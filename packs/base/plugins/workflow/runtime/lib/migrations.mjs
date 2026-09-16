// migrations.mjs: ordered project layout migrations (docs/CONTRACTS.md section 10).
//
// Each migration has an ID NNNN-slug, a from and a to layout, and a plan function that checks its preconditions and
// returns its file changes without writing. Applying one writes those changes through prepare.mjs applyChanges (lock,
// recheck, Git-private backups, rollback) together with a receipt in .skillgate/migrations/<id>.json. A rollback
// restores the backups only when every file still holds exactly what the migration wrote, then removes the receipt.
//
// 0002-integrated-layout moves a project prepared by the standalone prototype (layout 1) to layout 2. It recognises
// prototype content only by exact bytes (prototype-v1.mjs) and refuses anything else with the step that reconciles it,
// because a copied runtime or a managed block that differs may hold a person's changes.
//
// Nothing here parses arguments or exits the process. Nothing here imports from outside the plugin folder.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  HARNESS_FILES, HARNESS_TEMPLATE, Refused, clone, cmpVersion, isPlainObject, lineSpans, planHarnessFile,
  readHarnessTemplate, refuse, removeBlockAt, tilde,
} from "./core.mjs";
import { CONFIG_REL, LAYOUT_VERSION, templateVars, validRelPath } from "./config.mjs";
import { OperationFailed, applyChanges, inspectFolder, inspectPath, newBackupId, readPath, sha256 } from "./prepare.mjs";
import { MIGRATIONS_DIR } from "./project-files.mjs";
import {
  PROJECT_MARKER_END, PROJECT_MARKER_START, PROTOTYPE_COMMIT, PROTOTYPE_RUNTIME_PATH, PROTOTYPE_RUNTIME_SHA256,
  maintenanceInstructions, projectInstructions, prototypeBlock,
} from "./prototype-v1.mjs";

export const RECEIPT_SCHEMA = "skillgate.migration-receipt/1";
export const MIGRATION_ID_RE = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const ID_0002 = "0002-integrated-layout";

// ---------- prototype blocks ----------

// The single skillgate:project block in text, or null. Marker text that is not exactly one well-formed block is refused.
export function findPrototypeBlock(text, label) {
  const spans = lineSpans(text);
  const starts = [], ends = [], other = [];
  spans.forEach((s, i) => {
    if (!s.body.includes("skillgate:project:")) return;
    if (s.body === PROJECT_MARKER_START) starts.push(i);
    else if (s.body === PROJECT_MARKER_END) ends.push(i);
    else other.push(i);
  });
  if (!starts.length && !ends.length && !other.length) return null;
  if (other.length || starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    const lines = [...starts, ...ends, ...other].sort((a, b) => a - b).map((i) => i + 1).join(", ");
    refuse(`migration ${ID_0002} refused: ${label} has skillgate:project marker text on line(s) ${lines} that is not one well-formed prototype block, so it cannot be recognised as what the prototype wrote. Nothing was changed. To reconcile: move any text you want to keep away from those lines, delete the marker lines and the text between them, then run migrate again`);
  }
  const s = spans[starts[0]], e = spans[ends[0]];
  return { startOffset: s.start + s.bom, endOffset: e.end, markerEnd: e.start + e.body.length, startLineNo: starts[0] + 1, endLineNo: ends[0] + 1 };
}

function checkPrototypeBlock(text, found, expected, label) {
  const actual = Buffer.from(text.slice(found.startOffset, found.markerEnd), "latin1");
  if (!actual.equals(Buffer.from(expected, "utf8"))) {
    refuse(`migration ${ID_0002} refused: ${label} lines ${found.startLineNo} to ${found.endLineNo} hold a skillgate:project block that differs from what the prototype wrote for this project's records, so it may hold hand edits. Nothing was changed. To reconcile: move any text you want to keep outside the block, delete the block including both marker lines, then run migrate again`);
  }
}

// ---------- 0002-integrated-layout ----------

async function plan0002(project, { root, runtimeVersion }) {
  const files = [], notes = [];

  const runtime = readPath(root, PROTOTYPE_RUNTIME_PATH, "the copied prototype runtime");
  if (runtime === null) notes.push(`${PROTOTYPE_RUNTIME_PATH} is not present, so there is no copied runtime to remove.`);
  else {
    const have = sha256(runtime);
    if (have !== PROTOTYPE_RUNTIME_SHA256) {
      refuse(`migration ${ID_0002} refused: ${PROTOTYPE_RUNTIME_PATH} does not match the prototype runtime released at ${PROTOTYPE_COMMIT} (its sha256 starts ${have.slice(0, 12)}; the release's starts ${PROTOTYPE_RUNTIME_SHA256.slice(0, 12)}), so it may hold local changes. Nothing was changed. To reconcile: keep any change you need outside .skillgate/bin/, delete ${PROTOTYPE_RUNTIME_PATH} (layout 2 runs "skillgate security" from the installed workflow plugin), then run migrate again`);
    }
    files.push({ path: PROTOTYPE_RUNTIME_PATH, action: "delete", before: runtime, after: null, what: `the copied prototype runtime; its sha256 matches the release at ${PROTOTYPE_COMMIT}`, diff: false });
  }

  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  const projectBlock = prototypeBlock(projectInstructions(project.artifacts));
  for (const name of HARNESS_FILES) {
    const bytes = readPath(root, name);
    const text = bytes === null ? null : bytes.toString("latin1");
    const proto = text === null ? null : findPrototypeBlock(text, name);
    if (proto) checkPrototypeBlock(text, proto, projectBlock, name);
    const harness = planHarnessFile(root, name, template, false, vars);
    let next = harness.next;
    if (proto) next = removeBlockAt(next, findPrototypeBlock(next, name));
    if (text !== null && next === text) continue;
    const harnessPart = text === null ? harness.summary
      : /already current/.test(harness.summary) ? "keep the harness block, which is already current"
      : /^replace/.test(harness.summary) ? "replace the harness block with the current template"
      : "add the harness block at the end after a blank line";
    const what = proto ? `remove the prototype skillgate:project block (lines ${proto.startLineNo} to ${proto.endLineNo}) and one blank line next to it; ${harnessPart}; other text is kept` : harnessPart;
    files.push({ path: name, action: text === null ? "create" : "update", before: bytes, after: Buffer.from(next, "latin1"), what, diff: true });
  }

  const maintainRel = project.artifacts.maintain;
  const maintain = readPath(root, maintainRel, "the maintain record");
  if (maintain !== null) {
    const text = maintain.toString("latin1");
    const proto = findPrototypeBlock(text, maintainRel);
    if (proto) {
      checkPrototypeBlock(text, proto, prototypeBlock(maintenanceInstructions()), maintainRel);
      files.push({ path: maintainRel, action: "update", before: maintain, after: Buffer.from(removeBlockAt(text, proto), "latin1"), what: `remove the prototype skillgate:project block (lines ${proto.startLineNo} to ${proto.endLineNo}) and one blank line next to it; nothing else changes (layout 2 has no managed block in the maintain record)`, diff: true });
    }
  }

  const configBytes = readPath(root, CONFIG_REL);
  const config = clone(project.config);
  const prepare = isPlainObject(config.prepare) ? config.prepare : (config.prepare = {});
  prepare.version = LAYOUT_VERSION;
  const requires = isPlainObject(prepare.requires) ? prepare.requires : (prepare.requires = {});
  if (requires.workflow !== undefined && cmpVersion(requires.workflow, runtimeVersion) > 0) {
    refuse(`migration ${ID_0002} refused: prepare.requires.workflow is ${requires.workflow}, newer than this runtime (${runtimeVersion}). Update the workflow plugin, then run migrate again. Nothing was changed`);
  }
  if (requires.workflow === undefined || cmpVersion(requires.workflow, runtimeVersion) < 0) requires.workflow = runtimeVersion;
  files.push({ path: CONFIG_REL, action: configBytes === null ? "create" : "update", before: configBytes, after: Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf8"), what: `prepare.version 1 to ${LAYOUT_VERSION}; prepare.requires.workflow ${requires.workflow}; every other key is kept`, diff: true });

  for (const rel of ["docs/security/README.md", ".skillgate/security/records/README.md"]) {
    const bytes = readPath(root, rel);
    if (bytes && bytes.includes(PROTOTYPE_RUNTIME_PATH)) notes.push(`${rel} still tells people to run ${PROTOTYPE_RUNTIME_PATH}; this migration does not change it. Replace that text by hand with "skillgate security status".`);
  }
  return { files, notes };
}

// Each migration also names every path it can change, so a rollback never acts on a path its receipt should not hold.
export const MIGRATIONS = [
  {
    id: ID_0002,
    from: 1,
    to: 2,
    summary: "from the standalone prototype layout to the integrated layout: remove the copied security runtime and the skillgate:project blocks, add the harness blocks, set prepare.version 2 and prepare.requires.workflow",
    plan: plan0002,
    paths: (project) => [PROTOTYPE_RUNTIME_PATH, ...HARNESS_FILES, project.artifacts.maintain, CONFIG_REL],
  },
];

// ---------- state ----------

function listReceiptIds(root) {
  const folder = inspectFolder(root, MIGRATIONS_DIR, "the migration receipts folder");
  if (!folder.exists) return [];
  return readdirSync(folder.abs).filter((n) => n.endsWith(".json") && MIGRATION_ID_RE.test(n.slice(0, -5))).map((n) => n.slice(0, -5)).sort();
}

// { layoutVersion, target, pending: [{ id, from, to, summary }], applied: [receiptId] }. An unprepared project
// (no prepare.version) has nothing pending: it needs prepare, not a migration. Throws Refused when the receipts
// folder is a link or not a folder.
export function migrationState(project) {
  const pending = [];
  let layout = project.layoutVersion;
  if (layout !== null) {
    for (const m of MIGRATIONS) {
      if (layout >= LAYOUT_VERSION) break;
      if (m.from === layout) { pending.push({ id: m.id, from: m.from, to: m.to, summary: m.summary }); layout = m.to; }
    }
  }
  return { layoutVersion: project.layoutVersion, target: LAYOUT_VERSION, pending, applied: listReceiptIds(project.root) };
}

// ---------- apply ----------

// The change set for one migration, without writing: { migration, files: [{ path, action, before, after, what, diff }],
// notes, receiptRel }. Precondition failures are refused here.
export async function planMigration(migration, project, { root, runtimeVersion }) {
  if (!runtimeVersion) throw new OperationFailed("the workflow plugin's version could not be read from its .claude-plugin/plugin.json, and a receipt must name it; reinstall the plugin. Nothing was changed");
  if (project.layoutVersion !== migration.from) refuse(`${migration.id} migrates layout ${migration.from}, and this project is at layout ${project.layoutVersion}. Nothing was changed`);
  const receiptRel = `${MIGRATIONS_DIR}/${migration.id}.json`;
  if (inspectPath(root, receiptRel).exists) refuse(`${receiptRel} already exists, so ${migration.id} was applied before, yet prepare.version is ${project.layoutVersion}. Reconcile .skillgate/config.json and the receipt by hand (git log shows when each changed). Nothing was changed`);
  const { files, notes } = await migration.plan(project, { root, runtimeVersion });
  return { migration, files, notes, receiptRel };
}

// Write one planned migration and its receipt as one transaction. Returns { receipt, receiptRel, result }.
export function applyMigration(plan, { root, gitDir, runtimeVersion }) {
  const backupId = newBackupId("migrate");
  const receipt = {
    schema: RECEIPT_SCHEMA,
    id: plan.migration.id,
    from: plan.migration.from,
    to: plan.migration.to,
    appliedAt: new Date().toISOString(),
    runtime: runtimeVersion,
    files: plan.files.map((f) => ({ path: f.path, action: f.action, beforeSha256: f.before ? sha256(f.before) : null, afterSha256: f.after ? sha256(f.after) : null })),
    backup: backupId,
  };
  const changes = [
    ...plan.files.map((f) => ({ path: f.path, before: f.before, after: f.after })),
    { path: plan.receiptRel, before: null, after: Buffer.from(JSON.stringify(receipt, null, 2) + "\n", "utf8") },
  ];
  const result = applyChanges({ root, gitDir, command: "migrate", changes, backupId });
  return { receipt, receiptRel: plan.receiptRel, result };
}

// ---------- rollback ----------

function receiptProblem(r, id) {
  if (!isPlainObject(r)) return "does not hold a JSON object";
  if (r.schema !== RECEIPT_SCHEMA) return `does not have the schema ${RECEIPT_SCHEMA}`;
  if (r.id !== id) return "names a different migration than its file name";
  if (!Number.isInteger(r.from) || !Number.isInteger(r.to)) return "has no whole-number from and to layouts";
  if (typeof r.backup !== "string" || !BACKUP_ID_RE.test(r.backup)) return "has no usable backup ID";
  if (!Array.isArray(r.files)) return "has no file list";
  const seen = new Set();
  for (const f of r.files) {
    if (!isPlainObject(f) || typeof f.path !== "string" || !validRelPath(f.path) || !["create", "update", "delete"].includes(f.action)) return "has a file entry without a usable path and action";
    const beforeOk = f.action === "create" ? f.beforeSha256 === null : typeof f.beforeSha256 === "string" && SHA_RE.test(f.beforeSha256);
    const afterOk = f.action === "delete" ? f.afterSha256 === null : typeof f.afterSha256 === "string" && SHA_RE.test(f.afterSha256);
    if (!beforeOk || !afterOk) return `has hashes for ${f.path} that do not fit its action`;
    if (seen.has(f.path.toLowerCase())) return `lists ${f.path} twice`;
    seen.add(f.path.toLowerCase());
  }
  return null;
}

export function readReceipt(root, id) {
  if (typeof id !== "string" || !MIGRATION_ID_RE.test(id)) refuse(`"${id}" is not a migration ID (NNNN-slug, for example ${ID_0002})`);
  const rel = `${MIGRATIONS_DIR}/${id}.json`;
  const bytes = readPath(root, rel, `the receipt ${rel}`);
  if (bytes === null) {
    const applied = listReceiptIds(root);
    refuse(`there is no receipt ${rel}, so ${id} is not applied in this project (applied: ${applied.length ? applied.join(", ") : "none"}). Nothing was changed`);
  }
  let receipt;
  try { receipt = JSON.parse(bytes.toString("utf8")); } catch { refuse(`the receipt ${rel} is not valid JSON. Nothing was changed`); }
  const problem = receiptProblem(receipt, id);
  if (problem) refuse(`the receipt ${rel} ${problem}. Nothing was changed`);
  return { rel, bytes, receipt };
}

// What rolling back id would write: { receipt, receiptRel, changes: [{ path, before, after, action }] }. Refused when
// a later migration is applied, when any file no longer holds exactly what the migration wrote (every such file is
// listed), or when a backup is missing or does not match the receipt.
export function planRollback(project, { root, gitDir }, id) {
  const { rel, bytes, receipt } = readReceipt(root, id);
  const migration = MIGRATIONS.find((m) => m.id === id);
  if (!migration) refuse(`${id} is not a migration this runtime knows, so it cannot check what the receipt lists. Nothing was changed`);
  if (receipt.from !== migration.from || receipt.to !== migration.to) refuse(`the receipt ${rel} says layout ${receipt.from} to ${receipt.to}, but ${id} migrates layout ${migration.from} to ${migration.to}. Nothing was changed`);
  const allowed = new Set(migration.paths(project).map((p) => p.toLowerCase()));
  const foreign = receipt.files.map((f) => f.path).filter((p) => !allowed.has(p.toLowerCase()));
  if (foreign.length) refuse(`the receipt ${rel} lists ${foreign.join(", ")}, which ${id} never changes, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  const later = listReceiptIds(root).filter((other) => other > id);
  if (later.length) refuse(`roll back the later migration(s) first: ${later.join(", ")}. Nothing was changed`);
  const changed = [], now = new Map();
  for (const f of receipt.files) {
    let current;
    try { current = readPath(root, f.path); } catch (e) {
      if (!(e instanceof Refused)) throw e;
      changed.push(`${f.path} (now a link, a folder, a hard link or too large)`);
      continue;
    }
    const sha = current === null ? null : sha256(current);
    if (sha !== f.afterSha256) changed.push(`${f.path} (${sha === null ? "deleted" : f.afterSha256 === null ? "created again" : "edited"})`);
    now.set(f.path, current);
  }
  if (changed.length) {
    refuse(`rollback of ${id} refused: ${changed.length} file(s) changed since the migration was applied: ${changed.join("; ")}. Nothing was changed. A rollback restores the backup only when every file still holds exactly what the migration wrote; reconcile those files by hand instead`);
  }
  const backupRel = `skillgate-backups/${receipt.backup}`;
  const changes = [];
  for (const f of [...receipt.files].reverse()) {
    let restore = null;
    if (f.beforeSha256 !== null) {
      restore = readPath(gitDir, `${backupRel}/${f.path}`, `the backup of ${f.path}`);
      if (restore === null) refuse(`rollback of ${id} refused: the backup of ${f.path} is not in ${tilde(join(gitDir, ...backupRel.split("/")))}. Backups stay in the Git folder of the clone where the migration was applied, so run the rollback there. Nothing was changed`);
      if (sha256(restore) !== f.beforeSha256) refuse(`rollback of ${id} refused: the backup of ${f.path} does not match the hash in the receipt. Nothing was changed`);
    }
    const action = f.action === "create" ? "delete" : f.action === "delete" ? "create" : "restore";
    changes.push({ path: f.path, before: now.get(f.path), after: restore, action });
  }
  changes.push({ path: rel, before: bytes, after: null, action: "delete" });
  return { receipt, receiptRel: rel, changes };
}

export function applyRollback(plan, { root, gitDir }) {
  return applyChanges({ root, gitDir, command: "rollback", changes: plan.changes.map(({ path, before, after }) => ({ path, before, after })) });
}
