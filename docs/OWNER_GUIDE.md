# Skilliton, explained for its owner

Kind: Living. Written 2026-09-21 at the end of the build and brought up to date on 2026-09-22, for the person who owns this repository and has to explain it to others. The private page with the same content and the scorecard beside it is kept outside the repository; this file is the source that travels with the code. Every figure here was measured on the tree at the commit that added this file unless it says otherwise.

## The tech-owner questions, answered first

| Question | Answer |
|---|---|
| Language | JavaScript (Node.js, ES modules) and Bash. The runtime and every command are Node; the hooks that must start in under a second are Bash. |
| Runtime floor | Node.js 22 or later, and git. Every check runs on Node 22 in CI and on 25 locally (docs/COVERAGE.md). |
| Dependencies | Zero. No `package.json`, no `node_modules`, no build step, and no network code of its own. |
| Size | About 40,000 lines of runtime, hooks and tests; 58 check steps run in CI on every commit. |
| Shape | Four Claude Code plugins (workflow, guardrails, context-hygiene, code-quality) and one command, `skilliton`, which ships inside the workflow plugin. |
| Clients | Claude Code, measured. Codex installs the plugins and sees the skills but runs no plugin hooks, so every enforced behaviour is instructed there. Cursor is documented only, never run (docs/CLIENTS.md). |
| Platforms | macOS and Linux exercised. Windows has a written first run (docs/WINDOWS.md) and has not been tried. |
| Licence | MIT, public on GitHub. |
| Release trust | SSH-signed git tags checked against a signers file each machine holds; `skilliton verify` compares installed files with the signed manifest. |
| Data it sends anywhere | None. One git command talks to a remote, in `preflight`. Where it writes on a machine is listed file by file in docs/IT-ALLOWLIST.md, and CI fails when the code and that list disagree. |

## What it is

Skilliton is a forkable development autopilot for teams using AI coding tools. A company decides once how it builds software, and every developer's assistant then works that way in every repository: the records it keeps, the checks it runs before it finishes, the commands it may not run, the reviews it gives before a commit, and the security evidence it keeps current. It does that through the four plugins the assistant loads and the one command that people and scripts run.

## The flow, end to end

Two roles, and the first question is which one you are.

- **You are the company.** Fork it, name it, add your skills, sign releases, hand out one file. Your developers join your fork, not this repository.
- **You just want to use it as-is.** Clone this repository, join with its owner's join file; every repository you open is prepared at its first session start. Same commands, no fork.

### The company path

1. **Fork it to a folder on your Desktop.** Fork the repository on GitHub into your organisation and clone it. Keep `packs/base/` as it is; that is upstream's work, and merging upstream later is how you receive improvements.
2. **Make it yours.** `node scripts/skilliton.mjs company init --name <company> --marketplace-repo <org>/<fork> --apply` gives the fork its own marketplace name and points every prepared project at your repository instead of upstream's.
3. **Talk to it with Claude Code, or any IDE.** Open the folder in Claude Code (terminal or VS Code) or Codex. The repository is itself a prepared project: the session opens with its handoff and project state, the guardrails are on, and the checks are one command, `skilliton gate`.
4. **Add your skills.** They live in your own pack beside the base, so an upstream merge never touches them: `new-plugin <plugin> --pack <company> --apply`, then `new-skill <plugin> <skill> --pack <company> --description "<when to use it>" --apply`, or `import <folder> --into <plugin> --apply` for one you already have; both preview without `--apply`. Expect to prove a skill before you trust it: of four cleanup skills measured with and without in wave 8, one earned its place and three did not and were not shipped (docs/not-shipped.md).
5. **Sign a release.** Each approver's SSH public key goes on one line of an `allowed_signers` file. `release create --version <x.y.z> --apply`, commit the manifest, `release sign <x.y.z> --apply`, push the tag. Nothing here uses a key git was not already configured to sign with.
6. **Make the one file developers join with.** `company join-file --name <company> --signers <allowed_signers> --out <path outside every repository> --apply`. It is refused inside a Git working tree on purpose: whom a laptop trusts must never arrive through a pull.
7. **Put it on every company laptop.** Device management drops the join file and runs two commands at first login: `git clone <fork> ~/company-skills` and `node ~/company-skills/scripts/skilliton.mjs join --from <file> --apply`. A detection script runs `skilliton verify` and reports VERIFIED, TAMPERED or UNKNOWN VERSION. Offboarding is `join --undo`. Then, once per repository a developer works in, `skilliton prepare --dir <repo> --apply`. A laptop joins once; a repository is prepared once.
8. **Improve it over time.** A project records a lesson; `skilliton propose` copies it, scrubbed, to your fork; you change the skill and prove it with a test; you sign a release; laptops verify it.

### What "put it on every laptop" honestly means

Three layers, weakest to strongest. Installed on the laptop (device management ran join): the assistant on that machine follows the company's way, though a local administrator can still edit managed files. Verified on the laptop (`verify` in a detection script): the console knows which machines run an approved release. Enforced at merge (the delivery gate on the shared repository): work that did not pass the company's checks cannot land, whatever the laptop had. The third layer does not depend on anyone's cooperation.

**Built and tested:** the join file, `join --from`, `verify`, `join --undo`, the delivery gate against a local bare repository and, on 2026-09-21, against a throwaway GitHub repository with branch protection (a defective pull request blocked, a direct push refused), and install, update and verify from a private GitHub repository. **Designed, not built:** the Jamf and Intune scripts that call them, the managed-settings drop-in that forces the plugins on, and the pilot-ring versus broad-ring release model (docs/PHASE-3.md, M12).

