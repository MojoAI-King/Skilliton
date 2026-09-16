// commands/migrate.mjs: `skillgate migrate`. The engine is lib/migrations.mjs; this file parses arguments, prints each
// migration's file changes (or one JSON result), and maps outcomes to exit codes (docs/CONTRACTS.md sections 6, 9, 10).

import {
  PLUGIN_ROOT, Refused, argPath, forDisplay, parseArgs, readPluginVersion, refuse, resolveExistingDir, say, selfCommand,
  tilde, unifiedDiff,
} from "../lib/core.mjs";
import { LAYOUT_VERSION } from "../lib/config.mjs";
import { MIGRATIONS, applyMigration, applyRollback, migrationState, planMigration, planRollback } from "../lib/migrations.mjs";
import { OperationFailed, TransactionFailed, describeFailure, loadProject, resolveGitRoot, resultJson, sha256 } from "../lib/prepare.mjs";

export const help = `migrate: show or apply this project's pending layout migrations, or roll one back.

  migrate [--dir <repo root>]                           show each pending migration's file changes; writes nothing
  migrate --apply [--dir <repo root>]                   apply the pending migrations in order
  migrate --rollback <id> [--dir <repo root>]           show what rolling back <id> would restore; writes nothing
  migrate --rollback <id> --apply [--dir <repo root>]   restore the files <id> changed and remove its receipt
  --json                                                print exactly one JSON result object instead of text

Migrations have IDs NNNN-slug and run in order. 0002-integrated-layout moves a project prepared by the standalone
prototype (layout 1) to layout 2: it removes .skillgate/bin/security-evidence.mjs only when its bytes match the
prototype runtime released at 23aae41, removes the skillgate:project blocks from CLAUDE.md, AGENTS.md and the maintain
record only when they are exactly what the prototype wrote, adds the harness blocks, and sets prepare.version 2 and
prepare.requires.workflow. Anything else (a changed runtime, a hand-edited block, a file that changes while the
migration is being written) is refused, and the refusal names the step that reconciles it.

Applying writes under .skillgate/prepare.lock, backs up every file it changes into <git folder>/skillgate-backups/<id>/
(local to this clone, never committed), and leaves a receipt in .skillgate/migrations/<id>.json listing each file's
sha256 before and after (commit the receipt). A rollback restores those backups only when every file still holds
exactly what the migration wrote; otherwise it lists the files that changed and writes nothing. Updating or rolling
back the plugin never reverses a project migration by itself.

Exit codes: 0 complete (nothing pending, applied, rolled back, or a rollback preview); 1 a migration is pending
(preview); 2 refused, nothing changed; 3 operation failed (the output says what was rolled back).`;

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

