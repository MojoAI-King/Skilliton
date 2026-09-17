#!/usr/bin/env node
// setup.mjs: the part installation cannot do by itself.
// A plugin cannot set the main-session status line, model defaults, or project CLAUDE.md
// (plugins-reference: plugin settings.json supports only agent and subagentStatusLine;
// a plugin-root CLAUDE.md is not loaded). This script does it visibly and reversibly.
//
//   node scripts/setup.mjs            show the proposed change, write nothing
//   node scripts/setup.mjs --apply    back up ~/.claude/settings.json with a receipt, then write the statusLine key
//   node scripts/setup.mjs --undo     put back what the last --apply changed: the original bytes when the file is
//                                     unchanged since, otherwise only the statusLine key, keeping later edits
//
// It changes exactly one key (statusLine) and preserves everything else. It never touches
// model or effort settings: those are yours to change, and the investigation showed the
// declared values were not what was running anyway (see config-drift-check.sh).
// --apply replaces an existing statusLine rather than chaining it, and says so first.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HOME = homedir();
const SETTINGS = process.env.SKILLITON_SETTINGS ?? join(HOME, ".claude", "settings.json");
const BACKUPS = process.env.SKILLITON_BACKUPS ?? join(HOME, ".claude", "backups", "skilliton");
const here = dirname(fileURLToPath(import.meta.url));
const STATUSLINE = resolve(here, "..", "packs/base/plugins/context-hygiene/hooks/statusline-quota.sh");
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--undo") ? "undo" : "show";

const read = () => existsSync(SETTINGS) ? readFileSync(SETTINGS, "utf8") : "";
const parse = (txt, what = "settings.json") => { if (!txt.trim()) return {}; try { return JSON.parse(txt); } catch (e) { throw new Error(`${what} is not valid JSON; refusing to touch it: ${e.message}`); } };
const render = (obj) => JSON.stringify(obj, null, 2) + "\n";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// A backup made before receipts existed does not say what --apply wrote; the pack's status line is recognized by name.
const looksApplied = (line) => line?.type === "command" && typeof line.command === "string" && line.command.endsWith("/statusline-quota.sh");

