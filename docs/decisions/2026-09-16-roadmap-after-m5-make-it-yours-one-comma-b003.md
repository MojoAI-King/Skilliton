# Roadmap after M5: make it yours, one command per machine, autopilot on arrival

Kind: Living. Decision entry.

- **ID:** 2026-09-16-roadmap-after-m5-make-it-yours-one-comma-b003
- **Status:** accepted
- **Date:** 2026-09-16

## Decision

The owner's goal is a skeleton that any company forks from GitHub, keeps or extends with its own skills, releases, and has running on every person's machine as an autopilot in any repository. Three milestones follow M5 in PLAN.md section 7, in this order:

1. **M6, make it yours:** `skillgate company init` gives a fork its own marketplace name, owner and team settings; `skillgate new-plugin` creates a company plugin so `new-skill --pack <company>` works on a fresh fork; `docs/HOW-IT-WORKS.md` explains the whole path with diagrams, and a docs test keeps its commands and links real. Built in this round.
2. **M7, one command per machine:** one previewable, undoable command takes a clean machine to VERIFIED, and installing from a GitHub source is measured.
3. **M8, autopilot on arrival:** a never-prepared repository is offered preparation at session start, and a delivery policy is drafted from the project's detected test commands.

The owner chose on 2026-09-16 (user-stated in the session): the explanation is a repository document with diagrams GitHub draws, not a separate web page; the fork path is fixed before the document is written, so every step it shows has been run; one-command machine setup comes before autopilot on arrival.

## Why

Exploration found the documented customize step refused on a fresh fork (`new-skill` needs a plugin no command created), and a fork's team settings template still pointed projects at the upstream repository, so a fork that forgot to edit it would give its projects upstream's plugins instead of its approved ones. A document describing that path before fixing it would have described a step that fails. Installing on each machine is four to six commands per client, which is the next obstacle to "every person's machine".

## Alternatives rejected

- Writing the document first and marking the broken step: accurate, but it documents a known failure instead of removing it.
- Autopilot on arrival before one-command setup: a repository cannot offer preparation to a machine that does not have the plugins yet.
- Pushing installs through device management: PLAN.md section 9 defers it, and it cannot prove repository controls.

## Risk

M6 is measured with a local-folder marketplace only; installing from GitHub remains unrun until M7. `company init` requires a GitHub repository; other hosts are refused as not built. `new-plugin` does not edit a Codex catalog at `.agents/plugins/marketplace.json`, whose format is unverified.

## Reversibility

EASY. The commands only write after `--apply`, back up what they change, and the roadmap rows are text.

## Evidence

`evidence/rehearsals/2026-09-16-fork/SUMMARY.md` (7 of 7 on Claude Code 2.1.273 and Codex 0.154.0-alpha.6.2); `scripts/skillgate.test.mjs` sections for `company init` and `new-plugin`; `scripts/docs.test.mjs` and its self-test.
