# Skilliton

Kind: Living.

**Skilliton gives a team's AI coding assistant a shared way of working, enforced by hooks rather than remembered by people.** A company decides once how it builds software: the records it keeps, the checks that run before work is finished, the commands the assistant may not run, the review it gives before a commit, the security evidence it keeps current. Every developer's assistant then works that way in every repository, and company-approved improvements arrive as signed releases instead of copied files.

It is four Claude Code plugins and one command, `skilliton`, in a repository a company forks and makes its own.

## At a glance

| Question | Answer |
|---|---|
| Language | JavaScript (Node.js, ES modules) and Bash. Commands are Node; the hooks that must start in under a second are Bash. |
| Runtime floor | Node.js 18 or later, and git. Exercised on Node 22 and 25; Node 18 itself has not been run ([docs/COVERAGE.md](docs/COVERAGE.md)). |
| Dependencies | None. No `package.json`, no `node_modules`, no build step, no network code of its own. |
| Size | About 40,000 lines of runtime, hooks and tests. 58 check steps run in CI on every push; `node scripts/checks.mjs` runs the same list locally. |
| Shape | Plugins `workflow`, `guardrails`, `context-hygiene`, `code-quality` under `packs/base/plugins/`; the `skilliton` command ships inside `workflow`. |
| Clients | Claude Code, measured (terminal and VS Code extension). Codex installs the plugins and sees the skills but runs no plugin hooks. Cursor is documented, not run ([docs/CLIENTS.md](docs/CLIENTS.md)). |
| Platforms | macOS and Linux exercised. Windows has a written first run ([docs/WINDOWS.md](docs/WINDOWS.md)), not yet tried. |
| Release trust | SSH-signed git tags checked against a signers file each machine holds; `skilliton verify` compares installed files with the signed manifest. |
| What it sends anywhere | Nothing. One git command talks to a remote (`preflight`). Every write outside a repository is listed in [docs/IT-ALLOWLIST.md](docs/IT-ALLOWLIST.md), and CI fails when the code and that list disagree. |
| Licence | MIT. |

## Try it in two minutes

```bash
node scripts/autopilot-demo.mjs
```

It prepares a disposable project, turns a request into a task with a checkpoint, records real test evidence and shows it going stale when the code changes, then runs a shared repository whose delivery check accepts a passing change and rejects one that breaks only once combined with work already merged. No model, no network, nothing outside a temporary folder.

## Two ways in

