# Windows is supported through Git for Windows, with one implementation of every hook

Kind: Living. Decision entry.

- **ID:** 2026-09-17-windows-is-supported-through-git-for-win-cb9e
- **Status:** accepted
- **Date:** 2026-09-17

## Decision

Skilliton supports Windows by requiring Git for Windows, which brings Git Bash. Every hook and the launcher stay as
they are, in one implementation, and every hook command now says `"shell": "bash"` so that a Windows machine without
Git Bash fails loudly instead of quietly handing a shell script to PowerShell. Node.js has to be installed on Windows
separately, because the native Windows install of Claude Code does not bring it. The developer runs the Skilliton
commands from Git Bash. No PowerShell version of any hook is written.

## Why

Claude Code's documentation (retrieved 2026-09-17, https://code.claude.com/docs/en/hooks) says a hook's command string
"is passed to a shell: `sh -c` on macOS and Linux, Git Bash on Windows, or PowerShell when Git Bash isn't installed",
and that a hook may name its shell with `"shell": "bash"` or `"powershell"`. Git for Windows also brings almost every
program the allow list names (bash, awk, sed, grep, tr, wc, cat, find, xargs, tar, ssh-keygen), so one requirement
covers nearly the whole list.

The alternative was a second implementation of every hook in PowerShell. The guardrails hook alone is about 1,100
lines of security logic; two implementations of one security rule drift, and each would need its own tests and evals.
The owner chose the Git for Windows requirement on 2026-09-17.

## Alternatives rejected

- **PowerShell versions of the hooks and the launcher.** It would work on a machine with no Git Bash, at the cost of
  writing the command check twice. Two copies of a rule that blocks commands is how one copy quietly stops matching
  the other. It stays available if a company cannot install Git for Windows.
- **WSL only.** Cheapest, and it excludes developers whose company does not allow WSL, on the platform most managed
  laptops run.
- **Leaving Windows unsupported.** The owner's only test machine is Windows.

## Risk

- Nothing on Windows has been measured. Every claim here is read from the documentation and from the code; the owner
  runs the first Windows session, and until then the documents say Windows is not rehearsed.
- A machine without Git Bash gets no hooks at all, which means no session-start summary, no checkpoint reminder and no
  guardrails. The pinned `"shell": "bash"` makes that visible rather than silent, but the protection is off until Git
  for Windows is installed, and the allow list says so.
- `"shell"` is accepted by `claude plugin validate --strict` on 2.1.274 and by 2.1.92; how an older Claude Code treats
  the field in a live session is unverified.
- On Windows the execute bit does not exist, so the preflight check cannot tell "a program is there but may not be
  run" from "it is not there"; it says the first only on macOS and Linux.
- The terminal launcher `join` writes is a POSIX shell script, which Git Bash runs. In `cmd` or PowerShell a developer
  runs `node <clone>\scripts\skilliton.mjs`. Whether a `.cmd` launcher is worth writing is left until the Windows run
  says whether it is missed.

## Reversibility

Easy. The hooks are unchanged apart from one field per command, and the preflight check keeps the Windows path in one
function. Adding a PowerShell version later changes nothing decided here.

## Evidence

The owner's choice on 2026-09-17 (user-stated). Claude Code documentation retrieved the same day for the hook shell,
the `shell` field, `CLAUDE_CODE_GIT_BASH_PATH` and the native install's Node.js requirement. `claude plugin validate
--strict` passes on 2.1.274 and 2.1.92 with the field in place. `runtime/lib/preflight.mjs` (`findWindowsBash`,
`probeHookPrograms`) and `docs/IT-ALLOWLIST.md` section 8. No Windows machine has run any of it.
