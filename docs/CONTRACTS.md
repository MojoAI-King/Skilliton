# Contracts

Kind: Living. PLAN.md is the product authority. This file holds the shared names, formats, interfaces and exit meanings every component uses. Change a shared format here first, then every reader and its checks together. Section 9 onward is the integration contract v1 that the M1-M4 implementation lanes build against; a row stays "contract" until its code and tests land on `main`, and PLAN.md's milestone table records what has been proved.

## 1. Packs and plugins

| Pack | Plugin | Ships | Invocation |
|---|---|---|---|
| `base` | `context-hygiene` | skill `context-hygiene`; SessionStart hook `session-start-checklist.sh`; status line `statusline-quota.sh` (applied by `scripts/setup.mjs`) | model-invoked |
| `base` | `workflow` | skills `dispatch`, `maintain`, `handoff`, `review`; SessionStart hook `session-start-handoff.sh`; the Skillgate runtime (`runtime/`, launched by `bin/skillgate`); the harness template (`templates/harness.md`) | `/workflow:<skill>`, model-invoked from the description, or `skillgate <command>` |
| `base` | `guardrails` | PreToolUse hook `guard-bash.sh` on the Bash tool; SessionStart hook `session-start-guardrails.sh` (one status line: on, off, or a problem); skill `guardrails` explaining what is blocked and why | hook runs on every Bash call; skill model-invoked |
| `<company>` (in a fork) | anything | the company's own skills | `/<plugin>:<skill>` |

Rules:
- Base plugins live under `packs/base/plugins/`. **A fork treats `packs/base/` as read-only** and adds its own packs beside it (`packs/<company>/plugins/<plugin>/`), with one stated exception: `packs/base/plugins/workflow/templates/harness.md` is the company's instruction template and a fork may edit it (expect to reconcile that one file when taking upstream changes). That reduces conflicts when reviewing upstream proposals; it does not remove the need for company review.
- Plugin skills are namespaced by Claude Code (`/plugin:skill`), which separates plugin invocation names from personal skill names. Verify discovery and invocation on each supported client.
- Every plugin skill's `SKILL.md` frontmatter carries `name` (required for plugin skills) and `description`.
- Every plugin's `plugin.json` carries `version`. Installed copies only receive an update when that version changes, so **every change to a plugin bumps its version**.

## 2. Project config: `.skillgate/config.json`

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

- `prepare.version` is the project **layout** version: `1` was the standalone prototype (copied runtime under `.skillgate/bin/`, `skillgate:project` markers), `2` is the integrated layout. A version the runtime does not know is refused, never guessed.
- `prepare.artifacts`: each record role maps to one Markdown file. Without an entry, the first existing conventional path is adopted (`config.mjs` `ROLE_CANDIDATES`), else the first candidate is the default. Two roles on one file, a path through a symbolic or hard link, a path under `.skillgate/`, or an instruction file (`AGENTS.md`, `CLAUDE.md`, `README.md`, entry-folder READMEs) is refused.
- `handoff.file` stays compatible: it names the handoff record when `prepare.artifacts.handoff` is absent, and disagreement between the two is refused.
- `prepare.requires` maps plugin names to the **minimum** package version the project needs. Installed runtime version, required version, and applied layout/migrations are reported separately (never merged into one "up to date").
- `prepare.integrationBranches`: branches where the shared handoff, status, backlog and indexes are written. Everywhere else, work is recorded in its task record.
- Environment overrides: `SKILLGATE_TEAM_LESSONS` (maintain), `SKILLGATE_GUARDRAILS=off` (turns the guardrails hook into a visible no-op for one session; it prints that it is off).

## 3. Handoff file: `docs/HANDOFF.md`

