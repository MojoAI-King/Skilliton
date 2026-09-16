#!/usr/bin/env node
// skillgate.mjs: the Skillgate command line. Node only, no dependencies.
//
//   node scripts/skillgate.mjs --help
//   node scripts/skillgate.mjs doctor                  report what is installed, enabled, and current (writes nothing)
//   node scripts/skillgate.mjs harness [--apply|--undo] show, write, or remove the harness block in CLAUDE.md and AGENTS.md
//   node scripts/skillgate.mjs project-settings [--apply]  show or write the team .claude/settings.json
//   node scripts/skillgate.mjs new-skill <plugin> <skill>  scaffold a skill and bump the plugin version
//   node scripts/skillgate.mjs import <skill-dir> --into <plugin>  copy a skill in, after scanning it
//
// The contract is docs/CONTRACTS.md (the "CLI" table). Every writing command prints its change first, writes only
// with --apply or its own explicit verb (harness --undo, new-skill, import), and backs up any file it overwrites to
// $SKILLGATE_BACKUPS/<command>/<timestamp>/ (default root ~/.claude/backups/skillgate, the same root setup.mjs uses).
//
// Exit codes: 0 success; 1 a required doctor check is not OK; 2 refused, with the reason printed (a refusal happens
// before anything is written); 3 unexpected internal error (a bug in this script).
//
// What doctor runs, and why it sometimes does not: `claude --version`, then `claude plugin list --help` to see
// whether `--json` exists, then `claude plugin list --json` and `claude plugin marketplace list --json`.
// Measured on Claude Code 2.1.92: under a home directory where Claude Code has never run, the first
// `claude plugin list` creates ~/.claude.json (and a backup of it); where it has run, a repeat changed nothing,
// and `claude --version` wrote nothing either way. So doctor calls the plugin commands only when ~/.claude.json
// already exists, and otherwise reads Claude Code's local files, labelled as an undocumented format.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_REPO = resolve(dirname(SCRIPT_FILE), "..");
const HOME = homedir();
const BACKUPS = process.env.SKILLGATE_BACKUPS || join(HOME, ".claude", "backups", "skillgate");

const START_LINE = "<!-- skillgate:harness:start v1 -->";
const END_LINE = "<!-- skillgate:harness:end -->";
const HARNESS_FILES = ["CLAUDE.md", "AGENTS.md"];

// ---------- refusals and small helpers ----------

class Refused extends Error {}
const refuse = (message) => { throw new Refused(message); };
const say = (line = "") => console.log(line);

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
// JSON equality that ignores key order.
function sameJson(a, b) {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJson(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  return a === b;
}
// Short sha256 of a latin1 string, which is the hash of the file's own bytes.
const sha12 = (latin1Text) => createHash("sha256").update(Buffer.from(latin1Text, "latin1")).digest("hex").slice(0, 12);

function statOrNull(p) {
  try { return statSync(p); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; }
}
const isDir = (p) => statOrNull(p)?.isDirectory() === true;
const isFile = (p) => statOrNull(p)?.isFile() === true;

// Shorten a path for display: inside HOME becomes ~/...
function tilde(p) {
  if (p === HOME) return "~";
  return p.startsWith(HOME + sep) ? "~" + p.slice(HOME.length) : p;
}

// The command a person should type to run this script again, from where they are now.
function selfCommand() {
  const rel = relative(process.cwd(), SCRIPT_FILE);
  return `node ${rel.startsWith(".." + sep + ".." + sep) || rel === "" ? tilde(SCRIPT_FILE) : rel}`;
}

function resolveExistingDir(value, what) {
  const dir = resolve(value ?? process.cwd());
  if (!isDir(dir)) refuse(`${what} ${tilde(dir)} is not an existing folder`);
  return dir;
}

// Names for plugins, skills, packs, and marketplaces: lowercase letters, digits, and hyphens.
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
function validateName(value, what) {
  if (typeof value !== "string" || !NAME_RE.test(value) || value.length > 64) {
    refuse(`${what} "${value}" is not allowed: use only lowercase letters, digits, and hyphens, starting with a letter or digit, at most 64 characters (for example: release-notes)`);
  }
}

// Minimal option parser. spec.flags take no value; spec.options take one value.
function parseArgs(argv, spec, command) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { out.help = true; continue; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      if (spec.flags.includes(key)) {
        if (eq > 0) refuse(`--${key} takes no value`);
        out[key] = true;
        continue;
      }
      if (spec.options.includes(key)) {
        const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
        if (value === undefined || value === "" || (eq < 0 && value.startsWith("--"))) refuse(`--${key} needs a value`);
        if (out[key] !== undefined) refuse(`--${key} was given more than once`);
        out[key] = value;
        continue;
      }
      refuse(`unknown option ${a} for "${command}". Run: ${selfCommand()} ${command} --help`);
    }
    out._.push(a);
  }
  return out;
}

// Find an executable on PATH without shelling out.
function which(tool) {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, tool + ext);
      if (!isFile(candidate)) continue;
      try { accessSync(candidate, fsConstants.X_OK); return candidate; } catch (e) { if (e.code !== "EACCES") throw e; }
    }
  }
  return null;
}