if (mode === "undo") {
  // Only folders this script created (ISO timestamps) are backups. Other tools share the root (for example
  // skilliton harness writes harness/), and a name that sorts after the timestamps must not be taken as newest.
  const backupsIn = (root) => (existsSync(root) ? readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort() : []);
  const dirs = backupsIn(BACKUPS);
  if (!dirs.length) {
    // Before the rename to Skilliton the default backup folder was ~/.claude/backups/skillgate. It is not read, so an
    // --apply made then is named instead of being reported as nothing to undo.
    const earlier = join(HOME, ".claude", "backups", "skillgate");
    if (process.env.SKILLITON_BACKUPS === undefined && backupsIn(earlier).length) {
      console.log(`no backups in ${BACKUPS}, but ${earlier} holds backups made before the rename to Skilliton, which this version does not read. Compare ${join(earlier, backupsIn(earlier).at(-1), "settings.json")} with ${SETTINGS} and restore the statusLine key by hand.`);
      process.exit(1);
    }
    console.log(existsSync(BACKUPS) ? "nothing to undo: no backups" : "nothing to undo: no backups directory");
    process.exit(0);
  }
  const bdir = join(BACKUPS, dirs[dirs.length - 1]);
  const backup = join(bdir, "settings.json");
  if (!existsSync(backup)) { console.log(`backup ${backup} missing; refusing to guess`); process.exit(1); }
  let receipt = null;
  if (existsSync(join(bdir, "receipt.json"))) {
    try { receipt = JSON.parse(readFileSync(join(bdir, "receipt.json"), "utf8")); } catch (e) { console.log(`receipt ${join(bdir, "receipt.json")} is not valid JSON; refusing to guess: ${e.message}`); process.exit(1); }
  }
  const original = readFileSync(backup, "utf8");
  const existed = receipt ? receipt.existed === true : original.trim() !== "";
  const originalObj = parse(original, `the backup ${backup}`);

  if (!existsSync(SETTINGS)) {
    if (existed) { console.log(`${SETTINGS} no longer exists, so undo writes nothing; the original is backed up at ${backup}`); process.exit(1); }
    console.log(`nothing to undo: ${SETTINGS} does not exist, as before --apply`);
    process.exit(0);
  }
  const current = readFileSync(SETTINGS, "utf8");
  if (existed && current === original) { console.log(`nothing to undo: ${SETTINGS} already matches the backup ${backup}`); process.exit(0); }
  const currentObj = parse(current);
  if (same(currentObj.statusLine, originalObj.statusLine)) { console.log(`nothing to undo: statusLine in ${SETTINGS} already has its value from before --apply`); process.exit(0); }
  const wrote = receipt ? receipt.statusLine?.wrote : looksApplied(currentObj.statusLine) ? currentObj.statusLine : undefined;
  if (wrote === undefined || !same(currentObj.statusLine, wrote)) {
    console.log(`statusLine in ${SETTINGS} is not the one --apply wrote (it changed afterwards), so undo leaves the file as it is. The original is backed up at ${backup}.`);
    process.exit(1);
  }

  const unchanged = receipt ? sha256(current) === receipt.wroteSha256 : current === render({ ...originalObj, statusLine: wrote });
  if (unchanged) {
    if (existed) { writeFileSync(SETTINGS, original); console.log(`restored ${SETTINGS} from ${backup}`); }
    else { unlinkSync(SETTINGS); console.log(`removed ${SETTINGS}, which did not exist before --apply`); }
    process.exit(0);
  }
  const next = { ...currentObj };
  if (Object.hasOwn(originalObj, "statusLine")) next.statusLine = originalObj.statusLine;
  else delete next.statusLine;
  if (!existed && Object.keys(next).length === 0) { unlinkSync(SETTINGS); console.log(`removed ${SETTINGS}: it did not exist before --apply and nothing else is in it now`); process.exit(0); }
  writeFileSync(SETTINGS, render(next));
  console.log(`${SETTINGS} changed after --apply, so undo put back only statusLine (${Object.hasOwn(originalObj, "statusLine") ? "its value from before --apply" : "removed, as before --apply"}) and kept the other changes. The original is backed up at ${backup}.`);
  process.exit(0);
}

const existedBefore = existsSync(SETTINGS);
const before = read();
const obj = parse(before);
const proposed = { type: "command", command: STATUSLINE };
const current = obj.statusLine;
const alreadySet = same(current, proposed);

console.log(`settings file: ${SETTINGS}`);
console.log(`current statusLine: ${current ? JSON.stringify(current) : "(none)"}`);
console.log(`proposed statusLine: ${JSON.stringify(proposed)}`);
if (current && !alreadySet) console.log("NOTE: an existing statusLine will be replaced. --undo restores it. To chain instead, wrap your current command inside statusline-quota.sh.");
if (alreadySet) { console.log("already applied; nothing to do"); process.exit(0); }
if (mode === "show") { console.log("\nno changes written. re-run with --apply to write, --undo to restore the last backup."); process.exit(0); }

const next = render({ ...obj, statusLine: proposed });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bdir = join(BACKUPS, stamp);
mkdirSync(bdir, { recursive: true });
writeFileSync(join(bdir, "settings.json"), before);
writeFileSync(join(bdir, "receipt.json"), render({ schema: 1, existed: existedBefore, statusLine: { wrote: proposed }, wroteSha256: sha256(next) }));
mkdirSync(dirname(SETTINGS), { recursive: true });
writeFileSync(SETTINGS, next);
console.log(`backed up to ${bdir}/settings.json`);
console.log(`wrote statusLine to ${SETTINGS}`);
console.log("restart Claude Code for the status line to take effect. --undo reverses this.");
