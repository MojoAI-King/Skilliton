// lib/auto-prepare.mjs: on a machine that has joined a company, a repository the session opens is prepared at session
// start, so nobody has to remember a per-repository step (owner decision, 2026-09-22: joining is the one thing a
// person does, once per machine; after that every repository they open is harnessed). It writes exactly what
// `prepare --apply` writes, through the same plan and the same transaction, and leaves the files uncommitted for the
// person's next commit. The session-start block then reports the prepared project, with one note saying what was
// written and why.
//
// It stays out of the way, and says so, when: the machine has not joined (the offer to prepare stands, as before);
// the join file said "prepare": "offer" (copied into the receipt); the repository carries an empty .skilliton-off
// file at its root; SKILLITON_AUTO_PREPARE=off is set for the session; or the project needs a migration first.
// Nothing here is silent: every one of those is a line in the block.
//
// A prepared project gets the same treatment for a pending instruction migration (the managed block in CLAUDE.md
// and AGENTS.md refreshed to the current template, with its receipt): applied at session start under the same
// conditions, left uncommitted, said in the block. A migration that moves files (a layout change) is not applied
// here; the block's migration line names the command.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NAME_RE, PLUGIN_ROOT, Refused, isPlainObject, readPluginVersion, selfCommand } from "./core.mjs";

// The join receipt's schema, as lib/join.mjs writes it. That module is loaded lazily below, because it reaches the
// release and migration engines, which the session-start hook must not depend on to print its block.
const JOIN_SCHEMA = "skilliton.join/1";

const OPT_OUT_FILE = ".skilliton-off";

// The opt-out that applies to a repository, or null: an empty .skilliton-off at its root, which travels with the
// repository, or a skilliton-off inside its Git folder, which never does (for a client's repository that must carry only
// the client's software). Every workflow hook reads it through here (commands/hook.mjs), and so does auto-prepare.
export function optOutFile(root, gitDirPath) {
  if (existsSync(join(root, OPT_OUT_FILE))) return { where: `${OPT_OUT_FILE} is present at the repository root` };
  if (existsSync(join(gitDirPath, OPT_OUT_FILE.slice(1)))) return { where: `${OPT_OUT_FILE.slice(1)} is present inside the Git folder` };
  return null;
}

const offFor = (value) => /^(off|0|false|no)$/i.test(String(value ?? "").trim());

// Every company that joined this machine, read leniently: { company, prepare } per receipt whose schema and company
// can be read. A receipt that cannot is skipped, because a session start must never be refused over a receipt; undo
// is where a receipt is validated in full.
async function joinedReceipts() {
  const { joinDir } = await import("./join.mjs");
  let names;
  try { names = readdirSync(joinDir()).filter((n) => n.endsWith(".json")).sort(); } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return [];
    throw e;
  }
  const out = [];
  for (const name of names) {
    let r;
    try { r = JSON.parse(readFileSync(join(joinDir(), name), "utf8")); } catch { continue; }
    if (!isPlainObject(r) || r.schema !== JOIN_SCHEMA || typeof r.company !== "string" || !NAME_RE.test(r.company)) continue;
    out.push({ company: r.company, prepare: r.prepare === "offer" ? "offer" : "auto" });
  }
  return out;
}

