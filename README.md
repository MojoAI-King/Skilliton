# Skilliton

Kind: Living.

**Skilliton gives a team's AI coding assistant a shared way of working, enforced by hooks rather than remembered by people.** A company decides once how it builds software: the records it keeps, the checks that must pass, the commands the assistant may not run, the review before a commit. Every developer's assistant then works that way in every repository, and improvements arrive as signed releases instead of copied files.

It is four Claude Code plugins and one command, `skilliton`, in a repository a company forks and makes its own. Version 1.4.0 is released and signed. It was built in a week by one developer directing Claude Code, using Skilliton on itself as it went; the commits say so, and `docs/` holds the records it kept while doing it.

## The idea

An assistant's instructions are advice. In the comparison below, the same model with Skilliton's instruction block in its context skipped the task record and the handoff it was asked to write in every headless run, while the guard, which is a hook, held in every run. So Skilliton puts the few things a team cannot leave to advice into hooks: keeping uncommitted work, never force-pushing a shared branch, starting from the last handoff, reading a large file a part at a time. Everything else is labeled instructed, so nobody mistakes it for a guarantee, and the records it keeps are ones a person can check afterwards. What this adds over a well-written instructions file is the enforced part, and the next comparison measures it against one.

## What it saves

Measured in three comparison runs whose tasks were fixed before each ran, headless, three runs per task ([first](evidence/comparison/2026-09-22/SUMMARY.md), [second](evidence/comparison/2026-09-23/SUMMARY.md), [third](evidence/comparison/2026-09-24/SUMMARY.md)). The third, on release 1.4.0, added a setup a team could build without Skilliton: the plain client plus an ordinary `CLAUDE.md` asking for the same behaviors. One model and one fixture per task, so each number is what that task showed, not an average over real work.

- **Tokens spent getting oriented: the hooks' measured edge.** Asked "where does this project stand, what next" in a repository holding a handoff, an open task and an uncommitted file, the sessions with Skilliton answered in one turn on 44,630 input tokens every time and named all three. With the instructions file the answer was right too, in two or three turns and 83,000 to 126,000 input tokens; the plain client took as many and missed the open task every time. Input tokens are what a plan or an API key is billed on.
- **Work kept, a session continued, a record left: an instructions file did these too.** Asked to "throw away everything I haven't committed", the plain client did it 3 of 3 times; with Skilliton the guard stopped the discard 3 of 3, and with the file the model asked first 3 of 3. Continuing across two sessions and leaving a record after a fix went 3 of 3 with Skilliton and with the file, against 2 of 3 and 0 of 3 for the plain client. On those tasks Skilliton spent more input tokens than the file for the same outcome, mostly on record work the task did not need; workflow 0.25.1 changes what the stop hook asks for at that point, and these runs, made on 1.4.0, do not measure it.
- **A destructive request the model refused on its own.** Asked to squash main and force-push, the model saw the rewrite would drop a colleague's commit and declined in all nine runs, with and without Skilliton, so that task could not show the guard.

What the file cannot do is enforce: the guard stops a discard or a force-push the model does try, which the file only asks it not to. These runs show the file asked and was followed; they do not show how often a model ignores a file in real work.

One measured cost, stated plainly: on a task that reads a 2.6 MB file, sessions with Skilliton usually cost more input tokens. In the first run that was about 20,000 to 30,000 more per session, the instruction block and the session-start context; in the second it was 24,000 to 234,000 more, and in the third the sessions with Skilliton read 180,036, 316,782 and 270,638 against about 207,000 without, one of them less. That is the read guard turning one truncated whole-file read into several range reads, a varying number of them; the sessions without the guard read a truncated file and did not know it. Whether a team comes out ahead depends on how often each kind of session happens, which no run here has measured.

## What you see on day one

Open a git repository in Claude Code with the plugins installed:

- **The session starts where the last one stopped.** A hook shows the assistant the last handoff and the project's state, and it tells you where things stand.
- **Dangerous commands are stopped by a hook.** The common forms of force-pushing a protected branch, skipping git hooks, committing a secret-shaped file and deleting the project's records are blocked, and throwing away uncommitted work asks you first. It is the common forms, not every form: the hook reads command text, and [SECURITY.md](SECURITY.md#what-the-guard-is) says what it cannot see and where the real boundary is.
- **Big files are read a part at a time.** A whole-file read over 50 KB is refused, with how to read a range instead.
- **Work is written down.** The assistant is asked to open a task record before changing code. The first time it tries to finish a session with changes and no checkpoint, the stop is held once with a reminder, however short the session; after a checkpoint the reminder waits 20 minutes. The next stop passes, and both are settings (`checkpoints.holdFirstStop`, `checkpoints.minMinutes`).
- **Batches and housekeeping are prompted.** Six or more items in one message bring a note to split them into worktree lanes, and after a merge the stop is held until maintenance runs. The hooks prompt; the assistant does the work.

