#!/usr/bin/env node
// setup.mjs: the part installation cannot do by itself.
// A plugin cannot set the main-session status line, model defaults, or project CLAUDE.md
// (plugins-reference: plugin settings.json supports only agent and subagentStatusLine;
// a plugin-root CLAUDE.md is not loaded). This script does it visibly and reversibly.
//
//   node scripts/setup.mjs            show the proposed change, write nothing
//   node scripts/setup.mjs --apply    back up ~/.claude/settings.json, then write the statusLine key
//   node scripts/setup.mjs --undo     restore the most recent backup, byte for byte
//
// It changes exactly one key (statusLine) and preserves everything else. It never touches
// model or effort settings: those are yours to change, and the investigation showed the
// declared values were not what was running anyway (see config-drift-check.sh).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HOME = homedir();
const SETTINGS = process.env.SKILLGATE_SETTINGS ?? join(HOME, ".claude", "settings.json");
const BACKUPS = process.env.SKILLGATE_BACKUPS ?? join(HOME, ".claude", "backups", "skillgate");
const here = dirname(fileURLToPath(import.meta.url));
const STATUSLINE = resolve(here, "..", "packs/base/plugins/context-hygiene/hooks/statusline-quota.sh");
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--undo") ? "undo" : "show";

const read = () => existsSync(SETTINGS) ? readFileSync(SETTINGS, "utf8") : "";
const parse = (txt) => { if (!txt.trim()) return {}; try { return JSON.parse(txt); } catch (e) { throw new Error(`settings.json is not valid JSON; refusing to touch it: ${e.message}`); } };

if (mode === "undo") {
  if (!existsSync(BACKUPS)) { console.log("nothing to undo: no backups directory"); process.exit(0); }
  // Only folders this script created (ISO timestamps) are backups. Other tools share the root (for example
  // skillgate harness writes harness/), and a name that sorts after the timestamps must not be taken as newest.
  const dirs = readdirSync(BACKUPS).filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d)).sort();
  if (!dirs.length) { console.log("nothing to undo: no backups"); process.exit(0); }
  const latest = join(BACKUPS, dirs[dirs.length - 1], "settings.json");
  if (!existsSync(latest)) { console.log(`backup ${latest} missing; refusing to guess`); process.exit(1); }
  copyFileSync(latest, SETTINGS);
  console.log(`restored ${SETTINGS} from ${latest}`);
  process.exit(0);
}

const before = read();
const obj = parse(before);
const proposed = { type: "command", command: STATUSLINE };
const current = obj.statusLine;
const same = JSON.stringify(current) === JSON.stringify(proposed);

console.log(`settings file: ${SETTINGS}`);
console.log(`current statusLine: ${current ? JSON.stringify(current) : "(none)"}`);
console.log(`proposed statusLine: ${JSON.stringify(proposed)}`);
if (current && !same) console.log("NOTE: an existing statusLine will be replaced. --undo restores it. To chain instead, wrap your current command inside statusline-quota.sh.");
if (same) { console.log("already applied; nothing to do"); process.exit(0); }
if (mode === "show") { console.log("\nno changes written. re-run with --apply to write, --undo to restore the last backup."); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bdir = join(BACKUPS, stamp);
mkdirSync(bdir, { recursive: true });
writeFileSync(join(bdir, "settings.json"), before);
const next = { ...obj, statusLine: proposed };
mkdirSync(dirname(SETTINGS), { recursive: true });
writeFileSync(SETTINGS, JSON.stringify(next, null, 2) + "\n");
console.log(`backed up to ${bdir}/settings.json`);
console.log(`wrote statusLine to ${SETTINGS}`);
console.log("restart Claude Code for the status line to take effect. --undo reverses this.");