// Run a program with a timeout; never throws for the program's own failure.
function runProgram(file, args, timeoutMs = 20000) {
  const r = spawnSync(file, args, { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
  const failure = r.error ? (r.error.code === "ETIMEDOUT" ? `timed out after ${timeoutMs / 1000}s` : r.error.message)
    : r.status !== 0 ? `exit ${r.status ?? "signal " + r.signal}` : null;
  return { ok: failure === null, failure, status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// ---------- backups ----------

const newStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

// Copy a file to <BACKUPS>/<command>/<stamp>/<basename>. Never overwrites an earlier backup.
function backupFile(command, filePath, stamp) {
  for (let n = 0; ; n++) {
    const dir = join(BACKUPS, command, n ? `${stamp}-${n}` : stamp);
    const dest = join(dir, basename(filePath));
    if (existsSync(dest)) continue;
    mkdirSync(dir, { recursive: true });
    copyFileSync(filePath, dest, fsConstants.COPYFILE_EXCL);
    return dest;
  }
}

// ---------- unified diff (display only) ----------

function diffLines(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  else lines[lines.length - 1] += "\n"; // marks "no newline at end of file"; a real line never contains \n
  return lines;
}

function unifiedDiff(oldText, newText, oldLabel, newLabel, context = 3) {
  if (oldText === newText) return "";
  const A = diffLines(oldText), B = diffLines(newText);
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const am = A.slice(pre, A.length - suf), bm = B.slice(pre, B.length - suf);
  let middle;
  if (am.length * bm.length <= 4000000) {
    const n = am.length, m = bm.length;
    const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = am[i] === bm[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    middle = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { middle.push([" ", am[i]]); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) middle.push(["-", am[i++]]);
      else middle.push(["+", bm[j++]]);
    }
    while (i < n) middle.push(["-", am[i++]]);
    while (j < m) middle.push(["+", bm[j++]]);
  } else {
    middle = [...am.map((l) => ["-", l]), ...bm.map((l) => ["+", l])];
  }
  const ops = [...A.slice(0, pre).map((l) => [" ", l]), ...middle, ...A.slice(A.length - suf).map((l) => [" ", l])];
  const oldNo = [], newNo = [];
  let on = 1, nn = 1;
  for (const [kind] of ops) { oldNo.push(on); newNo.push(nn); if (kind !== "+") on++; if (kind !== "-") nn++; }
  const ranges = [];
  ops.forEach(([kind], k) => {
    if (kind === " ") return;
    const s = Math.max(0, k - context), e = Math.min(ops.length, k + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else ranges.push([s, e]);
  });
  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  for (const [s, e] of ranges) {
    const seg = ops.slice(s, e);
    const oldCount = seg.filter(([k]) => k !== "+").length, newCount = seg.filter(([k]) => k !== "-").length;
    out.push(`@@ -${oldCount ? oldNo[s] : oldNo[s] - 1},${oldCount} +${newCount ? newNo[s] : newNo[s] - 1},${newCount} @@`);
    for (const [kind, line] of seg) {
      if (line.endsWith("\n")) { out.push(kind + line.slice(0, -1)); out.push("\\ No newline at end of file"); }
      else out.push(kind + line);
    }
  }
  return out.join("\n") + "\n";
}

// Bytes in, bytes out: files are handled as latin1 strings so every byte outside what we change is preserved,
// and decoded as UTF-8 only for display.
const readBytes = (p) => readFileSync(p).toString("latin1");
const writeBytes = (p, text, flag = "w") => writeFileSync(p, Buffer.from(text, "latin1"), { flag });
const forDisplay = (latin1Text) => Buffer.from(latin1Text, "latin1").toString("utf8");

// A path as a person should type it: ~/... when that needs no quoting, otherwise the quoted absolute path.
function argPath(p) {
  const short = tilde(p);
  return /^[A-Za-z0-9_./~@%+=:,-]+$/.test(short) ? short : JSON.stringify(p);
}

// ---------- harness ----------

const HARNESS_HELP = `harness: show, write, or remove the Skillgate harness block in CLAUDE.md and AGENTS.md.

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

// Lines with their byte offsets. body excludes the line ending (and a leading byte order mark on line 1).
function lineSpans(text) {
  const spans = [];
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl + 1;
    let body = text.slice(pos, nl === -1 ? text.length : nl).replace(/\r$/, "");
    let bom = 0;
    if (pos === 0 && body.startsWith("\xEF\xBB\xBF")) { bom = 3; body = body.slice(3); }
    spans.push({ start: pos, end, body, bom });
    pos = end;
  }
  return spans;
}

const START_EXACT = /^<!-- skillgate:harness:start v(\d+) -->$/;

// Returns null when the file has no block, the block's offsets when it has exactly one, and refuses otherwise.
function findBlock(text, label) {
  const spans = lineSpans(text);
  const starts = [], ends = [];
  spans.forEach((s, i) => {
    const t = s.body.trim();
    if (t.startsWith("<!-- skillgate:harness:start")) {
      if (!START_EXACT.test(t)) refuse(`${label} line ${i + 1} starts like a harness start marker but is not exactly "${START_LINE}". Fix that line by hand, then run again.`);
      starts.push(i);
    } else if (t.startsWith("<!-- skillgate:harness:end")) {
      if (t !== END_LINE) refuse(`${label} line ${i + 1} starts like a harness end marker but is not exactly "${END_LINE}". Fix that line by hand, then run again.`);
      ends.push(i);
    }
  });
  const nums = (list) => list.map((i) => i + 1).join(", ");
  if (starts.length > 1) refuse(`${label} has more than one harness start marker (lines ${nums(starts)}). A file holds exactly one block; remove the extra block by hand, then run again.`);
  if (ends.length > 1) refuse(`${label} has more than one harness end marker (lines ${nums(ends)}). A file holds exactly one block; remove the extra marker by hand, then run again.`);
  if (starts.length && !ends.length) refuse(`${label} has a harness start marker (line ${starts[0] + 1}) without an end marker. Add "${END_LINE}" where the block ends, or delete the start marker, then run again.`);
  if (ends.length && !starts.length) refuse(`${label} has a harness end marker (line ${ends[0] + 1}) without a start marker. Add "${START_LINE}" where the block begins, or delete the end marker, then run again.`);
  if (!starts.length) return null;
  if (ends[0] < starts[0]) refuse(`${label} has its harness end marker (line ${ends[0] + 1}) before its start marker (line ${starts[0] + 1}). Fix the order by hand, then run again.`);
  const s = spans[starts[0]], e = spans[ends[0]];
  return {
    startOffset: s.start + s.bom, endOffset: e.end, innerStart: s.end, innerEnd: e.start,
    startLineNo: starts[0] + 1, endLineNo: ends[0] + 1, version: START_EXACT.exec(s.body.trim())[1],
  };
}

const detectEol = (text) => { const nl = text.indexOf("\n"); return nl > 0 && text[nl - 1] === "\r" ? "\r\n" : "\n"; };
const templateBody = (template) => { const body = template.replace(/\r\n/g, "\n"); return body.endsWith("\n") ? body : body + "\n"; };

function renderBlock(template, eol) {
  const block = `${START_LINE}\n${templateBody(template)}${END_LINE}\n`;
  return eol === "\r\n" ? block.replace(/\n/g, "\r\n") : block;
}

function readHarnessTemplate(path) {
  if (!isFile(path)) refuse(`harness template ${tilde(path)} not found`);
  const text = readBytes(path);
  if (!text.trim()) refuse(`harness template ${tilde(path)} is empty`);
  lineSpans(text).forEach((s, i) => {
    if (s.body.trim().startsWith("<!-- skillgate:harness:")) refuse(`harness template ${tilde(path)} line ${i + 1} holds a harness marker; the template must hold only the block's contents`);
  });
  return text;
}

// Remove the block and one blank line next to it: the one before it, or at the very top of a file the one after it.
function removeBlockAt(text, found) {
  let before = text.slice(0, found.startOffset);
  let after = text.slice(found.endOffset);
  if (/(^|\n)\r?\n$/.test(before)) before = before.replace(/\r?\n$/, "");
  else if (/^(\xEF\xBB\xBF)?$/.test(before) && /^\r?\n/.test(after)) after = after.replace(/^\r?\n/, "");
  return before + after;
}

function planHarnessFile(dir, name, template, undo) {
  const path = join(dir, name);
  const st = statOrNull(path);
  if (st && !st.isFile()) refuse(`${tilde(path)} exists but is not a regular file`);
  const exists = !!st;
  const text = exists ? readBytes(path) : "";
  const plan = { name, path, exists, text, next: text, changed: false, summary: "" };
  if (undo) {
    const found = exists ? findBlock(text, name) : null;
    if (!exists) plan.summary = "does not exist; nothing to remove";
    else if (!found) plan.summary = "has no harness block; nothing to remove";
    else {
      plan.next = removeBlockAt(text, found);
      plan.changed = true;
      plan.summary = `remove the harness block (lines ${found.startLineNo} to ${found.endLineNo}) and one blank line next to it`;
    }
    return plan;
  }
  const eol = detectEol(text);
  const block = renderBlock(template, eol);
  if (!exists) {
    plan.next = block;
    plan.summary = "does not exist; create it containing only the harness block";
  } else {
    const found = findBlock(text, name);
    if (found) {
      plan.next = text.slice(0, found.startOffset) + block + text.slice(found.endOffset);
      plan.summary = plan.next === text ? "harness block is already current; nothing to change"
        : `replace the harness block (lines ${found.startLineNo} to ${found.endLineNo}) with the current template; nothing outside the markers changes`;
    } else if (text === "") {
      plan.next = block;
      plan.summary = "is empty; write the harness block into it";
    } else {
      plan.next = text + (text.endsWith("\n") ? "" : eol) + eol + block;
      plan.summary = "add the harness block after a blank line at the end; the existing content is kept byte for byte";
    }
  }
  plan.changed = plan.next !== text || !exists;
  return plan;
}

function cmdHarness(argv) {
  const o = parseArgs(argv, { flags: ["apply", "undo"], options: ["file", "dir", "template"] }, "harness");
  if (o.help) { say(HARNESS_HELP); return 0; }
  if (o._.length) refuse(`harness takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} harness --help`);
  if (o.apply && o.undo) refuse("use --apply or --undo, not both");
  if (o.file !== undefined && !HARNESS_FILES.includes(o.file)) refuse(`--file must be CLAUDE.md or AGENTS.md (got "${o.file}")`);
  const dir = resolveExistingDir(o.dir, "--dir");
  const templatePath = resolve(o.template ?? join(SCRIPT_REPO, "templates", "harness.md"));
  const template = o.undo ? null : readHarnessTemplate(templatePath);
  const names = o.file ? [o.file] : HARNESS_FILES;
  // Plan every file before writing any, so a refusal for one file leaves all of them untouched.
  const plans = names.map((name) => planHarnessFile(dir, name, template, o.undo));
  const mode = o.undo ? "undo" : o.apply ? "apply" : "show";
  const again = `${o.file ? ` --file ${o.file}` : ""}${o.dir ? ` --dir ${argPath(dir)}` : ""}${o.template ? ` --template ${argPath(templatePath)}` : ""}`;

  say(`harness (${mode}): project ${tilde(dir)}${template ? `; template ${tilde(templatePath)} (sha256 ${sha12(templateBody(template))})` : ""}`);
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

// ---------- project-settings ----------

const SETTINGS_HELP = `project-settings: show or write the team .claude/settings.json, which declares the company marketplace
(auto-update on) and enables the base plugins for the project.

  project-settings            list every key it would add or change, and print the resulting file; writes nothing
  project-settings --apply    back up an existing file, then write the merged result

Options:
  --dir <folder>                  the project folder (default: the current folder)
  --marketplace-repo owner/repo   point the marketplace at a fork's GitHub repository
  --marketplace-name <name>       rename the marketplace, including the @<name> ending of every enabled plugin
  --template <file>               default: templates/project-settings.json in the skills repo

Merging keeps every key already in the file, including other marketplaces and plugins, and never removes one.
Keys the template sets take the template's value (each change is listed first); a marketplace "source" is replaced
as a whole. An existing file that is not valid JSON is refused (exit 2) and left untouched.`;

const keyPath = (parts) => parts.map((k, i) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? `${i ? "." : ""}${k}` : `[${JSON.stringify(k)}]`)).join("");
const isAtomicSettingsPath = (parts) => parts.length === 3 && parts[0] === "extraKnownMarketplaces" && parts[2] === "source";

// Merge source into target in place, template values winning; returns one line per added or changed key.
function mergeSettings(target, source, parts = [], changes = []) {
  for (const [key, value] of Object.entries(source)) {
    const here = [...parts, key];
    const has = Object.prototype.hasOwnProperty.call(target, key);
    if (isPlainObject(value) && !isAtomicSettingsPath(here)) {
      if (!has) target[key] = {};
      else if (!isPlainObject(target[key])) refuse(`the existing ${keyPath(here)} is ${JSON.stringify(target[key])}, not an object, so the template cannot be merged into it; fix it by hand`);
      mergeSettings(target[key], value, here, changes);
    } else if (!has) {
      target[key] = clone(value);
      changes.push(`add    ${keyPath(here)} = ${JSON.stringify(value)}`);
    } else if (!sameJson(target[key], value)) {
      changes.push(`change ${keyPath(here)}: ${JSON.stringify(target[key])} -> ${JSON.stringify(value)}`);
      target[key] = clone(value);
    }
  }
  return changes;
}

function buildTeamSettings(template, repo, name) {
  const settings = clone(template);
  const markets = settings.extraKnownMarketplaces;
  const names = isPlainObject(markets) ? Object.keys(markets) : [];
  if ((repo !== undefined || name !== undefined) && names.length !== 1) {
    refuse(`--marketplace-repo and --marketplace-name need a template with exactly one marketplace under extraKnownMarketplaces; this template has ${names.length}`);
  }
  if (names.length !== 1) return { settings, marketplace: names.join(", ") || null, original: null };
  const original = names[0];
  if (repo !== undefined) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) refuse(`--marketplace-repo must look like owner/repo (got "${repo}")`);
    const src = markets[original]?.source;
    if (!isPlainObject(src) || src.source !== "github") refuse(`--marketplace-repo applies to a github source, but the template's marketplace "${original}" has source ${JSON.stringify(src)}`);
    src.repo = repo;
  }
  let marketplace = original;
  if (name !== undefined) {
    validateName(name, "--marketplace-name");
    if (name !== original) {
      settings.extraKnownMarketplaces = { [name]: markets[original] };
      if (isPlainObject(settings.enabledPlugins)) {
        const ending = `@${original}`;
        settings.enabledPlugins = Object.fromEntries(Object.entries(settings.enabledPlugins)
          .map(([id, on]) => [id.endsWith(ending) ? `${id.slice(0, -ending.length)}@${name}` : id, on]));
      }
      marketplace = name;
    }
  }
  return { settings, marketplace, original };
}

