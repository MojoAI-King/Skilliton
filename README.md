# Skilliton

**Skilliton** is the evolved product formerly called Skillgate. Every command, folder and setting now uses the Skilliton name; a project or machine set up before the rename moves as described in [docs/BRANDING.md](docs/BRANDING.md).

Kind: Living.

**Skilliton is a forkable development autopilot for teams using AI coding tools.** A company decides once how it builds software: its records, habits, reviews, security evidence and checks. Every contributor, technical or not, then works inside that arrangement. They describe what they need, the assistant carries the work through the team's workflow, progress survives interruptions, and company-approved improvements arrive without anyone copying skills by hand.

**New here? [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) walks through the whole path with diagrams:** fork it, make it yours, release it, install it on every machine, work in any codebase, and feed lessons back.

## Two ways in

There are two roles, and the first question is which one you are.

- **You are the company.** Fork this repository, give the fork your name (`company init`), add your own skills, and publish signed releases (`release create`, `release sign`). Your developers join your fork, not this repository. The section "For a company maintainer" below has the commands; [docs/RELEASING.md](docs/RELEASING.md) has the whole path.
- **You are a developer at a company that uses it.** Get one file from your company, its join file (it names the company, its skills repository and the release signers; it is handed out separately and never taken from the repository). Then, once per machine, clone the repository and run `join --from <that file> --apply`; and once per project, `skilliton prepare --dir <project> --apply`. [docs/ONBOARDING.md](docs/ONBOARDING.md) is written for you.

Enabling Skilliton in one more repository is the second command only: a machine that has joined does not join again. `join` says so when it has.

[PLAN.md](PLAN.md) is the direction and the milestone status. [docs/CONTRACTS.md](docs/CONTRACTS.md) defines every shared format and command. [docs/HANDOFF.md](docs/HANDOFF.md) says where the work stands. [docs/CLIENTS.md](docs/CLIENTS.md) says what Claude Code and Codex actually do, measured or documented.

The command remains `skilliton` for compatibility with existing installations. Marketplace names, `.skilliton/` paths and other machine identifiers also retain that spelling; they refer to Skilliton. See [naming and compatibility](docs/BRANDING.md).

## Try it in two minutes

```bash
node scripts/autopilot-demo.mjs
```

It prepares a disposable project, turns a request into a task with a checkpoint, records real test evidence and shows it going stale when the code changes, then runs a shared repository whose delivery check accepts a passing change and rejects a change that breaks only once combined with work already merged. No model, no network, nothing outside a temporary folder.

## What works today

| Capability | How it works | Proof in this repository |
|---|---|---|
| **Prepare a project** | `skilliton prepare` adopts the records a project already has (status, backlog, roadmap, decisions, lessons, handoff), adds only what is missing, marked "not yet assessed", writes the team's instructions into `CLAUDE.md` and `AGENTS.md`, and sets up the security register. Repeat runs change nothing. `migrate` applies versioned changes with receipts and rollback; `remove` takes Skilliton out and keeps every record. | 41 tests; [project rehearsal](evidence/rehearsals/2026-09-16-projects/SUMMARY.md) including adoption of a clone of this repository |
| **Everyday continuity** | Task records with acceptance criteria and checkpoints; decision and lesson entries, one file each, so parallel contributors never collide; `status`. Hooks show the handoff and a project-state summary when a session starts, remind the assistant to record a checkpoint before it stops with unrecorded changes, and keep a local journal so an interrupted session is recognized. | 32 tests; [live Claude Code sessions](evidence/rehearsals/2026-09-16-live-clients/SUMMARY.md) (session start, stop reminder, interruption) |
| **Workflow skills and the dispatch command** | `task`, `dispatch`, `review` (plain-English review with a READY TO COMMIT, NEEDS ATTENTION or STOP verdict), `handoff`, `maintain`, `security`. Skills are instructions the assistant follows; the instruction block labels each behavior as enforced, instructed or checked at merge. `skilliton dispatch` turns a lane plan into one git worktree per lane, each with a brief naming its scope, what to read, what to return and the paths it must not touch; it writes and commits each lane's own task record, and it refuses rather than reusing a branch, a folder or a registered worktree. `skilliton dispatch merge` brings each lane's committed records back to the integration branch and names what conflicted instead of overwriting it. Three agents (`lane`, `locate`, `verify-item`) ship with the plugin, each naming a model and an effort. | [skill evaluations](evidence/); 22 dispatch tests over fixture repositories |
| **Guardrails** | A hook reads each shell command the assistant runs: blocks force-pushes to protected branches, skipped git hooks and secret-shaped commits; asks before commands that discard uncommitted work (Codex cannot ask from a hook, so it refuses them). It does not cover other terminals or deliberately hidden commands. | 487 checks; live denials of a force-push and of `git reset --hard` |
| **Project security evidence** | Observations tied to file fingerprints go stale when their sources change or expire; applicability is decided by a named person; collectors gather test results, a secret-shape scan and the delivery policy; open gaps become one backlog row each. A 15-control starter catalog references NIST SSDF 1.1 and OWASP ASVS 5.0.0. Evidence is not certification. | 52 tests; [catalog sources](docs/security-catalog-sources.md) |
| **Company releases and updates** | `company init` gives a fork its own marketplace name and points projects at the fork; `new-plugin` and `new-skill` add the company's own skills; `join` sets up a developer's machine in one command and `join --undo` reverses it. A release manifest hashes every installable file; approval is a tag signed by a trusted approver; `verify` reports VERIFIED, TAMPERED, UNKNOWN VERSION, WITHDRAWN or NOT INSTALLED for Claude Code and Codex installs; lessons become scrubbed proposals; template changes reach projects as receipted migrations. | 21 tests; [company release rehearsal](evidence/rehearsals/2026-09-16-company-release/SUMMARY.md), 18 of 18 on real installs; [fork rehearsal](evidence/rehearsals/2026-09-16-fork/SUMMARY.md), 7 of 7, a renamed fork with its own plugin installed and verified on Claude Code and Codex; [machine rehearsal](evidence/rehearsals/2026-09-17-machine/SUMMARY.md), 8 of 8, including installs from GitHub |
| **Trusted delivery checks** | `skilliton delivery install` puts a check in a shared repository that tests the combined result of every push to a protected branch, reads its policy from the branch rather than from the push, and requires an approver's signature for policy changes. A GitHub workflow template follows the same rules. | 10 tests with real pushes; the demo above |

