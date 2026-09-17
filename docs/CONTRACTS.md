# Contracts

Kind: Living. PLAN.md is the product authority. This file holds the shared names, formats, interfaces and exit meanings every component uses. Change a shared format here first, then every reader and its checks together. Sections 9 to 15 are integration contract v1, implemented in workflow 0.3.0 and guardrails 0.2.0 with the choices the implementation lanes recorded; PLAN.md section 7 records what has been proved and how.

## 1. Packs and plugins

| Pack | Plugin | Ships | Invocation |
|---|---|---|---|
| `base` | `context-hygiene` | skill `context-hygiene`; SessionStart hook `session-start-checklist.sh`; status line `statusline-quota.sh` (applied by `scripts/setup.mjs`) | model-invoked |
| `base` | `workflow` | skills `task`, `dispatch`, `review`, `handoff`, `maintain`, `security`; hooks: SessionStart `session-start-handoff.sh` and `skilliton hook session-start`, Stop, PreCompact and SessionEnd `skilliton hook <event>`; the Skilliton runtime (`runtime/`, launched by `bin/skilliton`); the harness template (`templates/harness.md`); security catalogs (`catalogs/`) | `/workflow:<skill>`, model-invoked from the description, or `skilliton <command>` |
| `base` | `guardrails` | PreToolUse hook `guard-bash.sh` on the Bash tool (asks in Claude Code, refuses in Codex; section 15); SessionStart hook `session-start-guardrails.sh` (one status line: on, off, or a problem); skill `guardrails` explaining what is blocked and why | hook runs on every Bash call; skill model-invoked |
| `<company>` (in a fork) | anything | the company's own skills | `/<plugin>:<skill>` |

Rules:
- Base plugins live under `packs/base/plugins/`. **A fork treats `packs/base/` as read-only** and adds its own packs beside it (`packs/<company>/plugins/<plugin>/`, created with `new-plugin` after `company init` names the fork), with one stated exception: `packs/base/plugins/workflow/templates/harness.md` is the company's instruction template and a fork may edit it (expect to reconcile that one file when taking upstream changes). That reduces conflicts when reviewing upstream proposals; it does not remove the need for company review.
- Plugin skills are namespaced by Claude Code (`/plugin:skill`), which separates plugin invocation names from personal skill names. Verify discovery and invocation on each supported client.
- Every plugin skill's `SKILL.md` frontmatter carries `name` (required for plugin skills) and `description`.
- Every plugin's `plugin.json` carries `version`. Installed copies only receive an update when that version changes, so **every change to a plugin bumps its version**.

## 2. Project config: `.skilliton/config.json`

One file at the repo root, one section per component. Every key is optional. The code contract is `packs/base/plugins/workflow/runtime/lib/config.mjs`; every reader resolves the project through its `resolveProject()`.

```json
{
  "prepare":    { "version": 2,
                  "artifacts": { "status": "docs/STATUS.md", "backlog": "docs/BACKLOG.md", "backlogArchive": "docs/BACKLOG_ARCHIVE.md", "roadmap": "docs/ROADMAP.md", "decisions": "DECISIONS.md", "lessons": "docs/LESSONS.md", "handoff": "docs/HANDOFF.md", "handoffArchive": "docs/HANDOFF_ARCHIVE.md", "maintain": "docs/MAINTAIN.md" },
                  "directories": { "tasks": "docs/tasks", "decisions": "docs/decisions", "lessons": "docs/lessons" },
                  "integrationBranches": ["main", "master"],
                  "requires": { "workflow": "0.3.0" } },
  "handoff":    { "file": "docs/HANDOFF.md", "maxBytes": 6000 },
  "checkpoints":{ "stopReminder": true, "minMinutes": 20 },
  "security":   { "maxAgeDays": null },
  "maintain":   { "teamLessonsFile": null },
  "dispatch":   { "laneRoot": "../<repo-name>-lanes", "hotspots": [], "mainOnlyPaths": ["docs/", "DECISIONS.md"], "laneSetup": [], "laneTestCommand": null, "mainOnlyChecks": [], "maxItemsPerLane": 8, "minItemsForLanes": 6 },
  "guardrails": { "protectedBranches": ["main", "master"], "blockForcePush": true, "blockNoVerify": true, "blockSecretFiles": true }
}
```

