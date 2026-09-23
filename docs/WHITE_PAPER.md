# Skilliton: a shared way of working for a team's AI coding assistants

Kind: Living. Technical white paper, written 2026-09-22 against the repository at that date and brought up to date on 2026-09-23. Every figure is measured on that tree, or on the tree of the date it names, or says it is not; the section "What is measured and what is not" is the honest boundary.

## Abstract

An AI coding assistant does what its session tells it. Across a team, that means each developer's assistant follows whatever that developer remembered to say, and the team's habits (which records to keep, which checks to run before finishing, which commands never to run, what a review looks like, which security evidence to keep current) live in people's heads and in copied text files. Skilliton moves those habits into the assistant's runtime as four Claude Code plugins and one command. A company forks the repository, names it, adds its own skills beside the base, signs releases with SSH keys, and hands each developer one file. From then on, every session on a joined machine, in any repository, runs the company's hooks; a prepared repository carries the company's records and instruction block; and the shared repository's merge check refuses work that did not pass the company's checks, whatever the laptop did. This paper describes the design, the enforcement model, the trust chain, what has been measured, and what has not.

## 1. The problem

Three things go wrong when several people use AI coding assistants on one codebase.

**Habits do not transfer.** One developer has the assistant write a task record before touching code and a handoff before stopping; another does not. The second developer's session, resumed the next morning, starts from nothing. Rules written in a repository's instruction file help only when the assistant reads and follows them, and nothing enforces that.

**Some mistakes are one command away.** A force-push to the shared branch, a commit that skips the hooks, a credentials file added by pattern: each is a single shell command the assistant can run in a second and a person can miss.

**Improvements do not propagate.** When one person finds a better way to do reviews or writes a skill that works, it reaches the others by copying a folder. There is no versioning, no signing, and no way to know which machines run which version.

Underneath all three is a fourth: the assistant's context grows with every file it reads whole and every test run it pastes into the conversation, and a session that has grown large is slower, costlier and forgets more at compaction. Nothing in the default setup pushes back.

## 2. Design principles

1. **Enforced where the client allows, instructed where it does not, and labelled.** A behaviour that a hook performs on a client event is enforced; one the assistant is asked to do is instructed; one the shared repository decides is checked at merge. Every line of the instruction block a prepared project carries says which kind it is. Nothing is presented as enforced that is not.
2. **Nothing silent.** A refusal names what was refused and why; a skipped check says it was skipped; a missing input is named as missing. A command that writes previews without `--apply` and writes nothing.
3. **Records are files, one per entry.** Tasks, decisions and lessons are one file each with a collision-free name, so parallel contributors never edit the same file to add one.
4. **Trust is a signed tag, not a hosted service.** A release is a manifest that hashes every installable file; approval is an SSH-signed git tag; each machine holds the signers it trusts in a file that never travels through the repository.
5. **Zero dependencies.** No `package.json`, no build step, no network code of its own. The IT allow list of programs started and folders written is compared with the code by a test.
6. **Claims are measured or absent.** No token, time or cost saving is claimed unless the repository's meter produced it and a person cross-checked it against the client's usage screen. At the time of writing, none is claimed.

## 3. Architecture

### 3.1 Four plugins and one command

| Plugin | Hooks (enforced) | Skills (instructed) |
|---|---|---|
| `workflow` | Session start: the last handoff and a project state block. Stop: a checkpoint reminder when the tree changed and none was recorded, a maintenance reminder, once per commit, when a merge or 15 commits landed or a day of commits passed since the last one, or the handoff fell 15 commits behind, and a dispatch reminder when the session's list of tasks got no lane plan. Pre-compact and session end: a journal entry. Prompt submit: on a list of six or more tasks, the direction to run `/workflow:dispatch` before any code. | `task`, `review`, `handoff`, `maintain`, `security`, `dispatch`, `release` |
| `guardrails` | Every shell command: deny force-push to protected branches, skipped git hooks and secret-shaped files; ask before commands that discard uncommitted work; ask on a shell string that names git; deny `rm`, `rmdir`, `mv` and `git rm` aimed at what Skilliton keeps (the `.skilliton` folder, the records, the entry folders, `CLAUDE.md`, `AGENTS.md`); a notice naming the setting when a rule a project turned off is all that let a command through. Every file write: the lane write guard inside a dispatched lane, and the managed block guard, which refuses a write that would take the managed block out of `CLAUDE.md` or `AGENTS.md`. | `guardrails` (explains a block) |
| `context-hygiene` | Every file read: refuse a whole read of a non-image file over 50 KB. Session start: the cost checklist. | `context-hygiene` |
| `code-quality` | none | `split-a-file` |

