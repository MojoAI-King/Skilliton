// commands/remove.mjs: `skillgate remove` (docs/CONTRACTS.md section 10). Takes out what Skillgate manages in a
// project (the harness blocks, the generated security report, and with --config the configuration) and keeps every
// record, entry, observation and receipt, saying so. Writes go through lib/prepare.mjs applyChanges.

import { readdirSync } from "node:fs";
import { HARNESS_FILES, argPath, parseArgs, planHarnessFile, refuse, resolveExistingDir, say, selfCommand, tilde } from "../lib/core.mjs";
import { CONFIG_REL, ROLES } from "../lib/config.mjs";
import { OperationFailed, TransactionFailed, applyChanges, describeFailure, inspectFolder, inspectPath, loadProject, readPath, resolveGitRoot } from "../lib/prepare.mjs";
import { CATALOG_REL, MIGRATIONS_DIR, REPORT_MARKER, REPORT_REL, ROLE_LABELS } from "../lib/project-files.mjs";

export const help = `remove: take Skillgate's managed content out of a project, keeping its records and history.

  remove [--dir <repo root>]                    show what would be removed and what is kept; writes nothing
  remove --apply [--dir <repo root>]            remove it
  remove --apply --config [--dir <repo root>]   also delete .skillgate/config.json

Removes the harness block from CLAUDE.md and AGENTS.md (with one blank line next to it; the rest of each file stays
byte for byte), and .skillgate/security/REPORT.md when its first line is the generated-report marker (a report
without the marker may be a person's work and is kept). With --config, also .skillgate/config.json.

Keeps every record, every task, decision and lesson entry, the security catalog, applicability decisions and
observation records, the migration receipts, the .gitignore lines and the Git history.

--apply takes .skillgate/prepare.lock and backs up every file it changes into <git folder>/skillgate-backups/<id>/.
A layout-1 project (prepared by the standalone prototype) is refused: migrate it first.

Exit codes: 0 complete; 2 refused, nothing written; 3 operation failed (the output says what was rolled back).`;

const VERBS = { update: ["update", "updated"], delete: ["delete", "deleted"], keep: ["keep", "kept"], none: ["none", "none"] };

function countFiles(root, rel, filter) {
  const folder = inspectFolder(root, rel);
  if (!folder.exists) return 0;
  return readdirSync(folder.abs, { withFileTypes: true }).filter((d) => d.isFile() && filter(d.name)).length;
}

