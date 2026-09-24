// projects.mjs: where the meter finds Claude Code's transcripts, and the name Claude Code gives a project's folder.
//
// A project folder name is particular to one machine (it spells out the path the project lives at), so it is worked
// out at run time from a path and is never written into this repository, a test or a fixture name.

import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { claudeConfigDir } from "../lib/verify.mjs";

// SKILLITON_PROJECTS, else the projects folder inside Claude Code's own folder (lib/verify.mjs: CLAUDE_CONFIG_DIR,
// else ~/.claude). With CLAUDE_CONFIG_DIR unset this is ~/.claude/projects, which is where the meter has always read.
export const projectsRoot = (env = process.env) => env.SKILLITON_PROJECTS ?? join(claudeConfigDir(), "projects");

// The folder name Claude Code files a project's transcripts under: the project's absolute path with every character that
// is not an ASCII letter or digit replaced by one hyphen, each on its own, never collapsed.
//
// Verified 2026-09-24 against the folder names on the machine this was written on, without writing any of them here:
// a project inside a hidden folder (a path holding "/." followed by a name) is filed under a name where that slash and
// that dot became two hyphens in a row, and a project in a temporary folder whose path held "/-" kept both as two
// hyphens, so a run of such characters is not collapsed to one (the rule scripts/token-direction.mjs used before it
// reused this function collapsed them, and would have missed both). The path is the real one: every folder on that
// machine for a temporary project begins with the real "/private/tmp" spelling rather than the "/tmp" link; whether a
// session opened through the link is filed under the link's spelling was not tested, and neither was a Windows path
// or a path longer than about 200 characters.
export function folderNameFor(path) {
  const absolute = resolve(path);
  let real = absolute;
  if (existsSync(absolute)) {
    try { real = realpathSync(absolute); } catch { real = absolute; }
  }
  return real.replace(/[^A-Za-z0-9]/g, "-");
}
