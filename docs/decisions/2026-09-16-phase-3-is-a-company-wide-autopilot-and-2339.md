# Phase 3 is a company-wide autopilot, and every technical name becomes Skilliton

Kind: Living. Decision entry.

- **ID:** 2026-09-16-phase-3-is-a-company-wide-autopilot-and-2339
- **Status:** accepted
- **Date:** 2026-09-16

## Decision

Phase 3 (PLAN.md section 7, M8 to M14; explained in docs/PHASE-3.md) makes Skilliton work the way device management prepares a company laptop, for AI-assisted development:

1. **One name (M9).** Every current technical name becomes Skilliton, including the command, marketplace, project folder, environment variables, instruction markers, receipt schema, release tags and machine folders. Prepared projects and joined machines move by a previewable, reversible migration, and only the migration reads the old names. Recorded evidence keeps the names it was recorded with. This supersedes the compatibility list of the earlier naming decision (2026-09-16-skilliton-is-the-evolved-product-name-0be0) and docs/BRANDING.md.
2. **A security audit that runs itself (M10):** a deterministic offline audit in a Claude Code routine, a git pre-push hook and the merge gate, with findings recorded as security observations. Anthropic's `security-guidance` plugin is enabled through the company profile rather than rebuilt.
3. **Routines while working (M8, M11):** preparation offered on arrival, a dispatch suggestion, a checkpoint snapshot around compaction, a maintain suggestion, each ending with the next command.
4. **Enrollment through device management (M12):** Skilliton builds a bundle that a company's own device management delivers, including each tool's managed settings, the release signers, first-login setup, a detection script reporting the verify result, offboarding and release rings. It does not operate device management.
5. **Any AI coding tool (M13):** a portable core (skills, instruction block, git hooks, merge gate, command) plus an adapter per tool. A tool counts as supported only after it is measured.
6. **Proof of value (M14):** a measured comparison and a team view. Time, cost and quality statements come only from those numbers.

The order until the demonstration around 2026-09-23 is: the rename, the enrollment spike, the audit, two routines, then a Cursor spike, and a demonstration of what passed.

Owner choices recorded the same day: the `SG-` security control IDs are kept (O23). The next tool is Cursor, on the owner's Cursor account; the owner first chose Grok, then Cursor instead, since their Grok use is through Cursor and Grok Build needs a subscription (O24).

## Why

The owner described this direction on 2026-09-16. A company should create one autopilot package and push it to every developer's device the way Intune and Entra ID push a laptop setup. It should work in Claude Code, Codex, Grok, VS Code, Hermes, Cursor and similar tools, and run security audits, maintenance, compaction and dispatch by itself as people develop. It should explain what to run next and take the routine burden off people, especially those who build with AI without large-team experience. The owner also asked that the whole project be Skilliton rather than Skillgate.

Claude Code documents the delivery half: managed settings as files, a drop-in folder, macOS profiles and Windows registry values, with Jamf and Intune templates. Codex, Cursor, VS Code with GitHub Copilot and Grok Build document their own company-managed files, and skills, AGENTS.md and Claude Code's plugin and hook files are read across tools (docs/PHASE-3.md, Tool support). That makes the device-management model buildable without Skilliton becoming a device management product.

## Alternatives rejected

- **Keeping the old technical names with a display rename:** contradicts the owner's instruction, and two names in the code and folders confuse every reader and reviewer.
- **Keeping `skillgate` as a permanent alias:** two command names and two sets of variables to test and secure. The migration is the one place old names are read.
- **Rebuilding in-session security review for Claude Code:** Anthropic's plugin already does it (documented). Skilliton's audit covers what that plugin cannot: other tools, git hooks, the merge gate and recorded evidence.
- **Talking to Intune or Jamf directly:** adds tenant credentials and vendor interfaces to the trust chain. Companies already know how to deliver files and scripts.
- **Claiming support for every tool at once:** each tool's skills, instructions and hooks differ, and a claim before measurement breaks the repository rule on unverified capabilities.

## Risk

- The rename touches trust, undo and migration code; it needs the same tampered-input tests and an independent review before publishing.
- Claude Code documents that automatic marketplace registration misses some machines, such as non-interactive environments, so enrollment may still need first-login setup. That is the first spike.
- A deterministic audit with many false alarms teaches people to skip the git hook.
- Tools other than Claude Code and Codex are unmeasured here, and their documented behavior changes between versions.
- "Saves money" is unmeasured and could be false for compaction.

## Reversibility

The plan itself: easy, by changing PLAN.md. The rename: moderate. The migration has a rollback, but installed machines and prepared projects must move twice to reverse it, so it is done once, before any real user.

## Evidence

The owner's direction in this session (user-stated, 2026-09-16). Vendor documentation retrieved the same day, listed in docs/PHASE-3.md Sources. Measured client behavior is in docs/CLIENTS.md. Tool availability on the build machine was checked the same day (Claude Code; Cursor's terminal agent 2026.02.13 and a Cursor skills folder, without the Cursor editor; VS Code 1.138.0 with the Claude Code and OpenAI extensions; Docker and Colima).