function readJsonObject(path, what) {
  if (!isFile(path)) refuse(`${what} ${tilde(path)} not found`);
  let value;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch (e) { refuse(`${what} ${tilde(path)} is not valid JSON (${e.message})`); }
  if (!isPlainObject(value)) refuse(`${what} ${tilde(path)} does not hold a JSON object`);
  return value;
}

function cmdProjectSettings(argv) {
  const o = parseArgs(argv, { flags: ["apply"], options: ["dir", "marketplace-repo", "marketplace-name", "template"] }, "project-settings");
  if (o.help) { say(SETTINGS_HELP); return 0; }
  if (o._.length) refuse(`project-settings takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} project-settings --help`);
  const dir = resolveExistingDir(o.dir, "--dir");
  const templatePath = resolve(o.template ?? join(SCRIPT_REPO, "templates", "project-settings.json"));
  const template = readJsonObject(templatePath, "settings template");
  const { settings: team, marketplace, original } = buildTeamSettings(template, o["marketplace-repo"], o["marketplace-name"]);

  const path = join(dir, ".claude", "settings.json");
  const st = statOrNull(path);
  if (st && !st.isFile()) refuse(`${tilde(path)} exists but is not a regular file`);
  const beforeText = st ? readFileSync(path, "utf8") : "";
  let existing = {};
  if (beforeText.trim()) {
    try { existing = JSON.parse(beforeText); } catch (e) { refuse(`${tilde(path)} is not valid JSON, so it was left untouched (${e.message}). Fix it by hand, then run again.`); }
    if (!isPlainObject(existing)) refuse(`${tilde(path)} does not hold a JSON object, so it was left untouched`);
  }
  const merged = clone(existing);
  const changes = mergeSettings(merged, team);
  const resultText = changes.length ? JSON.stringify(merged, null, 2) + "\n" : beforeText;
  const again = `${o.dir ? ` --dir ${argPath(dir)}` : ""}${o["marketplace-repo"] ? ` --marketplace-repo ${o["marketplace-repo"]}` : ""}${o["marketplace-name"] ? ` --marketplace-name ${o["marketplace-name"]}` : ""}${o.template ? ` --template ${argPath(templatePath)}` : ""}`;

  say(`project-settings (${o.apply ? "apply" : "show"}): ${tilde(path)} ${st ? "exists" : "does not exist yet"}`);
  say(`template: ${tilde(templatePath)}; marketplace: ${marketplace ?? "(none declared)"}`);
  if (original && marketplace !== original) {
    const leftovers = [
      ...(isPlainObject(existing.extraKnownMarketplaces) && Object.hasOwn(existing.extraKnownMarketplaces, original) ? [keyPath(["extraKnownMarketplaces", original])] : []),
      ...(isPlainObject(existing.enabledPlugins) ? Object.keys(existing.enabledPlugins).filter((id) => id.endsWith(`@${original}`)).map((id) => keyPath(["enabledPlugins", id])) : []),
    ];
    if (leftovers.length) say(`note: the existing ${leftovers.join(", ")} stay (this command never removes entries). If ${marketplace} replaces ${original}, delete them by hand.`);
  }
  say("");
  if (!changes.length) {
    say("The file already has every key the template sets; nothing to change, nothing written.");
    return 0;
  }
  say(`${changes.length} key(s) to add or change:`);
  for (const c of changes) say(`  ${c}`);
  say("");
  say("Resulting .claude/settings.json:");
  process.stdout.write(resultText);
  say("");
  if (!o.apply) { say(`Nothing written. To write it: ${selfCommand()} project-settings --apply${again}`); return 0; }
  mkdirSync(dirname(path), { recursive: true });
  if (st) say(`backed up to ${tilde(backupFile("project-settings", path, newStamp()))}`);
  writeFileSync(path, resultText);
  say(`wrote ${tilde(path)}`);
  say("Commit this file so the project carries these settings for everyone. How Claude Code offers the marketplace on a machine that has never added it is not verified yet.");
  return 0;
}

