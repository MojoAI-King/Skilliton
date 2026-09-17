# Task: B28: a test enforces the small footprint

Kind: Living. Task record.

- **ID:** 2026-09-17-b28-a-test-enforces-the-small-footprint-55b9
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T19:53:46.529Z

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

### 2026-09-17T18:11:15.540Z

- **State:** B28 is built: scripts/footprint.test.mjs enforces the four promises in the allow list's short version
- **Evidence:** node scripts/footprint.test.mjs passes on 42 JavaScript files, 8 scripts and 177 shipped files; --self-test 19 of 19; wired into CI and docs/MAINTAIN.md; committed as c0dad92
- **Next:** B27: the preflight check
- **Git:** main @ c0dad92, 1 uncommitted

### 2026-09-17T18:35:33.453Z

- **State:** B27 and B29's first half are built: skilliton preflight checks programs, folders and the company repository before anything is set up, join runs it first and refuses before writing, and scripts/preflight.test.mjs proves it against ten real blocks
- **Evidence:** node --test scripts/preflight.test.mjs 10 of 10; full offline suite 32 of 32 steps; claude plugin validate --strict on 2.1.274 for the marketplace and all three plugins
- **Next:** an independent security-first review of the whole change, then push
- **Git:** main @ c0dad92, 19 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
