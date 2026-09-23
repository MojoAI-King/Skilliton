# Windows, after the port: the WINDOWS.md commands and the hooks on a GitHub-hosted runner

Kind: Evidence. GitHub Actions run 35815835006 of `.github/workflows/windows.yml` on branch windows/port-0922 at commit faa2d3d, 2026-09-22 23:49 EDT to 2026-09-23 01:22 EDT; one more step, the decoy in the project folder, in run 35822331594 at commit 8aada2f (cancelled after that step, so its log could be read). The first run, before the port, is [2026-09-22-hosted-runner-first-run.md](2026-09-22-hosted-runner-first-run.md).

**The machine.** A GitHub-hosted `windows-latest` runner: Microsoft Windows 10.0.26100, Git for Windows 2.55.0, the step shell Git Bash by its full path (`C:\Program Files\Git\bin\bash.exe`, `MINGW64_NT`), Node.js 22, Claude Code 2.1.280 installed with npm. A clean machine, not a developer's workstation, with no Claude login, so no session ran: each hook was run directly with the JSON a client sends. The clone sat under a folder with a space in its name.

## Results

| Step | Before the port | After the port |
|---|---|---|
| `preflight --wide` | 38 ok, 1 blocked, 1 not checked | **40 ok, 1 not checked; nothing is in the way** (exit 0) |
| `doctor` | `claude --version` failed with EINVAL | **reads Claude Code 2.1.280** through `claude.CMD`; exit 1 only because the runner has no plugins installed, which is the right answer |
| A real project: `prepare --apply` | refused (the plain Git folder check) | **PASS** |
| `status` | not reached | **PASS** (exit 1, the same verdict as on macOS for a new project) |
| The session-start handoff hook | not reached | **PASS** |
| `hook session-start` (the Project state block) | not reached | **PASS** |
| `hook stop` (a checkpoint asked for after an edit) | not reached | **PASS** |
| The guard hook on four commands | not reached | **PASS 4 of 4**: `git status` allowed, `git commit --no-verify` and `git push --force origin main` denied, `git checkout -- .` asked |
| A delivery check started by a bare name (`node`) | not reached | **PASS** |
| `lifecycle.test` | 20 pass, 39 fail | **59 pass, 0 fail** |
| `prepare.test` | not reached | **42 pass, 0 fail** |
| `git-config.test` | 4 pass, 4 fail | **8 pass, 0 fail** |
| `handoff-hook.test` | 79 of 104 | **120 of 120** |
| `guardrails.test` | 144 of 676 | **674 of 676** (below) |
| `path-form.test`, `windows-cmd.test`, `footprint.test` | not there, not there, pass | pass, pass, pass |
| `allowlist.test` | 1 problem | every check that ran passed; the writes scenario is NOT RUN on Windows, and says why (below) |
| `preflight.test` | 9 pass, 13 fail | 9 pass, 13 fail (below) |

## What the port changed

- The plain Git folder check compares path forms, not spellings (`lib/path-form.mjs`, `scripts/path-form.test.mjs`).
- `jq.exe` and `python3` on Windows write CRLF; the guard and the session-start handoff hook drop the carriage returns on Git for Windows only.
- Node will not start a `.cmd` file without a shell (EINVAL), and npm installs `claude` as one; `runProgram` and the preflight check start a `.cmd` or `.bat` file through `cmd.exe /d /s /c`, only when neither the path nor any argument holds a character `cmd.exe` would read (`scripts/windows-cmd.test.mjs`); `cmd.exe` is in docs/IT-ALLOWLIST.md section 1 and in the preflight table.
- `which` finds a name that already ends in `.exe`.
- `.gitattributes` checks every text file out with LF line ends.
- The test suites build their restricted PATHs and fixtures in ways Git Bash runs.

## Documented limitations, measured here

- **A program in the project folder can shadow a delivery check's bare program name.** With `whoami.exe` copied into the project folder as `node.exe`, a check whose command is `["node", "-e", "process.exit(0)"]` failed with empty output, where the same check with no decoy passes: on Windows, a program started by name is looked for in the working folder before PATH, and Skilliton starts policy checks with the project as the working folder. The same search order applies wherever the runtime starts `git` by name with the repository as its folder; that case is inferred, **not measured**. This blocks Windows support: backlog B79 resolves every bare name through PATH on Windows before starting it.
- **Very large commands are slow in the guard.** An 870 KB heredoc took 59 seconds and a 400 KB single line 14 seconds for both input shapes, against the test's 5-second limit and the hook's 10-second timeout; every ordinary command passed. Backlog B80, with the Node tokenizer in B67.
- **`preflight.test` fails 13 cases.** They build a PATH of stand-in programs named without a Windows extension and simulate blocks with execute bits, and Windows finds none of them: even case 1, the machine with everything in place, reads every program MISSING (the log shows `MISSING  node: not found on PATH`). The check itself passes on this machine (`preflight --wide` above), so this is the test's portability, not the check's.
- **The allow list's writes scenario is NOT RUN** on Windows: it builds a PATH of symbolic links and `#!/bin/sh` stand-ins. It is measured on macOS and Linux.

## What this settles and what it does not

- **Settled:** the WINDOWS.md commands, preparation, status, every session hook and the guard's decisions work on a clean Windows machine with Git for Windows; each failure of the first run has a fix with a test or is listed above (area 03 batch 02 items 2 to 4).
- **Not settled:** a Claude Code session on Windows (no login on the runner), a developer's workstation with endpoint security, and B79. Windows stays **not supported** in 1.0.1.