- Starts with `# Handoff`, then `Kind: Living.`, then a section headed exactly `## RESUME HERE`.
- `RESUME HERE` starts with a `Written: <date and time>` line, then four labelled items: **State**, **Next**, **Blocked**, **Watch out**.
- Older blocks go under `## Earlier` as `### <Written date>` (newest first, at most five), older still to `docs/HANDOFF_ARCHIVE.md` (`Kind: Reference.`).
- Writers: `/workflow:handoff` (quick, end of a stretch of work) and `/workflow:maintain` (full reconciliation), **on an integration branch only**. On any other branch they write the task record's `## Handoff` section instead (section 11). Reader: `session-start-handoff.sh`, which prints the `RESUME HERE` section only, bounded by `handoff.maxBytes`, and prints a one-line notice when the file or section is missing.

## 4. Harness block in `CLAUDE.md` and `AGENTS.md`

The instructions that tell the model when to use which skill. Managed by `skillgate harness`, rendered from `packs/base/plugins/workflow/templates/harness.md`. `skillgate prepare` and `skillgate migrate` obtain block text only from the same renderer (`core.mjs` `planHarnessFile`); nothing else writes managed instruction markers.

```
<!-- skillgate:harness:start v1 -->
... rendered template ...
<!-- skillgate:harness:end -->
```

- Exactly one block per file. Applying replaces the text between the markers and never touches anything outside them.
- The template may name project values as `{{key}}`; the keys are `config.mjs` `templateVars()` (`status`, `backlog`, `backlogArchive`, `roadmap`, `decisions`, `lessons`, `handoff`, `handoffArchive`, `maintain`, `tasksDir`, `decisionsDir`, `lessonsDir`, `integrationBranches`). An unknown key is refused. Doctor compares a file's block with the template rendered for that project.
- The block labels every behavior as **enforced** (the installed, enabled hook handles its supported client event) or **instructed** (the model is asked to do it). Showing an existing handoff does not ensure one was written. Nothing instructed is described as guaranteed.
- `CLAUDE.md` and `AGENTS.md` receive the same block. Hook execution and skill invocation still need client-specific adapters and proof; matching Markdown does not establish Codex parity.
- Template changes reach a project when `harness --apply` or a project migration runs, never silently on plugin update.

## 5. Team settings: `templates/project-settings.json`

The file a company commits as `.claude/settings.json` in its product repos, to declare the company marketplace, automatic plugin updates, and enabled base plugins for Claude Code. Keys (from the official settings docs; the fresh-user trust and install flow is part of the M3 rehearsal): `extraKnownMarketplaces.<name>.source`, `extraKnownMarketplaces.<name>.autoUpdate`, `enabledPlugins["<plugin>@<marketplace>"]`.

## 6. The command line: `skillgate`

The runtime is `packs/base/plugins/workflow/runtime/skillgate.mjs`. `scripts/skillgate.mjs` runs it from a company skills repository checkout; `bin/skillgate` runs it from an installed plugin (Claude Code documents that a plugin's `bin/` is on the Bash tool's PATH while the plugin is enabled; the live check is recorded in DECISIONS.md). Runtime code never imports anything outside the plugin folder.

| Command | Does | Writes |
|---|---|---|
| `doctor [--dir <project>]` | inspects installation/configuration records, declared auto-update, managed instructions, project config, layout and required versions; it does not prove a hook executed | nothing |
| `harness [--apply] [--undo] [--file CLAUDE.md\|AGENTS.md] [--dir <project>] [--template <file>]` | shows, applies, or removes the harness block | the named file, after a backup |
| `project-settings [--apply] [--dir <project>] [--marketplace-repo owner/repo] [--marketplace-name <name>] [--template <file>]` | shows or writes `.claude/settings.json` from the template, merging with an existing file | `.claude/settings.json`, after a backup |
| `new-skill <plugin> <skill> [--pack <pack>] [--repo <dir>] [--description <text>]` | scaffolds `packs/<pack>/plugins/<plugin>/skills/<skill>/SKILL.md` with frontmatter and bumps the plugin version | the new skill, `plugin.json` |
| `import <skill-dir> --into <plugin> [--pack <pack>] [--repo <dir>] [--name <skill>]` | scans the source (scrub check, secret shapes, home paths; refuses when no denylist is configured), then copies it into a company plugin | the copied skill, `plugin.json` |
| `prepare`, `migrate`, `remove`, `status`, `task`, `checkpoint`, `record`, `index`, `security`, `hook`, `propose`, `release`, `verify`, `trust`, `delivery` | section 9 onward | per command |

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
| Project security observations | `.skillgate/security/` in each application repository | what was assessed in that project, with fingerprints, freshness and gaps |
| Release and rehearsal evidence | `evidence/releases/<version>/`, `evidence/rehearsals/<date>-<name>/` in the skills repository | which checks ran against which exact candidate, with omissions stated |

