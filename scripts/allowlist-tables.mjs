// allowlist-tables.mjs: the tables scripts/allowlist.test.mjs holds the code to. Each row names a place in the plugins
// that starts a program, reaches outside a repository or uses the network, and says why; the test reads the code and
// fails when a row is missing, stale or counts the wrong number of call sites. Kept apart from the test so a new row
// does not grow a pinned file, and so the rows can be read on their own.

const PLUGIN = "packs/base/plugins";
const WORKFLOW = `${PLUGIN}/workflow`;

// Every call whose program is not a string literal: what it starts, and how that is known. `count` is how many such
// call sites the file has, so a new one fails this test instead of passing under an existing entry.
export const DYNAMIC_CALLS = [
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "spawnSync", arg: "resolved", count: 1, programs: [], why: "inside runProgram, the wrapper; every caller of it is read below (resolveProgram resolves it on Windows first, B79)" },
  { file: `${WORKFLOW}/runtime/lib/core.mjs`, callee: "spawnSync", arg: "viaCmd[0]", count: 1, programs: ["cmd.exe"], why: "inside runProgram on Windows only, to start a .cmd or .bat file Node cannot start itself (docs/IT-ALLOWLIST.md section 8)" },
  { file: `${WORKFLOW}/runtime/lib/join.mjs`, callee: "spawnSync", arg: "binary.path", count: 1, programs: [], why: "inside runClient, the wrapper; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/awake.mjs`, callee: "spawn", arg: "program", count: 1, programs: ["caffeinate"], why: "holdAwake, on macOS only: /usr/bin/caffeinate -i -m -s -w <this pid> for the length of a gate or check run (B91)" },
  { file: `${WORKFLOW}/runtime/lib/awake.mjs`, callee: "spawnSync", arg: "program", count: 1, programs: ["pmset"], why: "sleptBetween, on macOS only and only for a failing run: /usr/bin/pmset -g log, read to name a sleep inside it (B91)" },
  { file: `${WORKFLOW}/runtime/lib/doctor.mjs`, callee: "runProgram", arg: "bin", count: 1, programs: ["claude"], why: "doctor asks a Claude Code copy bundled in an editor extension for its version" },
  { file: `${WORKFLOW}/runtime/lib/doctor.mjs`, callee: "runProgram", arg: "cli.path", count: 2, programs: ["claude"], why: "doctor runs claude plugin list and marketplace list" },
  { file: `${WORKFLOW}/runtime/commands/doctor.mjs`, callee: "runProgram", arg: "path", count: 1, programs: ["claude"], why: "doctor asks the claude on PATH for its version" },
  { file: `${WORKFLOW}/runtime/lib/join.mjs`, callee: "runClient", arg: "c.binary", count: 4, programs: ["claude", "codex"], why: "join and join --undo run each client's own marketplace and plugin commands" },
  { file: `${WORKFLOW}/runtime/lib/marketplace-pin.mjs`, callee: "spawnSync", arg: "binary.path", count: 1, programs: [], why: "inside runClient, the wrapper that runs one client command from a new empty folder; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/marketplace-pin.mjs`, callee: "runClient", arg: "mp.binary", count: 5, programs: ["claude"], why: "pin moves the company marketplace to a release tag: marketplace list --json, remove, add at the tag (and back without it when refused), plugin update or install" },
  { file: `${WORKFLOW}/runtime/lib/collectors.mjs`, callee: "spawn", arg: "resolveProgram(check.command[0])", count: 1, programs: [], policy: true, why: "a command from the project's own delivery policy, collecting test evidence (resolveProgram resolves it on Windows first, B79)" },
  { file: `${WORKFLOW}/runtime/lib/delivery.mjs`, callee: "spawn", arg: "resolveProgram(check.command[0])", count: 1, programs: [], policy: true, why: "a command from the shared repository's delivery policy, run by the gate (resolveProgram resolves it on Windows first, B79)" },
  { file: `${WORKFLOW}/runtime/lib/gate.mjs`, callee: "spawn", arg: "resolveProgram(run.argv[0])", count: 1, programs: [], policy: true, why: "a command from the project's own delivery policy, run locally by skilliton gate (resolveProgram resolves it on Windows first, B79)" },
  { file: `${WORKFLOW}/runtime/lib/gate.mjs`, callee: "spawn", arg: "run.shell", count: 1, programs: ["sh", "npm"], why: "skilliton gate runs npm run verify (package.json's verify script), or the command a person gave after --cmd, through the shell" },
  { file: `${WORKFLOW}/runtime/lib/delivery-install.mjs`, callee: "runProgram", arg: "runtimePath", count: 1, programs: ["bash", "node"], why: "delivery install probes the workflow plugin's bin/skilliton launcher, a bash script that runs node" },
  { file: `${WORKFLOW}/runtime/lib/usage.mjs`, callee: "runProgram", arg: "process.execPath", count: 2, programs: ["node"], why: "skilliton usage runs the meter (the plugin's runtime/meter/token-cost.mjs, or the project's scripts/token-cost.mjs when it speaks the same contract) and, before believing a number from it, the test beside it" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "spawn", arg: "file", count: 1, programs: [], why: "inside startOnce, the wrapper that waits for one program in its own process group and kills the group when it will not stop; every caller of it is read below" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "startOnce", arg: "bash.path", count: 1, programs: ["bash"], why: "on Windows the probe script is run by Git Bash, which is how Claude Code runs a hook there" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "startOnce", arg: "probe", count: 1, programs: ["env", "bash"], why: "preflight runs the plugin's own probe script by its path, so its first line starts env and bash, the way Claude Code runs a hook" },
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, callee: "startOnce", arg: "path", count: 1, programs: [], table: "PROGRAMS", why: "preflight starts each program from the PROGRAMS table in the same file once, with --version; the table is checked against section 1 below" },
];