export async function run(argv) {
  try {
    const o = parseArgs(argv, { flags: ["apply", "config"], options: ["dir"] }, "remove");
    if (o.help) { say(help); return 0; }
    if (o._.length) refuse(`remove takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} remove --help`);
    const repo = resolveGitRoot(resolveExistingDir(o.dir, "--dir"));
    const root = repo.root;
    const dirArg = o.dir ? ` --dir ${argPath(root)}` : "";
    const project = loadProject(root);
    if (project.layoutVersion === 1) {
      refuse(`this project uses layout 1 (the standalone prototype), whose copied runtime and skillgate:project blocks remove does not handle. Migrate it first: ${selfCommand()} migrate --dir ${argPath(root)}, then run remove again. Nothing was written`);
    }

    const items = [];
    for (const name of HARNESS_FILES) {
      const info = inspectPath(root, name);
      if (!info.exists) { items.push({ path: name, action: "none", what: "does not exist; nothing to remove" }); continue; }
      const plan = planHarnessFile(root, name, null, true);
      if (!plan.changed) { items.push({ path: name, action: "none", what: plan.summary }); continue; }
      const empty = plan.next === "" ? `; the file is then empty (delete it by hand if nothing else belongs there)` : "";
      items.push({ path: name, action: "update", what: `${plan.summary}${empty}`, before: Buffer.from(plan.text, "latin1"), after: Buffer.from(plan.next, "latin1") });
    }
    const report = readPath(root, REPORT_REL, "the security report");
    if (report === null) items.push({ path: REPORT_REL, action: "none", what: "not present" });
    else if (report.toString("latin1").split("\n")[0].replace(/\r$/, "") === REPORT_MARKER) {
      items.push({ path: REPORT_REL, action: "delete", what: "the generated security report (its first line is the generated-report marker); status regenerates it", before: report, after: null });
    } else items.push({ path: REPORT_REL, action: "keep", what: "its first line is not the generated-report marker, so a person may have written it; kept" });
    const config = readPath(root, CONFIG_REL);
    if (!o.config) items.push({ path: CONFIG_REL, action: config === null ? "none" : "keep", what: config === null ? "not present" : "kept (add --config to delete it)" });
    else if (config === null) items.push({ path: CONFIG_REL, action: "none", what: "not present; nothing to delete" });
    else items.push({ path: CONFIG_REL, action: "delete", what: "the project configuration (--config)", before: config, after: null });

    const records = ROLES.filter((role) => inspectPath(root, project.artifacts[role]).exists).map((role) => `${ROLE_LABELS[role]} ${project.artifacts[role]}`);
    const entries = (kind) => countFiles(root, project.directories[kind], (n) => n.endsWith(".md") && n !== "README.md");
    const observations = countFiles(root, ".skillgate/security/records", (n) => n.endsWith(".json"));
    const receipts = countFiles(root, MIGRATIONS_DIR, (n) => n.endsWith(".json"));
    const entryCounts = ["tasks", "decisions", "lessons"].map((kind) => `${project.directories[kind]}/: ${entries(kind)} ${kind === "tasks" ? "task record(s)" : `${kind.slice(0, -1)} entry file(s)`}`);
    const kept = [
      records.length ? `${records.length} record(s) (${records.join(", ")})` : "no record files were found",
      `every entry and its folder README (${entryCounts.join(", ")})`,
      `the security register (${inspectPath(root, CATALOG_REL).exists ? "catalog" : "no catalog"}, ${inspectPath(root, ".skillgate/security/applicability.json").exists ? "applicability decisions" : "no applicability file"}, ${observations} observation record(s))`,
      `${receipts} migration receipt(s) in ${MIGRATIONS_DIR}/`,
      "the .gitignore lines",
      "the Git history",
    ];

    const changes = items.filter((i) => i.action === "update" || i.action === "delete");
    const mode = o.apply ? "apply" : "preview";
    say(`skillgate remove (${mode}): ${tilde(root)}`);
    say("");
    const width = Math.min(44, Math.max(...items.map((i) => i.path.length)));
    const print = (past) => { for (const i of items) say(`  ${VERBS[i.action][past ? 1 : 0].padEnd(8)} ${i.path.padEnd(width)}  ${i.what}`); };

    if (!o.apply || !changes.length) {
      print(false);
      say("");
      say(`Kept, never touched by remove: ${kept.join("; ")}.`);
      say(changes.length ? `Summary: ${changes.length} file(s) to change; nothing written. To remove: ${selfCommand()} remove --apply${o.config ? " --config" : ""}${dirArg}`
        : "Summary: nothing Skillgate manages is left to remove; nothing written.");
      return 0;
    }
    let result;
    try { result = applyChanges({ root, gitDir: repo.gitDir, command: "remove", changes: changes.map(({ path, before, after }) => ({ path, before, after })) }); } catch (e) {
      if (!(e instanceof TransactionFailed)) throw e;
      print(false);
      say("");
      const failure = describeFailure("remove", e);
      for (const line of failure.lines) console.error(line);
      return failure.exit;
    }
    print(true);
    say("");
    say(`Kept, never touched by remove: ${kept.join("; ")}.`);
    if (result.backupDir) say(`Backups of the files this run changed: ${tilde(result.backupDir)} (inside the Git folder, never committed).`);
    say(`Summary: removed Skillgate's managed content from ${changes.length} file(s). Records, entries, observations and receipts are unchanged.${o.config ? "" : " The configuration was kept; remove --apply --config deletes it."}`);
    return 0;
  } catch (e) {
    if (e instanceof OperationFailed) { console.error(`skillgate: remove could not run: ${e.message}`); return 3; }
    throw e; // Refused (exit 2) and unexpected errors (exit 3) are reported by skillgate.mjs
  }
}