- **Use it as it is.** Clone this repository, join with the join file its maintainer hands out (where that file is published is still the maintainer's open decision, docs/BACKLOG.md B53; until then `join --company <name> --signers <file>` with a signers file obtained from the maintainer does the same), then prepare each repository you work in. No fork.
- **Make it your company's.** Fork it, name it, add your own skills beside the base pack, sign releases, hand out one join file. Your developers join your fork, not this repository.

### A developer's two commands

Once per machine, from a full clone of the company's skills repository (the join file comes from your company, never from the repository):

```bash
git clone https://github.com/<company>/<skills-repo> ~/company-skills
node ~/company-skills/scripts/skilliton.mjs join --from <join file>           # preview
node ~/company-skills/scripts/skilliton.mjs join --from <join file> --apply   # set up, then verify
```

Once per repository:

```bash
skilliton prepare --dir <project>          # preview; add --apply to write
```

`join` puts a `skilliton` command in `~/.local/bin`; inside a Claude Code session the workflow plugin also puts it on the shell path. A machine that has joined does not join again, and `join` says so. [docs/ONBOARDING.md](docs/ONBOARDING.md) is the developer's page.

### A company's path

```bash
node scripts/skilliton.mjs company init --name <company> --marketplace-repo <owner>/<repo> --apply
node scripts/skilliton.mjs new-plugin <plugin> --pack <company> --apply
node scripts/skilliton.mjs new-skill <plugin> <skill> --pack <company> --description "<when to use it>" --apply
node scripts/skilliton.mjs release create --version 1.0.0 --apply   # then commit the manifest
node scripts/skilliton.mjs release sign 1.0.0 --apply               # with your own signing key
node scripts/skilliton.mjs company join-file --name <company> --signers <allowed_signers> --out ~/handout/<company>.skilliton-join.json --apply
```

Every writing command previews without `--apply` and writes nothing. [docs/RELEASING.md](docs/RELEASING.md) walks the fork, the lesson-to-release loop, verification, withdrawal and rollback; [docs/DELIVERY.md](docs/DELIVERY.md) sets up the merge check; [docs/OWNER_GUIDE.md](docs/OWNER_GUIDE.md) answers the questions a meeting asks; [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) has the whole path with diagrams. When something does not work, [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) has every case a real session has hit, with the cause. [docs/WHITE_PAPER.md](docs/WHITE_PAPER.md) is the technical white paper; [docs/PLAIN_GUIDE.md](docs/PLAIN_GUIDE.md) explains it to someone who does not code.

## What runs in a session, and what makes it happen

Each behaviour is one of three kinds, and the instruction block every prepared project carries labels each line with its kind.

| Kind | Meaning | Examples |
|---|---|---|
| **Enforced** | A hook of an installed plugin does it on a client event, whatever the assistant intended | Session start shows the last handoff and the project state. Every shell command passes the guardrail: force-pushes to protected branches, skipped git hooks and secret-shaped commits are blocked; a command that discards uncommitted work asks first. A whole-file read of a non-image file over 50 KB is refused with the reason. The stop hook asks for a checkpoint when the tree changed and none was recorded. In a dispatched lane, writes outside the lane's files are refused. |
| **Instructed** | The assistant is asked to do it; a skill is instructions, not enforcement | `task` (a record with acceptance criteria before code changes), `review` (plain-English pre-commit review with READY TO COMMIT, NEEDS ATTENTION or STOP), `handoff`, `maintain`, `security`, `dispatch`, `split-a-file`. Running checks through `skilliton gate`, which keeps the output in a log and prints the verdict. |
| **Checked at merge** | The shared repository's own delivery check decides, whatever the laptop had | `skilliton delivery install` tests the combined result of every push to a protected branch, reads its policy from the branch, and needs an approver's signature for a policy change. The GitHub workflow template follows the same rules. |

Not covered, and said so: commands a person types in their own terminal, other tools, the inside of scripts and git aliases.

## What works today

| Capability | What it does | Proof |
|---|---|---|
| **Prepare a project** | Adopts the records a project already has, adds only what is missing marked "not yet assessed", appends the team's instruction block to `CLAUDE.md` and `AGENTS.md` without touching the text above it, sets up the security register. Repeat runs change nothing; `migrate` applies versioned changes with receipts and rollback; `remove` takes Skilliton out and keeps every record. | `scripts/prepare.test.mjs`; [project rehearsal](evidence/rehearsals/2026-09-16-projects/SUMMARY.md) |
| **Continuity** | Task records with acceptance criteria and checkpoints; decision and lesson entries as one file each, so parallel contributors never collide; a journal that names an interrupted session next time. | `scripts/lifecycle.test.mjs`; [a real session in the VS Code extension](evidence/live/2026-09-21-owner-machine-session.md) |
| **Guardrails** | The shell-command hook above, on Claude Code. Codex cannot ask from a hook, so there it refuses instead. | `scripts/guardrails.test.sh`, 549 checks; [live denials](evidence/live/2026-09-16-guardrails-force-push.md) |
| **Dispatch into worktrees** | `skilliton dispatch` turns a lane plan into one git worktree per lane with a brief, a context ceiling and its own committed task record; `dispatch merge` brings each lane's records back and names conflicts instead of overwriting. | `scripts/dispatch.test.mjs`; [the first real two-lane dispatch](evidence/live/2026-09-21-dispatch.md), both lanes under their ceiling |
| **Security evidence** | Observations tied to file fingerprints go stale when their sources change; applicability is decided by a named person; collectors gather test results, a secret-shape scan and the delivery policy; open gaps become backlog rows. A 15-control starter catalog references NIST SSDF 1.1 and OWASP ASVS 5.0.0. Evidence is not certification. | `scripts/security-evidence.test.mjs`; [catalog sources](docs/security-catalog-sources.md) |
| **Company releases** | `company init` names a fork and points projects at it; `new-plugin`, `new-skill`, `import` add the company's skills; a release manifest hashes every installable file; approval is a signed tag; `verify` reports VERIFIED, TAMPERED, UNKNOWN VERSION, WITHDRAWN or NOT INSTALLED. | `scripts/release.test.mjs`; [signed release verified from a fresh clone](evidence/live/2026-09-21-private-repository.md), including install, update and verify from a private repository |
| **Trusted delivery checks** | The merge check above, against a local bare repository and against GitHub. | `scripts/delivery.test.mjs`; [the hosted gate refusing a defective pull request](evidence/live/2026-09-21-hosted-delivery-gate.md) |
| **The self-running audit** | `skilliton audit` scans a range, the working tree or a push for secret shapes, shell injection and switched-off verification, never printing a matched value; it reports in the stop hook and the pre-push hook and refuses in the merge gate. | `scripts/audit.test.mjs` |

[docs/REPORT_CARD.md](docs/REPORT_CARD.md) is the master progress record: 123 acceptance items across ten areas, each ticked item naming its evidence.

## Not proven yet

Each is recorded in [docs/BACKLOG.md](docs/BACKLOG.md) or [DECISIONS.md](DECISIONS.md) with the input it needs.

- **A real team using it.** One repository on the owner's machine is the only live user so far; no new builder has been onboarded from the documents alone.
- **Codex lifecycle hooks.** Codex installs the plugins and sees the skills (measured) but runs no hooks shipped inside a plugin; a team that wants them there configures and trusts its own.
- **The confirmation prompt a person sees** on a guardrails "ask" (headless sessions deny it; measured).
- **A lane launched through the brief's own `--agent` line.** The first real dispatch ran each lane with the shipped definition pasted, because the extension session did not offer the plugin agent as a subagent type.
- **Windows, a clean macOS account, a Cursor session,** and the device-management scripts that would put the join file on every laptop (designed, not built).
- **Any usage or cost saving.** No saving is claimed. `scripts/token-cost.mjs` reconstructs usage from local transcripts; the client's Usage screen is the only real meter.

## The repository

| Path | What it holds |
|---|---|
| `packs/base/plugins/` | The shipped product: four plugins, each with its hooks, skills, agents and a `.claude-plugin/plugin.json`. `workflow/runtime/` is the `skilliton` command (`commands/`, `lib/`). |
| `scripts/` | Every check CI runs, the demo, the rehearsals, the meter and the release tooling. `scripts/skilliton.mjs` runs the command from a checkout. |
| `docs/` | The living records (status, backlog, handoff, decisions, lessons, contracts) and the guides. Every document says its Kind near the top: Living is kept current, Reference is a record that no longer changes. [docs/README.md](docs/README.md) is the index; every file under `docs/` is reachable from it, and a test says so. |
| `evidence/` | What was measured, by date: live sessions under `live/`, scripted rehearsals under `rehearsals/`, skill evaluations by commit. |
| `releases/` | Signed release manifests and their schema. |
| `templates/` | The GitHub workflow for the hosted delivery check and the team settings template. |
| `PLAN.md`, `DECISIONS.md`, `CLAUDE.md` | The direction, every recorded choice, and this repository's own session contract. |

## Checks

`node scripts/checks.mjs` runs every check locally, one step at a time with a verdict per step, reading the list from [CI](.github/workflows/checks.yml) so there is one list; [docs/MAINTAIN.md](docs/MAINTAIN.md) names each command with what it holds, and a test keeps that list equal to CI's. [CONTRIBUTING.md](CONTRIBUTING.md) says what a change needs. They cover packaging and strict plugin validation, the lint that holds the runtime's shape (a 600-line ceiling with pinned exceptions that may only shrink, unused imports, no console logging in a runtime), dead code, the command, prepare and migrate, dispatch, lifecycle, security evidence, releases, the delivery gate, guardrails, hooks, the meter, the guides' commands and links, the endpoint allow list, the small-footprint rules, the whole-tree audit, the name scrub, the record relationships, the demo and the offline project rehearsal. Most checks carry a `--self-test` that proves they can fail. The dead-code check names the modules it could not follow (dynamic imports) and counts them rather than passing over them.

Checks that use an account and cost usage run by hand and write under `evidence/`: `scripts/live-capability-probe.sh`, `scripts/live-guardrails-probe.sh`, `scripts/rehearsals/live-clients.mjs`, `scripts/rehearsals/company-release.mjs --with-eval`, and `claude plugin eval`.

Before publishing, run `bash scripts/scrub-check.sh --history` with your private `SKILLITON_DENYLIST`; without it the name scan reports that it did not run.

## Contributing and license

Open a pull request with the changed behaviour, its tests, and any migration impact. A plugin change bumps that plugin's version. Company-specific skills belong beside the base pack, never inside it. No em or en dashes, no client or personal names, no savings claims: the checks refuse all three.

MIT. See [LICENSE](LICENSE).

## Naming

The product had an earlier name. Every command, folder and setting now uses the Skilliton name; a project or machine set up under the earlier name moves by migration, as [docs/BRANDING.md](docs/BRANDING.md) describes.
