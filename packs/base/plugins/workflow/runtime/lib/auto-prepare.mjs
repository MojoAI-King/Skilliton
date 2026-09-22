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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NAME_RE, PLUGIN_ROOT, Refused, isPlainObject, readPluginVersion, selfCommand } from "./core.mjs";

// The join receipt's schema, as lib/join.mjs writes it. That module is loaded lazily below, because it reaches the
// release and migration engines, which the session-start hook must not depend on to print its block.
const JOIN_SCHEMA = "skilliton.join/1";

const OPT_OUT_FILE = ".skilliton-off";

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
  if (project.layoutVersion !== null) return null;
  const receipts = await joinedReceipts();
  if (!receipts.length) return null;
  const companies = receipts.map((r) => r.company).join(" and ");
  // Two places for the opt-out: a file at the root, which travels with the repository, or one inside the Git folder,
  // which never does (for a client's repository that must carry only the client's software).
  const repo = resolveGitRoot(root);
  const optOut = [join(root, OPT_OUT_FILE), join(repo.gitDir, OPT_OUT_FILE.slice(1))].find((p) => existsSync(p));
  if (optOut) {
    const where = optOut.startsWith(repo.gitDir) ? `${OPT_OUT_FILE.slice(1)} is present inside the Git folder` : `${OPT_OUT_FILE} is present at the repository root`;
    return { note: `Not prepared on purpose: ${where}, so this repository is left as it is (delete that file to have it prepared at the next session start)`, prepared: false, skipOffer: true };
  }
  const auto = receipts.filter((r) => r.prepare !== "offer");
  if (!auto.length) {
    return { note: `Not prepared, and auto-prepare is off for ${companies} (its join file said "offer"), so the offer below stands`, prepared: false, skipOffer: false };
  }
  if (offFor(env.SKILLITON_AUTO_PREPARE)) {
    return { note: "Auto-prepare: off for this session (SKILLITON_AUTO_PREPARE), so the offer below stands", prepared: false, skipOffer: false };
  }
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
      note: `Prepared just now (this machine joined ${auto.map((r) => r.company).join(" and ")}): ${result.written.length} file(s) written, uncommitted: the records, .skilliton/config.json, the managed block in CLAUDE.md and AGENTS.md, the security register. Commit them with your next commit; an empty ${OPT_OUT_FILE} at the root keeps a repository out.`,
      prepared: true,
      skipOffer: true,
    };
  } catch (e) {
    if (!(e instanceof TransactionFailed)) throw e;
    const failure = describeFailure("prepare", e);
    return { note: `Auto-prepare failed: ${failure.lines.join(" ")} To prepare by hand: ${selfCommand()} prepare --apply`, prepared: false, skipOffer: false };
  }
}
