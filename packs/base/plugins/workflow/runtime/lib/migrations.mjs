// migrations.mjs: the migration engine (docs/CONTRACTS.md section 10) and the instructions-refresh migration.
//
// Each migration has an ID NNNN-slug, a from and a to layout, and a plan function that checks its preconditions and
// returns its file changes without writing. Applying one writes those changes through prepare.mjs applyChanges (lock,
// recheck, Git-private backups, rollback) together with a receipt in .skilliton/migrations/<id>.json. A rollback
// restores the backups only when every file still holds exactly what the migration wrote, then removes the receipt.
//
// 0100-instructions-<template sha256, 12 hex> refreshes the managed instruction blocks in CLAUDE.md and AGENTS.md when
// the harness template changed after a layout-2 project was prepared. It is keyed by the template's hash, so each
// template version is one migration with one receipt; the receipt records the hash of every block it wrote, so a later
// refresh can tell a block a person edited inside the markers (refused, with the reconciling step) from one Skilliton
// wrote. Text outside the markers is never changed.
//
// 0002-integrated-layout (the pre-1.0 prototype layout to layout 2) and 0003-skilliton-names (the earlier product
// name to the Skilliton names, layout 2 to 3) moved to scripts/legacy-migrate.mjs: a one-shot script a project
// prepared before 1.0.0 runs by hand, once, before it ever runs this runtime's migrate command. That script writes
// the same receipt shape this file does, so their IDs stay meaningful here: latestInstructionsReceipt still
// recognises a 0003-skilliton-names receipt as a record of what Skilliton wrote into the harness blocks, and
// receiptProblem still names the earlier receipt schema correctly. commands/migrate.mjs refuses a project still
// below LAYOUT_VERSION with the exact command to run.
//
// Nothing here parses arguments or exits the process. Nothing here imports from outside the plugin folder.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Refused, isPlainObject, refuse, selfCommand, tilde } from "./core.mjs";
import { HARNESS_FILES, HARNESS_TEMPLATE, findBlock, planHarnessFile, readHarnessTemplate } from "./harness.mjs";
import { LAYOUT_VERSION, templateVars, validRelPath } from "./config.mjs";
import { OperationFailed, applyChanges, inspectFolder, inspectPath, newBackupId, readPath, sha256 } from "./prepare.mjs";
import { MIGRATIONS_DIR } from "./project-files.mjs";
import { LEGACY_MIGRATIONS_DIR, LEGACY_RECEIPT_SCHEMA } from "./legacy-names.mjs";

const RECEIPT_SCHEMA = "skilliton.migration-receipt/1";
const INSTRUCTIONS_PREFIX = "0100-instructions-";
export const MIGRATION_ID_RE = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/; // the one pattern; release.mjs imports it (B41)
const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
// The earlier layout migration this file no longer plans (scripts/legacy-migrate.mjs does); its receipt ID is still
// checked by name below, so a harness block it wrote is recognised rather than treated as a hand edit.
const ID_0003 = "0003-skilliton-names";

// Where a project keeps its migration receipts: layouts 1 and 2 under the earlier names, layout 3 under .skilliton/.
const receiptsDir = (project) => (project.legacyNames ? LEGACY_MIGRATIONS_DIR : MIGRATIONS_DIR);
// Each migration also names every path it can change, so a rollback never acts on a path its receipt should not hold.
// The two layout migrations that carried a pre-1.0 project forward (0002-integrated-layout, 0003-skilliton-names)
// plan from scripts/legacy-migrate.mjs now; this runtime plans no layout migration of its own, only the instructions
// refresh below.
export const MIGRATIONS = [...(await import("./migrations-findings.mjs")).FINDINGS_MIGRATIONS]; // 0004-security-findings-file (B78)

// ---------- 0100-instructions-<sha12> ----------

// The text between a file's harness markers, as its sha256, or null when the file or the block is absent.
function blockSha(root, name) {
  const bytes = readPath(root, name);
  if (bytes === null) return null;
  const text = bytes.toString("latin1");
  const found = findBlock(text, name);
  return found ? sha256(Buffer.from(text.slice(found.innerStart, found.innerEnd).replace(/\r\n/g, "\n"), "latin1")) : null;
}

