# Windows, first run: the WINDOWS.md commands on a GitHub-hosted runner

Kind: Evidence. Run 2026-09-22 20:42 to 20:51 EDT as GitHub Actions run 35803157274 of `.github/workflows/windows.yml` at commit cbc7c9d. The full log is in that run; this note keeps the results.

**What the machine was.** A GitHub-hosted `windows-latest` runner: Microsoft Windows 10.0.26100, Git for Windows 2.55.0, Node.js 22.23.2, and Claude Code 2.1.280 installed with npm. The step shell reported `GNU bash 5.3.15 (x86_64-pc-cygwin)`. It is a clean Windows machine, not a developer's workstation, and it has no Claude login, so no session ran: the hooks were to be run directly with the JSON a client sends. The clone sat under a folder with a space in its name (`~/First Last/skilliton`), as docs/WINDOWS.md section 4 guessed would break first.

## Results

| Step | Result |
|---|---|
| `preflight --wide` | **works**: exit 0, "38 ok, 1 blocked, 1 not checked; nothing is in the way"; every folder Skilliton writes was created, written and removed, and the GitHub repository answered |
| `--help` | works, exit 0 |
| `doctor` | runs, and reports `claude --version` failed with `spawnSync C:\npm\prefix\claude.CMD EINVAL`: Node will not start a `.cmd` file without a shell, so doctor cannot ask Claude Code its version on Windows |
| `allowlist.test` | 1 problem: the check expects the launcher `bin/skilliton` to start node in one place and found none on Windows |
| `footprint.test` | **passes** |
| `preflight.test` | 9 pass, 13 fail |
| `git-config.test` | 4 pass, 4 fail |
| `lifecycle.test` | 20 pass, 39 fail |
| `handoff-hook.test` | 79 of 104 checks pass; the failures are the cases that restrict PATH to one JSON reader and get exit 127 |
| `guardrails.test` | 144 of 676 checks pass; most failures are exit 127 in the cases that build a restricted PATH |
| A real project: `prepare --apply` | **refused**, so the step stopped there and the hooks and the gate step after it did not run |

## The first blocker

`prepare` refuses every repository on this machine:

```
skilliton: refused: the Git folder <runner home>/.../repo/.git is not a plain folder (it goes through a symbolic link or cannot be opened), and Skilliton keeps its private backups there
```

The check that a Git folder is a plain folder, not a link, rejects an ordinary `.git` folder on Windows. The same refusal appears in the test suites' own fixtures, so it explains a large share of the failures in `lifecycle.test` and `git-config.test`. Until it is fixed, nothing that writes into a project works on Windows.

## The other failures, by cause

- **Restricted PATH in the tests.** Many guardrails and handoff-hook cases build a PATH holding only chosen programs, to prove the hook works with one JSON reader or none. On this runner those cases exit 127 (command not found), so the tests' way of building that PATH does not work here. This is the tests' portability, and it hides whether the hooks themselves work.
- **Starting `.cmd` programs.** Node refuses to spawn a `.cmd` file directly (EINVAL), which is how npm installs `claude` on Windows.
- **The step shell.** `shell: bash` gave a Cygwin bash, not Git Bash's MSYS bash, which is what docs/WINDOWS.md tells a person to use. A rerun should name Git Bash explicitly.

## What this settles and what it does not

- **Settled:** the WINDOWS.md commands were run on a clean Windows machine and their output is filed (area 03 batch 02 item 1). The guess in WINDOWS.md section 4 that paths with spaces fail first was wrong: the first failure is the plain-folder check.
- **Not settled:** whether the hooks work on Windows once prepare does, and anything about a Claude Code session there. Windows is **not supported** in 1.0; the README and docs/COVERAGE.md say so.