- `prepare.version` is the project **layout** version: `1` was the standalone prototype (copied runtime at `.skillgate/bin/security-evidence.mjs`, `skillgate:project` markers), `2` is the integrated layout under the earlier Skillgate names, and `3` is the integrated layout under the Skilliton names. Layouts 1 and 2 keep their configuration in the earlier `.skillgate/config.json`; only `migrate`, `status`, `doctor` and the hooks open such a project, and every other command refuses it with the migrate command. Both configuration files at once are refused. A version the runtime does not know is refused, never guessed.
- `prepare.artifacts`: each record role maps to one Markdown file. Without an entry, the first existing conventional path is adopted (`config.mjs` `ROLE_CANDIDATES`), else the first candidate is the default. Two roles on one file, a path through a symbolic or hard link, a path under `.skilliton/`, or an instruction file (`AGENTS.md`, `CLAUDE.md`, `README.md`, entry-folder READMEs) is refused.
- `handoff.file` stays compatible: it names the handoff record when `prepare.artifacts.handoff` is absent, and disagreement between the two is refused.
- `prepare.requires` maps plugin names to the **minimum** package version the project needs. Installed runtime version, required version, and applied layout/migrations are reported separately (never merged into one "up to date").
- `prepare.integrationBranches`: branches where the shared handoff, status, backlog and indexes are written. Everywhere else, work is recorded in its task record.
- `prepare` writes `handoff.file` equal to `prepare.artifacts.handoff`, because the session-start handoff hook reads `handoff.file`.
- Environment overrides: `SKILLITON_TEAM_LESSONS` (maintain), `SKILLITON_GUARDRAILS=off` (turns the guardrails hook into a visible no-op for one session; it prints that it is off), `SKILLITON_GUARDRAILS_CLIENT=claude-code|codex` (overrides guardrails' client detection), `SKILLITON_TRUST_DIR` (release signers, default `~/.config/skilliton/trust`), `SKILLITON_BACKUPS` (backups of files outside a project's Git folder), `SKILLITON_DENYLIST` (the private name scan), `SKILLITON_SELF` (how help text names the command). A variable still set under an earlier `SKILLGATE_*` name is not read; the command line and the session start name it and its replacement (section 16).

## 3. Handoff file: `docs/HANDOFF.md`

- Starts with `# Handoff`, then `Kind: Living.`, then a section headed exactly `## RESUME HERE`.
- `RESUME HERE` starts with a `Written: <date and time>` line, read from the clock, then four labelled items: **State**, **Next**, **Blocked**, **Watch out**. `status` reports a Written time more than five minutes later than the machine's clock as a problem, because it cannot be compared with later changes.
- Older blocks go under `## Earlier` as `### <Written date>` (newest first, at most five), older still to `docs/HANDOFF_ARCHIVE.md` (`Kind: Reference.`).
- Writers: `/workflow:handoff` (quick, end of a stretch of work) and `/workflow:maintain` (full reconciliation), **on an integration branch only**. On any other branch they write the task record's `## Handoff` section instead (section 11). Reader: `session-start-handoff.sh`, which prints the `RESUME HERE` section only, bounded by `handoff.maxBytes`, and prints a one-line notice when the file or section is missing.

## 4. Harness block in `CLAUDE.md` and `AGENTS.md`

The instructions that tell the model when to use which skill. Managed by `skilliton harness`, rendered from `packs/base/plugins/workflow/templates/harness.md`. `skilliton prepare` and `skilliton migrate` obtain block text only from the same renderer (`core.mjs` `planHarnessFile`); nothing else writes managed instruction markers.

```
<!-- skilliton:harness:start v1 -->
... rendered template ...
<!-- skilliton:harness:end -->
```

- Exactly one block per file. Applying replaces the text between the markers and never touches anything outside them.
- The template may name project values as `{{key}}`; the keys are `config.mjs` `templateVars()` (`status`, `backlog`, `backlogArchive`, `roadmap`, `decisions`, `lessons`, `handoff`, `handoffArchive`, `maintain`, `tasksDir`, `decisionsDir`, `lessonsDir`, `integrationBranches`). An unknown key is refused. Doctor compares a file's block with the template rendered for that project.
- The block labels every behavior as **enforced** (the installed, enabled hook handles its supported client event) or **instructed** (the model is asked to do it). Showing an existing handoff does not ensure one was written. Nothing instructed is described as guaranteed.
- `CLAUDE.md` and `AGENTS.md` receive the same block. Hook execution and skill invocation still need client-specific adapters and proof; matching Markdown does not establish Codex parity.
- Template changes reach a project when `harness --apply` or a project migration runs, never silently on plugin update.

## 5. Team settings: `templates/project-settings.json`

The file a company commits as `.claude/settings.json` in its product repos, to declare the company marketplace, automatic plugin updates, and enabled base plugins for Claude Code. Keys (from the official settings docs; the fresh-user trust and install flow is part of the M3 rehearsal): `extraKnownMarketplaces.<name>.source`, `extraKnownMarketplaces.<name>.autoUpdate`, `enabledPlugins["<plugin>@<marketplace>"]`.

## 6. The command line: `skilliton`

The runtime is `packs/base/plugins/workflow/runtime/skilliton.mjs`. `scripts/skilliton.mjs` runs it from a company skills repository checkout; `bin/skilliton` runs it from an installed plugin (Claude Code documents that a plugin's `bin/` is on the Bash tool's PATH while the plugin is enabled; the live check is recorded in DECISIONS.md). Runtime code never imports anything outside the plugin folder.