function instructionsId(template) {
  return INSTRUCTIONS_PREFIX + sha256(Buffer.from(template, "latin1")).slice(0, 12);
}

// The newest instructions receipt that recorded block hashes, or null.
function latestInstructionsReceipt(root, dir = MIGRATIONS_DIR) {
  let latest = null;
  for (const id of listReceiptIds(root, dir).filter((i) => i.startsWith(INSTRUCTIONS_PREFIX) || i === ID_0003)) {
    let receipt;
    try { receipt = readReceipt(root, id, dir).receipt; } catch (e) { if (e instanceof Refused) continue; throw e; }
    if (!isPlainObject(receipt.blocks)) continue;
    if (!latest || String(receipt.appliedAt) > String(latest.appliedAt)) latest = receipt;
  }
  return latest;
}

// { id, templateSha12, outdated: [file names whose block differs from the current rendering], applied } for a layout-2
// project, else null. Malformed markers are refused (core findBlock), which status reports as a failed check.
function instructionsState(project) {
  if (project.layoutVersion !== LAYOUT_VERSION) return null;
  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  // Only an existing block that differs is a template update; a missing file or block is prepare's to add.
  const outdated = HARNESS_FILES.filter((name) => { const plan = planHarnessFile(project.root, name, template, false, vars); return plan.changed && /^replace the harness block/.test(plan.summary); });
  const id = instructionsId(template);
  return { id, templateSha12: id.slice(INSTRUCTIONS_PREFIX.length), outdated, applied: listReceiptIds(project.root, receiptsDir(project)).includes(id) };
}

async function planInstructions(project, { root }) {
  const template = readHarnessTemplate(HARNESS_TEMPLATE);
  const vars = templateVars(project);
  const previous = latestInstructionsReceipt(root);
  const files = [], notes = [], blocks = {}, edited = [];
  for (const name of HARNESS_FILES) {
    const plan = planHarnessFile(root, name, template, false, vars);
    const now = blockSha(root, name);
    if (previous && now !== null && typeof previous.blocks[name] === "string" && previous.blocks[name] !== now && plan.changed) edited.push(name);
    if (!plan.changed || !/^replace the harness block/.test(plan.summary)) { blocks[name] = now; continue; }
    files.push({ path: name, action: plan.exists ? "update" : "create", before: plan.exists ? Buffer.from(plan.text, "latin1") : null, after: Buffer.from(plan.next, "latin1"), what: plan.summary, diff: true });
    const afterText = plan.next;
    const found = findBlock(afterText, name);
    blocks[name] = found ? sha256(Buffer.from(afterText.slice(found.innerStart, found.innerEnd).replace(/\r\n/g, "\n"), "latin1")) : null;
  }
  if (edited.length) {
    refuse(`the managed instruction block in ${edited.join(" and ")} was edited by hand after Skilliton last wrote it (receipt ${previous.id}), so refreshing it would discard that edit. Nothing was changed. To reconcile: move the text you want to keep outside the skilliton:harness markers, then run migrate again; or overwrite the block on purpose with: ${selfCommand()} harness --apply (it keeps a backup)`);
  }
  if (!previous) notes.push("No earlier instructions receipt records what Skilliton wrote into these blocks, so a hand edit inside the markers cannot be told apart; the diff above shows everything that changes, and the backup keeps the old text.");
  return { files, notes, receiptExtra: { blocks, templateSha256: sha256(Buffer.from(template, "latin1")) } };
}

// A migration by ID: a layout migration from MIGRATIONS, or the instructions refresh for a template hash.
export function migrationById(id, project) {
  const layout = MIGRATIONS.find((m) => m.id === id);
  if (layout) return layout;
  if (typeof id === "string" && id.startsWith(INSTRUCTIONS_PREFIX) && MIGRATION_ID_RE.test(id)) {
    const level = project.layoutVersion ?? LAYOUT_VERSION;
    return { id, kind: "instructions", from: level, to: level, summary: `refresh the managed instruction blocks in CLAUDE.md and AGENTS.md to harness template ${id.slice(INSTRUCTIONS_PREFIX.length)}; text outside the markers is kept`, plan: planInstructions, paths: () => [...HARNESS_FILES] };
  }
  return null;
}