// Every place a script hands an interpreter something this reader cannot follow: a path built from a variable
// ("expansion") or a program written into the script itself ("inline"). `target`, when given, is a file this test must
// already read; `count` is how many such places the file has, so a new one has to be looked at.
export const INTERPRETER_TARGETS = [
  { file: `${WORKFLOW}/evals/audit-finding-acted-on/self-check.sh`, command: "bash", kind: "expansion", count: 1, target: `${WORKFLOW}/evals/audit-finding-acted-on/fixture.sh`, why: "the fixture beside it, building the scenario before the self-check inspects it" },
  { file: `${WORKFLOW}/evals/audit-finding-acted-on/self-check.sh`, command: "node", kind: "expansion", count: 3, target: `${WORKFLOW}/evals/audit-finding-acted-on/check-fix-pattern.mjs`, why: "the fix-on-line grader's own regex, run as a file three times (against the flawed and the fixed content, and once more on a fix with a comment line above the call) to prove it discriminates" },
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
  { file: `${WORKFLOW}/evals/audit-finding-acted-on/fixture.sh`, text: '"$skilliton"', count: 1, args: null, why: "this plugin's own bin/skilliton, setting up an evaluation case; eval fixtures run only in a company's evaluation runs" },
  { file: `${WORKFLOW}/evals/audit-finding-acted-on/self-check.sh`, text: '"$skilliton"', count: 2, args: null, why: "the same, run twice by this case's own offline self-check (before and after the fix)" },
  { file: `${WORKFLOW}/runtime/preflight/probe.sh`, text: '"$path"', count: 1, args: ["--version"], why: "the program the preflight check asked about, found with command -v; the names come from the PROGRAMS table in runtime/lib/preflight.mjs" },
  { file: `${WORKFLOW}/evals/security-status-honest/fixture.sh`, text: '"$skilliton"', count: 1, args: null, why: "this plugin's own bin/skilliton, setting up an evaluation case; eval fixtures run only in a company's evaluation runs" },
  { file: `${WORKFLOW}/evals/task-start-records-work/fixture.sh`, text: '"$skilliton"', count: 1, args: null, why: "the same" },
  { file: `${WORKFLOW}/evals/compliance-never-certifies/fixture.sh`, text: '"$skilliton"', count: 3, args: null, why: "the same, run three times to set up the case: prepare, compliance scope, compliance sheet" },
];