// ---------- skills: shared by new-skill and import ----------

const BASE_NOTE = "note: packs/base is the upstream base pack. A company fork leaves packs/base unchanged and adds its own skills under packs/<company>/plugins/, so upstream updates merge cleanly (docs/CONTRACTS.md).";

const listDirNames = (d) => (isDir(d) ? readdirSync(d).filter((n) => isDir(join(d, n))).sort() : []);

function resolveSkillsRepo(value) {
  const repo = resolveExistingDir(value ?? SCRIPT_REPO, "--repo");
  if (!isDir(join(repo, "packs"))) refuse(`${tilde(repo)} has no packs/ folder, so it is not a Skillgate skills repository (point --repo at one)`);
  return repo;
}

function findPlugin(repo, plugin, pack) {
  validateName(plugin, "plugin name");
  if (pack !== undefined) validateName(pack, "--pack");
  const packs = pack !== undefined ? [pack] : listDirNames(join(repo, "packs"));
  const hits = packs.filter((p) => isDir(join(repo, "packs", p, "plugins", plugin)));
  if (!hits.length) {
    const known = listDirNames(join(repo, "packs")).flatMap((p) => listDirNames(join(repo, "packs", p, "plugins")).map((n) => `${n} (pack ${p})`));
    refuse(`no plugin "${plugin}" under packs/${pack ?? "*"}/plugins/ in ${tilde(repo)}. Plugins that exist: ${known.length ? known.join(", ") : "none"}`);
  }
  if (hits.length > 1) refuse(`plugin "${plugin}" exists in more than one pack (${hits.join(", ")}); add --pack <pack> to choose one`);
  const rel = `packs/${hits[0]}/plugins/${plugin}`;
  const dir = join(repo, "packs", hits[0], "plugins", plugin);
  const manifest = join(dir, ".claude-plugin", "plugin.json");
  if (!isFile(manifest)) refuse(`${rel} has no .claude-plugin/plugin.json, so its version cannot be bumped`);
  return { name: plugin, pack: hits[0], dir, rel, manifest, manifestRel: `${rel}/.claude-plugin/plugin.json` };
}

// Plan a patch bump that changes only the version characters of plugin.json, so its formatting survives.
function planVersionBump(manifest, label) {
  const text = readFileSync(manifest, "utf8");
  let obj;
  try { obj = JSON.parse(text); } catch (e) { refuse(`${label} is not valid JSON (${e.message}); fix it first`); }
  const version = obj?.version;
  if (typeof version !== "string") refuse(`${label} has no "version" string; add one (for example "version": "0.1.0") first`);
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) refuse(`${label} has version "${version}", which is not plain MAJOR.MINOR.PATCH, so it cannot be bumped automatically; bump it by hand`);
  const to = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  const re = new RegExp(`("version"\\s*:\\s*")${version.replace(/\./g, "\\.")}(")`, "g");
  const count = (text.match(re) || []).length;
  if (count !== 1) refuse(`${label} has ${count} "version": "${version}" entries; expected exactly one, so a bump would be a guess. Bump it by hand.`);
  const nextText = text.replace(re, (_, open, close) => `${open}${to}${close}`);
  const check = JSON.parse(nextText);
  if (check.version !== to || !sameJson({ ...check, version }, obj)) refuse(`bumping ${label} did not produce the expected file; bump it by hand`);
  return { from: version, to, nextText };
}

function writeVersionBump(command, plugin, bump) {
  say(`backed up ${plugin.manifestRel} to ${tilde(backupFile(command, plugin.manifest, newStamp()))}`);
  writeFileSync(plugin.manifest, bump.nextText);
  say(`bumped ${plugin.name} version ${bump.from} -> ${bump.to} (installed copies only update when the version changes)`);
}

// ---------- new-skill ----------

const NEW_SKILL_HELP = `new-skill: create a skill inside a plugin, and bump the plugin's version.

  new-skill <plugin> <skill> [--pack <pack>] [--description "<text>"] [--repo <skills repo>]

Creates packs/<pack>/plugins/<plugin>/skills/<skill>/SKILL.md with frontmatter (name, description) and a short body
to fill in (When to use, Steps, What done looks like), then bumps the patch number of "version" in the plugin's
.claude-plugin/plugin.json: installed copies only update when that version changes (docs/CONTRACTS.md).
Names use lowercase letters, digits, and hyphens. Without --description the description is a TODO(skillgate)
placeholder; replace it, because Claude reads that line to decide when to use the skill.
--pack picks between plugins with the same name in different packs. --repo defaults to the repo this script is in.
Refuses (exit 2), changing nothing, if the skill already exists or a name is not allowed.`;

const DESCRIPTION_PLACEHOLDER = "TODO(skillgate) Replace this line. Say what this skill does and exactly when Claude should use it; Claude reads this line to decide whether to load the skill.";