// ---------- state ----------

function listReceiptIds(root, dir = MIGRATIONS_DIR) {
  const folder = inspectFolder(root, dir, "the migration receipts folder");
  if (!folder.exists) return [];
  return readdirSync(folder.abs).filter((n) => n.endsWith(".json") && MIGRATION_ID_RE.test(n.slice(0, -5))).map((n) => n.slice(0, -5)).sort();
}

// { layoutVersion, target, pending: [{ id, from, to, summary }], applied: [receiptId] }. An unprepared project
// (no prepare.version) has nothing pending: it needs prepare, not a migration. Throws Refused when the receipts
// folder is a link or not a folder.
//
// Pending is built in three passes, in order: a layout migration (from !== to, none of MIGRATIONS' entries any
// more; this runtime plans none of its own) that moves the project toward LAYOUT_VERSION; then, once the project is
// at LAYOUT_VERSION, a same-layout "content" migration (from === to, like 0004-security-findings-file) that has no
// receipt yet and whose own needed(project) says there is something to do, in id order; then, only when nothing
// above is pending, the instructions refresh. Applying one migration at a time (commands/migrate.mjs's applyPending)
// re-reads this after each apply, so a content migration always plans against the project's current state.
export function migrationState(project) {
  const pending = [];
  let layout = project.layoutVersion;
  const layoutMigrations = MIGRATIONS.filter((m) => m.from !== m.to);
  if (layout !== null) {
    for (const m of layoutMigrations) {
      if (layout >= LAYOUT_VERSION) break;
      if (m.from === layout) { pending.push({ id: m.id, from: m.from, to: m.to, summary: m.summary }); layout = m.to; }
    }
  }
  const applied = listReceiptIds(project.root, receiptsDir(project));
  if (!pending.length && layout === LAYOUT_VERSION) {
    const contentMigrations = MIGRATIONS.filter((m) => m.from === m.to).sort((a, b) => a.id.localeCompare(b.id));
    for (const m of contentMigrations) {
      if (applied.includes(m.id)) continue;
      if (m.needed && !m.needed(project)) continue;
      pending.push({ id: m.id, from: m.from, to: m.to, summary: m.summary });
    }
  }
  const instructions = pending.length ? null : instructionsState(project);
  if (instructions && instructions.outdated.length && !instructions.applied) {
    pending.push({ id: instructions.id, from: project.layoutVersion, to: project.layoutVersion, summary: migrationById(instructions.id, project).summary });
  }
  return { layoutVersion: project.layoutVersion, target: LAYOUT_VERSION, pending, applied, instructions };
}

// ---------- apply ----------

