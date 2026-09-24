// core.mjs: the shared helpers of the Skilliton command line: refusals, argument parsing, backups, unified diffs,
// byte-exact reads and writes, the secret scan, and the little a command needs to know about a company skills
// repository. Node only, no dependencies. The entry point is ../skilliton.mjs; scripts/skilliton.mjs in a company
// skills repo and bin/skilliton in an installed plugin both run it.
//
// Every command is a module in ../commands/, and a command with real machinery keeps it in a lib/ file beside this
// one: harness.mjs, doctor.mjs, skills-repo.mjs, fork.mjs, gate.mjs, prepare.mjs and the rest. Nothing is dispatched
// from here.
//
// This file lives inside the workflow plugin so that an installed copy of the plugin carries the exact runtime its
// version was released with. Nothing here may import from outside the plugin folder.
//
// The contract is docs/CONTRACTS.md (the "CLI" table). Every writing command prints its change first, writes only
// with --apply or its own explicit verb (harness --undo, new-skill, import), and backs up any file it overwrites to
// $SKILLITON_BACKUPS/<command>/<timestamp>/ (default root ~/.claude/backups/skilliton, the same root setup.mjs uses).
//
// Exit codes (every command): 0 complete; 1 attention (an evaluated state needs action, for example a required doctor
// check is not OK); 2 invalid or refused, with the reason printed (a refusal happens before anything is written);
// 3 operation failed (an unexpected internal error or a failed write).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync, constants as fsConstants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CREDENTIAL_SHAPES, SIGNED_TOKEN_ERE } from "./secret-rules.mjs";
const RUNTIME_LIB = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(RUNTIME_LIB, "..", "..");
// A company skills repository (a fork of this one) holds this plugin at <repo>/packs/<pack>/plugins/<plugin>/. An
// installed copy, such as Claude Code's plugin cache, has no repository around it, so SKILLS_REPO is null there and
// the commands that need one ask for --repo or --template instead of guessing.
const SKILLS_REPO = (() => {
  const candidate = resolve(PLUGIN_ROOT, "..", "..", "..", "..");
  return existsSync(join(candidate, ".claude-plugin", "marketplace.json")) && existsSync(join(candidate, "packs")) ? candidate : null;
})();

const HOME = homedir();
const BACKUPS = process.env.SKILLITON_BACKUPS || join(HOME, ".claude", "backups", "skilliton");

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

// Why a write to rel inside root would land outside it, or null. Each component below root is read with lstat: a
// symbolic link on the way, which a repository can commit, is followed only when it resolves inside root (AGENTS.md
// linked to CLAUDE.md is a common setup); one that leaves root, or whose target does not exist, would carry the write
// wherever it points and is refused. A file with a second hard link is refused, because writing it would change another
// file's bytes. root itself is not checked: it is the folder the person named.
// The same check for a planned file that carries its absolute path and its repository-relative path.
const linkedFileProblem = (f) => linkedWriteProblem(f.path.slice(0, f.path.length - f.rel.length) || ".", f.rel);

function linkedWriteProblem(root, rel) {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  const realRoot = realpathSync(root);
  let at = root;
  for (let i = 0; i < parts.length; i++) {
    at = join(at, parts[i]);
    let st;
    try { st = lstatSync(at); } catch (e) { if (e.code === "ENOENT" || e.code === "ENOTDIR") return null; throw e; }
    const shown = parts.slice(0, i + 1).join("/");
    if (st.isSymbolicLink()) {
      let real = null;
      try { real = realpathSync(at); } catch { real = null; }
      if (real === null) return `${shown} is a symbolic link whose target does not exist, and Skilliton never writes through one`;
      const inside = relative(realRoot, real);
      if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
        return `${shown} is a symbolic link to a place outside this repository, and Skilliton never writes through one`;
      }
      st = statSync(at);
    }
    if (i === parts.length - 1 && st.isFile() && st.nlink > 1) return `${shown} has ${st.nlink} hard links, so writing it would change another file`;
  }
  return null;
}
const isFile = (p) => statOrNull(p)?.isFile() === true;

// Shorten a path for display: inside HOME becomes ~/...
function tilde(p) {
  if (p === HOME) return "~";
  return p.startsWith(HOME + sep) ? "~" + p.slice(HOME.length) : p;
}

// The command a person should type to run this script again, from where they are now.
function selfCommand() {
  if (process.env.SKILLITON_SELF) return process.env.SKILLITON_SELF;
  const entry = process.argv[1] ? resolve(process.argv[1]) : join(PLUGIN_ROOT, "runtime", "skilliton.mjs");
  const rel = relative(process.cwd(), entry);
  return `node ${rel.startsWith(".." + sep + ".." + sep) || rel === "" ? tilde(entry) : rel}`;
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

// Find an executable on PATH without shelling out. A candidate this process may not inspect (a folder without search
// permission, or a sandbox that denies stat) is skipped like a missing one, because a later PATH entry may hold the tool.
const UNINSPECTABLE = new Set(["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP", "ENAMETOOLONG"]);
function which(tool) {
  const exts = process.platform === "win32" && !/\.(exe|cmd|bat|com)$/i.test(tool) ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, tool + ext);
      let st;
      try { st = statSync(candidate); } catch (e) { if (UNINSPECTABLE.has(e.code)) continue; throw e; }
      if (!st.isFile()) continue;
      try { accessSync(candidate, fsConstants.X_OK); return candidate; } catch (e) { if (e.code !== "EACCES" && e.code !== "EPERM") throw e; }
    }
  }
  return null;
}

