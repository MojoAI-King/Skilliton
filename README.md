# Skilliton

Kind: Living.

**Skilliton gives a team's AI coding assistant a shared way of working, enforced by hooks rather than remembered by people.** A company decides once how it builds software: the records it keeps, the checks that must pass, the commands the assistant may not run, the review before a commit. Every developer's assistant then works that way in every repository, and improvements arrive as signed releases instead of copied files.

It is four Claude Code plugins and one command, `skilliton`, in a repository a company forks and makes its own. Version 1.0.0 is released and signed. It was built in a week by one developer directing Claude Code, using Skilliton on itself as it went; the commits say so, and `docs/` holds the records it kept while doing it.

## What you see on day one

Open a git repository in Claude Code with the plugins installed:

- **The session starts where the last one stopped.** A hook shows the assistant the last handoff and the project's state, and it tells you where things stand.
- **Dangerous commands are stopped by a hook.** The common forms of force-pushing a protected branch, skipping git hooks, committing a secret-shaped file and deleting the project's records are blocked; throwing away uncommitted work asks you first. What the hook cannot see is listed in the guardrails skill.
- **Big files are read a part at a time.** A whole-file read over 50 KB is refused, with how to read a range instead.
- **Work is written down.** The assistant is asked to open a task record before changing code, and a stop with unrecorded changes is held once until a checkpoint is recorded.
- **Batches and housekeeping are prompted.** Six or more items in one message bring a note to split them into worktree lanes, and after a merge the stop is held until maintenance runs. The hooks prompt; the assistant does the work.

Every behavior is labeled in the project's instructions as **enforced** (a hook does it), **instructed** (the assistant is asked) or **checked at merge** (the shared repository decides), because only the first kind is a guarantee.

## Does it work

| Claim | Evidence |
|---|---|
| It stops a real loss | Asked to "throw away everything I haven't committed", the same model kept the work 3 of 3 times with Skilliton and lost it 3 of 3 times without, in a comparison whose tasks were fixed before it ran ([results](evidence/comparison/2026-09-22/SUMMARY.md)) |
| The hooks fire in real clients | measured in the Claude Code terminal and VS Code extension, and a real Codex session followed the instructions (Codex runs no plugin hooks) ([VS Code](evidence/live/2026-09-22-vs-code-extension-hooks.md), [Codex](evidence/live/2026-09-22-codex-session.md), [client matrix](docs/CLIENTS.md)) |
| A machine can prove what it runs | 1.0.0 is an SSH-signed tag over a manifest that hashes every installed file; `skilliton verify` reads VERIFIED on every install, and a changed file reads TAMPERED with the file named (`scripts/release.test.mjs`; [evidence](evidence/live/2026-09-22-release-1.0.0.md)) |
| It holds up under review | an adversarial security review reproduced eight guard bypasses and a way to switch off the merge gate; each is fixed with a test that failed before the fix ([changelog](CHANGELOG.md)) |
| Every check runs on every push | [CI](.github/workflows/checks.yml) runs the list `node scripts/checks.mjs` runs locally, and each checker also proves it can fail |
| It orients a session | On a fixture with a handoff, an open task record and one uncommitted file, the sessions with Skilliton answered "where does this stand" in one turn on about 52,000 input tokens each and named all three 2 of 3 times; without, two or three turns on 94,000 to 145,000, and none of the three noticed the open task ([second run](evidence/comparison/2026-09-23/SUMMARY.md)) |
| It is used on real work | 26 of the 27 repositories on its author's machine are prepared, and six have session journals written by its hooks ([counted](evidence/live/2026-09-22-use-on-this-machine.md)). A session that did a day of production work in a client repository, beside a second session and Codex, reported that the checkpoints are how the two sessions coordinated one production rollout, and listed eleven things that hurt; each has a verdict and a fix or a backlog item ([field report](evidence/live/2026-09-22-field-report-client-repository.md)) |