// One-line YAML value: plain when that is unambiguous, otherwise double-quoted (JSON string syntax is valid YAML).
// Words YAML reads as booleans or null, and anything numeric, are quoted so they stay text.
function yamlScalar(text) {
  const special = /^(?:true|false|yes|no|on|off|y|n|null)$/i.test(text) || (/^[-+.\d]/.test(text) && !Number.isNaN(Number(text)));
  const plain = !special && /^[A-Za-z0-9(]/.test(text) && !/[\x00-\x1f\x7f]/.test(text) && !text.includes(": ") && !text.includes(" #") && !text.endsWith(":") && !/\s$/.test(text);
  return plain ? text : JSON.stringify(text);
}

function validateDescription(text) {
  if (!text.trim()) refuse("--description is empty; leave it out to get a clearly marked TODO placeholder instead");
  if (/[\r\n]/.test(text)) refuse("--description must be a single line");
  if (text.length > 1024) refuse(`--description is ${text.length} characters; keep it to 1024 or fewer`);
}

function skillSkeleton(name, description) {
  return [
    "---",
    `name: ${name}`,
    `description: ${yamlScalar(description ?? DESCRIPTION_PLACEHOLDER)}`,
    "---",
    "",
    `# ${name}`,
    "",
    "## When to use",
    "",
    "TODO(skillgate) The situations where this skill applies, and the ones where it does not.",
    "",
    "## Steps",
    "",
    "1. TODO(skillgate) The first thing to do.",
    "2. TODO(skillgate) The next thing to do.",
    "",
    "## What done looks like",
    "",
    "TODO(skillgate) The result that shows the work is finished, and how to check it.",
    "",
  ].join("\n");
}

function cmdNewSkill(argv) {
  const o = parseArgs(argv, { flags: [], options: ["pack", "description", "repo"] }, "new-skill");
  if (o.help) { say(NEW_SKILL_HELP); return 0; }
  if (o._.length !== 2) refuse(`new-skill needs exactly two names, the plugin and the new skill: new-skill <plugin> <skill> (got ${o._.length})`);
  const [pluginName, skillName] = o._;
  validateName(skillName, "skill name");
  if (o.description !== undefined) validateDescription(o.description);
  const repo = resolveSkillsRepo(o.repo);
  const plugin = findPlugin(repo, pluginName, o.pack);
  const skillRel = `${plugin.rel}/skills/${skillName}`;
  const skillDir = join(plugin.dir, "skills", skillName);
  if (existsSync(skillDir)) refuse(`${skillRel} already exists; nothing was changed. Choose another name, or edit the existing skill.`);
  const bump = planVersionBump(plugin.manifest, plugin.manifestRel);

  say(`new-skill: in ${tilde(repo)}`);
  say(`  will create ${skillRel}/SKILL.md`);
  say(`  will bump   ${plugin.manifestRel} version ${bump.from} -> ${bump.to}`);
  if (plugin.pack === "base") say(BASE_NOTE);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillSkeleton(skillName, o.description), { flag: "wx" });
  say(`created ${skillRel}/SKILL.md`);
  writeVersionBump("new-skill", plugin, bump);
  say("");
  say(o.description === undefined
    ? "Next: replace every TODO(skillgate) line in the new SKILL.md, starting with the description in its frontmatter."
    : "Next: replace the TODO(skillgate) lines in the body of the new SKILL.md.");
  return 0;
}

// ---------- import ----------

const IMPORT_HELP = `import: copy an existing skill folder into a plugin, after scanning it.

  import <skill-dir> --into <plugin> [--pack <pack>] [--name <skill>] [--repo <skills repo>]

Before anything is copied, every file in <skill-dir> is scanned twice:
  1. scripts/scrub-check.sh --path <skill-dir>: denylisted names, em or en dashes, home-directory paths.
     The name scan needs a denylist (SKILLGATE_DENYLIST, default ~/.config/skilliton/denylist). Without one the
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

const SECRET_RULES = [
  { rule: "aws-access-key-id", re: /AKIA[0-9A-Z]{16}/ },
  { rule: "anthropic-api-key", re: /sk-ant-/ },
  { rule: "github-token", re: /ghp_/ },
  { rule: "github-fine-grained-token", re: /github_pat_/ },
  { rule: "slack-token", re: /xox[baprs]-/ },
  { rule: "stripe-live-secret-key", re: /sk_live_/ },
  { rule: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: "home-directory-path", re: /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/|\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+[\\/]/ },
];

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

function scanSecrets(root, files) {
  const hits = [], binary = [];
  for (const rel of files) {
    const bytes = readFileSync(join(root, rel));
    if (bytes.subarray(0, 8000).includes(0)) { binary.push(rel); continue; }
    bytes.toString("latin1").split("\n").forEach((line, i) => {
      for (const { rule, re } of SECRET_RULES) if (re.test(line)) hits.push({ file: rel, line: i + 1, rule });
    });
  }
  return { hits, binary };
}

function runScrubCheck(dir) {
  const script = join(SCRIPT_REPO, "scripts", "scrub-check.sh");
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

function cmdImport(argv) {
  const o = parseArgs(argv, { flags: [], options: ["into", "pack", "name", "repo"] }, "import");
  if (o.help) { say(IMPORT_HELP); return 0; }
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
  const scrub = runScrubCheck(src);
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
  else if (scrub.status === 2) reasons.push("the scrub check did not complete, so names were not scanned. Set SKILLGATE_DENYLIST to a denylist file with one name pattern per line (a file holding only comments means no names to block)");
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

// ---------- doctor: helpers ----------

const DOCTOR_HELP = `doctor: check this machine and one project for Skillgate, one line per check. Writes nothing.

  doctor [--dir <project folder>]

Checks: Claude Code on PATH and its version, plus any copy inside a VS Code, Cursor, or Windsurf extension (the
two can differ); whether the marketplace named in this repo's .claude-plugin/marketplace.json is added, and which
base plugins are installed and enabled; whether auto-update is on for it; whether CLAUDE.md and AGENTS.md hold
the current harness block; whether .skillgate/config.json parses; whether .claude/settings.json declares the
marketplace and plugins; and the tools the hooks call (jq, node, python3, git).

