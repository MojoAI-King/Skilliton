# Task: B30: Windows support through Git for Windows

Kind: Living. Task record.

- **ID:** 2026-09-17-b30-windows-support-through-git-for-wind-9af7
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T19:53:46.689Z

## Request

not yet written

## Acceptance criteria

- [ ] The owner's choice is recorded as a decision: Windows is supported through Git for Windows (Git Bash), one implementation of every hook, no PowerShell twin
- [ ] Every hook command pins the bash shell, so a Windows machine without Git Bash fails loudly instead of running a bash script under PowerShell
- [ ] The runtime works on Windows paths: programs are found with the Windows extensions, the terminal command is written where a Windows shell can run it, and file modes that do not exist there are not treated as failures
- [ ] The preflight check reports what Windows needs: Git for Windows, node, and the programs Git for Windows brings; on a machine without Git Bash it says so in plain words
- [ ] Documents say Windows needs Git for Windows and that it is not rehearsed until the owner runs it; nothing claims Windows support that has not been measured
- [ ] The owner gets exact steps to run on the Windows machine, and what to send back

## Decisions

not yet written

## Checkpoints

### 2026-09-17T19:53:46.689Z

- **State:** Windows is built in theory: every hook pins the bash shell, the preflight check finds Git Bash the way Claude Code does, the docs say Windows is unmeasured, and docs/WINDOWS.md is the first run for the owner
- **Evidence:** claude plugin validate --strict passes with the shell field on 2.1.274 and 2.1.92; full offline suite 33 of 33 after updating the two hook registration tests; no Windows machine has run anything
- **Next:** the owner runs docs/WINDOWS.md and reports what happens
- **Git:** main @ e78c914, 22 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