## Not proven yet

Each is recorded in [DECISIONS.md](DECISIONS.md) or [docs/BACKLOG.md](docs/BACKLOG.md) with the input it needs.

- **A real new builder** following the documentation ([protocol](docs/rehearsals/NEW_BUILDER.md)). An assistant role-playing a beginner does not count.
- **Codex lifecycle hooks.** Codex installs the plugins and sees the skills and instructions (measured), but it does not run hooks bundled in plugins, and project hooks did not load in the measured setup. It needs a run from a logged-in, isolated Codex home.
- **A live session in a clean Claude Code configuration** (installs, updates and verification there are measured; a model session needs a login in that configuration), and automatic marketplace updates observed at session start.
- **The GitHub delivery adapter** on a real repository with branch protection.
- **The confirmation prompt a person sees** for a guardrails "ask" (headless sessions deny it; measured).
- **Dispatch helping a real session.** The command and its refusals are tested over fixture repositories. No dispatch of two or more lanes has been run for real and metered, so nothing here shows it makes parallel work cheaper or better.
- **The team compaction window.** The settings template names 600000 tokens. Sessions in this repository compacted far below that, most recently around 170000, and the cause is not known; the test is the first automatic compaction of a session started after the setting was installed.
- **Any usage or cost saving.** No saving is claimed.

## For a company maintainer

Fork this repository, give the fork its own name, add your skills beside `packs/base/`, and publish signed releases. [docs/RELEASING.md](docs/RELEASING.md) walks through the fork, the lesson-to-release loop, verification, withdrawal and rollback. [docs/DELIVERY.md](docs/DELIVERY.md) sets up the delivery check.

```bash
node scripts/skilliton.mjs company init --name <company> --marketplace-repo <owner>/<repo> --apply
node scripts/skilliton.mjs new-plugin <plugin> --pack <company> --apply
node scripts/skilliton.mjs new-skill <plugin> <skill> --pack <company> --description "<when to use it>"
node scripts/skilliton.mjs release create --version 1.0.0 --apply   # then commit the manifest
node scripts/skilliton.mjs release sign 1.0.0 --apply               # with your own signing key
node scripts/skilliton.mjs company join-file --name <company> --signers <allowed_signers> --out ~/handout/<company>.skilliton-join.json --apply   # hand this file out, never through the repository
```

## For a developer

[docs/ONBOARDING.md](docs/ONBOARDING.md) is written for you. In short:

```bash
git clone https://github.com/<company>/<skills-repo> ~/company-skills
node ~/company-skills/scripts/skilliton.mjs join --from <join file from your company>           # preview
node ~/company-skills/scripts/skilliton.mjs join --from <join file from your company> --apply   # set up, then verify
# or, with the two facts typed by hand: join --company <company> --signers <allowed_signers file> --apply
skilliton prepare --dir <project>          # preview; add --apply to write
```

`join` puts a `skilliton` command in `~/.local/bin` for the terminal; inside a Claude Code session the workflow plugin also puts it on the shell path.

## Checks

Credential-free checks run in [CI](.github/workflows/checks.yml) on every push and pull request: packaging and its self-test, the lint that holds the runtime's shape, strict plugin validation, the CLI, prepare and migrate, dispatch, lifecycle, security evidence, releases, the delivery gate, guardrails, hooks, the meter, setup, the guides' commands and links, the demo and the offline project rehearsal. `docs/MAINTAIN.md` lists each command.

Checks that use an account and cost usage run by hand and write their results under `evidence/`: `scripts/live-capability-probe.sh`, `scripts/live-guardrails-probe.sh`, `scripts/rehearsals/live-clients.mjs`, `scripts/rehearsals/company-release.mjs --with-eval`, and `claude plugin eval`. `scripts/codex-offline-probe.sh` checks Codex without a model call.

Before publishing, run `bash scripts/scrub-check.sh --history` with your private `SKILLITON_DENYLIST`; without it the name scan reports that it did not run.

## Contributing and license

Open a pull request with the changed behavior, its tests, and any migration impact. Plugin changes bump the plugin's version. Company-specific skills belong beside the base pack.

MIT. See [LICENSE](LICENSE).