Each line starts with OK, MISSING, WARN, or UNVERIFIED. A line ending in [required] is a required check that is
not OK. Exit 0 when every required check is OK, 1 otherwise; the last line says what to do next.`;

const versionOf = (text) => /^(\d+\.\d+\.\d+)/.exec(String(text).trim())?.[1] ?? null;
function cmpVersion(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// Copies of Claude Code bundled inside editor extensions. The resources/native-binary layout was measured for
// VS Code only; the other editor folders are checked the same way and reported as unknown when it differs.
function findEditorCopies() {
  const copies = [];
  for (const editor of [".vscode", ".vscode-insiders", ".cursor", ".windsurf"]) {
    const ext = join(HOME, editor, "extensions");
    for (const name of listDirNames(ext).filter((n) => n.startsWith("anthropic.claude-code-"))) {
      const where = join(ext, name);
      const bin = ["claude", "claude.exe"].map((b) => join(where, "resources", "native-binary", b)).find(isFile);
      if (!bin) { copies.push({ where, path: null, version: null, failure: "no resources/native-binary/claude inside it" }); continue; }
      const r = runProgram(bin, ["--version"]);
      copies.push({ where, path: bin, version: r.ok ? versionOf(r.stdout) : null, failure: r.ok ? (versionOf(r.stdout) ? null : "printed no version") : r.failure });
    }
  }
  return copies;
}

function parseJsonArray(stdout) {
  const attempts = [stdout.trim(), stdout.slice(stdout.indexOf("["), stdout.lastIndexOf("]") + 1)];
  for (const attempt of attempts) {
    if (!attempt) continue;
    try { const v = JSON.parse(attempt); if (Array.isArray(v)) return v; } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
  }
  return null;
}

function readJsonMaybe(path, problems) {
  if (!isFile(path)) return undefined;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) {
    problems.push(`${tilde(path)} ${e instanceof SyntaxError ? "does not parse" : `could not be read (${e.code ?? e.message})`}`);
    return undefined;
  }
}

const settingsFiles = (dir) => [
  { label: "~/.claude/settings.json", path: join(HOME, ".claude", "settings.json") },
  { label: ".claude/settings.json", path: join(dir, ".claude", "settings.json") },
  { label: ".claude/settings.local.json", path: join(dir, ".claude", "settings.local.json") },
];

// Claude Code's own record files. Their format is not documented; shapes below were read on 2.1.92.
function readLocalPluginFiles(dir) {
  const problems = [];
  const knownPath = join(HOME, ".claude", "plugins", "known_marketplaces.json");
  const installedPath = join(HOME, ".claude", "plugins", "installed_plugins.json");
  for (const p of [knownPath, installedPath]) if (!isFile(p)) problems.push(`${tilde(p)} not found`);
  const known = readJsonMaybe(knownPath, problems);
  const installed = readJsonMaybe(installedPath, problems);
  const marketplaces = isPlainObject(known) ? Object.entries(known).map(([name, v]) => ({
    name, source: v?.source?.source ?? null, repo: v?.source?.repo ?? null, path: v?.source?.path ?? null,
    autoUpdate: typeof v?.autoUpdate === "boolean" ? v.autoUpdate : null,
  })) : [];
  // Enabled state lives in settings files (measured: installing writes enabledPlugins; installed_plugins.json has no
  // enabled field). Later files override earlier ones: user, then project, then local. Managed settings are not read.
  const enabled = {};
  for (const f of settingsFiles(dir)) {
    const s = readJsonMaybe(f.path, problems);
    if (isPlainObject(s?.enabledPlugins)) Object.assign(enabled, s.enabledPlugins);
  }
  const plugins = isPlainObject(installed?.plugins) ? Object.entries(installed.plugins).map(([id, installs]) => {
    const list = Array.isArray(installs) ? installs : [];
    return { id, version: list[0]?.version ?? null, scope: list.map((x) => x?.scope).filter(Boolean).join("+") || null, enabled: typeof enabled[id] === "boolean" ? enabled[id] : null };
  }) : [];
  return { marketplaces, plugins, problems, knownRaw: isPlainObject(known) ? known : {} };
}

function gatherPluginRecords(cli, dir) {
  const why = [], via = [];
  let plugins = null, marketplaces = null;
  if (!cli) why.push("no working claude command to ask");
  else if (!isFile(join(HOME, ".claude.json"))) why.push(`Claude Code has not run under this home folder yet (no ~/.claude.json), and "claude plugin list" would create that file`);
  else {
    const ask = (args, label, valid, map) => {
      const help = runProgram(cli.path, [...args, "--help"]);
      if (!/--json\b/.test(help.stdout + help.stderr)) { why.push(`"claude ${args.join(" ")}" on ${cli.version} has no --json option`); return null; }
      const r = runProgram(cli.path, [...args, "--json"], 60000);
      const list = r.ok ? parseJsonArray(r.stdout) : null;
      if (!list || !list.every(valid)) { why.push(`"claude ${args.join(" ")} --json" ${r.ok ? "printed something other than the expected list" : `failed: ${r.failure}`}`); return null; }
      via.push(`claude ${args.join(" ")} --json`);
      return list.map(map);
    };
    plugins = ask(["plugin", "list"], "plugins", (p) => isPlainObject(p) && typeof p.id === "string",
      (p) => ({ id: p.id, version: p.version ?? null, scope: p.scope ?? null, enabled: typeof p.enabled === "boolean" ? p.enabled : null }));
    marketplaces = ask(["plugin", "marketplace", "list"], "marketplaces", (m) => isPlainObject(m) && typeof m.name === "string",
      (m) => ({ name: m.name, source: m.source ?? null, repo: m.repo ?? null, path: m.path ?? null, autoUpdate: typeof m.autoUpdate === "boolean" ? m.autoUpdate : null }));
  }
  const local = readLocalPluginFiles(dir);
  const fromFiles = !plugins || !marketplaces;
  const result = { plugins: plugins ?? local.plugins, marketplaces: marketplaces ?? local.marketplaces, marketplacesFromCli: !!marketplaces, local };
  if (!fromFiles) return { ...result, status: "OK", detail: `from ${via.join(" and ")} (Claude Code ${cli.version})` };
  const partly = via.length ? `${via.join(" and ")} answered; the rest was ` : "";
  const missing = local.problems.length ? `; ${local.problems.join("; ")}` : "";
  return { ...result, status: "UNVERIFIED", detail: `${partly}read from Claude Code's local files; format not documented (${why.join("; ")})${missing}` };
}

function readCatalog() {
  const path = join(SCRIPT_REPO, ".claude-plugin", "marketplace.json");
  const problems = [];
  const c = readJsonMaybe(path, problems);
  if (c === undefined) return { name: null, plugins: [], error: problems[0] ?? `${tilde(path)} not found` };
  if (typeof c?.name !== "string") return { name: null, plugins: [], error: `${tilde(path)} has no "name"` };
  return { name: c.name, plugins: Array.isArray(c.plugins) ? c.plugins.filter((p) => isPlainObject(p) && typeof p.name === "string") : [], error: null };
}

function readTeamTemplate() {
  const v = readJsonMaybe(join(SCRIPT_REPO, "templates", "project-settings.json"), []);
  return isPlainObject(v) ? v : null;
}

function readPluginVersion(pluginDir) {
  const v = readJsonMaybe(join(pluginDir, ".claude-plugin", "plugin.json"), []);
  return typeof v?.version === "string" ? v.version : null;
}

function listHookFiles(repo) {
  const out = [];
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile()) out.push({ rel: relative(repo, p), name: ent.name, text: readFileSync(p, "utf8") });
    }
  };
  for (const pack of listDirNames(join(repo, "packs"))) {
    for (const plugin of listDirNames(join(repo, "packs", pack, "plugins"))) {
      const hooks = join(repo, "packs", pack, "plugins", plugin, "hooks");
      if (isDir(hooks)) walk(hooks);
    }
  }
  return out;
}