## What runs on a laptop, and when

Once a person has joined, these run in every Claude Code session on that user account, in any folder, prepared or not (measured 2026-09-21 in a repository with no Skilliton files):

| When | What | Behaviour |
|---|---|---|
| Session start | Handoff and project state | Shows the last handoff (labelled as a record, not an instruction), the current task, pending migrations, stale records. On a joined machine, prepares a repository that is not prepared and says what it wrote (an opt-out file keeps a repository out). |
| Session start | Guardrails status line | Names what is blocked and any rule a project's config turned off; a command that only a turned-off rule let through gets a notice naming the setting. |
| Before every shell command | Guardrails | Denies force-push in every direct spelling tried, and `rm`, `mv` or `git rm` aimed at Skilliton's own files (`.skilliton`, the records, `CLAUDE.md`, `AGENTS.md`); asks on malformed input, on BASH_ENV, and on a string handed to a shell, `eval` or `xargs` that names git. |
| Before every file read | Read guard | Refuses a whole-file read of a non-image file over 50 KB and says how to read it instead. |
| Before every write | Lane write guard | In a dispatched lane, keeps the assistant's writes inside that lane's files. |
| Before every write | Managed block guard | Refuses a write that would take the managed block out of `CLAUDE.md` or `AGENTS.md`. |
| Every prompt | Dispatch direction | On a list of six or more tasks, tells the assistant to run `/workflow:dispatch` before any code. |
| On stop, compaction, end | Workflow events | Asks for a checkpoint when there are unrecorded changes, for maintenance after a merge, 15 commits, a day of commits, or when the handoff is 15 commits behind, and once more for dispatch when a list got no lane plan; records the session so an interrupted one is named next time. |

Not covered, and said so: commands a person types in their own terminal, other tools, the inside of scripts and git aliases.

## Proved, and not

The report card (docs/REPORT_CARD.md) has 123 acceptance items across ten areas; the ticked count is on its first bar. Everything still open needs something only the owner can supply (docs/OWNER_WALKTHROUGH.md).

**Measured:** fork, rename, company plugin, signed release, install and verify on Claude Code and Codex; update, downgrade and removal in a clean Claude Code configuration; every guardrail deny and ask path; the merge gate rejecting a planted flaw and accepting a clean push against a local bare repository; layout migrations with preview, receipt and rollback; the meter reproducing a known window; 58 CI check steps per commit.

**Not yet:** a real team using it (one two-lane dispatch has run for real, on 2026-09-21, both lanes under their context ceiling; no new builder onboarded from the documents alone); Windows, a clean macOS account, a Codex session in a prepared project; the enrollment scripts; Cursor beyond its documentation; and any saving, which the repository forbids claiming unless the meter produced it and the owner cross-checked it against the Usage screen (PLAN.md sections 6 and 8).

## The questions a meeting will ask

- **How do I get this on my team's machines?** The company path above. Say what is not built: the device-management wrapper scripts.
- **How do people get updates?** You sign a new release; Claude Code updates a plugin when its version in the marketplace changes; each machine's `verify` says whether what it has is approved; a developer's clone moves only between signed releases.
- **What if a laptop's copy is changed?** `verify` reports TAMPERED and names the files. The merge gate is what stops the result from landing.
- **Does it read or send our code anywhere?** It reads what the assistant reads, locally, and has no network code. docs/IT-ALLOWLIST.md lists every write.
- **What does it cost to run?** Nothing to license and no services. Do not quote a token or cost figure that the meter did not produce and the owner did not cross-check.
- **Other tools than Claude Code?** Codex: installs, sees the skills, runs no plugin hooks. Cursor: documented, not run. Anything else: no.
- **Who maintains the base?** Upstream is this repository; a fork keeps `packs/base/` untouched and merges upstream when it wants the improvements.

## Said plainly: what the skills do not do

Corrections to the ways this is easy to describe wrongly, kept here because each was said aloud once on 2026-09-22 and had to be walked back.

- `task` does not rewrite or improve a person's prompt. It turns the request into a record with acceptance criteria, in the person's own words, so "done" is defined and the work is recoverable. Nothing in Skilliton edits what the person asked.
- Maintenance is half automatic since workflow 0.19.0: `skilliton maintain --apply` does the mechanical part (indexes, security findings, the journal event), and the stop hook asks for it and the judgment part, once per commit, when a merge landed or a day of commits passed since the last one. The judgment part (decisions and lessons from the conversation, the prose of status and backlog, the handoff) is still the assistant's work; the hook makes sure it is asked, once per commit, without a person remembering.
- Dispatch is directed rather than remembered since workflow 0.20.0: when a prompt carries six or more items, the prompt hook tells the assistant to run it before any code, and the stop hook asks once more in that session if no lane plan was written. Creating the worktrees and merging lanes back are still commands the assistant runs when the plan says so.
- Skilliton does not compact the conversation. Claude Code compacts on its own schedule; the settings template names a window, and the context-hygiene plugin keeps context from growing (whole reads of big files refused, test output routed through `gate` so only the verdict enters the conversation).
- Nothing here saves money on its own, and no figure is quoted until `scripts/token-cost.mjs` produced it and a person compared it with the Usage screen.
- Ten hook wirings across three plugins are what runs without being asked (session start, every shell command, every write, every read, every prompt, stop, pre-compact, session end). Everything else is a skill: instructions the assistant follows when invoked, and the eight keyboard checks in docs/OWNER_WALKTHROUGH.md are how a team learns whether it does.
