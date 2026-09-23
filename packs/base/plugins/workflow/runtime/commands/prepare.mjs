// commands/prepare.mjs: `skilliton prepare`. The engine is lib/prepare.mjs; this file parses arguments, prints the
// plan in plain language (or one JSON result), and maps outcomes to exit codes (docs/CONTRACTS.md sections 6, 9, 10).

import { PLUGIN_ROOT, Refused, argPath, parseArgs, readPluginVersion, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { LAYOUT_VERSION } from "../lib/config.mjs";
import { NeedsMigration, OperationFailed, TransactionFailed, applyChanges, describeFailure, planPrepare, resolveGitRoot, resultJson } from "../lib/prepare.mjs";

export const help = `prepare: adopt a Git repository's existing records and add what a prepared Skilliton project (layout ${LAYOUT_VERSION}) needs.

  prepare [--dir <repo root>]           show the plan (create, adopt or update, for each file); writes nothing
  prepare --apply [--dir <repo root>]   write the plan
  prepare --check [--dir <repo root>]   read only; exit 1 when anything is missing or outdated
  --json                                print exactly one JSON result object on stdout instead of text

A prepared project gets:
  - its records: status, backlog and completed archive, roadmap, decisions, lessons, handoff and archive, and a
    maintenance checklist. Each existing record is adopted and never modified (conventional paths, or the paths in
    prepare.artifacts); each missing one is created, saying "not yet assessed".
  - entry folders for tasks, decisions and lessons, each with a README explaining the entry format
  - .skilliton/config.json with every existing key kept, and prepare.version ${LAYOUT_VERSION}, the record map, the entry folders,
    the minimum workflow version (prepare.requires.workflow) and handoff.file set
  - the security catalog shipped with this package, only when the project has none (an existing one is kept), and
    README files pointing at "skilliton security status"
  - the harness block in CLAUDE.md and AGENTS.md, the same block "harness --apply" writes; text outside it is kept
  - two .gitignore lines, for the lock file and .skilliton/private-evidence/
  - drafts, read from what the repository shows and never run: dispatch.laneTestCommand from the build files
    (package.json scripts, pytest, go.mod, Cargo.toml, Makefile), dispatch.laneRoot from the folder name,
    dispatch.hotspots from the last 200 commits (once there are 10 or more), and, when a test command was detected,
    .skilliton/delivery.draft.json with that one check; "skilliton delivery confirm --apply" turns the draft into
    the policy. A dispatch value already set is kept. When nothing is detected the plan says so.

--apply shows the plan first, then takes .skilliton/prepare.lock, rechecks each file immediately before replacing it, backs up every file it
changes into <git folder>/skilliton-backups/<id>/ (never committed), and on a failure rolls back what it wrote,
except a file someone else changed meanwhile, which is kept and named. Repeating --apply on a prepared project
changes nothing. A project prepared by the standalone prototype (layout 1) is refused: run migrate instead.

Exit codes: 0 complete (for --check: nothing missing or outdated; a draft counts as neither); 1 --check found something missing or outdated, or
a layout-1 project waits for its migration; 2 refused, nothing written; 3 operation failed (the output says what was
rolled back).`;

const VERBS = { create: ["create", "created"], update: ["update", "updated"], adopt: ["adopt", "adopted"], current: ["current", "current"], migrate: ["migrate", "migrate"], draft: ["draft", "drafted"] };

function printItems(items, past) {
  const width = Math.min(44, Math.max(...items.map((i) => i.path.length)));
  for (const i of items) say(`  ${VERBS[i.action][past ? 1 : 0].padEnd(8)} ${i.path.padEnd(width)}  ${i.what}`);
}

export async function run(argv) {
  const json = argv.includes("--json");
  const emit = (result, summary, details) => process.stdout.write(resultJson("prepare", result, summary, details) + "\n");
  let root = null, mode = "preview";
  try {
    const o = parseArgs(argv, { flags: ["apply", "check", "json"], options: ["dir"] }, "prepare");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`prepare takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} prepare --help`);
    if (o.apply && o.check) refuse("use --apply or --check, not both");
    mode = o.apply ? "apply" : o.check ? "check" : "preview";
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";

    let plan;
    try { plan = await planPrepare(root, { runtimeVersion: readPluginVersion(PLUGIN_ROOT) }); } catch (e) {
      if (!(e instanceof NeedsMigration) || mode !== "check") throw e;
      if (json) emit("attention", e.message, { root, mode, layoutVersion: e.layoutVersion ?? null, targetLayout: LAYOUT_VERSION, pendingMigration: true });
      else { say(`skilliton prepare (check): ${tilde(root)}`); say(`Summary: setup incomplete: ${e.message}`); }
      return 1;
    }
    const count = (action) => plan.items.filter((i) => i.action === action).length;
    const counts = { create: count("create"), update: count("update"), adopt: count("adopt"), current: count("current"), migrate: count("migrate"), draft: count("draft") };
    const details = (extra = {}) => ({
      root, mode, layoutVersion: plan.project.layoutVersion, targetLayout: LAYOUT_VERSION, runtime: plan.runtimeVersion,
      files: plan.items.map((i) => ({ path: i.path, action: i.action, description: i.what })), notes: plan.notes, written: false, backup: null, ...extra,
    });
    const layout = plan.project.layoutVersion === null ? "not prepared yet (no prepare.version)" : `layout ${plan.project.layoutVersion}`;
    const header = () => {
      say(`skilliton prepare (${mode}): ${tilde(root)}`);
      say(`Project: ${layout}; this runtime (workflow ${plan.runtimeVersion}) writes layout ${LAYOUT_VERSION}.`);
      say("");
    };
    const printNotes = () => { if (plan.notes.length) { say(""); for (const n of plan.notes) say(`Note: ${n}`); } };
    const tally = `${counts.create} to create, ${counts.update} to update, ${counts.adopt} adopted as they are, ${counts.current} already current, ${counts.draft} drafted`;

    if (mode === "preview" || mode === "check") {
      const incomplete = mode === "check" ? counts.create + counts.update + counts.migrate > 0 : plan.changes.length > 0 || counts.migrate > 0;
      const migrateNote = counts.migrate ? `; ${counts.migrate} instruction block(s) wait for: ${selfCommand()} migrate${dirArg}` : "";
      let summary;
      if (mode === "preview") summary = plan.changes.length ? `${tally}${migrateNote}; nothing written. To write it: ${selfCommand()} prepare --apply${dirArg}` : counts.migrate ? `nothing for prepare to write${migrateNote}` : `the project is prepared (layout ${LAYOUT_VERSION}); nothing to change, nothing written.`;
      else summary = incomplete ? `setup incomplete: ${counts.create} missing, ${counts.update} outdated${migrateNote}; nothing written.${plan.changes.length ? ` To fix it: ${selfCommand()} prepare --apply${dirArg}` : ""}` : `prepared (layout ${LAYOUT_VERSION}); nothing missing or outdated${counts.draft ? ` (${counts.draft} draft(s) wait for: ${selfCommand()} prepare --apply${dirArg}; a draft is never missing)` : ""}. This checks the prepared files only, not security evidence or application behavior.`;
      if (json) { emit(mode === "check" && incomplete ? "attention" : "complete", summary, details()); return mode === "check" && incomplete ? 1 : 0; }
      header();
      printItems(plan.items, false);
      printNotes();
      say("");
      say(`Summary: ${summary}`);
      return mode === "check" && incomplete ? 1 : 0;
    }

    if (!plan.changes.length) {
      const summary = `already prepared (layout ${LAYOUT_VERSION}); nothing to change, nothing written (${counts.adopt} adopted as they are, ${counts.current} already current).`;
      if (json) { emit("complete", summary, details()); return 0; }
      header();
      printItems(plan.items, true);
      printNotes();
      say("");
      say(`Summary: ${summary}`);
      return 0;
    }

    // The plan is shown before anything is written, so the person sees what --apply is about to do even when it fails.
    if (!json) { header(); printItems(plan.items, false); say(""); say(`Writing ${plan.changes.length} file(s) ...`); say(""); }
    let result;
    try { result = applyChanges({ root, gitDir: repo.gitDir, command: "prepare", changes: plan.changes }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      const failure = describeFailure("prepare", e);
      if (json) { emit(failure.result, failure.lines.join(" "), details({ written: e.written.length > 0, rolledBack: e.restored, notRolledBack: e.kept, rollbackComplete: e.rollbackComplete, backup: e.backupDir ? { path: e.backupDir } : null })); return failure.exit; }
      for (const line of failure.lines) console.error(line);
      return failure.exit;
    }
    const summary = `prepared (layout ${LAYOUT_VERSION}): ${counts.create} created, ${counts.update} updated, ${counts.adopt} adopted as they were, ${counts.current} already current, ${counts.draft} drafted. Created records say "not yet assessed" until a person fills them in, and security evidence starts missing (${selfCommand()} security status).${counts.draft ? ` A draft is what prepare read from the repository; review it before relying on it.` : ""}`;
    if (json) { emit("complete", summary, details({ written: true, backup: result.backupDir ? { id: result.backupId, path: result.backupDir } : null })); return 0; }
    say("Written:");
    printItems(plan.items, true);
    printNotes();
    say("");
    if (result.backupDir) say(`Backups of the files this run replaced: ${tilde(result.backupDir)} (inside the Git folder, never committed).`);
    say(`Summary: ${summary}`);
    return 0;
  } catch (e) {
    if (e instanceof OperationFailed) {
      if (json) emit("operation-failed", e.message, { root, mode });
      else console.error(`skilliton: prepare could not run: ${e.message}`);
      return 3;
    }
    if (json && e instanceof Refused) { emit("invalid", e.message, { root, mode }); return 2; }
    if (json) {
      if (process.env.SKILLITON_DEBUG) console.error(e?.stack);
      emit("operation-failed", `unexpected internal error: ${e?.message ?? e}. This is a bug in skilliton; the output does not show anything written.`, { root, mode });
      return 3;
    }
    throw e;
  }
}