---

## 9. Integration contract v1: runtime modules

Agreed 2026-09-16 by the integrating session (base commit named in each lane brief). Lanes implement against these names; a change to any of them goes back through the integrating session.

- **Command module:** `runtime/commands/<name>.mjs` exports `help` (string, printed for `--help`) and `async run(argv)` returning an exit code. Parse options with `core.mjs` `parseArgs(argv, { flags, options }, "<name>")`. Throw `Refused` (from `core.mjs`) for invalid input or a refusal before writing (exit 2); let other errors propagate (exit 3). A subcommand (`task start`) is the first plain argument.
- **Engines:** reusable logic lives in `runtime/lib/<area>.mjs` so commands, hooks and tests share it: `prepare.mjs`, `migrations.mjs`, `records.mjs`, `tasks.mjs`, `journal.mjs`, `lifecycle.mjs`, `security.mjs`, `collectors.mjs`, `release.mjs`, `treehash.mjs`, `verify.mjs`, `trust.mjs`, `delivery.mjs`.
- **`--json`:** where a command offers it, stdout carries exactly one JSON object and nothing else: `{ "schema": "skillgate.result/1", "command": "<name>", "result": "complete" | "attention" | "invalid" | "operation-failed", "summary": "<one sentence>", "details": { ... } }`. The exit code matches `result`.
- **Cross-lane functions** (the only imports one lane's code makes into another's; each must exist with these shapes at merge):
  - `migrations.mjs`: `migrationState(project) -> { layoutVersion, target, pending: [{ id, from, to, summary }], applied: [receiptId] }`.
  - `security.mjs`: `securitySummary(root) -> { available: true, catalogVersion, total, applicable, current, missing, stale, expired, invalid, gaps, needsHuman, undecided }` or `{ available: false, reason }`; never throws for missing evidence.
  - `tasks.mjs`: `currentTask(project, branch) -> { task | null, ambiguous: [ids] }`; `readTask(file) -> { id, title, state, branch, owner, updated, checkpoints: n, handoff: { state, next, blocked, watchOut } | null }`.
  - `journal.mjs`: `appendEvent(root, event)`, `lastEvents(root, n)`; events are JSON lines `{ "at": ISO, "event": "session-start" | "session-end" | "pre-compact" | "stop" | "checkpoint" | "stop-reminded", "session": id | null, "branch", "head", "dirty": n, "fingerprint": sha256 }`.
- A lane whose command calls another lane's function imports it dynamically and reports "not available in this build" when the module or export is missing, so each lane is testable on its own base. The integrating session replaces nothing silently at merge: it runs the combined suite.

## 10. Prepared project layout 2

| Path | Owner | Notes |
|---|---|---|
| `.skillgate/config.json` | project (human-editable) | section 2 |
| record files from `prepare.artifacts` | project | adopted when present; created with an explicit "not yet assessed" state when missing; never overwritten |
| `docs/tasks/`, `docs/decisions/`, `docs/lessons/` (from `prepare.directories`) | project | one file per entry; each folder gets a README explaining the entry format |
| harness block in `CLAUDE.md` and `AGENTS.md` | Skillgate (section 4) | the only managed instruction content |
| `.skillgate/security/catalog.json`, `applicability.json`, `records/<uuid>.json`, `REPORT.md` | project (catalog adopted from the package; records immutable; report generated with a marker) | section 12 |
| `.skillgate/delivery.json` | project policy (policy path) | section 14 |
| `.skillgate/migrations/<id>.json` | Skillgate receipt, committed | one per applied migration |
| `.skillgate/private-evidence/`, `.skillgate/prepare.lock` | local, ignored | added to `.gitignore` by prepare |
| `<git-dir>/skillgate-backups/<id>/` | local, never tracked | backups of every file a prepare, migrate or remove changed |
| `<git-dir>/skillgate/journal.jsonl` | local, per clone and per worktree | section 11 |

