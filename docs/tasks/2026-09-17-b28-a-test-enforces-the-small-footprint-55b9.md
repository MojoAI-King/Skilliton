# Task: B28: a test enforces the small footprint

Kind: Living. Task record.

- **ID:** 2026-09-17-b28-a-test-enforces-the-small-footprint-55b9
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T18:06:33.090Z

## Request

not yet written

## Acceptance criteria

- [ ] The test fails when the plugins, the command line or the status line setup gain network code, a downloader, or a git command that contacts a remote that is not on a named, documented exception list
- [ ] It fails on anything needing administrator rights: sudo and its kin, changing an owner, setuid, or a program that installs a service, agent, scheduled task or login item
- [ ] It fails on a write to a system folder: every absolute path in the code outside the home folder and the repository is listed with what it is for, and a new one fails
- [ ] It fails on anything downloaded to run: every file shipped in the plugins is text, every executable one starts with a shebang, and no code makes a downloaded file executable
- [ ] It fails on code built at run time (eval, new Function, node:vm) and on a file mode that is not one of the modes the product uses
- [ ] The self-test mode proves each rule fails on known-bad input, and the test is wired into CI and docs/MAINTAIN.md

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