// The change set for one migration, without writing: { migration, files: [{ path, action, before, after, what, diff }],
// notes, receiptRel }. Precondition failures are refused here.
export async function planMigration(migration, project, { root, runtimeVersion }) {
  if (!runtimeVersion) throw new OperationFailed("the workflow plugin's version could not be read from its .claude-plugin/plugin.json, and a receipt must name it; reinstall the plugin. Nothing was changed");
  if (project.layoutVersion !== migration.from) refuse(`${migration.id} migrates layout ${migration.from}, and this project is at layout ${project.layoutVersion}. Nothing was changed`);
  // A migration that moves the project to the Skilliton names writes its receipt under them.
  const receiptRel = `${migration.to >= 3 ? MIGRATIONS_DIR : receiptsDir(project)}/${migration.id}.json`;
  if (inspectPath(root, receiptRel).exists) refuse(`${receiptRel} already exists, so ${migration.id} was applied before, yet prepare.version is ${project.layoutVersion}. Reconcile ${project.configRel} and the receipt by hand (git log shows when each changed). Nothing was changed`);
  const { files, notes, receiptExtra } = await migration.plan(project, { root, runtimeVersion });
  return { migration, files, notes, receiptRel, receiptExtra: receiptExtra ?? null };
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
    ...(plan.receiptExtra ?? {}),
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
  if (r.schema === LEGACY_RECEIPT_SCHEMA) return `was written by the runtime before the rename to Skilliton (schema ${LEGACY_RECEIPT_SCHEMA}), so only that release can roll it back, from a checkout of a commit before the rename`;
  if (r.schema !== RECEIPT_SCHEMA) return `does not have the schema ${RECEIPT_SCHEMA}`;
  if (r.id !== id) return "names a different migration than its file name";
  if (!Number.isInteger(r.from) || !Number.isInteger(r.to)) return "has no whole-number from and to layouts";
  if (typeof r.appliedAt !== "string" || Number.isNaN(Date.parse(r.appliedAt))) return "has no usable appliedAt time";
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

function readReceipt(root, id, dir = MIGRATIONS_DIR) {
  if (typeof id !== "string" || !MIGRATION_ID_RE.test(id)) refuse(`"${id}" is not a migration ID (NNNN-slug, for example 0100-instructions-<hash>)`);
  const rel = `${dir}/${id}.json`;
  const bytes = readPath(root, rel, `the receipt ${rel}`);
  if (bytes === null) {
    const applied = listReceiptIds(root, dir);
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
  const { rel, bytes, receipt } = readReceipt(root, id, receiptsDir(project));
  const migration = migrationById(id, project);
  if (!migration) refuse(`${id} is not a migration this runtime knows, so it cannot check what the receipt lists. Nothing was changed`);
  if (receipt.from !== migration.from || receipt.to !== migration.to) refuse(`the receipt ${rel} says layout ${receipt.from} to ${receipt.to}, but ${id} migrates layout ${migration.from} to ${migration.to}. Nothing was changed`);
  const listed = migration.paths ? new Set(migration.paths(project).map((p) => p.toLowerCase())) : null;
  const foreign = receipt.files.map((f) => f.path).filter((p) => (listed ? !listed.has(p.toLowerCase()) : !migration.allows(p, project)));
  if (foreign.length) refuse(`the receipt ${rel} lists ${foreign.join(", ")}, which ${id} never changes, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  const shape = migration.receiptProblem?.(receipt);
  if (shape) refuse(`the receipt ${rel} ${shape}, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  // The 0003-skilliton-names check for files added under .skilliton/ after the migration (which the restored earlier
  // .gitignore would no longer cover) moved with that migration's plan to scripts/legacy-migrate.mjs; migrationById
  // never resolves that ID here, so this function no longer reaches it for that migration.
  const later = laterReceipts(root, receiptsDir(project), receipt);
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
  const backupRel = `skilliton-backups/${receipt.backup}`;
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

// The receipts applied after this one, by their recorded times: an instructions refresh (0100-...) can come before or
// after a layout migration whatever their IDs. A receipt whose time cannot be read is listed too, since its order is
// unknown; one written before the rename is read only for its time.
function laterReceipts(root, dir, receipt) {
  const later = [];
  for (const other of listReceiptIds(root, dir)) {
    if (other === receipt.id) continue;
    let appliedAt = null;
    try { appliedAt = JSON.parse(readPath(root, `${dir}/${other}.json`).toString("utf8"))?.appliedAt; } catch (e) { if (!(e instanceof Refused) && !(e instanceof SyntaxError)) throw e; }
    let schema = null;
    try { schema = JSON.parse(readPath(root, `${dir}/${other}.json`).toString("utf8"))?.schema; } catch { schema = null; }
    // A receipt the earlier runtime wrote predates every receipt this runtime writes, whatever time it records.
    if (schema === LEGACY_RECEIPT_SCHEMA && receipt.schema === RECEIPT_SCHEMA) continue;
    if (typeof appliedAt !== "string" || Number.isNaN(Date.parse(appliedAt))) later.push(`${other} (its receipt has no readable time, so it may be later)`);
    else if (Date.parse(appliedAt) > Date.parse(receipt.appliedAt) || (Date.parse(appliedAt) === Date.parse(receipt.appliedAt) && other > receipt.id)) later.push(other);
  }
  return later;
}

export function applyRollback(plan, { root, gitDir }) {
  return applyChanges({ root, gitDir, command: "rollback", changes: plan.changes.map(({ path, before, after, mode }) => ({ path, before, after, mode })) });
}