// Programs the allow list names that Skilliton does not start itself, with what does.
export const STARTED_BY_OTHERS = [
  ["ssh-keygen", "git starts it to make and check SSH signatures (gpg.format=ssh), in verify, join and release"],
  ["/bin/sh", "Claude Code runs each hook command through a shell (sh -c on macOS and Linux), and the launcher join writes begins with #!/bin/sh"],
  ["sh", "the same shell, named without its path"],
];

// Where the code reaches outside a repository and its section 2 location; matched against the file, so an edit brings someone back here.
export const OUTSIDE_A_REPOSITORY = [
  [`${WORKFLOW}/runtime/lib/core.mjs`, "const HOME = homedir();", "the backups folder ~/.claude/backups/skilliton/ and short paths in messages"],
  [`${WORKFLOW}/runtime/lib/join.mjs`, 'process.env.SKILLITON_JOIN_DIR || join(homedir(), ".config", "skilliton", "joined")', "~/.config/skilliton/joined/<company>.json"],
  [`${WORKFLOW}/runtime/lib/join.mjs`, 'binDir ?? join(homedir(), ".local", "bin")', "~/.local/bin/skilliton"],
  [`${WORKFLOW}/runtime/lib/trust.mjs`, 'process.env.SKILLITON_TRUST_DIR || join(homedir(), ".config", "skilliton", "trust")', "~/.config/skilliton/trust/<company>.allowed_signers"],
  [`${WORKFLOW}/runtime/lib/verify.mjs`, 'process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")', "Claude Code's own folder, read, and written by its own commands"],
  [`${WORKFLOW}/runtime/lib/verify.mjs`, 'process.env.CODEX_HOME || join(homedir(), ".codex")', "Codex's own folder, read, and created by join when it is missing"],
  [`${WORKFLOW}/runtime/lib/skill-drift.mjs`, 'process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")', "Claude Code's own folder, read only by the session start to compare a project's skill copies"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "process.env.HOME !== pinned.home", "nothing: it compares this session's home folder with the one the system records, to say which the reachability check read"],
  [`${WORKFLOW}/runtime/lib/preflight.mjs`, "the home folder the system records for this user", "nothing: the same comparison, printed"],
  [`${WORKFLOW}/runtime/lib/legacy-names.mjs`, 'join(homedir(), ".config", OLD)', "the folder used before the rename, named in messages and never written"],
  [`${WORKFLOW}/runtime/meter/lanes.mjs`, "const home = homedir();", "nothing: the home folder is read only to spell a lane folder with ~, the way a brief may name it"],
  [`${WORKFLOW}/runtime/lib/delivery.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-delivery-"))', "$TMPDIR/skilliton-delivery-*, removed when the gate finishes"],
  [`${WORKFLOW}/runtime/commands/propose.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-propose-"))', "$TMPDIR/skilliton-propose-*, removed when propose finishes"],
  [`${WORKFLOW}/runtime/commands/join.mjs`, 'mkdtempSync(joinPath(tmpdir(), "skilliton-join-"))', "$TMPDIR/skilliton-join-*, the signers text from a join file held for the trust step and removed when join finishes"],
  [`${WORKFLOW}/runtime/lib/marketplace-pin.mjs`, 'mkdtempSync(join(tmpdir(), "skilliton-client-"))', "$TMPDIR/skilliton-client-*, the empty folder each client command of join and pin runs in, removed when the command ends"],
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
  [`${WORKFLOW}/runtime/lib/lifecycle.mjs`, 'const installsPath = join(HOME, ".claude", "plugins", "installed_plugins.json")', "Claude Code's install records, read by the session start so it can say whether the plugins this project enables are installed for this user"],
  [`${WORKFLOW}/runtime/lib/doctor.mjs`, ': join(HOME, ".claude.json"), stateLabel:', "whether Claude Code has ever run under this home folder, read by doctor; its settings, marketplace and install records are read from lib/verify.mjs's folder above"],
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

// Network use the allow list permits. Each entry must also be named in section 4; with none, section 4 says the code
// makes no requests of its own, and this test holds it to that.
export const ALLOWED_NETWORK = [
  { file: `${WORKFLOW}/runtime/lib/preflight.mjs`, text: '"ls-remote"', docPhrase: "git ls-remote --heads https://github.com/<owner>/<repo>", why: "the preflight check asks whether this machine can reach the company's plugin repository" },
];