There is **no copied runtime** in layout 2: the project never stores a path to a toolkit clone, and moving or deleting a clone cannot break it. Commands run from the installed plugin (`skillgate` on the Bash tool's PATH in Claude Code) or from a company skills repository checkout.

- **`prepare [--dir <repo root>] [--apply | --check] [--json]`:** the target must be a Git repository root. Preview by default; `--apply` writes transactionally (lock, recheck each destination immediately before replacing it, git-private backups, rollback on a caught failure that preserves edits made meanwhile); `--check` reads only and exits `1` when setup is incomplete. Repeat apply on a prepared project changes nothing. A layout-1 project is refused with the migrate command to run.
- **`migrate [--dir] [--apply] [--rollback <id>] [--json]`:** ordered migrations with ids `NNNN-slug`. Each previews its file changes, checks preconditions (a managed block edited by hand, a copied runtime whose bytes match no known release, or a destination changed since preview is refused with the reconciliation step), backs up, writes, and records a receipt `{ "schema": "skillgate.migration-receipt/1", "id", "from", "to", "appliedAt", "runtime": "<workflow version>", "files": [{ "path", "action": "create" | "update" | "delete", "beforeSha256", "afterSha256" }], "backup": "<backup id>" }`. `--rollback <id>` restores the backup only when every file still has its `afterSha256`, then removes the receipt; otherwise it refuses and lists the files that changed since. Package rollback never reverses a project migration by itself.
- **Migration `0002-integrated-layout`** (layout 1 to 2): remove `.skillgate/bin/security-evidence.mjs` only when its sha256 matches the prototype runtime released at `23aae41`; remove `skillgate:project` blocks from `CLAUDE.md`, `AGENTS.md` and the maintain record only when their content equals the prototype's rendering; add the harness blocks; set `prepare.version` 2 and `prepare.requires.workflow`.
- **`remove [--dir] [--apply] [--config]`:** removes the harness blocks, the generated security report, and (with `--config`) `.skillgate/config.json`; keeps every record, entry, observation, receipt and the Git history, and says so.

## 11. Records, tasks, checkpoints and lifecycle

- **Entry ids:** `YYYY-MM-DD-<slug>-<hex4>`: the local date, a slug of at most 40 lowercase letters, digits and hyphens from the title, and four random hex digits. File: `<directory>/<id>.md`. No sequential numbers; two contributors on two branches cannot collide on a file.
- **Task record** (`docs/tasks/<id>.md`):

  ```
  # Task: <title>

  Kind: Living. Task record.

  - **ID:** <id>
  - **State:** planned | in-progress | blocked | review | done-local | merged | released | verified | abandoned
  - **Branch:** <branch>
  - **Owner:** <label, not an authenticated identity>
  - **Updated:** <ISO date and time>

  ## Request
  ## Acceptance criteria
  - [ ] <criterion>
  ## Decisions
  ## Checkpoints
  ### <ISO date and time>
  - **State:** ...  - **Evidence:** ...  - **Next:** ...  - **Git:** <branch> @ <short head>, <n> uncommitted
  ## Handoff
  - **State:** ...
  - **Next:** ...
  - **Blocked:** ...
  - **Watch out:** ...
  ```

  `task start "<title>" [--criteria "<text>" ...] [--branch <name>] [--owner <label>] [--apply]`, `task list [--all]`, `task show [<id>]`, `task close <id> --state <state> [--apply]`. `checkpoint [--task <id>] --state "<text>" [--evidence "<text>"] --next "<text>" [--apply]` appends one checkpoint (mechanical Git state included) and a `checkpoint` journal event. The current task is the one whose Branch is the checked-out branch and whose State is not `done-local`, `merged`, `released`, `verified` or `abandoned`; more than one is reported as ambiguous, never picked.
- **Decision and lesson entries:** `record decision "<title>" [--apply]` writes `# <title>`, `Kind: Living. Decision entry.`, bullets **ID**, **Status** (`proposed` on a non-integration branch, else `accepted`), **Date**, then `## Decision`, `## Why`, `## Alternatives rejected`, `## Risk`, `## Reversibility`, `## Evidence`, each "not yet written". `record lesson` uses `## What broke`, `## The mechanism`, `## The fix`, `## The rule`, `## What now enforces it`.
- **Indexes:** `index [--apply]` regenerates, deterministically and sorted by id, a managed section in the decisions record (`<!-- skillgate:index:decisions:start -->` ... `end`), the lessons record (`lessons`), and the status record (`tasks`: open tasks only). Text outside the markers is never changed. After a merge, rerunning `index` resolves any index conflict.
- **Journal:** `<git-dir>/skillgate/journal.jsonl`, append-only, local. An interrupted session is a `session-start` with no later `session-end` for the same session id.
- **Hooks** (workflow plugin `hooks.json`, each command `skillgate hook <event>` reading the hook JSON on stdin; a hook that fails prints a one-line notice and never blocks the session):
  - `SessionStart`: after the handoff hook, prints a bounded "Project state" block: layout and pending migrations, installed versus required versions, the current task (state, last checkpoint, its handoff), an interrupted previous session, a handoff older than the latest commit or uncommitted change, and the security summary counts. Missing pieces are named, never omitted.
  - `Stop`: when `checkpoints.stopReminder` is on, the working tree fingerprint changed since the last checkpoint, at least `checkpoints.minMinutes` passed, and no reminder was already given for this fingerprint, returns `{"decision": "block", "reason": "<run skillgate checkpoint ... or task start ...>"}` once; otherwise allows. It also honours `stop_hook_active` when the client sends it.
  - `PreCompact` and `SessionEnd`: journal events with the mechanical Git state.

## 12. Project security evidence

- Engine: `runtime/lib/security.mjs`, adapted in place from the prototype `scripts/security-evidence.mjs` (its record schema 1 and immutability rules are kept). Command: `security status|record|applicability|collect|findings`, with the section 6 exit codes (status: `0` every applicable control has a current observed record; `1` anything missing, stale, expired, a gap, needs-human, or undecided applicability; `2` invalid catalog, records or input; `3` failure).
- **Applicability:** `.skillgate/security/applicability.json` `{ "schemaVersion": 1, "decisions": [{ "controlId", "applies": true | false, "rationale", "decidedBy": "<label>", "decidedAt": ISO }] }`; the newest decision per control wins; a control with no decision is `undecided` and counts as needs-human. `applies: false` removes a control from the denominator and is listed with its rationale.
- **Freshness:** a record is `stale` when a fingerprinted file changed or disappeared, the control definition or catalog version changed, or it is older than `maxAgeDays` (control, else `security.maxAgeDays`); regenerating a report never creates or re-dates a record.
- **Collectors:** `security collect <tests | secrets | delivery-policy> [--apply]` gather real evidence, store artifacts under `.skillgate/private-evidence/`, and record an observation with the collector name, version and tool versions in its note. A collector that cannot run records nothing and says why.
- **Findings:** `security findings [--apply]` writes one row per open finding, keyed `SEC-<controlId>`, into a managed section of the backlog record (`<!-- skillgate:security-findings:start -->` ... `end`). Rerunning never duplicates a row; a resolved finding leaves the section, and its history stays in the observation records.
- **Catalogs:** shipped under `packs/base/plugins/workflow/catalogs/<catalogVersion>.json`; prepare copies the current one into a project; a newer catalog reaches a project only through a migration that previews which observations become stale. Mappings are `related` references to versioned public frameworks written as original summaries, never framework text.

## 13. Releases, verification and trust

- **Manifest** `releases/<version>.json` in the company skills repository: `{ "schema": "skillgate.release/1", "release": "<x.y.z>", "sourceCommit": "<sha>", "createdAt": ISO, "marketplace": "<name>", "components": [{ "kind": "plugin", "name", "version", "path", "treeSha256", "files": [{ "path", "sha256", "executable": bool }] }], "projectLayout": 2, "migrations": ["<id>"], "clients": { "claude-code": { ... }, "codex": { ... } }, "evidence": [{ "kind", "path", "sha256" }] }`. `treeSha256` is the sha256 of the lines `<sha256>  <path>\n` for every regular file in the plugin folder, sorted by path, excluding `.DS_Store`; symbolic links are refused.
- **Approval** is an annotated, signed tag `skillgate-release/<version>` on the commit holding the manifest, whose message contains `manifest-sha256: <hex>`. **Withdrawal** is a signed tag `skillgate-withdrawn/<version>` with `reason: <text>`. `release create --version <v> [--apply]` writes the manifest; `release sign <v>` runs `git tag -s` with the maintainer's own signing key; `release list` shows approved, unapproved and withdrawn versions.
- **Trust:** `trust add --company <name> --signers <allowed_signers file>` copies an SSH `allowed_signers` file to `~/.config/skillgate/trust/<name>.allowed_signers`, outside every repository; `trust show`, `trust remove`. Verification uses `git verify-tag` with `gpg.ssh.allowedSignersFile` set to that file. A tag signed any other way is reported as not verifiable, never as approved.
- **`verify [--client claude-code | codex] [--config-dir <dir>] [--source <skills repo path or URL>] [--company <name>] [--json]`:** for each installed plugin from the company marketplace: `VERIFIED` (version in an approved, unwithdrawn release and every file matches), `TAMPERED` (same version, different bytes; files named), `UNKNOWN VERSION` (no approved release has it), `WITHDRAWN`. Exit `0` only when every plugin is VERIFIED; `1` for any other state; `2` when trust is not configured, a signature does not verify, or a manifest is invalid; `3` on failure. Installed locations are read from the client's own records, labelled when the format is undocumented.

## 14. Trusted delivery checks

- **Policy** `.skillgate/delivery.json`: `{ "schema": "skillgate.delivery/1", "protectedBranches": ["main"], "checks": [{ "name", "command": ["argv", "..."], "timeoutSeconds": 600 }], "policyPaths": [".skillgate/delivery.json", ".github/workflows/", ".github/CODEOWNERS", "CODEOWNERS"] }`. Commands are argument arrays, never shell strings.
- **Local trusted boundary:** `delivery install --bare <repo.git> --approvers <allowed_signers> [--runtime <path>]` writes a `pre-receive` hook into a shared bare repository. For each update to a protected branch it rejects non-fast-forward updates; reads the policy **from the current protected tip**, never from the pushed commits; requires every pushed commit that touches a policy path to carry a signature from the approvers file; checks out the pushed tip (the combined result) into a temporary folder; runs every check; and rejects with the failing check's name and the last lines of its output. `delivery check` runs the same evaluation by hand.
- **Hosted adapter:** `templates/github/skillgate-delivery.yml` runs the same checks on `pull_request` and `merge_group`; branch protection must require it, require branches to be up to date (or a merge queue), and require code-owner review for policy paths. Until a hosted rehearsal runs, the hosted adapter is documented, not proved.
- Local assistant guardrails and security evidence freshness are never presented as merge enforcement.

## 15. Codex adapter

- The repository root also carries `.agents/plugins/marketplace.json` (`{ "name", "plugins": [{ "name", "source": { "source": "local", "path": "./packs/base/plugins/<name>" } }] }`), and each plugin carries `.codex-plugin/plugin.json` with the same `name` and `version` as its `.claude-plugin/plugin.json` and `"skills": "./skills/"`. `scripts/packs.test.mjs` checks that the two manifests agree.
- `AGENTS.md` receives the same harness block as `CLAUDE.md`. Which lifecycle hooks and runtime paths Codex actually supports is recorded from the Codex rehearsal, not assumed from Claude Code.