export async function run(argv) {
  const json = argv.includes("--json");
  const emit = (result, summary, details) => process.stdout.write(resultJson("migrate", result, summary, details) + "\n");
  const out = (line = "") => { if (!json) say(line); };
  let root = null, mode = "preview";
  try {
    const o = parseArgs(argv, { flags: ["apply", "json"], options: ["dir", "rollback"] }, "migrate");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`migrate takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} migrate --help`);
    mode = o.rollback ? (o.apply ? "rollback" : "rollback-preview") : o.apply ? "apply" : "preview";
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";
    const runtimeVersion = readPluginVersion(PLUGIN_ROOT);
    let project = loadProject(root);
    const state = migrationState(project);
    const title = { preview: "preview", apply: "apply", "rollback-preview": "rollback preview", rollback: "rollback" }[mode];
    out(`skillgate migrate (${title}): ${tilde(root)}`);

    // ----- rollback -----
    if (o.rollback) {
      const plan = planRollback(project, repo, o.rollback);
      const r = plan.receipt;
      const files = plan.changes.map((c) => ({
        path: c.path, action: c.action,
        what: c.path === plan.receiptRel ? "the receipt of this migration"
          : c.action === "delete" ? `did not exist before ${r.id}; removed`
          : c.action === "create" ? `deleted by ${r.id}; recreated from the backup (hash matches the receipt)`
          : `back to its content before ${r.id} (backup hash matches the receipt)`,
      }));
      const fileDetails = files.map((f) => ({ path: f.path, action: f.action, description: f.what }));
      out(`Rolling back ${r.id} (layout ${r.from} to ${r.to}, applied ${r.appliedAt ?? "at an unrecorded time"} by workflow ${r.runtime ?? "(version not recorded)"}):`);
      out("");
      if (mode === "rollback-preview") {
        for (const line of fileLines(files, false)) out(line);
        const summary = `every file still holds what ${r.id} wrote and every backup matches the receipt; nothing written. To roll back: ${selfCommand()} migrate --rollback ${r.id} --apply${dirArg}`;
        if (json) emit("complete", summary, { root, mode, id: r.id, state, files: fileDetails, written: false });
        out("");
        out(`Summary: ${summary}`);
        return 0;
      }
      let result;
      try { result = applyRollback(plan, repo); } catch (e) {
        if (!(e instanceof TransactionFailed)) throw e;
        const failure = describeFailure("migrate --rollback", e);
        if (json) { emit(failure.result, failure.lines.join(" "), { root, mode, id: r.id, files: fileDetails, rolledBack: e.restored, notRolledBack: e.kept, rollbackComplete: e.rollbackComplete }); return failure.exit; }
        for (const line of fileLines(files, false)) out(line);
        for (const line of failure.lines) console.error(line);
        return failure.exit;
      }
      const summary = `rolled back ${r.id}; the project is at layout ${r.from} again and the receipt was removed. Commit these changes to share the rollback.`;
      if (json) { emit("complete", summary, { root, mode, id: r.id, files: fileDetails, written: true, backup: result.backupDir ? { id: result.backupId, path: result.backupDir } : null }); return 0; }
      for (const line of fileLines(files, true)) out(line);
      out("");
      if (result.backupDir) out(`Backups of the files this rollback replaced: ${tilde(result.backupDir)} (inside the Git folder, never committed).`);
      out(`Summary: ${summary}`);
      return 0;
    }

    // ----- nothing pending -----
    const layout = project.layoutVersion === null ? "not prepared (no prepare.version)" : `layout ${project.layoutVersion}`;
    out(`Project: ${layout}; this runtime (workflow ${runtimeVersion ?? "(version unreadable)"}) writes layout ${LAYOUT_VERSION}. Pending: ${state.pending.length ? state.pending.map((p) => p.id).join(", ") : "none"}. Applied: ${state.applied.length ? state.applied.join(", ") : "none"}.`);
    if (!state.pending.length) {
      const summary = project.layoutVersion === null
        ? `this project has not been prepared, so there is nothing to migrate. To prepare it: ${selfCommand()} prepare${dirArg}`
        : `layout ${project.layoutVersion} is current; no migration is pending.`;
      if (json) emit("complete", summary, { root, mode, state, migrations: [], applied: [] });
      out("");
      out(`Summary: ${summary}`);
      return 0;
    }

    // ----- preview -----
    const describe = (plan) => ({
      id: plan.migration.id, from: plan.migration.from, to: plan.migration.to, summary: plan.migration.summary, notes: plan.notes,
      files: [...plan.files.map((f) => ({ path: f.path, action: f.action, description: f.what, beforeSha256: f.before ? sha256(f.before) : null, afterSha256: f.after ? sha256(f.after) : null })),
        { path: plan.receiptRel, action: "create", description: "the receipt of this migration", beforeSha256: null, afterSha256: null }],
    });
    const printPlan = (plan, past) => {
      out("");
      out(`${plan.migration.id} (layout ${plan.migration.from} to ${plan.migration.to}): ${plan.migration.summary}`);
      const files = [...plan.files, { path: plan.receiptRel, action: "create", what: "the receipt of this migration (commit it with the other changes)" }];
      for (const line of fileLines(files, past)) out(line);
      for (const note of plan.notes) out(`Note: ${note}`);
      const diffs = diffText(plan.files);
      if (diffs && !json) { out(""); process.stdout.write(diffs); }
    };
    if (mode === "preview") {
      const first = await planMigration(MIGRATIONS.find((m) => m.id === state.pending[0].id), project, { root, runtimeVersion });
      printPlan(first, false);
      if (state.pending.length > 1) out(`Then, planned from the result of the one before: ${state.pending.slice(1).map((p) => p.id).join(", ")}.`);
      const summary = `${state.pending.length} migration(s) pending (${state.pending.map((p) => p.id).join(", ")}); nothing written. To apply: ${selfCommand()} migrate --apply${dirArg}`;
      if (json) emit("attention", summary, { root, mode, state, migrations: [describe(first)], applied: [] });
      out("");
      out(`Summary: ${summary}`);
      return 1;
    }

    // ----- apply -----
    const applied = [], described = [];
    for (let guard = 0; guard < MIGRATIONS.length; guard++) {
      const current = migrationState(project);
      if (!current.pending.length) break;
      const migration = MIGRATIONS.find((m) => m.id === current.pending[0].id);
      const plan = await planMigration(migration, project, { root, runtimeVersion });
      described.push(describe(plan));
      printPlan(plan, false);
      let done;
      try { done = applyMigration(plan, { root, gitDir: repo.gitDir, runtimeVersion }); } catch (e) {
        if (!(e instanceof TransactionFailed)) throw e;
        const failure = describeFailure(`migrate (${migration.id})`, e);
        const before = applied.length ? ` Applied before it and kept: ${applied.map((a) => a.id).join(", ")}.` : "";
        if (json) { emit(failure.result, failure.lines.join(" ") + before, { root, mode, state, migrations: described, applied, rolledBack: e.restored, notRolledBack: e.kept, rollbackComplete: e.rollbackComplete }); return failure.exit; }
        for (const line of failure.lines) console.error(line);
        if (before) console.error(before.trim());
        return failure.exit;
      }
      applied.push({ id: migration.id, receipt: done.receiptRel, backup: done.result.backupDir ? { id: done.result.backupId, path: done.result.backupDir } : null });
      out(`Applied ${migration.id}. Receipt: ${done.receiptRel}.${done.result.backupDir ? ` Backups: ${tilde(done.result.backupDir)} (inside the Git folder, never committed).` : ""}`);
      const layoutBefore = project.layoutVersion;
      project = loadProject(root);
      if (project.layoutVersion === layoutBefore) throw new OperationFailed(`${migration.id} was written but prepare.version is still ${layoutBefore}; stopping instead of repeating it`);
    }
    const ids = applied.map((a) => a.id);
    const summary = `layout ${project.layoutVersion}; ${applied.length} migration(s) applied (${ids.join(", ")}). Commit the changed files together with the receipt(s). Next: ${selfCommand()} prepare --check${dirArg} shows anything else layout ${LAYOUT_VERSION} expects. To undo: ${selfCommand()} migrate --rollback ${ids.at(-1)} --apply${dirArg}`;
    if (json) { emit("complete", summary, { root, mode, state, migrations: described, applied }); return 0; }
    out("");
    out(`Summary: ${summary}`);
    return 0;
  } catch (e) {
    if (e instanceof OperationFailed) {
      if (json) emit("operation-failed", e.message, { root, mode });
      else console.error(`skillgate: migrate could not run: ${e.message}`);
      return 3;
    }
    if (json && e instanceof Refused) { emit("invalid", e.message, { root, mode }); return 2; }
    if (json) {
      if (process.env.SKILLGATE_DEBUG) console.error(e?.stack);
      emit("operation-failed", `unexpected internal error: ${e?.message ?? e}. This is a bug in skillgate.`, { root, mode });
      return 3;
    }
    throw e;
  }
}