| Command | Does | Writes |
|---|---|---|
| `doctor [--dir <project>]` | inspects installation/configuration records, declared auto-update, managed instructions, project config, layout and required versions; it does not prove a hook executed | nothing |
| `harness [--apply] [--undo] [--file CLAUDE.md\|AGENTS.md] [--dir <project>] [--template <file>]` | shows, applies, or removes the harness block | the named file, after a backup |
| `project-settings [--apply] [--dir <project>] [--marketplace-repo owner/repo] [--marketplace-name <name>] [--template <file>]` | shows or writes `.claude/settings.json` from the template, merging with an existing file | `.claude/settings.json`, after a backup |
| `company init --name <company> --marketplace-repo <owner>/<repo> [--marketplace-name <name>] [--owner-name <text>] [--repo <dir>] [--apply]` | sets the catalog `name` (default: the company name) and `owner`, and rewrites the team template's marketplace name, GitHub repository and `@<marketplace>` endings to match; base plugin entries are unchanged; a repeat changes nothing; refuses a missing or non-GitHub repository and JSON not laid out as two-space JSON | `.claude-plugin/marketplace.json`, `templates/project-settings.json`, after a backup |
| `new-plugin <plugin> --pack <pack> [--description <text>] [--license <id>] [--repo <dir>] [--apply]` | creates `packs/<pack>/plugins/<plugin>/.claude-plugin/plugin.json` (version 0.1.0; author from the catalog owner; homepage and repository from the template's GitHub repository; license default `UNLICENSED`), appends the catalog entry and enables `<plugin>@<marketplace>` in the team template; refuses a name any pack or the catalog already uses, and a catalog and template naming different marketplaces; never edits `.agents/plugins/marketplace.json` | the new manifest; the catalog and template, after a backup |
| `new-skill <plugin> <skill> [--pack <pack>] [--repo <dir>] [--description <text>]` | scaffolds `packs/<pack>/plugins/<plugin>/skills/<skill>/SKILL.md` with frontmatter and bumps the plugin version | the new skill, `plugin.json` |
| `import <skill-dir> --into <plugin> [--pack <pack>] [--repo <dir>] [--name <skill>]` | scans the source (scrub check, secret shapes, home paths; refuses when no denylist is configured), then copies it into a company plugin | the copied skill, `plugin.json` |
| `prepare`, `migrate`, `remove`, `status`, `task`, `checkpoint`, `record`, `index`, `security`, `hook`, `propose`, `release`, `verify`, `trust`, `join`, `preflight`, `delivery` | sections 10 to 14 (built in workflow 0.3.0; `join` in 0.5.0; `preflight` in 0.7.0) | per command |

A listed command whose module is not present is refused as "not built in this version" (exit 2) and marked so in `--help`.

Every writing command shows its change first, writes only with `--apply` (or its own explicit verb), backs up what it overwrites, and exits non-zero with a plain-English reason when it refuses.

**Exit codes, every command:** `0` complete; `1` attention (an evaluated state needs action: a required doctor check, missing or stale evidence, a pending migration, a tampered package); `2` invalid or refused (bad invocation or data; nothing was written); `3` operation failed (an internal error, or a write that failed; the output says what completed). Recording an unresolved assessment successfully is `0`: the recording succeeded, not the control. Neither a zero exit nor current evidence freshness is a compliance verdict.

## 7. Improvement and update authority

Upstream proposal -> company review and tested release -> installed package update -> separate versioned project reconciliation. Application changes continue through normal application review and delivery. Plugin updates do not silently alter historical decisions, completed work, human edits or the application's code.

A lesson can propose a changed skill, check or template. It needs a reproducible scenario and review before becoming a released company default. Company extensions remain beside the base; upstream changes are reviewed rather than automatically granted company authority. A downstream repository owns its actual records and approved applicability choices.

Changes to validation policy need review by the authority configured for that repository; the proposed change cannot certify its own weakening of checks.

## 8. Evidence types stay separate

| Evidence | Schema and storage | Meaning |
|---|---|---|
| Skill evaluation | `scripts/evidence.mjs` summaries under `evidence/<commit>/` | whether packaged skills behaved as intended in named eval cases |
| Project security observations | `.skilliton/security/` in each application repository | what was assessed in that project, with fingerprints, freshness and gaps |
| Release and rehearsal evidence | `evidence/releases/<version>/`, `evidence/rehearsals/<date>-<name>/` in the skills repository | which checks ran against which exact candidate, with omissions stated |

---

## 9. Integration contract v1: runtime modules

Agreed 2026-09-16 by the integrating session and implemented by six lanes merged one at a time.

- **Command module:** `runtime/commands/<name>.mjs` exports `help` (string, printed for `--help`) and `async run(argv)` returning an exit code. Options are parsed with `core.mjs` `parseArgs(argv, { flags, options }, "<name>")`; a command that needs a repeatable option (`--source`, `--artifact`, `--evidence`, `--criteria`) collects those first. `Refused` means exit 2; other errors exit 3. A subcommand is the first plain argument.
- **Engines:** `runtime/lib/`: `config.mjs`, `core.mjs`, `prepare.mjs`, `project-files.mjs`, `prototype-v1.mjs`, `migrations.mjs`, `ids.mjs`, `records.mjs`, `tasks.mjs`, `journal.mjs`, `lifecycle.mjs`, `security.mjs`, `collectors.mjs`, `treehash.mjs`, `release.mjs`, `verify.mjs`, `trust.mjs`, `delivery.mjs`.
- **`--json`:** where offered (prepare, migrate, status, verify), stdout carries exactly one `{ "schema": "skilliton.result/1", "command", "result": "complete" | "attention" | "invalid" | "operation-failed", "summary", "details" }` object, including on refusal and failure. The exit code matches `result`.
- **Cross-lane functions:**
  - `migrations.mjs`: `MIGRATIONS` (the ordered layout migrations), `migrationById(id, project)` (a layout migration or an instructions refresh), `instructionsState(project)`, and `migrationState(project) -> { layoutVersion, target, pending: [{ id, from, to, summary }], applied: [receiptId], instructions: { id, templateSha12, outdated: [file], applied } | null }`.
  - `security.mjs`: `securitySummary(root) -> { available: true, catalogVersion, total, applicable, current, missing, stale, expired, invalid, gaps, needsHuman, undecided }` or `{ available: false, reason }`; never throws for missing evidence.
  - `tasks.mjs`: `currentTask(project, branch) -> { task | null, ambiguous: [ids], unreadable: [...] }`; `readTask(file)` adds `file`, `criteria`, `lastCheckpoint` and `sections` to the contract fields.
  - `journal.mjs`: `appendEvent(root, event)`, `lastEvents(root, n)` (an array that also carries `corrupt`, `path`, `exists`, `truncated`). Events may also carry `task`, `source`, `trigger`, `reason`, `git`. A plain `stop` event is never written; only `stop-reminded`.
- Commands that call another engine import it dynamically and report "not available in this build" when it is missing. Task, decision and lesson IDs (`YYYY-MM-DD-<slug>-<hex4>`) come only from `ids.mjs`: `newId(title, { date, fallback, hex })`, `isId(id)`, `slugify(title, fallback)`, `localDate(date)`; no other runtime module defines the pattern (scripts/records.test.mjs checks).

## 10. Prepared project layout 3

| Path | Owner | Notes |
|---|---|---|
| `.skilliton/config.json` | project (human-editable) | section 2 |
| record files from `prepare.artifacts` | project | adopted when present and never modified; created with an explicit "not yet assessed" state when missing; decisions, lessons and status carry an empty managed index section |
| `docs/tasks/`, `docs/decisions/`, `docs/lessons/` (from `prepare.directories`) | project | one file per entry; each folder gets a README explaining the entry format |
| harness block in `CLAUDE.md` and `AGENTS.md` | Skilliton (section 4) | the only managed instruction content |
| `.skilliton/security/catalog.json`, `applicability.json`, `records/<uuid>.json`, `REPORT.md`; `docs/security/README.md` | project (catalog adopted from the package; records immutable; report generated with its marker) | section 12 |
| `.skilliton/delivery.json` | project policy (policy path) | section 14 |
| `.skilliton/migrations/<id>.json` | Skilliton receipt, committed | one per applied migration |
| `.skilliton/private-evidence/`, `.skilliton/prepare.lock` | local, ignored | added to `.gitignore` by prepare |
| `<git-dir>/skilliton-backups/<id>/` | local, never tracked | backups of every file prepare, migrate, remove, task close and checkpoint changed |
| `<git-dir>/skilliton/journal.jsonl` | local, per clone and per worktree | section 11 |

There is **no copied runtime** in layouts 2 and 3: the project never stores a path to a toolkit clone, and moving or deleting a clone does not break it (measured, company release rehearsal P2).

- **`prepare [--dir <repo root>] [--apply | --check] [--json]`:** the target must be a Git repository root. Preview by default; `--apply` writes transactionally (lock, recheck each destination immediately before replacing it, Git-private backups, rollback that preserves edits made meanwhile, exit 3 when a rollback was incomplete); `--check` reads only and exits `1` when anything is missing or outdated, or a layout-1 or layout-2 project waits for its migration. Repeat apply changes nothing. A layout-1 or layout-2 project is refused (exit 2) with the migrate command. In a prepared project, an existing instruction block that differs from the template is listed as `migrate` and left for `skilliton migrate`. `prepare.requires.workflow` is set when absent and raised when a project moves to a newer layout; a project requiring a newer runtime is refused.
- **`migrate [--dir] [--apply] [--rollback <id> [--apply]] [--json]`:** preview exits `1` while a migration is pending. Receipts: `{ "schema": "skilliton.migration-receipt/1", "id", "from", "to", "appliedAt", "runtime", "files": [{ "path", "action", "beforeSha256", "afterSha256" }], "backup" }`, plus `blocks` and `templateSha256` for an instructions refresh. `--rollback <id>` previews by default and restores only when every file still holds exactly what the migration wrote and every backup matches; it refuses while a receipt applied later (by its recorded `appliedAt`, not its ID, since an instructions refresh can come before or after a layout migration; equal times fall back to the ID; a receipt with the earlier schema is never later than one this runtime wrote) is still present, an unknown migration, a receipt naming a path its migration never touches, and a receipt with the earlier `skillgate.migration-receipt/1` schema, which only the release that wrote it rolls back. Layouts 1 and 2 keep receipts in `.skillgate/migrations/`.
- **Migration `0002-integrated-layout`** (layout 1 to 2): removes `.skillgate/bin/security-evidence.mjs` only when its sha256 matches the prototype runtime released at `23aae41`; removes `skillgate:project` blocks from `CLAUDE.md`, `AGENTS.md` and the maintain record only when their content equals the prototype's rendering; adds the harness blocks; sets `prepare.version` 2 and `prepare.requires.workflow`.
- **Migration `0003-skilliton-names`** (layout 2 to 3): moves every file under `.skillgate/` to `.skilliton/` inside one transaction (receipts, observations and ignored private evidence included; `config.json` gets `prepare.version` 3 and `prepare.requires.workflow`); renames the earlier harness block in `CLAUDE.md` and `AGENTS.md` to the current template under the Skilliton markers, refusing a block that differs both from the last earlier instructions receipt and from the earlier release's rendering of the template; renames generated marker lines (index sections, security findings, the report marker) in records and the report; adds the current `.gitignore` lines as its first write and keeps the earlier ones, for clones and branches not yet migrated; renames the marketplace key `skillgate` and `<plugin>@skillgate` keys in `.claude/settings.json` when the file is in two-space JSON and no current key of the same name exists (refused otherwise); regenerates the READMEs prepare wrote when their bytes are exactly the earlier rendering. A moved file keeps its permissions, and anything under `private-evidence/` is written 0600 in 0700 folders. It refuses a `.skilliton/` folder that holds files, a link, a special or hard-linked file, a file over 1 MB, names that differ only in letter case, a lock left by another run, and an instruction block that is neither the earlier release's rendering of the current template nor what the last earlier instructions receipt recorded. After applying, `migrate` checks with Git that `.skilliton/private-evidence/` is ignored and, when it is not, exits 1 telling the person not to commit. A rollback of 0003 refuses while files it did not create exist under `.skilliton/`, and a 0003 receipt must pair every file created under `.skilliton/` with the deletion of the same file under `.skillgate/`. Its notes name record text that still says skillgate, configuration values it kept, observations whose files moved (they report those files missing until reassessed), a delivery gate to reinstall, and the journal and backups left in the Git folder.
- **Migration `0100-instructions-<template sha256, 12 hex>`:** pending in a layout-3 project when an existing managed block differs from the current template's rendering. It replaces only the text between the markers, records each block's hash in its receipt, and refuses a block whose hash differs from what the previous instructions receipt recorded (a hand edit inside the markers), naming the reconciliation.
- **`remove [--dir] [--apply] [--config]`:** removes the harness blocks, the generated security report, and (with `--config`) `.skilliton/config.json`; keeps every record, entry, observation, receipt and the Git history, and says so. A layout-1 or layout-2 project is refused.

## 11. Records, tasks, checkpoints and lifecycle

- **Entry IDs:** `YYYY-MM-DD-<slug>-<hex4>`. Two entries with the same title on the same day on two branches collide with probability 1 in 65,536, and Git shows that as a merge conflict, never an overwrite.
- **Task record** (`docs/tasks/<id>.md`): the header bullets **ID**, **State**, **Branch**, **Owner**, **Updated**, then `## Request`, `## Acceptance criteria`, `## Decisions`, `## Checkpoints`, `## Handoff`. Each checkpoint is `### <ISO time>`, a blank line, and four bullets: **State**, **Evidence** (`none given` when absent), **Next**, **Git** (`<branch> @ <short head>, <n> uncommitted`). Placeholders read `not yet written`.
- **Commands:** `task start "<title>" [--criteria ...] [--branch] [--owner] [--dir] [--apply]` (state `in-progress`, owner `unassigned`, branch the checked-out one; a detached HEAD needs `--branch`); `task list [--all]`; `task show [<id>]`; `task close <id> --state done-local|merged|released|verified|abandoned [--apply]`; `checkpoint [--task <id>] --state --next [--evidence] [--dir] [--apply]`. The current task is the open task whose Branch is the checked-out branch; more than one is reported as ambiguous, never picked.
- **Decision and lesson entries:** `record decision|lesson "<title>" [--dir] [--apply]`, with the sections listed in the templates; Status is `proposed` off an integration branch, else `accepted`.
- **Indexes:** `index [--dir] [--apply]` regenerates the managed sections deterministically; `--apply` refuses off an integration branch; text outside the markers never changes; rerunning after a merge resolves an index conflict. A record without markers (an adopted one) gets its section appended only when there is something to list; until then it is left as it is.
- **Status:** `status [--dir] [--json]`: one line per check (layout, migrations, versions, records, tasks, handoff, sessions, security) and a summary. Exit `1` for attention (a pending migration, an unmet required version, missing records, a stale handoff, or one whose Written time is later than now, on an integration branch, an interrupted session with uncommitted changes, unreadable or ambiguous tasks, security attention); a check that is "not run" (an absent module) does not change the exit code; `3` when a check could not be evaluated.
- **Hooks** (`"${CLAUDE_PLUGIN_ROOT}"/bin/skilliton hook <event>`, timeout 15 seconds; the handoff hook stays first in `hooks.json`):
  - `session-start`: a "Project state" block bounded by `handoff.maxBytes` (current task, task handoff, previous session, shared handoff first, then layout, migrations, versions, records, security), and a journal event. An internal failure prints one notice line on stdout (the stream the client adds to context) and exits 0.
  - `stop`: blocks once per working tree state, measured from the later of the last checkpoint and this session's first start, after `checkpoints.minMinutes`, never when `stop_hook_active` is true; the reason names the exact command. Failures print one line on stderr and allow.
  - `pre-compact`, `session-end`: journal events; session-end gives `git status` one second because Claude Code shares a short budget among SessionEnd hooks.
- **Interrupted session:** a `session-start` with no later `session-end` for the same session ID; the next session's Project state names it (measured live on Claude Code).

## 12. Project security evidence

- **Engine and command:** `runtime/lib/security.mjs` keeps the prototype's record schema 1, immutability and refusal of links and secret-shaped input. `security status|record|applicability|collect|findings`, each with `--dir`, preview by default, `--apply` to write. Status exits `0` only when every applicable control has a current observed record; `1` for missing, stale, expired, gap, needs-human or undecided; `2` for an invalid catalog, records or input (then `--apply` writes no report); `3` for failures.
- **Applicability:** `applicability.json` as agreed; newest decision per control wins; undecided counts as needs-human; `applies: false` leaves the denominator and is listed with its rationale. Concurrent writers take `applicability.lock`; a left-over lock refuses with instructions.
- **Freshness:** stale when a fingerprinted file changed or disappeared, the control or catalog version changed, or `maxAgeDays` passed (the control's own value wins over `security.maxAgeDays`). Scan evidence carries a file manifest; its files are re-verified by size, time and, when the time differs, content. Regenerating a report never creates or re-dates a record.
- **Collectors** (`security collect <name> [--control <id>] --apply`): `tests` runs the delivery policy's checks without a shell (default control `SG-SECURITY-TESTS`, requires `--source`, adds the policy file to its sources); `secrets` scans tracked files and records a **gap** only for specific shapes (private key block, provider token prefix, JSON web token) and **needs-human** when only generic shapes match (default control `SG-SECRETS-IN-SOURCE`); `delivery-policy` (default control `SG-CHECK-CRITERIA`). Artifacts go to `.skilliton/private-evidence/`, which other clones do not have, so there the record reads stale.
- **Findings:** `security findings --apply` writes one row per applicable control that is not current, observed and decided, keyed `SEC-<id>`, sorted, idempotent; a resolved row leaves; a missing backlog record or invalid evidence refuses.
- **Catalogs:** `catalogs/index.json` names `skillgate-baseline-2` (15 controls, 36 related references to NIST SSDF 1.1 and OWASP ASVS 5.0.0, verified in docs/security-catalog-sources.md). Prepare copies it into new projects; an existing project keeps its catalog until a reviewed migration changes it.

## 13. Releases, verification and trust

- **Manifest** `releases/<version>.json`: the agreed fields plus `notes` (what could not be recorded, for example an absent migrations module) and `clients` (`{ catalog, marketplace, plugins }` per client, with a note when there is no Codex catalog). `release create` refuses any uncommitted, untracked, ignored or mode change under a component, a duplicate version, an escaping or linked component path, disagreeing versions, uncommitted evidence, and (when the release carries migrations) a runtime other than the release's own workflow plugin.
- **Approval and withdrawal:** `release sign <version> [--apply]` checks the manifest is committed and unchanged and every component still matches, requires SSH signing, then tags `skilliton-release/<version>` with `manifest-sha256: <hex>`. `release withdraw <version> --reason <text> [--apply]` tags `skilliton-withdrawn/<version>`. `release list [--company]` shows approved, unapproved and withdrawn; exit `2` when trust is missing or any tag does not check out.
- **Trust:** `trust add --company <name> --signers <file> [--apply]`, `trust show [--company]`, `trust remove --company <name> [--apply]`. A trusted tag must be annotated, name itself, point at a commit, carry one complete SSH signature verified with `ssh-keygen`, and name a principal from the signers file.
- **`verify [--client claude-code|codex] [--config-dir] [--source] [--company] [--json]`:** VERIFIED, TAMPERED (changed, added, missing or unreadable files named), UNKNOWN VERSION, WITHDRAWN, NOT INSTALLED. Exit `0` only when every company plugin is VERIFIED and every file its release marks executable is executable; `1` otherwise (including nothing installed, or a lost executable bit); `2` when trust is missing, the client's install records are malformed, or any release tag in the source does not verify (O19); `3` on failure. `--source` defaults to the skills repository the runtime runs from; from an installed copy, to the clone `join` recorded for `--company` (or for the only company joined), else it is required; a URL source is not built. For Codex without a Codex catalog, the marketplace name comes from `.claude-plugin/marketplace.json`, as a release manifest records it. The content hash does not cover the executable bit: a file the release marks executable that is not executable stays VERIFIED by content, is listed in the plugin line's `notRunnable`, and makes the exit `1`; a bit the release does not have is a note. Both clients kept every executable bit on a clean install (measured 2026-09-16). Claude Code install records and Codex cache folders are read as observed and labelled undocumented.
- **Joining a machine:** `join --company <name> --signers <file> [--client all|claude-code|codex] [--marketplace <owner>/<repo>|<folder>] [--plugins <a,b>] [--bin-dir <folder> | --no-launcher] [--claude <path>] [--codex <path>] [--repo <clone>] [--apply]` and `join --undo --company <name> [--claude <path>] [--codex <path>] [--apply]`. It runs from a full (not shallow) clone of the company skills repository, which becomes the verify source. For each client found it runs `claude plugin marketplace add <source>` and `claude plugin install <plugin>@<marketplace>`, or `codex plugin marketplace add <source> --json` and `codex plugin add <plugin>@<marketplace> --json`, creating a missing `CODEX_HOME` first (Codex refuses one that does not exist). `--marketplace` defaults to the team template's GitHub repository; plugins default to the template's enabled plugins and must include `workflow`. Trust uses the `trust add` checks. The launcher `<bin-dir>/skilliton` (default `~/.local/bin`) is a POSIX shell script that runs `node <clone>/scripts/skilliton.mjs`; a file already there that is not this company's launcher is never replaced, and no shell profile is edited. Install state is read from the clients' files, and a client binary runs only to make a change (every Codex invocation writes into its home), so a preview, a repeat with nothing to do, and a refusal run no client. Receipt `$SKILLITON_JOIN_DIR/<company>.json` (default `~/.config/skilliton/joined/`, mode 0600), rewritten through a temporary file after every change: `{ "schema": "skilliton.join/1", "company", "source", "joinedAt", "updatedAt", "marketplace": { "name", "kind": "github"|"directory", "location" }, "trust": { "path", "sha256" } | null, "clients": { "claude-code"|"codex": { "home", "marketplaceAdded", "installed": [], "createdHome"? } }, "launcher": { "path", "sha256", "createdFolder" } | null }`. Undo requires each client home to be the one recorded; uninstalls the recorded plugins still installed; removes the marketplace when join added it and nothing else from it is installed; removes the signers file and launcher when their sha256 still matches (and the launcher folder if join created it and it is empty); backs up the signers file and the receipt, then deletes the receipt. Exit `0` complete and every plugin VERIFIED (undo: everything removed); `1` attention (a plugin not VERIFIED, the launcher not written, or undo kept something); `2` refused before any change; `3` a client command failed part way (the receipt records what completed).
- **Machine checks before setup:** `preflight [--client all|claude-code|codex] [--marketplace <owner>/<repo>|<folder>] [--bin-dir <folder>] [--no-network] [--repo <clone>] [--wide] [--json]`. It changes nothing except one file named `.skilliton-preflight-<12 hex digits>` (mode 0600) that it writes and removes in each folder it tests, and a folder that does not exist yet, which it creates (mode 0700), tests and removes again; an interrupted run removes its own file. Programs come from the `PROGRAMS` table in `runtime/lib/preflight.mjs`, which `scripts/allowlist.test.mjs` holds equal to section 1 of docs/IT-ALLOWLIST.md: the ones hooks start are started by `runtime/preflight/probe.sh`, run by its path (the way Claude Code runs a hook), and the ones the runtime starts are started by node, each once with `--version`; a file on PATH that this user may not run is reported as blocked, not missing. A coding tool is never started (starting Codex writes into its home), so it is checked as a file. The repository check is the runtime's only command that contacts a remote: `git ls-remote --heads https://github.com/<owner>/<repo>` with `GIT_TERMINAL_PROMPT=0`; a folder marketplace is checked for its catalog instead. Each item is `ok`, `blocked`, `missing` or `not checked`, and carries what it stops: `setup` (join cannot finish) or `sessions` (a hook would not work). Exit `0` nothing in the way; `1` something is blocked or missing; `2` refused; `3` the check failed. `join` runs it first with the setup scope and refuses with exit `2`, before anything is written, when an item that would stop setup is not ok; items that would only stop a session are printed and do not stop it. A coding tool the caller named with `--claude` or `--codex` is checked at that path, not by its name on PATH.
- **Proposals:** `propose <lesson file> [--repo] [--apply]` writes `proposals/<lesson id>.md` after the scrub check and the secret-shape scan pass on the exact text.

## 14. Trusted delivery checks

- **Policy** `.skilliton/delivery.json` (schema `skilliton.delivery/1`): unknown keys refused; `policyPaths` must include `.skilliton/delivery.json`; a commit without it that still has the earlier `.skillgate/delivery.json` is governed by that file in its earlier format (schema `skillgate.delivery/1`, `policyPaths` covering its own path), so a shared branch stays protected until the project's migration commit moves the policy; every commit that touches either policy file needs an approver's signature, whichever file governs the branch, and because each commit is compared only with its first parent, the combined result is checked too: every policy path that differs between the current tip and the pushed tip must hold exactly the content an approver-signed commit in the push gave it, so a merge cannot bring back an earlier policy; check names 1 to 64 characters, unique; `timeoutSeconds` default 600, at most 86400; `checks: []` is valid and runs nothing.
- **Protected branches:** the policy on the bare repository's default branch lists them; while that branch has no policy, it alone is protected. Each protected branch is checked with the policy on its own current tip. An invalid default-branch policy rejects every push.
- **The gate** (`delivery install --bare <repo.git> --approvers <file> [--runtime <bin/skilliton>] [--apply]` writes a marked `pre-receive` hook that reads the runtime path from Git config at push time and fails closed): rejects non-fast-forward updates and deletions; reads the policy from the current tip; requires every pushed commit that changes a policy path, compared with its first parent, to carry an SSH signature from the approvers file (other signature types are rejected); creating a protected branch needs a signed tip that contains a valid policy; a push that removes or breaks the policy is rejected; extracts the pushed tip with `git archive`, compares every file with the commit, runs each check with a minimal environment in its own process group, and rejects naming the failing check with the last 20 output lines.
- **`delivery check [--repo] [--ref] [--remote] [--approvers <file>]`:** the same evaluation of the local HEAD against the remote-tracking tip; without an approvers file a needed signature check reports NOT CHECKED and exits 1.
- **Hosted adapter:** `templates/github/skilliton-delivery.yml` and docs/DELIVERY.md; documented, not rehearsed on a hosted repository (O15).
- Local assistant guardrails and security evidence freshness are never presented as merge enforcement.

## 15. Codex adapter

- **Manifests:** Codex reads this repository's `.claude-plugin/marketplace.json` and each `.claude-plugin/plugin.json` (measured on 0.154.0-alpha.6.2), so no separate Codex manifests are shipped and there is one version per plugin.
- **Instructions and skills:** `AGENTS.md` receives the same harness block as `CLAUDE.md`; plugin skills appear as `workflow:<skill>` with their paths (measured).
- **Hooks:** Codex reports `plugin_hooks` as removed, so hooks shipped inside a plugin are not a delivery route for Codex; a team configures them in a Codex configuration layer, and each hook needs trust. Codex lifecycle hooks are unverified (O9).
- **Guardrails:** the hook treats input with a top-level `turn_id` or `model` key, or `PLUGIN_ROOT` equal to `CLAUDE_PLUGIN_ROOT`, as Codex (`SKILLITON_GUARDRAILS_CLIENT` overrides) and turns every ask into a deny with the reason, because Codex does not support ask from a hook.

## 16. The earlier names

Skilliton was named Skillgate before milestone M9. `runtime/lib/legacy-names.mjs` is the one module that spells the earlier technical names; `scripts/names.test.mjs` fails on any other use outside an allowlist that states a reason for each entry. Kept on purpose: the security catalog versions `skillgate-starter-1` and `skillgate-baseline-2` and the `SG-` control IDs (stored observations name them; DECISIONS.md O23), recorded evidence, dated records, and the prototype's exact bytes.

| State left under the earlier names | What the current runtime does |
|---|---|
| A project with `.skillgate/config.json` (layout 1 or 2) | refused by every command except `migrate`, `status`, `doctor` and the hooks; `migrate` moves it (section 10) |
| `SKILLGATE_*` environment variables | not read; the command line prints each with its `SKILLITON_*` replacement, and the session start lists them |
| A machine joined for a company (`~/.config/skillgate/joined/<company>.json`) | `join` refuses, naming the receipt and the undo to run with the release that wrote it |
| Signers trusted at `~/.config/skillgate/trust/<company>.allowed_signers` | not read; a missing trust file's refusal names it for `trust add` |
| Plugins installed as `<plugin>@skillgate` | `verify` names them as coming from the earlier marketplace name |
| `skillgate-release/*` and `skillgate-withdrawn/*` tags | not read; `verify` says how many exist and that releases are re-created under the current names |
| A `pre-receive` hook marked `# skillgate:delivery-hook` | `delivery install` leaves it untouched and names the steps to replace it and its `skillgate.approvers` and `skillgate.runtime` settings |
| A delivery policy at `.skillgate/delivery.json` on a shared branch | enforced by the gate until moved (section 14) |
| Guardrail settings in an unmigrated project's `.skillgate/config.json` | still honoured by the guardrails hook, which says where they came from |
| The rest of an unmigrated project's `.skillgate/config.json` | read by `status`, `doctor`, the session start and the stop reminder to report the project and remind about checkpoints; never written |
| A harness block with `skillgate:harness` markers | `harness`, `prepare` and the instructions refresh refuse to add a second block or remove it; `doctor` names the migration |
| `project-settings` on an unmigrated project | refused, so the migration never has two marketplace entries to choose between |
| `~/.config/skillgate/denylist` | not read; the scrub check reports the name scan as not run and gives the move command |
| Status line setup backups in `~/.claude/backups/skillgate/` | not read; `setup.mjs --undo` names them for a restore by hand |
| A security artifact starting `# skillgate-file-manifest/1` | still checked as a manifest, because observation records are immutable |
| The session journal and backups in `<git-dir>/skillgate/` and `<git-dir>/skillgate-backups/` | left in place and no longer read; migration 0003 says so |