The same comparison found where it did not help: what is only instructed, such as opening a task record, the model skipped in headless runs, and on the large-file task each session used more input tokens with Skilliton than without (about 20,000 to 30,000 more in the first run; 24,000 to 234,000 more in the second, where the refused whole-file read became several range reads). [Not proven yet](#not-proven-yet) lists the rest.

## Install

[INSTALL.md](INSTALL.md) has three paths: a demo with nothing installed, trying it in your own Claude Code, and a team rollout from a signed fork. Trying it is five commands, then a new session:

```bash
claude plugin marketplace add MojoAI-King/Skilliton
claude plugin install workflow@skilliton
claude plugin install guardrails@skilliton
claude plugin install context-hygiene@skilliton
claude plugin install code-quality@skilliton
```

This installs the main branch, which can be ahead of the last signed release. Or hand the job to your coding agent:

```
Install Skilliton for me by following INSTALL.md in https://github.com/MojoAI-King/Skilliton, path 2. Tell me each step before you run it, and do not prepare any repository until I say yes.
```

To see it before installing anything: `git clone https://github.com/MojoAI-King/Skilliton.git && cd Skilliton && node scripts/autopilot-demo.mjs`. No model, no network, nothing outside a temporary folder.

## Words used here

| Word | Meaning |
|---|---|
| prepare | add Skilliton's records and instruction block to a repository, keeping whatever it already has |
| handoff | the note a session leaves for the next one, in `docs/HANDOFF.md` |
| task record, checkpoint | one file per piece of work, with what done means, and dated entries of what is true now |
| join, join file | set up one machine for a company; the file names the company, its skills repository and who may sign releases |
| lane | one git worktree, with a written brief, for one slice of a batch of work |
| guardrails | the hook that judges each shell command before it runs |
| release, plugin version | the product is released as a whole (1.0.0); each of the four plugins has its own version (workflow 0.21.0 in 1.0.0), and `releases/<release>.json` records which plugin versions a release carries |

## At a glance

| Question | Answer |
|---|---|
| Language | JavaScript (Node.js 22 or later, ES modules) and Bash for the hooks that must start in well under a second |
| Dependencies | none: no `package.json`, no build step, no network code of its own |
| Platforms | macOS and Linux measured. Windows is not supported yet: on a hosted Windows runner, preparation, status, every session hook and the guard work, but a program in the project folder can stand in for one Skilliton starts by name, and no Claude Code session has run there ([evidence](evidence/live/windows/2026-09-23-hosted-runner-port.md)) |
| Release trust | SSH-signed git tags checked against a signers file each machine holds. For this repository, the signer is the key GitHub publishes for its owner: `gh api users/MojoAI-King/ssh_signing_keys` |
| What it sends anywhere | nothing; every write outside a repository is listed in [docs/IT-ALLOWLIST.md](docs/IT-ALLOWLIST.md), and CI fails when the code and that list disagree |
| Where to start reading the code | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Licence | MIT, copyright Mojo AI Services, LLC |

## What works today

| Capability | What it does | Tested by |
|---|---|---|
| Prepare a project | adopts records a project already has, adds only what is missing, appends the instruction block to `CLAUDE.md` and `AGENTS.md` without touching the text above it; every writing command previews first and writes only with `--apply` | `scripts/prepare.test.mjs`, `scripts/skilliton.test.mjs` |
| Continuity | task records and checkpoints, one file per decision and lesson so parallel work never collides, a journal that names an interrupted session | `scripts/lifecycle.test.mjs` |
| Guardrails | the shell-command hook; on Codex, which cannot ask from a hook, it refuses instead | `scripts/guardrails.test.sh`, `scripts/guardrails-bypass.test.sh` |
| Dispatch | turns a lane plan into one worktree per lane with a brief and its own task record | `scripts/dispatch.test.mjs`, [a real dispatch](evidence/live/2026-09-21-dispatch.md) |
| Company releases | fork, name, add skills, sign; `verify` reports VERIFIED, TAMPERED, UNKNOWN VERSION, WITHDRAWN or NOT INSTALLED | `scripts/release.test.mjs`, [a private repository](evidence/live/2026-09-21-private-repository.md) |
| The shared-branch gate | a pre-receive gate that tests the combined result of every push and needs an approver's signature for a policy change | `scripts/delivery.test.mjs`, [the hosted gate refusing a pull request](evidence/live/2026-09-21-hosted-delivery-gate.md) |
| Security evidence | records tied to file fingerprints go stale when their sources change; applicability is decided by a named person; evidence is not certification | `scripts/security-evidence.test.mjs` |
| The audit | scans a change for secret shapes, shell injection and switched-off verification without printing a matched value | `scripts/audit.test.mjs` |

## Not proven yet

- **A team other than its author.** One developer on one machine so far; no new builder has been onboarded from the documents alone.
- **Windows,** a clean macOS account, and the device-management scripts that would put the join file on every laptop (designed, not built).
- **Lifecycle hooks in Codex.** Codex reads the instructions and the skills but runs no hooks shipped in a plugin.
- **Any usage or cost saving.** None is claimed. `scripts/token-cost.mjs` reconstructs usage from local transcripts; the client's Usage screen is the only real meter.

## The repository

| Path | What it holds |
|---|---|
| `packs/base/plugins/` | the shipped product: four plugins, each with its hooks, skills and version; `workflow/runtime/` is the `skilliton` command |
| `scripts/` | every check CI runs, the demo, the rehearsals and the meter; `scripts/skilliton.mjs` runs the command from a checkout |
| `docs/` | this repository's own records, kept by Skilliton as it was built (status, backlog, handoff, decisions, lessons, task records, the report card), and the guides; [docs/README.md](docs/README.md) is the index |
| `evidence/` | what was measured, by date |
| `releases/` | signed release manifests |

A company that forks this repository gets the product and a worked example of the records it keeps. [docs/MAKE_IT_YOURS.md](docs/MAKE_IT_YOURS.md) is the fork checklist, written for the coding assistant doing the work.

## Checks

`node scripts/checks.mjs` runs every check CI runs, one verdict line per step, with each step's full output in a log. [CONTRIBUTING.md](CONTRIBUTING.md) says what a change needs: its tests, a plugin version bump, and no em dashes, personal names or savings claims, which the checks refuse.

## Naming

The product had an earlier name. Commands, folders and settings use the Skilliton name, and a project set up under the earlier one moves by migration. The security catalog keeps its original id, `skillgate-baseline-2`, because existing evidence records name it ([decision](docs/decisions/2026-09-22-the-frozen-copies-stay-beside-the-migrat-a3d4.md)).

MIT, copyright Mojo AI Services, LLC. See [LICENSE](LICENSE).
