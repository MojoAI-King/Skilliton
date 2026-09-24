#!/usr/bin/env node
// legacy-migrate.mjs: the one-shot migrator for a project prepared before workflow 1.0.0.
//
// SUPPORT CUT-OFF: this script plans and applies exactly two migrations, 0002-integrated-layout (the standalone
// prototype layout, layout 1, to the integrated layout, layout 2) and 0003-skilliton-names (layout 2, still under the
// earlier product name, to layout 3, the Skilliton names). A project prepared before 1.0.0 runs this once, by hand,
// before it ever runs `skilliton migrate`; a project already at layout 3 has nothing here to do. skilliton migrate
// itself no longer plans these two: it refuses a project still below its target layout and names this script as the
// exact command to run.
//
// Usage:
//   node scripts/legacy-migrate.mjs [--dir <repo root>]                         preview; writes nothing
//   node scripts/legacy-migrate.mjs --apply [--dir <repo root>]                 apply the pending one(s) in order
//   node scripts/legacy-migrate.mjs --rollback <id> [--dir <repo root>]         preview a rollback; writes nothing
//   node scripts/legacy-migrate.mjs --rollback <id> --apply [--dir <repo root>] roll one back
//
// It shares the preview-then-apply contract and the receipt shape with skilliton migrate (planMigration and
// applyMigration below are that runtime's own, imported, not copied), so a receipt this script writes is one
// skilliton migrate later reads as applied: a project at layout 3 with these two receipts committed shows nothing
// pending. What each migration checks and changes (plan0002, plan0003) is in legacy-migrate-plans.mjs, split out so
// this file, the CLI and the rollback engine, stays under the same line ceiling every script here holds to.

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PLUGIN_ROOT, Refused, argPath, isPlainObject, parseArgs, readPluginVersion, refuse, resolveExistingDir, say,
  tilde, unifiedDiff, forDisplay,
} from "../packs/base/plugins/workflow/runtime/lib/core.mjs";
import { PROJECT_DIR, validRelPath } from "../packs/base/plugins/workflow/runtime/lib/config.mjs";
import {
  OperationFailed, TransactionFailed, describeFailure, inspectFolder, loadProject, readPath, resolveGitRoot, sha256,
} from "../packs/base/plugins/workflow/runtime/lib/prepare.mjs";
import { MIGRATIONS_DIR } from "../packs/base/plugins/workflow/runtime/lib/project-files.mjs";
import { LEGACY_MIGRATIONS_DIR, LEGACY_NAME, LEGACY_PROJECT_DIR, LEGACY_RECEIPT_SCHEMA } from "../packs/base/plugins/workflow/runtime/lib/legacy-names.mjs";
import { MIGRATION_ID_RE, applyMigration, applyRollback, planMigration } from "../packs/base/plugins/workflow/runtime/lib/migrations.mjs";
import { ID_0002, ID_0003, MIGRATIONS, RECEIPT_SCHEMA } from "./legacy-migrate-plans.mjs";

const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

// Where a project keeps its migration receipts: layouts 1 and 2 under the earlier names, layout 3 under .skilliton/.
const receiptsDir = (project) => (project.legacyNames ? LEGACY_MIGRATIONS_DIR : MIGRATIONS_DIR);
// The path a 0003 rollback restores a moved file to, and whether a path falls under a folder; both duplicated (one
// line each) from legacy-migrate-plans.mjs's own copies, only for the 0003 rollback special case below.
const toCurrent = (rel) => `${PROJECT_DIR}${rel.slice(LEGACY_PROJECT_DIR.length)}`;
const underFolder = (rel, dir) => rel.toLowerCase().startsWith(`${dir.toLowerCase()}/`);

const migrationById = (id) => MIGRATIONS.find((m) => m.id === id) ?? null;

// A project below layout 3 that is not exactly layout 1 or 2 (should not happen) is treated as nothing pending here;
// the pending list is always a prefix of [ID_0002, ID_0003] in order.
function pendingIds(project) {
  if (project.layoutVersion === null) return null;
  if (project.layoutVersion >= 3) return [];
  return project.layoutVersion === 1 ? [ID_0002, ID_0003] : [ID_0003];
}

// ---------- rollback ----------

function listReceiptIds(root, dir) {
  const folder = inspectFolder(root, dir, "the migration receipts folder");
  if (!folder.exists) return [];
  return readdirSync(folder.abs).filter((n) => n.endsWith(".json") && MIGRATION_ID_RE.test(n.slice(0, -5))).map((n) => n.slice(0, -5)).sort();
}

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

