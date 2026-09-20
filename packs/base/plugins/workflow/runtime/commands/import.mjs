// commands/import.mjs: `skilliton import` (docs/CONTRACTS.md section 6). Scans an existing skill folder for
// secrets and oversized trees, then copies it into a plugin and bumps that plugin's version. The scan rules
// (SECRET_RULES, scanSecrets) stay in lib/core.mjs because commands/propose.mjs scans with the same rules.

import { spawnSync } from "node:child_process";
import { constants as fsConstants, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { SKILLS_REPO, isDir, isFile, parseArgs, readBytes, refuse, resolveSkillsRepo, say, scanSecrets, tilde, validateName, writeBytes } from "../lib/core.mjs";
import { detectEol } from "../lib/harness.mjs";
import { BASE_NOTE, findPlugin, planVersionBump, writeVersionBump } from "../lib/skills-repo.mjs";

export const help = `import: copy an existing skill folder into a plugin, after scanning it.

  import <skill-dir> --into <plugin> [--pack <pack>] [--name <skill>] [--repo <skills repo>]

Before anything is copied, every file in <skill-dir> is scanned twice:
  1. scripts/scrub-check.sh --path <skill-dir>: denylisted names, em or en dashes, home-directory paths.
     The name scan needs a denylist (SKILLITON_DENYLIST, default ~/.config/skilliton/denylist). Without one the
     import is refused, because a scan that did not run is not a pass. A denylist holding only comments is
     allowed and means "no names to block".
  2. secret-shaped text (AWS access key ids; Anthropic, GitHub, Slack, and Stripe live keys; private key blocks)
     and absolute home-directory paths (macOS, Linux, and Windows forms).
Any hit refuses the import (exit 2) and lists file:line with the rule; the matched text is never printed.
Symbolic links are refused; .git folders and .DS_Store files are skipped.
Then the folder is copied to packs/<pack>/plugins/<plugin>/skills/<skill>/ (<skill> is --name, or the folder's name),
the copied SKILL.md gets a frontmatter "name" matching that folder, and the plugin's version is bumped.
Review the skill's text for company-specific content before committing: the scan only knows the patterns above.`;

const MAX_IMPORT_FILES = 1000;
const isInside = (child, parent) => { const r = relative(parent, child); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

// Every regular file under root (relative paths, sorted), the same set scrub-check --path scans.
function walkSkillFolder(root) {
  const files = [], problems = [];
  const walk = (rel) => {
    const entries = readdirSync(rel ? join(root, rel) : root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink()) problems.push(`${r} (a symbolic link)`);
      else if (ent.isDirectory()) { if (ent.name !== ".git") walk(r); }
      else if (!ent.isFile()) problems.push(`${r} (not a regular file)`);
      else if (ent.name !== ".DS_Store") files.push(r);
      if (files.length > MAX_IMPORT_FILES) refuse(`${tilde(root)} holds more than ${MAX_IMPORT_FILES} files, which is not a skill folder; nothing was copied`);
    }
  };
  walk("");
  if (problems.length) refuse(`import copies regular files only, and ${tilde(root)} contains:\n  ${problems.join("\n  ")}\nReplace each one with the file it stands for, or remove it, then run again. Nothing was copied.`);
  return files;
}
// The scrub check that ships beside this runtime; an installed copy has none, so it uses the target repository's.
function runScrubCheck(dir, repo) {
  const script = join(SKILLS_REPO ?? repo, "scripts", "scrub-check.sh");
  if (!isFile(script)) refuse(`the scrub check ${tilde(script)} was not found, so the folder cannot be scanned; nothing was copied`);
  const r = spawnSync("bash", [script, "--path", dir], { encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) refuse(`the scrub check could not run (${r.error.code === "ENOENT" ? "bash was not found" : r.error.message}); nothing was copied`);
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
  const counted = /^scanned files: (\d+)$/m.exec(output);
  return { status: r.status, output, scanned: counted ? Number(counted[1]) : null };
}

// Make the copied SKILL.md carry "name: <skill>" in its frontmatter. Returns the new text and what changed.
function planSkillFrontmatter(text, name) {
  let bom = "", body = text;
  if (body.startsWith("\xEF\xBB\xBF")) { bom = "\xEF\xBB\xBF"; body = body.slice(3); }
  const eol = detectEol(body), cr = eol === "\r\n" ? "\r" : "";
  const noDescription = "WARN: SKILL.md has no description in its frontmatter. Claude uses the description to decide when to load a skill; add one.";
  const lines = body.split("\n");
  if (!/^---\r?$/.test(lines[0])) {
    return { next: `${bom}---${eol}name: ${name}${eol}---${eol}${eol}${body}`, changed: true, notes: [`SKILL.md had no frontmatter; added one holding "name: ${name}"`, noDescription] };
  }
  const close = lines.findIndex((l, i) => i > 0 && /^---[ \t]*\r?$/.test(l));
  if (close < 0) refuse("SKILL.md opens its frontmatter with --- but never closes it; fix the source file, then run again. Nothing was copied.");
  const front = lines.slice(1, close);
  const notes = front.some((l) => /^description[ \t]*:/.test(l)) ? [] : [noDescription];
  const at = front.findIndex((l) => /^name[ \t]*:/.test(l));
  if (at < 0) {
    lines.splice(1, 0, `name: ${name}${cr}`);
    notes.unshift(`added "name: ${name}" to the SKILL.md frontmatter (plugin skills need it)`);
    return { next: bom + lines.join("\n"), changed: true, notes };
  }
  const raw = lines[1 + at].replace(/\r$/, "").replace(/^name[ \t]*:[ \t]*/, "");
  if (/^[|>]/.test(raw)) refuse("SKILL.md writes its name as a multi-line YAML value; make it one line (name: <skill>) in the source, then run again. Nothing was copied.");
  const current = raw.replace(/[ \t]+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
  if (current === name) return { next: text, changed: false, notes };
  lines[1 + at] = `name: ${name}${cr}`;
  notes.unshift(`changed the SKILL.md frontmatter name from "${current}" to "${name}" so it matches its folder`);
  return { next: bom + lines.join("\n"), changed: true, notes };
}

export async function run(argv) {
  const o = parseArgs(argv, { flags: [], options: ["into", "pack", "name", "repo"] }, "import");
  if (o.help) { say(help); return 0; }
  if (o._.length !== 1) refuse(`import needs exactly one skill folder: import <skill-dir> --into <plugin> (got ${o._.length})`);
  if (o.into === undefined) refuse("import needs --into <plugin>, the plugin that will hold the skill");
  let src = resolve(o._[0]);
  if (isFile(src) && basename(src) === "SKILL.md") src = dirname(src);
  if (!isDir(src)) refuse(`${tilde(src)} is not a folder`);
  if (!isFile(join(src, "SKILL.md"))) refuse(`${tilde(src)} has no SKILL.md, so it is not a skill folder`);
  const skillName = o.name ?? basename(src);
  validateName(skillName, o.name !== undefined ? "--name" : "skill name (taken from the folder's name; choose another with --name)");
  const repo = resolveSkillsRepo(o.repo);
  const plugin = findPlugin(repo, o.into, o.pack);
  const destRel = `${plugin.rel}/skills/${skillName}`;
  const dest = join(plugin.dir, "skills", skillName);
  if (existsSync(dest)) refuse(`${destRel} already exists; nothing was copied. Choose another name with --name.`);
  if (isInside(dest, src)) refuse(`the destination ${destRel} is inside the folder being imported; nothing was copied`);
  const files = walkSkillFolder(src);
  const bump = planVersionBump(plugin.manifest, plugin.manifestRel);
  const frontmatter = planSkillFrontmatter(readBytes(join(src, "SKILL.md")), skillName);

  say(`import: ${tilde(src)} -> ${destRel} (in ${tilde(repo)})`);
  say(`scanning all ${files.length} file(s) before copying anything`);
  const scrub = runScrubCheck(src, repo);
  say("  scrub check (names, dashes, home paths):");
  for (const line of scrub.output.split("\n")) say(`    ${line}`);
  const secrets = scanSecrets(src, files);
  const textFiles = files.length - secrets.binary.length;
  if (secrets.hits.length) {
    say(`  secret and home-path patterns: ${secrets.hits.length} hit(s) in ${textFiles} text file(s); the matched text is not shown`);
    for (const h of secrets.hits) say(`    ${h.file}:${h.line}  ${h.rule}`);
  } else {
    say(`  secret and home-path patterns: 0 hits in ${textFiles} text file(s)`);
  }
  if (secrets.binary.length) say(`  not scanned for text patterns, because they are binary: ${secrets.binary.join(", ")}`);

  const reasons = [];
  if (scrub.status === 1) reasons.push("the scrub check found lines to fix (listed above)");
  else if (scrub.status === 2) reasons.push("the scrub check did not complete, so names were not scanned. Set SKILLITON_DENYLIST to a denylist file with one name pattern per line (a file holding only comments means no names to block)");
  else if (scrub.status !== 0) reasons.push(`the scrub check failed to run (exit ${scrub.status ?? "by signal"})`);
  else if (scrub.scanned !== files.length) reasons.push(`the scrub check scanned ${scrub.scanned ?? "an unknown number of"} file(s) but import would copy ${files.length}, so a file would be copied unscanned`);
  if (secrets.hits.length) reasons.push(`${secrets.hits.length} secret-shaped or home-path line(s) (listed above)`);
  if (reasons.length) refuse(`import stopped before copying anything: ${reasons.join("; ")}. Fix the source folder, then run again.`);

  for (const rel of files) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(src, rel), to, fsConstants.COPYFILE_EXCL);
  }
  if (frontmatter.changed) writeBytes(join(dest, "SKILL.md"), frontmatter.next);
  say("");
  say(`copied ${files.length} file(s) to ${destRel}:`);
  for (const rel of files) say(`  ${rel}`);
  for (const note of frontmatter.notes) say(note);
  writeVersionBump("import", plugin, bump);
  if (plugin.pack === "base") say(BASE_NOTE);
  say("");
  say("Before committing: read the skill's text for company-specific content (client or people names, internal links, account details). The scan above only knows the patterns it lists.");
  return 0;
}
