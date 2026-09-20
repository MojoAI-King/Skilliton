// commands/harness.mjs: `skilliton harness` (docs/CONTRACTS.md section 6). The engine is lib/harness.mjs; this
// file parses the arguments, prints the change for each file, and writes it with --apply or removes it with --undo.

import { resolve } from "node:path";
import { argPath, backupFile, forDisplay, newStamp, parseArgs, refuse, resolveExistingDir, say, selfCommand, sha12, tilde, unifiedDiff, writeBytes } from "../lib/core.mjs";
import { END_LINE, HARNESS_FILES, HARNESS_TEMPLATE, START_LINE, planHarnessFile, projectTemplateVars, readHarnessTemplate, templateBody } from "../lib/harness.mjs";

export const help = `harness: show, write, or remove the Skilliton harness block in CLAUDE.md and AGENTS.md.

  harness              show the change for both files; writes nothing
  harness --apply      back up each existing file, then insert or replace the block (creates a missing file)
  harness --undo       back up, then remove the block, its markers, and one blank line next to it

Options:
  --file CLAUDE.md|AGENTS.md   only this file (default: both)
  --dir <folder>               the project folder (default: the current folder)
  --template <file>            the block contents (default: templates/harness.md in the skills repo)

The block sits between "${START_LINE}" and "${END_LINE}", each on its own line.
Text outside the markers is never changed. A file with more than one start or end marker, or a marker without
its partner, is refused (exit 2) and nothing is written. --undo does not restore an old backup, because the rest
of the file may have changed since that backup was taken.`;

export async function run(argv) {
  const o = parseArgs(argv, { flags: ["apply", "undo"], options: ["file", "dir", "template"] }, "harness");
  if (o.help) { say(help); return 0; }
  if (o._.length) refuse(`harness takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} harness --help`);
  if (o.apply && o.undo) refuse("use --apply or --undo, not both");
  if (o.file !== undefined && !HARNESS_FILES.includes(o.file)) refuse(`--file must be CLAUDE.md or AGENTS.md (got "${o.file}")`);
  const dir = resolveExistingDir(o.dir, "--dir");
  const templatePath = resolve(o.template ?? HARNESS_TEMPLATE);
  const template = o.undo ? null : readHarnessTemplate(templatePath);
  const names = o.file ? [o.file] : HARNESS_FILES;
  // Plan every file before writing any, so a refusal for one file leaves all of them untouched.
  const vars = o.undo ? null : projectTemplateVars(dir);
  const plans = names.map((name) => planHarnessFile(dir, name, template, o.undo, vars));
  const mode = o.undo ? "undo" : o.apply ? "apply" : "show";
  const again = `${o.file ? ` --file ${o.file}` : ""}${o.dir ? ` --dir ${argPath(dir)}` : ""}${o.template ? ` --template ${argPath(templatePath)}` : ""}`;

  say(`harness (${mode}): project ${tilde(dir)}${template ? `; template ${tilde(templatePath)} (sha256 ${sha12(templateBody(template, vars))})` : ""}`);
  for (const p of plans) {
    say("");
    say(`${p.name}: ${p.summary}`);
    if (p.changed) process.stdout.write(unifiedDiff(forDisplay(p.text), forDisplay(p.next), p.exists ? `a/${p.name}` : "/dev/null", `b/${p.name}`));
  }
  say("");
  const pending = plans.filter((p) => p.changed);
  if (mode === "show") {
    say(pending.length ? `Nothing written. To make this change: ${selfCommand()} harness --apply${again}` : "Nothing to change; nothing written.");
    return 0;
  }
  if (!pending.length) { say("Nothing to change; nothing written."); return 0; }
  const stamp = newStamp();
  for (const p of pending) {
    if (p.exists) say(`${p.name}: backed up to ${tilde(backupFile("harness", p.path, stamp))}`);
    writeBytes(p.path, p.next);
    say(`${p.name}: ${mode === "undo" ? "harness block removed" : p.exists ? "harness block written" : "created with the harness block"} (${tilde(p.path)})`);
  }
  say(mode === "undo" ? "Done. Each backup holds its file as it was just before this change."
    : `Done. To remove the block later: ${selfCommand()} harness --undo${again.replace(/ --template \S+| --template "[^"]*"/, "")}`);
  return 0;
}