// Does a hook file call this tool? Comment lines are ignored, except a #! first line.
function referencesTool(text, tool) {
  const code = text.split("\n").filter((line, i) => !(/^\s*#/.test(line) && !(i === 0 && line.startsWith("#!")))).join("\n");
  return new RegExp(`(^|[\\s;|&(\`$"'/])${tool}($|[\\s;|&)"'])`, "m").test(code);
}

const KNOWN_CONFIG_SECTIONS = ["handoff", "maintain", "dispatch", "guardrails"];

// ---------- doctor ----------

function cmdDoctor(argv) {
  const o = parseArgs(argv, { flags: [], options: ["dir"] }, "doctor");
  if (o.help) { say(DOCTOR_HELP); return 0; }
  if (o._.length) refuse(`doctor takes no plain arguments (got "${o._[0]}"); see: ${selfCommand()} doctor --help`);
  const dir = resolveExistingDir(o.dir, "--dir");
  const dirArg = o.dir ? ` --dir ${argPath(dir)}` : "";
  const checks = [];
  const report = (status, label, detail, { required = false, next = null } = {}) => {
    checks.push({ status, label, required, next });
    say(`${status.padEnd(10)} ${label}: ${detail}${required && status !== "OK" ? " [required]" : ""}`);
  };
  // A check that throws is reported as a check that could not run, never skipped.
  const guarded = (label, required, fn) => {
    try { fn(); } catch (e) {
      report("UNVERIFIED", label, `this check could not run (${e.message})`, { required, next: `rerun doctor with SKILLGATE_DEBUG=1 and report the "${label}" failure` });
      if (process.env.SKILLGATE_DEBUG) console.error(e.stack);
    }
  };

  say("skillgate doctor (writes nothing)");
  say(`project: ${tilde(dir)}`);
  say(`skills repo: ${tilde(SCRIPT_REPO)}`);
  say("");

  // Claude Code, in the terminal and inside editors.
  let editors = [], editorsError = null, cli = null;
  try { editors = findEditorCopies(); } catch (e) { editorsError = e.message; }
  guarded("Claude Code (terminal)", true, () => {
    const path = which("claude");
    if (path) {
      const r = runProgram(path, ["--version"]);
      const version = r.ok ? versionOf(r.stdout) : null;
      if (version) { cli = { path, version }; report("OK", "Claude Code (terminal)", `${version} at ${tilde(path)}`, { required: true }); }
      else report("WARN", "Claude Code (terminal)", `${tilde(path)} exists, but "claude --version" ${r.ok ? "printed no version" : `failed: ${r.failure}`}`, { required: true, next: "reinstall Claude Code" });
    } else if (editors.some((e) => e.version)) {
      report("WARN", "Claude Code (terminal)", `"claude" is not on PATH, so terminal commands such as "claude plugin" are unavailable; an editor extension has its own copy`);
    } else {
      report("MISSING", "Claude Code", `"claude" is not on PATH and no editor extension copy was found`, { required: true, next: "install Claude Code" });
    }
  });
  if (editorsError) report("UNVERIFIED", "Claude Code (editor)", `could not look for editor copies (${editorsError})`);
  else if (!editors.length) report("OK", "Claude Code (editor)", "no VS Code, Cursor, or Windsurf extension copy found; nothing to compare");
  for (const e of editors) {
    if (!e.version) report("UNVERIFIED", "Claude Code (editor)", `${tilde(e.where)}: version unknown (${e.failure})`);
    else if (cli && e.version !== cli.version) report("WARN", "Claude Code (editor)", `${e.version} in ${tilde(e.where)}, but the terminal has ${cli.version}; features and plugin commands can differ between the two, so update whichever is older`);
    else report("OK", "Claude Code (editor)", `${e.version} in ${tilde(e.where)}${cli ? " (same as the terminal)" : ""}`);
  }
  if (!cli) {
    const newest = editors.filter((e) => e.version).sort((a, b) => cmpVersion(a.version, b.version)).pop();
    if (newest) cli = { path: newest.path, version: newest.version };
  }
  if (process.env.CLAUDE_CONFIG_DIR) report("WARN", "CLAUDE_CONFIG_DIR", "is set; doctor reads ~/.claude and ~/.claude.json only, so the plugin lines below may not describe the configuration Claude Code actually uses");

  // Marketplace, base plugins, auto-update.
  const catalog = readCatalog();
  const market = catalog.name ?? "skillgate";
  const template = readTeamTemplate();
  const templateRepo = template ? Object.values(template.extraKnownMarketplaces ?? {}).map((m) => m?.source?.repo).find((r) => typeof r === "string") : null;
  let records = null;
  guarded("plugin records", false, () => {
    records = gatherPluginRecords(cli, dir);
    report(records.status, "plugin records", records.detail);
  });
  guarded(`marketplace ${market}`, true, () => {
    if (catalog.error) report("WARN", "marketplace catalog", `${catalog.error}; assuming the marketplace is named "skillgate"`);
    if (!records) { report("UNVERIFIED", `marketplace ${market}`, "not checked: plugin records could not be read", { required: true, next: "fix the plugin records problem above" }); return; }
    const m = records.marketplaces.find((x) => x.name === market);
    const source = m && (m.repo ? `github ${m.repo}` : m.path ? `folder ${tilde(m.path)}` : `source ${m.source ?? "not reported"}`);
    if (m) report("OK", `marketplace ${market}`, `added (${source})`, { required: true });
    else report("MISSING", `marketplace ${market}`, "not added on this machine", { required: true, next: `add the ${market} marketplace: ${templateRepo ? `claude plugin marketplace add ${templateRepo}` : "/plugin inside Claude Code"}` });
  });
  guarded("base plugins", true, () => {
    const baseDirs = listDirNames(join(SCRIPT_REPO, "packs", "base", "plugins"));
    const base = catalog.plugins.filter((p) => baseDirs.includes(p.name) || (typeof p.source === "string" && p.source.replace(/^\.\//, "").startsWith("packs/base/")));
    if (!records || !base.length) {
      report("UNVERIFIED", "base plugins", !records ? "not checked: plugin records could not be read" : "the catalog lists no plugin from packs/base, so there is nothing to check", { required: true, next: "list the base plugins in .claude-plugin/marketplace.json of the skills repo" });
      return;
    }
    for (const bp of base) {
      const id = `${bp.name}@${market}`;
      const rec = records.plugins.find((p) => p.id === id);
      const checkout = readPluginVersion(join(SCRIPT_REPO, "packs", "base", "plugins", bp.name));
      const here = checkout ? `; this checkout has ${checkout}` : "";
      if (!rec) report("MISSING", id, `not installed${here}`, { required: true, next: `install the missing base plugins: claude plugin install <plugin>@${market} (or /plugin inside Claude Code)` });
      else if (rec.enabled === true) report("OK", id, `installed ${rec.version ?? "(version not reported)"}${rec.scope ? ` (${rec.scope} scope)` : ""}, enabled${here}`, { required: true });
      else report("WARN", id, `installed ${rec.version ?? "(version not reported)"} but ${rec.enabled === false ? "disabled" : "not enabled in any settings file doctor reads"}${here}`, { required: true, next: `enable the disabled base plugins: claude plugin enable <plugin>@${market} (or /plugin inside Claude Code)` });
    }
  });
  guarded("skills repo catalog", false, () => {
    const listed = catalog.plugins.map((p) => p.name);
    const baseDirs = listDirNames(join(SCRIPT_REPO, "packs", "base", "plugins"));
    const enabledByTemplate = isPlainObject(template?.enabledPlugins) ? Object.keys(template.enabledPlugins).map((id) => id.split("@")[0]) : [];
    const templateMarkets = isPlainObject(template?.extraKnownMarketplaces) ? Object.keys(template.extraKnownMarketplaces) : [];
    const problems = [];
    const unlisted = baseDirs.filter((d) => !listed.includes(d));
    const notInCatalog = enabledByTemplate.filter((n) => !listed.includes(n));
    if (unlisted.length) problems.push(`packs/base/plugins holds ${unlisted.join(", ")}, which .claude-plugin/marketplace.json does not list, so it cannot be installed`);
    if (notInCatalog.length) problems.push(`templates/project-settings.json enables ${notInCatalog.join(", ")}, which the catalog does not list`);
    if (templateMarkets.length && !templateMarkets.includes(market)) problems.push(`templates/project-settings.json names the marketplace ${templateMarkets.join(", ")}, but the catalog is named ${market}`);
    if (problems.length) report("WARN", "skills repo catalog", problems.join("; "));
    else report("OK", "skills repo catalog", `lists all ${baseDirs.length} base plugin folder(s) and every plugin the team template enables`);
  });
  guarded(`auto-update (${market})`, false, () => {
    const label = `auto-update (${market})`;
    const how = `open /plugin inside Claude Code and look at the ${market} marketplace's auto-update setting`;
    const m = records?.marketplaces.find((x) => x.name === market);
    if (!m) { report("UNVERIFIED", label, "the marketplace is not added, so there is nothing to check yet"); return; }
    if (records.marketplacesFromCli && typeof m.autoUpdate === "boolean") { report(m.autoUpdate ? "OK" : "WARN", label, `${m.autoUpdate ? "on" : "off"} (reported by claude plugin marketplace list)`); return; }
    const local = records.local.knownRaw[market];
    if (typeof local?.autoUpdate === "boolean") { report(local.autoUpdate ? "OK" : "WARN", label, `${local.autoUpdate ? "on" : "off"} (read from Claude Code's local files; format not documented)`); return; }
    const declared = settingsFiles(dir).flatMap((f) => {
      const v = readJsonMaybe(f.path, [])?.extraKnownMarketplaces?.[market]?.autoUpdate;
      return typeof v === "boolean" ? [`${f.label} declares autoUpdate: ${v}`] : [];
    });
    report("UNVERIFIED", label, `not recorded anywhere doctor can read${declared.length ? `; ${declared.join(", ")}, but whether Claude Code applied it is not confirmed` : ""}. To check: ${how}`);
  });

  // The harness block in this project.
  let harnessTemplate = null;
  guarded("harness template", true, () => { harnessTemplate = readHarnessTemplate(join(SCRIPT_REPO, "templates", "harness.md")); });
  const writeHarness = `write the harness block: ${selfCommand()} harness --apply${dirArg}`;
  for (const name of HARNESS_FILES) {
    guarded(name, true, () => {
      if (!harnessTemplate) { report("UNVERIFIED", name, "not compared: the harness template could not be read", { required: true, next: "restore templates/harness.md in the skills repo" }); return; }
      const path = join(dir, name);
      if (!isFile(path)) { report("MISSING", name, "does not exist, so it has no harness block", { required: true, next: writeHarness }); return; }
      const text = readBytes(path);
      let found;
      try { found = findBlock(text, name); } catch (e) {
        if (!(e instanceof Refused)) throw e;
        report("WARN", name, e.message, { required: true, next: `fix the harness markers by hand as described, then ${writeHarness}` });
        return;
      }
      if (!found) { report("MISSING", name, "has no harness block", { required: true, next: writeHarness }); return; }
      const have = sha12(text.slice(found.innerStart, found.innerEnd).replace(/\r\n/g, "\n")), want = sha12(templateBody(harnessTemplate));
      if (have === want && found.version === "1") report("OK", name, `harness block present and matches the current template (sha256 ${have})`, { required: true });
      else report("WARN", name, `harness block differs from the current template (block sha256 ${have}${found.version !== "1" ? `, marker v${found.version}` : ""}; template sha256 ${want})`, { required: true, next: writeHarness });
    });
  }

  // Project configuration.
  guarded(".skillgate/config.json", true, () => {
    const path = join(dir, ".skillgate", "config.json");
    if (!existsSync(path)) { report("OK", ".skillgate/config.json", "not present; it is optional and every key has a default"); return; }
    let cfg;
    try { cfg = JSON.parse(readFileSync(path, "utf8")); } catch (e) {
      report("WARN", ".skillgate/config.json", `exists but does not parse (${e.message})`, { required: true, next: "fix .skillgate/config.json so it is valid JSON" });
      return;
    }
    if (!isPlainObject(cfg)) { report("WARN", ".skillgate/config.json", "parses, but does not hold a JSON object", { required: true, next: "fix .skillgate/config.json so it holds a JSON object" }); return; }
    const sections = Object.keys(cfg);
    const unknown = sections.filter((s) => !KNOWN_CONFIG_SECTIONS.includes(s));
    report("OK", ".skillgate/config.json", `parses; sections: ${sections.length ? sections.join(", ") : "none"}`);
    if (unknown.length) report("WARN", ".skillgate/config.json", `unknown section(s) ${unknown.join(", ")} (known: ${KNOWN_CONFIG_SECTIONS.join(", ")}); a misspelled section is ignored silently by the components`);
  });
  guarded(".claude/settings.json", false, () => {
    const path = join(dir, ".claude", "settings.json");
    const expected = isPlainObject(template?.enabledPlugins) ? Object.keys(template.enabledPlugins).map((id) => `${id.split("@")[0]}@${market}`) : [];
    const fix = `to write it: ${selfCommand()} project-settings --apply${dirArg}`;
    if (!isFile(path)) { report("WARN", ".claude/settings.json", `not present, so this project does not declare the ${market} marketplace or enable its plugins for the people who open it (${fix})`); return; }
    let s;
    try { s = JSON.parse(readFileSync(path, "utf8")); } catch (e) { report("WARN", ".claude/settings.json", `does not parse (${e.message})`); return; }
    const hasMarket = isPlainObject(s?.extraKnownMarketplaces?.[market]);
    const notEnabled = expected.filter((id) => s?.enabledPlugins?.[id] !== true);
    if (hasMarket && !notEnabled.length) report("OK", ".claude/settings.json", `declares the ${market} marketplace and enables ${expected.length ? expected.join(", ") : "every plugin the template enables (none)"}`);
    else report("WARN", ".claude/settings.json", [hasMarket ? null : `does not declare the ${market} marketplace`, notEnabled.length ? `does not enable ${notEnabled.join(", ")}` : null].filter(Boolean).join("; ") + ` (${fix})`);
  });

  // Tools the hooks call. A tool is required only when a hook file in this repo calls it.
  guarded("hook tools", true, () => {
    const hookFiles = listHookFiles(SCRIPT_REPO);
    for (const tool of ["jq", "node", "python3", "git"]) {
      const found = which(tool);
      const users = hookFiles.filter((f) => referencesTool(f.text, tool)).map((f) => f.name);
      const usage = users.length ? `called by ${users.length} hook file(s): ${users.join(", ")}` : `no hook file in this repo calls it today (checked ${hookFiles.length})`;
      if (found) report("OK", tool, `${tilde(found)}; ${usage}`);
      else if (users.length) report("MISSING", tool, `not found on PATH; ${usage}`, { required: true, next: `install ${tool}` });
      else report("WARN", tool, `not found on PATH; ${usage}`);
    }
  });

  const failing = checks.filter((c) => c.required && c.status !== "OK");
  const notes = checks.filter((c) => !c.required && c.status !== "OK").length;
  say("");
  if (!failing.length) {
    say(`Summary: everything required is in place.${notes ? ` ${notes} other line(s) above are WARN or UNVERIFIED; they do not block anything, but read them.` : ""}`);
    return 0;
  }
  const steps = [...new Set(failing.map((c) => c.next).filter(Boolean))];
  say(`Summary: ${failing.length} required check(s) need attention. Next: ${steps.length ? steps.join("; then ") : "read the lines marked [required]"}; then run doctor again.`);
  return 1;
}

// ---------- entry point ----------

const HELP = `Skillgate command line. Commands that write show their change first.

  doctor             check Claude Code, the marketplace, base plugins, harness block, config, and hook tools (writes nothing)
  harness            show the harness block change for CLAUDE.md and AGENTS.md; --apply writes it, --undo removes it
  project-settings   show the team .claude/settings.json built from the template; --apply merges it into the project
  new-skill          create a SKILL.md skeleton in a plugin and bump the plugin's version
  import             scan an existing skill folder, then copy it into a plugin and bump the plugin's version

Details for one command: node scripts/skillgate.mjs <command> --help
Exit codes: 0 success; 1 a required doctor check is not OK; 2 refused (the reason is printed, nothing written);
3 unexpected internal error (a bug in this script).`;

const COMMANDS = { doctor: cmdDoctor, harness: cmdHarness, "project-settings": cmdProjectSettings, "new-skill": cmdNewSkill, import: cmdImport };

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") { say(HELP); return 0; }
  if (!Object.hasOwn(COMMANDS, command)) refuse(`unknown command "${command}". Run: ${selfCommand()} --help`);
  return COMMANDS[command](rest);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof Refused) {
    console.error(`skillgate: refused: ${e.message}`);
    process.exitCode = 2;
  } else {
    console.error(`skillgate: unexpected internal error: ${e?.message ?? e}. This is a bug in skillgate; steps printed above completed, and nothing after them ran.${process.env.SKILLGATE_DEBUG ? `\n${e?.stack}` : " Set SKILLGATE_DEBUG=1 to see where it happened."}`);
    process.exitCode = 3;
  }
}