function readReceipt(root, id, dir) {
  if (typeof id !== "string" || (id !== ID_0002 && id !== ID_0003)) refuse(`"${id}" is not a migration this script knows; the only IDs it plans are ${ID_0002} and ${ID_0003}`);
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

// The receipts applied after this one, by their recorded times. A receipt whose time cannot be read is listed too,
// since its order is unknown; one written before the rename is read only for its time.
function laterReceipts(root, dir, receipt) {
  const later = [];
  for (const other of listReceiptIds(root, dir)) {
    if (other === receipt.id) continue;
    let appliedAt = null;
    try { appliedAt = JSON.parse(readPath(root, `${dir}/${other}.json`).toString("utf8"))?.appliedAt; } catch (e) { if (!(e instanceof Refused) && !(e instanceof SyntaxError)) throw e; }
    let schema = null;
    try { schema = JSON.parse(readPath(root, `${dir}/${other}.json`).toString("utf8"))?.schema; } catch { schema = null; }
    if (schema === LEGACY_RECEIPT_SCHEMA && receipt.schema === RECEIPT_SCHEMA) continue;
    if (typeof appliedAt !== "string" || Number.isNaN(Date.parse(appliedAt))) later.push(`${other} (its receipt has no readable time, so it may be later)`);
    else if (Date.parse(appliedAt) > Date.parse(receipt.appliedAt) || (Date.parse(appliedAt) === Date.parse(receipt.appliedAt) && other > receipt.id)) later.push(other);
  }
  return later;
}

// What rolling back id would write: { receipt, receiptRel, changes }. Refused when a later migration is applied, when
// any file no longer holds exactly what the migration wrote, or when a backup is missing or does not match.
function planRollback(project, { root, gitDir }, id) {
  const { rel, bytes, receipt } = readReceipt(root, id, receiptsDir(project));
  const migration = migrationById(id);
  if (!migration) refuse(`${id} is not a migration this script knows. Nothing was changed`);
  if (receipt.from !== migration.from || receipt.to !== migration.to) refuse(`the receipt ${rel} says layout ${receipt.from} to ${receipt.to}, but ${id} migrates layout ${migration.from} to ${migration.to}. Nothing was changed`);
  const listed = migration.paths ? new Set(migration.paths(project).map((p) => p.toLowerCase())) : null;
  const foreign = receipt.files.map((f) => f.path).filter((p) => (listed ? !listed.has(p.toLowerCase()) : !migration.allows(p, project)));
  if (foreign.length) refuse(`the receipt ${rel} lists ${foreign.join(", ")}, which ${id} never changes, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  const shape = migration.receiptProblem?.(receipt);
  if (shape) refuse(`the receipt ${rel} ${shape}, so the receipt was edited after the migration wrote it. Nothing was changed; restore the receipt from Git history before rolling back`);
  if (id === ID_0003) {
    // Files added under .skilliton/ after the migration would be left behind with no ignore line for them once the
    // earlier .gitignore is back, so private evidence written since could be committed.
    const created = new Set([...receipt.files.filter((f) => f.action === "create").map((f) => f.path), rel]);
    const extra = [];
    const walk = (dir) => {
      const folder = inspectFolder(root, dir, `the ${dir} folder`);
      if (!folder.exists) return;
      for (const name of readdirSync(folder.abs).sort()) {
        const child = `${dir}/${name}`;
        const st = lstatSync(join(root, ...child.split("/")));
        if (st.isDirectory() && !st.isSymbolicLink()) walk(child);
        else if (!created.has(child)) extra.push(child);
      }
    };
    walk(PROJECT_DIR);
    if (extra.length) refuse(`rollback of ${id} refused: ${extra.length} file(s) were added under ${PROJECT_DIR}/ after the migration (${extra.slice(0, 5).join(", ")}${extra.length > 5 ? ", ..." : ""}), and the rollback would leave them where the restored .gitignore no longer covers them. Nothing was changed. Move them out of the project (or delete them), then roll back again`);
  }
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
    // A file 0003 moved comes back with the permissions of its moved copy.
    let mode;
    if (action === "create" && id === ID_0003 && underFolder(f.path, LEGACY_PROJECT_DIR)) {
      try { mode = lstatSync(join(root, ...toCurrent(f.path).split("/"))).mode & 0o777; } catch { mode = undefined; }
    }
    changes.push({ path: f.path, before: now.get(f.path), after: restore, action, ...(mode === undefined ? {} : { mode }) });
  }
  changes.push({ path: rel, before: bytes, after: null, action: "delete" });
  return { receipt, receiptRel: rel, changes };
}

// applyRollback (imported above) is the runtime's own, unchanged: it only replays plan.changes through applyChanges.

// ---------- CLI ----------

export const help = `legacy-migrate: the one-shot migrator for a project prepared before workflow 1.0.0.

  node scripts/legacy-migrate.mjs [--dir <repo root>]                         preview; writes nothing
  node scripts/legacy-migrate.mjs --apply [--dir <repo root>]                 apply the pending migration(s) in order
  node scripts/legacy-migrate.mjs --rollback <id> [--dir <repo root>]         preview a rollback; writes nothing
  node scripts/legacy-migrate.mjs --rollback <id> --apply [--dir <repo root>] roll one back

Plans exactly two migrations, in order: 0002-integrated-layout (the standalone prototype layout, layout 1, to the
integrated layout, layout 2) and 0003-skilliton-names (layout 2, still under the earlier ${LEGACY_NAME} names, to
layout 3, the Skilliton names). A project already at layout 3 has nothing here to do; skilliton migrate plans what
comes after. Run this once, before skilliton migrate ever sees the project.

It shares the receipt shape skilliton migrate uses (schema ${RECEIPT_SCHEMA}), the same prepare.mjs lock, the same
Git-private backups under <git folder>/skilliton-backups/<id>/, and the same rollback contract: a rollback restores
those backups only when every file still holds exactly what the migration wrote.

Exit codes: 0 complete (nothing pending, applied, rolled back, or a rollback preview); 1 a migration is pending
(preview); 2 refused, nothing changed; 3 operation failed.`;

const VERBS = { create: ["create", "created"], update: ["update", "updated"], delete: ["delete", "deleted"], restore: ["restore", "restored"] };

function fileLines(files, past) {
  const width = Math.min(52, Math.max(...files.map((f) => f.path.length)));
  return files.map((f) => `  ${VERBS[f.action][past ? 1 : 0].padEnd(8)} ${f.path.padEnd(width)}  ${f.what}`);
}

function diffText(files) {
  return files.filter((f) => f.diff).map((f) => unifiedDiff(
    f.before === null ? "" : forDisplay(f.before.toString("latin1")),
    f.after === null ? "" : forDisplay(f.after.toString("latin1")),
    f.before === null ? "/dev/null" : `a/${f.path}`,
    f.after === null ? "/dev/null" : `b/${f.path}`,
  )).filter(Boolean).join("");
}

function printPlan(plan, past) {
  say("");
  say(`${plan.migration.id} (layout ${plan.migration.from} to ${plan.migration.to}): ${plan.migration.summary}`);
  const files = [...plan.files, { path: plan.receiptRel, action: "create", what: "the receipt of this migration (commit it with the other changes)" }];
  for (const line of fileLines(files, past)) say(line);
  for (const note of plan.notes) say(`Note: ${note}`);
  const diffs = diffText(plan.files);
  if (diffs) { say(""); process.stdout.write(diffs); }
}

function runRollback(project, repo, rollbackId, apply, dirArg) {
  const plan = planRollback(project, repo, rollbackId);
  const r = plan.receipt;
  const files = plan.changes.map((c) => ({
    path: c.path, action: c.action,
    what: c.path === plan.receiptRel ? "the receipt of this migration"
      : c.action === "delete" ? `did not exist before ${r.id}; removed`
      : c.action === "create" ? `deleted by ${r.id}; recreated from the backup (hash matches the receipt)`
      : `back to its content before ${r.id} (backup hash matches the receipt)`,
  }));
  say(`Rolling back ${r.id} (layout ${r.from} to ${r.to}, applied ${r.appliedAt ?? "at an unrecorded time"} by workflow ${r.runtime ?? "(version not recorded)"}):`);
  say("");
  if (!apply) {
    for (const line of fileLines(files, false)) say(line);
    say("");
    say(`Summary: every file still holds what ${r.id} wrote and every backup matches the receipt; nothing written. To roll back: node scripts/legacy-migrate.mjs --dir ${argPath(repo.root)} --rollback ${r.id} --apply`);
    return 0;
  }
  let result;
  try { result = applyRollback(plan, repo); } catch (e) {
    if (!(e instanceof TransactionFailed)) throw e;
    const failure = describeFailure("legacy-migrate --rollback", e);
    for (const line of fileLines(files, false)) say(line);
    for (const line of failure.lines) console.error(line);
    return failure.exit;
  }
  for (const line of fileLines(files, true)) say(line);
  say("");
  if (result.backupDir) say(`Backups of the files this rollback replaced: ${tilde(result.backupDir)} (inside the Git folder, never committed).`);
  say(`Summary: rolled back ${r.id}; the project is at layout ${r.from} again and the receipt was removed. Commit these changes to share the rollback.${dirArg}`);
  return 0;
}

async function reportPreview(project, pending, ctx) {
  const first = await planMigration(migrationById(pending[0]), project, ctx);
  printPlan(first, false);
  if (pending.length > 1) say(`Then, planned from the result of the one before: ${pending.slice(1).join(", ")}.`);
  say("");
  say(`Summary: ${pending.length} migration(s) pending (${pending.join(", ")}); nothing written. To apply: node scripts/legacy-migrate.mjs --dir ${argPath(ctx.root)} --apply`);
  return 1;
}

async function applyPending(project, pending, repo, ctx) {
  let current = project;
  const applied = [];
  for (let guard = 0; guard < pending.length; guard++) {
    const state = pendingIds(current);
    if (!state || !state.length) break;
    const migration = migrationById(state[0]);
    const plan = await planMigration(migration, current, ctx);
    printPlan(plan, false);
    let done;
    try { done = applyMigration(plan, { root: ctx.root, gitDir: repo.gitDir, runtimeVersion: ctx.runtimeVersion }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      const failure = describeFailure(`legacy-migrate (${migration.id})`, e);
      for (const line of failure.lines) console.error(line);
      if (applied.length) console.error(`Applied before it and kept: ${applied.join(", ")}.`);
      return failure.exit;
    }
    applied.push(migration.id);
    say(`Applied ${migration.id}. Receipt: ${done.receiptRel}.${done.result.backupDir ? ` Backups: ${tilde(done.result.backupDir)} (inside the Git folder, never committed).` : ""}`);
    current = loadProject(ctx.root, { allowLegacy: true });
  }
  say("");
  say(`Summary: layout ${current.layoutVersion}; ${applied.length} migration(s) applied (${applied.join(", ")}). Commit the changed files together with the receipt(s). Next: skilliton migrate --dir ${argPath(ctx.root)} shows anything else current expects. To undo: node scripts/legacy-migrate.mjs --dir ${argPath(ctx.root)} --rollback ${applied.at(-1)} --apply`);
  return 0;
}

export async function run(argv) {
  let root = null;
  try {
    const o = parseArgs(argv, { flags: ["apply"], options: ["dir", "rollback"] }, "legacy-migrate");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`legacy-migrate takes no plain arguments (got "${o._[0]}"); see: node scripts/legacy-migrate.mjs --help`);
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";
    const runtimeVersion = readPluginVersion(PLUGIN_ROOT);
    const project = loadProject(root, { allowLegacy: true });
    say(`legacy-migrate (${o.rollback ? (o.apply ? "rollback" : "rollback preview") : o.apply ? "apply" : "preview"}): ${tilde(root)}`);

    if (o.rollback) return runRollback(project, repo, o.rollback, o.apply, dirArg);

    const layout = project.layoutVersion === null ? "not prepared (no prepare.version)" : `layout ${project.layoutVersion}`;
    const pending = pendingIds(project);
    say(`Project: ${layout}. This script plans: ${ID_0002}, ${ID_0003}.`);
    if (pending === null) {
      say("");
      say(`Summary: this project has not been prepared, so there is nothing for this script to do. Prepare it first: skilliton prepare${dirArg}`);
      return 0;
    }
    if (!pending.length) {
      say("");
      say(`Summary: layout ${project.layoutVersion} is current; nothing for this script to do. skilliton migrate${dirArg} shows what (if anything) that runtime plans next.`);
      return 0;
    }
    if (!o.apply) return await reportPreview(project, pending, { root, runtimeVersion });
    return await applyPending(project, pending, repo, { root, runtimeVersion });
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`legacy-migrate: could not run: ${e.message}`); return 3; }
    if (e instanceof Refused) { console.error(`legacy-migrate: refused: ${e.message}`); return 2; }
    if (process.env.SKILLITON_DEBUG) console.error(e?.stack);
    console.error(`legacy-migrate: unexpected internal error: ${e?.message ?? e}. This is a bug in skilliton.`);
    return 3;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run(process.argv.slice(2));
}