// Node will not start a .cmd or .bat file without a shell (EINVAL), and that is how npm installs `claude` on Windows.
// There, and only when the path and every argument hold no character cmd.exe would read, it goes through cmd.exe;
// otherwise the spawn fails as before and the failure is reported. Returns [program, args] or null.
function windowsCmdLine(file, args, platform = process.platform, comspec = process.env.ComSpec) {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(file)) return null;
  if (!/^[^"&|<>^%!]+$/.test(file) || !args.every((a) => /^[A-Za-z0-9_.=:\/\\-]*$/.test(a))) return null;
  return [comspec || "cmd.exe", ["/d", "/s", "/c", `""${file}"${args.map((a) => ` ${a}`).join("")}"`]];
}

// The name a start of `name` should use on this platform, so a program placed in the working folder cannot stand in
// for the one on PATH (a decoy node.exe measured in evidence/live/windows/2026-09-23-hosted-runner-port.md; backlog
// B79). On win32, Node's own spawn resolves a bare name (one with no path separator) by searching the current folder
// before PATH; `which` above searches PATH alone, so its match is what a caller passes to spawn or spawnSync instead
// of the bare name. Elsewhere, and for a name that already has a path separator, the name is returned exactly as
// given: this platform already looks only at PATH, or the caller chose the path on purpose. A name `which` cannot
// find comes back unchanged, so the start fails exactly as it did before and is reported exactly as it always was.
function resolveProgram(name, { platform = process.platform, which: whichFn = which } = {}) {
  if (platform !== "win32" || name.includes("/") || name.includes("\\")) return name;
  return whichFn(name) ?? name;
}

// Run a program with a timeout; never throws for the program's own failure.
function runProgram(file, args, timeoutMs = 20000, { env } = {}) {
  const resolved = resolveProgram(file);
  const viaCmd = windowsCmdLine(resolved, args);
  const r = viaCmd
    ? spawnSync(viaCmd[0], viaCmd[1], { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"], env: env ?? process.env, windowsVerbatimArguments: true })
    : spawnSync(resolved, args, { encoding: "utf8", timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"], env: env ?? process.env });
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

// ---------- team settings, shared with fork.mjs ----------

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

// ---------- a company skills repository ----------

const listDirNames = (d) => (isDir(d) ? readdirSync(d).filter((n) => isDir(join(d, n))).sort() : []);

// Commands that work on a company skills repository use this one, or refuse with the option to pass.
function requireSkillsRepo(hint) {
  if (!SKILLS_REPO) refuse(`this copy of skilliton is not inside a company skills repository, so there is no default to use; ${hint}`);
  return SKILLS_REPO;
}

function resolveSkillsRepo(value) {
  const repo = resolveExistingDir(value ?? requireSkillsRepo("pass --repo <skills repo>"), "--repo");
  if (!isDir(join(repo, "packs"))) refuse(`${tilde(repo)} has no packs/ folder, so it is not a Skilliton skills repository (point --repo at one)`);
  return repo;
}

// ---------- the secret scan, shared by import and propose ----------

// The shapes are lib/secret-rules.mjs's. A copy is refused on a credential's prefix alone where the prefix is
// distinctive (a key cut short is still a key someone pasted), else on its whole shape; a signed token too; and on a
// home folder path, which is not a secret but names a person and a machine.
const SECRET_RULES = [
  ...CREDENTIAL_SHAPES.map(({ rule, prefix, ere }) => ({ rule, re: new RegExp(prefix ?? ere) })),
  { rule: "json-web-token", re: new RegExp(SIGNED_TOKEN_ERE) },
  { rule: "home-directory-path", re: /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/|\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+[\\/]/ },
];

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

// ---------- versions ----------

function cmpVersion(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function readJsonMaybe(path, problems) {
  if (!isFile(path)) return undefined;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) {
    problems.push(`${tilde(path)} ${e instanceof SyntaxError ? "does not parse" : `could not be read (${e.code ?? e.message})`}`);
    return undefined;
  }
}

function readPluginVersion(pluginDir) {
  const v = readJsonMaybe(join(pluginDir, ".claude-plugin", "plugin.json"), []);
  return typeof v?.version === "string" ? v.version : null;
}

// ---------- exports ----------

export {
  PLUGIN_ROOT, SKILLS_REPO, HOME, BACKUPS,
  Refused, refuse, say, isPlainObject, clone, sameJson, sha12, statOrNull, isDir, isFile, linkedFileProblem, linkedWriteProblem, tilde, selfCommand,
  resolveExistingDir, NAME_RE, validateName, parseArgs, which, resolveProgram, runProgram, windowsCmdLine, newStamp, backupFile, unifiedDiff,
  readBytes, writeBytes, forDisplay, argPath,
  buildTeamSettings, readJsonObject,
  listDirNames, requireSkillsRepo, resolveSkillsRepo,
  SECRET_RULES, scanSecrets,
  cmpVersion, readJsonMaybe, readPluginVersion,
};