// Resolves null when nothing applies (the project is prepared, or the machine has not joined), else
// { note, prepared, skipOffer }: note for the block, prepared when files were written, skipOffer when the block's
// offer to prepare must not be made because the person chose otherwise.
export async function autoPrepare(root, { env = process.env } = {}) {
  // The prepare engine is loaded here, not at the top: a build missing one of its modules must cost one note in the
  // session-start block, never a hook that fails to load and prints nothing.
  const { NeedsMigration, OperationFailed, TransactionFailed, applyChanges, describeFailure, loadProject, planPrepare, resolveGitRoot } = await import("./prepare.mjs");
  let project;
  try { project = loadProject(root, { allowLegacy: true }); } catch (e) {
    if (e instanceof Refused) return { note: `Auto-prepare (not run): ${e.message}`, prepared: false, skipOffer: false };
    throw e;
  }
  const receipts = await joinedReceipts();
  if (!receipts.length) return null;
  const companies = receipts.map((r) => r.company).join(" and ");
  const prepared = project.layoutVersion !== null;
  // The session-start hook reads the opt-out before it calls this and then calls nothing; this stays for any other
  // caller, so auto-prepare never writes into a repository that opted out.
  const repo = resolveGitRoot(root);
  const optOut = optOutFile(root, repo.gitDir);
  if (optOut) {
    if (prepared) return null;
    return { note: `Not prepared on purpose: ${optOut.where}, so this repository is left as it is (delete that file to have it prepared at the next session start)`, prepared: false, skipOffer: true };
  }
  const auto = receipts.filter((r) => r.prepare !== "offer");
  if (!auto.length) {
    if (prepared) return null;
    return { note: `Not prepared, and auto-prepare is off for ${companies} (its join file said "offer"), so the offer below stands`, prepared: false, skipOffer: false };
  }
  if (offFor(env.SKILLITON_AUTO_PREPARE)) {
    if (prepared) return null;
    return { note: "Auto-prepare: off for this session (SKILLITON_AUTO_PREPARE), so the offer below stands", prepared: false, skipOffer: false };
  }
  const joined = auto.map((r) => r.company).join(" and ");
  if (prepared) return autoMigrate(root, project, { repo, joined, loadProject, OperationFailed, TransactionFailed, describeFailure });
  let plan;
  try { plan = await planPrepare(root, { runtimeVersion: readPluginVersion(PLUGIN_ROOT) }); } catch (e) {
    if (e instanceof NeedsMigration || e instanceof Refused || e instanceof OperationFailed) {
      return { note: `Auto-prepare (not run): ${e.message}`, prepared: false, skipOffer: false };
    }
    throw e;
  }
  if (!plan.changes.length) return null;
  try {
    const result = applyChanges({ root, gitDir: repo.gitDir, command: "prepare", changes: plan.changes });
    return {
      note: `Prepared just now (this machine joined ${joined}): ${result.written.length} file(s) written, uncommitted: the records, .skilliton/config.json, the managed block in CLAUDE.md and AGENTS.md, the security register. Commit them with your next commit; an empty ${OPT_OUT_FILE} at the root keeps a repository out.`,
      prepared: true,
      skipOffer: true,
    };
  } catch (e) {
    if (!(e instanceof TransactionFailed)) throw e;
    const failure = describeFailure("prepare", e);
    return { note: `Auto-prepare failed: ${failure.lines.join(" ")} To prepare by hand: ${selfCommand()} prepare --apply`, prepared: false, skipOffer: false };
  }
}

// A pending instruction migration, applied the way prepare is: one at a time, each through the migration engine's own
// plan and transaction, the receipt written beside it, everything left uncommitted. Resolves null when nothing is
// pending; a note when something was applied, could not be, or is a layout change that is not applied here.
async function autoMigrate(root, initial, { repo, joined, loadProject, OperationFailed, TransactionFailed, describeFailure }) {
  const { MIGRATIONS, applyMigration, migrationById, migrationState, planMigration } = await import("./migrations.mjs");
  const runtimeVersion = readPluginVersion(PLUGIN_ROOT);
  let project = initial;
  const applied = [];
  for (let guard = 0; guard <= MIGRATIONS.length; guard++) {
    const state = migrationState(project);
    if (!state.pending.length) break;
    const migration = migrationById(state.pending[0].id, project);
    if (migration.kind !== "instructions") {
      return { note: `Migration ${migration.id} is pending and moves files, so it is not applied at session start; preview it with: ${selfCommand()} migrate, then the same with --apply${applied.length ? ` (applied first: ${applied.join(", ")})` : ""}`, prepared: false, skipOffer: false };
    }
    let plan;
    try { plan = await planMigration(migration, project, { root, runtimeVersion }); } catch (e) {
      if (e instanceof Refused || e instanceof OperationFailed) return { note: `Migration ${migration.id} (not applied): ${e.message}`, prepared: false, skipOffer: false };
      throw e;
    }
    try { applyMigration(plan, { root, gitDir: repo.gitDir, runtimeVersion }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      return { note: `Migration ${migration.id} failed and was rolled back: ${describeFailure("migrate", e).lines.join(" ")} To apply it by hand: ${selfCommand()} migrate --apply`, prepared: false, skipOffer: false };
    }
    applied.push(migration.id);
    project = loadProject(root, { allowLegacy: true });
  }
  if (!applied.length) return null;
  return { note: `Migrated just now (this machine joined ${joined}): ${applied.join(", ")} applied; the managed block in CLAUDE.md and AGENTS.md follows the current template, the receipt is under .skilliton/migrations/ and the earlier text is in the backup, all uncommitted. Commit them with your next commit.`, prepared: false, skipOffer: false };
}
