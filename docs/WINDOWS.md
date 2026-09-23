# Windows: what to install, what to run, and what to send back

Kind: Living. Written for the first Windows run. **Every command below has run on a GitHub-hosted Windows runner
(evidence/live/windows/); a Claude Code session, a developer's workstation and the `skilliton.cmd` launcher have
not.** The rest is read from Claude Code's documentation (retrieved 2026-09-17) and from the code; the point of the run
is to find out which parts are wrong. A step that fails is the result, not a mistake: copy what it said.

## Why Git for Windows

Claude Code passes each hook's command to a shell: `sh -c` on macOS and Linux, **Git Bash on Windows**, or PowerShell
when Git Bash is not installed (https://code.claude.com/docs/en/hooks). Skilliton's hooks are shell scripts, so on
Windows they need Git Bash, which comes with Git for Windows. Every Skilliton hook now says `"shell": "bash"`, so a
machine without Git Bash should fail loudly rather than hand a shell script to PowerShell. That is the decision in
`docs/decisions/2026-09-17-windows-is-supported-through-git-for-win-cb9e.md`. One hook is a Node script rather than a
shell script: the context-hygiene read guard (`hooks/read-guard.mjs`), started by its first line `#!/usr/bin/env node`
through the same `bash`. Git Bash resolves that line through its own `/usr/bin/env`, which needs `node` on the PATH Git
Bash sees; the read guard was not among the hooks run on the hosted runner, so this is unmeasured on Windows, and the
check below covers it.

Git for Windows also brings most of what the allow list needs: `bash`, `awk`, `sed`, `grep`, `tr`, `wc`, `cat`,
`find`, `xargs`, `tar`, `ssh-keygen` and `git` itself.

## 1. Install

1. **Git for Windows** from https://git-scm.com/download/win (this is what brings Git Bash).
2. **Node.js 22 or later** from https://nodejs.org. The native Windows install of Claude Code does not bring Node, and
   the Skilliton runtime is Node.
3. **Claude Code**, as you normally install it on that machine.

Then open **Git Bash** (not PowerShell, not the Command Prompt) for everything below.

## 2. Run these, in order, and keep the output

In Git Bash:

```bash
node --version
git --version
claude --version
bash --version | head -1

git clone https://github.com/MojoAI-King/Skilliton ~/skilliton
cd ~/skilliton

node scripts/skilliton.mjs preflight --wide
```

`preflight` is the interesting one. It writes nothing except one small file in each folder it tests, which it removes
again. Send its whole output.

Then the checks that do not need a company repository:

```bash
node scripts/skilliton.mjs --help
node scripts/skilliton.mjs doctor
node scripts/allowlist.test.mjs
node scripts/footprint.test.mjs
node --test scripts/preflight.test.mjs
node --test scripts/git-config.test.mjs
node scripts/lifecycle.test.mjs
bash scripts/handoff-hook.test.sh
bash scripts/guardrails.test.sh
```

Then a real project, so the session hooks run:

```bash
mkdir ~/windows-try && cd ~/windows-try
git init -b main && echo "# a test project" > README.md && git add -A && git commit -m first

node ~/skilliton/scripts/skilliton.mjs prepare --dir . --apply
node ~/skilliton/scripts/skilliton.mjs status --dir .
```

Finally, a Claude Code session in that folder (`claude` in Git Bash, then in the same terminal a second time from
PowerShell, if you can):

- Does the session start show a "Project state" block and a handoff note?
- Ask it to run something harmless in the shell (for example `git status`), and see whether the guardrails hook says
  anything.
- Ask it to run `git commit --no-verify -m test`: it should be blocked.
- Type `/` and look for the `workflow` skills in the list.

## 3. What to send back

For each command: the command, and its output, exactly as it appeared, including anything that looked like an error.
Then:

- Which of the four session behaviors above happened, and which did not.
- Whether anything asked for administrator rights (nothing should).
- Whether `preflight` named something as missing or blocked that is in fact installed.
- Whatever you had to do that is not written above, because that is the part of these instructions that is wrong.

## 4. What is likely to break first

These were guesses, written down so the run could confirm or refute them. The hosted-runner runs (evidence/live/windows/) answered three: paths with a space work, and the first failure was the plain Git folder check instead, now fixed; Git Bash is found; and bare program names matter (below). The launcher, file modes and the status line are still unrun:

- **Paths.** The runtime builds paths with Node's own path handling, so `C:\Users\...` should be fine, but the
  launcher and the hooks pass paths through a shell, where a backslash is an escape character. A path with a space
  (`C:\Users\First Last\`) is the likely first failure.
- **The terminal command.** `join` writes a POSIX shell script at `~/.local/bin/skilliton`, which Git Bash can run,
  and on Windows also `skilliton.cmd` beside it, for PowerShell and the Command Prompt. The `.cmd` file's content is
  pinned by a unit test (`scripts/join.test.mjs`, the platform injected through `SKILLITON_PLATFORM`), and undo
  removes it; it has not yet been run on Windows, so its first run is part of walkthrough step 9 (docs/OWNER_WALKTHROUGH.md). If `~/.local/bin`
  is not on PATH there, the fallback is still `node <clone>\scripts\skilliton.mjs`.
- **File modes.** Windows has no execute bit, so `verify` may report files it expects to be executable. Say what it
  reports.
- **The preflight check on Windows** looks for Git Bash through `CLAUDE_CODE_GIT_BASH_PATH`, then PATH, then beside
  `git.exe`. If it says Git for Windows was not found although it is installed, send the output of
  `which git` and `where.exe git`.
- **Bare program names in the delivery policy.** Resolved on 2026-09-23 on a hosted runner
  (evidence/live/windows/2026-09-23-hosted-runner-port.md): a check started by a bare name runs, and it does matter
  here. With `whoami.exe` copied into the project folder as `node.exe`, a check `["node", "-e", "process.exit(0)"]`
  failed where the same check passes without the decoy, so a program in the working folder is found before PATH.
  Since workflow 0.22.0 the runtime looks every bare name up on PATH before it starts it on Windows (backlog B79:
  `git`, `tar` and a policy check's program), and the decoy step passed on the rerun of 2026-09-23 (the same
  evidence note, its last section).
- **The status line and the drift check** use `jq`, which Git for Windows does not bring. They are optional, and the
  check should say so rather than fail.

## 5. When it works

Update `docs/COVERAGE.md` (the operating system row), `docs/CLIENTS.md` (which shell runs a hook), the Windows lines in
`docs/IT-ALLOWLIST.md` section 8, and `docs/BACKLOG.md` B30, each with what was run, on which versions, and on which
Windows build. Until then, every document says Windows is not supported: the hosted runner has run the commands and
the hooks, but no Claude Code session has run on Windows, and backlog item B80 is open.