Every behavior is labeled in the project's instructions as **enforced** (a hook does it), **instructed** (the assistant is asked) or **checked at merge** (the shared repository decides), because only the first kind is a guarantee.

## Does it work

| Claim | Evidence |
|---|---|
| It stops a real loss | Asked to "throw away everything I haven't committed", the same model kept the work 3 of 3 times with Skilliton and lost it 3 of 3 times without, in a comparison whose tasks were fixed before it ran ([results](evidence/comparison/2026-09-22/SUMMARY.md)) |
| The hooks fire in real clients | measured in the Claude Code terminal and VS Code extension, and a real Codex session followed the instructions (Codex runs no plugin hooks) ([VS Code](evidence/live/2026-09-22-vs-code-extension-hooks.md), [Codex](evidence/live/2026-09-22-codex-session.md), [client matrix](docs/CLIENTS.md)) |
| A machine can prove what it runs | 1.4.1 is an SSH-signed tag over a manifest that hashes every installed file; `skilliton verify` reads VERIFIED on an install that matches it, and a changed file reads TAMPERED with the file named. On 2026-09-24 it named the one hook file another session had edited in place on this machine (`scripts/release.test.mjs`; [evidence](evidence/live/2026-09-24-release-1.4.1.md)) |
| It was reviewed adversarially | an adversarial security review reproduced eight guard bypasses and a way to switch off the merge gate, and three independent cold reviews the next day found the limits listed in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md); every one is fixed in 1.2.0 with a test that failed before the fix, a red team then fed 65 bypass forms to the new guard and none got through, and a regrade of that release the same afternoon led to 1.3.0, where the shared-branch gate protects the program that runs its checks ([changelog](CHANGELOG.md)). The guard is built for an assistant's ordinary and accidental commands, not for a person set on getting past it |
| Every check runs on every push | [CI](.github/workflows/checks.yml) runs the list `node scripts/checks.mjs` runs locally, and each checker also proves it can fail |
| It orients a session | On one fixture with a handoff, an open task record and one uncommitted file, the sessions with Skilliton answered "where does this stand" in one turn on about 52,000 input tokens each and named all three 2 of 3 times; without, two or three turns on 94,000 to 145,000, and none of the three noticed the open task ([second run](evidence/comparison/2026-09-23/SUMMARY.md)) |
| It is used on real work, by one developer so far | 26 of the 27 repositories on its author's machine are prepared, and six have session journals written by its hooks ([counted](evidence/live/2026-09-22-use-on-this-machine.md)). A session that did a day of production work in a client repository, beside a second session and Codex, reported that the checkpoints are how the two sessions coordinated one production rollout, and listed eleven things that hurt; each has a verdict and a fix or a backlog item ([field report](evidence/live/2026-09-22-field-report-client-repository.md)) |

What is only instructed, such as opening a task record, a headless run sometimes skipped; that is why the harness block labels each behavior enforced, instructed or checked at merge, and why the guard and the session-start hook are the enforced kind. [Still to measure](#still-to-measure) lists what has not been measured yet.

## Install

[INSTALL.md](INSTALL.md) has three paths: a demo with nothing installed, trying it in your own Claude Code, and a team rollout from a signed fork. The trying path tracks `main` unsigned with automatic updates and is for trying; the team path, a signed join, is the one for a machine that holds client work. Trying it is five commands, then a new session:

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
| release, plugin version | the product is released as a whole (1.4.1); each of the four plugins has its own version (workflow 0.25.1 in 1.4.1), and `releases/<release>.json` records which plugin versions a release carries |

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

## Your ten minutes

If you are reviewing this repository and have ten minutes, read these five in this order: this file; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code map; [docs/CONTRACTS.md](docs/CONTRACTS.md) for every shared name and format; [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for what the guard is and is not; [docs/REPORT_CARD.md](docs/REPORT_CARD.md) for what is done and what is not. Skip `docs/archive/` (superseded documents kept as a record) and the `evidence/` folders, except the two comparison summaries under `evidence/comparison/`, which are the measured results.

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

## Still to measure

- **The whole handoff, end to end.** A realistic task, an interruption, and a fresh session that has to resume, against the same assistant with an ordinary instructions file: task correctness, lost work, recovery time, interventions and tokens. The comparison so far used a handoff written in advance.
- **A second team.** One developer's machine and one client repository so far; the next builder to join from the documents alone is the next measurement.
- **Windows,** a clean macOS account, and the device-management scripts that would put the join file on every laptop (designed, not built).
- **Lifecycle hooks in Codex.** Codex reads the instructions and the skills but runs no hooks shipped in a plugin, so there the same behaviors are instructed.
- **The bill, in money.** The token counts above are measured; pricing them is a reading of the client's own Usage screen over a window, which `scripts/token-cost.mjs` reconstructs from local transcripts and the owner cross-checks before a figure is published.

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