The command, `skilliton`, ships inside the workflow plugin (`runtime/skilliton.mjs`, with `commands/` as thin parsers and `lib/` as engines) and is reachable from a checkout, from the plugin's `bin/`, and from a launcher `join` writes to `~/.local/bin`. It is what hooks, people and scripts run: `prepare`, `migrate`, `status`, `task`, `checkpoint`, `record`, `index`, `security`, `audit`, `gate`, `dispatch`, `release`, `verify`, `join`, `company`, `delivery`, `usage`.

### 3.2 A prepared repository

`prepare` reads a repository, adopts the records it already has (status, backlog, roadmap, decisions, lessons, handoff, maintenance steps) at their conventional paths, creates the missing ones marked "not yet assessed", writes `.skilliton/config.json` (layout version, record roles, dispatch settings drafted from the repository's own shape) and the security catalog, and appends a managed instruction block to `CLAUDE.md` and `AGENTS.md` without touching the text above it. It previews first; repeat runs change nothing; `remove` takes everything out and keeps every record. Layout changes arrive as numbered migrations with receipts and rollback.

### 3.3 The records

- **Task**: a request in the user's words, acceptance criteria, a branch, checkpoints (state, evidence, next), and a final state that keeps done-locally, merged, released, installed and verified separate.
- **Decision** and **lesson**: one file each under `docs/decisions/` and `docs/lessons/`, indexed into `DECISIONS.md` and `docs/LESSONS.md` by `index`. A lesson carries what broke, the mechanism, the fix, the rule, and what now enforces it, with "nothing yet" written when that is the truth.
- **Handoff**: the RESUME HERE block, rewritten by a checkpoint with `--handoff`, with earlier entries rotated into an archive.
- **Security register**: observations tied to file fingerprints under `.skilliton/security/records/`, immutable once written.

### 3.4 The enforcement model

A behaviour is one of three kinds.

**Enforced.** A hook of an installed plugin runs on a client event. Claude Code runs a plugin's `hooks/hooks.json` on session start, before and after tool use, on stop, before compaction and at session end, in the terminal, the VS Code extension and the desktop application alike. Once a plugin is enabled at the user scope, it runs in every session in every folder on that account; this was measured in a repository with no Skilliton files at all. Codex installs the plugins and shows the skills but runs no hooks shipped inside a plugin, so every enforced line is instructed there unless the team configures its own hooks. Cursor is documented, not run.

**Instructed.** A skill is a text file the assistant follows when invoked or when its description matches. `task` turns a request into a record before code changes; `review` writes a plain-English pre-commit review ending READY TO COMMIT, NEEDS ATTENTION or STOP and never commits; `handoff` and `maintain` keep the records; `security` keeps the register; `dispatch` splits six or more items into worktree lanes. A skill earns its place by an evaluation that tells a run with it from a run without it; of four cleanup skills measured, one shipped and three did not (`docs/not-shipped.md`).

**Checked at merge.** `delivery install` puts a check in a shared bare repository that runs the policy's checks on the combined result of every push to a protected branch, reads the policy from the branch rather than the push, and requires an approver's signature for a policy change. A GitHub workflow template follows the same rules and was run on a hosted repository with branch protection: a defective pull request was blocked and a direct push refused. This layer does not depend on any laptop's cooperation.

### 3.5 Dispatch into worktrees

`dispatch` turns a lane plan (`LANES.md`: a base commit, one heading per lane with a branch, a model and a context ceiling, and numbered items) into one git worktree per lane with a brief, commits each lane's own task record on its branch, and refuses rather than reusing a branch, a folder or a registered worktree. The lane write guard keeps a lane's writes inside its files. `dispatch merge` brings each lane's committed records back and names conflicts rather than overwriting them. A plan line shaped like an item whose ID is not `N<digits>` is named as a problem and refused, never dropped.

### 3.6 Session cost

Two hooks and one command act on context size. The read guard refuses a whole read of a non-image file over 50 KB with the reason and the alternatives. `gate` runs a check, keeps the full output in a log under `.git/skilliton/gate/` and prints the verdict from the exit status with the tree it ran on, so a test run reaches the conversation as a result rather than a transcript. The meter, `scripts/token-cost.mjs`, reconstructs usage per day and per scope from the client's local transcripts (requests, input, output, cache reads and writes, peak context, an estimated cost) with a fixture test and a reference check; `usage` groups it per merged batch and never prints a savings sentence.

### 3.7 The self-running audit

`audit` scans a range, the working tree or the refs of a push for secret shapes, `shell: true`, interpolated `exec`, and switched-off verification, mapped to catalog controls, with allow lists that carry a reason per line. It never prints a matched value. It reports in the stop hook and the pre-push hook, and it refuses in the merge gate, where the policy may turn it off only with an approver's signature.

## 4. The trust chain

1. A company forks the repository and runs `company init`, which names its marketplace and points prepared projects at the fork.
2. Each approver's SSH public key goes on one line of an `allowed_signers` file.
3. `release create` writes a manifest under `releases/` that hashes every installable file of every plugin and records the project layout and migrations; the manifest is committed.
4. `release sign` creates an SSH-signed tag `skilliton-release/<version>` over the manifest, with the key git is already configured to sign with. `release list` reads approval from the tag's signature against the signers.
5. `company join-file` writes a `skilliton.join/1` file (company, fork URL, signers text) outside any working tree; it is refused inside one, because whom a laptop trusts must never arrive through a pull.
6. A laptop runs `join --from <file> --apply`: it clones the fork, adds the marketplace, installs the plugins at user scope, records the signers and a receipt, and writes the launcher. `join` names every missing input at once and says what the machine already joined.
7. `verify` compares the installed files with the signed manifest and reports VERIFIED, TAMPERED (naming files), UNKNOWN VERSION, WITHDRAWN or NOT INSTALLED. A client's in-use marker inside the plugin folder is excluded from the hash by design.
8. A lesson in any prepared project can be proposed back to the fork with `propose`, scrubbed of names and secrets; a template change reaches projects as a receipted migration.

Device management (Jamf, Intune) drops the join file and runs steps 6 and 7 at login. The scripts that call them are designed, not built.

## 5. Quality of the repository itself

The repository is prepared with its own product and runs every check in CI on every push, each as its own step (`node scripts/checks.mjs --list` prints the current list); `scripts/checks.mjs` runs the same list locally from the CI file, so there is one list. Most checkers carry a `--self-test` that plants a defect and requires red, so a green run is evidence rather than a silent pass. A lint holds the runtime's shape: a 600-line ceiling with pinned exceptions that may only shrink, no unused import, no `console.log` in a runtime, every command module exporting `help` and `run`, no `package.json` outside fixtures. A dead-code check fails on any export nothing reaches and names the modules it could not follow. The IT allow list, the small-footprint rules (no network code, no administrator rights, nothing left running, no system paths), the name scrub, the dash rule and the backlog's relationship with its archive are each a test. The audit runs over the whole tree. A cold review by a reader with no session context is the gate before a release, and each of its items is shipped or deferred with a written reason.

## 6. What is measured and what is not

**Measured, with the evidence in the repository.** Every hook firing in a live Claude Code session in the VS Code extension (session start block, read guard refusal, stop reminder, skill list). Guardrail denials and asks over 549 checks and a live force-push denial. Fork, rename, a company plugin, a signed release verified from a fresh clone, install and update in a clean client configuration from a public and a private repository. The delivery gate rejecting a planted flaw against a local bare repository and blocking a defective pull request on a hosted repository with branch protection. One real two-lane dispatch, both lanes under their 120000-token ceiling by the meter's definition (107161 and 115485). Layout migrations with preview, receipt and rollback. The meter reproducing a known window. A comparison fixed before it ran: uncommitted work kept in 3 of 3 runs with Skilliton against 0 of 3 without, and about 20,000 to 30,000 more input tokens per session with Skilliton in the task that counted them (evidence/comparison/2026-09-22/SUMMARY.md). A real Codex 0.156.0 session in a prepared repository, in which the instructions and skills reached the model and none of Skilliton's hooks ran (evidence/live/2026-09-22-codex-session.md). The commands, preparation and every hook on a GitHub-hosted Windows runner (evidence/live/windows/2026-09-23-hosted-runner-port.md).

**Not measured.** A real team using it: one repository on one machine is the live user, and no new builder has been onboarded from the documents alone. Whether a Codex plugin hook runs once a person trusts it. A Claude Code session on Windows, a clean macOS account, a Cursor session. The device-management scripts. A lane launched through the brief's own `--agent` line. Any usage or cost saving.

## 7. Limits stated plainly

- Guardrails read the commands the assistant runs through its shell tool. A person's own terminal, another tool, the inside of a script, a git alias, and a string handed to `bash -c` are outside its reading; the last of these asks.
- Security evidence is a register of observations that go stale when their sources change. It is not certification, attestation or a compliance pass.
- Local guardrails are not merge enforcement. Only the delivery check on the shared repository is.
- A skill is instructions. The eight keyboard checks in `docs/OWNER_WALKTHROUGH.md` are how a team learns whether its assistant follows them.

## 8. Facts for a technical reader

| Question | Answer |
|---|---|
| Language | JavaScript (Node.js 22 or later, the version CI runs; ES modules) for commands and engines; Bash for the hooks that must start in under a second |
| Dependencies | None; no build step; no network code of its own |
| Size | About 40,000 lines of runtime, hooks and tests; every check a CI step of its own (`node scripts/checks.mjs --list`) |
| Clients | Claude Code, measured (terminal and VS Code extension). Codex: installs, sees skills, runs no plugin hooks. Cursor: documented only |
| Platforms | macOS and Linux exercised; Windows runs on a GitHub-hosted runner and is not supported until backlog item B79 is fixed |
| Licence | MIT |
| Where it writes | `docs/IT-ALLOWLIST.md`, held equal to the code by a test |
