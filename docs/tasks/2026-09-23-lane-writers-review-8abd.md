# Task: Lane writers-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-writers-review-8abd
- **State:** in-progress
- **Branch:** lane/writers-review-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T15:12:31.271Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N74. [TOUCH] The gate log never follows a link: lib/gate.mjs `runGate` (lines 173 to 181 at the base open `.git/skilliton/gate/<label>.log` with `openSync(path, "w", 0o600)`): open with `O_NOFOLLOW` (and `O_CREAT | O_TRUNC | O_WRONLY`), refuse when the path or any parent between the git folder and the file is a symbolic link (lstat each component), refuse a hard-linked target (nlink > 1), and report the refusal as the gate's failure to write its log, exit 3, with nothing written elsewhere. Reproduced at the base: with `.git/skilliton/gate/gate.log` a symlink to an outside file, `skilliton gate --cmd 'printf ok'` exits 0 and overwrites the outside file. Test: that fixture, asserting the outside file's bytes are unchanged and the exit and message; and a normal log still writes 0600.
- [x] N75. [FEATURE] The skill writers stay inside the repository: lib/skills-repo.mjs `findPlugin` (uses stat-following helpers), commands/new-skill.mjs (the writer at lines 69 to 92 at the base) and commands/import.mjs (the same destination logic): resolve the plugin folder, the `skills` folder and the destination skill folder with lstat at every component from the repository root down; a symbolic link anywhere on that path, or a destination that resolves (realpath) outside the repository root, refuses with exit 2 and "Nothing was written", naming the linked component; the plugin.json version bump happens only after the destination is proved inside. Reproduced at the base: a company repository whose `packs/company/plugins/review/skills` is a symlink to an outside folder; `new-skill review review-probe --pack company --repo <it> --apply` exits 0, creates the skill outside, prints the in-repository path, and bumps the plugin version. Test: that fixture for new-skill and for import (a source skill folder imported into the linked plugin), asserting nothing outside changed, the version did not move, exit 2 and the message; and the normal case still creates the skill and bumps the version.

## Decisions

not yet written

## Checkpoints

### 2026-09-23T15:08:26.842Z

- **State:** N74 done: the gate log is opened with O_NOFOLLOW after an lstat of each folder below the Git folder, a hard-linked log is refused, and the file is truncated only after the checks on the open descriptor; a refusal is exit 3 naming the link
- **Evidence:** node --test scripts/gate.test.mjs: 19 pass, 0 fail (the new link test fails at the base with exit 0 instead of 3); lint-shape, lint, deadcode, scrub-check exit 0
- **Next:** N75: the skill writers stay inside the repository
- **Git:** lane/writers-review-0923 @ ad53904, 3 uncommitted

### 2026-09-23T15:12:31.271Z

- **State:** N75 done: new-skill and import prove the plugin folder, its skills folder, the skill folder and plugin.json with lstat at every component from the repository root, and a real path inside it, before writing or bumping; a link refuses with exit 2 and Nothing was written, naming the component
- **Evidence:** node --test scripts/skill-writers.test.mjs: 5 pass (4 fail at the base); node scripts/skilliton.test.mjs: 198 ok; lint, lint-shape, docs, scrub-check exit 0
- **Next:** run node scripts/checks.mjs in full, write LANE_REPORT.md
- **Git:** lane/writers-review-0923 @ 809ce36, 6 uncommitted

## Handoff

- **State:** N75 done: new-skill and import prove the plugin folder, its skills folder, the skill folder and plugin.json with lstat at every component from the repository root, and a real path inside it, before writing or bumping; a link refuses with exit 2 and Nothing was written, naming the component. Evidence: node --test scripts/skill-writers.test.mjs: 5 pass (4 fail at the base); node scripts/skilliton.test.mjs: 198 ok; lint, lint-shape, docs, scrub-check exit 0.
- **Next:** run node scripts/checks.mjs in full, write LANE_REPORT.md
- **Blocked:** nothing
- **Watch out:** nothing known
